// Script Versie: 6.0 - Gecorrigeerde Kleurlogica & Bugfixes
console.log("Script versie: 6.0 geladen.");

// Importeer de benodigde Firestore functies
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- Globale D3 Selecties ---
const infoPane = d3.select("#info-pane");

// --- DATA LADEN & VOORBEREIDEN ---
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
        coachesSnapshot.forEach(doc => {
            coachesMap.set(doc.id, doc.data());
        });

        const joinedData = [];
        seizoenenSnapshot.forEach(doc => {
            const seizoenData = doc.data();
            const coachInfo = coachesMap.get(seizoenData.coachId);
            if (coachInfo) {
                joinedData.push({
                    ...seizoenData,
                    Coach: coachInfo.naam,
                    Nationaliteit_Coach: coachInfo.nationaliteit,
                    Coach_Nat_Code: coachInfo.nat_code,
                    Coach_Foto_URL: coachInfo.foto_url
                });
            }
        });
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
                // FIX: ID is nu uniek per AANSTELLING door startjaar toe te voegen
                id: `${d.Coach.replace(/\s+/g, '-')}-${d.club.replace(/\s+/g, '-')}-${d.seizoen.substring(0, 4)}`
            };
            periodes.push(huidigePeriode);
        }
        huidigePeriode.seizoenen.push(d);
    });

    periodes.forEach(p => {
        const startJaar = p.seizoenen[0].seizoen.substring(0, 4);
        
        // FIX: Correcte eindjaar-berekening voor "YYYY/YY" format
        const laatsteSeizoen = p.seizoenen[p.seizoenen.length - 1].seizoen;
        const [startDeel, eindDeel] = laatsteSeizoen.split('/');
        const eeuw = Math.floor(parseInt(startDeel) / 100) * 100;
        const eindJaar = eeuw + parseInt(eindDeel);

        p.seizoenen.forEach((s, index) => {
            s.stintLength = p.seizoenen.length;
            s.tenureId = p.id;
            s.tenureStartYear = startJaar;
            s.tenureEndYear = eindJaar;
        });
    });

    return data;
}


