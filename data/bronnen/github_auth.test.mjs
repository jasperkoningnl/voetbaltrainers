import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createOAuthHandlers } from '../../services/github-auth/oauth.mjs';
import { buildReportURL } from '../../report-fields.mjs';

const env = { GITHUB_CLIENT_ID: 'test-id', GITHUB_CLIENT_SECRET: 'test-secret', AUTH_ORIGIN: 'https://auth.example.com', ALLOWED_ORIGINS: 'https://managerhistory.com' };
function response() { return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body = '') { this.body = body; } }; }
const req = (query, cookie = '') => ({ method: 'GET', query, headers: { cookie } });
async function initiate(handler) {
    const res = response(); await handler.start(req({ origin: 'https://managerhistory.com', requestId: 'test-request-id-1234567890' }), res);
    const cookie = res.headers['Set-Cookie'].split(';')[0];
    const params = new URL(res.headers.Location).searchParams;
    return { res, cookie, params };
}
test('directe GitHub-inlog gebruikt gecontroleerde origin, HttpOnly-state en PKCE zonder secret in de URL', async () => {
    const h = createOAuthHandlers({ env }); const { res, cookie, params } = await initiate(h);
    assert.equal(res.statusCode, 302);
    assert.match(res.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Lax/);
    assert.equal(params.get('scope'), 'public_repo');
    assert.equal(params.get('redirect_uri'), 'https://auth.example.com/api/github/callback');
    assert.ok(!res.headers.Location.includes('test-secret'));
    const payload = JSON.parse(Buffer.from(cookie.split('=')[1].split('.')[0], 'base64url'));
    assert.equal(params.get('code_challenge'), createHash('sha256').update(payload.verifier).digest('base64url'));
    const bad = response(); await h.start(req({ origin: 'https://evil.example', requestId: 'test-request-id-1234567890' }), bad);
    assert.equal(bad.statusCode, 400);
});
test('callback weigert ontbrekende, vervalste, verlopen of niet-passende inlogaanvragen vóór tokenuitwisseling', async () => {
    let now = 1000, calls = 0;
    const h = createOAuthHandlers({ env, now: () => now, fetcher: async () => { calls++; throw Error('unexpected'); } });
    const { cookie, params } = await initiate(h);
    for (const [c, state] of [['', params.get('state')], [cookie + 'tampered', params.get('state')], [cookie, 'wrong']]) {
        const res = response(); await h.callback(req({ code: 'valid', state }, c), res); assert.equal(res.statusCode, 400);
    }
    now = 700000; const res = response(); await h.callback(req({ code: 'valid', state: params.get('state') }, cookie), res);
    assert.equal(res.statusCode, 400); assert.equal(calls, 0);
});
test('callback bevestigt identiteit en stuurt alleen naar de gekozen dashboard-origin, nooit tokens in een redirect', async () => {
    const calls = [];
    const h = createOAuthHandlers({ env, fetcher: async (url, options) => {
        calls.push({ url, options });
        return { ok: true, json: async () => url.includes('access_token') ? { access_token: 'fake-access-token', refresh_token: 'never-expose-refresh' } : { login: 'jasper', name: 'Jasper', avatar_url: '' } };
    } });
    const { cookie, params } = await initiate(h); const res = response();
    await h.callback(req({ code: 'valid', state: params.get('state') }, cookie), res);
    assert.equal(res.statusCode, 200); assert.equal(calls.length, 2);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.match(res.headers['Content-Security-Policy'], /script-src 'nonce-/);
    assert.match(res.body, /postMessage/); assert.match(res.body, /https:\/\/managerhistory.com/);
    assert.ok(!res.headers.Location); assert.ok(!res.body.includes('test-secret')); assert.ok(!res.body.includes('never-expose-refresh'));
    assert.equal(new URLSearchParams(calls[0].options.body).get('client_secret'), env.GITHUB_CLIENT_SECRET);
    assert.ok(new URLSearchParams(calls[0].options.body).get('code_verifier'));
});
test('ontbrekende inrichting faalt gesloten en logt geen credentials', async () => {
    const h = createOAuthHandlers({ env: {} }); const res = response(); await h.start(req({}), res);
    assert.equal(h.ready(), false); assert.equal(res.statusCode, 503);
});
test('bezoekersmelding is een GitHub-concept zonder contactveld of Firebase-verzoek', () => {
    const url = new URL(buildReportURL({ club: 'Ajax', season: '1962/63', text: 'Verkeerde trainer', source: 'https://example.com', contact: 'private@example.com' }));
    assert.equal(url.origin, 'https://github.com'); assert.equal(url.pathname, '/jasperkoningnl/voetbaltrainers/issues/new');
    assert.equal(url.searchParams.get('title'), '[Data report] Ajax · 1962/63');
    assert.ok(!url.searchParams.get('body').includes('private@example.com'));
});

test('dashboard, meldformulier en archief laden nergens meer een Firebase SDK of endpoint', () => {
    for (const path of ['dashboard.html', 'dashboard-bootstrap.mjs', 'report.js', 'app.js', 'v0.9/index.html', 'v0.9/script.js']) {
        const text = fs.readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
        assert.doesNotMatch(text, /gstatic\.com\/firebase|firestore\.googleapis\.com|firebaseapp\.com/);
    }
});
