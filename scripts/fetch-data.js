#!/usr/bin/env node
/**
 * =============================================================================
 * Descarga resultados recientes y próximos partidos desde API-Football
 * (https://api-football.com, plan gratuito: 100 peticiones/día) y los guarda
 * en data/resultados.json y data/proximos.json.
 *
 * Este script NO corre en el navegador: se ejecuta desde GitHub Actions
 * (ver .github/workflows/actualizar-datos.yml), donde la clave de la API
 * vive como Secret del repo y nunca queda expuesta en el código público.
 *
 * Requiere Node 18+ (usa fetch nativo). En GitHub Actions se fija Node 20.
 * =============================================================================
 */

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE = 'https://v3.football.api-sports.io';
const DATA_DIR = path.join(__dirname, '..', 'data');

function currentSeason() {
  // api-football identifica la temporada por el año de inicio (ej: 2025 para 2025-26).
  // LaLiga arranca en agosto, así que antes de julio seguimos en la temporada anterior.
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return m >= 7 ? y : y - 1;
}

async function apiGet(endpoint, params) {
  const url = new URL(BASE + endpoint);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { 'x-apisports-key': API_KEY } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} en ${endpoint}: ${await res.text()}`);
  }
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length) {
    throw new Error(`API-Football devolvió errores en ${endpoint}: ${JSON.stringify(json.errors)}`);
  }
  return json.response || [];
}

function normalizeResult(fixture, leagueKey) {
  const gh = fixture.goals.home, ga = fixture.goals.away;
  let resultado = null;
  if (gh !== null && ga !== null) {
    resultado = gh > ga ? 'H' : (gh < ga ? 'A' : 'D');
  }
  return {
    id: `af_${fixture.fixture.id}`,
    league: leagueKey,
    date: fixture.fixture.date,
    round: fixture.league.round,
    home: fixture.teams.home.name,
    away: fixture.teams.away.name,
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
  if (!API_KEY) {
    console.error('Falta API_FOOTBALL_KEY. Añádela en Settings → Secrets and variables → Actions del repo.');
    process.exit(1);
  }

  const leaguesConfig = loadJson('leagues-config.json', {});
  const season = currentSeason();

  const existingResultados = loadJson('resultados.json', []);
  const resultadosById = new Map(existingResultados.map(r => [r.id, r]));
  const proximos = [];
  let huboErrores = false;

  for (const [leagueKey, cfg] of Object.entries(leaguesConfig)) {
    if (!cfg || !cfg.id) {
      console.log(`⏭  ${leagueKey}: sin ID de liga configurado en data/leagues-config.json — se omite.`);
      continue;
    }
    try {
      console.log(`↓ ${leagueKey} (liga ${cfg.id}, temporada ${season}): resultados recientes...`);
      const recent = await apiGet('/fixtures', { league: cfg.id, season, last: 20 });
      recent.forEach(fx => {
        const norm = normalizeResult(fx, leagueKey);
        if (norm.resultado) resultadosById.set(norm.id, norm);
      });

      console.log(`↓ ${leagueKey}: próximos partidos...`);
      const next = await apiGet('/fixtures', { league: cfg.id, season, next: 20 });
      next.forEach(fx => {
        proximos.push({
          id: `af_${fx.fixture.id}`,
          league: leagueKey,
          date: fx.fixture.date,
          round: fx.league.round,
          home: fx.teams.home.name,
          away: fx.teams.away.name,
        });
      });
    } catch (err) {
      huboErrores = true;
      console.error(`✕ Error en ${leagueKey}: ${err.message}`);
      console.error('   Revisa que el ID de liga en data/leagues-config.json sea correcto (usa scripts/find-league-id.js).');
    }
  }

  const resultadosOrdenados = Array.from(resultadosById.values())
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 300); // histórico razonable sin crecer indefinidamente

  saveJson('resultados.json', resultadosOrdenados);
  saveJson('proximos.json', proximos.sort((a, b) => new Date(a.date) - new Date(b.date)));

  console.log(`\nHecho: ${resultadosOrdenados.length} resultados guardados, ${proximos.length} próximos partidos.`);
  if (huboErrores) {
    console.log('Hubo errores en alguna liga (ver arriba) — los datos de las demás ligas se guardaron igualmente.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
