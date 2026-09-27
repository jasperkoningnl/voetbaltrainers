// Managerial Merry-Go-Round v2
// Leest clubs, coaches en seizoenen uit de statische snapshot ../data/snapshot.json
// (export uit het dashboard). Alleen als die ontbreekt valt de app terug op Firestore.
// Per seizoen staat één hoofdtrainer (coachId). Het optionele veld 'trainers_seizoen'
// bevat alle trainers die dat seizoen aan het roer stonden (incl. interim); bij meer dan één
// krijgt het seizoen een gestreept patroon. Ontbreekt het veld, dan valt de app terug op
// data/trainers_seizoen.json.

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
const TENURE_LABELS = ["1 full season", "2 full seasons", "3–4", "5–6", "7–9", "10+"];
const STRIPE_BG = "#ffd6de";
const TENURE_TEXT = ["#fff", "#14391d", "#0d2b14", "#fff", "#fff", "#fff"];
const PRIZE = { euro: "#FFD700", title: "#C0C0C0", cup: "#CD7F32" };
const SHIELD = "M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z";
const AVATAR = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><rect width="50" height="50" fill="#e9ecef"/><path fill="#c7cdd3" d="M25 26.5c-5 0-10 2.5-10 7.5v3h20v-3c0-5-5-7.5-10-7.5zM25 15a7 7 0 100 14 7 7 0 000-14z"/></svg>');
const UNKNOWN = "[Data Unavailable]";
// Clublogo's staan in de repo (images/logos, bron: Wikipedia). De logo_url's in Firestore werken niet meer
// (Wikimedia weigert 1200px/640px-formaten, football-logos.cc blokkeert). Onbekende club: terugval op logo_url.
const LOCAL_LOGOS = new Set(["ajax", "arsenal", "as-monaco", "as-saint-etienne", "athletic-bilbao", "atletico-madrid", "az",
    "bayern-munchen", "benfica", "boavista", "borussia-dortmund", "borussia-monchengladbach", "chelsea", "fc-barcelona", "fc-porto",
    "fc-twente", "feyenoord", "hamburger-sv", "internazionale", "juventus", "liverpool", "manchester-city", "manchester-united", "milan",
    "napoli", "olympique-lyonnais", "olympique-marseille", "paris-saint-germain", "psv", "real-madrid", "roma", "s-c-braga",
    "sporting-cp", "valencia-cf", "vfb-stuttgart"]);
