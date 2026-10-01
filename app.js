// The Managerial Merry-Go-Round (hoofdversie; de eerste versie staat als archief in v0.9/)
// Eén script voor twee pagina's: index.html (intro) en explore.html (verkenner).
// Leest clubs, coaches en seizoenen uit de statische snapshot data/snapshot.json
// (export uit het dashboard). Alleen als die ontbreekt valt de app terug op Firestore.
// Per seizoen staat één hoofdtrainer (coachId). Het optionele veld 'trainers_seizoen'
// bevat alle trainers die dat seizoen aan het roer stonden (incl. interim); bij meer dan één
// wordt het seizoensblok in gelijke rode stukken gesplitst, één per trainer. Ontbreekt het veld,
// dan valt de app terug op data/trainers_seizoen.json.

const firebaseConfig = {
    apiKey: "AIzaSyDZckphHLQiTK2KZHPOyPDxgB6glBr4HpY",
    authDomain: "voetbaltrainers.firebaseapp.com",
    projectId: "voetbaltrainers",
    storageBucket: "voetbaltrainers.appspot.com",
    messagingSenderId: "640532231483",
    appId: "1:640532231483:web:54d614b65b3e2c4adc731e",
};

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------
const COUNTRIES = ["England", "France", "Germany", "Italy", "Netherlands", "Portugal", "Spain"];
const TENURE_COLORS = ["#FF0033", "#66ff66", "#33cc33", "#339933", "#006600", "#003300"];
const TENURE_TEXT = ["#fff", "#14391d", "#0d2b14", "#fff", "#fff", "#fff"];
// Prijzen: één schildvorm (viewBox 0 0 12 13), kleur = soort. Volgorde in een seizoensblok: titel, beker, Europa.
const PRIZE = {
    title: { fill: "#d9dde2", stroke: "#2a2f33" },
    cup: { fill: "#cd7f32", stroke: "#3b1f05" },
    euro: { fill: "#FFD700", stroke: "#3a2a00" },
};
const PRIZE_ORDER = ["title", "cup", "euro"];
// Fusieclubs: de vroegste seizoenen in de data zijn van een voorganger (zie Data Methodology)
const PREDECESSORS = {
    "Paris Saint-Germain": { until: "1970/71", name: "Stade Saint-Germain", note: "Until 1969/70 this row shows Stade Saint-Germain, which merged with Paris FC into Paris Saint-Germain in 1970." },
    "FC Twente": { until: "1965/66", name: "Sportclub Enschede", note: "Until 1964/65 this row shows Sportclub Enschede, which merged with Enschedese Boys into FC Twente in 1965." },
    "AZ": { until: "1967/68", name: "Alkmaar '54", note: "Until 1966/67 this row shows Alkmaar '54, which merged with FC Zaanstreek into AZ'67 in 1967 (AZ since 1986)." },
};
// Seizoenen van de voorganger: de toenmalige naam, uitleg in de tooltip
const clubNameHTML = (club, pre) => pre
    ? `<span class="club" title="${esc(pre.note)}">${esc(pre.name)}<span class="row-star">*</span></span>`
    : `<span class="club">${esc(club)}</span>`;
const predecessorOf = (clubName, season) => {
    const p = PREDECESSORS[clubName];
    return p && season < p.until ? p : null;
};
const FLAG_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a9b6ae" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>`;
const reportAttrs = (club, season, coach) =>
    `data-report data-report-club="${esc(club)}" data-report-season="${esc(season)}" data-report-coach="${esc(coach || "")}"`;
const SHIELD = "M6 .5 11.5 2v4.2c0 3.3-2.4 5.4-5.5 6.3C2.9 11.6.5 9.5.5 6.2V2Z";
const UNKNOWN = "[Data Unavailable]";
// Clublogo's staan in de repo (images/logos, bron: Wikipedia). De logo_url's in Firestore werken niet meer
// (Wikimedia weigert 1200px/640px-formaten, football-logos.cc blokkeert). Onbekende club: terugval op logo_url.
const LOCAL_LOGOS = new Set(["ajax", "arsenal", "as-monaco", "as-saint-etienne", "athletic-bilbao", "atletico-madrid", "az",
    "bayern-munchen", "benfica", "boavista", "borussia-dortmund", "borussia-monchengladbach", "chelsea", "fc-barcelona", "fc-porto",
    "fc-twente", "feyenoord", "hamburger-sv", "internazionale", "juventus", "liverpool", "manchester-city", "manchester-united", "milan",
    "napoli", "fenerbahce", "tottenham-hotspur", "uniao-de-leiria", "olympique-lyonnais", "olympique-marseille", "paris-saint-germain", "psv", "real-madrid", "roma", "s-c-braga",
    "sporting-cp", "valencia-cf", "vfb-stuttgart"]);
