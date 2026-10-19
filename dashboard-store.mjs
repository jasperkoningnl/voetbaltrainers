// Repository-backed working copy. Tokens and drafts stay in memory, never in browser storage.
const COLLECTIONS = ['clubs', 'coaches', 'seizoenen'];
const DELETE = Symbol('delete-field');
const clone = value => structuredClone(value);
const canonical = value => JSON.stringify(sort(value));
function sort(value) {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]));
    return value;
}
export function validateDataset(data) {
    for (const name of COLLECTIONS) {
        if (!Array.isArray(data[name]) || !data[name].length) throw new Error(`De lijst ${name} ontbreekt of is leeg.`);
        const ids = new Set();
        for (const row of data[name]) {
            if (!row.id || ids.has(row.id)) throw new Error(`Ontbrekend of dubbel ID in ${name}.`);
            ids.add(row.id);
        }
    }
    const clubs = new Map(data.clubs.map(c => [c.id, c]));
    const coaches = new Set(data.coaches.map(c => c.id));
    const seasons = new Set();
    for (const row of data.seizoenen) {
        const key = `${row.club}|${row.seizoen}`;
        if (seasons.has(key)) throw new Error(`Dubbel clubseizoen: ${row.seizoen}.`);
        seasons.add(key);
        if (!clubs.has(row.club) || !coaches.has(row.coachId)) throw new Error(`Club of trainer ontbreekt bij ${row.seizoen}.`);
        if (!/^\d{4}\/\d{2}$/.test(row.seizoen) || Number(row.seizoen.slice(5)) !== (Number(row.seizoen.slice(0, 4)) + 1) % 100) throw new Error(`Ongeldig seizoen: ${row.seizoen}.`);
        for (const field of ['landstitel', 'nationale_beker', 'europese_prijs']) if (!['Y', 'N'].includes(row[field])) throw new Error(`Kies ja of nee voor ${field} bij ${row.seizoen}.`);
    }
}
export function formatSnapshot(data) {
    const lines = [`"generated": ${JSON.stringify(data.generated)}`];
    for (const name of COLLECTIONS) lines.push(`"${name}": [\n${[...data[name]].sort((a, b) => a.id.localeCompare(b.id, 'en')).map(row => JSON.stringify(sort(row))).join(',\n')}\n]`);
    return `{\n${lines.join(',\n')}\n}\n`;
}
function toBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    return btoa(binary);
}
function fromBase64(text) { return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g, '')), c => c.charCodeAt(0))); }