const slug = s => String(s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const logoOf = club => LOCAL_LOGOS.has(slug(club.naam)) ? `../images/logos/${slug(club.naam)}.png` : club.logo_url || "";

const tenureBucket = n => n <= 1 ? 0 : n === 2 ? 1 : n <= 4 ? 2 : n <= 6 ? 3 : n <= 9 ? 4 : 5;
const startYear = s => parseInt(s.slice(0, 4), 10);
const endYear = s => startYear(s) + 1;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const pct = x => `${Math.round(x * 100)}%`;
const fmt1 = x => (Math.round(x * 100) / 100).toFixed(2);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const DUR = reduceMotion ? 0 : 750;

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
const DB = { clubs: [], clubById: new Map(), coaches: new Map(), seasons: [], byClub: new Map(), seasonList: [], coverage: new Set() };

// Snapshot eerst: dat kost geen Firestore-reads. Firestore alleen als de snapshot ontbreekt.
async function fetchCollections() {
    try {
        const r = await fetch("../data/snapshot.json");
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
    const [snap, fallback] = await Promise.all([
        fetchCollections(),
        fetch("data/trainers_seizoen.json").then(r => r.ok ? r.json() : { seizoenen: [] }).catch(() => ({ seizoenen: [] })),
    ]);

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
// Heatmap renderer (gebruikt door intro én verkenner)
// ------------------------------------------------------------------
let patternSeq = 0;
function addPatterns(defs) {
    const uid = `p${patternSeq++}`;
    // Rood gestreept: aantal strepen = aantal trainers dat seizoen (2, 3, 4, 5+)
    [2, 3, 4, 5].forEach(k => {
        const h = 1 / k;
        const p = defs.append("pattern").attr("id", `${uid}-stripe-${k}`).attr("width", 1).attr("height", h)
            .attr("patternUnits", "objectBoundingBox").attr("patternContentUnits", "objectBoundingBox");
        p.append("rect").attr("width", 1).attr("height", h).attr("fill", STRIPE_BG);
        p.append("polygon").attr("fill", "#FF0033")
            .attr("points", `0,${h * 0.55} 1,${h * 0.05} 1,${h * 0.45} 0,${h * 0.95}`);
    });
    const u = defs.append("pattern").attr("id", `${uid}-unknown`).attr("width", 8).attr("height", 8)
        .attr("patternUnits", "userSpaceOnUse").attr("patternTransform", "rotate(45)");
    u.append("rect").attr("width", 8).attr("height", 8).attr("fill", "#d5d9de");
    u.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 8).attr("stroke", "#e9ecef").attr("stroke-width", 3);
    return uid;
}

class Heatmap {
    constructor(container, opts = {}) {
        this.el = container;
        this.opts = opts;
        this.svg = d3.select(container).append("svg").attr("class", "heatmap");
        this.uid = addPatterns(this.svg.append("defs"));
        this.g = this.svg.append("g");
        this.gCells = this.g.append("g");
        this.gDiv = this.g.append("g").attr("pointer-events", "none");
        this.gLabels = this.g.append("g");
        this.gPrizes = this.g.append("g").attr("pointer-events", "none");
        this.gRows = this.g.append("g");
        this.gAxis = this.g.append("g").attr("class", "axis");
        this.spec = null;
        this.focus = null;
        if (opts.interactive) {
            this.svg.on("mouseleave", () => { if (!this.locked) opts.onHover?.(null); });
            this.svg.on("click", e => {
                if (e.target.classList.contains("cell")) return;
                this.locked = null; opts.onHover?.(null);
            });
        }
    }

    fill(d) {
        if (d.unknown) return `url(#${this.uid}-unknown)`;
        return d.multi ? `url(#${this.uid}-stripe-${Math.min(5, Math.max(2, d.nCoaches))})` : TENURE_COLORS[d.tenure.bucket];
    }

    // spec: { rows:[clubId], seasons:[..], reveal:(d)=>bool, highlight:(d)=>bool|null, names:bool, prizes:bool, rowH }
    render(spec, duration = DUR) {
        this.spec = spec;
        const width = this.el.clientWidth || 800;
        const narrow = width < 640;
        const labelW = spec.hideRowLabels ? 0 : (narrow ? 40 : 190);
        const m = { top: 6, right: 8, bottom: spec.axis === false ? 6 : 52, left: labelW };
        const rowH = spec.rowH || (narrow ? 34 : 46);
        const innerW = Math.max(120, (spec.minWidth ? Math.max(width, spec.minWidth) : width) - m.left - m.right);
        const innerH = spec.rows.length * rowH;
        const x = d3.scaleBand().domain(spec.seasons).range([0, innerW]).padding(0);
        const y = d3.scaleBand().domain(spec.rows).range([0, innerH]).paddingInner(0.18);
        this.x = x; this.y = y;
        const t = this.svg.transition().duration(duration).ease(d3.easeCubicInOut);

        this.svg.transition(t).attr("width", innerW + m.left + m.right).attr("height", innerH + m.top + m.bottom)
            .attr("viewBox", `0 0 ${innerW + m.left + m.right} ${innerH + m.top + m.bottom}`);
        this.g.attr("transform", `translate(${m.left},${m.top})`);

        const inView = new Set(spec.seasons);
        const rowSet = new Set(spec.rows);
        const data = DB.seasons.filter(d => rowSet.has(d.clubId) && inView.has(d.season));
        const visible = d => !spec.reveal || spec.reveal(d);
        const lit = d => !spec.highlight || spec.highlight(d);
        const self = this;

        // Cells
        this.gCells.selectAll("rect.cell").data(data, d => d.key).join(
            enter => enter.append("rect").attr("class", "cell")
                .attr("x", d => x(d.season)).attr("y", d => y(d.clubId)).attr("height", y.bandwidth())
                .attr("width", 0).attr("opacity", 0).attr("fill", d => this.fill(d)),
            update => update,
            exit => exit.transition(t).attr("opacity", 0).remove()
        )
            .on("mouseenter", function (e, d) { if (self.opts.interactive && !self.locked) self.opts.onHover?.(d); })
            .on("click", function (e, d) {
                if (!self.opts.interactive) return;
                e.stopPropagation();
                self.locked = self.locked && self.locked.key === d.key ? null : d;
                self.opts.onHover?.(self.locked || d, !!self.locked);
            })
            .transition(t)
            .delay(d => spec.stagger && visible(d) ? spec.stagger(d) : 0)
            .attr("x", d => x(d.season)).attr("y", d => y(d.clubId))
            .attr("width", d => visible(d) ? x.bandwidth() + 0.5 : 0)
            .attr("height", y.bandwidth())
            .attr("fill", d => this.fill(d))
            .attr("opacity", d => !visible(d) ? 0 : lit(d) ? 1 : 0.12);

        // Scheidingslijnen: haarlijn tussen elk seizoen, dikkere witte lijn waar een nieuwe hoofdtrainer begint (zoals v1)
        const dividers = data.filter(d => d.season !== spec.seasons[0]);
        this.gDiv.selectAll("line").data(dividers, d => d.key).join(
            enter => enter.append("line").attr("opacity", 0)
                .attr("x1", d => x(d.season)).attr("x2", d => x(d.season))
                .attr("y1", d => y(d.clubId)).attr("y2", d => y(d.clubId) + y.bandwidth()),
            update => update, exit => exit.remove()
        )
            .attr("class", d => d.index === 1 ? "divider-tenure" : "divider-season")
            .transition(t)
            .delay(d => spec.stagger && visible(d) ? spec.stagger(d) : 0)
            .attr("x1", d => x(d.season)).attr("x2", d => x(d.season))
            .attr("y1", d => y(d.clubId)).attr("y2", d => y(d.clubId) + y.bandwidth())
            .attr("opacity", d => visible(d) ? 1 : 0);

        // Manager names on tenure blocks
        const tenures = [];
        if (spec.names) {
            const seen = new Set();
            data.forEach(d => {
                if (seen.has(d.tenure.id) || d.unknown) return;
                seen.add(d.tenure.id);
                // Naam alleen over de volle (niet-gestreepte) seizoenen
                const inRange = d.tenure.seasons.filter(s => !s.multi && inView.has(s.season) && visible(s));
                if (!inRange.length) return;
                const w = inRange.length * x.bandwidth();
                const parts = d.coach.split(" ");
                const rest = parts.length > 1 ? parts.slice(1).join(" ") : d.coach;
                const fits = str => w > str.length * 6.6 + 10;
                const label = fits(d.coach) ? d.coach : fits(rest) ? rest : parts[parts.length - 1];
                if (w < label.length * 6.6 + 8) return;
                tenures.push({ id: d.tenure.id, t: d.tenure, x0: x(inRange[0].season), w, label, clubId: d.clubId, lit: lit(d) });
            });
        }
        const showPrizes = spec.prizes !== false;
        this.gLabels.selectAll("text").data(tenures, d => d.id).join(
            enter => enter.append("text").attr("class", "cell-label").attr("opacity", 0).attr("dy", ".35em"),
            update => update, exit => exit.transition(t).attr("opacity", 0).remove()
        ).text(d => d.label)
            .attr("fill", d => TENURE_TEXT[d.t.bucket])
            .attr("text-anchor", "start")
            .transition(t).delay(spec.labelDelay || 0)
            .attr("x", d => d.x0 + 5)
            .attr("y", d => y(d.clubId) + (showPrizes ? y.bandwidth() - 9 : y.bandwidth() / 2))
            .attr("opacity", d => d.lit ? 1 : 0.15);

        // Prizes
        const prizeData = showPrizes ? data.filter(d => d.trophyCount > 0) : [];
        const size = Math.max(5, Math.min(x.bandwidth() * 0.78, (y.bandwidth() - (spec.names ? 14 : 4)) / 3.1, 15));
        const pg = this.gPrizes.selectAll("g.prize").data(prizeData, d => d.key).join(
            enter => {
                const g = enter.append("g").attr("class", "prize").attr("opacity", 0);
                return g;
            },
            update => update, exit => exit.transition(t).attr("opacity", 0).remove()
        );
        pg.each(function (d) {
            const list = [d.euro && PRIZE.euro, d.title && PRIZE.title, d.cup && PRIZE.cup].filter(Boolean);
            const g = d3.select(this);
            g.selectAll("path").data(list).join("path").attr("d", SHIELD).attr("fill", c => c)
                .attr("stroke", "#222").attr("stroke-width", 0.6)
                .attr("transform", (c, i) => `translate(${-size / 2},${i * size * 1.02}) scale(${size / 18})`);
            g.attr("data-n", list.length);
        });
        pg.transition(t)
            .delay(d => (spec.stagger && visible(d) ? spec.stagger(d) : 0) + (spec.prizeDelay || 0))
            .attr("transform", d => {
                const n = d.trophyCount;
                const top = spec.names ? 3 : (y.bandwidth() - n * size * 1.02) / 2;
                return `translate(${x(d.season) + x.bandwidth() / 2},${y(d.clubId) + top})`;
            })
            .attr("opacity", d => !visible(d) ? 0 : lit(d) ? 1 : 0.12);

        // Row labels
        const rows = this.gRows.selectAll("g.row-label").data(labelW ? spec.rows : [], d => d).join(
            enter => {
                const g = enter.append("g").attr("class", "row-label").attr("opacity", 0);
                g.append("image").attr("width", 26).attr("height", 26).attr("preserveAspectRatio", "xMidYMid meet")
                    .on("error", function () { d3.select(this).style("display", "none"); });
                g.append("text").attr("dy", ".35em");
                return g;
            },
            update => update, exit => exit.transition(t).attr("opacity", 0).remove()
        );
        rows.select("image").attr("href", id => DB.clubById.get(id)?.logo_url || "")
            .attr("x", narrow ? -labelW + 4 : -labelW + 2).attr("y", y.bandwidth() / 2 - 13);
        rows.select("text").text(id => narrow ? "" : DB.clubById.get(id)?.naam || id)
            .attr("x", -labelW + 36).attr("y", y.bandwidth() / 2);
        rows.transition(t).attr("transform", id => `translate(0,${y(id)})`).attr("opacity", 1);

        // Axis
        if (spec.axis === false) { this.gAxis.selectAll("*").remove(); }
        else {
            const every = spec.tickEvery || Math.max(1, Math.ceil(spec.seasons.length / (innerW / 34)));
            const focusSet = new Set(this.focus ? this.focus : []);
            const ticks = spec.seasons.filter((s, i) => i % every === 0 || focusSet.has(s));
            this.gAxis.attr("transform", `translate(0,${innerH + 4})`)
                .transition(t)
                .call(d3.axisBottom(x).tickValues(ticks).tickSizeOuter(0))
                .on("end", () => {
                    this.gAxis.selectAll(".tick text").attr("text-anchor", "end").attr("dx", "-.6em").attr("dy", ".15em")
                        .attr("transform", "rotate(-55)").classed("on", s => focusSet.has(s));
                });
            this.gAxis.selectAll(".tick text").attr("text-anchor", "end").attr("dx", "-.6em").attr("dy", ".15em")
                .attr("transform", "rotate(-55)").classed("on", s => focusSet.has(s));
        }
    }

    // Verkenner: dim alles behalve een tenure / zoekresultaat
    applyHighlight(fn) {
        const lit = d => !fn || fn(d);
        this.gCells.selectAll("rect.cell").classed("dim", d => !lit(d));
        this.gPrizes.selectAll("g.prize").attr("opacity", d => lit(d) ? 1 : 0.12);
        this.gLabels.selectAll("text").attr("opacity", d => lit(d.t.seasons[0]) ? 1 : 0.15);
    }

    setFocusSeasons(list) {
        this.focus = list;
        if (!this.spec || this.spec.axis === false) return;
        const focusSet = new Set(list || []);
        const every = this.spec.tickEvery || Math.max(1, Math.ceil(this.spec.seasons.length / (this.x.range()[1] / 34)));
        let ticks = this.spec.seasons.filter((s, i) => i % every === 0);
        if (focusSet.size) {
            const all = this.spec.seasons;
            const idx = [...focusSet].map(s => all.indexOf(s));
            const lo = Math.min(...idx), hi = Math.max(...idx);
            const stepF = focusSet.size > 12 ? Math.ceil(focusSet.size / 12) : 1;
            const focusTicks = all.filter((s, i) => i >= lo && i <= hi && ((i - lo) % stepF === 0 || i === hi));
            ticks = [...ticks.filter(s => { const i = all.indexOf(s); return i < lo - 2 || i > hi + 2; }), ...focusTicks].sort(d3.ascending);
        }
        this.gAxis.call(d3.axisBottom(this.x).tickValues(ticks).tickSizeOuter(0));
        this.gAxis.selectAll(".tick text").attr("text-anchor", "end").attr("dx", "-.6em").attr("dy", ".15em")
            .attr("transform", "rotate(-55)").classed("on", s => focusSet.has(s));
    }

    clear() { this.svg.selectAll("g > g > *").remove(); }
}


// ------------------------------------------------------------------
// Charts for the story (bars + scatter)
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

function drawBars(stage, stats) {
    const W = stage.clientWidth || 700, narrow = W < 560;
    const H = Math.min(430, Math.max(300, W * 0.55));
    const m = { top: 46, right: 12, bottom: 58, left: narrow ? 34 : 44 };
    const svg = d3.select(stage).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H);
    const x = d3.scaleBand().domain(stats.map(d => d.b)).range([m.left, W - m.right]).padding(0.22);
    const pid = addPatterns(svg.append("defs"));
    const barFill = d => d.b === "multi" ? `url(#${pid}-stripe-3)` : TENURE_COLORS[d.b];
    const barLabel = d => d.b === "multi" ? (narrow ? "2+" : "changed mid-season") : narrow ? ["1", "2", "3–4", "5–6", "7–9", "10+"][d.b] : TENURE_LABELS[d.b];
    const y = d3.scaleLinear().domain([0, 0.6]).range([H - m.bottom, m.top]);
    svg.append("text").attr("class", "chart-title").attr("x", m.left).attr("y", 16).text(narrow ? "Seasons with at least one trophy" : "Share of seasons in which the club won at least one trophy");
    svg.append("text").attr("class", "chart-sub").attr("x", m.left).attr("y", 33).text(narrow ? `by tenure · ${statsClubs()} clubs` : `by how many full seasons the manager stayed · ${statsClubs()} clubs with complete data`);
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.left},0)`)
        .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(".0%")).tickSize(-(W - m.left - m.right)))
        .call(g => g.selectAll("line").attr("stroke", "#eef0f2")).call(g => g.select("path").remove());
    const g = svg.append("g");
    const bars = g.selectAll("g").data(stats).join("g");
    bars.append("rect").attr("x", d => x(d.b)).attr("width", x.bandwidth()).attr("rx", 3)
        .attr("fill", barFill).attr("y", y(0)).attr("height", 0)
        .transition().duration(DUR).delay((d, i) => i * 120)
        .attr("y", d => y(d.any)).attr("height", d => y(0) - y(d.any));
    bars.append("text").attr("class", "bar-label").attr("text-anchor", "middle").attr("x", d => x(d.b) + x.bandwidth() / 2)
        .attr("y", d => y(d.any) - 6).text(d => pct(d.any)).attr("opacity", 0)
        .transition().duration(DUR).delay((d, i) => i * 120 + 300).attr("opacity", 1);
    bars.append("text").attr("class", "annot").attr("text-anchor", "middle").attr("x", d => x(d.b) + x.bandwidth() / 2)
        .attr("y", H - m.bottom + 18).text(barLabel);
    if (!narrow) bars.append("text").attr("class", "annot-muted").attr("text-anchor", "middle").attr("x", d => x(d.b) + x.bandwidth() / 2)
        .attr("y", H - m.bottom + 34).text(d => `${d3.format(",")(d.n)} seasons`);
    svg.append("text").attr("class", "annot-muted").attr("x", (W) / 2).attr("text-anchor", "middle").attr("y", H - 6).text("seasons with more than one manager, then full seasons of the same manager");
}

function drawScatter(stage, stats, highlight) {
    const W = stage.clientWidth || 700, narrow = W < 560;
    const H = Math.min(460, Math.max(320, W * 0.6));
    const m = { top: 46, right: 18, bottom: 46, left: narrow ? 38 : 48 };
    const svg = d3.select(stage).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H);
    const x = d3.scaleLinear().domain([1, d3.max(stats, d => d.avg) * 1.06]).range([m.left, W - m.right]);
    const y = d3.scaleLinear().domain([0, d3.max(stats, d => d.perSeason) * 1.12]).range([H - m.bottom, m.top]);
    svg.append("text").attr("class", "chart-title").attr("x", m.left).attr("y", 16).text("Each logo is a club");
    svg.append("text").attr("class", "chart-sub").attr("x", m.left).attr("y", 33).text(narrow ? "→ more stable   ↑ more trophies per season" : "→ more stable (seasons per manager)   ↑ more trophies per season");
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.bottom})`)
        .call(d3.axisBottom(x).ticks(6).tickSize(-(H - m.top - m.bottom)))
        .call(g => g.selectAll("line").attr("stroke", "#eef0f2")).call(g => g.select("path").remove());
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.left},0)`)
        .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".2f")).tickSize(-(W - m.left - m.right)))
        .call(g => g.selectAll("line").attr("stroke", "#eef0f2")).call(g => g.select("path").remove());
    svg.append("text").attr("class", "annot-muted").attr("x", W - m.right).attr("y", H - 8).attr("text-anchor", "end").text("average seasons per manager");
    const s = narrow ? 20 : 26;
    const nodes = svg.append("g").selectAll("g").data(stats).join("g")
        .attr("transform", d => `translate(${x(1)},${y(0)})`).attr("opacity", 0);
    nodes.append("circle").attr("r", s / 2 + 2).attr("fill", "#fff").attr("stroke", "#dee2e6");
    nodes.append("image").on("error", function () { d3.select(this).style("display", "none"); }).attr("href", d => d.club.logo_url).attr("width", s).attr("height", s).attr("x", -s / 2).attr("y", -s / 2);
    nodes.append("title").text(d => `${d.club.naam}: ${fmt1(d.avg)} seasons per manager, ${d.trophies} trophies (${fmt1(d.perSeason)} per season)`);
    // Labels: rechts van het logo, links als er rechts al een label in de buurt staat
    const placed = [];
    const labelled = narrow ? new Set([...stats].filter(d => highlight.has(d.club.naam)).sort((a, b) => b.perSeason - a.perSeason).slice(0, 2).concat([...stats].sort((a, b) => b.avg - a.avg).slice(0, 1)).map(d => d.club.naam)) : highlight;
    nodes.filter(d => labelled.has(d.club.naam)).each(function (d) {
        const px = x(d.avg), py = y(d.perSeason), wText = d.club.naam.length * 6.6;
        const clash = placed.some(p => Math.abs(p.y - py) < 14 && p.x0 < px + s / 2 + 5 + wText && p.x1 > px);
        const left = clash || px + s / 2 + 5 + wText > W - m.right;
        d3.select(this).append("text").attr("class", "annot").attr("dy", ".35em")
            .attr("x", left ? -s / 2 - 5 : s / 2 + 5).attr("text-anchor", left ? "end" : "start").text(d.club.naam);
        placed.push(left ? { x0: px - s / 2 - 5 - wText, x1: px, y: py } : { x0: px, x1: px + s / 2 + 5 + wText, y: py });
    });
    nodes.transition().duration(DUR).delay((d, i) => i * 25)
        .attr("transform", d => `translate(${x(d.avg)},${y(d.perSeason)})`).attr("opacity", 1);
}

function drawDuel(stage, F, M) {
    const W = stage.clientWidth || 700, narrow = W < 560;
    const H = narrow ? 360 : 330;
    const svg = d3.select(stage).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H);
    const metrics = [
        { label: "Seasons in charge*", f: F.seasons, m: M.seasons, fmt: d => d },
        { label: "Clubs", f: F.clubs, m: M.clubs, fmt: d => d },
        { label: "Longest stay (seasons)", f: F.longest, m: M.longest, fmt: d => d },
        { label: "Trophies*", f: total(F.trophies), m: total(M.trophies), fmt: d => d },
        { label: "Trophies per season", f: total(F.trophies) / F.seasons, m: total(M.trophies) / M.seasons, fmt: d => fmt1(d) },
    ];
    const cx = W / 2, rowH = (H - 60) / metrics.length, half = W / 2 - (narrow ? 70 : 110);
    svg.append("text").attr("class", "chart-title").attr("x", cx - 12).attr("y", 18).attr("text-anchor", "end").text("Alex Ferguson");
    svg.append("text").attr("class", "chart-title").attr("x", cx + 12).attr("y", 18).text("José Mourinho");
    metrics.forEach((mt, i) => {
        const max = Math.max(mt.f, mt.m);
        const yy = 40 + i * rowH;
        const bh = Math.min(22, rowH * 0.42);
        svg.append("text").attr("class", "annot-muted").attr("x", cx).attr("y", yy + 10).attr("text-anchor", "middle").text(mt.label);
        const wf = half * mt.f / max, wm = half * mt.m / max;
        svg.append("rect").attr("x", cx - 6).attr("y", yy + 18).attr("height", bh).attr("width", 0).attr("fill", "#003300").attr("rx", 3)
            .transition().duration(DUR).delay(i * 150).attr("x", cx - 6 - wf).attr("width", wf);
        svg.append("rect").attr("x", cx + 6).attr("y", yy + 18).attr("height", bh).attr("width", 0).attr("fill", "#FF0033").attr("rx", 3)
            .transition().duration(DUR).delay(i * 150).attr("width", wm);
        svg.append("text").attr("class", "bar-label").attr("x", cx - 12 - wf).attr("y", yy + 18 + bh / 2).attr("dy", ".35em").attr("text-anchor", "end").text(mt.fmt(mt.f));
        svg.append("text").attr("class", "bar-label").attr("x", cx + 12 + wm).attr("y", yy + 18 + bh / 2).attr("dy", ".35em").text(mt.fmt(mt.m));
    });
}

// ------------------------------------------------------------------
// Story
// ------------------------------------------------------------------
function legendHTML({ stripes = true, prizes = true, unknown = false } = {}) {
    const tenure = TENURE_COLORS.map((c, i) => `<span class="legend-item"><span class="swatch" style="background:${c}"></span>${TENURE_LABELS[i]}</span>`).join("");
    const stripe = stripes ? `<span class="legend-sep"></span>` + [2, 3, 4, 5].map(k => `<span class="legend-item">${stripeSwatch(k)}${k === 5 ? "5+" : k} managers in one season</span>`).join("") : "";
    const unk = unknown ? `<span class="legend-item"><span class="swatch" style="background:repeating-linear-gradient(45deg,#d5d9de 0 3px,#e9ecef 3px 6px)"></span>no reliable data</span>` : "";
    const pr = prizes ? `<span class="legend-sep"></span>` + [["euro", "European trophy"], ["title", "League title"], ["cup", "National cup"]]
        .map(([k, l]) => `<span class="legend-item">${shieldSVG(PRIZE[k])}${l}</span>`).join("") : "";
    return `<div class="legend">${tenure}${stripe}${unk}${pr}</div>`;
}
// Klein legenda-vakje met precies k rode strepen, zelfde tekening als in de grafiek
const stripeSwatch = k => { const h = 14 / k; let p = ""; for (let i = 0; i < k; i++) { const y = i * h; p += `<polygon points="0,${y + h * 0.55} 14,${y + h * 0.05} 14,${y + h * 0.45} 0,${y + h * 0.95}" fill="#FF0033"/>`; } return `<svg class="swatch" viewBox="0 0 14 14" width="14" height="14"><rect width="14" height="14" fill="${STRIPE_BG}"/>${p}</svg>`; };
const shieldSVG = c => `<svg class="shield" viewBox="0 0 18 17"><path d="${SHIELD}" fill="${c}" stroke="#444" stroke-width=".6"/></svg>`;
const trophyLine = t => [
    t.title ? `<span>${shieldSVG(PRIZE.title)} ${plural(t.title, "league title", "league titles")}</span>` : "",
    t.cup ? `<span>${shieldSVG(PRIZE.cup)} ${plural(t.cup, "national cup", "national cups")}</span>` : "",
    t.euro ? `<span>${shieldSVG(PRIZE.euro)} ${plural(t.euro, "European trophy", "European trophies")}</span>` : "",
].filter(Boolean).join(" ");

function buildStory() {
    const mu = clubByName("Manchester United");
    const ferg = coachByName("Alex Ferguson");
    const mour = coachByName("José Mourinho");
    const muSeasons = DB.byClub.get(mu.id);
    const fSeasons = seasonsOfCoach(ferg.id);
    const mSeasons = seasonsOfCoach(mour.id);
    const fFirst = fSeasons[0].season, fLast = fSeasons[fSeasons.length - 1].season;
    const fT = trophiesOf(fSeasons), mT = trophiesOf(mSeasons);
    const firstTrophy = fSeasons.find(s => s.trophyCount > 0);
    const dryStart = fSeasons.indexOf(firstTrophy);
    const after = muSeasons.filter(s => s.season > fLast);
    const afterCoaches = [...new Set(after.map(s => s.coach))];
    const afterStriped = after.filter(s => s.multi);
    const afterNames = new Set(after.flatMap(s => (s.trainers || []).map(t => t.naam)));
    const afterT = trophiesOf(after);
    const before = muSeasons.filter(s => s.season < fFirst);
    const busby = before.filter(s => s.coach === "Matt Busby");
    const between = [...new Set(before.filter(s => s.coach !== "Matt Busby").map(s => s.tenure))];
    const betweenMax = between.length ? d3.max(between, t => t.length) : 0;
    const mClubs = [...new Set(mSeasons.map(s => s.clubId))];
    const mTenures = [...new Set(mSeasons.map(s => s.tenure))];
    const mLongest = d3.max(mTenures, t => t.length);
    const mStriped = mSeasons.filter(s => s.multi);
    const stats = tenureStats();
    const cstats = clubStats();
    const corr = pearson(cstats.map(d => d.avg), cstats.map(d => d.perSeason));
    const topWinners = [...cstats].sort((a, b) => b.perSeason - a.perSeason).slice(0, 4);
    const mostStable = [...cstats].sort((a, b) => b.avg - a.avg)[0];
    const eng = DB.clubs.filter(c => c.land === "England").map(c => c.id);
    const multiIdx = stats.find(d => d.b === "multi"), firstIdx = stats.find(d => d.b === 0), lastIdx = stats.find(d => d.b === 5);

    const F = { seasons: fSeasons.length, clubs: 1, longest: fSeasons.length, trophies: fT };
    const M = { seasons: mSeasons.length, clubs: mClubs.length, longest: mLongest, trophies: mT };

    const set = (id, html) => { document.getElementById(id).innerHTML = html; };
    set("txt-ferguson-start", `
        <h2>November 1986</h2>
        <p>Manchester United appoint a manager from Aberdeen: <strong>Alex Ferguson</strong>. Every block you see is one season at the club.</p>
        <p>${dryStart > 0 ? `His first ${plural(dryStart, "season", "seasons")} bring${dryStart === 1 ? "s" : ""} no trophy at all. In today's game, that is usually where the story ends.` : ""}</p>
        <p class="note">One manager per season: the one who was in charge longest that season. Interim managers never get the season.</p>`);
    set("txt-ferguson-full", `
        <h2>Then the club simply keeps him</h2>
        <span class="big-number">${fSeasons.length} seasons</span>
        <p>From ${fFirst} to ${fLast}. The longer a manager stays, the darker the green. The shields are what he won:</p>
        <p class="coach-trophies">${trophyLine(fT)}</p>
        <p class="note">*Counted in this dataset: league titles, national cups and major European trophies. Super cups and Club World Cups are not included.</p>`);
    set("txt-united", `
        <h2>Before and after</h2>
        <p>${busby.length ? `Before Ferguson, only Matt Busby stayed for a long time. The ${between.length} managers in between lasted ${plural(betweenMax, "season", "seasons")} at most. ` : ""}Since Ferguson left, United have had <strong>${afterCoaches.length} different managers of the season</strong> in ${after.length} seasons${afterNames.size > afterCoaches.length ? `, and ${afterNames.size} different men in the dugout counting interims` : ""}.</p>
        <p>${afterStriped.length ? `${stripeSwatch(3)} <strong>${plural(afterStriped.length, "striped season", "striped seasons")}</strong>: more than one manager in charge during the season.` : ""} Trophies since 2013: ${total(afterT)}.</p>`);
    set("txt-mourinho", `
        <h2>Now meet the counter-argument</h2>
        <p><strong>José Mourinho</strong> won at almost every stop, and rarely stayed long. ${M.clubs} clubs in this dataset, never longer than ${plural(mLongest, "season", "seasons")} in one go.</p>
        <p class="coach-trophies">${trophyLine(mT)}</p>
        <p>${mStriped.length ? `${plural(mStriped.length, "of his seasons is", "of his seasons are")} striped: he left, or was sacked, while the season was still running.` : ""}</p>`);
    set("txt-duel", `
        <h2>Two recipes, one result</h2>
        <p>Ferguson needed ${F.seasons} seasons for ${total(fT)} trophies. Mourinho won ${total(mT)} in ${M.seasons}.</p>
        <p>Per season, <strong>${total(mT) / M.seasons > total(fT) / F.seasons ? "Mourinho was the more prolific winner" : "Ferguson was the more prolific winner"}</strong>: ${fmt1(total(mT) / M.seasons)} against ${fmt1(total(fT) / F.seasons)} trophies a season.</p>
        <p class="note">*Seasons in which he was the manager of the season at one of the 35 clubs in this dataset.</p>`);
    set("txt-all-seasons", `
        <h2>So who proves the rule?</h2>
        <p>Let's ask ${d3.format(",")(d3.sum(stats, d => d.n))} seasons at the ${statsClubs()} clubs where we know every change. In a season with more than one manager, the club wins something in <strong>${pct(multiIdx.any)}</strong> of cases. When one manager stays ten full seasons or more, it's <strong>${pct(lastIdx.any)}</strong>.</p>
        <p>League titles show the same pattern: ${pct(multiIdx.title)} in turbulent seasons against ${pct(lastIdx.title)} under a long-serving manager.</p>
        <p class="note">Seasons marked as “no reliable data” are left out.</p>`);
    set("txt-clubs", `
        <h2>But look at the clubs</h2>
        <p>At club level the link almost disappears (correlation ${d3.format(".2f")(corr)}). ${listNames(topWinners.map(d => d.club.naam))} win the most trophies per season, yet none of them keeps a manager longer than ${fmt1(d3.max(topWinners, d => d.avg))} seasons on average.</p>
        <p>${mostStable.club.naam} is the most stable club, with ${fmt1(mostStable.avg)} seasons per manager on average.</p>
        <p>And cause and effect run both ways: managers who win get to stay. Stability may be a reward for success as much as a recipe for it.</p>`);
    set("txt-handover", `
        <h2>Your turn</h2>
        <p>Here are all English clubs since 1955. Find your own Ferguson, or your own Mourinho, in any of the seven leagues.</p>
        <a class="btn-cta" href="#explore">Explore the data ↓</a>`);

    // Figure
    const stage = document.getElementById("story-stage");
    const caption = document.getElementById("figure-caption");
    const legend = document.getElementById("story-legend");
    const heat = new Heatmap(stage);
    let chartLayer = null;

    const fergIdx = d => fSeasons.findIndex(s => s.key === d.key);
    const allSeasons = DB.seasonList;
    const mRange = allSeasons.filter(s => startYear(s) >= startYear(mSeasons[0].season) - 2);
    const fRange = allSeasons.filter(s => startYear(s) >= startYear(fFirst) - 1 && s <= fLast);

    const scenes = {
        hero: () => {
            caption.textContent = "";
            heat.render({ rows: [mu.id], seasons: fRange, highlight: () => false, names: false, prizes: false, rowH: 90, tickEvery: 3 });
            legend.innerHTML = "";
        },
        "ferguson-start": () => {
            caption.textContent = `Manchester United · ${fRange[0]}–${fLast}`;
            heat.render({
                rows: [mu.id], seasons: fRange, rowH: 90, names: true, tickEvery: 3,
                reveal: d => d.season < fFirst || (fergIdx(d) >= 0 && fergIdx(d) <= Math.max(dryStart - 1, 1)),
                stagger: d => Math.max(0, fergIdx(d)) * 180,
            });
            legend.innerHTML = legendHTML({ stripes: false });
        },
        "ferguson-full": () => {
            caption.textContent = `Manchester United · ${fRange[0]}–${fLast}`;
            heat.render({
                rows: [mu.id], seasons: fRange, rowH: 90, names: true, tickEvery: 3,
                reveal: d => d.season <= fLast,
                stagger: d => Math.max(0, fergIdx(d) - dryStart) * 70,
                prizeDelay: 250,
            });
            legend.innerHTML = legendHTML({ stripes: false });
        },
        united: () => {
            caption.textContent = "Manchester United · 1955/56–2024/25";
            heat.render({ rows: [mu.id], seasons: allSeasons, rowH: 90, names: true, stagger: d => d.season > fLast ? (startYear(d.season) - startYear(fLast)) * 80 : 0 });
            legend.innerHTML = legendHTML({ stripes: true });
        },
        mourinho: () => {
            caption.textContent = "José Mourinho's clubs · " + mRange[0] + "–2024/25";
            heat.render({
                rows: mClubs, seasons: mRange, names: true, rowH: stage.clientWidth < 640 ? 38 : 52,
                highlight: d => d.coachId === mour.id,
            });
            legend.innerHTML = legendHTML({ stripes: true });
        },
        duel: () => {
            caption.textContent = "Head to head";
            drawDuel(chartLayer, F, M);
            legend.innerHTML = "";
        },
        "all-seasons": () => {
            caption.textContent = `${statsClubs()} clubs with complete data · 1955/56–2024/25`;
            drawBars(chartLayer, stats);
            legend.innerHTML = "";
        },
        clubs: () => {
            caption.textContent = "All 35 clubs · 1955/56–2024/25";
            drawScatter(chartLayer, cstats, new Set([...topWinners, mostStable, ...[...cstats].sort((a, b) => b.avg - a.avg).slice(1, 3), [...cstats].sort((a, b) => a.avg - b.avg)[0]].map(d => d.club.naam)));
            legend.innerHTML = "";
        },
        handover: () => {
            caption.textContent = "England · 1955/56–2024/25";
            heat.render({ rows: eng, seasons: allSeasons, names: false, rowH: stage.clientWidth < 640 ? 30 : 40, stagger: d => (d.year - 1955) * 12 });
            legend.innerHTML = legendHTML({ stripes: true });
        },
    };
    const chartScenes = new Set(["duel", "all-seasons", "clubs"]);

    let current = null;
    function show(name) {
        if (name === current) return;
        const wasChart = chartScenes.has(current);
        current = name;
        if (chartScenes.has(name)) {
            heat.svg.style("display", "none");
            chartLayer?.remove();
            chartLayer = document.createElement("div");
            stage.appendChild(chartLayer);
        } else {
            chartLayer?.remove(); chartLayer = null;
            heat.svg.style("display", null);
            if (wasChart) heat.render({ ...heat.spec }, 0);
        }
        scenes[name]();
    }
    show("hero");

    // Een stap wordt actief zodra de tekstkaart een band in beeld binnenkomt:
    // desktop rond het midden, mobiel onderin (onder de vastgezette figuur).
    const steps = [...document.querySelectorAll(".step")];
    const mobile = window.matchMedia("(max-width: 900px)").matches;
    const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                const step = e.target.closest(".step");
                steps.forEach(s => s.classList.toggle("is-active", s === step));
                show(step.dataset.step);
            }
        });
    }, { rootMargin: mobile ? "-70% 0px -8% 0px" : "-45% 0px -45% 0px" });
    steps.forEach(s => io.observe(s.querySelector(".step-card")));

    let rt;
    window.addEventListener("resize", () => {
        clearTimeout(rt);
        rt = setTimeout(() => { const c = current; current = null; if (chartScenes.has(c)) show(c); else { heat.render(heat.spec, 0); current = c; } }, 200);
    });
}

function listNames(a) { return a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}` : a[0]; }

