import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.dirname(HERE);
const REPO_ROOT = path.dirname(DATA_DIR);
const CACHE_DIR = path.join(REPO_ROOT, '.cache', 'transfermarkt');
const ROLE_CONFIG = [
  { id: '1', role: 'manager', interim: false },
  { id: '10', role: 'caretaker_manager', interim: true },
];

function decodeHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#0?39;|&apos;/gu, "'")
    .replace(/&nbsp;/gu, ' ')
    .replace(/&#(\d+);/gu, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/\s+/gu, ' ')
    .trim();
}

function parseDate(value) {
  if (!value || value === '-') return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/u);
  if (!match) throw new Error(`Onbekend datumformaat: ${value}`);
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function parseStaffHistory(html, roleConfig, sourceUrl) {
  const rows = [...html.matchAll(/<tr class="(?:odd|even)">(\s*<td><table class=inline-table>[\s\S]*?<\/table><\/td>[\s\S]*?)<\/tr>/gu)];
  const records = rows.map(([, row]) => {
    const profile = row.match(/<td class=hauptlink>\s*<a[^>]*href="([^"]*\/profil\/trainer\/(\d+))"[^>]*>([\s\S]*?)<\/a>/u);
    const dates = [...row.matchAll(/<td[^>]*class="[^"]*zentriert[^"]*"[^>]*>\s*(\d{2}\/\d{2}\/\d{4}|-)\s*<\/td>/gu)]
      .map(match => match[1]);
    if (!profile || !dates[0]) return null;
    return {
      transfermarkt_id: profile[2],
      naam: decodeHtml(profile[3]),
      rol: roleConfig.role,
      interim: roleConfig.interim,
      van: parseDate(dates[0]),
      tot: parseDate(dates[1]),
      profiel: new URL(profile[1].replace(/&amp;/gu, '&'), 'https://www.transfermarkt.com').href,
      bron: sourceUrl,
      datum_precisie: 'dag',
    };
  }).filter(Boolean);
  return records;
}

function validateHistoryPage(html, sourceUrl) {
  const title = html.match(/<title>([^<]+)<\/title>/iu)?.[1] || '';
  if (!/Current and former staff/iu.test(title) || !html.includes('data-header')) {
    throw new Error(`Onverwachte Transfermarkt-pagina voor ${sourceUrl}`);
  }
}

function parseArguments(argv) {
  const options = { seasons: [], clubs: [], delay: 1000, refresh: false, limit: null, report: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--refresh') options.refresh = true;
    else if (argument === '--seasons') options.seasons = String(argv[++index] || '').split(',').map(item => item.trim()).filter(Boolean);
    else if (argument === '--clubs') options.clubs = String(argv[++index] || '').split(',').map(item => item.trim().toLocaleLowerCase('nl')).filter(Boolean);
    else if (argument === '--delay') options.delay = Number(argv[++index]);
    else if (argument === '--limit') options.limit = Number(argv[++index]);
    else if (argument === '--report') options.report = path.resolve(argv[++index]);
    else throw new Error(`Onbekende optie: ${argument}`);
  }
  if (!options.seasons.length) throw new Error('Gebruik --seasons, bijvoorbeeld: --seasons 2025/26');
  if (!Number.isFinite(options.delay) || options.delay < 0) throw new Error('--delay moet nul of een positief getal zijn');
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) throw new Error('--limit moet een positief geheel getal zijn');
  return options;
}

function seasonBounds(season) {
  const match = season.match(/^(\d{4})\/(\d{2})$/u);
  if (!match) throw new Error(`Ongeldig seizoen: ${season}`);
  const startYear = Number(match[1]);
  const expectedEnd = String((startYear + 1) % 100).padStart(2, '0');
  if (match[2] !== expectedEnd) throw new Error(`Ongeldig aansluitend seizoen: ${season}`);
  return { start: `${startYear}-08-01`, end: `${startYear + 1}-05-20` };
}

export function overlapsSeason(record, season) {
  const { start, end } = seasonBounds(season);
  const overlapStart = record.van > start ? record.van : start;
  const overlapEnd = record.tot && record.tot < end ? record.tot : end;
  if (overlapStart > overlapEnd) return false;
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const days = Math.floor((Date.parse(overlapEnd) - Date.parse(overlapStart)) / millisecondsPerDay) + 1;
  return days >= 3;
}

function canonicalName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .toLocaleLowerCase('nl');
}

function uniqueRecords(records) {
  const seen = new Set();
  return records.filter(record => {
    const key = [record.transfermarkt_id, record.rol, record.van, record.tot].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => left.van.localeCompare(right.van) || left.naam.localeCompare(right.naam));
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en-US,en;q=0.9',
          'user-agent': 'Mozilla/5.0 (compatible; voetbaltrainers-data-import/1.0)',
        },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return response.text();
      if (response.status !== 429 && response.status < 500) throw new Error(`HTTP ${response.status}`);
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) await sleep(attempt * 2000);
  }
  throw new Error(`Ophalen mislukt voor ${url}: ${lastError?.message || 'onbekende fout'}`);
}

