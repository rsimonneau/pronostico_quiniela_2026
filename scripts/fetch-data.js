#!/usr/bin/env node
/**
 * =============================================================================
 * Descarga resultados recientes y próximos partidos desde football-data.org
 * por RANGO DE FECHAS (no por "jornada actual") y los guarda en
 * data/resultados.json y data/proximos.json.
 *
 * POR QUÉ POR FECHAS Y NO POR "currentMatchday":
 * La primera versión de este script confiaba en el campo currentMatchday
 * que football-data.org calcula automáticamente. Es un algoritmo heurístico
 * (mira el último y el próximo partido y adivina en qué jornada estamos) y
 * puede adelantarse o atrasarse respecto a la numeración real cuando hay
 * partidos aplazados o reordenados — nos pasó: importó la Jornada 6 cuando
 * la Jornada 5 real aún no se había jugado. Pedir los partidos por fecha
 * (hoy ± 10 días, el máximo que permite el plan gratuito por consulta) evita
 * ese problema de raíz: cada partido lleva su propio número de jornada real
 * (m.matchday), tal cual lo da la API, sin que este script tenga que
 * adivinar nada.
 *
 * Este script NO corre en el navegador: se ejecuta desde GitHub Actions
 * (ver .github/workflows/actualizar-datos.yml), donde el token vive como
 * Secret del repo y nunca queda expuesto en el código público.
 *
 * Requiere Node 18+ (usa fetch nativo).
 * =============================================================================
 */

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const BASE = 'https://api.football-data.org/v4';
const DATA_DIR = path.join(__dirname, '..', 'data');
const MAX_DIAS_RANGO = 10; // límite del plan gratuito por consulta de fechas

async function apiGet(endpoint, params = {}) {
  const url = new URL(BASE + endpoint);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { 'X-Auth-Token': TOKEN } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} en ${endpoint}: ${await res.text()}`);
  }
  return res.json();
}

function fechaISO(date) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

function normalizeMatch(m, leagueKey) {
  const gh = m.score && m.score.fullTime ? m.score.fullTime.home : null;
  const ga = m.score && m.score.fullTime ? m.score.fullTime.away : null;
  let resultado = null;
  if (gh !== null && ga !== null) {
    resultado = gh > ga ? 'H' : (gh < ga ? 'A' : 'D');
  }
  return {
    id: `fd_${m.id}`,
    league: leagueKey,
    date: m.utcDate,
    round: `Jornada ${m.matchday}`,
    home: m.homeTeam.name,
    away: m.awayTeam.name,
    golesLocal: gh,
    golesVisitante: ga,
    resultado,
  };
}

function loadJson(file, fallback) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function saveJson(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2) + '\n');
}

async function main() {
  if (!TOKEN) {
    console.error('Falta FOOTBALL_DATA_TOKEN. Añádelo en Settings → Secrets and variables → Actions del repo.');
    process.exit(1);
  }

  const leaguesConfig = loadJson('leagues-config.json', {});
  const existingResultados = loadJson('resultados.json', []);
  const resultadosById = new Map(existingResultados.map(r => [r.id, r]));
  const proximos = [];
  let huboErrores = false;

  const hoy = new Date();
  const desde = new Date(hoy); desde.setDate(desde.getDate() - MAX_DIAS_RANGO);
  const hasta = new Date(hoy); hasta.setDate(hasta.getDate() + MAX_DIAS_RANGO);

  for (const [leagueKey, cfg] of Object.entries(leaguesConfig)) {
    if (!cfg || cfg.provider !== 'football-data' || !cfg.code) {
      console.log(`⏭  ${leagueKey}: sin automatización configurada — entrada manual desde la web.`);
      continue;
    }
    try {
      console.log(`↓ ${leagueKey} (${cfg.code}): partidos entre ${fechaISO(desde)} y ${fechaISO(hoy)} (resultados)...`);
      const pasados = await apiGet(`/competitions/${cfg.code}/matches`, {
        dateFrom: fechaISO(desde), dateTo: fechaISO(hoy),
      });
      (pasados.matches || []).forEach(m => {
        const norm = normalizeMatch(m, leagueKey);
        if (norm.resultado) resultadosById.set(norm.id, norm);
      });

      console.log(`↓ ${leagueKey}: partidos entre ${fechaISO(hoy)} y ${fechaISO(hasta)} (próximos)...`);
      const futuros = await apiGet(`/competitions/${cfg.code}/matches`, {
        dateFrom: fechaISO(hoy), dateTo: fechaISO(hasta),
      });
      (futuros.matches || []).forEach(m => {
        const norm = normalizeMatch(m, leagueKey);
        if (norm.resultado) {
          resultadosById.set(norm.id, norm); // ya jugado dentro de esta ventana
        } else {
          proximos.push({
            id: norm.id, league: leagueKey, date: norm.date, round: norm.round,
            home: norm.home, away: norm.away,
          });
        }
      });
    } catch (err) {
      huboErrores = true;
      console.error(`✕ Error en ${leagueKey}: ${err.message}`);
    }
  }

  const resultadosOrdenados = Array.from(resultadosById.values())
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 300);

  saveJson('resultados.json', resultadosOrdenados);
  saveJson('proximos.json', proximos.sort((a, b) => new Date(a.date) - new Date(b.date)));

  console.log(`\nHecho: ${resultadosOrdenados.length} resultados guardados, ${proximos.length} próximos partidos.`);
  if (huboErrores) console.log('Hubo errores en alguna liga (ver arriba).');
}

main().catch(err => { console.error(err); process.exit(1); });
