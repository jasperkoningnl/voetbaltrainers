import assert from 'node:assert/strict';
import test from 'node:test';
import { splitTrainerEntry } from './normaliseer_trainers.mjs';

test('splitst twee gezamenlijke trainers', () => {
  assert.deepEqual(splitTrainerEntry('Pierre Repellini et Robert Herbin').map(x => x.naam), [
    'Pierre Repellini',
    'Robert Herbin',
  ]);
});

test('splitst een komma- en en-lijst', () => {
  assert.deepEqual(splitTrainerEntry('Tonny Bruins Slot, Spitz Kohn en Cor van der Hart').map(x => x.naam), [
    'Tonny Bruins Slot',
    'Spitz Kohn',
    'Cor van der Hart',
  ]);
});

test('verwijdert alleen de expliciet gemarkeerde technisch directeur', () => {
  assert.deepEqual(splitTrainerEntry('Giorgio Morini & Óscar Tabárez (DT)').map(x => x.naam), ['Giorgio Morini']);
  assert.deepEqual(splitTrainerEntry('Vujadin Boškov (DT) & Cané').map(x => x.naam), ['Cané']);
});

test('verwijdert een losse technisch directeur', () => {
  assert.deepEqual(splitTrainerEntry('Nereo Rocco (DT)'), []);
});

