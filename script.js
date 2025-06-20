// Script Versie: 7.3 - Bugfix voor verdwijnende dividers
console.log("Script versie: 7.3 geladen.");

import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const infoPane = d3.select("#info-pane");

async function loadDataFromFirestore() {
    if (!window.db) {
        console.error("Firestore database is niet geïnitialiseerd.");
        return [];
    }
    try {
        const [coachesSnapshot, seizoenenSnapshot] = await Promise.all([
            getDocs(collection(window.db, "coaches")),
            getDocs(collection(window.db, "seizoenen"))
        ]);
        const coachesMap = new Map();
        coachesSnapshot.forEach(doc => coachesMap.set(doc.id, doc.data()));
        const joinedData = seizoenenSnapshot.docs.map(doc => {
            const seizoenData = doc.data();
            const coachInfo = coachesMap.get(seizoenData.coachId);
            const { naam = 'Unknown Coach', nationaliteit = 'Unknown', nat_code = '', foto_url = '' } = coachInfo || {};
            return { ...seizoenData, Coach: naam, nationaliteit, nat_code, foto_url };
        }).filter(Boolean);
        console.log(`Data succesvol geladen en samengevoegd: ${joinedData.length} documenten.`);
        return joinedData;
    } catch (error) {
        console.error("Fout bij het laden van data uit Firestore:", error);
        infoPane.html('<p class="error">Could not load data from the database. Please try again later.</p>');
        return [];
    }
}

function prepareData(data) {
    if (!data || data.length === 0) return [];
    data.sort((a, b) => d3.ascending(a.club, b.club) || d3.ascending(a.seizoen, b.seizoen));
    const periodes = [];
    let huidigePeriode = null;
    data.forEach(d => {
        if (!huidigePeriode || d.Coach !== huidigePeriode.coach || d.club !== huidigePeriode.club) {
            huidigePeriode = {
                coach: d.Coach,
                club: d.club,
                seizoenen: [],
                id: `${d.Coach.replace(/\s+/g, '-')}-${d.club.replace(/\s+/g, '-')}-${d.seizoen.substring(0, 4)}`
            };
            periodes.push(huidigePeriode);
        }
        huidigePeriode.seizoenen.push(d);
    });
    periodes.forEach(p => {
        const startJaar = p.seizoenen[0].seizoen.substring(0, 4);
        const laatsteSeizoen = p.seizoenen[p.seizoenen.length - 1].seizoen;
        const [startDeel, eindDeel] = laatsteSeizoen.split('/');
        const eeuw = Math.floor(parseInt(startDeel) / 100) * 100;
        const eindJaar = eeuw + parseInt(eindDeel);
        p.seizoenen.forEach(s => {
            s.stintLength = p.seizoenen.length;
            s.tenureId = p.id;
            s.tenureStartYear = startJaar;
            s.tenureEndYear = eindJaar.toString();
        });
    });
    return data;
}

