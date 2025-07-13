// Script Versie: 19.0 - Advanced tab met Career Mode geïmplementeerd.
console.log("Script versie: 19.0 geladen.");

// --- 1. STATE MANAGEMENT ---
const appState = {
    currentView: 'country', // 'country', 'advanced'
    advancedViewMode: 'chooseClubs', // 'chooseClubs', 'careerMode'
    activeCountry: 'England',
    careerCoachName: null,
    comparisonClubs: [],
    allClubs: [],
    allCoaches: [],
    allSeasons: [],
    activeFilters: { coach: '', nationality: '' },
    selectedTenureId: null,
    hoveredTenureId: null,
    isLoading: true,
};

// --- 2. DOM ELEMENT SELECTORS ---
const DOMElements = {
    infoPane: d3.select("#info-pane"),
    heatmapContainer: d3.select("#heatmap-container"),
    legendContainer: d3.select("#legend-container"),
    countryNavContainer: document.getElementById('country-nav-container'),
    navLinks: document.querySelectorAll('.nav-link'),
    filterControlsContainer: document.getElementById('filter-controls-container'),
    filterToggleButton: document.getElementById('filter-toggle-btn'),
    filterPanel: document.getElementById('filter-panel'),
    coachSearchInput: document.getElementById('coach-search-input'),
    nationalityFilterSelect: document.getElementById('nationality-filter-select'),
    filterResetBtn: document.getElementById('filter-reset-btn'),
    compareControlsContainer: document.getElementById('compare-controls-container'),
    clearCompareBtn: document.getElementById('clear-compare-btn'),
    clubModal: document.getElementById('club-modal'),
    modalCloseBtn: document.querySelector('.modal-close-btn'),
    clubListContainer: document.getElementById('club-list-container'),
    clubSearchInputModal: document.getElementById('club-search-input-modal'),
    advancedNavContainer: document.getElementById('advanced-nav-container'),
    advancedNavBtns: document.querySelectorAll('.advanced-nav-btn'),
    careerModeControls: document.getElementById('career-mode-controls'),
    careerCoachSearchInput: document.getElementById('career-coach-search-input'),
    coachDatalist: document.getElementById('coach-datalist'),
};

let currentResizeObserver = null;
const ADD_CLUB_PLACEHOLDER = 'ADD_CLUB_PLACEHOLDER';


// --- 3. INITIALISATIE ---
document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
    console.log("Applicatie initialiseren...");
    setupEventListeners();
    await fetchAllInitialData();
    populateCoachDatalist();
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

    DOMElements.advancedNavBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const newMode = e.target.dataset.mode;
            if (newMode !== appState.advancedViewMode) {
                appState.advancedViewMode = newMode;
                renderApp();
            }
        });
    });

    DOMElements.filterToggleButton.addEventListener('click', () => {
        DOMElements.filterPanel.classList.toggle('hidden');
        DOMElements.filterToggleButton.classList.toggle('open');
    });

    DOMElements.coachSearchInput.addEventListener('input', applyFilters);
    DOMElements.nationalityFilterSelect.addEventListener('change', applyFilters);
    DOMElements.filterResetBtn.addEventListener('click', () => resetAll(true));
    
    DOMElements.clearCompareBtn.addEventListener('click', clearComparison);
    DOMElements.modalCloseBtn.addEventListener('click', closeClubModal);
    DOMElements.clubSearchInputModal.addEventListener('input', filterClubList);
    window.addEventListener('click', (event) => {
        if (event.target === DOMElements.clubModal) {
            closeClubModal();
        }
    });
    DOMElements.careerCoachSearchInput.addEventListener('input', handleCareerCoachSearch);
}

function handleNavigation(target) {
    if (appState.currentView === 'country' && target === appState.activeCountry) return;
    if (appState.currentView === 'advanced' && target === 'advanced') return;

    if (target === 'advanced') {
        appState.currentView = 'advanced';
    } else {
        appState.currentView = 'country';
        appState.activeCountry = target;
    }
    resetAll(false);
    renderApp();
}

