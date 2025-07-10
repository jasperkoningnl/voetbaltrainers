// Script Versie: 17.2 - Filterlogica voor coach en nationaliteit geïmplementeerd.
console.log("Script versie: 17.2 geladen.");

// --- 1. STATE MANAGEMENT ---
const appState = {
    currentView: 'country',
    activeCountry: 'England',
    comparisonClubs: [],
    allClubs: [],
    allCoaches: [],
    allSeasons: [],
    activeFilters: { coach: '', nationality: '' },
    selectedTenureId: null,
    isLoading: true,
};

// --- 2. DOM ELEMENT SELECTORS ---
const DOMElements = {
    infoPane: d3.select("#info-pane"),
    heatmapContainer: d3.select("#heatmap-container"),
    legendContainer: d3.select("#legend-container"),
    navLinks: document.querySelectorAll('.nav-link'),
    filterToggleButton: document.getElementById('filter-toggle-btn'),
    filterPanel: document.getElementById('filter-panel'),
    coachSearchInput: document.getElementById('coach-search-input'),
    nationalityFilterSelect: document.getElementById('nationality-filter-select'),
    filterResetBtn: document.getElementById('filter-reset-btn'),
};

let currentResizeObserver = null;

// --- 3. INITIALISATIE ---
document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
    console.log("Applicatie initialiseren...");
    setupEventListeners();
    await fetchAllInitialData();
    renderApp();
    console.log("Applicatie gereed.");
}

// --- 4. EVENT LISTENERS ---
function setupEventListeners() {
    DOMElements.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetView = e.target.dataset.country;
            handleNavigation(targetView);
        });
    });

    DOMElements.filterToggleButton.addEventListener('click', () => {
        DOMElements.filterPanel.classList.toggle('hidden');
    });

    DOMElements.coachSearchInput.addEventListener('input', applyFilters);
    DOMElements.nationalityFilterSelect.addEventListener('change', applyFilters);
    DOMElements.filterResetBtn.addEventListener('click', resetFilters);
}

function handleNavigation(target) {
    if (target === 'compare') {
        appState.currentView = 'compare';
    } else {
        appState.currentView = 'country';
        appState.activeCountry = target;
    }
    appState.selectedTenureId = null;
    resetFilters();
    renderApp();
}

// --- 5. DATA FETCHING ---
async function fetchAllInitialData() {
    if (!window.db || !window.firestore) {
        console.error("Firestore is niet geïnitialiseerd.");
        appState.isLoading = false;
        return;
    }
    appState.isLoading = true;
    try {
        const { collection, getDocs } = window.firestore;
        const [coachesSnapshot, clubsSnapshot, seizoenenSnapshot] = await Promise.all([
            getDocs(collection(window.db, "coaches")),
            getDocs(collection(window.db, "clubs")),
            getDocs(collection(window.db, "seizoenen"))
        ]);

        appState.allCoaches = coachesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        appState.allClubs = clubsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        appState.allSeasons = seizoenenSnapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.error("Fout bij het laden van initiële data:", error);
    } finally {
        appState.isLoading = false;
    }
}

// --- 6. DATA PROCESSING ---
function getPreparedDataForView() {
    let rawData;
    if (appState.currentView === 'country') {
        rawData = appState.allSeasons.filter(s => s.land === appState.activeCountry);
    } else {
        rawData = []; // Logica voor 'compare' komt hier
    }

    const joinedData = rawData.map(seizoen => {
        const coachInfo = appState.allCoaches.find(c => c.id === seizoen.coachId);
        const clubInfo = appState.allClubs.find(c => c.id === seizoen.club);
        if (!coachInfo || !clubInfo) return null;
        return {
            ...seizoen,
            club: clubInfo.naam,
            logo_url: clubInfo.logo_url,
            Coach: coachInfo.naam,
            nationaliteit: coachInfo.nationaliteit,
            nat_code: coachInfo.nat_code,
            foto_url: coachInfo.foto_url,
        };
    }).filter(Boolean);

    return processTenures(joinedData);
}

