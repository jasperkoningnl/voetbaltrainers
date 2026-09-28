import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(here, '..', 'trainers_seizoen.json'), 'utf8')).seizoenen;
const legacyDataDir = path.resolve(here, '..');
const countryFiles = ['england', 'spain', 'italy', 'germany', 'france', 'netherlands', 'portugal'];
const snapshot = JSON.parse(fs.readFileSync(path.join(legacyDataDir, 'snapshot.json'), 'utf8'));

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

test('per land en seizoen staat hoogstens één landskampioen gemarkeerd', () => {
  for (const country of countryFiles) {
    const seasons = JSON.parse(fs.readFileSync(path.join(legacyDataDir, `${country}.json`), 'utf8'));
    const champions = new Map();
    for (const row of seasons) {
      assert.match(row.landstitel, /^[YN]$/, `${country} ${row.seizoen}: ongeldige landstitel`);
      if (row.landstitel !== 'Y') continue;
      const clubs = champions.get(row.seizoen) || [];
      clubs.push(row.club);
      champions.set(row.seizoen, clubs);
    }
    for (const [season, clubs] of champions) {
      assert.ok(clubs.length <= 1, `${country} ${season}: meerdere landskampioenen (${clubs.join(', ')})`);
    }
  }
});

test('gecorrigeerde landskampioenen van 2024/25 zijn vastgelegd', () => {
  const england = JSON.parse(fs.readFileSync(path.join(legacyDataDir, 'england.json'), 'utf8'));
  const italy = JSON.parse(fs.readFileSync(path.join(legacyDataDir, 'italy.json'), 'utf8'));
  const title = (rows, club) => rows.find(row => row.club === club && row.seizoen === '2024/25')?.landstitel;

  assert.equal(title(england, 'Liverpool'), 'Y');
  assert.equal(title(england, 'Manchester City'), 'N');
  assert.equal(title(italy, 'Napoli'), 'Y');

  const clubNames = new Map(snapshot.clubs.map(club => [club.id, club.naam]));
  const snapshotTitle = club => snapshot.seizoenen.find(row => clubNames.get(row.club) === club && row.seizoen === '2024/25')?.landstitel;
  assert.equal(snapshotTitle('Liverpool'), 'Y');
  assert.equal(snapshotTitle('Manchester City'), 'N');
  assert.equal(snapshotTitle('Napoli'), 'Y');
});