// --- HOOFD VISUALISATIE FUNCTIE ---
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
    const xAxis = d3.axisBottom(x).tickValues(tickValues).tickSizeOuter(0);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0, ${height})`).call(xAxis)
        .selectAll("text").style("text-anchor", "end").attr("dx", "-.8em").attr("dy", "-.5em").attr("transform", "rotate(-90)");

    const yAxisGroup = svg.append("g").attr("class", "axis y-axis");
    const yAxisTicks = yAxisGroup.selectAll(".tick").data(logoData).enter().append("g")
        .attr("class", "tick").attr("transform", d => `translate(0, ${y(d.Club) + y.bandwidth() / 2})`);
    
    yAxisTicks.append("rect").attr("x", -margin.left + 30).attr("y", -y.bandwidth()/2).attr("width", 180).attr("height", y.bandwidth()).attr("fill", "#f8f9fa").attr("rx", 4);
    yAxisTicks.append("image").attr("xlink:href", d => d.Logo_URL).attr("x", -margin.left + 40).attr("y", -15).attr("width", 30).attr("height", 30);
    yAxisTicks.append("text").attr("x", -margin.left + 85).attr("dy", ".32em").style("text-anchor", "start").text(d => d.Club);

    // FIX: Nieuwe kleurlogica gebaseerd op totale lengte van de aanstelling
    const getColor = d => {
        const len = d.stintLength;
        if (len === 1) return "#ff3333"; // 1 season
        if (len === 2) return "#99ff99"; // 2 seasons
        if (len >= 3 && len <= 5) return "#66cc66"; // 3-5 seasons
        if (len >= 6 && len <= 10) return "#339933"; // 6-10 seasons
        if (len >= 11) return "#006600"; // 11+ seasons
        return "#ccc"; // Fallback
    };

    const mouseover = (event, d) => {
        highlightTenure(d.tenureId);
        updateInfoPane(d);
    };

    const mouseleave = (event, d) => {
        clearHighlight();
        setInfoPaneDefault();
    };

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

    const icons = { schild: "M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z" };
    // We moeten de `tenureId` ook aan de dividers en prijzen koppelen voor correcte highlighting
    const coachChanges = data.filter(d => {
        const prevSeasonIndex = seizoenen.indexOf(d.seizoen) - 1;
        if (prevSeasonIndex < 0) return false;
        const prevSeason = seizoenen[prevSeasonIndex];
        const prevData = data.find(item => item.club === d.club && item.seizoen === prevSeason);
        return prevData && prevData.tenureId !== d.tenureId;
    });
    
    svg.selectAll(".coach-divider").data(coachChanges).enter().append("line")
        .attr("class", "coach-divider")
        .attr("x1", d => x(d.seizoen)).attr("y1", d => y(d.club))
        .attr("x2", d => x(d.seizoen)).attr("y2", d => y(d.club) + y.bandwidth())
        .datum(d => d); // Zorg dat de data (incl. tenureId) gekoppeld is
        
    svg.selectAll(".prize-group").data(data.filter(d => d.landstitel === 'Y' || d.nationale_beker === 'Y' || d.europese_prijs === 'Y')).enter().append("g")
        .attr("class", "prize-group")
        .attr("transform", d => `translate(${x(d.seizoen) + x.bandwidth() / 2}, ${y(d.club) + y.bandwidth() / 2})`)
        .datum(d => d) // Zorg dat de data (incl. tenureId) gekoppeld is
        .each(function(d) {
              const el = d3.select(this);
              const prijzen = [];
              if (d.europese_prijs === 'Y') prijzen.push({color: '#FFD700'});
              if (d.landstitel === 'Y') prijzen.push({color: '#C0C0C0'});
              if (d.nationale_beker === 'Y') prijzen.push({color: '#CD7F32'});
              const totalHeight = (prijzen.length - 1) * 12;
              prijzen.forEach((p, i) => {
                   el.append("path").attr("d", icons.schild).attr("fill", p.color).attr("stroke", "#222").attr("stroke-width", 0.5).attr("transform", `translate(-8, ${-totalHeight/2 + i*12 - 8}) scale(0.8)`);
              });
        });

    setInfoPaneDefault();
}

// --- INFO PANEEL & HIGHLIGHTING HELPERS ---
function setInfoPaneDefault() {
    infoPane.attr("class", "default-state")
        .html(`<p>Hover over a tenure or select a club to see details.</p>`);
}

function updateInfoPane(d) {
    const hasPhoto = d.Coach_Foto_URL && d.Coach_Foto_URL.trim() !== '';
    const flagApiUrl = d.Coach_Nat_Code ? `https://flagcdn.com/w40/${d.Coach_Nat_Code.toLowerCase()}.png` : '';
    const avatarIconPath = "M25 26.5 C20 26.5 15 29 15 34 V37 H35 V34 C35 29 30 26.5 25 26.5 Z M25 15 C21.1 15 18 18.1 18 22 C18 25.9 21.1 29 25 29 C28.9 29 32 25.9 32 22 C32 18.1 28.9 15 25 15 Z";

    let imageHtml = hasPhoto
        ? `<img src="${d.Coach_Foto_URL}" class="info-pane-img" onerror="this.onerror=null; this.outerHTML='<svg class=\\'info-pane-img\\' viewBox=\\'0 0 50 50\\'><path d=\\'${avatarIconPath}\\' fill=\\'#ccc\\'></path></svg>';">`
        : `<svg class="info-pane-img" viewBox="0 0 50 50"><path d="${avatarIconPath}" fill="#ccc"></path></svg>`;

    // FIX: de tenureEndYear wordt nu correct berekend in prepareData
    const tenureYears = d.tenureStartYear === d.tenureEndYear ? d.tenureStartYear : `${d.tenureStartYear} – ${d.tenureEndYear}`;

    const content = `
        ${imageHtml}
        <div class="info-pane-details">
            <p class="name">${d.Coach}</p>
            <div class="nationality">
                ${flagApiUrl ? `<img src="${flagApiUrl}" class="info-pane-flag">` : ''}
                <span>${d.Nationaliteit_Coach}</span>
            </div>
        </div>
        <div class="info-pane-extra">
            <p class="club">${d.club}</p>
            <p class="tenure">${tenureYears} (${d.stintLength} ${d.stintLength > 1 ? 'seasons' : 'season'})</p>
        </div>
    `;
    infoPane.attr("class", "details-state").html(content);
}