const slug = s => String(s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Volledig zwarte logo's worden op de donkere achtergrond wit weergegeven
const INVERT_LOGOS = new Set(["juventus", "tottenham-hotspur"]);
const logoClass = club => INVERT_LOGOS.has(slug(club.naam)) ? " logo-invert" : "";
const logoOf = club => LOCAL_LOGOS.has(slug(club.naam)) ? `images/logos/${slug(club.naam)}.png` : club.logo_url || "";

const tenureBucket = n => n <= 1 ? 0 : n === 2 ? 1 : n <= 4 ? 2 : n <= 6 ? 3 : n <= 9 ? 4 : 5;
const startYear = s => parseInt(s.slice(0, 4), 10);
const endYear = s => startYear(s) + 1;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const pct = x => `${Math.round(x * 100)}%`;
const fmt1 = x => (Math.round(x * 100) / 100).toFixed(2);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Oude imports kunnen gezamenlijke trainers nog in één naamveld bevatten.
// Expliciete technische directeuren tellen niet mee als hoofdtrainer.
function normalizeSeasonTrainers(list) {
    if (!Array.isArray(list)) return null;
    return list.flatMap(trainer => {
        const original = String(trainer.naam || "").replace(/\s+/g, " ").trim();
        return original.split(/\s*(?:,|&|\bet\b|\ben\b|\band\b|\be\b)\s*/iu)
            .map(name => name.trim()).filter(Boolean)
            .filter(name => !/\(DT\)\s*$/iu.test(name))
            .map(name => ({ ...trainer, naam: name.replace(/\s*\(DT\)\s*$/iu, "").trim() }));
    });
}

// ------------------------------------------------------------------
// Data
// ------------------------------------------------------------------
const DB = { clubs: [], clubById: new Map(), coaches: new Map(), seasons: [], byClub: new Map(), seasonList: [], coverage: new Set(), extraCareer: null };

// Snapshot eerst: dat kost geen Firestore-reads. Firestore alleen als de snapshot ontbreekt.
async function fetchCollections() {
    try {
        const r = await fetch("data/snapshot.json");
        if (r.ok) {
            const snap = await r.json();
            if (Array.isArray(snap.clubs) && Array.isArray(snap.coaches) && Array.isArray(snap.seizoenen)) return snap;
        }
        console.warn(`Snapshot niet bruikbaar (HTTP ${r.status}), terugval op Firestore.`);
    } catch (err) {
        console.warn("Snapshot niet geladen, terugval op Firestore.", err);
    }
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js");
    const { getFirestore, collection, getDocs } = await import("https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js");
    const db = getFirestore(initializeApp(firebaseConfig));
    const [clubs, coaches, seizoenen] = await Promise.all(["clubs", "coaches", "seizoenen"].map(async name =>
        (await getDocs(collection(db, name))).docs.map(d => ({ id: d.id, ...d.data() }))));
    // Zonder verbinding (bijv. quotum op) geeft de SDK lege resultaten in plaats van een fout.
    if (!seizoenen.length) throw new Error("Geen seizoenen uit Firestore ontvangen.");
    return { clubs, coaches, seizoenen };
}

async function loadData() {
    const [snap, fallback, extra] = await Promise.all([
        fetchCollections(),
        fetch("data/trainers_seizoen.json").then(r => r.ok ? r.json() : { seizoenen: [] }).catch(() => ({ seizoenen: [] })),
        // Mourinho buiten de database (alleen voor het intro)
        fetch("data/mourinho_buiten_dataset.json").then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    DB.extraCareer = extra;

    const fallbackMap = new Map((fallback.seizoenen || []).map(s => [`${s.club}|${s.seizoen}`, s.trainers]));

    DB.clubs = snap.clubs.slice().sort((a, b) => d3.ascending(a.naam, b.naam));
    DB.clubs.forEach(c => { c.logo_url = logoOf(c); });
    DB.clubs.forEach(c => DB.clubById.set(c.id, c));
    snap.coaches.forEach(c => DB.coaches.set(c.id, c));

    DB.seasons = snap.seizoenen.map(s => {
        const coach = DB.coaches.get(s.coachId) || { naam: UNKNOWN };
        const club = DB.clubById.get(s.club);
        if (!club) return null;
        let trainers = normalizeSeasonTrainers(Array.isArray(s.trainers_seizoen) ? s.trainers_seizoen : fallbackMap.get(`${s.club}|${s.seizoen}`));
        return {
            key: `${s.club}|${s.seizoen}`,
            clubId: s.club, club: club.naam, country: club.land,
            season: s.seizoen, year: startYear(s.seizoen),
            coachId: s.coachId, coach: coach.naam,
            unknown: coach.naam === UNKNOWN,
            title: s.landstitel === "Y", cup: s.nationale_beker === "Y", euro: s.europese_prijs === "Y",
            trainers,
            multi: !!trainers && new Set(trainers.map(t => t.naam)).size > 1,
            nCoaches: trainers ? new Set(trainers.map(t => t.naam)).size : 1,
        };
    }).filter(Boolean);

    // Een club telt pas mee als elk seizoen in de database trainerdata heeft.
    d3.group(DB.seasons, s => s.clubId).forEach((seasons, clubId) => {
        if (seasons.length && seasons.every(s => Array.isArray(s.trainers) && s.trainers.length > 0)) DB.coverage.add(clubId);
    });

    DB.seasonList = [...new Set(DB.seasons.map(s => s.season))].sort(d3.ascending);

    // Tenures (opeenvolgende seizoenen met dezelfde hoofdtrainer bij dezelfde club)
    d3.group(DB.seasons, s => s.clubId).forEach((list, clubId) => {
        list.sort((a, b) => d3.ascending(a.season, b.season));
        DB.byClub.set(clubId, list);
        let tenure = null;
        list.forEach(s => {
            if (!tenure || tenure.coachId !== s.coachId) {
                tenure = { id: `${clubId}|${s.season}`, coachId: s.coachId, coach: s.coach, clubId, seasons: [] };
            }
            tenure.seasons.push(s);
            s.tenure = tenure;
        });
    });
    DB.seasons.forEach(s => {
        const t = s.tenure;
        if (!t.done) {
            t.done = true;
            t.length = t.seasons.length;
            // Kleur: alleen volle seizoenen (één trainer het hele seizoen) tellen mee.
            // Seizoenen met meerdere trainers zijn altijd rood gestreept.
            t.full = t.seasons.filter(x => !x.multi).length;
            t.bucket = tenureBucket(Math.max(1, t.full));
            t.first = t.seasons[0].season;
            t.last = t.seasons[t.length - 1].season;
            t.trophies = {
                euro: d3.sum(t.seasons, x => x.euro), title: d3.sum(t.seasons, x => x.title), cup: d3.sum(t.seasons, x => x.cup),
            };
            t.multiSeasons = t.seasons.filter(x => x.multi);
        }
        s.index = t.seasons.indexOf(s) + 1;
        s.trophyCount = s.title + s.cup + s.euro;
    });
}

const coachByName = name => [...DB.coaches.values()].find(c => c.naam === name);
const clubByName = name => DB.clubs.find(c => c.naam === name);
const seasonsOfCoach = id => DB.seasons.filter(s => s.coachId === id).sort((a, b) => d3.ascending(a.season, b.season));
const trophiesOf = list => ({ title: d3.sum(list, s => s.title), cup: d3.sum(list, s => s.cup), euro: d3.sum(list, s => s.euro) });
const total = t => t.title + t.cup + t.euro;

// ------------------------------------------------------------------
// Legenda (verkenner): tenurekleuren, gesplitste blokken, schildjes
// ------------------------------------------------------------------
const shieldSVG = (kind, w = 10) => `<svg class="shield" width="${w}" height="${w * 13 / 12}" viewBox="0 0 12 13" aria-hidden="true"><path d="${SHIELD}" fill="${PRIZE[kind].fill}" stroke="${PRIZE[kind].stroke}" stroke-width="1"/></svg>`;
const splitSwatch = k => `<span class="sw">${"<i></i>".repeat(k)}</span>`;
function legendHTML({ split = true, prizes = true, unknown = false, hint = false, merger = false } = {}) {
    const items = [
        `<span class="legend-item"><span class="legend-swatches">${TENURE_COLORS.map(c => `<span class="sw" style="background:${c}"></span>`).join("")}</span>1 → 10+ seasons in charge</span>`,
        split ? `<span class="legend-item"><span class="legend-swatches split">${[1, 2, 3, 4, 5].map(splitSwatch).join("")}</span>1 → 5+ managers that season</span>` : "",
        prizes ? `<span class="legend-shields">${[["title", "League"], ["cup", "Cup"], ["euro", "Europe"]].map(([k, l]) => `<span>${shieldSVG(k)}${l}</span>`).join("")}</span>` : "",
        unknown ? `<span class="legend-item"><span class="legend-swatches"><span class="sw" style="background:repeating-linear-gradient(45deg,#2a3531 0 3px,#1c2623 3px 6px)"></span></span>No reliable data</span>` : "",
        merger ? `<span class="legend-item"><span class="legend-star">*</span>Predecessor club before merger</span>` : "",
        hint ? `<span class="legend-hint">Click a block to lock the manager</span>` : "",
    ];
    return items.filter(Boolean).join("");
}

// ------------------------------------------------------------------
// Statistieken voor het intro (staven en spreiding)
// ------------------------------------------------------------------
// Alleen clubs waarvan bekend is welke seizoenen meerdere trainers hadden, anders klopt de vergelijking niet.
function tenureStats() {
    const valid = DB.seasons.filter(s => !s.unknown && DB.coverage.has(s.clubId));
    const row = (b, list) => ({
        b, n: list.length,
        any: list.length ? list.filter(s => s.trophyCount > 0).length / list.length : 0,
        title: list.length ? list.filter(s => s.title).length / list.length : 0,
    });
    return [row("multi", valid.filter(s => s.multi))]
        .concat(d3.range(6).map(b => row(b, valid.filter(s => !s.multi && s.tenure.bucket === b))));
}
const statsClubs = () => DB.coverage.size;

function clubStats() {
    return DB.clubs.map(c => {
        const list = DB.byClub.get(c.id) || [];
        const tenures = new Set(list.map(s => s.tenure.id)).size;
        return {
            club: c, avg: list.length / tenures,
            perSeason: d3.sum(list, s => s.trophyCount) / list.length,
            trophies: d3.sum(list, s => s.trophyCount),
            multi: list.filter(s => s.multi).length, hasCoverage: DB.coverage.has(c.id),
        };
    });
}

function pearson(a, b) {
    const ma = d3.mean(a), mb = d3.mean(b);
    const num = d3.sum(a, (x, i) => (x - ma) * (b[i] - mb));
    return num / Math.sqrt(d3.sum(a, x => (x - ma) ** 2) * d3.sum(b, y => (y - mb) ** 2));
}

// ------------------------------------------------------------------
// Intro: presentatie in 7 scènes plus titelscherm (ontwerp: design_handoff_intro)
// ------------------------------------------------------------------
// Scèneklok: elke scène heeft een duur (0 = wacht op de gebruiker). Bij een scènewissel
// vervaagt de oude laag en komen de elementen van de nieuwe laag binnen volgens het
// 'armed'-patroon: eerst verborgen renderen, na ~60ms de overgangen met vertraging aanzetten.
const INTRO_KEY = "mmgr-intro-step";
const RED = "#FF0033";
// Ring en balkje voor 10+ seizoenen: de donkerste groentint uit het logo (beter zichtbaar dan #003300)
const DEEP_GREEN = "#0b4d0b";
const INTRO_SHIELD = { title: "#C0C0C0", cup: "#CD7F32", euro: "#FFD700" };
const CUP_NAME = { England: "FA Cup", France: "Coupe de France", Germany: "DFB-Pokal", Italy: "Coppa Italia", Netherlands: "KNVB Cup", Portugal: "Taça de Portugal", Spain: "Copa del Rey" };
const COUNTRY_OF_CODE = { ENG: "England", FRA: "France", GER: "Germany", ITA: "Italy", NED: "Netherlands", POR: "Portugal", ESP: "Spain", TUR: "Turkey" };
const CODE_OF_COUNTRY = Object.fromEntries(Object.entries(COUNTRY_OF_CODE).map(([k, v]) => [v, k]));
const NUM_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const word = n => NUM_WORDS[n] ?? String(n);
const sn = y => `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
const fmtR = d3.format(".2f");
const introShield = (kind, w) => `<svg width="${w}" height="${(w * 13 / 12).toFixed(1)}" viewBox="0 0 12 13" aria-hidden="true"><path d="${SHIELD}" fill="${INTRO_SHIELD[kind]}" stroke="#222" stroke-width=".8"/></svg>`;
const cellShield = kind => `<svg viewBox="0 0 12 13" aria-hidden="true"><path d="${SHIELD}" fill="${INTRO_SHIELD[kind]}" stroke="#222" stroke-width=".8"/></svg>`;
const PLAY_ICON = '<svg width="14" height="14" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1 L9 5 L2 9Z" fill="currentColor"/></svg>';
const PAUSE_ICON = '<svg width="14" height="14" viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1" width="2.5" height="8" rx=".6" fill="currentColor"/><rect x="6" y="1" width="2.5" height="8" rx=".6" fill="currentColor"/></svg>';

// Foto's: eigen bestand in images/intro/ als dat er is, anders de foto uit de database (Wikimedia-thumbnail).
// Twee achtergrondlagen: ontbreekt het eigen bestand, dan blijft de onderste laag zichtbaar.
function wikiThumb(url, px) {
    const m = /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+)(?:[?#].*)?$/.exec(url || "");
    return m ? `${m[1]}/thumb/${m[2]}/${m[3]}/${m[4]}/${px}px-${m[4]}` : url || "";
}
const photoBg = (file, fallback) => [file && `url("images/intro/${file}")`, fallback && `url("${fallback}")`].filter(Boolean).join(", ");

// Loopbaan van één trainer als lijst 'banen' (club × seizoen), uit de database plus de aanvulling
// voor clubs en seizoenen buiten de database (data/mourinho_buiten_dataset.json).
function careerJobs(coach, extra) {
    const name = coach.naam;
    const jobs = DB.seasons.filter(s => s.coachId === coach.id || (s.trainers || []).some(t => t.naam === name)).map(s => {
        const own = (s.trainers || []).find(t => t.naam === name);
        const club = DB.clubById.get(s.clubId);
        return {
            season: s.season, year: s.year, club: club.naam, country: s.country, logo: club.logo_url, invert: logoClass(club),
            main: s.coachId === coach.id, multi: s.multi, k: s.multi ? Math.min(5, s.nCoaches) : 1,
            bucket: s.tenure.bucket, title: s.title, cup: s.cup, euro: s.euro,
            start: own?.van || `${s.year}-07-01`,
        };
    });
    (extra?.coach === name ? extra.seizoenen : []).forEach(e => {
        const club = clubByName(e.club);
        const names = new Set(e.trainers.map(t => t.naam));
        const own = e.trainers.find(t => t.naam === name);
        jobs.push({
            season: e.seizoen, year: startYear(e.seizoen), club: e.club, country: e.land,
            // Clubs buiten de database: logo uit images/logos als dat er is
            logo: club ? club.logo_url : logoOf({ naam: e.club }), invert: logoClass(club || { naam: e.club }),
            main: !!e.hoofdtrainer, multi: names.size > 1, k: Math.min(5, names.size), bucket: null,
            title: !!e.titel, cup: !!e.beker, euro: !!e.europa, start: own?.van || `${startYear(e.seizoen)}-07-01`, extra: true,
        });
    });
    jobs.sort((a, b) => d3.ascending(a.start, b.start) || d3.ascending(a.season, b.season));
    // Kleur voor aangevulde seizoenen: aantal volle seizoenen in die periode bij de club
    let run = [];
    const flush = () => { const full = run.filter(j => !j.multi).length; run.forEach(j => { j.bucket = tenureBucket(Math.max(1, full)); }); run = []; };
    jobs.filter(j => j.extra).forEach(j => {
        const last = run[run.length - 1];
        if (last && (last.club !== j.club || last.year !== j.year - 1)) flush();
        run.push(j);
    });
    flush();
    return jobs;
}

// Bezoeken (filmstrip): opeenvolgende banen bij dezelfde club samengevoegd
function careerVisits(jobs) {
    const visits = [];
    jobs.forEach(j => {
        const last = visits[visits.length - 1];
        if (last && last.club === j.club) { last.last = j.year; return; }
        visits.push({ club: j.club, country: j.country, logo: j.logo, invert: j.invert, first: j.year, last: j.year, season: j.season });
    });
    return visits;
}

// Langste periode als hoofdtrainer bij één club (opeenvolgende seizoenen)
function longestStay(jobs) {
    let best = 0, cur = 0, prev = null;
    jobs.filter(j => j.main).sort((a, b) => a.year - b.year).forEach(j => {
        cur = prev && prev.club === j.club && prev.year === j.year - 1 ? cur + 1 : 1;
        best = Math.max(best, cur);
        prev = j;
    });
    return best;
}

function buildIntro(extra) {
    const mu = clubByName("Manchester United");
    const ferg = coachByName("Alex Ferguson");
    const mour = coachByName("José Mourinho");
    const fSeasons = seasonsOfCoach(ferg.id);
    const mSeasons = seasonsOfCoach(mour.id);
    const fT = trophiesOf(fSeasons), mT = trophiesOf(mSeasons);
    const fFirstYear = fSeasons[0].year, fLastYear = fSeasons[fSeasons.length - 1].year;
    const firstTrophy = fSeasons.find(s => s.trophyCount > 0);
    const dryStart = fSeasons.indexOf(firstTrophy);
    const lastTitle = [...fSeasons].reverse().find(s => s.title);
    const muByYear = new Map(DB.byClub.get(mu.id).map(s => [s.year, s]));

    const jobs = careerJobs(mour, extra);
    const visits = careerVisits(jobs);
    const mYears = d3.range(d3.min(jobs, j => j.year), d3.max(jobs, j => j.year) + 1);
    const mClubs = new Set(jobs.map(j => j.club));
    const mLongest = longestStay(jobs);
    const mCareerT = { title: d3.sum(jobs, j => j.title), cup: d3.sum(jobs, j => j.cup), euro: d3.sum(jobs, j => j.euro) };
    const countryRun = visits.map(v => v.country).filter((c, i, a) => c !== a[i - 1]);
    const countries = [...new Set(countryRun)];
    const titleCountries = new Set(jobs.filter(j => j.title).map(j => j.country));

    const F = { seasons: fSeasons.length, clubs: new Set(fSeasons.map(s => s.clubId)).size, longest: d3.max(fSeasons, s => s.tenure.length), trophies: total(fT) };
    const M = { seasons: mSeasons.length, clubs: new Set(mSeasons.map(s => s.clubId)).size, longest: d3.max(mSeasons, s => s.tenure.length), trophies: total(mT) };
    const fRate = F.trophies / F.seasons, mRate = M.trophies / M.seasons;

    const stats = tenureStats();
    const multiRow = stats.find(d => d.b === "multi"), longRow = stats.find(d => d.b === 5);
    const cstats = clubStats();
    const corr = pearson(cstats.map(d => d.avg), cstats.map(d => d.perSeason));
    const allAvg = d3.mean(cstats, d => d.avg);
    const winners = [...cstats].sort((a, b) => b.perSeason - a.perSeason).slice(0, 3);
    const winnersAvg = d3.mean(winners, d => d.avg);
    const stable = [...cstats].sort((a, b) => b.avg - a.avg).slice(0, 2);
    const poorest = [...cstats].sort((a, b) => a.perSeason - b.perSeason)[0];
    const firstYear = startYear(DB.seasonList[0]), lastYear = startYear(DB.seasonList[DB.seasonList.length - 1]);
    const allRange = `${DB.seasonList[0]} – ${DB.seasonList[DB.seasonList.length - 1]}`;
    const fRange = `${sn(fFirstYear - 1)} – ${sn(fLastYear)}`;
    const shortName = n => ({ "Bayern München": "Bayern", "Manchester United": "Man United", "Manchester City": "Man City" }[n] || n);
    const listAnd = a => a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}` : a[0] || "";

    const chips = t => [["euro", "European"], ["title", "league"], ["cup", "cup"]].filter(([k]) => t[k])
        .map(([k, l]) => `<span class="st-chip">${introShield(k, 13)}${t[k]} ${l}</span>`).join("");

    const SCENES = [
        { name: "Intro", dur: 0 },
        {
            name: "November 1986", dur: 9, layer: "heat", row: "united", kicker: "01 · Manchester United", title: "November 1986.",
            body: `United appoint a manager from Aberdeen: Alex Ferguson. Every block is one season.${dryStart > 0 ? ` His first ${word(dryStart)} bring nothing at all. Today, that is usually where the story ends.` : ""}`,
            caption: `Manchester United · ${fRange}`, portrait: ["ferguson-1986.jpg", ferg], ring: DEEP_GREEN,
        },
        {
            name: "He stays", dur: 14, layer: "heat", row: "united", kicker: "02 · Stability", title: "Then the club simply keeps him.",
            big: `${F.seasons} seasons`, bigColor: TENURE_COLORS[2],
            body: "The longer a manager stays, the darker the green. The shields are what he won: silver for the league, bronze for the cup, gold for Europe.",
            chips: chips(fT), caption: `Manchester United · ${fRange}`, portrait: ["ferguson-trophy.jpg", ferg], ring: DEEP_GREEN,
        },
        {
            name: "Mourinho", dur: 15, layer: "heat", row: "mourinho", kicker: "03 · The counter-argument", title: "Now meet José Mourinho.",
            body: `${countryRun.join(", ")}. Never longer than ${word(mLongest)} seasons in one go — and a league title in ${word(titleCountries.size)} of those ${word(countries.length)} countries.`,
            chips: chips(mCareerT), caption: `José Mourinho's clubs · ${sn(mYears[0])} – ${sn(mYears[mYears.length - 1])}`,
            source: jobs.some(j => j.extra) ? "Clubs outside the dataset: Wikipedia" : "", portrait: ["mourinho-porto.jpg", mour], ring: RED,
        },
        {
            name: "Head to head", dur: 9, layer: "duel", kicker: "04 · Two recipes", title: "Two recipes, one result.",
            body: `Ferguson stayed, and won. Mourinho moved, and won. ${Math.abs(fRate - mRate) < 0.1 ? "Per season they are almost level." : `Per season, ${mRate > fRate ? "Mourinho" : "Ferguson"} won a little more: ${fmtR(Math.max(fRate, mRate))} trophies against ${fmtR(Math.min(fRate, mRate))}.`} So which of them proves the rule?`,
            caption: "Head to head", source: `Seasons as main manager at the ${DB.clubs.length} clubs in the dataset`,
        },
        {
            name: "All seasons", dur: 11, layer: "bars", kicker: "05 · Every season",
            title: longRow.any > multiRow.any ? "Across all seasons, staying pays." : "Across all seasons, staying does not pay.",
            body: `Take every season at the ${statsClubs()} clubs where we know every change. With more than one manager in a season, a club wins something in ${pct(multiRow.any)} of seasons. Under a manager who stays ten full seasons or more: ${pct(longRow.any)}.`,
            caption: `${statsClubs()} clubs with complete data · ${allRange}`,
        },
        {
            name: "Zoom to clubs", dur: 12, layer: "scatter", kicker: "06 · But look at the clubs",
            title: Math.abs(corr) < 0.3 ? "At club level, the link almost disappears." : "At club level, the link holds.",
            body: `The clubs that win most per season — ${listAnd(winners.map(d => shortName(d.club.naam)))} — keep a manager ${d3.format(".1f")(winnersAvg)} seasons on average, ${winnersAvg <= allAvg ? "no longer than" : "about as long as"} the average club (${d3.format(".1f")(allAvg)}). Managers who win get to stay: stability may be a reward for success as much as a recipe for it.`,
            caption: `Each logo is a club · ${allRange}`, source: `correlation ${fmtR(corr)}`,
        },
        {
            name: "Your turn", dur: 0, layer: "end", kicker: "07 · Your turn", title: "Find your own Ferguson.",
            body: `Or your own Mourinho. Every season, every club, every manager in ${word(COUNTRIES.length)} leagues since ${firstYear}.`, cta: true,
        },
    ];
    const playSeconds = d3.sum(SCENES, s => s.dur);

    // ---------- Titelscherm ----------
    const root = $("intro");
    $("hero-photo-f").style.backgroundImage = photoBg("ferguson-hero.jpg", wikiThumb(ferg.foto_url, 960));
    $("hero-photo-m").style.backgroundImage = photoBg("mourinho-hero.jpg", wikiThumb(mour.foto_url, 960));
    const miniBar = list => `<span class="hero-bar">${list.map(([c, w]) => `<i style="background:${c};width:${w}px"></i>`).join("")}</span>`;
    const visitColor = v => {
        const own = jobs.filter(j => j.club === v.club && j.year >= v.first && j.year <= v.last);
        return own.every(j => j.multi) ? RED : TENURE_COLORS[own.find(j => !j.multi).bucket];
    };
    $("hero-name-f").innerHTML = `<span class="hero-who">Sir Alex Ferguson</span><span class="hero-what">${plural(F.clubs, "club", "clubs")} · ${F.seasons} seasons</span>${miniBar([[DEEP_GREEN, 84]])}`;
    $("hero-name-m").innerHTML = `<span class="hero-who">José Mourinho</span><span class="hero-what">${plural(mClubs.size, "club", "clubs")} · never more than ${word(mLongest)} seasons</span>${miniBar(visits.map(v => [visitColor(v), 12]))}`;
    $("hero-kicker").textContent = `${DB.seasonList.length} seasons · ${DB.clubs.length} clubs · ${COUNTRIES.length} leagues`;
    $("hero-sub").textContent = `One stayed ${F.longest} seasons at one club. The other never stayed longer than ${word(mLongest)}. Both won almost everything.`;
    $("btn-begin").innerHTML = `${PLAY_ICON}Play the story · ${Math.max(1, Math.ceil(playSeconds / 60))} min`;

    // ---------- Laag: seizoensrij ----------
    const heat = $("layer-heat");
    const narrow = () => window.innerWidth < 1150;
    const tiny = () => window.innerWidth < 760;
    const cellHTML = (slices, prizes, d, pd) =>
        `<div class="h-cell" style="--d:${d}ms;--pd:${pd}ms">${slices.length ? slices.map(c => `<div class="h-slice" style="background:${c}"></div>`).join("") : '<div class="h-slice empty"></div>'}${prizes.length ? `<div class="h-shields">${prizes.map(cellShield).join("")}</div>` : ""}</div>`;
    const prizeList = list => list.flatMap(x => PRIZE_ORDER.filter(k => x[k]));
    const axisHTML = (years, isLast, every, endGap) => `<div class="h-axis">${years.map((y, i) => {
        const last = i === years.length - 1;
        const show = isLast && last ? true : y % every === 0 && i < years.length - endGap;
        return `<div class="h-tick${last && isLast ? " end" : ""}">${show ? sn(y) : ""}</div>`;
    }).join("")}</div>`;

    // Rij Manchester United, vóór Ferguson t/m zijn laatste seizoen
    const uYears = d3.range(fFirstYear - 1, fLastYear + 1);
    const uPos = y => (uYears.indexOf(y) / uYears.length) * 100;
    function unitedHTML() {
        const cells = uYears.map(y => {
            const s = muByYear.get(y);
            if (!s) return cellHTML([], [], 0, 0);
            const slices = s.multi ? d3.range(Math.min(5, s.nCoaches)).map(() => RED) : [TENURE_COLORS[s.tenure.bucket]];
            return cellHTML(slices, prizeList([s]), 0, 0).replace('class="h-cell"', `class="h-cell" data-year="${y}"`);
        }).join("");
        const every = tiny() ? 10 : narrow() ? 5 : 3;
        return `<div class="h-anns"></div>
            <div class="h-row"><div class="h-label"><img class="h-logo${logoClass(mu)}" src="${esc(mu.logo_url)}" alt=""><span class="h-name">${esc(mu.naam)}</span></div><div class="h-cells">${cells}</div></div>
            ${axisHTML(uYears, false, every, 2)}`;
    }

    // Rij Mourinho: één seizoen per blok. Meer clubs in één seizoen of meer trainers: rode stukken.
    const mJobsByYear = d3.group(jobs, j => j.year);
    function mourinhoHTML() {
        const cells = mYears.map((y, i) => {
            const list = mJobsByYear.get(y) || [];
            if (!list.length) return cellHTML([], [], i * 400, i * 400 + 650);
            const slices = list.length > 1 ? list.map(() => RED)
                : list[0].multi ? d3.range(list[0].k).map(() => RED) : [TENURE_COLORS[list[0].bucket]];
            return cellHTML(slices, prizeList(list), i * 400, i * 400 + 650);
        }).join("");
        const film = visits.map(v => `<div class="film-item">
            <span class="film-logo">${v.logo ? `<img class="${v.invert.trim()}" src="${esc(v.logo)}" alt="">` : ""}</span>
            <span class="film-cc">${CODE_OF_COUNTRY[v.country] || ""}</span><span class="film-name">${esc(v.club)}</span></div>`).join("");
        return `<div class="h-anns"></div>
            <div class="h-row film-row"><div class="h-label film"><div class="film-track">${film}</div></div><div class="h-cells">${cells}</div></div>
            ${axisHTML(mYears, true, tiny() ? 10 : 5, 6)}`;
    }

    // Aantekeningen boven de rij; in de laatste 30% klappen ze naar links van hun lijn
    function annHTML(list) {
        return list.map((a, i) => {
            const flip = a.left > 70;
            return `<div class="h-ann${flip ? " flip" : ""}" style="left:${a.left}%;height:${22 + (i % 2) * 22}px;--c:${a.color};--ad:${a.delay}ms">${esc(a.text)}</div>`;
        }).join("");
    }

    let filmTimers = [];
    function setFilm(j) {
        const items = heat.querySelectorAll(".film-item");
        items.forEach((el, i) => {
            const dd = Math.abs(i - j);
            el.style.opacity = dd === 0 ? 1 : dd === 1 ? 0.45 : dd === 2 ? 0.2 : 0.08;
            el.style.transform = `scale(${i === j ? 1.18 : 0.86})`;
        });
        const track = heat.querySelector(".film-track");
        if (track) track.style.transform = `translateY(${-j * 44}px)`;
        const v = visits[j];
        const left = ((v.first - mYears[0]) / mYears.length) * 100;
        heat.querySelector(".h-anns").innerHTML = annHTML([{ text: `${v.season} · ${v.club}`, left, color: TENURE_COLORS[1], delay: 0 }]);
        requestAnimationFrame(() => heat.querySelectorAll(".h-ann").forEach(el => el.classList.add("on")));
    }

    // Wanneer de filmstrip naar een club schuift: bij het eerste blok van dat bezoek
    const visitTimes = visits.map((v, j) => {
        const sameSeason = visits.slice(0, j).filter(w => w.first === v.first && w.last === v.first).length;
        return 60 + (v.first - mYears[0]) * 400 + sameSeason * 200;
    });

    function renderHeat(n, prev, instant) {
        const sc = SCENES[n];
        const sameRow = prev && SCENES[prev]?.row === sc.row && heat.dataset.row === sc.row;
        heat.classList.remove("armed");
        if (!sameRow || instant) {
            heat.innerHTML = sc.row === "united" ? unitedHTML() : mourinhoHTML();
            heat.dataset.row = sc.row;
            heat.querySelectorAll("img").forEach(img => img.addEventListener("error", () => { img.style.visibility = "hidden"; }, { once: true }));
        }
        heat.classList.toggle("show-prizes", n >= 2 && instant);
        filmTimers.forEach(clearTimeout); filmTimers = [];

        if (sc.row === "united") {
            const until = n === 1 ? fFirstYear + Math.max(dryStart, 1) - 1 : fLastYear;
            const delay = y => n === 1 ? (y - uYears[0]) * 260 : Math.max(0, y - (firstTrophy?.year ?? fFirstYear)) * 270;
            heat.querySelectorAll(".h-cell[data-year]").forEach(el => {
                const y = +el.dataset.year;
                el.style.setProperty("--d", `${delay(y)}ms`);
                el.style.setProperty("--pd", `${delay(y) + (n === 2 ? 650 : 200)}ms`);
                if (y > until || !sameRow || instant) el.classList.toggle("on", instant && y <= until);
            });
            const anns = n === 1
                ? [{ text: `November ${fFirstYear} · Ferguson arrives`, left: uPos(fFirstYear), color: TENURE_COLORS[1], delay: 400 }]
                : [
                    firstTrophy && { text: `First trophy · ${firstTrophy.title ? "League title" : firstTrophy.cup ? CUP_NAME[mu.land] || "Cup" : "Europe"} ${firstTrophy.year + 1}`, left: uPos(firstTrophy.year), color: INTRO_SHIELD[firstTrophy.title ? "title" : firstTrophy.cup ? "cup" : "euro"], delay: 600 },
                    lastTitle && { text: `Last league title · ${lastTitle.year + 1}`, left: uPos(lastTitle.year) + 100 / uYears.length, color: INTRO_SHIELD.title, delay: delay(lastTitle.year) + 1200 },
                ].filter(Boolean);
            heat.querySelector(".h-anns").innerHTML = annHTML(anns);
            if (instant) heat.querySelectorAll(".h-ann").forEach(el => el.classList.add("on"));
            arm(heat, instant, () => {
                heat.classList.toggle("show-prizes", n >= 2);
                heat.querySelectorAll(".h-cell[data-year]").forEach(el => el.classList.toggle("on", +el.dataset.year <= until));
                heat.querySelectorAll(".h-ann").forEach(el => el.classList.add("on"));
            });
        } else {
            heat.classList.add("show-prizes");
            if (instant || reduceMotion) {
                arm(heat, true, () => heat.querySelectorAll(".h-cell").forEach(el => el.classList.add("on")));
                setFilm(visits.length - 1);
                return;
            }
            heat.querySelectorAll(".h-cell").forEach(el => el.classList.remove("on"));
            arm(heat, false, () => heat.querySelectorAll(".h-cell").forEach(el => el.classList.add("on")));
            setFilm(0);
            visits.forEach((v, j) => { if (j) filmTimers.push(setTimeout(() => setFilm(j), visitTimes[j])); });
        }
    }

    // ---------- Laag: duel ----------
    function renderDuel(instant) {
        const layer = $("layer-duel");
        const metrics = [
            ["Seasons in charge", F.seasons, M.seasons, d => d],
            ["Clubs", F.clubs, M.clubs, d => d],
            ["Longest stay", F.longest, M.longest, d => d],
            ["Trophies", F.trophies, M.trophies, d => d],
            ["Trophies per season", fRate, mRate, fmtR],
        ];
        layer.innerHTML = `<div class="duel">
            <div class="duel-row duel-head"><div class="dr-f"><span class="duel-who">Ferguson</span><i style="background:${DEEP_GREEN}"></i></div><span></span><div class="dr-m"><i style="background:${RED}"></i><span class="duel-who">Mourinho</span></div></div>
            ${metrics.map(([label, f, m, fmt], i) => {
                const mx = Math.max(f, m) || 1;
                return `<div class="duel-row" style="--d:${i * 220}ms;--d2:${i * 220 + 500}ms">
                    <div class="dr-f"><span class="duel-v">${fmt(f)}</span><div class="duel-bar f" style="--w:${(f / mx) * 100}%"></div></div>
                    <span class="duel-label">${label}</span>
                    <div class="dr-m"><div class="duel-bar m" style="--w:${(m / mx) * 100}%"></div><span class="duel-v">${fmt(m)}</span></div>
                </div>`;
            }).join("")}</div>`;
        arm(layer, instant);
    }

    // ---------- Laag: staven (alle seizoenen) ----------
    function renderBars(instant) {
        const layer = $("layer-bars");
        const yMax = Math.max(0.6, Math.ceil(d3.max(stats, d => d.any) * 5) / 5);
        const grid = d3.range(0, yMax + 0.001, 0.2);
        const label = d => d.b === "multi" ? "2+" : ["1", "2", "3–4", "5–6", "7–9", "10+"][d.b];
        const sub = d => d.b === "multi" ? "managers" : d.b === 0 ? "season" : "seasons";
        layer.innerHTML = `<div class="bars-plot">
                ${grid.map(v => `<div class="bars-grid" style="bottom:${(v / yMax) * 100}%"><span>${Math.round(v * 100)}%</span></div>`).join("")}
                <div class="bars-cols">${stats.map((d, i) => `<div class="bars-col" style="--d:${i * 180}ms;--d2:${i * 180 + 600}ms">
                    <span class="bars-v">${pct(d.any)}</span>
                    <div class="bars-bar${d.b === "multi" ? " split" : ""}" style="--h:${(d.any / yMax) * 100}%">${d.b === "multi" ? "<i></i><i></i><i></i>" : `<i style="background:${TENURE_COLORS[d.b]}"></i>`}</div>
                </div>`).join("")}</div>
            </div>
            <div class="bars-labels">${stats.map(d => `<div><b>${label(d)}</b><span>${sub(d)} · ${d3.format(",")(d.n)}</span></div>`).join("")}</div>
            <p class="bars-note">Share of seasons with at least one trophy · by how many full seasons the manager stayed (2+ = more than one manager that season)</p>`;
        arm(layer, instant);
    }

    // ---------- Laag: spreiding per club ----------
    function renderScatter(instant) {
        const layer = $("layer-scatter");
        layer.innerHTML = "";
        const W = layer.clientWidth || 700, H = layer.clientHeight || 400;
        const m = { top: 40, right: 30, bottom: 44, left: 52 };
        const svg = d3.select(layer).append("svg").attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);
        const x = d3.scaleLinear().domain([1, Math.ceil(d3.max(cstats, d => d.avg))]).range([m.left, W - m.right]);
        const y = d3.scaleLinear().domain([0, Math.ceil(d3.max(cstats, d => d.perSeason) * 4) / 4]).range([H - m.bottom, m.top]);
        svg.append("g").attr("class", "sc-grid").selectAll("line.v").data(x.ticks(6)).join("line")
            .attr("x1", x).attr("x2", x).attr("y1", m.top).attr("y2", H - m.bottom);
        svg.append("g").attr("class", "sc-grid").selectAll("line.h").data(y.ticks(4)).join("line")
            .attr("x1", m.left).attr("x2", W - m.right).attr("y1", y).attr("y2", y);
        svg.append("path").attr("class", "sc-axis").attr("d", `M${m.left},${m.top}V${H - m.bottom}H${W - m.right}`);
        svg.append("g").selectAll("text").data(x.ticks(6)).join("text").attr("class", "sc-tick")
            .attr("x", x).attr("y", H - m.bottom + 18).attr("text-anchor", "middle").text(d => d);
        svg.append("g").selectAll("text").data(y.ticks(4)).join("text").attr("class", "sc-tick")
            .attr("x", m.left - 10).attr("y", y).attr("dy", ".35em").attr("text-anchor", "end").text(fmtR);
        svg.append("text").attr("class", "sc-axis-label").attr("x", W - m.right).attr("y", H - 6).attr("text-anchor", "end")
            .html(`more stable → <tspan class="muted">average seasons per manager</tspan>`);
        svg.append("text").attr("class", "sc-axis-label").attr("x", m.left).attr("y", m.top - 16).text("↑ more trophies per season");

        // Trendlijn (kleinste kwadraten) over het bereik van de data
        const mx = d3.mean(cstats, d => d.avg), my = d3.mean(cstats, d => d.perSeason);
        const slope = d3.sum(cstats, d => (d.avg - mx) * (d.perSeason - my)) / d3.sum(cstats, d => (d.avg - mx) ** 2);
        const x0 = d3.min(cstats, d => d.avg), x1 = d3.max(cstats, d => d.avg);
        const trend = svg.append("line").attr("class", "sc-trend")
            .attr("x1", x(x0)).attr("y1", y(my + slope * (x0 - mx))).attr("x2", x(x1)).attr("y2", y(my + slope * (x1 - mx)))
            .attr("opacity", instant ? 1 : 0);
        if (!instant) trend.transition().delay(1400).duration(600).attr("opacity", 1);

        const labelled = new Map([...winners, ...stable, poorest].map(d => [d.club.naam, d]));
        const R = 19;
        const nodes = svg.append("g").selectAll("g").data([...cstats].sort((a, b) => labelled.has(a.club.naam) - labelled.has(b.club.naam))).join("g")
            .attr("class", "sc-dot");
        nodes.append("circle").attr("r", R).attr("class", d => labelled.has(d.club.naam) ? "ring" : "");
        nodes.append("image").attr("href", d => d.club.logo_url).attr("width", 28).attr("height", 28).attr("x", -14).attr("y", -14)
            .attr("class", d => logoClass(d.club).trim())
            .on("error", function () { d3.select(this).style("display", "none"); });
        nodes.append("title").text(d => `${d.club.naam}: ${fmtR(d.avg)} seasons per manager, ${fmtR(d.perSeason)} trophies per season`);
        // Labels in een eigen bovenlaag. Alleen het logo staat op het datapunt; het label kiest
        // rechts, links, boven of onder, waar het geen ander logo of label raakt.
        const dots = cstats.map(d => ({ x: x(d.avg), y: y(d.perSeason) }));
        const placed = [];
        // Aantal botsingen van een labelvak met logo's, eerder geplaatste labels en de plotrand
        const overlaps = (bx, by, w, h) => dots.filter(p => p.x + R > bx && p.x - R < bx + w && p.y + R > by && p.y - R < by + h).length
            + 3 * placed.filter(r => r.x < bx + w && r.x + r.w > bx && r.y < by + h && r.y + r.h > by).length
            + (bx < m.left || bx + w > W - m.right || by < m.top - 10 || by + h > H - m.bottom ? 5 : 0);
        const labels = svg.append("g").selectAll("g").data(cstats.filter(d => labelled.has(d.club.naam))).join("g").attr("class", "sc-label");
        labels.each(function (d) {
            const px = x(d.avg), py = y(d.perSeason), text = shortName(d.club.naam), w = text.length * 7 + 12, h = 20;
            const options = [[R + 6, -h / 2], [-R - 6 - w, -h / 2], [-w / 2, -R - 6 - h], [-w / 2, R + 6],
                [R, -R - h], [-R - w, -R - h], [R, R], [-R - w, R], [-w / 2, -R - 30 - h], [R + 30, -h / 2], [-R - 30 - w, -h / 2]];
            const [tx, ty] = options.map(o => [...o, overlaps(px + o[0], py + o[1], w, h)]).reduce((a, b) => b[2] < a[2] ? b : a);
            placed.push({ x: px + tx, y: py + ty, w, h });
            const g = d3.select(this).attr("transform", `translate(${px},${py})`);
            g.append("rect").attr("x", tx).attr("y", ty).attr("width", w).attr("height", h).attr("rx", 5);
            g.append("text").attr("x", tx + 6).attr("y", ty + 14).text(text);
        });
        labels.attr("opacity", instant ? 1 : 0);
        if (!instant) labels.transition().delay(1000 + cstats.length * 90).duration(500).attr("opacity", 1);
        nodes.attr("transform", d => instant ? `translate(${x(d.avg)},${y(d.perSeason)})` : `translate(${x(1)},${y(0)}) scale(.2)`)
            .attr("opacity", instant ? 1 : 0);
        if (!instant) nodes.transition().delay((d, i) => 60 + i * 90).duration(1000).ease(d3.easeCubicOut)
            .attr("transform", d => `translate(${x(d.avg)},${y(d.perSeason)}) scale(1)`).attr("opacity", 1);
    }

    // ---------- Laag: slot (mozaïek van echte seizoenen) ----------
    const mosaicSeasons = d3.range(72).map(i => DB.seasons[Math.floor((i * 2654435761) % DB.seasons.length)]);
    function renderEnd(instant) {
        const layer = $("layer-end");
        layer.innerHTML = `<div class="mosaic">${mosaicSeasons.map((s, i) => `<i style="background:${s.unknown ? "#2a3531" : s.multi ? RED : TENURE_COLORS[s.tenure.bucket]};--d:${((i * 53) % 72) * 18}ms"></i>`).join("")}</div>
            <span class="mosaic-note">${d3.format(",")(DB.seasons.length)} seasons · ${DB.clubs.length} clubs · ${COUNTRIES.length} leagues</span>`;
        arm(layer, instant);
    }

    function arm(layer, instant, fn) {
        clearTimeout(layer.armTimer);
        if (instant || reduceMotion) { layer.classList.add("armed", "instant"); fn?.(); return; }
        layer.classList.remove("armed", "instant");
        void layer.offsetWidth;
        layer.armTimer = setTimeout(() => { layer.classList.add("armed"); fn?.(); }, 60);
    }

    // ---------- Tekstkolom ----------
    const stageText = $("stage-text");
    function renderText(sc) {
        const [file, coach] = sc.portrait || [];
        stageText.innerHTML = `
            ${sc.portrait ? `<div class="st-portrait" style="--ring:${sc.ring}" role="img" aria-label="${esc(coach.naam)}"></div>` : ""}
            <p class="st-kicker">${esc(sc.kicker)}</p>
            <h2 class="st-title">${esc(sc.title)}</h2>
            ${sc.big ? `<span class="st-big" style="color:${sc.bigColor}">${esc(sc.big)}</span>` : ""}
            <p class="st-body">${esc(sc.body)}</p>
            ${sc.chips ? `<div class="st-chips">${sc.chips}</div>` : ""}
            ${sc.cta ? `<div class="st-ctas"><a class="st-cta" href="explore.html">Open the explorer →</a><a class="st-more" href="articles/architectjourneyman.html">Read the full story</a></div>` : ""}`;
        const portrait = stageText.querySelector(".st-portrait");
        if (portrait) portrait.style.backgroundImage = photoBg(file, wikiThumb(coach.foto_url, 500));
        stageText.classList.remove("enter");
        void stageText.offsetWidth;
        stageText.classList.add("enter");
    }

    // ---------- Bediening ----------
    const segs = $("c-segs");
    segs.innerHTML = SCENES.slice(1).map((s, i) => `<button class="c-seg" type="button" data-step="${i + 1}" title="${esc(s.name)}"><span class="c-track"><span class="c-fill"></span></span><span class="c-name">${esc(s.name)}</span></button>`).join("");
    segs.addEventListener("click", e => { const b = e.target.closest("[data-step]"); if (b) go(+b.dataset.step); });

    const clock = { step: 0, playing: false, t: 0, last: 0, inView: true };
    function setPlaying(p) {
        clock.playing = p && SCENES[clock.step].dur > 0;
        $("c-play").innerHTML = clock.playing ? PAUSE_ICON : PLAY_ICON;
        $("c-play").setAttribute("aria-label", clock.playing ? "Pause" : "Play");
        clock.last = performance.now();
    }
    function updateSegs() {
        segs.querySelectorAll(".c-seg").forEach(b => {
            const idx = +b.dataset.step, sc = SCENES[idx];
            const fill = idx < clock.step ? 1 : idx > clock.step ? 0 : sc.dur ? Math.min(1, clock.t / sc.dur) : 1;
            b.querySelector(".c-fill").style.width = `${fill * 100}%`;
            b.classList.toggle("current", idx === clock.step);
            b.classList.toggle("done", idx < clock.step);
        });
    }

    const LAYERS = { heat: "layer-heat", duel: "layer-duel", bars: "layer-bars", scatter: "layer-scatter", end: "layer-end" };
    function render(n, prev, instant) {
        const sc = SCENES[n];
        root.dataset.step = n;
        Object.entries(LAYERS).forEach(([k, id]) => $(id).classList.toggle("active", sc.layer === k));
        if (!n) return;
        $("panel-caption").textContent = sc.caption || "";
        $("panel-source").textContent = sc.source || "";
        $("c-next").textContent = n === SCENES.length - 1 ? "Explore →" : "Next →";
        $("c-next").title = n === SCENES.length - 1 ? "Open the explorer (→)" : "Next (→)";
        renderText(sc);
        if (sc.layer === "heat") renderHeat(n, prev, instant);
        if (sc.layer === "duel") renderDuel(instant);
        if (sc.layer === "bars") renderBars(instant);
        if (sc.layer === "scatter") renderScatter(instant);
        if (sc.layer === "end") renderEnd(instant);
    }

    // Volgende: na de laatste scène door naar de verkenner
    const last = SCENES.length - 1;
    function next() {
        if (clock.step === last) location.href = "explore.html";
        else go(clock.step + 1);
    }

    function go(n, play) {
        n = Math.max(0, Math.min(SCENES.length - 1, n));
        const prev = clock.step;
        clock.step = n;
        clock.t = 0;
        try { localStorage.setItem(INTRO_KEY, String(n)); } catch { /* opslag geblokkeerd */ }
        render(n, prev, false);
        setPlaying(play === undefined ? clock.playing : play);
        updateSegs();
    }

    function tick(now) {
        if (clock.playing && clock.inView) {
            clock.t += (now - clock.last) / 1000;
            const d = SCENES[clock.step].dur;
            if (d && clock.t >= d) go(clock.step + 1, true);
            else updateSegs();
        }
        clock.last = now;
        requestAnimationFrame(tick);
    }

    $("btn-begin").addEventListener("click", () => { go(1, true); root.focus({ preventScroll: true }); });
    $("c-play").addEventListener("click", () => setPlaying(!clock.playing));
    $("c-prev").addEventListener("click", () => go(clock.step - 1));
    $("c-next").addEventListener("click", next);

    document.addEventListener("keydown", e => {
        if (!clock.inView || e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
        if (e.key === "ArrowRight") { e.preventDefault(); next(); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); go(clock.step - 1); }
        else if (e.key === " " && !e.target.closest?.("button, a")) {
            e.preventDefault();
            if (clock.step === 0) go(1, true); else setPlaying(!clock.playing);
        }
    });

    // Vegen op een touchscherm: volgende / vorige scène
    let touch = null;
    $("stage").addEventListener("touchstart", e => { touch = e.touches[0]; }, { passive: true });
    $("stage").addEventListener("touchend", e => {
        if (!touch) return;
        const dx = e.changedTouches[0].clientX - touch.clientX, dy = e.changedTouches[0].clientY - touch.clientY;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) next(); else go(clock.step - 1); }
        touch = null;
    }, { passive: true });

    // Buiten beeld: klok stil
    new IntersectionObserver(([e]) => {
        clock.inView = e.intersectionRatio >= 0.5;
        clock.last = performance.now();
    }, { threshold: [0, 0.5, 1] }).observe(root);

    let rt, lastW = window.innerWidth, lastH = window.innerHeight;
    window.addEventListener("resize", () => {
        clearTimeout(rt);
        rt = setTimeout(() => {
            if (window.innerWidth === lastW && window.innerHeight === lastH) return;
            lastW = window.innerWidth; lastH = window.innerHeight;
            if (clock.step) render(clock.step, clock.step, true);
        }, 200);
    });

    // Via het logo (index.html?start): altijd bij het begin, anders verder waar je was
    let saved = 0;
    if (new URLSearchParams(location.search).has("start")) {
        try { localStorage.setItem(INTRO_KEY, "0"); } catch { /* opslag geblokkeerd */ }
        history.replaceState(null, "", location.pathname);
    } else {
        try { saved = parseInt(localStorage.getItem(INTRO_KEY) || "0", 10) || 0; } catch { /* opslag geblokkeerd */ }
    }
    clock.step = saved > 0 && saved < SCENES.length ? saved : 0;
    render(clock.step, null, true);
    setPlaying(false);
    updateSegs();
    requestAnimationFrame(now => { clock.last = now; requestAnimationFrame(tick); });
}


// ------------------------------------------------------------------
// Explorer
// ------------------------------------------------------------------
const VIEWS = [
    { id: "league", name: "League", desc: "Every club in one country, season by season",
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="16" width="18" height="4" rx="1"/></svg>' },
    { id: "compare", name: "Compare clubs", desc: "Put any clubs side by side, across leagues",
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M4 6h10M4 12h16M4 18h7"/></svg>' },
    { id: "career", name: "Career", desc: "Follow one manager from club to club",
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 19c4 0 3-7 7-7s3-7 7-7"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/></svg>' },
];
const COUNTRY_CODE = { England: "ENG", France: "FRA", Germany: "GER", Italy: "ITA", Netherlands: "NED", Portugal: "POR", Spain: "ESP" };
const DEFAULT_CLUBS = ["Manchester United", "Arsenal", "Real Madrid", "Bayern München", "Juventus"];
const DEFAULT_COACH = "José Mourinho";
const SEARCH_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8a978f" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
const CELL_GAP = 2;

const state = { view: "league", country: "England", clubs: [], career: null, search: "" };
// menu: open popover (één tegelijk). hovered: seizoen onder de muis. locked: vastgezette tenure.
const ui = { menu: null, hovered: null, locked: null, hasUnknown: false, width: 0, coachNames: [] };
const $ = id => document.getElementById(id);
const norm = s => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const initials = name => String(name).split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase();
const composedHas = (e, selector) => e.composedPath().some(el => el instanceof Element && el.matches(selector));

// Weergave-eenheid in de verkenner: een tenure zonder gebroken seizoenen aan het begin of eind.
// Kwam een trainer halverwege een seizoen binnen (of vertrok hij halverwege), dan staat dat
// gesplitste seizoen los. De kleur blijft die van de tenure: die telt alleen volle seizoenen.
// De statistieken in het intro rekenen met de tenures zelf en veranderen hierdoor niet.
function buildSpells() {
    new Set(DB.seasons.map(s => s.tenure)).forEach(t => {
        const list = t.seasons;
        let a = 0, b = list.length - 1;
        while (a <= b && list[a].multi) a++;
        while (b >= a && list[b].multi) b--;
        list.forEach((x, i) => { if (i < a || i > b) x.spell = { id: x.key, split: true, tenure: t, seasons: [x] }; });
        if (a > b) return;
        const core = list.slice(a, b + 1);
        const spell = { id: `${t.id}|core`, split: false, tenure: t, seasons: core, first: core[0].season, last: core[core.length - 1].season, trophies: trophiesOf(core) };
        core.forEach(x => { x.spell = spell; });
    });
}

function buildExplorer() {
    DB.seasonByKey = new Map(DB.seasons.map(s => [s.key, s]));
    buildSpells();
    // Trainers voor de carrièrelijst: meeste seizoenen bovenaan
    const counts = d3.rollup(DB.seasons.filter(s => !s.unknown), v => v.length, s => s.coach);
    ui.coachNames = [...counts.keys()].sort((a, b) => d3.descending(counts.get(a), counts.get(b)) || d3.ascending(a, b));
    d3.select("#coach-list").selectAll("option").data([...ui.coachNames].sort(d3.ascending)).join("option").attr("value", d => d);

    $("btn-view").addEventListener("click", () => toggleMenu("view"));
    $("btn-context").addEventListener("click", () => toggleMenu("context"));
    $("coach-search").addEventListener("input", e => { state.search = e.target.value; applyHighlight(); });
    $("hl-count").addEventListener("click", () => { state.search = ""; $("coach-search").value = ""; applyHighlight(); $("coach-search").focus(); });
    $("share-btn").addEventListener("click", copyLink);

    // Eén popover tegelijk; klik erbuiten of Escape sluit hem
    document.addEventListener("click", e => {
        if (!ui.menu || composedHas(e, ".popover, #btn-view, #btn-context, #add-club-btn")) return;
        ui.menu = null; renderMenus();
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && ui.menu) { ui.menu = null; renderMenus(); } });

    const stage = $("explorer-stage");
    stage.addEventListener("mouseover", e => {
        const cell = e.target.closest(".seg.live .cell[data-key]");
        if (!cell) return;
        const d = DB.seasonByKey.get(cell.dataset.key);
        if (d !== ui.hovered) { ui.hovered = d; showInfo(); }
    });
    stage.addEventListener("mouseleave", () => { if (ui.hovered) { ui.hovered = null; showInfo(); } });
    stage.addEventListener("click", e => {
        const rm = e.target.closest(".row-remove");
        if (rm) { state.clubs = state.clubs.filter(id => id !== rm.dataset.remove); ui.locked = null; renderExplorer(); return; }
        if (e.target.closest("#add-club-btn")) { toggleMenu("add"); return; }
        const cell = e.target.closest(".seg.live .cell[data-key]");
        const t = cell ? DB.seasonByKey.get(cell.dataset.key).spell : null;
        ui.locked = t && ui.locked !== t ? t : null;
        // Op een touchscherm is er geen hover: toon dan meteen de vastgezette trainer
        if (!window.matchMedia("(hover: hover)").matches) ui.hovered = null;
        applySelection();
        showInfo();
    });

    const covered = DB.coverage.size;
    $("coverage-note").textContent = covered < DB.clubs.length
        ? `Seasons with more than one manager (split blocks) are known for ${covered} of ${DB.clubs.length} clubs so far.` : "";

    let rt;
    window.addEventListener("resize", () => {
        clearTimeout(rt);
        rt = setTimeout(() => { if (stage.clientWidth !== ui.width) { renderGrid(); renderMenus(); } }, 150);
    });
}

function setView(view) {
    state.view = view;
    if (view === "compare" && !state.clubs.length) state.clubs = DEFAULT_CLUBS.map(n => clubByName(n)?.id).filter(Boolean);
    if (view === "career" && !state.career && coachByName(DEFAULT_COACH)) state.career = DEFAULT_COACH;
    ui.menu = null;
    ui.locked = null;
    renderExplorer();
}

function explorerRows() {
    if (state.view === "league") return DB.clubs.filter(c => c.land === state.country).map(c => c.id);
    if (state.view === "compare") return state.clubs;
    const c = state.career && coachByName(state.career);
    return c ? [...new Set(seasonsOfCoach(c.id).map(s => s.clubId))] : [];
}

function renderExplorer() {
    const view = VIEWS.find(v => v.id === state.view);
    $("view-name").textContent = view.name;
    $("context-kind").textContent = { league: "Country", compare: "Clubs", career: "Manager" }[state.view];
    $("context-value").textContent = state.view === "league" ? state.country
        : state.view === "compare" ? plural(state.clubs.length, "club", "clubs") : state.career || "Choose…";

    // Zoekveld blijft op zijn plek; in Career uitgeschakeld
    const career = state.view === "career";
    const input = $("coach-search");
    input.disabled = career;
    input.placeholder = career ? "Not needed in Career" : "Highlight a manager";
    input.value = career ? "" : state.search;
    $("highlight").classList.toggle("disabled", career);

    renderGrid();
    showInfo();
    updateHash();
    renderMenus();
}

// ---------- Grid ----------
function cellHTML(d, w) {
    if (!d) return `<div class="cell empty" style="width:${w}px"><div class="slice"></div></div>`;
    const prizes = PRIZE_ORDER.filter(k => d[k]).map(k => shieldSVG(k)).join("");
    const trophies = prizes ? `<div class="trophies">${prizes}</div>` : "";
    if (d.unknown) return `<div class="cell unknown" data-key="${esc(d.key)}" style="width:${w}px"><div class="slice"></div>${trophies}</div>`;
    // Meer trainers in één seizoen: k gelijke rode stukken (max 5), gescheiden door een naad van 2px
    const k = d.multi ? Math.min(5, d.nCoaches) : 1;
    const bg = d.multi ? "#FF0033" : TENURE_COLORS[d.tenure.bucket];
    return `<div class="cell" data-key="${esc(d.key)}" style="width:${w}px">${`<div class="slice" style="background:${bg}"></div>`.repeat(k)}${trophies}</div>`;
}

function renderGrid() {
    const stage = $("explorer-stage");
    ui.width = stage.clientWidth;
    const view = state.view;
    const career = view === "career", compare = view === "compare";
    const coach = career && state.career ? coachByName(state.career) : null;
    const rows = explorerRows();
    const narrow = ui.width < 640;
    const labelW = narrow ? (compare ? 64 : 44) : career ? 220 : 200;
    const addBtn = compare ? `<div class="add-club" style="min-width:${labelW}px"><button class="add-club-btn" id="add-club-btn" type="button" aria-haspopup="true"><span class="plus" aria-hidden="true">+</span>Add a club</button></div>` : "";
    ui.hasUnknown = false;

    if (!rows.length) {
        stage.innerHTML = `<div class="grid">${addBtn}</div><p class="empty-state">${career ? "Pick a manager to follow from club to club." : "Add clubs to compare them side by side."}</p>`;
        renderLegend();
        return;
    }

    // Kolommen: alle seizoenen; in Career alleen de periode van de trainer
    let columns = DB.seasonList;
    if (coach) {
        const list = seasonsOfCoach(coach.id);
        columns = DB.seasonList.filter(s => s >= list[0].season && s <= list[list.length - 1].season);
    }
    const n = columns.length;
    const cellW = Math.max(10, Math.min(career ? 34 : 25, Math.floor((ui.width - labelW - (n - 1) * CELL_GAP) / n)));

    const rowHTML = clubId => {
        const club = DB.clubById.get(clubId);
        const bySeason = new Map((DB.byClub.get(clubId) || []).map(s => [s.season, s]));
        // Aaneengesloten seizoenen van dezelfde periode vormen één segment; een gebroken seizoen aan de rand staat los
        const segs = [];
        let cur = null;
        columns.forEach(season => {
            let d = bySeason.get(season) || null;
            if (d && coach && d.coachId !== coach.id) d = null;
            if (d?.unknown) ui.hasUnknown = true;
            const tid = d ? d.spell.id : null;
            if (!cur || cur.tid !== tid) { cur = { tid, cells: [] }; segs.push(cur); }
            cur.cells.push(d);
        });
        const segHTML = segs.map(s => s.tid
            ? `<div class="seg live" data-tenure="${esc(s.tid)}">${s.cells.map(d => cellHTML(d, cellW)).join("")}</div>`
            : `<div class="seg">${s.cells.map(() => cellHTML(null, cellW)).join("")}</div>`).join("");
        return `<div class="grid-row">
            <div class="row-label" style="width:${labelW}px">
                <img class="row-logo${logoClass(club)}" src="${esc(club.logo_url)}" alt="">
                ${career ? `<span class="row-cc">${COUNTRY_CODE[club.land] || ""}</span>` : ""}
                ${narrow ? "" : `<span class="row-name" title="${esc(PREDECESSORS[club.naam] ? `${club.naam}. * ${PREDECESSORS[club.naam].note}` : club.naam)}">${esc(club.naam)}${PREDECESSORS[club.naam] ? '<sup class="row-star">*</sup>' : ""}</span>`}
                ${compare ? `<button class="row-remove" type="button" data-remove="${esc(clubId)}" title="Remove ${esc(club.naam)}" aria-label="Remove ${esc(club.naam)}">×</button>` : ""}
            </div>
            <div class="row-cells">${segHTML}</div>
        </div>`;
    };

    // As: seizoenslabel elke 5 jaar (of het eerste seizoen als de periode korter is)
    let ticks = columns.map(s => startYear(s) % 5 === 0 ? s : "");
    if (!ticks.some(Boolean)) ticks[0] = columns[0];
    const axis = `<div class="axis-row"><div class="axis-pad" style="width:${labelW - CELL_GAP}px"></div>${ticks.map(s => `<div class="tick" style="width:${cellW}px">${s}</div>`).join("")}</div>`;

    stage.innerHTML = `<div class="grid">${rows.map(rowHTML).join("")}${addBtn}${axis}</div>`;
    stage.querySelectorAll("img.row-logo").forEach(img => img.addEventListener("error", () => { img.style.visibility = "hidden"; }, { once: true }));
    applyHighlight();
    applySelection();
    ui.hasMerger = rows.some(id => PREDECESSORS[DB.clubById.get(id)?.naam]);
    renderLegend();
}

function renderLegend() {
    $("explorer-legend").innerHTML = legendHTML({ unknown: ui.hasUnknown, merger: ui.hasMerger, hint: true });
}

// Markeren: seizoenen van andere trainers vervagen tot .13
function applyHighlight() {
    const q = state.view === "career" ? "" : norm(state.search.trim());
    const match = d => !d.unknown && (norm(d.coach).includes(q) || (d.trainers || []).some(t => norm(t.naam).includes(q)));
    let count = 0;
    $("explorer-stage").querySelectorAll(".cell[data-key]").forEach(el => {
        const lit = !q || match(DB.seasonByKey.get(el.dataset.key));
        if (q && lit) count++;
        el.classList.toggle("dim", !lit);
    });
    const pill = $("hl-count");
    pill.classList.toggle("hidden", !q);
    pill.textContent = `${plural(count, "season", "seasons")} ×`;
}

function applySelection() {
    $("explorer-stage").querySelectorAll(".seg.live").forEach(el =>
        el.classList.toggle("selected", !!ui.locked && el.dataset.tenure === ui.locked.id));
}

// ---------- Popovers ----------
function toggleMenu(name) {
    ui.menu = ui.menu === name ? null : name;
    renderMenus();
}

function renderMenus() {
    const m = ui.menu;
    $("btn-view").setAttribute("aria-expanded", m === "view");
    $("btn-context").setAttribute("aria-expanded", m === "context");
    $("add-club-btn")?.setAttribute("aria-expanded", m === "add");

    const pv = $("pop-view");
    pv.classList.toggle("hidden", m !== "view");
    if (m === "view") {
        pv.innerHTML = VIEWS.map(v => `<button class="pop-item view-item${v.id === state.view ? " active" : ""}" type="button" role="menuitem" data-view="${v.id}">
            <span class="v-icon">${v.icon}</span><span class="v-text"><b>${v.name}</b><span class="v-desc">${v.desc}</span></span></button>`).join("");
        pv.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
    }

    const pc = $("pop-context");
    pc.classList.toggle("hidden", m !== "context");
    if (m === "context") renderContextMenu(pc);

    let pa = $("pop-add");
    if (m === "add" && $("add-club-btn")) {
        if (!pa) {
            pa = document.createElement("div");
            pa.id = "pop-add";
            pa.className = "popover pop-add";
            document.querySelector(".viz-panel").appendChild(pa);
        }
        // Buiten het scrollende grid geplaatst, anders valt hij weg achter overflow
        const panel = document.querySelector(".viz-panel").getBoundingClientRect();
        const btn = $("add-club-btn").getBoundingClientRect();
        pa.style.left = `${Math.max(0, btn.left - panel.left)}px`;
        pa.style.top = `${btn.bottom - panel.top + 4}px`;
        pa.innerHTML = `<div class="pop-search">${SEARCH_ICON}<input type="search" placeholder="Search ${DB.clubs.length} clubs…" autocomplete="off" aria-label="Search clubs"></div><div class="pop-list"></div>`;
        const input = pa.querySelector("input");
        const list = () => {
            const q = norm(input.value.trim());
            const clubs = DB.clubs.filter(c => !state.clubs.includes(c.id) && (!q || norm(c.naam).includes(q)));
            pa.querySelector(".pop-list").innerHTML = clubs.length
                ? clubs.map(c => `<button class="pop-item club-item" type="button" data-club="${esc(c.id)}"><img class="${logoClass(c).trim()}" src="${esc(c.logo_url)}" alt=""><span>${esc(c.naam)}</span><span class="note">${COUNTRY_CODE[c.land] || ""}</span></button>`).join("")
                : `<div class="pop-empty">No clubs found</div>`;
            pa.querySelectorAll("[data-club]").forEach(b => b.addEventListener("click", () => {
                state.clubs = [...state.clubs, b.dataset.club];
                ui.menu = null;
                renderExplorer();
            }));
        };
        input.addEventListener("input", list);
        list();
        input.focus();
    }
    pa?.classList.toggle("hidden", m !== "add");
}

function renderContextMenu(pc) {
    if (state.view === "league") {
        pc.innerHTML = `<div class="pop-list">${COUNTRIES.map(c => `<button class="pop-item" type="button" data-country="${c}"><span>${c}</span><span class="check">${c === state.country ? "✓" : ""}</span></button>`).join("")}</div>`;
        pc.querySelectorAll("[data-country]").forEach(b => b.addEventListener("click", () => {
            state.country = b.dataset.country; ui.menu = null; ui.locked = null; renderExplorer();
        }));
    } else if (state.view === "compare") {
        // Aan- en uitvinken zonder dat het menu sluit
        pc.innerHTML = `<div class="pop-list">${DB.clubs.map(c => `<button class="pop-item" type="button" data-club="${esc(c.id)}"><span>${esc(c.naam)}</span><span class="check">${state.clubs.includes(c.id) ? "✓" : ""}</span></button>`).join("")}</div>`;
        pc.querySelectorAll("[data-club]").forEach(b => b.addEventListener("click", () => {
            const id = b.dataset.club;
            state.clubs = state.clubs.includes(id) ? state.clubs.filter(x => x !== id) : [...state.clubs, id];
            const scroll = pc.querySelector(".pop-list").scrollTop;
            renderExplorer();
            pc.querySelector(".pop-list").scrollTop = scroll;
        }));
    } else {
        pc.innerHTML = `<div class="pop-search">${SEARCH_ICON}<input type="search" placeholder="Search ${ui.coachNames.length} managers…" autocomplete="off" aria-label="Search managers"></div><div class="pop-list"></div>`;
        const input = pc.querySelector("input");
        const list = () => {
            const q = norm(input.value.trim());
            const names = (q ? ui.coachNames.filter(n => norm(n).includes(q)) : ui.coachNames).slice(0, 40);
            pc.querySelector(".pop-list").innerHTML = names.length
                ? names.map(n => `<button class="pop-item" type="button" data-coach="${esc(n)}"><span>${esc(n)}</span><span class="check">${n === state.career ? "✓" : ""}</span></button>`).join("")
                : `<div class="pop-empty">No managers found</div>`;
            pc.querySelectorAll("[data-coach]").forEach(b => b.addEventListener("click", () => {
                state.career = b.dataset.coach; ui.menu = null; ui.locked = null; renderExplorer();
            }));
        };
        input.addEventListener("input", list);
        list();
        input.focus();
    }
}

async function copyLink() {
    updateHash();
    const url = `${location.origin}${location.pathname}#${hashFor()}`;
    const toast = $("share-toast");
    try { await navigator.clipboard.writeText(url); toast.textContent = "Link copied"; }
    catch { toast.textContent = "Copy the address bar"; }
    toast.classList.remove("hidden");
    clearTimeout(copyLink.timer);
    copyLink.timer = setTimeout(() => toast.classList.add("hidden"), 1800);
}

// ---------- Info pane ----------
function showInfo() {
    const pane = $("info-pane");
    const d = ui.hovered;
    const sp = d ? d.spell : ui.locked;
    if (sp) pane.innerHTML = sp.split && !sp.seasons[0].unknown ? splitSeasonHTML(sp.seasons[0]) : spellHTML(sp, d);
    else if (state.view === "career") pane.innerHTML = state.career ? careerHTML(state.career) : `<p class="info-default">Follow one manager from club to club.</p>`;
    else {
        const ids = state.view === "league" ? DB.clubs.filter(c => c.land === state.country).map(c => c.id) : state.clubs;
        pane.innerHTML = ids.length ? insightsHTML(ids) : `<p class="info-default">Add clubs to compare them side by side.</p>`;
    }
    // Geen of kapotte foto: initialen
    pane.querySelectorAll("img.info-photo").forEach(img => img.addEventListener("error", function onErr() {
        // Thumbnail mislukt (bijv. origineel kleiner dan 250px): eerst het originele bestand
        if (img.dataset.full && !img.dataset.triedFull) { img.dataset.triedFull = "1"; img.src = img.dataset.full; return; }
        img.removeEventListener("error", onErr);
        const div = document.createElement("div");
        div.className = "info-photo initials";
        div.textContent = img.dataset.initials;
        img.replaceWith(div);
    }));
}

// Infoblok: een kleine Wikimedia-thumbnail in plaats van het originele bestand (soms meerdere MB)
const photoHTML = (url, name) => url
    ? `<img class="info-photo" src="${esc(wikiThumb(url, 250))}" data-full="${esc(url)}" alt="" data-initials="${esc(initials(name))}">`
    : `<div class="info-photo initials">${esc(initials(name))}</div>`;

function chipsHTML(tr) {
    const chips = [["title", "league", "league"], ["cup", "cup", "cups"], ["euro", "European", "European"]]
        .filter(([k]) => tr[k]).map(([k, one, many]) => `<span class="chip">${shieldSVG(k)}${tr[k]} ${tr[k] === 1 ? one : many}</span>`);
    return `<div class="chips">${chips.length ? chips.join("") : `<span class="chip none">No trophies</span>`}</div>`;
}

const badgeHTML = (text, bucket) =>
    `<span class="tenure-badge" style="background:${TENURE_COLORS[bucket]};color:${TENURE_TEXT[bucket]}">${esc(text)}</span>`;

function infoCardHTML({ photo, name, nameHTML, nameTitle = "", nat, sub, extra = "", chips, badge, report = "" }) {
    return `<div class="info-card">
        ${photo}
        <div class="info-main">
            <div class="info-head"><span class="info-name" title="${esc(nameTitle)}">${nameHTML ?? esc(name)}</span>${nat ? `<span class="info-nat">${esc(nat)}</span>` : ""}</div>
            <div class="info-sub">${sub}</div>
            ${extra}
        </div>
        ${chips}
        ${report ? `<div class="info-end">${badge}<button class="icon-btn info-report" type="button" ${report} title="Report an error in this season" aria-label="Report an error in this season">${FLAG_SVG}</button></div>` : badge}
    </div>`;
}

function spellHTML(sp, d) {
    const t = sp.tenure;
    const club = DB.clubById.get(t.clubId)?.naam || "";
    const first = sp.seasons[0].season, last = sp.seasons[sp.seasons.length - 1].season;
    const span = first === last ? first : `${first} – ${last}`;
    if (sp.seasons[0].unknown) {
        return `<p class="info-default"><strong>No reliable data</strong> · ${esc(club)} · ${span}. No single manager could be determined from the available sources.</p>`;
    }
    const coach = DB.coaches.get(t.coachId) || {};
    // Gesplitste seizoenen midden in de periode: wie er stonden (het seizoen onder de muis eerst)
    const multi = sp.seasons.filter(s => s.multi && s.trainers?.length);
    const ordered = d?.multi ? [d, ...multi.filter(s => s !== d)] : multi;
    const plain = ordered.map(s => `${s.season}: ${lineupText(s)}`).join(" · ");
    const pre = predecessorOf(club, (d || sp.seasons[0]).season);
    const extra = ordered.length ? `<div class="info-extra" title="${esc(plain)}">${ordered.map(s => `${s.season}: ${lineupHTML(s)}`).join(" · ")}</div>` : "";
    return infoCardHTML({
        photo: photoHTML(coach.foto_url, t.coach),
        name: t.coach, nat: coach.nationaliteit,
        sub: `${clubNameHTML(club, pre)} <span class="span">· ${span}</span>`,
        extra,
        report: reportAttrs(club, d ? d.season : span, t.coach),
        chips: chipsHTML(sp.trophies),
        badge: badgeHTML(plural(sp.seasons.length, "season", "seasons"), t.bucket),
    });
}

const lineupText = s => s.trainers.map(tr => tr.naam + (tr.interim ? " (interim)" : "")).join(" → ");
const lineupHTML = s => s.trainers.map(tr => `${esc(tr.naam)}${tr.interim ? '<span class="interim">interim</span>' : ""}`).join(" → ");

// Los gebroken seizoen: alle trainers van dat seizoen op een rij
function splitSeasonHTML(s) {
    const k = Math.min(5, s.nCoaches);
    return infoCardHTML({
        photo: `<div class="info-photo split-mark" aria-hidden="true">${"<i></i>".repeat(k)}</div>`,
        nameHTML: lineupHTML(s), nameTitle: lineupText(s),
        sub: `${clubNameHTML(s.club, predecessorOf(s.club, s.season))} <span class="span">· ${s.season} · ${plural(s.nCoaches, "manager", "managers")}</span>`,
        report: reportAttrs(s.club, s.season, s.trainers.map(tr => tr.naam).join(", ")),
        chips: chipsHTML(trophiesOf([s])),
        badge: badgeHTML("split season", 0),
    });
}

function careerHTML(name) {
    const c = coachByName(name);
    if (!c) return "";
    const list = seasonsOfCoach(c.id);
    const clubs = new Set(list.map(s => s.clubId));
    const countries = new Set(list.map(s => s.country));
    const longest = [...new Set(list.map(s => s.spell))].reduce((a, b) => b.seasons.length > a.seasons.length ? b : a);
    return infoCardHTML({
        photo: photoHTML(c.foto_url, c.naam),
        name: c.naam, nat: c.nationaliteit,
        sub: `<span class="club">${plural(clubs.size, "club", "clubs")} · ${plural(countries.size, "country", "countries")}</span> <span class="span">· ${list[0].season} – ${list[list.length - 1].season}</span>`,
        extra: `<div class="info-extra">${plural(list.length, "season", "seasons")} as manager of the season in this dataset</div>`,
        chips: chipsHTML(trophiesOf(list)),
        badge: badgeHTML(`longest: ${longest.seasons.length}`, longest.split ? 0 : longest.tenure.bucket),
    });
}

// Standaard (niets aangewezen): vier kerncijfers voor de clubs in beeld
function insightsHTML(clubIds) {
    const ids = new Set(clubIds);
    const seasons = DB.seasons.filter(s => ids.has(s.clubId) && !s.unknown);
    if (!seasons.length) return "";
    const longest = [...new Set(seasons.map(s => s.spell))].reduce((a, b) => b.seasons.length > a.seasons.length ? b : a);
    const cs = clubStats().filter(d => ids.has(d.club.id));
    const stable = cs.reduce((a, b) => b.avg > a.avg ? b : a);
    const unstable = cs.reduce((a, b) => b.avg < a.avg ? b : a);
    const success = cs.reduce((a, b) => b.trophies > a.trophies ? b : a);
    const covered = cs.filter(d => d.hasCoverage);
    const turbulent = covered.length ? covered.reduce((a, b) => b.multi > a.multi ? b : a) : null;
    const swatch = c => `<span class="swatch" style="background:${c}"></span>`;
    const card = (icon, label, value, sub) => `<div class="stat-card"><div class="stat-icon">${icon}</div><div><div class="stat-label">${label}</div><div class="stat-value">${esc(value)}</div><div class="stat-sub">${sub}</div></div></div>`;
    return `<div class="stat-grid">
        ${card(swatch("#003300"), "Longest tenure", longest.tenure.coach, `${esc(DB.clubById.get(longest.tenure.clubId).naam)} · ${plural(longest.seasons.length, "season", "seasons")}`)}
        ${card(swatch("#339933"), "Most stable club", stable.club.naam, `${fmt1(stable.avg)} seasons per manager`)}
        ${turbulent ? card(`<span class="legend-swatches split">${splitSwatch(3)}</span>`, "Most mid-season changes", turbulent.club.naam, plural(turbulent.multi, "split season", "split seasons")) : card(swatch("#FF0033"), "Least stable club", unstable.club.naam, `${fmt1(unstable.avg)} seasons per manager`)}
        ${card(shieldSVG("euro", 14), "Most trophies", success.club.naam, `${success.trophies} trophies`)}
    </div>`;
}

// URL state (explore.html): #country=Spain | #clubs=id,id | #career=Name.
// Oudere links met "explore/" ervoor werken ook.
function hashFor() {
    if (state.view === "league") return `country=${encodeURIComponent(state.country)}`;
    if (state.view === "compare") return `clubs=${state.clubs.map(encodeURIComponent).join(",")}`;
    return `career=${state.career ? encodeURIComponent(state.career) : ""}`;
}
function updateHash() {
    history.replaceState(null, "", "#" + hashFor());
}
function readHash() {
    const h = decodeURIComponent(location.hash.slice(1)).replace(/^explore\/?/, "");
    const [k, v = ""] = h.split("=");
    if (k === "country" && COUNTRIES.includes(v)) Object.assign(state, { view: "league", country: v });
    if (k === "clubs") Object.assign(state, { view: "compare", clubs: v.split(",").filter(id => DB.clubById.has(id)) });
    if (k === "career") Object.assign(state, { view: "career", career: coachByName(v) ? v : coachByName(DEFAULT_COACH) ? DEFAULT_COACH : null });
    ui.locked = null;
}

// Hoogte van de header: het intro schuift eronder (de header zweeft over de foto's)
function headerHeight() {
    const header = document.querySelector(".site-header");
    const set = () => document.documentElement.style.setProperty("--header-h", `${header.offsetHeight}px`);
    set();
    window.addEventListener("resize", set);
}

// ------------------------------------------------------------------
// Boot
// ------------------------------------------------------------------
(async function main() {
    const loading = document.getElementById("loading");
    try {
        await loadData();
    } catch (err) {
        console.error(err);
        loading.innerHTML = `<p>Could not load the data. Please try again later.</p>`;
        return;
    }
    headerHeight();
    if ($("intro")) buildIntro(DB.extraCareer);
    if ($("explore")) {
        readHash();
        buildExplorer();
        renderExplorer();
        window.addEventListener("hashchange", () => { readHash(); renderExplorer(); });
    }
    loading.classList.add("done");
})();