function pearson(a, b) {
    const ma = d3.mean(a), mb = d3.mean(b);
    const num = d3.sum(a, (x, i) => (x - ma) * (b[i] - mb));
    return num / Math.sqrt(d3.sum(a, x => (x - ma) ** 2) * d3.sum(b, y => (y - mb) ** 2));
}

// ------------------------------------------------------------------
// Explorer
// ------------------------------------------------------------------
const state = { mode: "country", country: "England", clubs: [], career: null, search: "", names: true };
let explorer;

function buildExplorer() {
    const tabs = d3.select("#country-tabs");
    tabs.selectAll("button").data(COUNTRIES).join("button").attr("role", "tab").text(d => d)
        .on("click", (e, d) => { Object.assign(state, { mode: "country", country: d }); renderExplorer(); });
    d3.selectAll("#mode-tabs button").on("click", function () {
        const mode = this.dataset.mode;
        state.mode = mode;
        if (mode === "compare" && !state.clubs.length) state.clubs = ["Manchester United", "Arsenal", "Real Madrid", "Bayern München", "Juventus"].map(n => clubByName(n)?.id).filter(Boolean);
        renderExplorer();
    });

    const names = [...new Set([...DB.coaches.values()].map(c => c.naam).filter(n => n !== UNKNOWN))].sort(d3.ascending);
    d3.select("#coach-list").selectAll("option").data(names).join("option").attr("value", d => d);

    document.getElementById("coach-search").addEventListener("input", e => { state.search = e.target.value.trim().toLowerCase(); applySearch(); });
    document.getElementById("career-search").addEventListener("input", e => {
        const c = coachByName(e.target.value);
        if (c) { state.career = c.naam; renderExplorer(); }
    });
    document.getElementById("toggle-names").addEventListener("change", e => { state.names = e.target.checked; renderExplorer(); });
    document.getElementById("share-btn").addEventListener("click", async () => {
        const btn = document.getElementById("share-btn");
        try { await navigator.clipboard.writeText(location.href); btn.textContent = "Link copied"; }
        catch { btn.textContent = "Copy the address bar"; }
        setTimeout(() => btn.textContent = "Copy link", 1800);
    });

    // Club picker
    const modal = document.getElementById("club-picker");
    document.getElementById("open-club-picker").addEventListener("click", () => { buildClubGrid(); modal.classList.remove("hidden"); document.getElementById("club-filter").focus(); });
    document.getElementById("close-club-picker").addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", e => { if (e.target === modal) modal.classList.add("hidden"); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") modal.classList.add("hidden"); });
    document.getElementById("club-filter").addEventListener("input", e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll(".club-item").forEach(el => el.classList.toggle("hidden", !el.textContent.toLowerCase().includes(q)));
    });

    explorer = new Heatmap(document.getElementById("explorer-stage"), {
        interactive: true,
        onHover: (d, locked) => showInfo(d),
    });
    document.getElementById("explorer-legend").innerHTML = legendHTML({ stripes: true, unknown: true }).replace(/^<div class="legend">|<\/div>$/g, "");
    const covered = DB.coverage.size;
    document.getElementById("coverage-note").textContent = covered < DB.clubs.length
        ? `Mid-season manager changes (stripes) are available for ${covered} of ${DB.clubs.length} clubs so far.` : "";

    let rt;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => renderExplorer(0), 200); });
}

