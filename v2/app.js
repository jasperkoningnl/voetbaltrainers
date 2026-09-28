// Managerial Merry-Go-Round v2
// Leest clubs, coaches en seizoenen uit de statische snapshot ../data/snapshot.json
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
const TENURE_LABELS = ["1 full season", "2 full seasons", "3–4", "5–6", "7–9", "10+"];
const TENURE_TEXT = ["#fff", "#14391d", "#0d2b14", "#fff", "#fff", "#fff"];
const PANEL = "#111a17";
// Prijzen: één schildvorm (viewBox 0 0 12 13), kleur = soort. Volgorde in een seizoensblok: titel, beker, Europa.
const PRIZE = {
    title: { fill: "#d9dde2", stroke: "#2a2f33" },
    cup: { fill: "#cd7f32", stroke: "#3b1f05" },
    euro: { fill: "#FFD700", stroke: "#3a2a00" },
};
const PRIZE_ORDER = ["title", "cup", "euro"];
const SHIELD = "M6 .5 11.5 2v4.2c0 3.3-2.4 5.4-5.5 6.3C2.9 11.6.5 9.5.5 6.2V2Z";
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
    // Gesplitst (voor het staafdiagram): rode banden met een smalle naad in de paneelkleur
    const sp = defs.append("pattern").attr("id", `${uid}-split`).attr("width", 10).attr("height", 24).attr("patternUnits", "userSpaceOnUse");
    sp.append("rect").attr("width", 10).attr("height", 22).attr("fill", "#FF0033");
    const u = defs.append("pattern").attr("id", `${uid}-unknown`).attr("width", 8).attr("height", 8)
        .attr("patternUnits", "userSpaceOnUse").attr("patternTransform", "rotate(45)");
    u.append("rect").attr("width", 8).attr("height", 8).attr("fill", "#1c2623");
    u.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 8).attr("stroke", "#2a3531").attr("stroke-width", 3);
    return uid;
}

// SVG-heatmap voor het intro. De verkenner heeft een eigen HTML-grid (zie Explorer).
class Heatmap {
    constructor(container) {
        this.el = container;
        this.svg = d3.select(container).append("svg").attr("class", "heatmap");
        this.uid = addPatterns(this.svg.append("defs"));
        this.g = this.svg.append("g");
        this.gCells = this.g.append("g");
        this.gDiv = this.g.append("g").attr("pointer-events", "none");
        this.gSplit = this.g.append("g").attr("pointer-events", "none");
        this.gLabels = this.g.append("g");
        this.gPrizes = this.g.append("g").attr("pointer-events", "none");
        this.gRows = this.g.append("g");
        this.gAxis = this.g.append("g").attr("class", "axis");
        this.spec = null;
    }

