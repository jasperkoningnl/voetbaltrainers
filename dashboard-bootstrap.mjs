import { createRepositoryStore } from './dashboard-store.mjs';

const AUTH_ORIGIN = 'https://managerhistory-auth-jasper-konings-projects.vercel.app';
const store = createRepositoryStore();
const auth = { currentUser: null };
const listeners = new Set();
function setUser(user) { auth.currentUser = user; listeners.forEach(listener => listener(user)); }
function loginGitHub() {
    const popup = window.open('about:blank', 'managerhistory-github-login', 'width=620,height=760');
    if (!popup) return Promise.reject(new Error('Sta het GitHub-inlogvenster voor deze site toe en probeer opnieuw.'));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
        const finish = (error, user) => {
            window.removeEventListener('message', receive); clearInterval(closed); clearTimeout(timeout);
            if (!popup.closed) popup.close();
            if (error) { store.disconnect(); reject(error); } else resolve(user);
        };
        let handling = false;
        const receive = async event => {
            if (event.origin !== AUTH_ORIGIN || event.source !== popup || event.data?.type !== 'managerhistory-github-auth' || event.data.requestId !== requestId || handling) return;
            handling = true;
            if (event.data.error) return finish(new Error(event.data.error));
            try {
                if (!event.data.accessToken || !event.data.user?.login) throw new Error('GitHub heeft geen geldige inlog geleverd.');
                await store.connect(event.data.accessToken);
                setUser(event.data.user); finish(null, event.data.user);
            } catch (error) { finish(error); }
        };
        window.addEventListener('message', receive);
        const closed = setInterval(() => { if (popup.closed && !handling) finish(new Error('Het inlogvenster is gesloten. Je concept is behouden.')); }, 500);
        const timeout = setTimeout(() => finish(new Error('De inlogaanvraag is verlopen. Probeer opnieuw.')), 600000);
        popup.location.href = AUTH_ORIGIN + '/api/github/start?' + new URLSearchParams({ origin: location.origin, requestId });
    });
}
async function enrichCoachData({ coaches }) {
    const names = [...new Set(coaches)]; const photos = new Map();
    for (let offset = 0; offset < names.length; offset += 20) {
        const group = names.slice(offset, offset + 20);
        const params = new URLSearchParams({ action: 'query', format: 'json', prop: 'pageimages', piprop: 'original', titles: group.join('|'), origin: '*' });
        const response = await fetch('https://en.wikipedia.org/w/api.php?' + params, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('Wikipedia kon de kandidaatfoto’s niet ophalen. Probeer later opnieuw.');
        const data = await response.json();
        for (const page of Object.values(data.query?.pages || {})) if (page.original?.source) photos.set(page.title, page.original.source);
        for (const norm of data.query?.normalized || []) if (photos.has(norm.to)) photos.set(norm.from, photos.get(norm.to));
    }
    return { data: { coaches: names.map(naam => ({ naam, foto_url: photos.get(naam) || '' })) } };
}
window.dashboardServices = {
    ...store, store, auth, loginGitHub,
    onAuthStateChanged: (_auth, listener) => { listeners.add(listener); listener(auth.currentUser); return () => listeners.delete(listener); },
    logout: async () => { store.disconnect(); setUser(null); },
    functions: { enrichCoachData },
    githubMessages: { read: () => store.readReports(), update: (id, data) => store.updateReport(id, data) },
};
window.addEventListener('beforeunload', event => {
    if (store.state().changes.length || store.state().busy) { event.preventDefault(); event.returnValue = ''; }
});
window.dispatchEvent(new Event('dashboard-ready'));
