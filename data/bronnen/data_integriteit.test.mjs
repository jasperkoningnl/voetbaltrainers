import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(here, '..', 'trainers_seizoen.json'), 'utf8')).seizoenen;

test('ieder clubseizoen komt één keer voor', () => {
  const keys = data.map(row => `${row.club}|${row.seizoen}`);
  assert.equal(new Set(keys).size, keys.length);
});

test('alle trainerwaarden bevatten precies één persoon', () => {
  for (const row of data) for (const trainer of row.trainers) {
    assert.ok(trainer.naam);
    assert.doesNotMatch(trainer.naam, /\(DT\)/iu);
    assert.doesNotMatch(trainer.bron_omschrijving || '', /\(DT\)/iu);
    assert.doesNotMatch(trainer.naam, /\s(?:&|et|en|and|e)\s|,/iu);
    assert.ok(trainer.datum_precisie);
  }
});

test('geverifieerde aanvullingen van Saint-Étienne staan in de juiste seizoenen', () => {
  const source = 'https://fr.wikipedia.org/wiki/Liste_des_entra%C3%AEneurs_de_l%27AS_Saint-%C3%89tienne';
  const expected = new Map([
    ['1995/96', 'Maxime Bossis'],
    ['2000/01', 'Gérard Soler'],
    ['2023/24', 'Laurent Huard'],
    ['2024/25', 'Laurent Huard'],
  ]);
  for (const [season, name] of expected) {
    const row = data.find(item => item.bron === source && item.seizoen === season);
    assert.ok(row?.trainers.some(trainer => trainer.naam === name), `${name} ontbreekt in ${season}`);
  }
});