function handleCareerCoachSearch(event) {
    const coachName = event.target.value;
    const isValidCoach = appState.allCoaches.some(c => c.naam === coachName);

    if (isValidCoach) {
        appState.careerCoachName = coachName;
        renderApp();
    } else if (!coachName && appState.careerCoachName) {
        appState.careerCoachName = null;
        renderApp();
    }
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
    } else if (appState.currentView === 'advanced') {
        if (appState.advancedViewMode === 'chooseClubs') {
            const clubIds = appState.comparisonClubs.map(c => c.id);
            rawData = appState.allSeasons.filter(s => clubIds.includes(s.club));
        } else { // careerMode
            if (appState.careerCoachName) {
                const coach = appState.allCoaches.find(c => c.naam === appState.careerCoachName);
                if (coach) {
                    // 1. Find all seasons for the coach
                    const coachSeasons = appState.allSeasons.filter(s => s.coachId === coach.id);
                    // 2. Find all unique clubs from those seasons
                    const clubIds = [...new Set(coachSeasons.map(s => s.club))];
                    // 3. Get all seasons for those clubs
                    rawData = appState.allSeasons.filter(s => clubIds.includes(s.club));
                } else {
                    rawData = [];
                }
            } else {
                 rawData = [];
            }
        }
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

        const tenureTrophies = { european: 0, title: 0, cup: 0 };
        const countedPrizes = new Set();
        p.seizoenen.forEach(s => {
            const seasonKey = `${s.club}-${s.seizoen}`;
            if (s.europese_prijs === 'Y' && !countedPrizes.has(`${seasonKey}-eu`)) {
                tenureTrophies.european++;
                countedPrizes.add(`${seasonKey}-eu`);
            }
            if (s.landstitel === 'Y' && !countedPrizes.has(`${seasonKey}-ti`)) {
                tenureTrophies.title++;
                countedPrizes.add(`${seasonKey}-ti`);
            }
            if (s.nationale_beker === 'Y' && !countedPrizes.has(`${seasonKey}-cu`)) {
                tenureTrophies.cup++;
                countedPrizes.add(`${seasonKey}-cu`);
            }
        });

        p.seizoenen.forEach(s => {
            s.stintLength = p.seizoenen.length;
            s.tenureId = p.id;
            s.tenureStartYear = startJaar;
            s.tenureEndYear = eindJaar;
            s.tenureTrophies = tenureTrophies;
        });
    });
    return data;
}

// --- 7. RENDERING & UI LOGIC ---
function renderApp() {
    console.log(`Rendering view: ${appState.currentView} / ${appState.advancedViewMode}`);
    if (currentResizeObserver) currentResizeObserver.disconnect();
    DOMElements.heatmapContainer.html('');
    
    updateActiveNav();
    updateControlVisibility();
    setInfoPaneDefault();
    
    if (appState.isLoading) {
        DOMElements.heatmapContainer.html('<p class="loading-text">Loading data...</p>');
        return;
    }

    if (appState.currentView === 'advanced' && appState.advancedViewMode === 'careerMode' && appState.careerCoachName) {
        showCareerInfoPane();
    }

    const dataForView = getPreparedDataForView();

    if (appState.currentView === 'country') {
        populateFilterOptions(dataForView);
    }

    if (dataForView.length > 0 || appState.currentView === 'advanced') {
        const updateFunc = drawVisualization(dataForView);
        currentResizeObserver = new ResizeObserver(entries => {
            if (entries[0].contentRect.width > 0) updateFunc();
        });
        currentResizeObserver.observe(DOMElements.heatmapContainer.node());
    } else {
        let message = `No data found for ${appState.activeCountry}.`;
        if (appState.currentView === 'advanced') {
            if (appState.advancedViewMode === 'chooseClubs') {
                message = 'Select clubs with the "[+] Add" button to start comparing.';
            } else {
                message = 'Search for a coach to see their career timeline.';
            }
        }
        DOMElements.heatmapContainer.html(`<p class="loading-text">${message}</p>`);
    }
}

function updateControlVisibility() {
    const isAdvancedView = appState.currentView === 'advanced';
    DOMElements.advancedNavContainer.classList.toggle('hidden', !isAdvancedView);
    DOMElements.filterControlsContainer.classList.toggle('hidden', isAdvancedView);

    if (isAdvancedView) {
        const isCareerMode = appState.advancedViewMode === 'careerMode';
        DOMElements.careerModeControls.classList.toggle('hidden', !isCareerMode);
        DOMElements.compareControlsContainer.classList.toggle('hidden', isCareerMode || appState.comparisonClubs.length === 0);
        
        DOMElements.advancedNavBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === appState.advancedViewMode);
        });
    } else {
        DOMElements.careerModeControls.classList.add('hidden');
        DOMElements.compareControlsContainer.classList.add('hidden');
    }
}

