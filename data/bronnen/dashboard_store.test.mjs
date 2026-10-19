import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRepositoryStore, validateDataset } from '../../dashboard-store.mjs';

const fixture = () => ({ generated: '2026-10-19T00:00:00Z', clubs: [{ id: 'club', naam: 'Atlético', land: 'Spain' }], coaches: [{ id: 'coach', naam: 'José', foto_url: 'https://example.com/photo.jpg', nationaliteit: 'Spanish' }], seizoenen: [{ id: 'season', club: 'club', coachId: 'coach', seizoen: '2025/26', land: 'Spain', landstitel: 'N', nationale_beker: 'N', europese_prijs: 'N' }] });
function harness() {
    let remote = fixture(), sha = 'original', mode = '', fail = false;
    const calls = [];
    const fetcher = async (url, options) => {
        calls.push({ url, ...options });
        const reply = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(data) });
        if (options.method === 'PUT') {
            const body = JSON.parse(options.body);
            if (fail) return reply(403, {});
            if (body.sha !== sha) return reply(409, {});
            remote = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
            sha = 'updated';
            return reply(200, { content: { sha }, commit: { html_url: 'https://github.com/test/repo/commit/updated' } });
        }
        if (url.includes('/contents/')) return reply(200, mode === 'large' ? { sha, encoding: 'none', content: '' } : { sha, encoding: 'base64', content: Buffer.from(JSON.stringify(remote)).toString('base64') });
        if (url.includes('/git/blobs/')) return reply(200, { sha, encoding: 'base64', content: Buffer.from(JSON.stringify(remote)).toString('base64') });
        return reply(200, { permissions: { push: mode !== 'readonly' } });
    };
    const store = createRepositoryStore({ fetcher, clock: () => '2026-10-20T00:00:00Z' });
    return { store, calls, get remote() { return remote; }, concurrent: () => { sha = 'someone-else'; remote.coaches[0].naam = 'Ander'; }, mode: value => { mode = value; }, fail: () => { fail = true; } };
}

test('club, coach en seizoen wijzigen blijft een concept tot één bevestigde GitHub-commit', async () => {
    const h = harness(), s = h.store;
    await s.load();
    await s.updateDoc(s.doc(s.db, 'coaches', 'coach'), { naam: 'João', foto_maker: 'Één fotograaf' });
    await s.updateDoc(s.doc(s.db, 'seizoenen', 'season'), { landstitel: 'Y' });
    assert.equal(h.calls.filter(c => c.method === 'PUT').length, 0);
    assert.equal(h.remote.coaches[0].naam, 'José');
    assert.equal(s.state().changes.length, 2);
    await s.connect('test-token');
    await s.publish('Twee gecontroleerde wijzigingen');
    assert.equal(h.calls.filter(c => c.method === 'PUT').length, 1);
    assert.equal(h.remote.coaches[0].naam, 'João');
    assert.equal(h.remote.coaches[0].foto_url, 'https://example.com/photo.jpg');
    assert.equal(h.remote.seizoenen[0].landstitel, 'Y');
    assert.equal(h.remote.generated, '2026-10-20T00:00:00Z');
    assert.equal(s.state().changes.length, 0);
});

test('een wijziging door een andere editor wordt niet overschreven en het concept blijft behouden', async () => {
    const h = harness(), s = h.store;
    await s.connect('test-token');
    await s.updateDoc(s.doc(s.db, 'coaches', 'coach'), { naam: 'Mijn concept' });
    h.concurrent();
    await assert.rejects(s.publish('Test'), /intussen gewijzigd/);
    assert.equal(h.remote.coaches[0].naam, 'Ander');
    assert.equal(JSON.parse(s.exportDraft()).coaches[0].naam, 'Mijn concept');
    assert.equal(s.state().changes.length, 1);
    assert.equal(s.state().busy, false);
});

test('een geweigerde opslag wordt niet als succes gemeld en het token komt niet in export of status', async () => {
    const h = harness(), s = h.store;
    await s.connect('private-test-token');
    await s.updateDoc(s.doc(s.db, 'clubs', 'club'), { naam: 'Nieuwe clubnaam' });
    h.fail();
    await assert.rejects(s.publish('Test'), /weigert toegang/);
    assert.equal(s.state().lastCommit, null);
    assert.equal(s.state().changes.length, 1);
    assert.ok(!s.exportDraft().includes('private-test-token'));
    assert.ok(!JSON.stringify(s.state()).includes('private-test-token'));
    s.disconnect();
    await assert.rejects(s.publish('Test'), /Verbind eerst/);
});