async function loadRolePage(club, roleConfig, options, requestState) {
  const sourceUrl = `https://www.transfermarkt.com/${club.slug}/mitarbeiterhistorie/verein/${club.transfermarkt_id}/personalie_id/${roleConfig.id}/plus/1`;
  const cachePath = path.join(CACHE_DIR, `${club.transfermarkt_id}-${roleConfig.id}.html`);
  let html;
  let cached = false;
  if (!options.refresh && fs.existsSync(cachePath)) {
    html = fs.readFileSync(cachePath, 'utf8');
    cached = true;
  } else {
    if (requestState.count > 0 && options.delay > 0) await sleep(options.delay);
    html = await fetchWithRetry(sourceUrl);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath, html, 'utf8');
    requestState.count += 1;
  }
  validateHistoryPage(html, sourceUrl);
  const records = parseStaffHistory(html, roleConfig, sourceUrl);
  if (roleConfig.role === 'manager' && !records.length) {
    throw new Error(`Geen manager-records gevonden in ${sourceUrl}`);
  }
  return { records, sourceUrl, cached };
}

function compareSeason(existingRows, club, season, records) {
  const existing = existingRows.find(row => row.club === club.club && row.seizoen === season);
  const candidates = records.filter(record => overlapsSeason(record, season));
  const existingNames = (existing?.trainers || []).map(trainer => trainer.naam);
  const candidateNames = candidates.map(trainer => trainer.naam);
  const existingCanonical = new Set(existingNames.map(canonicalName));
  const candidateCanonical = new Set(candidateNames.map(canonicalName));
  return {
    club: club.club,
    clubNaam: club.naam,
    transfermarkt_club_id: club.transfermarkt_id,
    seizoen: season,
    status: !existing
      ? (candidates.length ? 'nieuw_seizoen' : 'geen_data')
      : ([...existingCanonical].every(name => candidateCanonical.has(name)) && [...candidateCanonical].every(name => existingCanonical.has(name)) ? 'gelijk' : 'verschil'),
    bestaand: existingNames,
    transfermarkt: candidateNames,
    kandidaten: candidates.map(record => ({
      naam: record.naam,
      van: record.van,
      tot: record.tot,
      interim: record.interim,
      datum_precisie: record.datum_precisie,
      transfermarkt_id: record.transfermarkt_id,
      bron: record.bron,
    })),
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const clubConfig = JSON.parse(fs.readFileSync(path.join(HERE, 'transfermarkt_clubs.json'), 'utf8')).clubs;
  const existingRows = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'trainers_seizoen.json'), 'utf8')).seizoenen;
  let clubs = clubConfig.filter(club => !options.clubs.length || options.clubs.includes(club.naam.toLocaleLowerCase('nl')) || options.clubs.includes(club.club.toLocaleLowerCase('nl')));
  if (options.limit !== null) clubs = clubs.slice(0, options.limit);
  if (!clubs.length) throw new Error('Geen clubs geselecteerd');

  const requestState = { count: 0 };
  const results = [];
  for (const club of clubs) {
    const roleResults = [];
    for (const roleConfig of ROLE_CONFIG) roleResults.push(await loadRolePage(club, roleConfig, options, requestState));
    const records = uniqueRecords(roleResults.flatMap(result => result.records));
    results.push({
      club: club.naam,
      transfermarkt_club_id: club.transfermarkt_id,
      bronnen: roleResults.map(result => ({ url: result.sourceUrl, cache: result.cached })),
      records: records.length,
      seizoenen: options.seasons.map(season => compareSeason(existingRows, club, season, records)),
    });
    process.stdout.write(`${club.naam}: ${records.length} periodes\n`);
  }

  const comparisons = results.flatMap(result => result.seizoenen);
  const report = {
    gegenereerd_op: new Date().toISOString(),
    bron: 'Transfermarkt club staff history',
    rollen: ROLE_CONFIG.map(role => ({ id: role.id, rol: role.role })),
    seizoenen: options.seasons,
    clubs: clubs.length,
    externe_requests: requestState.count,
    samenvatting: {
      gelijk: comparisons.filter(item => item.status === 'gelijk').length,
      verschil: comparisons.filter(item => item.status === 'verschil').length,
      nieuw_seizoen: comparisons.filter(item => item.status === 'nieuw_seizoen').length,
      geen_data: comparisons.filter(item => item.status === 'geen_data').length,
    },
    resultaten: results,
  };
  const seasonLabel = options.seasons.join('_').replaceAll('/', '-');
  const reportPath = options.report || path.join(CACHE_DIR, `rapport-${seasonLabel}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report.samenvatting)}\nRapport: ${reportPath}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
