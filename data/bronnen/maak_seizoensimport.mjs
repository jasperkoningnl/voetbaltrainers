import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.dirname(HERE);
const ROOT = path.dirname(DATA_DIR);
const SEASON = process.argv[2] || '2025/26';
const seasonLabel = SEASON.replace('/', '-');
const reportPath = path.join(ROOT, '.cache', 'transfermarkt', `rapport-${seasonLabel}.json`);
const outputPath = process.argv[3] || path.join(DATA_DIR, `import_${seasonLabel}.json`);

const NEW_COACHES = {
  'Fred Grim': ['Dutch', 'nl'],
  'Sébastien Pocognoli': ['Belgian', 'be'],
  'Eirik Horneland': ['Norwegian', 'no'],
  'Jorge Couto': ['Portuguese', 'pt'],
  'Eugen Polanski': ['Polish', 'pl'],
  'Robin van Persie': ['Dutch', 'nl'],
  'Merlin Polzin': ['German', 'de'],
  'Cristian Chivu': ['Romanian', 'ro'],
  'Xabi Alonso': ['Spanish', 'es'],
  'Gian Piero Gasperini': ['Italian', 'it'],
  'Carlos Vicens': ['Spanish', 'es'],
  'Carlos Corberán': ['Spanish', 'es'],
};

function canonical(value) {
  return String(value || '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^\p{Letter}\p{Number}]+/gu, ' ').trim().toLocaleLowerCase('nl');
}

function overlapDays(record, season) {
  const year = Number(season.slice(0, 4));
  const start = `${year}-08-01`;
  const end = `${year + 1}-05-20`;
  const from = record.van > start ? record.van : start;
  const until = record.tot && record.tot < end ? record.tot : end;
  return Math.floor((Date.parse(until) - Date.parse(from)) / 86400000) + 1;
}

if (!fs.existsSync(reportPath)) throw new Error(`Maak eerst het Transfermarkt-rapport: ${reportPath}`);
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'snapshot.json'), 'utf8'));
const prizes = JSON.parse(fs.readFileSync(path.join(HERE, `prijzen_${seasonLabel}.json`), 'utf8'));
const coaches = new Map(snapshot.coaches.map(coach => [canonical(coach.naam), coach]));
const clubs = new Map(snapshot.clubs.map(club => [club.id, club]));

const rows = report.resultaten.map(result => {
  const comparison = result.seizoenen.find(item => item.seizoen === SEASON);
  if (!comparison?.kandidaten?.length) throw new Error(`Geen trainers voor ${result.club}`);
  const grouped = new Map();
  for (const candidate of comparison.kandidaten) {
    const key = canonical(candidate.naam);
    const current = grouped.get(key) || { candidate, days: 0 };
    current.days += overlapDays(candidate, SEASON);
    grouped.set(key, current);
  }
  const main = [...grouped.values()].sort((left, right) => right.days - left.days)[0].candidate;
  const knownCoach = coaches.get(canonical(main.naam));
  const [nationaliteit = '', nat_code = ''] = knownCoach
    ? [knownCoach.nationaliteit || '', knownCoach.nat_code || '']
    : (NEW_COACHES[main.naam] || []);
  if (!knownCoach && !nationaliteit) throw new Error(`Nationaliteit ontbreekt voor nieuwe hoofdtrainer ${main.naam}`);
  const club = clubs.get(comparison.club);
  if (!club) throw new Error(`Club ontbreekt in snapshot: ${comparison.clubNaam}`);
  return {
    club: club.naam,
    clubId: club.id,
    seizoen: SEASON,
    coach: knownCoach?.naam || main.naam,
    coach_transfermarkt_id: main.transfermarkt_id,
    nationaliteit,
    nat_code,
    land: club.land,
    landstitel: prizes.landstitel.includes(club.id) ? 'Y' : 'N',
    nationale_beker: prizes.nationale_beker.includes(club.id) ? 'Y' : 'N',
    europese_prijs: prizes.europese_prijs.includes(club.id) ? 'Y' : 'N',
    trainers_seizoen: comparison.kandidaten.map(({ naam, van, tot, interim, datum_precisie }) => ({ naam, van, tot, interim, datum_precisie })),
    trainers_bron: `https://www.transfermarkt.com/${result.slug || ''}`,
  };
});

const clubConfig = JSON.parse(fs.readFileSync(path.join(HERE, 'transfermarkt_clubs.json'), 'utf8')).clubs;
const configById = new Map(clubConfig.map(club => [club.club, club]));
for (const row of rows) {
  const club = configById.get(row.clubId);
  row.trainers_bron = `https://www.transfermarkt.com/${club.slug}/mitarbeiterhistorie/verein/${club.transfermarkt_id}`;
}

fs.writeFileSync(outputPath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
console.log(`${rows.length} clubseizoenen geschreven naar ${outputPath}`);