function buildClubGrid() {
    const grid = d3.select("#club-grid");
    const groups = d3.groups(DB.clubs, c => c.land).sort((a, b) => d3.ascending(a[0], b[0]));
    grid.selectAll(".club-country").data(groups, d => d[0]).join(enter => {
        const g = enter.append("div").attr("class", "club-country");
        g.append("h4").text(d => d[0]);
        g.append("div").attr("class", "items");
        return g;
    }).select(".items").selectAll(".club-item").data(d => d[1], c => c.id).join(enter => {
        const it = enter.append("div").attr("class", "club-item").attr("role", "checkbox").attr("tabindex", 0);
        it.append("img").on("error", function () { this.style.visibility = "hidden"; }).attr("src", c => c.logo_url).attr("alt", "");
        it.append("span").text(c => c.naam);
        return it;
    }).classed("selected", c => state.clubs.includes(c.id)).attr("aria-checked", c => state.clubs.includes(c.id))
        .on("click", (e, c) => {
            state.clubs = state.clubs.includes(c.id) ? state.clubs.filter(x => x !== c.id) : [...state.clubs, c.id];
            buildClubGrid(); renderExplorer();
        });
}

function explorerRows() {
    if (state.mode === "country") return DB.clubs.filter(c => c.land === state.country).map(c => c.id);
    if (state.mode === "compare") return state.clubs;
    if (state.mode === "career") {
        const c = state.career && coachByName(state.career);
        return c ? [...new Set(seasonsOfCoach(c.id).map(s => s.clubId))] : [];
    }
    return [];
}

