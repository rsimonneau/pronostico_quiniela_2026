#!/usr/bin/env node
/**
 * Uso: API_FOOTBALL_KEY=tu_clave node scripts/find-league-id.js "Liga F"
 *
 * Busca ligas por nombre en API-Football y muestra su ID, país y si el plan
 * gratuito la cubre. Útil para confirmar el ID de Liga F antes de activarla
 * en data/leagues-config.json (el de Primera=140 y Segunda=141 ya están
 * verificados y puestos por defecto).
 */
const API_KEY = process.env.API_FOOTBALL_KEY;
const query = process.argv.slice(2).join(' ');

if (!API_KEY) {
  console.error('Falta API_FOOTBALL_KEY en el entorno. Ejemplo:');
  console.error('  API_FOOTBALL_KEY=tu_clave node scripts/find-league-id.js "Liga F"');
  process.exit(1);
}
if (!query) {
  console.error('Indica un término de búsqueda, ej: node scripts/find-league-id.js "Liga F"');
  process.exit(1);
}

async function main() {
  const url = new URL('https://v3.football.api-sports.io/leagues');
  url.searchParams.set('search', query);
  const res = await fetch(url, { headers: { 'x-apisports-key': API_KEY } });
  const json = await res.json();
  if (!json.response || json.response.length === 0) {
    console.log('Sin resultados para:', query);
    return;
  }
  json.response.forEach(item => {
    const seasons = item.seasons || [];
    const current = seasons.find(s => s.current) || seasons[seasons.length - 1];
    console.log(`ID ${item.league.id} — ${item.league.name} (${item.country.name}) — tipo: ${item.league.type}`);
    if (current) console.log(`   temporada actual: ${current.year} — cobertura fixtures: ${JSON.stringify(current.coverage.fixtures)}`);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
