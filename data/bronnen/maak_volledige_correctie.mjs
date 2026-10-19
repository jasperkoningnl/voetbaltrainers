import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { overlapsSeason } from './importeer_transfermarkt.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.dirname(HERE);
const ROOT = path.dirname(DATA_DIR);
const REPORT = path.join(ROOT, '.cache', 'transfermarkt', 'rapport-volledige-historie-35-v2.json');
const EVIDENCE = path.join(HERE, 'transfermarkt_historie_2026-09-28.json');
const OUTPUT = path.join(DATA_DIR, 'import_transfermarkt_compleet.json');
const AUDIT = path.join(DATA_DIR, 'transfermarkt_correctierapport.json');
const AUDIT_MARKDOWN = path.join(DATA_DIR, 'TRANSFERMARKT_CORRECTIES.md');
const DOUBTS = path.join(DATA_DIR, 'twijfelgevallen.json');

const ALIASES = {
  'Alexander Schwartz': 'Elek Schwartz',
  'Cuco Ziganda': 'José Ángel Ziganda',
  'César Menotti': 'César Luis Menotti',
  'Domingo Balmanya': 'Domènec Balmanya',
  'Dr. György Sárosi': 'György Sárosi',
  'Georg Keßler': 'Georg Kessler',
  'Giuseppe Viani': 'Gipo Viani',
  'Hans Kraay': 'Hans Kraay Sr.',
  'Jiri Sobotka': 'George Sobotka',
  'Jozef Venglos': 'Josef Vengloš',
  'Juan Otxoantezana': 'Juan Ochoantezana',
  'Ladislau Bölöni': 'László Bölöni',
  'Ladislav Dupal': 'Louis Dupal',
  'László Kubala': 'Ladislao Kubala',
  'Lluís Miró': 'Luis Miró',
  'Lorenzo Serra Ferrer': 'Llorenç Serra Ferrer',
  'Manuel Mestre': 'Manolo Mestre',
  'Marcelino': 'Marcelino García Toral',
  'Marcos Alonso': 'Marcos Alonso Peña',
  'Misa Pavic': 'Milorad Pavić',
  'Norberto Höfling': 'Norbert Höfling',
  'Ole Gunnar Solskjaer': 'Ole Gunnar Solskjær',
  'Piru Gaínza': 'Agustín Gaínza',
  'Sir Bobby Robson': 'Bobby Robson',
  'Sir Geoff Hurst': 'Geoff Hurst',
  'Sir Matt Busby': 'Matt Busby',
  'Sören Lerby': 'Søren Lerby',
  'Tata Martino': 'Gerardo Martino',
  'Tinte': 'Rafael García Repullo',
  'Fernando Castro': 'Fernando Castro Santos',
  'Franz Platko': 'Ferenc Plattkó',
  'Tonnie Bruins Slot': 'Tonny Bruins Slot',
  'Johan Cruyff': 'Johan Cruijff',
  'Ruud van Nistelrooy': 'Ruud van Nistelrooij',
  'Óscar García Junyent': 'Óscar García',
  'Rafael García "Tinte"': 'Rafael García Repullo',
  'José Armando Ufarte': 'José Ufarte',
  'Iselín Santos Ovejero': 'Iselin Ovejero',
  'José Omar Pastoriza': 'José Pastoriza',
  '"Pacho" Maturana': 'Francisco Maturana',
  'Carlos García Cantarero': 'Carlos Cantarero',
  'Quique Flores': 'Quique Sánchez Flores',
  'Uli Maslo': 'Ulrich Maslo',
  'Heinz-Dieter Tippenhauer': 'Hans-Dieter Tippenhauer',
  'Vicente Sasot': 'Vicenç Sasot',
  'Antonio de la Cruz': 'Toño de la Cruz',
  'Franco Scoglio': 'Francesco Scoglio',
  'Gabriel Robert': 'Gaby Robert',
  'Giuseppe Zilizzi': 'József Zilisy',
  'Ricardo': 'Ricardo Gomes',
  'Manuel Fleitas': 'Manuel Fleitas Solich',
  'Oceano da Cruz': 'Oceano',
  'Franky Vercauteren': 'Frank Vercauteren',
  'Bernardino Pérez "Pasieguito"': 'Pasieguito',
  'José Iglesias Fernández': 'Joseíto',
  'Óscar Rubén Valdez': 'Óscar Valdez',
  'Salvador González "Voro"': 'Voro',
  'Miroslav Dukic': 'Miroslav Djukic',
  'Olaf Janß': 'Olaf Janßen',
  'Xavi': 'Xavi Hernández',
};