    fill(d) {
        if (d.unknown) return `url(#${this.uid}-unknown)`;
        return d.multi ? "#FF0033" : TENURE_COLORS[d.tenure.bucket];
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
        const delay = d => spec.stagger && visible(d) ? spec.stagger(d) : 0;

        // Cells
        this.gCells.selectAll("rect.cell").data(data, d => d.key).join(
            enter => enter.append("rect").attr("class", "cell")
                .attr("x", d => x(d.season)).attr("y", d => y(d.clubId)).attr("height", y.bandwidth())
                .attr("width", 0).attr("opacity", 0).attr("fill", d => this.fill(d)),
            update => update,
            exit => exit.transition(t).attr("opacity", 0).remove()
        )
            .transition(t)
            .delay(delay)
            .attr("x", d => x(d.season)).attr("y", d => y(d.clubId))
            .attr("width", d => visible(d) ? x.bandwidth() + 0.5 : 0)
            .attr("height", y.bandwidth())
            .attr("fill", d => this.fill(d))
            .attr("opacity", d => !visible(d) ? 0 : lit(d) ? 1 : 0.12);

        // Naden tussen de seizoenen in de paneelkleur; breder waar een nieuwe hoofdtrainer begint
        const dividers = data.filter(d => d.season !== spec.seasons[0]);
        this.gDiv.selectAll("line").data(dividers, d => d.key).join(
            enter => enter.append("line").attr("opacity", 0)
                .attr("x1", d => x(d.season)).attr("x2", d => x(d.season))
                .attr("y1", d => y(d.clubId)).attr("y2", d => y(d.clubId) + y.bandwidth()),
            update => update, exit => exit.remove()
        )
            .attr("class", d => d.index === 1 ? "divider-tenure" : "divider-season")
            .transition(t)
            .delay(delay)
            .attr("x1", d => x(d.season)).attr("x2", d => x(d.season))
            .attr("y1", d => y(d.clubId)).attr("y2", d => y(d.clubId) + y.bandwidth())
            .attr("opacity", d => visible(d) ? 1 : 0);

        // Seizoenen met meerdere trainers: het rode blok wordt in k gelijke stukken gesplitst (k = aantal trainers, max 5)
        const splits = data.filter(d => d.multi && !d.unknown).flatMap(d =>
            d3.range(1, Math.min(5, d.nCoaches)).map(j => ({ key: `${d.key}|${j}`, d, f: j / Math.min(5, d.nCoaches) })));
        this.gSplit.selectAll("line").data(splits, s => s.key).join(
            enter => enter.append("line").attr("opacity", 0).attr("stroke", PANEL).attr("stroke-width", 2),
            update => update, exit => exit.remove()
        )
            .transition(t)
            .delay(s => delay(s.d))
            .attr("x1", s => x(s.d.season)).attr("x2", s => x(s.d.season) + x.bandwidth())
            .attr("y1", s => y(s.d.clubId) + s.f * y.bandwidth()).attr("y2", s => y(s.d.clubId) + s.f * y.bandwidth())
            .attr("opacity", s => !visible(s.d) ? 0 : lit(s.d) ? 1 : 0.12);

        // Manager names on tenure blocks
        const tenures = [];
        if (spec.names) {
            const seen = new Set();
            data.forEach(d => {
                if (seen.has(d.tenure.id) || d.unknown) return;
                seen.add(d.tenure.id);
                // Naam alleen over de volle (niet-gesplitste) seizoenen
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

        // Prizes: schildjes bovenaan in het blok, onder elkaar
        const prizeData = showPrizes ? data.filter(d => d.trophyCount > 0) : [];
        const size = Math.max(5, Math.min(x.bandwidth() * 0.8, (y.bandwidth() - (spec.names ? 14 : 4)) / 3.3, 14));
        const step = size * 13 / 12 + 1;
        const pg = this.gPrizes.selectAll("g.prize").data(prizeData, d => d.key).join(
            enter => enter.append("g").attr("class", "prize").attr("opacity", 0),
            update => update, exit => exit.transition(t).attr("opacity", 0).remove()
        );
        pg.each(function (d) {
            const list = PRIZE_ORDER.filter(k => d[k]).map(k => PRIZE[k]);
            d3.select(this).selectAll("path").data(list).join("path").attr("d", SHIELD)
                .attr("fill", c => c.fill).attr("stroke", c => c.stroke).attr("stroke-width", 1)
                .attr("transform", (c, i) => `translate(${-size / 2},${i * step}) scale(${size / 12})`);
        });
        pg.transition(t)
            .delay(d => delay(d) + (spec.prizeDelay || 0))
            .attr("transform", d => `translate(${x(d.season) + x.bandwidth() / 2},${y(d.clubId) + 4})`)
            .attr("opacity", d => !visible(d) ? 0 : lit(d) ? 1 : 0.12);

        // Row labels
        const rows = this.gRows.selectAll("g.row-label-svg").data(labelW ? spec.rows : [], d => d).join(
            enter => {
                const g = enter.append("g").attr("class", "row-label-svg").attr("opacity", 0);
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
            const ticks = spec.seasons.filter((s, i) => i % every === 0);
            const tilt = sel => sel.selectAll(".tick text").attr("text-anchor", "end").attr("dx", "-.6em").attr("dy", ".15em").attr("transform", "rotate(-55)");
            this.gAxis.attr("transform", `translate(0,${innerH + 4})`)
                .transition(t)
                .call(d3.axisBottom(x).tickValues(ticks).tickSizeOuter(0))
                .on("end", () => tilt(this.gAxis));
            tilt(this.gAxis);
        }
    }
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
    const barFill = d => d.b === "multi" ? `url(#${pid}-split)` : TENURE_COLORS[d.b];
    const barLabel = d => d.b === "multi" ? (narrow ? "2+" : "changed mid-season") : narrow ? ["1", "2", "3–4", "5–6", "7–9", "10+"][d.b] : TENURE_LABELS[d.b];
    const y = d3.scaleLinear().domain([0, 0.6]).range([H - m.bottom, m.top]);
    svg.append("text").attr("class", "chart-title").attr("x", m.left).attr("y", 16).text(narrow ? "Seasons with at least one trophy" : "Share of seasons in which the club won at least one trophy");
    svg.append("text").attr("class", "chart-sub").attr("x", m.left).attr("y", 33).text(narrow ? `by tenure · ${statsClubs()} clubs` : `by how many full seasons the manager stayed · ${statsClubs()} clubs with complete data`);
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.left},0)`)
        .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(".0%")).tickSize(-(W - m.left - m.right)))
        .call(g => g.selectAll("line").attr("stroke", "rgba(255,255,255,.06)")).call(g => g.select("path").remove());
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
        .call(g => g.selectAll("line").attr("stroke", "rgba(255,255,255,.06)")).call(g => g.select("path").remove());
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.left},0)`)
        .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".2f")).tickSize(-(W - m.left - m.right)))
        .call(g => g.selectAll("line").attr("stroke", "rgba(255,255,255,.06)")).call(g => g.select("path").remove());
    svg.append("text").attr("class", "annot-muted").attr("x", W - m.right).attr("y", H - 8).attr("text-anchor", "end").text("average seasons per manager");
    const s = narrow ? 20 : 26;
    const nodes = svg.append("g").selectAll("g").data(stats).join("g")
        .attr("transform", d => `translate(${x(1)},${y(0)})`).attr("opacity", 0);
    nodes.append("circle").attr("r", s / 2 + 2).attr("fill", "#eef3ef").attr("stroke", PANEL);
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
        svg.append("rect").attr("x", cx - 6).attr("y", yy + 18).attr("height", bh).attr("width", 0).attr("fill", "#339933").attr("rx", 3)
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
// Legenda (verkenner en intro): tenurekleuren, gesplitste blokken, schildjes
const shieldSVG = (kind, w = 10) => `<svg class="shield" width="${w}" height="${w * 13 / 12}" viewBox="0 0 12 13" aria-hidden="true"><path d="${SHIELD}" fill="${PRIZE[kind].fill}" stroke="${PRIZE[kind].stroke}" stroke-width="1"/></svg>`;
const splitSwatch = k => `<span class="sw">${"<i></i>".repeat(k)}</span>`;
function legendHTML({ split = true, prizes = true, unknown = false, hint = false } = {}) {
    const items = [
        `<span class="legend-item"><span class="legend-swatches">${TENURE_COLORS.map(c => `<span class="sw" style="background:${c}"></span>`).join("")}</span>1 → 10+ seasons in charge</span>`,
        split ? `<span class="legend-item"><span class="legend-swatches split">${[1, 2, 3, 4, 5].map(splitSwatch).join("")}</span>1 → 5+ managers that season</span>` : "",
        prizes ? `<span class="legend-shields">${[["title", "League"], ["cup", "Cup"], ["euro", "Europe"]].map(([k, l]) => `<span>${shieldSVG(k)}${l}</span>`).join("")}</span>` : "",
        unknown ? `<span class="legend-item"><span class="legend-swatches"><span class="sw" style="background:repeating-linear-gradient(45deg,#2a3531 0 3px,#1c2623 3px 6px)"></span></span>No reliable data</span>` : "",
        hint ? `<span class="legend-hint">Click a block to lock the manager</span>` : "",
    ];
    return items.filter(Boolean).join("");
}
const trophyLine = t => [
    t.title ? `<span>${shieldSVG("title", 12)} ${plural(t.title, "league title", "league titles")}</span>` : "",
    t.cup ? `<span>${shieldSVG("cup", 12)} ${plural(t.cup, "national cup", "national cups")}</span>` : "",
    t.euro ? `<span>${shieldSVG("euro", 12)} ${plural(t.euro, "European trophy", "European trophies")}</span>` : "",
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
        <p>${afterStriped.length ? `<span class="legend-swatches split" style="display:inline-flex;vertical-align:-4px">${splitSwatch(3)}</span> <strong>${plural(afterStriped.length, "split season", "split seasons")}</strong>: more than one manager in charge during the season, one red piece per manager.` : ""} Trophies since 2013: ${total(afterT)}.</p>`);
    set("txt-mourinho", `
        <h2>Now meet the counter-argument</h2>
        <p><strong>José Mourinho</strong> won at almost every stop, and rarely stayed long. ${M.clubs} clubs in this dataset, never longer than ${plural(mLongest, "season", "seasons")} in one go.</p>
        <p class="coach-trophies">${trophyLine(mT)}</p>
        <p>${mStriped.length ? `${plural(mStriped.length, "of his seasons is", "of his seasons are")} split: he left, or was sacked, while the season was still running.` : ""}</p>`);
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
            legend.innerHTML = `<div class="legend">${legendHTML({ split: false })}</div>`;
        },
        "ferguson-full": () => {
            caption.textContent = `Manchester United · ${fRange[0]}–${fLast}`;
            heat.render({
                rows: [mu.id], seasons: fRange, rowH: 90, names: true, tickEvery: 3,
                reveal: d => d.season <= fLast,
                stagger: d => Math.max(0, fergIdx(d) - dryStart) * 70,
                prizeDelay: 250,
            });
            legend.innerHTML = `<div class="legend">${legendHTML({ split: false })}</div>`;
        },
        united: () => {
            caption.textContent = "Manchester United · 1955/56–2024/25";
            heat.render({ rows: [mu.id], seasons: allSeasons, rowH: 90, names: true, stagger: d => d.season > fLast ? (startYear(d.season) - startYear(fLast)) * 80 : 0 });
            legend.innerHTML = `<div class="legend">${legendHTML()}</div>`;
        },
        mourinho: () => {
            caption.textContent = "José Mourinho's clubs · " + mRange[0] + "–2024/25";
            heat.render({
                rows: mClubs, seasons: mRange, names: true, rowH: stage.clientWidth < 640 ? 38 : 52,
                highlight: d => d.coachId === mour.id,
            });
            legend.innerHTML = `<div class="legend">${legendHTML()}</div>`;
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
            legend.innerHTML = `<div class="legend">${legendHTML()}</div>`;
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

function buildExplorer() {
    DB.seasonByKey = new Map(DB.seasons.map(s => [s.key, s]));
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
        const t = cell ? DB.seasonByKey.get(cell.dataset.key).tenure : null;
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
        // Aaneengesloten seizoenen van dezelfde tenure vormen één segment
        const segs = [];
        let cur = null;
        columns.forEach(season => {
            let d = bySeason.get(season) || null;
            if (d && coach && d.coachId !== coach.id) d = null;
            if (d?.unknown) ui.hasUnknown = true;
            const tid = d ? d.tenure.id : null;
            if (!cur || cur.tid !== tid) { cur = { tid, cells: [] }; segs.push(cur); }
            cur.cells.push(d);
        });
        const segHTML = segs.map(s => s.tid
            ? `<div class="seg live" data-tenure="${esc(s.tid)}">${s.cells.map(d => cellHTML(d, cellW)).join("")}</div>`
            : `<div class="seg">${s.cells.map(() => cellHTML(null, cellW)).join("")}</div>`).join("");
        return `<div class="grid-row">
            <div class="row-label" style="width:${labelW}px">
                <img class="row-logo" src="${esc(club.logo_url)}" alt="">
                ${career ? `<span class="row-cc">${COUNTRY_CODE[club.land] || ""}</span>` : ""}
                ${narrow ? "" : `<span class="row-name" title="${esc(club.naam)}">${esc(club.naam)}</span>`}
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
    renderLegend();
}