function updateActiveNav() {
    DOMElements.navLinks.forEach(link => {
        const linkTarget = link.dataset.country;
        const isActive = (appState.currentView === 'country' && linkTarget === appState.activeCountry) ||
                         (appState.currentView === 'advanced' && linkTarget === 'advanced');
        link.classList.toggle('active', isActive);
    });
}

function applyFilters() {
    appState.activeFilters.coach = DOMElements.coachSearchInput.value.toLowerCase();
    appState.activeFilters.nationality = DOMElements.nationalityFilterSelect.value;
    updateVisuals();
}

function resetAll(reRender = true) {
    appState.activeFilters = { coach: '', nationality: '' };
    appState.selectedTenureId = null;
    appState.comparisonClubs = [];
    appState.careerCoachName = null;
    appState.currentView = 'country';
    appState.advancedViewMode = 'chooseClubs';

    DOMElements.coachSearchInput.value = '';
    DOMElements.nationalityFilterSelect.value = '';
    DOMElements.careerCoachSearchInput.value = '';

    if (reRender) {
        renderApp();
    }
}

function populateFilterOptions(data) {
    const nationalities = [...new Set(data.map(d => d.nationaliteit))].sort();
    const currentSelection = DOMElements.nationalityFilterSelect.value;
    DOMElements.nationalityFilterSelect.innerHTML = '<option value="">All Nationalities</option>';
    nationalities.forEach(nat => {
        const option = document.createElement('option');
        option.value = nat;
        option.textContent = nat;
        DOMElements.nationalityFilterSelect.appendChild(option);
    });
    DOMElements.nationalityFilterSelect.value = currentSelection;
}

function populateCoachDatalist() {
    DOMElements.coachDatalist.innerHTML = '';
    const uniqueCoaches = [...new Set(appState.allCoaches.map(c => c.naam))].sort();
    uniqueCoaches.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        DOMElements.coachDatalist.appendChild(option);
    });
}

function updateVisuals() {
    const g = d3.select("#heatmap-container svg > g");
    if (g.empty()) return;

    const { coach, nationality } = appState.activeFilters;
    const hasActiveFilter = (coach || nationality) && appState.currentView === 'country';
    const isCareerMode = appState.currentView === 'advanced' && appState.advancedViewMode === 'careerMode';

    g.selectAll(".bar, .coach-divider, .season-divider, .prize-group")
        .classed("is-highlighted", d => d.tenureId === appState.selectedTenureId)
        .classed("is-dimmed", d => {
            if (isCareerMode) {
                return d.Coach !== appState.careerCoachName;
            }
            if (appState.selectedTenureId) return d.tenureId !== appState.selectedTenureId;
            if (hasActiveFilter) {
                const coachMatch = coach ? d.Coach.toLowerCase().includes(coach) : true;
                const natMatch = nationality ? d.nationaliteit === nationality : true;
                return !(coachMatch && natMatch);
            }
            if (appState.hoveredTenureId) return d.tenureId !== appState.hoveredTenureId;
            return false;
        })
        .classed("is-inactive", isCareerMode && (d => d.Coach !== appState.careerCoachName));
}

// --- 8. D3 VISUALISATIE ---
const margin = {top: 10, right: 20, bottom: 80, left: 220};
const x = d3.scaleBand().padding(0);
const y = d3.scaleBand().padding(0.15);