function renderExplorer(duration = 500) {
    d3.selectAll("#country-tabs button").classed("active", d => state.mode === "country" && d === state.country);
    d3.selectAll("#mode-tabs button").classed("active", function () { return this.dataset.mode === state.mode; });
    document.getElementById("field-career").classList.toggle("hidden", state.mode !== "career");
    document.getElementById("field-compare").classList.toggle("hidden", state.mode !== "compare");
    document.getElementById("field-search").classList.toggle("hidden", state.mode === "career");
    if (state.mode === "career" && state.career) document.getElementById("career-search").value = state.career;

    const rows = explorerRows();
    const stage = document.getElementById("explorer-stage");
    stage.querySelector(".empty-state")?.remove();
    explorer.locked = null;
    if (!rows.length) {
        explorer.svg.style("display", "none");
        stage.insertAdjacentHTML("beforeend", `<p class="empty-state">${state.mode === "career" ? "Type a manager's name above to follow his career." : "Add clubs to start comparing."}</p>`);
    } else {
        explorer.svg.style("display", null);
        explorer.render({
            rows, seasons: DB.seasonList, names: state.names, minWidth: 900,
            rowH: 46,
            highlight: state.mode === "career" ? (d => d.coach === state.career) : null,
        }, duration);
    }
    applySearch();
    showInfo(null);
    updateHash();
}

