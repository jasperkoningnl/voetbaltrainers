import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.dirname(HERE);

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Zet een samengestelde bronomschrijving om naar afzonderlijke trainers.
 * Alleen expliciete technische directeuren, gemarkeerd met (DT), vallen af.
 */
export function splitTrainerEntry(rawName) {
  const original = clean(rawName);
  const parts = original
    .split(/\s*(?:,|&|\bet\b|\ben\b|\band\b|\be\b)\s*/iu)
    .map(clean)
    .filter(Boolean);

  return parts
    .filter(part => !/\(DT\)\s*$/iu.test(part))
    .map(part => ({
      naam: clean(part.replace(/\s*\(DT\)\s*$/iu, '')),
      ...(parts.length > 1 && !/\(DT\)/iu.test(original) ? { bron_omschrijving: original } : {}),
    }));
}

function readSourceMetadata() {
  const byUrl = new Map();
  for (const file of fs.readdirSync(HERE).filter(name => name.endsWith('.txt'))) {
    const lines = fs.readFileSync(path.join(HERE, file), 'utf8').split(/\r?\n/);
    const meta = {};
    for (const line of lines) {
      const match = line.match(/^#([^ ]+)\s+(.+)$/u);
      if (match) meta[match[1]] = match[2].trim();
    }
    if (meta.src) byUrl.set(meta.src, {
      clubNaam: path.basename(file, '.txt'),
      type: meta.type || 'stint',
      datePrecision: meta.date_precision || (meta.type === 'season' ? 'seizoen' : 'dag'),
      revision: meta.src_revision || null,
    });
  }
  return byUrl;
}

function normalizeTrainer(trainer, meta) {
  const people = splitTrainerEntry(trainer.naam);
  const base = { ...trainer };
  if (/\(DT\)/iu.test(base.bron_omschrijving || '')) delete base.bron_omschrijving;
  return people.map(person => ({
    ...base,
    ...person,
    naam: person.naam,
    ...(trainer.van ? { van: trainer.van } : {}),
    ...(trainer.tot ? { tot: trainer.tot } : {}),
    interim: Boolean(trainer.interim),
    datum_precisie: trainer.datum_precisie || meta?.datePrecision || 'onbekend',
  }));
}

function applyCorrections(rows, corrections, sourceMeta) {
  const clubIdBySource = new Map(rows.map(row => [row.bron, row.club]));
  for (const correction of corrections) {
    if (correction.actie !== 'voeg_toe') continue;
    const club = clubIdBySource.get(correction.bron);
    const row = rows.find(item => item.club === club && item.seizoen === correction.seizoen);
    if (!row) throw new Error(`Correctie verwijst naar onbekend seizoen: ${correction.clubNaam} ${correction.seizoen}`);
    const existingIndex = row.trainers.findIndex(trainer => trainer.naam === correction.trainer.naam);
    const existing = existingIndex >= 0 ? row.trainers.splice(existingIndex, 1)[0] : {};
    const trainer = {
      ...existing,
      ...correction.trainer,
      datum_precisie: correction.trainer.datum_precisie || 'onbekend',
    };
    const beforeIndex = correction.voor
      ? row.trainers.findIndex(item => item.naam === correction.voor)
      : -1;
    if (beforeIndex >= 0) row.trainers.splice(beforeIndex, 0, trainer);
    else row.trainers.push(trainer);
    if (correction.bron_revision) row.bron_revision = correction.bron_revision;
    if (sourceMeta.get(correction.bron)) sourceMeta.get(correction.bron).revision ||= correction.bron_revision || null;
  }
}

function normalizeCases(cases, sourceMeta, corrections) {
  const normalized = cases.map(item => {
    const meta = sourceMeta.get(item.bron);
    const kandidaten = item.kandidaten.flatMap(candidate => normalizeTrainer(candidate, meta));
    const soort = item.soort === 'langst' && meta?.datePrecision !== 'dag' ? 'langst_schatting' : item.soort;
    return {
      ...item,
      soort,
      kandidaten,
      ...(meta?.revision ? { bron_revision: meta.revision } : {}),
    };
  });
  for (const correction of corrections) {
    const item = normalized.find(candidate => candidate.clubNaam === correction.clubNaam && candidate.seizoen === correction.seizoen);
    if (!item || item.kandidaten.some(candidate => candidate.naam === correction.trainer.naam)) continue;
    const trainer = { ...correction.trainer, datum_precisie: correction.trainer.datum_precisie || 'onbekend' };
    const beforeIndex = correction.voor
      ? item.kandidaten.findIndex(candidate => candidate.naam === correction.voor)
      : -1;
    if (beforeIndex >= 0) item.kandidaten.splice(beforeIndex, 0, trainer);
    else item.kandidaten.push(trainer);
    if (correction.bron_revision) item.bron_revision = correction.bron_revision;
  }
  return normalized;
}

export function normalizeDataset({ seasons, cases, corrections, sourceMeta }) {
  const rows = seasons.map(row => {
    const meta = sourceMeta.get(row.bron);
    return {
      ...row,
      trainers: row.trainers.flatMap(trainer => normalizeTrainer(trainer, meta)),
      ...(meta?.revision ? { bron_revision: meta.revision } : {}),
    };
  });
  applyCorrections(rows, corrections, sourceMeta);
  return { seasons: rows, cases: normalizeCases(cases, sourceMeta, corrections) };
}

function validate(rows) {
  const keys = new Set();
  const errors = [];
  for (const row of rows) {
    const key = `${row.club}|${row.seizoen}`;
    if (keys.has(key)) errors.push(`Dubbel clubseizoen: ${key}`);
    keys.add(key);
    if (!row.trainers.length) errors.push(`Geen trainer na normalisatie: ${key}`);
    for (const trainer of row.trainers) {
      if (!trainer.naam) errors.push(`Lege trainernaam: ${key}`);
      if (/\(DT\)/iu.test(trainer.naam)) errors.push(`Technisch directeur niet verwijderd: ${trainer.naam}`);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
}

function main() {
  const sourceMeta = readSourceMetadata();
  const seasonsPath = path.join(DATA_DIR, 'trainers_seizoen.json');
  const casesPath = path.join(DATA_DIR, 'twijfelgevallen.json');
  const correctionsPath = path.join(HERE, 'correcties.json');
  const seasons = JSON.parse(fs.readFileSync(seasonsPath, 'utf8')).seizoenen;
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8')).twijfel;
  const corrections = JSON.parse(fs.readFileSync(correctionsPath, 'utf8')).correcties;
  const normalized = normalizeDataset({ seasons, cases, corrections, sourceMeta });
  validate(normalized.seasons);

  fs.writeFileSync(seasonsPath, `${JSON.stringify({ seizoenen: normalized.seasons }, null, 1)}\n`, 'utf8');
  fs.writeFileSync(casesPath, `${JSON.stringify({ twijfel: normalized.cases }, null, 1)}\n`, 'utf8');

  const managerCounts = normalized.seasons.map(row => new Set(row.trainers.map(t => t.naam)).size);
  const report = {
    gegenereerd_op: new Date().toISOString(),
    clubseizoenen: normalized.seasons.length,
    clubs: new Set(normalized.seasons.map(row => row.club)).size,
    seizoenen_met_meerdere_trainers: managerCounts.filter(n => n > 1).length,
    twijfelgevallen: normalized.cases.length,
    twijfelgevallen_met_geschatte_datums: normalized.cases.filter(item => item.soort === 'langst_schatting').length,
    bronnen_zonder_vaste_revisie: [...sourceMeta.values()].filter(meta => !meta.revision).map(meta => meta.clubNaam),
  };
  fs.writeFileSync(path.join(DATA_DIR, 'normalisatie_rapport.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();