function drawVisualization(data) {
    DOMElements.heatmapContainer.html('');
    
    const isCompare = appState.currentView === 'advanced' && appState.advancedViewMode === 'chooseClubs';
    const isCareer = appState.currentView === 'advanced' && appState.advancedViewMode === 'careerMode';

    let yDomain;
    if (isCompare) {
        yDomain = appState.comparisonClubs.map(c => c.naam);
        yDomain.push(ADD_CLUB_PLACEHOLDER);
    } else {
        yDomain = [...new Set(data.map(d => d.club))].sort(d3.ascending);
    }

    const seasons = [...new Set(appState.allSeasons.map(d => d.seizoen))].sort(d3.ascending);
    const height = yDomain.length * 55;
    
    const width = DOMElements.heatmapContainer.node().clientWidth - margin.left - margin.right;

    const svg = DOMElements.heatmapContainer.append("svg")
        .attr("width", '100%')
        .attr("height", height + margin.top + margin.bottom);

    svg.on('mouseleave', () => {
        if (isCareer) return;
        appState.hoveredTenureId = null;
        updateVisuals();
        if (!appState.selectedTenureId) setInfoPaneDefault();
    });

    const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);
    
    g.append('rect')
        .attr('class', 'event-catcher')
        .attr('width', width > 0 ? width : 0)
        .attr('height', height);

    svg.on('click', (event) => {
        if (isCareer) return;
        if (event.target === svg.node() || event.target.classList.contains('event-catcher')) {
            if (appState.selectedTenureId) {
                appState.selectedTenureId = null;
                updateVisuals();
                setInfoPaneDefault();
            }
        }
    });
    
    y.domain(yDomain).range([0, height]);
    const getColor = d3.scaleThreshold()
        .domain([1, 2, 3, 5, 7, 10])
        .range(["#ccc", "#FF0033", "#66ff66", "#33cc33", "#339933", "#006600", "#003300"]);

    const xAxisG = g.append("g").attr("class", "axis x-axis").attr("transform", `translate(0, ${height})`);
    const yAxisG = g.append("g").attr("class", "axis y-axis");

    const yAxisData = yDomain.map(name => {
        if (name === ADD_CLUB_PLACEHOLDER) {
            return { id: ADD_CLUB_PLACEHOLDER, club: name };
        }
        const clubDetails = appState.allClubs.find(c => c.naam === name);
        return { id: clubDetails.id, club: name, logo_url: clubDetails ? clubDetails.logo_url : '' };
    });
    
    const yAxisLabels = yAxisG.selectAll(".y-axis-label-group").data(yAxisData, d => d.id).join("g")
        .attr("class", "y-axis-label-group").attr("transform", d => `translate(0, ${y(d.club)})`);

    yAxisLabels.filter(d => d.id !== ADD_CLUB_PLACEHOLDER)
        .append('g').attr('class', 'club-label')
        .each(function(d) {
            const group = d3.select(this);
            group.append("rect").attr("x", -margin.left + 20).attr("y", 0).attr("width", 190).attr("height", y.bandwidth()).attr("fill", "#fff").attr("rx", 6);
            group.append("image").attr("xlink:href", d.logo_url).attr("x", -margin.left + 30).attr("y", y.bandwidth() / 2 - 16).attr("width", 32).attr("height", 32).on("error", function() { d3.select(this).style("display", "none"); });
            group.append("text").attr("x", -margin.left + 75).attr("y", y.bandwidth() / 2).attr("dy", ".35em").style("text-anchor", "start").text(d.club);
            
            if (isCompare) {
                const removeBtn = group.append('g').attr('class', 'remove-club-btn').on('click', () => removeClubFromComparison(d.id));
                removeBtn.append('circle').attr('class', 'remove-club-btn-bg').attr('cx', -margin.left + 200).attr('cy', y.bandwidth() / 2).attr('r', 10);
                removeBtn.append('line').attr('class', 'remove-club-btn-cross').attr('x1', -margin.left + 195).attr('y1', y.bandwidth() / 2 - 5).attr('x2', -margin.left + 205).attr('y2', y.bandwidth() / 2 + 5);
                removeBtn.append('line').attr('class', 'remove-club-btn-cross').attr('x1', -margin.left + 195).attr('y1', y.bandwidth() / 2 + 5).attr('x2', -margin.left + 205).attr('y2', y.bandwidth() / 2 - 5);
            }
        });

    yAxisLabels.filter(d => d.id === ADD_CLUB_PLACEHOLDER)
        .append('g').attr('class', 'add-club-placeholder').on('click', openClubModal)
        .each(function() {
            const group = d3.select(this);
            group.append("rect").attr("x", -margin.left + 20).attr("y", 0).attr("width", 190).attr("height", y.bandwidth()).attr("rx", 6);
            group.append("text").attr("x", -margin.left + 115).attr("y", y.bandwidth() / 2).attr("dy", ".35em").style("text-anchor", "middle").text("+ Add Club");
        });

    const barGroup = g.append("g").attr("class", "bars-group");
    const seasonDividerGroup = g.append("g").attr("class", "season-dividers-group");
    const coachDividerGroup = g.append("g").attr("class", "coach-dividers-group");
    const prizeGroup = g.append("g").attr("class", "prizes-group");
    
    function updateXAxis() {
        const currentWidth = DOMElements.heatmapContainer.node().clientWidth - margin.left - margin.right;
        if (currentWidth <= 0) return;

        g.select('.event-catcher').attr('width', currentWidth);
        x.domain(seasons).range([0, currentWidth]);
        svg.attr("viewBox", `0 0 ${currentWidth + margin.left + margin.right} ${height + margin.top + margin.bottom}`);
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
    updateVisuals();
    
    return updateXAxis;
}