function applySearch() {
    if (state.mode === "career") return;
    const q = state.search;
    explorer.applyHighlight(q ? (d => d.coach.toLowerCase().includes(q) || (d.trainers || []).some(t => t.naam.toLowerCase().includes(q))) : null);
}

function showInfo(d) {
    const pane = document.getElementById("info-pane");
    if (!d) {
        applySearch();
        if (state.mode === "career") {
            explorer.applyHighlight(x => x.coach === state.career);
            explorer.setFocusSeasons(null);
            pane.innerHTML = state.career ? careerCard(state.career) : `<p class="info-default">Follow one manager across all the clubs in this dataset.</p>`;
        } else {
            explorer.setFocusSeasons(null);
            pane.innerHTML = state.mode === "country" ? countryInsights(state.country) : `<p class="info-default">Hover a block for details. Stripes: more than one manager in charge that season.</p>`;
        }
        return;
    }
    const t = d.tenure;
    explorer.applyHighlight(x => x.tenure === t);
    explorer.setFocusSeasons(t.seasons.map(s => s.season));
    if (d.unknown) {
        pane.innerHTML = `<div class="info-default"><strong>No reliable data</strong><br>For ${esc(d.club)} in ${d.season}, no single manager could be determined from the available sources.${lineupsHTML([d], d)}</div>`;
        return;
    }
    const coach = DB.coaches.get(d.coachId) || {};
    const years = `${startYear(t.first)} – ${endYear(t.last)}`;
    const turbulent = t.seasons.filter(s => s.multi);
    pane.innerHTML = `
        <div class="coach-card">
            <img class="coach-photo" src="${esc(coach.foto_url || AVATAR)}" alt="" onerror="this.onerror=null;this.src='${AVATAR}'">
            <div>
                <div class="coach-head">
                    <div>
                        <p class="coach-name">${esc(d.coach)}</p>
                        <span class="coach-nat">${coach.nat_code ? `<img src="https://flagcdn.com/w40/${esc(coach.nat_code.toLowerCase())}.png" alt="">` : ""}${esc(coach.nationaliteit || "")}</span>
                    </div>
                    <div style="text-align:right">
                        <div class="coach-club">${esc(d.club)}</div>
                        <div class="coach-tenure">${years} · ${plural(t.length, "season", "seasons")}</div>
                    </div>
                </div>
                <div class="coach-trophies">${total(t.trophies) ? trophyLine(t.trophies) : "<span>No trophies in this spell</span>"}</div>
                ${turbulent.length ? lineupsHTML(turbulent, d) : ""}
            </div>
        </div>`;
}