export function createRepositoryStore({ fetcher = globalThis.fetch.bind(globalThis), owner = 'jasperkoningnl', repo = 'voetbaltrainers', branch = 'main', clock = () => new Date().toISOString() } = {}) {
    const api = `https://api.github.com/repos/${owner}/${repo}`;
    const path = 'data/snapshot.json';
    let token = '', base = null, working = null, sha = null, busy = false, loading = null;
    let lastCommit = null, notice = '';
    const listeners = new Set();
    function changes() {
        if (!base || !working) return [];
        return COLLECTIONS.flatMap(name => {
            const before = new Map(base[name].map(row => [row.id, row]));
            const after = new Map(working[name].map(row => [row.id, row]));
            return [...new Set([...before.keys(), ...after.keys()])].flatMap(id => {
                const old = before.get(id), row = after.get(id);
                return canonical(old) === canonical(row) ? [] : [{ collection: name, id, kind: !old ? 'toegevoegd' : !row ? 'verwijderd' : 'gewijzigd', label: row?.naam || old?.naam || `${(row || old).seizoen} · ${working.clubs.find(c => c.id === (row || old).club)?.naam || (row || old).club}` }];
            });
        });
    }
    const state = () => ({ connected: !!token, loaded: !!working, busy, changes: changes(), lastCommit, notice });
    const emit = () => { for (const listener of listeners) listener(state()); };
    async function request(suffix, options = {}) {
        const response = await fetcher(api + suffix, { ...options, cache: 'no-store', headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
        if (!response.ok) {
            if (response.status === 401) { token = ''; emit(); throw new Error('De GitHub-toegang is verlopen of ongeldig. Verbind opnieuw.'); }
            if (response.status === 409 || response.status === 422) throw new Error('De gegevens zijn intussen gewijzigd op GitHub. Je concept blijft behouden. Download het concept en laad daarna de nieuwste versie.');
            if (response.status === 403) throw new Error('GitHub weigert toegang. Controleer de schrijfrechten voor deze repository en de verzoeklimiet.');
            throw new Error(`GitHub geeft een fout (${response.status}). Je concept blijft behouden.`);
        }
        return response.json();
    }
    async function readRemote() {
        const file = await request(`/contents/${path}?ref=${encodeURIComponent(branch)}`);
        const blob = file.encoding === 'base64' && file.content ? file : await request(`/git/blobs/${file.sha}`);
        return { data: JSON.parse(fromBase64(blob.content)), sha: file.sha };
    }
    async function load() {
        if (working) return;
        if (loading) return loading;
        loading = (async () => {
            const remote = await readRemote();
            validateDataset(remote.data);
            base = clone(remote.data); working = clone(remote.data); sha = remote.sha;
            emit();
        })();
        try { await loading; } finally { loading = null; }
    }
    async function connect(value) {
        if (busy) throw new Error('Wacht totdat publiceren klaar is.');
        token = value.trim();
        if (!token) throw new Error('Vul je GitHub-toegangssleutel in.');
        try {
            const repository = await request('');
            if (!repository.permissions?.push) throw new Error('Dit GitHub-account heeft geen schrijfrechten voor jasperkoningnl/voetbaltrainers.');
            await load();
        } catch (error) { token = ''; emit(); throw error; }
        emit();
    }
    const collection = (_db, name) => { if (!COLLECTIONS.includes(name)) throw new Error('Deze gegevens worden niet in de repository bewaard.'); return { name, filters: [] }; };
    const doc = (parent, name, id) => typeof name === 'string' && id !== undefined ? { name, id } : { name: parent.name, id: name || `mh-${crypto.randomUUID()}` };
    const rowDoc = (name, row) => ({ id: row.id, ref: { name, id: row.id }, exists: () => !!row, data: () => { const { id, ...data } = row; return clone(data); } });
    async function getDocs(ref) {
        await load();
        let rows = [...working[ref.name]];
        for (const filter of ref.filters || []) {
            if (filter.kind === 'where') rows = rows.filter(row => filter.op === '==' ? row[filter.field] === filter.value : filter.op === 'in' ? filter.value.includes(row[filter.field]) : false);
            else rows.sort((a, b) => String(a[filter.field] || '').localeCompare(String(b[filter.field] || '')) * (filter.direction === 'desc' ? -1 : 1));
        }
        const docs = rows.map(row => rowDoc(ref.name, row));
        return { docs, size: docs.length, empty: !docs.length, forEach: callback => docs.forEach(callback) };
    }
    async function getDoc(ref) {
        await load(); const row = working[ref.name].find(row => row.id === ref.id);
        return row ? rowDoc(ref.name, row) : { id: ref.id, ref, exists: () => false, data: () => undefined };
    }
    async function apply(operations) {
        await load();
        if (busy) throw new Error('Wacht totdat publiceren klaar is.');
        const next = clone(working);
        for (const { type, ref, data, merge } of operations) {
            if (!COLLECTIONS.includes(ref.name)) throw new Error('Onbekende gegevenslijst.');
            const rows = next[ref.name], index = rows.findIndex(row => row.id === ref.id);
            if (type === 'delete') { if (index >= 0) rows.splice(index, 1); continue; }
            if (type === 'update' && index < 0) throw new Error('Dit record bestaat niet meer. Laad de gegevens opnieuw.');
            const row = index >= 0 && (merge || type === 'update') ? { ...rows[index] } : { id: ref.id };
            for (const [key, value] of Object.entries(data)) { if (value === DELETE) delete row[key]; else if (value !== undefined && key !== 'id') row[key] = clone(value); }
            if (index < 0) rows.push(row); else rows[index] = row;
        }
        working = next; emit();
    }
    function writeBatch() {
        const operations = [];
        const batch = { set: (ref, data, options = {}) => operations.push({ type: 'set', ref, data, merge: options.merge }), update: (ref, data) => operations.push({ type: 'update', ref, data }), delete: ref => operations.push({ type: 'delete', ref }), commit: () => apply(operations) };
        return batch;
    }
    async function publish(message) {
        if (busy) throw new Error('Publiceren is al bezig.');
        if (!token) throw new Error('Verbind eerst met GitHub om te publiceren.');
        await load();
        if (!changes().length) throw new Error('Er zijn geen wijzigingen om te publiceren.');
        validateDataset(working);
        busy = true; emit();
        try {
            const next = { ...clone(working), generated: clock() };
            const result = await request(`/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message: message.trim() || 'Gegevens bijgewerkt via dashboard', branch, sha, content: toBase64(formatSnapshot(next)) }) });
            if (!result.content?.sha || !result.commit?.html_url) throw new Error('GitHub heeft de opslag niet bevestigd. Laad de laatste versie voordat je opnieuw publiceert.');
            base = clone(next); working = clone(next); sha = result.content.sha; lastCommit = result.commit.html_url;
            notice = 'Opgeslagen op GitHub. De website wordt nu gepubliceerd.';
            return lastCommit;
        } finally { busy = false; emit(); }
    }
    return {
        db: {}, collection, doc, getDoc, getDocs, writeBatch,
        query: (ref, ...filters) => ({ ...ref, filters }),
        where: (field, op, value) => { if (!['==', 'in'].includes(op)) throw new Error('Onbekend filter.'); return { kind: 'where', field, op, value }; },
        orderBy: (field, direction = 'asc') => ({ kind: 'order', field, direction }),
        updateDoc: (ref, data) => apply([{ type: 'update', ref, data }]),
        deleteDoc: ref => apply([{ type: 'delete', ref }]),
        addDoc: async (ref, data) => { const target = doc(ref); await apply([{ type: 'set', ref: target, data }]); return target; },
        serverTimestamp: clock, deleteField: () => DELETE,
        load, connect, publish, state,
        readReports: async () => {
            const reports = [];
            for (let page = 1; page <= 20; page++) {
                const issues = await request(`/issues?state=all&per_page=100&page=${page}&sort=created&direction=desc`);
                for (const issue of issues) {
                    if (issue.pull_request || !issue.title.startsWith('[Data report]')) continue;
                    const match = (issue.body || '').match(/<!-- managerhistory-report (.*?) -->/);
                    let context = {}; try { context = JSON.parse(match?.[1] || '{}'); } catch { /* body remains readable */ }
                    const safeContext = Object.fromEntries(['soort', 'club', 'seizoen', 'coach'].map(key => [key, typeof context[key] === 'string' ? context[key] : '']));
                    reports.push({ ...safeContext, id: String(issue.number), bericht: (issue.body || '').replace(/<!-- managerhistory-report .*? -->/, '').trim(), status: issue.state === 'open' ? 'nieuw' : issue.state_reason === 'not_planned' ? 'afgewezen' : 'opgelost', aangemaakt: issue.created_at, pagina: issue.html_url, bron: '', notitie: '' });
                }
                if (issues.length < 100) return reports;
            }
            throw new Error('Meer dan 2.000 GitHub-items. Bekijk alle meldingen rechtstreeks op GitHub.');
        },
        updateReport: async (id, data) => {
            if (!token) throw new Error('Log in met GitHub om een melding af te handelen.');
            if (!/^\d+$/.test(String(id))) throw new Error('Ongeldig meldingsnummer.');
            const issue = await request(`/issues/${id}`);
            if (issue.pull_request || !issue.title.startsWith('[Data report]')) throw new Error('Dit is geen bezoekersmelding.');
            if (data.notitie?.trim()) await request(`/issues/${id}/comments`, { method: 'POST', body: JSON.stringify({ body: data.notitie.trim() }) });
            await request(`/issues/${id}`, { method: 'PATCH', body: JSON.stringify({ state: data.status === 'nieuw' ? 'open' : 'closed', state_reason: data.status === 'afgewezen' ? 'not_planned' : data.status === 'nieuw' ? 'reopened' : 'completed' }) });
        },
        disconnect: () => { if (busy) return; token = ''; emit(); },
        subscribe: listener => { listeners.add(listener); listener(state()); return () => listeners.delete(listener); },
        exportDraft: () => { if (!working) throw new Error('Laad eerst de gegevens.'); return formatSnapshot({ ...working, generated: clock() }); },
        discard: async () => {
            if (busy) throw new Error('Wacht totdat publiceren klaar is.');
            busy = true; emit();
            try {
                const remote = await readRemote(); validateDataset(remote.data);
                base = clone(remote.data); working = clone(remote.data); sha = remote.sha; notice = '';
            } finally { busy = false; emit(); }
        },
    };
}
