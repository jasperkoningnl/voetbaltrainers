import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const LEGACY_DATA_DIR = path.join(REPO_ROOT, 'data');
const CACHE_DIR = path.join(REPO_ROOT, '.cache', 'football-data-org', 'standings');
const REPORT_PATH = path.join(REPO_ROOT, '.cache', 'football-data-org', 'controle_landstitels.json');
const API_BASE = 'https://api.football-data.org/v4';

const COMPETITIONS = [
  {
    code: 'PL', file: 'england.json',
    aliases: {
      'Arsenal FC': 'Arsenal', 'Chelsea FC': 'Chelsea', 'Liverpool FC': 'Liverpool',
      'Manchester City FC': 'Manchester City', 'Manchester United FC': 'Manchester United',
    },
  },
  {
    code: 'PD', file: 'spain.json',
    aliases: {
      'Athletic Club': 'Athletic Bilbao', 'Club Atlético de Madrid': 'Atlético Madrid',
      'FC Barcelona': 'FC Barcelona', 'Real Madrid CF': 'Real Madrid', 'Valencia CF': 'Valencia CF',
    },
  },
  {
    code: 'SA', file: 'italy.json',
    aliases: {
      'AC Milan': 'Milan', 'AS Roma': 'Roma', 'FC Internazionale Milano': 'Internazionale',
      'Juventus FC': 'Juventus', 'SSC Napoli': 'Napoli',
    },
  },
  {
    code: 'BL1', file: 'germany.json',
    aliases: {
      'Borussia Dortmund': 'Borussia Dortmund', 'Borussia Mönchengladbach': 'Borussia Mönchengladbach',
      'FC Bayern München': 'Bayern München', 'Hamburger SV': 'Hamburger SV', 'VfB Stuttgart': 'VfB Stuttgart',
    },
  },
  {
    code: 'FL1', file: 'france.json',
    aliases: {
      'AS Monaco FC': 'AS Monaco', 'AS Saint-Étienne': 'AS Saint-Étienne',
      'Olympique de Marseille': 'Olympique Marseille', 'Olympique Lyonnais': 'Olympique Lyonnais',
      'Paris Saint-Germain FC': 'Paris Saint-Germain',
    },
  },
  {
    code: 'DED', file: 'netherlands.json',
    aliases: {
      'AFC Ajax': 'Ajax', 'AZ': 'AZ', 'FC Twente': 'FC Twente',
      'Feyenoord Rotterdam': 'Feyenoord', 'PSV': 'PSV',
    },
  },
  {
    code: 'PPL', file: 'portugal.json',
    aliases: {
      'Boavista FC': 'Boavista', 'FC Porto': 'FC Porto', 'Sport Lisboa e Benfica': 'Benfica',
      'Sporting Clube de Braga': 'S.C. Braga', 'Sporting Clube de Portugal': 'Sporting CP',
    },
  },
];

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function seasonLabel(startYear) {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function latestSeasonStart() {
  let latest = 0;
  for (const { file } of COMPETITIONS) {
    const rows = JSON.parse(fs.readFileSync(path.join(LEGACY_DATA_DIR, file), 'utf8'));
    for (const row of rows) latest = Math.max(latest, Number.parseInt(row.seizoen.slice(0, 4), 10));
  }
  return latest;
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function standings(code, startYear, apiKey) {
  const file = path.join(CACHE_DIR, `${code}-${startYear}.json`);
  if (fs.existsSync(file)) return { cached: true, payload: JSON.parse(fs.readFileSync(file, 'utf8')) };

  const url = new URL(`${API_BASE}/competitions/${code}/standings`);
  url.searchParams.set('season', String(startYear));
  let response;
  let body;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    response = await fetch(url, { headers: { 'X-Auth-Token': apiKey } });
    body = await response.json();
    if (response.status !== 429 || attempt === 1) break;
    const secondsFromMessage = Number.parseInt(String(body.message || '').match(/Wait (\d+) seconds?/i)?.[1] || '', 10);
    const seconds = Number.parseInt(response.headers.get('retry-after') || '', 10) || secondsFromMessage || 60;
    console.log(`Requestlimiet bereikt; ${seconds + 1} seconden wachten.`);
    await wait((seconds + 1) * 1000);
  }
  if (!response.ok) throw new Error(`${code} ${startYear}: ${response.status} ${body.message || 'onbekende fout'}`);

  const total = (body.standings || []).find(item => item.type === 'TOTAL');
  const first = total?.table?.[0];
  if (!first?.team?.name) throw new Error(`${code} ${startYear}: geen eindstand of koploper gevonden`);
  if (body.season?.endDate && Date.parse(body.season.endDate) >= Date.now()) {
    throw new Error(`${code} ${startYear}: seizoen eindigt pas op ${body.season.endDate}; de koploper is nog geen kampioen`);
  }

  const payload = {
    opgehaald_op: new Date().toISOString(),
    competitie: code,
    startjaar: startYear,
    einddatum: body.season?.endDate || null,
    gespeeld: first.playedGames,
    winnaar: first.team.name,
    punten: first.points,
    bron: url.toString(),
  };
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { cached: false, payload };
}

async function main() {
  const apiKey = process.env.FOOTBALL_DATA_ORG_KEY;
  if (!apiKey) throw new Error('Zet eerst FOOTBALL_DATA_ORG_KEY. Sla de sleutel niet op in de repo of opdrachtregel.');

  const seasons = String(argValue('--seasons', latestSeasonStart()))
    .split(',')
    .map(value => Number.parseInt(value.trim(), 10))
    .filter(Number.isFinite);
  const delayMs = Number.parseInt(argValue('--delay-ms', seasons.length > 1 ? '6500' : '0'), 10);
  const results = [];

  for (const startYear of seasons) {
    for (const competition of COMPETITIONS) {
      const result = await standings(competition.code, startYear, apiKey);
      const rows = JSON.parse(fs.readFileSync(path.join(LEGACY_DATA_DIR, competition.file), 'utf8'))
        .filter(row => row.seizoen === seasonLabel(startYear));
      const marked = rows.filter(row => row.landstitel === 'Y').map(row => row.club);
      let expected = competition.aliases[result.payload.winnaar] || null;
      let bronbeperking = null;

      if (competition.code === 'DED' && startYear === 2019) {
        expected = null;
        bronbeperking = 'De Eredivisie 2019/20 werd zonder kampioen beëindigd; de API geeft alleen de nummer 1 van de afgebroken ranglijst.';
      }

      const expectedMarked = expected ? [expected] : [];
      const gelijk = JSON.stringify([...marked].sort()) === JSON.stringify([...expectedMarked].sort());
      results.push({
        competitie: competition.code,
        seizoen: seasonLabel(startYear),
        api_winnaar: result.payload.winnaar,
        verwachte_geselecteerde_club: expected,
        gemarkeerd_in_repo: marked,
        status: gelijk ? 'gelijk' : 'verschil',
        bronbeperking,
        cache: result.cached,
      });

      if (!result.cached && delayMs > 0) await wait(delayMs);
    }
  }

  const report = {
    gegenereerd_op: new Date().toISOString(),
    bron: API_BASE,
    seizoenen: seasons.map(seasonLabel),
    verschillen: results.filter(item => item.status === 'verschil').length,
    resultaten: results,
  };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Controle opgeslagen in ${REPORT_PATH}`);
  console.log(`Gecontroleerd: ${results.length}; verschillen: ${report.verschillen}`);
  for (const item of results.filter(result => result.status === 'verschil')) {
    console.log(`${item.competitie} ${item.seizoen}: API ${item.api_winnaar}; repo ${item.gemarkeerd_in_repo.join(', ') || 'niemand'}`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