const NEW_COACHES = {
  'Cees van Dijcke': ['Dutch', 'nl'],
  'Daniel Ramos': ['Portuguese', 'pt'],
  'Erick Mombaerts': ['French', 'fr'],
  'Eraldo Monzeglio': ['Italian', 'it'],
  'Ercole Rabitti': ['Italian', 'it'],
  'Ferenc Plattkó': ['Hungarian', 'hu'],
  'Ferenc Szusza': ['Hungarian', 'hu'],
  'Ferruccio Valcareggi': ['Italian', 'it'],
  'Fioravante Baldi': ['Italian', 'it'],
  'Franco Colomba': ['Italian', 'it'],
  'Giuseppe Viani': ['Italian', 'it'],
  'Huub de Leeuw': ['Dutch', 'nl'],
  'Hans Dorjee': ['Dutch', 'nl'],
  'Joseph Gruber': ['Austrian', 'at'],
  'Jozef Venglos': ['Slovak', 'sk'],
  'Luigi Ferrero': ['Italian', 'it'],
  'Manuel Machado': ['Portuguese', 'pt'],
  'Norberto Höfling': ['Romanian', 'ro'],
  'Richard Kohn': ['Austrian', 'at'],
  'Rob Jacobs': ['Dutch', 'nl'],
  'Vladimir Kovacevic': ['Serbian', 'rs'],
  'José Arribas': ['French', 'fr'],
  'Henri Stambouli': ['French', 'fr'],
  'Bernard Casoni': ['French', 'fr'],
  'Juan Ramón López Caro': ['Spanish', 'es'],
};

const canonical = value => String(value || '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^\p{Letter}\p{Number}]+/gu, ' ').trim().toLocaleLowerCase('nl');
const preferredName = name => ALIASES[name] || name;
const keyOf = (club, season) => `${club}|${season}`;

function seasonBounds(season) {
  const year = Number(season.slice(0, 4));
  return { start: Date.parse(`${year}-08-01`), end: Date.parse(season === '2019/20' ? '2020-08-31' : `${year + 1}-05-20`) };
}

function clippedInterval(record, season) {
  const bounds = seasonBounds(season);
  return [Math.max(bounds.start, Date.parse(record.van)), Math.min(bounds.end, record.tot ? Date.parse(record.tot) : bounds.end)];
}

function overlapDays(record, season) {
  const [start, end] = clippedInterval(record, season);
  return Math.max(0, Math.floor((end - start) / 86400000) + 1);
}

function coverageDays(records, season) {
  const intervals = records.map(record => clippedInterval(record, season)).filter(([start, end]) => start <= end).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1] + 86400000) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  return merged.reduce((sum, [start, end]) => sum + Math.floor((end - start) / 86400000) + 1, 0);
}

function overlapConflict(records, season) {
  const managers = records.filter(record => !record.interim);
  for (let left = 0; left < managers.length; left++) for (let right = left + 1; right < managers.length; right++) {
    const [leftStart, leftEnd] = clippedInterval(managers[left], season);
    const [rightStart, rightEnd] = clippedInterval(managers[right], season);
    const days = Math.floor((Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart)) / 86400000) + 1;
    if (days > 7) return true;
  }
  return false;
}

function sameNames(left, right) {
  const a = new Set(left.map(item => canonical(preferredName(item.naam))));
  const b = new Set(right.map(item => canonical(preferredName(item.naam))));
  return a.size === b.size && [...a].every(name => b.has(name));
}

function sameRoles(left, right) {
  const roles = records => [...new Set(records.map(item => `${canonical(preferredName(item.naam))}|${Boolean(item.interim)}`))].sort().join('\n');
  return roles(left) === roles(right);
}