function lineupsHTML(list, current) {
    const rows = list.filter(s => s.trainers && s.trainers.length).map(s => {
        const names = s.trainers.map(tr => `${esc(tr.naam)}${tr.interim ? '<span class="interim">interim</span>' : ""}`).join(" → ");
        return `<div class="row ${s.key === current.key ? "current" : ""}"><span class="season">${s.season}</span><span>${names}</span></div>`;
    }).join("");
    return rows ? `<div class="season-lineups"><span class="lineups-title">Seasons with more than one manager</span>${rows}</div>` : "";
}

function careerCard(name) {
    const c = coachByName(name);
    if (!c) return "";
    const list = seasonsOfCoach(c.id);
    const tr = trophiesOf(list);
    const clubs = [...new Set(list.map(s => s.club))];
    const longest = d3.max(new Set(list.map(s => s.tenure)), t => t.length);
    return `
        <div class="coach-card">
            <img class="coach-photo" src="${esc(c.foto_url || AVATAR)}" alt="" onerror="this.onerror=null;this.src='${AVATAR}'">
            <div>
                <div class="coach-head">
                    <div>
                        <p class="coach-name">${esc(c.naam)}</p>
                        <span class="coach-nat">${c.nat_code ? `<img src="https://flagcdn.com/w40/${esc(c.nat_code.toLowerCase())}.png" alt="">` : ""}${esc(c.nationaliteit || "")}</span>
                    </div>
                    <div style="text-align:right">
                        <div class="coach-club">${plural(clubs.length, "club", "clubs")} · ${plural(list.length, "season", "seasons")}</div>
                        <div class="coach-tenure">longest stay: ${plural(longest, "season", "seasons")}</div>
                    </div>
                </div>
                <div class="coach-trophies">${total(tr) ? trophyLine(tr) : "<span>No trophies</span>"}</div>
            </div>
        </div>`;
}