function renderLegend() {
    $("explorer-legend").innerHTML = legendHTML({ unknown: ui.hasUnknown, hint: true });
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
                ? clubs.map(c => `<button class="pop-item club-item" type="button" data-club="${esc(c.id)}"><img src="${esc(c.logo_url)}" alt=""><span>${esc(c.naam)}</span><span class="note">${COUNTRY_CODE[c.land] || ""}</span></button>`).join("")
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
    const t = d ? d.tenure : ui.locked;
    if (t) pane.innerHTML = tenureHTML(t, d);
    else if (state.view === "career") pane.innerHTML = state.career ? careerHTML(state.career) : `<p class="info-default">Follow one manager from club to club.</p>`;
    else {
        const ids = state.view === "league" ? DB.clubs.filter(c => c.land === state.country).map(c => c.id) : state.clubs;
        pane.innerHTML = ids.length ? insightsHTML(ids) : `<p class="info-default">Add clubs to compare them side by side.</p>`;
    }
    // Geen of kapotte foto: initialen
    pane.querySelectorAll("img.info-photo").forEach(img => img.addEventListener("error", () => {
        const div = document.createElement("div");
        div.className = "info-photo initials";
        div.textContent = img.dataset.initials;
        img.replaceWith(div);
    }, { once: true }));
}

