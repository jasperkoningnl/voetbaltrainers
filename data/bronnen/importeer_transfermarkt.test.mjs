import test from 'node:test';
import assert from 'node:assert/strict';
import { overlapsSeason, parseStaffHistory } from './importeer_transfermarkt.mjs';

const role = { role: 'caretaker_manager', interim: true };
const source = 'https://www.transfermarkt.com/ajax-amsterdam/mitarbeiterhistorie/verein/610/personalie_id/10/plus/1';
const fixture = `
<table><tbody>
<tr class="odd">
<td><table class=inline-table><tr><td rowspan=2><a href="/fred-grim/profil/trainer/17475"><img /></a></td><td class=hauptlink><a title="Fred Grim" id="17475" href="/fred-grim/profil/trainer/17475">Fred Grim</a></td></tr><tr><td>17/08/1965</td></tr></table></td><td class="zentriert"><img title="Netherlands" /></td><td class="zentriert">06/11/2025</td><td class="zentriert">08/03/2026</td><td class="rechts">04 months 02 days</td><td class="zentriert">21</td></tr>
</tbody></table>`;

test('leest een interim-trainer met exacte datums', () => {
  assert.deepEqual(parseStaffHistory(fixture, role, source), [{
    transfermarkt_id: '17475',
    naam: 'Fred Grim',
    rol: 'caretaker_manager',
    interim: true,
    van: '2025-11-06',
    tot: '2026-03-08',
    profiel: 'https://www.transfermarkt.com/fred-grim/profil/trainer/17475',
    bron: source,
    datum_precisie: 'dag',
  }]);
});

test('een geldige rol zonder benoemingen levert een lege lijst op', () => {
  assert.deepEqual(parseStaffHistory('<table><tbody></tbody></table>', role, source), []);
});

test('een benoeming in juni telt vanaf het volgende seizoen', () => {
  const record = { van: '2025-06-09', tot: null };
  assert.equal(overlapsSeason(record, '2024/25'), false);
  assert.equal(overlapsSeason(record, '2025/26'), true);
});
