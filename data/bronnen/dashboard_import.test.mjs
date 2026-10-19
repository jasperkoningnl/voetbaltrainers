import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('de dashboardimport schrijft grote imports in beperkte batches en hergebruikt seizoenen', async () => {
  const html = fs.readFileSync(new URL('../../dashboard.html', import.meta.url), 'utf8');
  const start = html.indexOf('const handleImportData = async () => {');
  const end = html.indexOf('const uniqueClubs = useMemo', start);
  assert.ok(start >= 0 && end > start);
  const rows = Array.from({ length: 850 }, (_, index) => ({ club: 'Ajax', coach: 'Testcoach', seizoen: String(index) }));
  const existingRef = { id: 'existing-season', kind: 'seizoenen' };
  const collections = {
    clubs: [{ id: 'Ajax', data: () => ({ naam: 'Ajax' }) }],
    coaches: [],
    seizoenen: [{ ref: existingRef, data: () => ({ club: 'Ajax', seizoen: '0' }) }],
  };
  const commits = [];
  let nextId = 0;
  let error = '';
  let completed = false;
  const noop = () => {};
  const mocks = {
    setIsLoading: noop, setError: value => { error = value; }, setStatus: noop,
    getDocs: async name => ({ docs: collections[name] }),
    collection: (_db, name) => name, db: {},
    writeBatch: () => {
      const entries = [];
      return { set: (ref, data) => entries.push({ ref, data }), commit: async () => { commits.push(entries); } };
    },
    doc: kind => ({ kind, id: `new-${++nextId}` }),
    processedData: rows, clubLogos: {}, alert: noop,
    onUpdateAll: () => { completed = true; }, resetWizard: noop,
  };
  const run = new Function(...Object.keys(mocks), `${html.slice(start, end)}; return handleImportData();`);
  await run(...Object.values(mocks));
  assert.equal(error, '');
  assert.equal(completed, true);
  assert.deepEqual(commits.map(batch => batch.length), [1, 400, 400, 50]);
  assert.equal(commits[0][0].ref.kind, 'coaches');
  assert.equal(commits[1][0].ref, existingRef);
  assert.equal(commits.slice(1).flat().length, rows.length);
});
