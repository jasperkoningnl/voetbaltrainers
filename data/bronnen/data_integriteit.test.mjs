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
const completeImport = JSON.parse(fs.readFileSync(path.join(legacyDataDir, 'import_transfermarkt_compleet.json'), 'utf8'));
const doubts = JSON.parse(fs.readFileSync(path.join(legacyDataDir, 'twijfelgevallen.json'), 'utf8')).twijfel;

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
  const clubId = snapshot.clubs.find(club => club.naam === 'AS Saint-Étienne')?.id;
  const expected = new Map([
    ['1995/96', 'Maxime Bossis'],
    ['2000/01', 'Gérard Soler'],
    ['2023/24', 'Laurent Huard'],
    ['2024/25', 'Laurent Huard'],
  ]);
  for (const [season, name] of expected) {
    const row = data.find(item => item.club === clubId && item.seizoen === season);
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

test('2025/26 bevat alle 35 clubs en de gecontroleerde prijzen', () => {
  const clubNames = new Map(snapshot.clubs.map(club => [club.id, club.naam]));
  const rows = snapshot.seizoenen.filter(row => row.seizoen === '2025/26');
  assert.equal(rows.length, 35);
  assert.equal(new Set(rows.map(row => row.club)).size, 35);
  assert.ok(rows.every(row => Array.isArray(row.trainers_seizoen) && row.trainers_seizoen.length > 0));

  const winners = field => rows.filter(row => row[field] === 'Y').map(row => clubNames.get(row.club)).sort();
  assert.deepEqual(winners('landstitel'), ['Arsenal', 'Bayern München', 'FC Barcelona', 'FC Porto', 'Internazionale', 'PSV', 'Paris Saint-Germain'].sort());
  assert.deepEqual(winners('nationale_beker'), ['AZ', 'Bayern München', 'Internazionale', 'Manchester City'].sort());
  assert.deepEqual(winners('europese_prijs'), ['Paris Saint-Germain']);
});

test('de complete Transfermarkt-import bevat alle gecontroleerde rijen zonder dubbelen', () => {
  assert.equal(completeImport.length, 101);
  const keys = completeImport.map(row => `${row.clubId}|${row.seizoen}`);
  assert.equal(new Set(keys).size, completeImport.length);
  assert.ok(completeImport.every(row => row.trainers_bron.includes('transfermarkt.com/')));
  assert.ok(completeImport.every(row => row.trainers_seizoen.every(trainer => !trainer.naam.includes('(DT)'))));
});

test('Ajax 2025/26 heeft Heitinga als hoofdtrainer en Grim alleen als interim', () => {
  const ajax = completeImport.find(row => row.clubId === 'Ajax' && row.seizoen === '2025/26');
  assert.equal(ajax.coach, 'John Heitinga');
  assert.equal(ajax.trainers_seizoen.find(trainer => trainer.naam === 'Fred Grim')?.interim, true);
});

test('alle eerder gemarkeerde twijfelgevallen zijn opgelost', () => {
  assert.deepEqual(doubts, []);
});

test('nieuwe hoofdtrainers hebben een bewerkbaar coachprofiel in de snapshot', () => {
  const coachNames = new Set(snapshot.coaches.map(coach => coach.naam));
  for (const row of completeImport) assert.ok(coachNames.has(row.coach), `${row.coach} ontbreekt als coachprofiel`);
  assert.ok(coachNames.has('Cristian Chivu'));
});