const photoHTML = (url, name) => url
    ? `<img class="info-photo" src="${esc(url)}" alt="" data-initials="${esc(initials(name))}">`
    : `<div class="info-photo initials">${esc(initials(name))}</div>`;

function chipsHTML(tr) {
    const chips = [["title", "league", "league"], ["cup", "cup", "cups"], ["euro", "European", "European"]]
        .filter(([k]) => tr[k]).map(([k, one, many]) => `<span class="chip">${shieldSVG(k)}${tr[k]} ${tr[k] === 1 ? one : many}</span>`);
    return `<div class="chips">${chips.length ? chips.join("") : `<span class="chip none">No trophies</span>`}</div>`;
}

const badgeHTML = (text, bucket) =>
    `<span class="tenure-badge" style="background:${TENURE_COLORS[bucket]};color:${TENURE_TEXT[bucket]}">${esc(text)}</span>`;

function infoCardHTML({ photo, name, nat, sub, extra = "", chips, badge }) {
    return `<div class="info-card">
        ${photo}
        <div class="info-main">
            <div class="info-head"><span class="info-name">${esc(name)}</span>${nat ? `<span class="info-nat">${esc(nat)}</span>` : ""}</div>
            <div class="info-sub">${sub}</div>
            ${extra}
        </div>
        ${chips}
        ${badge}
    </div>`;
}

