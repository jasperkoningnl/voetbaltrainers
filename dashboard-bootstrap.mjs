import { createRepositoryStore } from './dashboard-store.mjs';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js';
import { getAuth, GithubAuthProvider, signInWithPopup, linkWithPopup, signOut, onAuthStateChanged, setPersistence, inMemoryPersistence } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import { getFirestore, collection, getDocs, doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js';

// Firebase remains the OAuth broker and the store for existing visitor reports only.
// Club, coach and season data is read and written exclusively through GitHub.
const app = initializeApp({
    apiKey: 'AIzaSyDZckphHLQiTK2KZHPOyPDxgB6glBr4HpY',
    authDomain: 'voetbaltrainers.firebaseapp.com',
    projectId: 'voetbaltrainers',
    appId: '1:640532231483:web:54d614b65b3e2c4adc731e',
});
const auth = getAuth(app);
await setPersistence(auth, inMemoryPersistence);
const legacyDb = getFirestore(app);
const store = createRepositoryStore();
async function loginGitHub() {
    const provider = new GithubAuthProvider();
    // The repository is public: never ask for access to private repositories.
    provider.addScope('public_repo');
    try {
        // Retain the existing Firebase UID (and report permissions) during migration.
        // Subsequent sessions have only the GitHub sign-in button.
        const existing = auth.currentUser;
        const result = existing && !existing.providerData.some(p => p.providerId === 'github.com')
            ? await linkWithPopup(existing, provider)
            : await signInWithPopup(auth, provider);
        const credential = GithubAuthProvider.credentialFromResult(result);
        if (!credential?.accessToken) throw new Error('GitHub heeft geen toegang verleend.');
        await store.connect(credential.accessToken);
        return result.user;
    } catch (error) {
        store.disconnect();
        const messages = {
            'auth/operation-not-allowed': 'GitHub-inloggen is nog niet ingeschakeld. Volg de eenmalige inrichting in docs/GITHUB_DASHBOARD.md.',
            'auth/unauthorized-domain': 'Deze dashboardlocatie is nog niet toegestaan voor inloggen. Controleer de toegestane domeinen in Firebase Authentication.',
            'auth/account-exists-with-different-credential': 'Dit account bestaat al via de eerdere Google-inlog. Koppel GitHub aan dat bestaande account in Firebase Authentication; maak geen tweede beheeraccount.',
            'auth/popup-blocked': 'Je browser blokkeert het inlogvenster. Sta pop-ups voor deze site toe en probeer opnieuw.',
            'auth/popup-closed-by-user': 'Het GitHub-inlogvenster is gesloten. Je concept is behouden.',
        };
        throw new Error(messages[error.code] || error.message);
    }
}
window.dashboardServices = {
    ...store, store, auth, onAuthStateChanged, loginGitHub,
    logout: async () => { store.disconnect(); await signOut(auth); },
    functions: { enrichCoachData: httpsCallable(getFunctions(app, 'europe-west1'), 'enrichCoachData') },
    legacyMessages: {
        read: () => getDocs(collection(legacyDb, 'meldingen')),
        update: (id, data) => updateDoc(doc(legacyDb, 'meldingen', id), { ...data, afgehandeld_op: serverTimestamp() }),
    },
};
window.addEventListener('beforeunload', event => {
    if (store.state().changes.length || store.state().busy) { event.preventDefault(); event.returnValue = ''; }
});
window.dispatchEvent(new Event('dashboard-ready'));