function drawHeatmap(data) {
    const margin = {top: 20, right: 30, bottom: 80, left: 220};
    const width = 1400 - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;
    d3.select("#heatmap-container").html("");
    const svg = d3.select("#heatmap-container").append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);
    const seizoenen = [...new Set(data.map(d => d.seizoen))].sort();
    const clubs = [...new Set(data.map(d => d.club))];
    const logoData = clubs.map(club => ({
        Club: club,
        Logo_URL: (data.find(d => d.club === club) || {}).logo_url || ''
    }));
    const x = d3.scaleBand().range([0, width]).domain(seizoenen).padding(0);
    const y = d3.scaleBand().range([height, 0]).domain(clubs).padding(0.1);
    const tickValues = seizoenen.filter((d, i) => i % 5 === 0 || i === seizoenen.length - 1);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0, ${height})`)
        .call(d3.axisBottom(x).tickValues(tickValues).tickSizeOuter(0))
        .selectAll("text").style("text-anchor", "end").attr("dx", "-.8em").attr("dy", "-.5em").attr("transform", "rotate(-90)");
    const yAxisTicks = svg.append("g").attr("class", "axis y-axis").selectAll(".tick").data(logoData).enter()
        .append("g").attr("class", "tick").attr("transform", d => `translate(0, ${y(d.Club) + y.bandwidth() / 2})`);
    yAxisTicks.append("rect").attr("x", -margin.left + 30).attr("y", -y.bandwidth()/2).attr("width", 180).attr("height", y.bandwidth()).attr("fill", "#f8f9fa").attr("rx", 4);
    yAxisTicks.append("image").attr("xlink:href", d => d.Logo_URL).attr("x", -margin.left + 40).attr("y", -15).attr("width", 30).attr("height", 30);
    yAxisTicks.append("text").attr("x", -margin.left + 85).attr("dy", ".32em").style("text-anchor", "start").text(d => d.Club);

    const getColor = d => {
        const len = d.stintLength;
        if (len === 1) return "#ff0033";
        if (len === 2) return "#b7e4c7";
        if (len >= 3 && len <= 4) return "#99ff99";
        if (len >= 5 && len <= 6) return "#66cc66";
        if (len >= 7 && len <= 9) return "#00ff00";
        if (len >= 10) return "#006600";
        return "#ccc";
    };

    const mouseover = (event, d) => { highlightTenure(d.tenureId); updateInfoPane(d); };
    const mouseleave = () => { clearHighlight(); setInfoPaneDefault(); };

    svg.selectAll(".bar").data(data).enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.seizoen))
        .attr("y", d => y(d.club))
        .attr("width", x.bandwidth() + 1)
        .attr("height", y.bandwidth())
        .style("fill", d => getColor(d))
        .attr("shape-rendering", "crispEdges")
        .on("mouseover", mouseover)
        .on("mouseleave", mouseleave);

    const internalDividersData = data.filter(d => d.seizoen.substring(0, 4) !== d.tenureStartYear);
    svg.selectAll(".season-divider").data(internalDividersData).enter().append("line")
        .attr("class", "season-divider")
        .attr("x1", d => x(d.seizoen)).attr("y1", d => y(d.club))
        .attr("x2", d => x(d.seizoen)).attr("y2", d => y(d.club) + y.bandwidth())
        .datum(d => d);

    const coachChanges = data.filter(d => {
        const prevSeason = seizoenen[seizoenen.indexOf(d.seizoen) - 1];
        if (!prevSeason) return false;
        const prevData = data.find(item => item.club === d.club && item.seizoen === prevSeason);
        return !prevData || prevData.tenureId !== d.tenureId;
    });
    svg.selectAll(".coach-divider").data(coachChanges).enter().append("line")
        .attr("class", "coach-divider")
        .attr("x1", d => x(d.seizoen)).attr("y1", d => y(d.club))
        .attr("x2", d => x(d.seizoen)).attr("y2", d => y(d.club) + y.bandwidth())
        .datum(d => d);
        
    const icons = { schild: "M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z" };
    svg.selectAll(".prize-group").data(data.filter(d => d.landstitel === 'Y' || d.nationale_beker === 'Y' || d.europese_prijs === 'Y')).enter().append("g")
        .attr("class", "prize-group")
        .attr("transform", d => `translate(${x(d.seizoen) + x.bandwidth() / 2}, ${y(d.club) + y.bandwidth() / 2})`)
        .datum(d => d)
        .each(function(d) {
            const el = d3.select(this);
            const prijzen = [];
            if (d.europese_prijs === 'Y') prijzen.push('#FFD700');
            if (d.landstitel === 'Y') prijzen.push('#C0C0C0');
            if (d.nationale_beker === 'Y') prijzen.push('#CD7F32');
            const totalHeight = (prijzen.length - 1) * 12;
            prijzen.forEach((p, i) => {
                el.append("path").attr("d", icons.schild).attr("fill", p).attr("stroke", "#222")
                  .attr("stroke-width", 0.5).attr("transform", `translate(-8, ${-totalHeight/2 + i*12 - 8}) scale(0.8)`);
            });
        });
    setInfoPaneDefault();
}

function setInfoPaneDefault() {
    infoPane.attr("class", "default-state").html(`<p>Hover over a tenure or select a club to see details.</p>`);
}

function updateInfoPane(d) {
    const hasPhoto = d.foto_url && d.foto_url.trim() !== '';
    const flagApiUrl = d.nat_code ? `https://flagcdn.com/w40/${d.nat_code.toLowerCase()}.png` : '';
    const avatarIconPath = "M25 26.5 C20 26.5 15 29 15 34 V37 H35 V34 C35 29 30 26.5 25 26.5 Z M25 15 C21.1 15 18 18.1 18 22 C18 25.9 21.1 29 25 29 C28.9 29 32 25.9 32 22 C32 18.1 28.9 15 25 15 Z";
    let imageHtml = hasPhoto
        ? `<img src="${d.foto_url}" class="info-pane-img" onerror="this.onerror=null; this.outerHTML='<svg class=\\'info-pane-img\\' viewBox=\\'0 0 50 50\\'><path d=\\'${avatarIconPath}\\' fill=\\'#ccc\\'></path></svg>';">`
        : `<svg class="info-pane-img" viewBox="0 0 50 50"><path d="${avatarIconPath}" fill="#ccc"></path></svg>`;
    const tenureYears = d.tenureStartYear === d.tenureEndYear ? d.tenureStartYear : `${d.tenureStartYear} – ${d.tenureEndYear}`;
    const content = `
        ${imageHtml}
        <div class="info-pane-details">
            <p class="name">${d.Coach}</p>
            <div class="nationality">
                ${flagApiUrl ? `<img src="${flagApiUrl}" class="info-pane-flag">` : ''}
                <span>${d.nationaliteit}</span>
            </div>
        </div>
        <div class="info-pane-extra">
            <p class="club">${d.club}</p>
            <p class="tenure">${tenureYears} (${d.stintLength} ${d.stintLength > 1 ? 'seasons' : 'season'})</p>
        </div>`;
    infoPane.attr("class", "details-state").html(content);
}