function selectMain(records, season, currentName) {
  const grouped = new Map();
  for (const record of records.filter(item => !item.interim)) {
    const name = preferredName(record.naam);
    const key = canonical(name);
    const item = grouped.get(key) || { name, transfermarkt_id: record.transfermarkt_id, days: 0 };
    item.days += overlapDays(record, season);
    grouped.set(key, item);
  }
  const ranked = [...grouped.values()].sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));
  if (!ranked.length) return null;
  const tied = ranked.filter(item => item.days === ranked[0].days);
  return tied.find(item => canonical(item.name) === canonical(currentName)) || ranked[0];
}

if (!fs.existsSync(EVIDENCE)) {
  if (!fs.existsSync(REPORT)) throw new Error(`Transfermarkt-rapport ontbreekt: ${REPORT}`);
  const cached = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
  const evidence = { bron_momentopname: '2026-09-28', clubs: cached.resultaten.map(club => {
    const records = new Map(club.seizoenen.flatMap(season => season.kandidaten).map(item => [[item.transfermarkt_id, item.van, item.tot, item.interim].join('|'), item]));
    return { club: club.seizoenen[0].club, naam: club.club, records: [...records.values()] };
  }) };
  fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}
const evidence = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'));
const checkedSeasons = Array.from({ length: 70 }, (_, index) => { const year = 1955 + index; return `${year}/${String((year + 1) % 100).padStart(2, '0')}`; });
const report = { resultaten: evidence.clubs.map(club => ({ seizoenen: checkedSeasons.map(seizoen => ({ club: club.club, seizoen, kandidaten: club.records.filter(item => overlapsSeason(item, seizoen)) })) })) };
// Een vaste nulmeting maakt opnieuw genereren onafhankelijk van de toegepaste import.
const baselineRef = '68079f10751d3031159dafd441b6dd0c81e28f7d';
const baseline = file => JSON.parse(execFileSync('git', ['show', `${baselineRef}:${file}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
const snapshot = baseline('data/snapshot.json');
const fallback = baseline('data/trainers_seizoen.json').seizoenen;
const previousImport = baseline('data/import_transfermarkt_compleet.json');
const clubConfig = JSON.parse(fs.readFileSync(path.join(HERE, 'transfermarkt_clubs.json'), 'utf8')).clubs;

const clubs = new Map(snapshot.clubs.map(club => [club.id, club]));
const coaches = new Map(snapshot.coaches.map(coach => [canonical(preferredName(coach.naam)), coach]));
const seasons = new Map(snapshot.seizoenen.map(season => [keyOf(season.club, season.seizoen), season]));
const fallbackRows = new Map(fallback.map(row => [keyOf(row.club, row.seizoen), row]));
const configs = new Map(clubConfig.map(club => [club.club, club]));
const manualCorrections = JSON.parse(fs.readFileSync(path.join(HERE, 'correcties.json'), 'utf8')).correcties;
const changes = [];
const unresolved = [];
const skippedIncomplete = [];
const preservedInterims = [];
const preservedRecords = [];

for (const source of report.resultaten.flatMap(club => club.seizoenen)) {
  if (!source.kandidaten.length) continue;
  const season = seasons.get(keyOf(source.club, source.seizoen));
  const club = clubs.get(source.club);
  const config = configs.get(source.club);
  if (!season || !club || !config) continue;
  const currentCoach = snapshot.coaches.find(coach => coach.id === season.coachId);
  const currentTrainers = fallbackRows.get(keyOf(source.club, source.seizoen))?.trainers || season.trainers_seizoen || [];
  // Een bestaande expliciete interimmarkering weegt zwaarder dan rolcode 1.
  // Transfermarkt gebruikt die rolcode ook voor tijdelijke hoofdtrainers.
  const candidates = source.kandidaten.filter(item => item.wedstrijden !== 0).map(item => {
    const existing = currentTrainers.filter(old => canonical(preferredName(old.naam)) === canonical(preferredName(item.naam)))
      .sort((a, b) => Number(b.van === item.van && b.tot === item.tot) - Number(a.van === item.van && a.tot === item.tot)
        || Date.parse(b.van || '1900-01-01') - Date.parse(a.van || '1900-01-01'))[0];
    // De officiële clubgeschiedenis noemt Stevens hoofdtrainer, ook bij een
    // contract tot het einde van het seizoen (DFB en VfB, zie bronnenrapport).
    if (club.naam === 'VfB Stuttgart' && item.naam === 'Huub Stevens' && ['2013/14', '2014/15'].includes(source.seizoen)) return { ...item, interim: false };
    if (club.naam === 'Chelsea' && source.seizoen === '2012/13' && canonical(item.naam).startsWith('rafa')) return { ...item, interim: true };
    if (existing?.interim && !item.interim) {
      preservedInterims.push({ club: club.naam, seizoen: source.seizoen, naam: preferredName(item.naam) });
      return { ...item, interim: true };
    }
    return item;
  });
  // Expliciete, afzonderlijk onderbouwde toevoegingen blijven aanwezig als de
  // clubhistorie van Transfermarkt deze korte periodes overslaat.
  for (const correction of manualCorrections.filter(item => item.actie === 'voeg_toe' && item.clubNaam === club.naam && item.seizoen === source.seizoen)) {
    if (!candidates.some(item => canonical(item.naam) === canonical(correction.trainer.naam))) {
      const index = candidates.findIndex(item => canonical(item.naam) === canonical(correction.voor));
      candidates.splice(index < 0 ? candidates.length : index, 0, correction.trainer);
    }
  }
  let missingUncertain = false;
  for (const old of currentTrainers) {
    if (candidates.some(item => canonical(preferredName(item.naam)) === canonical(preferredName(old.naam)))) continue;
    const jointPeer = old.bron_omschrijving && currentTrainers.find(item => item.bron_omschrijving === old.bron_omschrijving && candidates.some(candidate => canonical(preferredName(candidate.naam)) === canonical(preferredName(item.naam))));
    const sourcePeer = jointPeer && candidates.find(item => canonical(preferredName(item.naam)) === canonical(preferredName(jointPeer.naam)));
    if ((old.van && overlapsSeason(old, source.seizoen)) || sourcePeer) {
      candidates.push(sourcePeer ? { ...sourcePeer, ...old } : old);
      preservedRecords.push({ club: club.naam, seizoen: source.seizoen, naam: old.naam, reden: sourcePeer ? 'gezamenlijke trainers uit bestaande bron' : 'exact gedateerde periode uit bestaande bron' });
    } else if (!old.van && currentTrainers.length > 1) {
      missingUncertain = true;
    }
  }
  if (missingUncertain) {
    skippedIncomplete.push({ club: club.naam, seizoen: source.seizoen, reden: 'bestaande seizoenstrainer ontbreekt in Transfermarkt; geen precieze datums om verwijdering te onderbouwen', behouden_hoofdtrainer: currentCoach?.naam || '' });
    continue;
  }
  const coverage = coverageDays(candidates, source.seizoen);
  const conflict = overlapConflict(candidates, source.seizoen);
  const bounds = seasonBounds(source.seizoen);
  const complete = coverage >= Math.ceil(((bounds.end - bounds.start) / 86400000 + 1) * 0.9);
  const main = selectMain(candidates, source.seizoen, currentCoach?.naam || '');
  if (!main) continue;

  // Een onvolledige of intern overlappende Transfermarkt-reeks vervangt geen
  // completere bestaande bron. Dat is een bronbeperking, geen gebruikerskeuze.
  if (!complete || conflict) {
    if (!sameNames(currentTrainers, candidates) || canonical(currentCoach?.naam) !== canonical(main.name)) {
      skippedIncomplete.push({ club: club.naam, seizoen: source.seizoen, reden: conflict ? 'overlappende Transfermarkt-periodes' : `slechts ${coverage} dagen gedekt`, behouden_hoofdtrainer: currentCoach?.naam || '' });
    }
    continue;
  }

  const top = candidates.filter(item => !item.interim).map(item => ({ item, days: overlapDays(item, source.seizoen) })).sort((a, b) => b.days - a.days);
  const exactTie = top[1] && top[0].days === top[1].days && canonical(preferredName(top[0].item.naam)) !== canonical(preferredName(top[1].item.naam));
  if (exactTie && !top.some(item => canonical(preferredName(item.item.naam)) === canonical(currentCoach?.naam) && item.days === top[0].days)) {
    unresolved.push({ club: club.naam, clubId: club.id, seizoen: source.seizoen, huidige_hoofdtrainer: currentCoach?.naam || '', kandidaten: top.filter(item => item.days === top[0].days).map(item => preferredName(item.item.naam)), reden: 'exact even lang volgens Transfermarkt' });
    continue;
  }

  const trainersChanged = !sameRoles(currentTrainers, candidates);
  const mainChanged = canonical(preferredName(currentCoach?.naam)) !== canonical(main.name);
  if (!trainersChanged && !mainChanged) continue;
  const known = coaches.get(canonical(main.name));
  const [nationaliteit = '', nat_code = ''] = known ? [known.nationaliteit || '', known.nat_code || ''] : (NEW_COACHES[main.name] || []);
  if (!known && !nationaliteit) {
    unresolved.push({ club: club.naam, clubId: club.id, seizoen: source.seizoen, huidige_hoofdtrainer: currentCoach?.naam || '', kandidaten: [main.name], reden: 'coachmetadata ontbreekt' });
    continue;
  }
  changes.push({
    club: club.naam,
    clubId: club.id,
    seizoen: source.seizoen,
    coach: known?.naam || main.name,
    coach_transfermarkt_id: main.transfermarkt_id,
    nationaliteit,
    nat_code,
    land: season.land || club.land,
    landstitel: season.landstitel || 'N',
    nationale_beker: season.nationale_beker || 'N',
    europese_prijs: season.europese_prijs || 'N',
    trainers_seizoen: candidates.map(({ naam, van, tot, interim, datum_precisie }) => ({ naam: preferredName(naam), van, tot, interim, datum_precisie })),
    trainers_bron: `https://www.transfermarkt.com/${config.slug}/mitarbeiterhistorie/verein/${config.transfermarkt_id}`,
    _audit: { trainersChanged, mainChanged, vorige_hoofdtrainer: currentCoach?.naam || '', vorige_trainers: currentTrainers.map(item => item.naam), dekking_dagen: coverage },
  });
}