function processTenures(data) {
    if (!data || data.length === 0) return [];
    data.sort((a, b) => d3.ascending(a.club, b.club) || d3.ascending(a.seizoen, b.seizoen));
    
    const periodes = [];
    let huidigePeriode = null;
    
    data.forEach(d => {
        if (!huidigePeriode || d.Coach !== huidigePeriode.coach || d.club !== huidigePeriode.club) {
            const id = `${d.Coach.replace(/\s+/g, '-')}-${d.club.replace(/\s+/g, '-')}-${d.seizoen.substring(0, 4)}`;
            huidigePeriode = { coach: d.Coach, club: d.club, seizoenen: [], id: id };
            periodes.push(huidigePeriode);
        }
        huidigePeriode.seizoenen.push(d);
    });
    
    periodes.forEach(p => {
        const startJaar = p.seizoenen[0].seizoen.substring(0, 4);
        const laatsteSeizoen = p.seizoenen[p.seizoenen.length - 1].seizoen;
        const [startDeel, eindDeel] = laatsteSeizoen.split('/');
        let eindJaarNum;

        if (eindDeel.length === 4) eindJaarNum = parseInt(eindDeel);
        else {
            const eeuw = Math.floor(parseInt(startDeel) / 100) * 100;
            const startJaarKort = parseInt(startDeel.substring(2, 4));
            eindJaarNum = parseInt(eindDeel);
            if (eindJaarNum < startJaarKort) eindJaarNum = eeuw + 100 + eindJaarNum;
            else eindJaarNum = eeuw + eindJaarNum;
        }
        const eindJaar = eindJaarNum.toString();

        p.seizoenen.forEach(s => {
            s.stintLength = p.seizoenen.length;
            s.tenureId = p.id;
            s.tenureStartYear = startJaar;
            s.tenureEndYear = eindJaar;
        });
    });
    return data;
}

// --- 7. RENDERING & UI LOGIC ---
function renderApp() {
    console.log(`Rendering view: ${appState.currentView}`);
    if (currentResizeObserver) currentResizeObserver.disconnect();
    DOMElements.heatmapContainer.html('');
    
    updateActiveNav();
    setInfoPaneDefault();
    
    if (appState.isLoading) {
        DOMElements.heatmapContainer.html('<p class="loading-text">Loading data...</p>');
        return;
    }

    if (appState.currentView === 'country') {
        const dataForCountry = getPreparedDataForView();
        populateFilterOptions(dataForCountry);
        if (dataForCountry.length > 0) {
            const updateFunc = drawVisualization(dataForCountry);
            currentResizeObserver = new ResizeObserver(entries => {
                if (entries[0].contentRect.width > 0) updateFunc();
            });
            currentResizeObserver.observe(DOMElements.heatmapContainer.node());
        } else {
            DOMElements.heatmapContainer.html(`<p class="error">No data found for ${appState.activeCountry}.</p>`);
        }
    } else if (appState.currentView === 'compare') {
        renderCompareView();
    }
}

function renderCompareView() {
    DOMElements.heatmapContainer.html('<p>Vergelijkingsmodus is nog in aanbouw.</p>');
}

function updateActiveNav() {
    DOMElements.navLinks.forEach(link => {
        const linkTarget = link.dataset.country;
        const isActive = (appState.currentView === 'country' && linkTarget === appState.activeCountry) ||
                         (appState.currentView === 'compare' && linkTarget === 'compare');
        link.classList.toggle('active', isActive);
    });
}

function applyFilters() {
    appState.activeFilters.coach = DOMElements.coachSearchInput.value.toLowerCase();
    appState.activeFilters.nationality = DOMElements.nationalityFilterSelect.value;
    console.log('Filters applied:', appState.activeFilters);
    updateVisualsWithFilters();
}

function resetFilters() {
    appState.activeFilters.coach = '';
    appState.activeFilters.nationality = '';
    DOMElements.coachSearchInput.value = '';
    DOMElements.nationalityFilterSelect.value = '';
    console.log('Filters reset');
    updateVisualsWithFilters();
}