function highlightTenure(tenureId) {
    d3.selectAll(".bar, .coach-divider, .prize-group, .season-divider").classed("is-dimmed", true);
    d3.selectAll(".bar, .coach-divider, .prize-group, .season-divider")
        .filter(d => d && d.tenureId === tenureId)
        .classed("is-dimmed", false);
        // FIX: .raise() is verwijderd om de render-volgorde stabiel te houden
}

function clearHighlight() {
    d3.selectAll(".bar, .coach-divider, .prize-group, .season-divider").classed("is-dimmed", false);
}

function drawLegend() {
    d3.select("#legend-container").html("");
    const legendData = [
        { color: "#ff0033", label: "1 Season" }, { color: "#b7e4c7", label: "2 Seasons" },
        { color: "#99ff99", label: "3-4 Seasons" }, { color: "#66cc66", label: "5-6 Seasons" },
        { color: "#00ff00", label: "7-9 Seasons" }, { color: "#006600", label: "10+ Seasons" },
    ];
    const prizeData = [
        { color: '#FFD700', label: 'European Trophy' }, { color: '#C0C0C0', label: 'National Title' },
        { color: '#CD7F32', label: 'National Cup' }
    ];

    const svgNode = d3.select("#legend-container").append("svg").attr("height", 50);
    const mainGroup = svgNode.append("g");
    const tenureGroup = mainGroup.append("g").attr("class", "legend-group");
    const prizeGroup = mainGroup.append("g").attr("class", "legend-group");

    let tenureOffset = 0;
    legendData.forEach(d => {
        const item = tenureGroup.append("g").attr("transform", `translate(${tenureOffset}, 0)`);
        item.append("rect").attr("width", 20).attr("height", 20).attr("fill", d.color).attr("rx", 3);
        item.append("text").attr("x", 25).attr("y", 15).text(d.label).attr("class", "legend-label");
        tenureOffset += item.node().getBBox().width + 30;
    });

    let prizeOffset = 0;
    prizeData.forEach(d => {
        const item = prizeGroup.append("g").attr("transform", `translate(${prizeOffset}, 0)`);
        item.append("path").attr("d", "M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z")
            .attr("transform", "translate(4, 2) scale(1)").attr("fill", d.color).attr("stroke", "#444").attr("stroke-width", 0.5);
        item.append("text").attr("x", 25).attr("y", 15).text(d.label).attr("class", "legend-label");
        prizeOffset += item.node().getBBox().width + 30;
    });

    const dividerMargin = 40;
    const tenureWidth = tenureGroup.node().getBBox().width;
    prizeGroup.attr("transform", `translate(${tenureWidth + dividerMargin}, 0)`);
    
    mainGroup.append("line")
        .attr("class", "legend-divider")
        .attr("x1", tenureWidth + dividerMargin / 2)
        .attr("y1", -5)
        .attr("x2", tenureWidth + dividerMargin / 2)
        .attr("y2", 25);
        
    const totalWidth = mainGroup.node().getBBox().width;
    const containerWidth = d3.select("#legend-container").node().getBoundingClientRect().width;
    mainGroup.attr("transform", `translate(${(containerWidth - totalWidth) / 2}, 20)`);
    svgNode.attr("width", containerWidth);
}

async function main() {
    const rawData = await loadDataFromFirestore();
    if (!rawData || rawData.length === 0) return;
    const data = prepareData(rawData);
    drawHeatmap(data);
    drawLegend();
    window.addEventListener('resize', () => { drawLegend(); });
}

main();
