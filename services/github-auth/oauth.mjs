import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE = '__Host-managerhistory-oauth';
const random = () => randomBytes(32).toString('base64url');
const jsonScript = value => JSON.stringify(value).replace(/</g, '\\u003c');
export function createOAuthHandlers({ env = process.env, fetcher = fetch, now = () => Date.now() } = {}) {
    function configuration() {
        if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.AUTH_ORIGIN || !env.ALLOWED_ORIGINS) throw new Error('De GitHub-inlog moet nog worden ingericht.');
        const authOrigin = new URL(env.AUTH_ORIGIN).origin;
        if (!authOrigin.startsWith('https://')) throw new Error('De inlogdienst vereist HTTPS.');
        const origins = env.ALLOWED_ORIGINS.split(',').map(value => new URL(value.trim()).origin);
        return { authOrigin, origins, callback: authOrigin + '/api/github/callback' };
    }
    const signature = text => createHmac('sha256', env.GITHUB_CLIENT_SECRET).update(text).digest('base64url');
    function headers(res) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    }
    function message(res, origin, requestId, result, status = 200) {
        const nonce = random(); headers(res);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`);
        res.statusCode = status;
        res.end(`<!doctype html><html lang="nl"><meta charset="utf-8"><title>Manager History GitHub-inlog</title><p>Je kunt dit venster sluiten en teruggaan naar het dashboard.</p><script nonce="${nonce}">if(window.opener){window.opener.postMessage(${jsonScript({ type: 'managerhistory-github-auth', requestId, ...result })},${jsonScript(origin)});window.close();}</script></html>`);
    }
    function error(res, text, status = 400) {
        headers(res); res.statusCode = status; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end(text);
    }
    async function start(req, res) {
        try {
            if (req.method !== 'GET') return error(res, 'Gebruik GET.', 405);
            const config = configuration();
            const origin = String(req.query.origin || ''), requestId = String(req.query.requestId || '');
            if (!config.origins.includes(origin) || !/^[a-zA-Z0-9-]{20,80}$/.test(requestId)) return error(res, 'Ongeldige dashboardlocatie of inlogaanvraag.');
            const state = random(), verifier = random();
            const payload = Buffer.from(JSON.stringify({ state, verifier, origin, requestId, expires: now() + 600000 })).toString('base64url');
            headers(res);
            res.setHeader('Set-Cookie', `${COOKIE}=${payload}.${signature(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
            const params = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, redirect_uri: config.callback, scope: 'public_repo', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', allow_signup: 'false' });
            res.statusCode = 302; res.setHeader('Location', 'https://github.com/login/oauth/authorize?' + params); res.end();
        } catch { error(res, 'De GitHub-inlog is nog niet ingericht. Vul de OAuth-instellingen in bij de inlogdienst.', 503); }
    }
    async function callback(req, res) {
        let session;
        try {
            if (req.method !== 'GET') return error(res, 'Gebruik GET.', 405);
            const config = configuration();
            headers(res); res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
            const raw = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
            if (!raw || raw.length > 4096) return error(res, 'Deze inlogaanvraag ontbreekt of is verlopen. Log opnieuw in.');
            const [payload, sig] = raw.split('.'), expected = signature(payload);
            if (!sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return error(res, 'Ongeldige inlogaanvraag.');
            session = JSON.parse(Buffer.from(payload, 'base64url').toString());
            if (!config.origins.includes(session.origin) || session.expires < now() || session.state !== req.query.state) return error(res, 'Deze inlogaanvraag klopt niet of is verlopen. Log opnieuw in.');
            if (req.query.error) return message(res, session.origin, session.requestId, { error: 'Je hebt GitHub geen toestemming gegeven. Je concept is behouden.' });
            const code = String(req.query.code || '');
            if (!code || code.length > 256) return error(res, 'GitHub heeft geen geldige inlogcode geleverd.');
            const response = await fetcher('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: config.callback, code_verifier: session.verifier }), signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error('exchange');
            const credential = await response.json();
            if (!credential.access_token || credential.error) throw new Error('exchange');
            const identity = await fetcher('https://api.github.com/user', { headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + credential.access_token }, signal: AbortSignal.timeout(15000) });
            if (!identity.ok) throw new Error('identity');
            const user = await identity.json();
            if (!user.login) throw new Error('identity');
            return message(res, session.origin, session.requestId, { accessToken: credential.access_token, user: { displayName: user.name || user.login, login: user.login, photoURL: user.avatar_url || '' } });
        } catch {
            if (session?.origin) return message(res, session.origin, session.requestId, { error: 'GitHub-inloggen is niet gelukt. Controleer de OAuth-instellingen en probeer opnieuw.' });
            return error(res, 'De GitHub-inlog is nog niet ingericht.', 503);
        }
    }
    return { start, callback, ready: () => { try { configuration(); return true; } catch { return false; } } };
}
