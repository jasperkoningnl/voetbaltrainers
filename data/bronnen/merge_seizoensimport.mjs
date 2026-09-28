import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function canonical(value) {
  return String(value || '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^\p{Letter}\p{Number}]+/gu, ' ').trim().toLocaleLowerCase('nl');
}

export function mergeSeasonImport(collections, rows, { overwriteExisting = false } = {}) {
  const clubs = new Map(collections.clubs.map(club => [club.id, club]));
  const coaches = new Map(collections.coaches.map(coach => [canonical(coach.naam), coach]));
  const seasons = new Map(collections.seizoenen.map(season => [`${season.club}|${season.seizoen}`, season]));

  for (const row of rows) {
    if (!clubs.has(row.clubId)) throw new Error(`Onbekende club in seizoensimport: ${row.clubId}`);
    let coach = coaches.get(canonical(row.coach));
    if (!coach) {
      coach = {
        id: `tm-${row.coach_transfermarkt_id}`,
        foto_url: '',
        naam: row.coach,
        nat_code: row.nat_code || '',
        nationaliteit: row.nationaliteit || '',
      };
      collections.coaches.push(coach);
      coaches.set(canonical(coach.naam), coach);
    }
    const key = `${row.clubId}|${row.seizoen}`;
    const existing = seasons.get(key);
    if (existing) {
      if (existing.id.startsWith('tm-') || overwriteExisting) {
        Object.assign(existing, {
          coachId: coach.id,
          europese_prijs: row.europese_prijs,
          land: row.land,
          landstitel: row.landstitel,
          nationale_beker: row.nationale_beker,
          trainers_bron: row.trainers_bron,
          trainers_seizoen: row.trainers_seizoen,
        });
        continue;
      }
      if (!Array.isArray(existing.trainers_seizoen)) existing.trainers_seizoen = row.trainers_seizoen;
      if (!existing.trainers_bron) existing.trainers_bron = row.trainers_bron;
      continue;
    }
    const season = {
      id: `tm-${row.seizoen.replace('/', '-')}-${row.clubId}`,
      club: row.clubId,
      coachId: coach.id,
      europese_prijs: row.europese_prijs,
      land: row.land,
      landstitel: row.landstitel,
      nationale_beker: row.nationale_beker,
      seizoen: row.seizoen,
      trainers_bron: row.trainers_bron,
      trainers_seizoen: row.trainers_seizoen,
    };
    collections.seizoenen.push(season);
    seasons.set(key, season);
  }

  const referencedCoaches = new Set(collections.seizoenen.map(season => season.coachId));
  collections.coaches = collections.coaches.filter(coach => !coach.id.startsWith('tm-') || referencedCoaches.has(coach.id));

  const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  collections.coaches.sort(byId);
  collections.seizoenen.sort(byId);
  return collections;
}

export function mergeTrainerFallback(document, rows) {
  const seasons = new Map(document.seizoenen.map(row => [`${row.club}|${row.seizoen}`, row]));
  for (const row of rows) {
    const key = `${row.clubId}|${row.seizoen}`;
    if (seasons.has(key)) {
      Object.assign(seasons.get(key), { trainers: row.trainers_seizoen, bron: row.trainers_bron });
      continue;
    }
    const season = {
      club: row.clubId,
      seizoen: row.seizoen,
      trainers: row.trainers_seizoen,
      bron: row.trainers_bron,
    };
    document.seizoenen.push(season);
    seasons.set(key, season);
  }
  return document;
}

function format(snapshot) {
  const parts = [`"generated": ${JSON.stringify(snapshot.generated)}`];
  for (const name of ['clubs', 'coaches', 'seizoenen']) {
    parts.push(`"${name}": [\n${snapshot[name].map(item => JSON.stringify(item)).join(',\n')}\n]`);
  }
  return `{\n${parts.join(',\n')}\n}\n`;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const snapshotPath = process.argv[2] || 'data/snapshot.json';
  const importPath = process.argv[3] || 'data/import_transfermarkt_compleet.json';
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const rows = JSON.parse(fs.readFileSync(importPath, 'utf8'));
  mergeSeasonImport(snapshot, rows, { overwriteExisting: true });
  snapshot.generated = new Date().toISOString();
  fs.writeFileSync(snapshotPath, format(snapshot), 'utf8');
  const fallbackPath = 'data/trainers_seizoen.json';
  if (fs.existsSync(fallbackPath)) {
    const fallback = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
    mergeTrainerFallback(fallback, rows);
    fs.writeFileSync(fallbackPath, `${JSON.stringify(fallback, null, 1)}\n`, 'utf8');
  }
  console.log(`${rows.length} aanvullingen verwerkt in ${snapshotPath}`);
}