function countryInsights(country) {
    const ids = new Set(DB.clubs.filter(c => c.land === country).map(c => c.id));
    const seasons = DB.seasons.filter(s => ids.has(s.clubId) && !s.unknown);
    if (!seasons.length) return "";
    const tenures = [...new Set(seasons.map(s => s.tenure))];
    const longest = tenures.reduce((a, b) => b.length > a.length ? b : a);
    const cs = clubStats().filter(d => ids.has(d.club.id));
    const stable = cs.reduce((a, b) => b.avg > a.avg ? b : a);
    const unstable = cs.reduce((a, b) => b.avg < a.avg ? b : a);
    const success = cs.reduce((a, b) => b.trophies > a.trophies ? b : a);
    const covered = cs.filter(d => d.hasCoverage);
    const turbulent = covered.length ? covered.reduce((a, b) => b.multi > a.multi ? b : a) : null;
    const card = (icon, label, value, sub) => `<div class="stat-card"><div class="stat-icon">${icon}</div><div><div class="stat-label">${label}</div><div class="stat-value">${esc(value)}</div><div class="stat-sub">${sub}</div></div></div>`;
    return `<div class="stat-grid">
        ${card('<span class="swatch" style="background:#003300"></span>', "Longest tenure", longest.coach, `${DB.clubById.get(longest.clubId).naam} · ${plural(longest.length, "season", "seasons")}`)}
        ${card('<span class="swatch" style="background:#339933"></span>', "Most stable club", stable.club.naam, `${fmt1(stable.avg)} seasons per manager`)}
        ${turbulent ? card(stripeSwatch(3), "Most mid-season changes", turbulent.club.naam, `${plural(turbulent.multi, "striped season", "striped seasons")}`) : card('<span class="swatch" style="background:#FF0033"></span>', "Least stable club", unstable.club.naam, `${fmt1(unstable.avg)} seasons per manager`)}
        ${card(shieldSVG(PRIZE.euro), "Most trophies", success.club.naam, `${success.trophies} trophies`)}
    </div>`;
}

// URL state: #explore/country=Spain | #explore/clubs=id,id | #explore/career=Name
function updateHash() {
    let h = "explore/";
    if (state.mode === "country") h += `country=${encodeURIComponent(state.country)}`;
    if (state.mode === "compare") h += `clubs=${state.clubs.map(encodeURIComponent).join(",")}`;
    if (state.mode === "career") h += state.career ? `career=${encodeURIComponent(state.career)}` : "career=";
    if (location.hash.startsWith("#explore")) history.replaceState(null, "", "#" + h);
    else pendingHash = h;
}
let pendingHash = null;
function readHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h.startsWith("explore")) return false;
    const [, q = ""] = h.split("/");
    const [k, v = ""] = q.split("=");
    if (k === "country" && COUNTRIES.includes(v)) Object.assign(state, { mode: "country", country: v });
    if (k === "clubs") Object.assign(state, { mode: "compare", clubs: v.split(",").filter(id => DB.clubById.has(id)) });
    if (k === "career") Object.assign(state, { mode: "career", career: coachByName(v) ? v : null });
    return true;
}

function navState() {
    const ex = document.getElementById("explore");
    const io = new IntersectionObserver(([e]) => {
        document.getElementById("nav-explore").classList.toggle("active", e.isIntersecting);
        document.getElementById("nav-story").classList.toggle("active", !e.isIntersecting);
        if (e.isIntersecting && pendingHash) { history.replaceState(null, "", "#" + pendingHash); pendingHash = null; }
    }, { rootMargin: "-40% 0px -40% 0px" });
    io.observe(ex);
    document.getElementById("nav-explore").addEventListener("click", () => { if (!location.hash.startsWith("#explore")) setTimeout(updateHash, 50); });
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
    const deepLink = readHash();
    buildStory();
    buildExplorer();
    renderExplorer(0);
    navState();
    window.addEventListener("hashchange", () => { if (readHash()) renderExplorer(); });
    loading.classList.add("done");
    if (deepLink) {
        document.documentElement.style.scrollBehavior = "auto";
        document.getElementById("explore").scrollIntoView();
        document.documentElement.style.scrollBehavior = "";
        updateHash();
    }
})();