function populateFilterOptions(data) {
    const nationalities = [...new Set(data.map(d => d.nationaliteit))].sort();
    
    // Bewaar de huidige selectie
    const currentSelection = DOMElements.nationalityFilterSelect.value;
    
    // Leeg de dropdown, behalve de eerste "All" optie
    DOMElements.nationalityFilterSelect.innerHTML = '<option value="">All Nationalities</option>';
    
    nationalities.forEach(nat => {
        const option = document.createElement('option');
        option.value = nat;
        option.textContent = nat;
        DOMElements.nationalityFilterSelect.appendChild(option);
    });

    // Herstel de selectie als die nog geldig is
    DOMElements.nationalityFilterSelect.value = currentSelection;
}

function updateVisualsWithFilters() {
    const g = d3.select("#heatmap-container svg > g");
    if (g.empty()) return;

    g.selectAll(".bar, .coach-divider, .season-divider, .prize-group")
        .classed("is-dimmed", d => {
            const coachFilter = appState.activeFilters.coach;
            const natFilter = appState.activeFilters.nationality;

            const coachMatch = coachFilter ? d.Coach.toLowerCase().includes(coachFilter) : true;
            const natMatch = natFilter ? d.nationaliteit === natFilter : true;
            
            return !(coachMatch && natMatch);
        });
}


// --- 8. D3 VISUALISATIE ---
const margin = {top: 10, right: 20, bottom: 80, left: 220};
const x = d3.scaleBand().padding(0);
const y = d3.scaleBand().padding(0.15);