function tenureHTML(t, d) {
    const club = DB.clubById.get(t.clubId)?.naam || "";
    const span = t.first === t.last ? t.first : `${t.first} – ${t.last}`;
    if (t.seasons[0].unknown) {
        return `<p class="info-default"><strong>No reliable data</strong> · ${esc(club)} · ${span}. No single manager could be determined from the available sources.</p>`;
    }
    const coach = DB.coaches.get(t.coachId) || {};
    // Seizoenen met meer trainers: wie er stonden (het seizoen onder de muis eerst)
    const multi = t.multiSeasons.filter(s => s.trainers?.length);
    const ordered = d?.multi ? [d, ...multi.filter(s => s !== d)] : multi;
    const line = s => `${s.season}: ${s.trainers.map(tr => `${esc(tr.naam)}${tr.interim ? '<span class="interim">interim</span>' : ""}`).join(" → ")}`;
    const plain = ordered.map(s => `${s.season}: ${s.trainers.map(tr => tr.naam + (tr.interim ? " (interim)" : "")).join(" → ")}`).join(" · ");
    const extra = ordered.length ? `<div class="info-extra" title="${esc(plain)}">${ordered.map(line).join(" · ")}</div>` : "";
    return infoCardHTML({
        photo: photoHTML(coach.foto_url, t.coach),
        name: t.coach, nat: coach.nationaliteit,
        sub: `<span class="club">${esc(club)}</span> <span class="span">· ${span}</span>`,
        extra,
        chips: chipsHTML(t.trophies),
        badge: badgeHTML(plural(t.length, "season", "seasons"), t.bucket),
    });
}