test('bulkimport en verwijderen gebruiken dezelfde werkset zonder GitHub-tussencommits', async () => {
    const h = harness(), s = h.store;
    await s.load();
    const b = s.writeBatch(s.db), coach = s.doc(s.collection(s.db, 'coaches'));
    b.set(coach, { naam: 'Nieuwe trainer' });
    b.update(s.doc(s.db, 'seizoenen', 'season'), { coachId: coach.id });
    b.delete(s.doc(s.db, 'coaches', 'coach'));
    await b.commit();
    const snap = await s.getDocs(s.query(s.collection(s.db, 'seizoenen'), s.where('coachId', 'in', [coach.id])));
    assert.equal(snap.size, 1);
    assert.equal(snap.empty, false);
    assert.equal(snap.docs[0].ref.id, 'season');
    await s.connect('test-token');
    await s.publish('Trainer vervangen');
    assert.equal(h.remote.coaches.length, 1);
    assert.equal(h.remote.coaches[0].id, coach.id);
});

test('velden verwijderen, terugdraaien en grote GitHub-bestanden blijven ondersteund', async () => {
    const h = harness(), s = h.store; h.mode('large');
    await s.load();
    assert.ok(h.calls.some(c => c.url.includes('/git/blobs/')));
    await s.updateDoc(s.doc(s.db, 'coaches', 'coach'), { foto_url: s.deleteField() });
    assert.equal((await s.getDoc(s.doc(s.db, 'coaches', 'coach'))).data().foto_url, undefined);
    await s.discard();
    assert.equal(s.state().changes.length, 0);
    assert.equal((await s.getDoc(s.doc(s.db, 'coaches', 'coach'))).data().foto_url, 'https://example.com/photo.jpg');
});

test('weesverwijzingen, dubbele seizoenen en ongeldige prijzen blokkeren publiceren', async () => {
    const h = harness(), s = h.store;
    await s.connect('test-token');
    await s.deleteDoc(s.doc(s.db, 'coaches', 'coach'));
    await assert.rejects(s.publish('Test'), /leeg|trainer ontbreekt/);
    assert.equal(h.calls.filter(c => c.method === 'PUT').length, 0);
    const data = fixture(); data.seizoenen.push({ ...data.seizoenen[0], id: 'other' });
    assert.throws(() => validateDataset(data), /Dubbel clubseizoen/);
    const invalid = fixture(); invalid.seizoenen[0].nationale_beker = '';
    assert.throws(() => validateDataset(invalid), /Kies ja of nee/);
});

test('een account zonder repositoryschrijfrechten krijgt geen verbinding', async () => {
    const h = harness(); h.mode('readonly');
    await assert.rejects(h.store.connect('test-token'), /geen schrijfrechten/);
    assert.equal(h.store.state().connected, false);
});

test('meldingen kunnen nooit per ongeluk in de publieke dataset terechtkomen', () => {
    const s = harness().store;
    assert.throws(() => s.collection(s.db, 'meldingen'), /niet in de repository/);
});

test('de echte 437-regelige dashboardimport werkt via de GitHub-werkset en behoudt bestaande gegevens', async () => {
    const dataset = JSON.parse(fs.readFileSync(new URL('../snapshot.json', import.meta.url), 'utf8'));
    const rows = JSON.parse(fs.readFileSync(new URL('../import_transfermarkt_compleet.json', import.meta.url), 'utf8'));
    const html = fs.readFileSync(new URL('../../dashboard.html', import.meta.url), 'utf8');
    const start = html.indexOf('const handleImportData = async () => {');
    const end = html.indexOf('const uniqueClubs = useMemo', start);
    let writes = 0, error = '', complete = false;
    const s = createRepositoryStore({ fetcher: async (_url, options) => {
        if (options.method) writes++;
        return { ok: true, json: async () => ({ sha: 'actual', encoding: 'base64', content: Buffer.from(JSON.stringify(dataset)).toString('base64') }) };
    } });
    await s.load();
    const noop = () => {};
    const mocks = { ...Object.fromEntries(['db','getDocs','collection','writeBatch','doc'].map(k => [k,s[k]])), setIsLoading: noop, setError: value => { error = value; }, setStatus: noop, processedData: rows, clubLogos: {}, alert: noop, onUpdateAll: () => { complete = true; }, resetWizard: noop };
    await new Function(...Object.keys(mocks), `${html.slice(start, end)}; return handleImportData();`)(...Object.values(mocks));
    assert.equal(error, ''); assert.equal(complete, true); assert.equal(writes, 0);
    const after = JSON.parse(s.exportDraft());
    assert.equal(after.clubs.length, dataset.clubs.length);
    assert.equal(after.coaches.length, dataset.coaches.length);
    assert.equal(after.seizoenen.length, dataset.seizoenen.length);
    assert.equal(s.state().changes.length, 0, 'Opnieuw importeren van de huidige import moet geen wijzigingen opleveren');
});