const combined = new Map(previousImport.map(row => [keyOf(row.clubId, row.seizoen), row]));
for (const { _audit, ...row } of changes) combined.set(keyOf(row.clubId, row.seizoen), row);
const importRows = [...combined.values()].sort((a, b) => a.club.localeCompare(b.club) || a.seizoen.localeCompare(b.seizoen));
const audit = {
  gegenereerd_op: new Date().toISOString(),
  bron: 'Transfermarkt club staff history; records met expliciet 0 wedstrijden genegeerd',
  nulmeting_commit: baselineRef,
  bron_momentopname: '2026-09-28',
  importregels: importRows.length,
  bestaande_interimstatus_behouden: preservedInterims,
  bestaande_bronperiodes_behouden: preservedRecords,
  gecontroleerde_seizoenen: report.resultaten.flatMap(club => club.seizoenen).length,
  zonder_transfermarkt_data: report.resultaten.flatMap(club => club.seizoenen).filter(row => !row.kandidaten.length).length,
  correctierijen: changes.length,
  trainerlijsten_gewijzigd: changes.filter(row => row._audit.trainersChanged).length,
  trainerlijstcorrecties: changes.filter(row => row._audit.trainersChanged).map(row => ({ club: row.club, seizoen: row.seizoen, van: row._audit.vorige_trainers, naar: row.trainers_seizoen.map(item => `${item.naam}${item.interim ? ' (interim)' : ''}`) })),
  hoofdtrainers_gewijzigd: changes.filter(row => row._audit.mainChanged).map(row => ({ club: row.club, seizoen: row.seizoen, van: row._audit.vorige_hoofdtrainer, naar: row.coach })),
  niet_overgenomen_wegens_onvolledige_bron: skippedIncomplete,
  voorgelegd: unresolved,
};