function drawVisualization(data) {
    DOMElements.heatmapContainer.html('');
    const clubs = [...new Set(data.map(d => d.club))].sort(d3.ascending);
    const seasons = [...new Set(data.map(d => d.seizoen))].sort(d3.ascending);
    const height = clubs.length * 55;

    const svg = DOMElements.heatmapContainer.append("svg")
        .attr("width", '100%')
        .attr("height", height + margin.top + margin.bottom);

    const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);
    
    svg.on('click', () => {
        if (appState.selectedTenureId) {
            appState.selectedTenureId = null;
            updateHighlighting(g);
            setInfoPaneDefault();
        }
    });
    
    g.on("mouseleave", () => {
        if (!appState.selectedTenureId) {
            g.selectAll(".bar, .coach-divider, .season-divider, .prize-group").classed("is-dimmed", false);
            setInfoPaneDefault();
        }
    });
    
    y.domain(clubs).range([0, height]);
    const getColor = d3.scaleThreshold()
        .domain([1, 2, 3, 5, 7, 10])
        .range(["#ccc", "#ff0033", "#ccffcc", "#99ff99", "#66cc66", "#00ff00", "#006600"]);

    const xAxisG = g.append("g").attr("class", "axis x-axis").attr("transform", `translate(0, ${height})`);
    const yAxisG = g.append("g").attr("class", "axis y-axis");

    const logoData = clubs.map(club => ({ club: club, logo_url: (data.find(d => d.club === club) || {}).logo_url || '' }));
    
    const yAxisLabels = yAxisG.selectAll(".club-label").data(logoData, d => d.club).join("g")
        .attr("class", "club-label").attr("transform", d => `translate(0, ${y(d.club)})`);

    yAxisLabels.append("rect").attr("x", -margin.left + 20).attr("y", 0).attr("width", 190).attr("height", y.bandwidth()).attr("fill", "#f8f9fa").attr("rx", 6);
    yAxisLabels.append("image").attr("xlink:href", d => d.logo_url).attr("x", -margin.left + 30).attr("y", y.bandwidth() / 2 - 16).attr("width", 32).attr("height", 32).on("error", function() { d3.select(this).style("display", "none"); });
    yAxisLabels.append("text").attr("x", -margin.left + 75).attr("y", y.bandwidth() / 2).attr("dy", ".35em").style("text-anchor", "start").text(d => d.club);
    
    const barGroup = g.append("g").attr("class", "bars-group");
    const seasonDividerGroup = g.append("g").attr("class", "season-dividers-group");
    const coachDividerGroup = g.append("g").attr("class", "coach-dividers-group");
    const prizeGroup = g.append("g").attr("class", "prizes-group");
    
    function updateXAxis() {
        const containerNode = DOMElements.heatmapContainer.node();
        if (!containerNode) return;
        const width = containerNode.clientWidth - margin.left - margin.right;
        if (width <= 0) return;

        x.domain(seasons).range([0, width]);
        svg.attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);
        const tickValues = seasons.filter((d, i) => i % 5 === 0 || i === seasons.length - 1);
        xAxisG.call(d3.axisBottom(x).tickValues(tickValues).tickSizeOuter(0)).selectAll("text").style("text-anchor", "end").attr("dx", "-.8em").attr("dy", ".15em").attr("transform", "rotate(-65)");

        barGroup.selectAll(".bar").attr("x", d => x(d.seizoen)).attr("width", x.bandwidth()).attr("rx", 2);
        seasonDividerGroup.selectAll(".season-divider").attr("x1", d => x(d.seizoen)).attr("x2", d => x(d.seizoen));
        coachDividerGroup.selectAll(".coach-divider").attr("x1", d => x(d.seizoen)).attr("x2", d => x(d.seizoen));
        prizeGroup.selectAll(".prize-group").attr("transform", d => `translate(${x(d.seizoen) + x.bandwidth() / 2}, ${y(d.club) + y.bandwidth() / 2})`);
    }

    barGroup.selectAll(".bar").data(data).enter().append("rect").attr("class", "bar").attr("y", d => y(d.club)).attr("height", y.bandwidth()).style("fill", d => getColor(d.stintLength)).on("click", handleMouseClick).on("mouseover", handleMouseOver);
    seasonDividerGroup.selectAll(".season-divider").data(data.filter(d => d.seizoen.substring(0, 4) !== d.tenureStartYear)).enter().append("line").attr("class", "season-divider").attr("y1", d => y(d.club)).attr("y2", d => y(d.club) + y.bandwidth());
    coachDividerGroup.selectAll(".coach-divider").data(data.filter(d => {
        const prevSeason = seasons[seasons.indexOf(d.seizoen) - 1];
        if (!prevSeason) return false;
        const prevData = data.find(item => item.club === d.club && item.seizoen === prevSeason);
        return !prevData || prevData.tenureId !== d.tenureId;
    })).enter().append("line").attr("class", "coach-divider").attr("y1", d => y(d.club)).attr("y2", d => y(d.club) + y.bandwidth());

    const prizeData = data.filter(d => d.landstitel === 'Y' || d.nationale_beker === 'Y' || d.europese_prijs === 'Y');
    prizeGroup.selectAll(".prize-group").data(prizeData).enter().append("g").attr("class", "prize-group").each(function(d) {
        const currentGroup = d3.select(this);
        const icons = { schild: "M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z" };
        const prijzen = [];
        if (d.europese_prijs === 'Y') prijzen.push('#FFD700');
        if (d.landstitel === 'Y') prijzen.push('#C0C0C0');
        if (d.nationale_beker === 'Y') prijzen.push('#CD7F32');
        const totalHeight = (prijzen.length - 1) * 12;
        prijzen.forEach((p, i) => {
            currentGroup.append("path").attr("d", icons.schild).attr("fill", p).attr("stroke", "#222").attr("stroke-width", 0.5).attr("transform", `translate(-8, ${-totalHeight/2 + i*12 - 8}) scale(0.8)`);
        });
    });

    updateXAxis();
    drawLegend();
    updateHighlighting(g);
    updateVisualsWithFilters(); // Zorg dat filters worden toegepast bij het tekenen
    
    return updateXAxis;
}

function handleMouseClick(event, d) {
    event.stopPropagation();
    appState.selectedTenureId = (appState.selectedTenureId === d.tenureId) ? null : d.tenureId;
    updateHighlighting(d3.select(this.closest("g")));
    if (appState.selectedTenureId) updateInfoPane(d);
    else setInfoPaneDefault();
}