function highlightTenure(tenureId) {
    d3.selectAll(".bar, .coach-divider, .prize-group").classed("is-dimmed", true);
    d3.selectAll(".bar")
        .filter(d => d && d.tenureId === tenureId)
        .classed("is-dimmed", false)
        .classed("is-highlighted", true);
    
    // Zorg ervoor dat dividers en prijzen ook correct meekleuren
    d3.selectAll(".coach-divider, .prize-group")
        .filter(d => d && d.tenureId === tenureId)
        .classed("is-dimmed", false)
        .raise();
}

function clearHighlight() {
    d3.selectAll(".bar, .coach-divider, .prize-group")
        .classed("is-dimmed", false)
        .classed("is-highlighted", false);
}


function drawLegend() {
    d3.select("#legend-container").html("");
    // FIX: Legenda data aangepast aan nieuwe kleurlogica
    const legendData = [
        { color: "#ff3333", label: "1 Season" },
        { color: "#99ff99", label: "2 Seasons" },
        { color: "#66cc66", label: "3-5 Seasons" },
        { color: "#339933", label: "6-10 Seasons" },
        { color: "#006600", label: "11+ Seasons" }
    ];
    const prizeData = [
        { color: '#FFD700', label: 'European Trophy' },
        { color: '#C0C0C0', label: 'National Title' },
        { color: '#CD7F32', label: 'National Cup' }
    ];

    const svgNode = d3.select("#legend-container").append("svg").attr("width", "100%").attr("height", 50);
    const legendGroup = svgNode.append("g");
    let currentOffset = 0;

    function drawItem(group, data, isIcon) {
        data.forEach(d => {
            const itemGroup = group.append("g").attr("transform", `translate(${currentOffset}, 0)`);
            if (isIcon) {
                 itemGroup.append("path").attr("d", "M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z").attr("transform", "translate(4, 2) scale(1)").attr("fill", d.color).attr("stroke", "#222").attr("stroke-width", 0.5);
            } else {
                itemGroup.append("rect").attr("width", 20).attr("height", 20).attr("fill", d.color).attr("rx", 3);
            }
            itemGroup.append("text").attr("x", 25).attr("y", 15).text(d.label).style("font-size", "12px").attr("fill", "#333");
            const itemWidth = itemGroup.node().getBBox().width;
            currentOffset += itemWidth + 30;
        });
    }

    drawItem(legendGroup, legendData, false);
    currentOffset += 20;
    drawItem(legendGroup, prizeData, true);

    const containerWidth = d3.select("#legend-container").node().getBoundingClientRect().width;
    const legendWidth = legendGroup.node().getBBox().width;
    legendGroup.attr("transform", `translate(${(containerWidth - legendWidth) / 2}, 20)`);
}

// --- Start de applicatie ---
async function main() {
    const rawData = await loadDataFromFirestore();
    if (!rawData || rawData.length === 0) return;

    const data = prepareData(rawData);
    
    drawHeatmap(data);
    drawLegend();
    
    window.addEventListener('resize', () => {
        drawHeatmap(data);
        drawLegend();
    });
}

main();
