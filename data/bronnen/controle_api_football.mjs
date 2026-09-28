import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.dirname(HERE);
const CACHE_DIR = path.resolve(HERE, '../../../.cache/api-football/coaches');
const API_URL = 'https://v3.football.api-sports.io/coachs';

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function queryFor(name) {
  return String(name)
    .replace(/\([^)]*\)/gu, ' ')
    .replace(/["“”]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function cachePath(query) {
  const hash = crypto.createHash('sha256').update(query).digest('hex').slice(0, 20);
  return path.join(CACHE_DIR, `${hash}.json`);
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchCoach(query, apiKey) {
  const file = cachePath(query);
  if (fs.existsSync(file)) return { cached: true, payload: JSON.parse(fs.readFileSync(file, 'utf8')) };

  const url = new URL(API_URL);
  url.searchParams.set('search', query);
  const response = await fetch(url, { headers: { 'x-apisports-key': apiKey } });
  const payload = await response.json();
  if (!response.ok || (payload.errors && Object.keys(payload.errors).length)) {
    throw new Error(`API-Football weigerde '${query}' (${response.status}): ${JSON.stringify(payload.errors || payload)}`);
  }
  const wrapped = {
    opgehaald_op: new Date().toISOString(),
    query,
    dagelijks_over: response.headers.get('x-ratelimit-requests-remaining'),
    per_minuut_over: response.headers.get('x-ratelimit-remaining'),
    response: payload.response || [],
  };
  fs.writeFileSync(file, `${JSON.stringify(wrapped, null, 2)}\n`, 'utf8');
  return { cached: false, payload: wrapped };
}

function extractEvidence(name, payload) {
  return {
    gezochte_naam: name,
    api_query: payload.query,
    kandidaten: payload.response.map(coach => ({
      api_id: coach.id,
      naam: coach.name,
      voornaam: coach.firstname,
      achternaam: coach.lastname,
      nationaliteit: coach.nationality,
      loopbaan: coach.career || [],
    })),
  };
}

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new Error('Zet eerst de omgevingsvariabele API_FOOTBALL_KEY. De sleutel hoort niet in de repo of opdrachtregel.');

  const limit = Number.parseInt(argValue('--limit', '90'), 10);
  const delayMs = Number.parseInt(argValue('--delay-ms', '7000'), 10);
  const cases = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'twijfelgevallen.json'), 'utf8')).twijfel;
  const names = [];
  for (const item of cases) {
    names.push(item.dbCoach, ...item.kandidaten.map(candidate => candidate.naam));
  }
  const unique = [...new Set(names.map(queryFor).filter(name => name.length >= 3))];
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const evidence = [];
  let requests = 0;
  let lastDailyRemaining = null;
  for (const name of unique) {
    if (requests >= limit) break;
    const result = await fetchCoach(name, apiKey);
    evidence.push(extractEvidence(name, result.payload));
    lastDailyRemaining = result.payload.dagelijks_over ?? lastDailyRemaining;
    if (!result.cached) {
      requests += 1;
      if (Number(lastDailyRemaining) <= 5) break;
      await wait(delayMs);
    }
  }

  const report = {
    gegenereerd_op: new Date().toISOString(),
    bron: API_URL,
    nieuwe_requests: requests,
    dagelijks_over_volgens_laatste_response: lastDailyRemaining,
    namen_totaal: unique.length,
    namen_in_rapport: evidence.length,
    resultaten: evidence,
  };
  const reportPath = path.resolve(CACHE_DIR, '../controle.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Controle opgeslagen in ${reportPath}`);
  console.log(`Nieuwe requests: ${requests}; resterend volgens API: ${lastDailyRemaining ?? 'onbekend'}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