function handleMouseClick(event, d) {
    if (appState.currentView === 'advanced' && appState.advancedViewMode === 'careerMode') return;
    event.stopPropagation();
    appState.selectedTenureId = (appState.selectedTenureId === d.tenureId) ? null : d.tenureId;
    updateVisuals();
    if (appState.selectedTenureId) updateInfoPane(d);
    else setInfoPaneDefault();
}

function handleMouseOver(event, d) {
    if (appState.currentView === 'advanced' && appState.advancedViewMode === 'careerMode') return;
    appState.hoveredTenureId = d.tenureId;
    updateVisuals();
    if (!appState.selectedTenureId) {
        updateInfoPane(d);
    }
}

function setInfoPaneDefault() { DOMElements.infoPane.attr("class", "default-state").html('<p>Hover over a tenure for details, or click to lock the selection.</p>'); }

function updateInfoPane(d) {
    const hasPhoto = d.foto_url && d.foto_url.trim() !== '';
    const flagApiUrl = d.nat_code ? `https://flagcdn.com/w40/${d.nat_code.toLowerCase()}.png` : '';
    const avatarIconPath = "M25 26.5 C20 26.5 15 29 15 34 V37 H35 V34 C35 29 30 26.5 25 26.5 Z M25 15 C21.1 15 18 18.1 18 22 C18 25.9 21.1 29 25 29 C28.9 29 32 25.9 32 22 C32 18.1 28.9 15 25 15 Z";
    let imageHtml = hasPhoto ? `<img src="${d.foto_url}" class="info-pane-img" onerror="this.onerror=null; this.outerHTML='<svg class=\\'info-pane-img\\' viewBox=\\'0 0 50 50\\'><path d=\\'${avatarIconPath}\\' fill=\\'#ccc\\'></path></svg>';">` : `<svg class="info-pane-img" viewBox="0 0 50 50"><path d="${avatarIconPath}" fill="#ccc"></path></svg>`;
    const tenureYears = d.tenureStartYear === d.tenureEndYear ? d.tenureStartYear : `${d.tenureStartYear} – ${d.tenureEndYear}`;
    
    const totalTrophies = d.tenureTrophies;

    let trophyHtml = '<div class="info-pane-trophies">';
    if (totalTrophies.european > 0) {
        const label = totalTrophies.european > 1 ? 'Europese prijzen' : 'Europese prijs';
        trophyHtml += `<div class="trophy-item" title="Europese prijzen in deze periode"><svg class="trophy-icon" viewBox="0 0 18 17"><path d="M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z" fill="#FFD700"></path></svg><span class="trophy-count">${totalTrophies.european} ${label}</span></div>`;
    }
    if (totalTrophies.title > 0) {
        const label = totalTrophies.title > 1 ? 'nationale titels' : 'nationale titel';
        trophyHtml += `<div class="trophy-item" title="Nationale titels in deze periode"><svg class="trophy-icon" viewBox="0 0 18 17"><path d="M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z" fill="#C0C0C0"></path></svg><span class="trophy-count">${totalTrophies.title} ${label}</span></div>`;
    }
    if (totalTrophies.cup > 0) {
        const label = totalTrophies.cup > 1 ? 'nationale bekers' : 'nationale beker';
        trophyHtml += `<div class="trophy-item" title="Nationale bekers in deze periode"><svg class="trophy-icon" viewBox="0 0 18 17"><path d="M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z" fill="#CD7F32"></path></svg><span class="trophy-count">${totalTrophies.cup} ${label}</span></div>`;
    }
    trophyHtml += '</div>';

    const content = `
        ${imageHtml}
        <div class="info-pane-content">
            <div class="info-pane-details">
                <p class="name">${d.Coach}</p>
                <div class="nationality">
                    ${flagApiUrl ? `<img src="${flagApiUrl}" class="info-pane-flag">` : ''}
                    <span>${d.nationaliteit}</span>
                </div>
            </div>
            ${trophyHtml}
            <div class="info-pane-extra">
                <p class="club">${d.club}</p>
                <p class="tenure">${tenureYears} (${d.stintLength} ${d.stintLength > 1 ? 'seasons' : 'season'})</p>
            </div>
        </div>`;
    DOMElements.infoPane.attr("class", "details-state").html(content);
}

