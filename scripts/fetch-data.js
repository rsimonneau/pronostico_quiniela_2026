#!/usr/bin/env node
/**
 * =============================================================================
 * Descarga resultados recientes y próximos partidos desde football-data.org
 * (https://football-data.org, plan gratuito: 10 peticiones/min, temporada
 * ACTUAL incluida) y los guarda en data/resultados.json y data/proximos.json.
 *
 * IMPORTANTE — por qué esta API y no API-Football:
 * El plan gratuito de API-Football (probado primero) solo da acceso a
 * fixtures de temporadas 2022-2024, no a la temporada en curso — inútil para
 * este caso de uso. football-data.org sí da temporada actual gratis, pero
 * a cambio solo cubre 12 ligas grandes; de España, únicamente Primera
 * División. Segunda y Liga F no tienen automatización disponible en ningún
 * plan gratuito conocido — se gestionan a mano desde la web (ya soportado).
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

async function apiGet(endpoint, params = {}) {
  const url = new URL(BASE + endpoint);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { 'X-Auth-Token': TOKEN } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} en ${endpoint}: ${await res.text()}`);
  }
  return res.json();
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

  for (const [leagueKey, cfg] of Object.entries(leaguesConfig)) {
    if (!cfg || cfg.provider !== 'football-data' || !cfg.code) {
      console.log(`⏭  ${leagueKey}: sin automatización configurada (provider distinto de football-data, o sin code) — entrada manual desde la web.`);
      continue;
    }
    try {
      console.log(`↓ ${leagueKey} (${cfg.code}): consultando jornada actual...`);
      const comp = await apiGet(`/competitions/${cfg.code}`);
      const currentMatchday = comp.currentSeason && comp.currentSeason.currentMatchday;
      if (!currentMatchday) throw new Error('La API no devolvió una jornada actual (currentMatchday vacío).');

      console.log(`↓ ${leagueKey}: resultados de la jornada ${currentMatchday - 1}...`);
      if (currentMatchday > 1) {
        const prev = await apiGet(`/competitions/${cfg.code}/matches`, { matchday: currentMatchday - 1 });
        (prev.matches || []).forEach(m => {
          const norm = normalizeMatch(m, leagueKey);
          if (norm.resultado) resultadosById.set(norm.id, norm);
        });
      }

      console.log(`↓ ${leagueKey}: partidos de la jornada ${currentMatchday}...`);
      const current = await apiGet(`/competitions/${cfg.code}/matches`, { matchday: currentMatchday });
      (current.matches || []).forEach(m => {
        const norm = normalizeMatch(m, leagueKey);
        if (norm.resultado) {
          // ya se jugó (jornada en curso con partidos ya finalizados)
          resultadosById.set(norm.id, norm);
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