function careerHTML(name) {
    const c = coachByName(name);
    if (!c) return "";
    const list = seasonsOfCoach(c.id);
    const clubs = new Set(list.map(s => s.clubId));
    const countries = new Set(list.map(s => s.country));
    const longest = [...new Set(list.map(s => s.tenure))].reduce((a, b) => b.length > a.length ? b : a);
    return infoCardHTML({
        photo: photoHTML(c.foto_url, c.naam),
        name: c.naam, nat: c.nationaliteit,
        sub: `<span class="club">${plural(clubs.size, "club", "clubs")} · ${plural(countries.size, "country", "countries")}</span> <span class="span">· ${list[0].season} – ${list[list.length - 1].season}</span>`,
        extra: `<div class="info-extra">${plural(list.length, "season", "seasons")} as manager of the season in this dataset</div>`,
        chips: chipsHTML(trophiesOf(list)),
        badge: badgeHTML(`longest: ${longest.length}`, longest.bucket),
    });
}

// Standaard (niets aangewezen): vier kerncijfers voor de clubs in beeld
function insightsHTML(clubIds) {
    const ids = new Set(clubIds);
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
    const swatch = c => `<span class="swatch" style="background:${c}"></span>`;
    const card = (icon, label, value, sub) => `<div class="stat-card"><div class="stat-icon">${icon}</div><div><div class="stat-label">${label}</div><div class="stat-value">${esc(value)}</div><div class="stat-sub">${sub}</div></div></div>`;
    return `<div class="stat-grid">
        ${card(swatch("#003300"), "Longest tenure", longest.coach, `${esc(DB.clubById.get(longest.clubId).naam)} · ${plural(longest.length, "season", "seasons")}`)}
        ${card(swatch("#339933"), "Most stable club", stable.club.naam, `${fmt1(stable.avg)} seasons per manager`)}
        ${turbulent ? card(`<span class="legend-swatches split">${splitSwatch(3)}</span>`, "Most mid-season changes", turbulent.club.naam, plural(turbulent.multi, "split season", "split seasons")) : card(swatch("#FF0033"), "Least stable club", unstable.club.naam, `${fmt1(unstable.avg)} seasons per manager`)}
        ${card(shieldSVG("euro", 14), "Most trophies", success.club.naam, `${success.trophies} trophies`)}
    </div>`;
}

// URL state: #explore/country=Spain | #explore/clubs=id,id | #explore/career=Name
function hashFor() {
    if (state.view === "league") return `explore/country=${encodeURIComponent(state.country)}`;
    if (state.view === "compare") return `explore/clubs=${state.clubs.map(encodeURIComponent).join(",")}`;
    return `explore/career=${state.career ? encodeURIComponent(state.career) : ""}`;
}
function updateHash() {
    const h = hashFor();
    if (location.hash.startsWith("#explore")) history.replaceState(null, "", "#" + h);
    else pendingHash = h;
}
let pendingHash = null;
function readHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h.startsWith("explore")) return false;
    const [, q = ""] = h.split("/");
    const [k, v = ""] = q.split("=");
    if (k === "country" && COUNTRIES.includes(v)) Object.assign(state, { view: "league", country: v });
    if (k === "clubs") Object.assign(state, { view: "compare", clubs: v.split(",").filter(id => DB.clubById.has(id)) });
    if (k === "career") Object.assign(state, { view: "career", career: coachByName(v) ? v : coachByName(DEFAULT_COACH) ? DEFAULT_COACH : null });
    ui.locked = null;
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
    renderExplorer();
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