function showCareerInfoPane() {
    const coach = appState.allCoaches.find(c => c.naam === appState.careerCoachName);
    if (!coach) {
        setInfoPaneDefault();
        return;
    }

    const coachCareerData = appState.allSeasons.filter(s => s.coachId === coach.id);
    const totalTrophies = { european: 0, title: 0, cup: 0 };
    const countedPrizes = new Set();
    coachCareerData.forEach(season => {
        const seasonKey = `${season.club}-${season.seizoen}`;
        if (season.europese_prijs === 'Y' && !countedPrizes.has(`${seasonKey}-eu`)) { totalTrophies.european++; countedPrizes.add(`${seasonKey}-eu`); }
        if (season.landstitel === 'Y' && !countedPrizes.has(`${seasonKey}-ti`)) { totalTrophies.title++; countedPrizes.add(`${seasonKey}-ti`); }
        if (season.nationale_beker === 'Y' && !countedPrizes.has(`${seasonKey}-cu`)) { totalTrophies.cup++; countedPrizes.add(`${seasonKey}-cu`); }
    });

    let trophyHtml = '<div class="info-pane-trophies">';
    if (totalTrophies.european > 0) { trophyHtml += `<div class="trophy-item"><svg class="trophy-icon" viewBox="0 0 18 17"><path d="M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z" fill="#FFD700"></path></svg><span class="trophy-count">${totalTrophies.european} ${totalTrophies.european > 1 ? 'Europese prijzen' : 'Europese prijs'}</span></div>`; }
    if (totalTrophies.title > 0) { trophyHtml += `<div class="trophy-item"><svg class="trophy-icon" viewBox="0 0 18 17"><path d="M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z" fill="#C0C0C0"></path></svg><span class="trophy-count">${totalTrophies.title} ${totalTrophies.title > 1 ? 'nationale titels' : 'nationale titel'}</span></div>`; }
    if (totalTrophies.cup > 0) { trophyHtml += `<div class="trophy-item"><svg class="trophy-icon" viewBox="0 0 18 17"><path d="M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z" fill="#CD7F32"></path></svg><span class="trophy-count">${totalTrophies.cup} ${totalTrophies.cup > 1 ? 'nationale bekers' : 'nationale beker'}</span></div>`; }
    trophyHtml += '</div>';

    const hasPhoto = coach.foto_url && coach.foto_url.trim() !== '';
    const flagApiUrl = coach.nat_code ? `https://flagcdn.com/w40/${coach.nat_code.toLowerCase()}.png` : '';
    const avatarIconPath = "M25 26.5 C20 26.5 15 29 15 34 V37 H35 V34 C35 29 30 26.5 25 26.5 Z M25 15 C21.1 15 18 18.1 18 22 C18 25.9 21.1 29 25 29 C28.9 29 32 25.9 32 22 C32 18.1 28.9 15 25 15 Z";
    let imageHtml = hasPhoto ? `<img src="${coach.foto_url}" class="info-pane-img" onerror="this.onerror=null; this.outerHTML='<svg class=\\'info-pane-img\\' viewBox=\\'0 0 50 50\\'><path d=\\'${avatarIconPath}\\' fill=\\'#ccc\\'></path></svg>';">` : `<svg class="info-pane-img" viewBox="0 0 50 50"><path d="${avatarIconPath}" fill="#ccc"></path></svg>`;

    const content = `
        ${imageHtml}
        <div class="info-pane-content">
            <div class="info-pane-details">
                <p class="name">${coach.naam}</p>
                <div class="nationality">
                    ${flagApiUrl ? `<img src="${flagApiUrl}" class="info-pane-flag">` : ''}
                    <span>${coach.nationaliteit}</span>
                </div>
            </div>
            ${trophyHtml}
        </div>`;
    DOMElements.infoPane.attr("class", "details-state").html(content);
}