const markdown = [
  '# Transfermarkt-correcties',
  '',
  'Vergelijking met de bronmomentopname van 28 september 2026 en de dataset van 2 oktober 2026. Geen nieuwe livecontrole van 2026/27.',
  '',
  'De selectie volgt de langste niet-interimperiode tussen 1 augustus en 20 mei, voor 2019/20 tot 31 augustus. Minimaal 90% van het venster moet gedekt zijn. Bestaande expliciete interimstatussen en eerder onderbouwde aanvullingen blijven behouden. Dit controleert namen, interimstatus en de hoofdtrainerkeuze; het bewijst niet dat iedere dag of korte waarneming volledig is geregistreerd.',
  '',
  'Aanvullende rolcontrole: [Chelsea bevestigt Benítez als interim in 2012/13](https://www.chelseafc.com/en/news/article/no-happy-returns---chelsea-s-ex-managers-at-the-bridge); [DFB vermeldt Stevens als trainer in 2014/15](https://datencenter.dfb.de/competitions/bundesliga/seasons/2014-2015/teams/vfb-stuttgart); [VfB noemt hem hoofdtrainer in 2013/14](https://www.vfb.de/de/vfb/aktuell/news-archiv/2014/299072-danke-huub-stevens-/); [Polzin werd op 22 december 2024 definitief benoemd](https://www.bundesliga.com/de/2bundesliga/news/hamburger-sv-trainer-merlin-polzin-bleibt-cheftrainer-30204). Zijn tijdelijke en vaste periode blijven apart.',
  '',
  `Gecontroleerd: ${audit.gecontroleerde_seizoenen} clubseizoenen. Doorgevoerd: ${audit.correctierijen} historische correctierijen, waarvan ${audit.trainerlijsten_gewijzigd} trainerlijstcorrecties en ${audit.hoofdtrainers_gewijzigd.length} wijzigingen van hoofdtrainer.`,
  '',
  `Voor ${audit.zonder_transfermarkt_data} clubseizoenen bevat de bron geen periodes. Die blijven ongewijzigd. De ontbrekende dekking betreft onder andere jaren vóór de oprichting of de voorganger van een club.`,
  '',
  '## Hoofdtrainer gewijzigd',
  '',
  ...audit.hoofdtrainers_gewijzigd.map(row => `- ${row.club} ${row.seizoen}: ${row.van} → ${row.naar}`),
  '',
  '## Trainerlijst gewijzigd of toegevoegd',
  '',
  ...audit.trainerlijstcorrecties.map(row => `- ${row.club} ${row.seizoen}: ${row.van.length ? row.van.join(', ') : '(ontbrak)'} → ${row.naar.join(', ')}`),
  '',
  '## Niet overschreven',
  '',
  'Deze Transfermarkt-reeksen waren onvolledig of bevatten overlappende niet-interimperiodes. De completere bestaande bron bleef daarom staan.',
  '',
  ...audit.niet_overgenomen_wegens_onvolledige_bron.map(row => `- ${row.club} ${row.seizoen}: ${row.reden}; behouden: ${row.behouden_hoofdtrainer}`),
  '',
  '## Nog voor te leggen',
  '',
  ...(audit.voorgelegd.length ? audit.voorgelegd.map(row => `- ${row.club} ${row.seizoen}: ${row.reden} (${row.kandidaten.join(' / ')})`) : ['Geen.']),
  '',
].map(line => line.trimEnd()).join('\n');

fs.writeFileSync(OUTPUT, `${JSON.stringify(importRows, null, 2)}\n`, 'utf8');
fs.writeFileSync(AUDIT, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
fs.writeFileSync(AUDIT_MARKDOWN, markdown, 'utf8');
fs.writeFileSync(DOUBTS, `${JSON.stringify({ twijfel: unresolved }, null, 2)}\n`, 'utf8');
console.log(`${changes.length} historische correctierijen; ${audit.hoofdtrainers_gewijzigd.length} hoofdtrainerwijzigingen; ${unresolved.length} echte twijfelgevallen; ${skippedIncomplete.length} onvolledige bronreeksen behouden`);