function handleMouseOver(event, d) {
    if (!appState.selectedTenureId) {
        const g = d3.select(this.closest("g"));
        g.selectAll(".bar, .coach-divider, .season-divider, .prize-group").classed("is-dimmed", item => item.tenureId !== d.tenureId);
        updateInfoPane(d);
    }
}

function updateHighlighting(container) {
    container.selectAll(".bar, .coach-divider, .season-divider, .prize-group")
        .classed("is-dimmed", d => appState.selectedTenureId && d.tenureId !== appState.selectedTenureId)
        .classed("is-highlighted", d => appState.selectedTenureId && d.tenureId === appState.selectedTenureId);
}

function setInfoPaneDefault() { DOMElements.infoPane.attr("class", "default-state").html('<p>Hover over a tenure for details, or click to lock the selection.</p>'); }

function updateInfoPane(d) {
    const hasPhoto = d.foto_url && d.foto_url.trim() !== '';
    const flagApiUrl = d.nat_code ? `https://flagcdn.com/w40/${d.nat_code.toLowerCase()}.png` : '';
    const avatarIconPath = "M25 26.5 C20 26.5 15 29 15 34 V37 H35 V34 C35 29 30 26.5 25 26.5 Z M25 15 C21.1 15 18 18.1 18 22 C18 25.9 21.1 29 25 29 C28.9 29 32 25.9 32 22 C32 18.1 28.9 15 25 15 Z";
    let imageHtml = hasPhoto ? `<img src="${d.foto_url}" class="info-pane-img" onerror="this.onerror=null; this.outerHTML='<svg class=\\'info-pane-img\\' viewBox=\\'0 0 50 50\\'><path d=\\'${avatarIconPath}\\' fill=\\'#ccc\\'></path></svg>';">` : `<svg class="info-pane-img" viewBox="0 0 50 50"><path d="${avatarIconPath}" fill="#ccc"></path></svg>`;
    const tenureYears = d.tenureStartYear === d.tenureEndYear ? d.tenureStartYear : `${d.tenureStartYear} – ${d.tenureEndYear}`;
    
    const content = `
        <div class="info-pane-main">
            ${imageHtml}
            <div class="info-pane-details">
                <p class="name">${d.Coach}</p>
                <div class="nationality">
                    ${flagApiUrl ? `<img src="${flagApiUrl}" class="info-pane-flag">` : ''}
                    <span>${d.nationaliteit}</span>
                </div>
            </div>
        </div>
        <div class="info-pane-extra">
            <p class="club">${d.club}</p>
            <p class="tenure">${tenureYears} (${d.stintLength} ${d.stintLength > 1 ? 'seasons' : 'season'})</p>
        </div>`;
    DOMElements.infoPane.attr("class", "details-state").html(content);
}

function drawLegend() {
    DOMElements.legendContainer.html("");
    const legendData = [ { color: "#ff0033", label: "1 Season" }, { color: "#ccffcc", label: "2 Seasons" }, { color: "#99ff99", label: "3-4 Seasons" }, { color: "#66cc66", label: "5-6 Seasons" }, { color: "#00ff00", label: "7-9 Seasons" }, { color: "#006600", label: "10+ Seasons" } ];
    const prizeData = [ { color: '#FFD700', label: 'European Trophy' }, { color: '#C0C0C0', label: 'National Title' }, { color: '#CD7F32', label: 'National Cup' } ];
    
    const tenureGroup = DOMElements.legendContainer.append("div").attr("class", "legend-section");
    const prizeGroup = DOMElements.legendContainer.append("div").attr("class", "legend-section");

    tenureGroup.selectAll(".legend-item").data(legendData).join("div").attr("class", "legend-item").html(d => `<div class="legend-swatch" style="background-color:${d.color};"></div><span>${d.label}</span>`);
    prizeGroup.selectAll(".legend-item").data(prizeData).join("div").attr("class", "legend-item").html(d => `<svg class="legend-swatch" viewBox="0 0 18 17"><path d="M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z" fill="${d.color}" stroke="#444" stroke-width="0.5"></path></svg><span>${d.label}</span>`);
}