function drawLegend() {
    DOMElements.legendContainer.html("");
    const legendData = [ { color: "#FF0033", label: "1 Season" }, { color: "#66ff66", label: "2 Seasons" }, { color: "#33cc33", label: "3-4 Seasons" }, { color: "#339933", label: "5-6 Seasons" }, { color: "#006600", label: "7-9 Seasons" }, { color: "#003300", label: "10+ Seasons" } ];
    const prizeData = [ { color: '#FFD700', label: 'European Trophy' }, { color: '#C0C0C0', label: 'National Title' }, { color: '#CD7F32', label: 'National Cup' } ];
    
    const tenureGroup = DOMElements.legendContainer.append("div").attr("class", "legend-section");
    const prizeGroup = DOMElements.legendContainer.append("div").attr("class", "legend-section");

    tenureGroup.selectAll(".legend-item").data(legendData).join("div").attr("class", "legend-item").html(d => `<div class="legend-swatch" style="background-color:${d.color};"></div><span>${d.label}</span>`);
    prizeGroup.selectAll(".legend-item").data(prizeData).join("div").attr("class", "legend-item").html(d => `<svg class="legend-swatch" viewBox="0 0 18 17"><path d="M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z" fill="${d.color}" stroke="#444" stroke-width="0.5"></path></svg><span>${d.label}</span>`);
}

// --- 9. COMPARE & CAREER MODE LOGIC ---
function openClubModal() {
    DOMElements.clubModal.classList.remove('modal-hidden');
    DOMElements.clubSearchInputModal.value = '';
    
    const availableClubs = appState.allClubs
        .filter(club => !appState.comparisonClubs.some(c => c.id === club.id))
        .sort((a,b) => a.land.localeCompare(b.land) || a.naam.localeCompare(b.naam));

    const groupedByCountry = d3.groups(availableClubs, d => d.land);

    DOMElements.clubListContainer.innerHTML = '';
    groupedByCountry.forEach(([country, clubs]) => {
        const countryGroup = document.createElement('div');
        countryGroup.className = 'club-list-country-group';
        countryGroup.innerHTML = `<h3>${country}</h3>`;
        
        clubs.forEach(club => {
            const item = document.createElement('div');
            item.className = 'club-list-item';
            item.dataset.clubId = club.id;
            item.innerHTML = `<img src="${club.logo_url}" alt="${club.naam} logo"><span>${club.naam}</span>`;
            item.addEventListener('click', () => addClubToComparison(club.id));
            countryGroup.appendChild(item);
        });
        DOMElements.clubListContainer.appendChild(countryGroup);
    });
}

function closeClubModal() {
    DOMElements.clubModal.classList.add('modal-hidden');
}

function addClubToComparison(clubId) {
    const club = appState.allClubs.find(c => c.id === clubId);
    if (club && !appState.comparisonClubs.some(c => c.id === clubId)) {
        appState.comparisonClubs.push(club);
    }
    closeClubModal();
    renderApp();
}

function removeClubFromComparison(clubId) {
    appState.comparisonClubs = appState.comparisonClubs.filter(c => c.id !== clubId);
    renderApp();
}

function clearComparison() {
    appState.comparisonClubs = [];
    renderApp();
}

function filterClubList() {
    const searchTerm = DOMElements.clubSearchInputModal.value.toLowerCase();
    document.querySelectorAll('.club-list-item').forEach(item => {
        const clubName = item.querySelector('span').textContent.toLowerCase();
        const matches = clubName.includes(searchTerm);
        item.style.display = matches ? 'flex' : 'none';
    });
}
