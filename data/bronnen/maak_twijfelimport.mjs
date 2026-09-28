import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.dirname(HERE);
const ROOT = path.dirname(DATA_DIR);
const REPORT = path.join(ROOT, '.cache', 'transfermarkt', 'rapport-volledige-historie-35.json');
const SEASON_IMPORT = path.join(DATA_DIR, 'import_2025-26.json');
const OUTPUT = path.join(DATA_DIR, 'import_transfermarkt_compleet.json');

const ALIASES = {
  'Lluís Miró': 'Luis Miró',
  'Domingo Balmanya': 'Domènec Balmanya',
  'Manuel Mestre': 'Manolo Mestre',
};

const NEW_COACHES = {
  'Otto Vieira': ['Brazilian', 'br'],
  'Branko Stankovic': ['Serbian', 'rs'],
  'Hans Dorjee': ['Dutch', 'nl'],
  'Vladimir Kovacevic': ['Serbian', 'rs'],
  'José Arribas': ['French', 'fr'],
  'Henri Stambouli': ['French', 'fr'],
  'Bernard Casoni': ['French', 'fr'],
  'Juan Ramón López Caro': ['Spanish', 'es'],
};

const canonical = value => String(value || '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^\p{Letter}\p{Number}]+/gu, ' ').trim().toLocaleLowerCase('nl');

function overlapDays(record, season) {
  const year = Number(season.slice(0, 4));
  const start = `${year}-08-01`, end = `${year + 1}-05-20`;
  const from = record.van > start ? record.van : start;
  const until = record.tot && record.tot < end ? record.tot : end;
  return Math.floor((Date.parse(until) - Date.parse(from)) / 86400000) + 1;
}

if (!fs.existsSync(REPORT)) throw new Error(`Historisch Transfermarkt-rapport ontbreekt: ${REPORT}`);
const snapshot = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'snapshot.json'), 'utf8'));
const openDoubts = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'twijfelgevallen.json'), 'utf8')).twijfel;
const previousImport = fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT, 'utf8')) : [];
const doubts = openDoubts.length ? openDoubts : previousImport
  .filter(row => row.seizoen !== '2025/26')
  .map(row => ({ club: row.clubId, clubNaam: row.club, seizoen: row.seizoen }));
if (!doubts.length) throw new Error('Geen open of eerder opgeloste twijfelgevallen gevonden');
const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
const clubConfig = JSON.parse(fs.readFileSync(path.join(HERE, 'transfermarkt_clubs.json'), 'utf8')).clubs;
const reportRows = new Map(report.resultaten.flatMap(club => club.seizoenen.map(row => [`${row.club}|${row.seizoen}`, row])));
const seasons = new Map(snapshot.seizoenen.map(season => [`${season.club}|${season.seizoen}`, season]));
const coaches = new Map(snapshot.coaches.map(coach => [canonical(coach.naam), coach]));
const clubs = new Map(snapshot.clubs.map(club => [club.id, club]));
const configs = new Map(clubConfig.map(club => [club.club, club]));

const resolved = doubts.map(item => {
  const source = reportRows.get(`${item.club}|${item.seizoen}`);
  if (!source?.kandidaten?.length) throw new Error(`Geen Transfermarkt-data voor ${item.clubNaam} ${item.seizoen}`);
  const eligible = source.kandidaten.filter(candidate => !candidate.interim);
  if (!eligible.length) throw new Error(`Geen niet-interim hoofdtrainer voor ${item.clubNaam} ${item.seizoen}`);
  const grouped = new Map();
  for (const candidate of eligible) {
    const key = canonical(candidate.naam);
    const current = grouped.get(key) || { candidate, days: 0 };
    current.days += overlapDays(candidate, item.seizoen);
    grouped.set(key, current);
  }
  const main = [...grouped.values()].sort((a, b) => b.days - a.days)[0].candidate;
  const coachName = ALIASES[main.naam] || main.naam;
  const known = coaches.get(canonical(coachName));
  const [nationaliteit = '', nat_code = ''] = known
    ? [known.nationaliteit || '', known.nat_code || '']
    : (NEW_COACHES[main.naam] || []);
  if (!known && !nationaliteit) throw new Error(`Metadata ontbreekt voor nieuwe hoofdtrainer ${main.naam}`);
  const currentSeason = seasons.get(`${item.club}|${item.seizoen}`);
  const club = clubs.get(item.club);
  const config = configs.get(item.club);
  if (!currentSeason || !club || !config) throw new Error(`Databasekoppeling ontbreekt voor ${item.clubNaam} ${item.seizoen}`);
  return {
    club: club.naam,
    clubId: club.id,
    seizoen: item.seizoen,
    coach: known?.naam || coachName,
    coach_transfermarkt_id: main.transfermarkt_id,
    nationaliteit,
    nat_code,
    land: currentSeason.land || club.land,
    landstitel: currentSeason.landstitel || 'N',
    nationale_beker: currentSeason.nationale_beker || 'N',
    europese_prijs: currentSeason.europese_prijs || 'N',
    trainers_seizoen: source.kandidaten.map(({ naam, van, tot, interim, datum_precisie }) => ({ naam, van, tot, interim, datum_precisie })),
    trainers_bron: `https://www.transfermarkt.com/${config.slug}/mitarbeiterhistorie/verein/${config.transfermarkt_id}`,
  };
});

const currentSeason = JSON.parse(fs.readFileSync(SEASON_IMPORT, 'utf8'));
const combined = [...resolved, ...currentSeason].sort((a, b) => a.club.localeCompare(b.club) || a.seizoen.localeCompare(b.seizoen));
fs.writeFileSync(OUTPUT, `${JSON.stringify(combined, null, 2)}\n`, 'utf8');
console.log(`${resolved.length} twijfelgevallen opgelost; ${combined.length} rijen geschreven naar ${OUTPUT}`);
