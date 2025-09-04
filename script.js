/*
  JS Versie: 17.4 - Correctie Icoon & Herstel Firebase
  Changelog:
  - De foutieve Firebase-initialisatie die de visualisatie brak, is hersteld naar de werkende versie.
  - SVG-icoon voor 'Longest Tenure' in het Key Insights-paneel is vervangen door een correct zandloper-icoon.
*/

document.addEventListener('DOMContentLoaded', () => {
    // NOTE: Firebase initialisatie wordt verwacht in de HTML via de Firebase SDK scripts.
    const db = firebase.firestore();

    // Global state object
    const state = {
        allData: {},
        currentCountry: 'england',
        activeClubs: [],
        allClubs: {},
        colorScale: null,
        prizeScale: null,
        currentMode: 'default',
        careerCoach: null,
        lastHoveredData: null,
        isFilterPanelOpen: false,
        activeFilters: {
            nationality: '',
            minTenure: '',
            hasPrizes: '',
            coachName: ''
        },
        viewState: { // To remember clubs for each country
            england: ['Arsenal', 'Chelsea', 'Liverpool', 'Manchester City', 'Manchester United', 'Tottenham Hotspur'],
            spain: ['FC Barcelona', 'Real Madrid', 'Atlético Madrid'],
            italy: ['Juventus', 'AC Milan', 'Inter Milan'],
            germany: ['Bayern Munich', 'Borussia Dortmund'],
            france: ['Paris Saint-Germain', 'Olympique Marseille'],
            netherlands: ['Ajax', 'PSV', 'Feyenoord'],
            portugal: ['SL Benfica', 'FC Porto', 'Sporting CP']
        }
    };

    // DOM Elements
    const elements = {
        countryNav: document.getElementById('country-nav-container'),
        heatmapContainer: document.getElementById('heatmap-container'),
        infoPane: document.getElementById('info-pane'),
        statGrid: document.getElementById('stat-grid'),
        filterToggleButton: document.getElementById('filter-toggle-btn'),
        filterPanel: document.getElementById('filter-panel'),
        filterResetButton: document.getElementById('filter-reset-btn'),
        nationalityFilter: document.getElementById('nationality-filter'),
        tenureFilter: document.getElementById('tenure-filter'),
        prizeFilter: document.getElementById('prize-filter'),
        nameFilter: document.getElementById('name-filter'),
        clubModal: document.getElementById('club-modal'),
        clubListContainer: document.getElementById('club-list-container'),
        clubSearchInput: document.getElementById('club-search-input-modal'),
        modalCloseButton: document.querySelector('.modal-close-btn'),
        advancedNav: document.getElementById('advanced-nav-container'),
        careerControls: document.getElementById('career-mode-controls'),
        shareButton: document.getElementById('share-btn'),
        mobileOverlay: document.getElementById('mobile-overlay'),
        mobileOverlayClose: document.querySelector('.overlay-close-btn'),
        siteHeader: document.querySelector('.site-header')
    };

    // --- INITIALIZATION ---
    async function initializeApp() {
        checkMobile();
        setHeaderStyle();
        setupEventListeners();
        createColorScales();

        try {
            await parseUrlAndLoadData();
            console.log("Initialization complete.");
        } catch (error) {
            console.error("Initialization failed:", error);
            await loadCountryData(state.currentCountry, state.viewState[state.currentCountry]);
        }
    }

    // --- DATA LOADING & HANDLING ---
    async function parseUrlAndLoadData() {
        const params = new URLSearchParams(window.location.search);
        const country = params.get('country') || 'england';
        const clubsParam = params.get('clubs');
        const coach = params.get('coach');

        let clubs = clubsParam ? clubsParam.split(',') : state.viewState[country];

        await loadCountryData(country, clubs);

        if (coach) {
            state.careerCoach = coach;
            setActiveMode('career');
            // Attempt to find data for the hovered pane
            for (const club of state.activeClubs) {
                for (const season in club.seasons) {
                    if (club.seasons[season].coachId === coach) {
                        state.lastHoveredData = { ...club.seasons[season], club: club.name, season: season };
                        break;
                    }
                }
                if (state.lastHoveredData) break;
            }
        }
    }

    async function loadCountryData(country, clubNames) {
        state.currentCountry = country;
        updateCountryNav();

        if (!state.allData[country]) {
            try {
                const doc = await db.collection('countries').doc(country).get();
                if (doc.exists) {
                    const data = doc.data();
                    state.allData[country] = data.clubs;
                    state.allClubs[country] = Object.values(data.clubs).sort((a, b) => a.name.localeCompare(b.name));
                } else {
                    console.error(`No data found for ${country}`);
                    return;
                }
            } catch (error) {
                console.error("Error loading country data:", error);
                return;
            }
        }
        
        setActiveClubs(clubNames);
        populateNationalityFilter();
        renderHeatmap();
        renderCountryStats();
    }
    
    function setActiveClubs(clubNames) {
        if (!state.allClubs[state.currentCountry]) return;
        state.activeClubs = clubNames
            .map(name => state.allClubs[state.currentCountry].find(c => c.name === name))
            .filter(Boolean); // Filter out any undefined clubs
        state.viewState[state.currentCountry] = state.activeClubs.map(c => c.name);
    }

    // --- STATE MANAGEMENT ---
    function setActiveMode(mode) {
        state.currentMode = mode;
        updateAdvancedNav();
        renderHeatmap();
        updateInfoPaneForMode();
    }
    
    function updateInfoPaneForMode() {
        if (state.currentMode === 'career' && state.lastHoveredData) {
            renderInfoPane(state.lastHoveredData);
        } else {
            renderInfoPane(null);
        }
    }

    function updateURL() {
        const params = new URLSearchParams();
        params.set('country', state.currentCountry);
        if (state.activeClubs.length > 0) {
            params.set('clubs', state.activeClubs.map(c => c.name).join(','));
        }
        if (state.currentMode === 'career' && state.careerCoach) {
            params.set('coach', state.careerCoach);
        }
        history.pushState({}, '', `${window.location.pathname}?${params.toString()}`);
    }

    // --- UI RENDERING ---
    function createColorScales() {
        state.colorScale = d3.scaleSequential(d3.interpolateCividis).domain([15, 0]);
        state.prizeScale = d3.scaleSqrt().domain([1, 5]).range([5, 10]).clamp(true);
    }

    function renderHeatmap() {
        d3.select(elements.heatmapContainer).select("svg").remove();

        if (state.activeClubs.length === 0) {
            elements.heatmapContainer.innerHTML = `<div style="text-align:center; padding: 2rem; color: #888;">Add a club to the visualization to get started.</div>`;
            renderAddClubButton(); // Special case to render the "add" button
            return;
        }

        const data = state.activeClubs;
        const allSeasons = new Set();
        Object.values(state.allData[state.currentCountry]).forEach(club => {
             Object.keys(club.seasons).forEach(season => allSeasons.add(season));
        });
        const seasons = Array.from(allSeasons).sort();
        
        const firstSeason = parseInt(seasons[0].split('/')[0]);
        const lastSeason = parseInt(seasons[seasons.length - 1].split('/')[0]);

        const margin = { top: 20, right: 20, bottom: 30, left: 200 };
        const barHeight = 40;
        const width = (lastSeason - firstSeason + 1) * 20;
        const height = (data.length + 1) * barHeight + margin.top + margin.bottom; // +1 for add button

        const svg = d3.select(elements.heatmapContainer)
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const x = d3.scaleLinear().domain([firstSeason, lastSeason + 1]).range([0, width]);
        const y = d3.scaleBand().domain([...data.map(d => d.name), "add-club"]).range([0, height - margin.top - margin.bottom]).padding(0.1);

        svg.append("g").attr("class", "x-axis axis").attr("transform", `translate(0,${height - margin.top - margin.bottom})`)
            .call(d3.axisBottom(x).tickFormat(d => `'${String(d).slice(-2)}`).tickValues(d3.range(firstSeason, lastSeason + 1, 5).filter(d => d % 5 === 0)));

        const yAxis = svg.append("g").attr("class", "y-axis axis").call(d3.axisLeft(y).tickSize(0).tickPadding(10));
        yAxis.selectAll(".tick").remove();

        const clubLabels = yAxis.selectAll(".club-label").data(data).enter().append("g")
            .attr("class", "club-label").attr("transform", d => `translate(0, ${y(d.name) + y.bandwidth() / 2})`);
        
        clubLabels.append("rect").attr("x", -margin.left).attr("y", -y.bandwidth()/2).attr("width", margin.left).attr("height", y.bandwidth());
        clubLabels.append("text").attr("x", -10).attr("dy", "0.32em").attr("text-anchor", "end").text(d => d.name);
        
        renderAddClubButton(svg, y, "add-club");
        
        // Remove button for existing clubs
        clubLabels.append("g").attr("class", "remove-club-btn").attr("transform", `translate(${-margin.left + 10}, 0)`)
            .on('click', (e, d) => {
                const newClubs = state.activeClubs.filter(c => c.name !== d.name).map(c => c.name);
                setActiveClubs(newClubs);
                renderHeatmap();
                updateURL();
            })
            .append("circle").attr("r", 8).attr("class", "remove-club-btn-bg")
            .append("title").text(d => `Remove ${d.name}`);
        clubLabels.selectAll(".remove-club-btn").append("path").attr("d", "M-4,-4 L4,4 M-4,4 L4,-4").attr("class", "remove-club-btn-cross");


        const clubsGroup = svg.selectAll(".club-group").data(data).enter().append("g")
            .attr("class", "club-group").attr("transform", d => `translate(0, ${y(d.name)})`);

        clubsGroup.each(function(clubData) {
            const group = d3.select(this);
            group.append("rect").attr("class", "event-catcher").attr("width", width).attr("height", y.bandwidth());

            const seasonData = Object.entries(clubData.seasons);
            let currentCoach = null;
            let startYear = 0;
            let tenureYears = 0;
            
            seasonData.forEach(([season, coachInfo], i) => {
                const year = parseInt(season.split('/')[0]);
                if (coachInfo.coachId !== currentCoach) {
                    currentCoach = coachInfo.coachId;
                    startYear = year;
                    tenureYears = coachInfo.tenureInYears;
                }
                
                const isFilteredOut = checkFilters(coachInfo);
                const isCareerHighlight = state.currentMode === 'career' && coachInfo.coachId === state.careerCoach;

                const bar = group.append("rect").attr("class", "bar")
                    .attr("x", x(year)).attr("y", 0).attr("width", x(year + 1) - x(year))
                    .attr("height", y.bandwidth())
                    .attr("fill", coachInfo.coachId ? state.colorScale(tenureYears) : '#f0f0f0')
                    .classed('is-dimmed', isFilteredOut && !isCareerHighlight)
                    .classed('is-highlighted', isCareerHighlight)
                    .datum({ ...coachInfo, club: clubData.name, season: season });

                if (i > 0 && coachInfo.coachId !== seasonData[i - 1][1].coachId) {
                    group.append("line").attr("class", "coach-divider")
                        .attr("x1", x(year)).attr("y1", 0).attr("x2", x(year)).attr("y2", y.bandwidth());
                }

                if (coachInfo.prizes && coachInfo.prizes.length > 0 && !isFilteredOut) {
                    const prizeGroup = group.append("g").attr("class", "prize-group");
                    coachInfo.prizes.forEach((prize, j) => {
                        prizeGroup.append('text')
                            .attr('x', x(year) + (x(year + 1) - x(year)) / 2)
                            .attr('y', y.bandwidth() / 2)
                            .attr('dy', (j - (coachInfo.prizes.length - 1) / 2) * 10 + 4)
                            .attr('text-anchor', 'middle').attr('font-size', '12px').attr('fill', '#fff').text(getPrizeEmoji(prize));
                    });
                }
            });
        });
        
        svg.selectAll(".bar")
            .on('mouseover', function(event, d) {
                state.lastHoveredData = d;
                if (!checkFilters(d)) {
                    renderInfoPane(d);
                    if (state.currentMode !== 'career') highlightCoach(d.coachId);
                }
            })
            .on('mouseout', function() {
                if (state.currentMode !== 'career') {
                    renderInfoPane(null);
                    unhighlightAll();
                }
            })
            .on('click', (event, d) => {
                if (d.coachId && !checkFilters(d)) {
                    state.careerCoach = d.coachId;
                    state.lastHoveredData = d;
                    setActiveMode('career');
                    updateURL();
                }
            });
    }
    
    function renderAddClubButton(container = elements.heatmapContainer, y, domainName) {
        let selection = container;
        if(container.select) { // It's an SVG container
            selection = container.append("g").attr("class", "y-axis add-club-placeholder")
                .attr("transform", `translate(0, ${y(domainName)})`);
        } else { // It's the main div
            d3.select(container).select("svg").remove();
        }

        const placeholder = selection.append("g")
            .attr("transform", `translate(${-y.padding()*y.step()}, 0)`)
            .on('click', () => elements.clubModal.classList.remove('modal-hidden'));

        placeholder.append("rect").attr("width", y.step())
            .attr("height", y.bandwidth()).attr("rx", 4);
        placeholder.append("text").attr("x", y.step() / 2).attr("y", y.bandwidth() / 2)
            .attr("text-anchor", "middle").attr("dy", "0.32em").text("+ Add Club");
    }

    function updateCountryNav() {
        elements.countryNav.innerHTML = '';
        const countries = ['england', 'spain', 'italy', 'germany', 'france', 'netherlands', 'portugal'];
        countries.forEach(country => {
            const link = document.createElement('a');
            link.href = "#";
            link.textContent = country.charAt(0).toUpperCase() + country.slice(1);
            link.className = 'nav-link';
            if (state.currentCountry === country) link.classList.add('active');
            link.addEventListener('click', (e) => {
                e.preventDefault();
                if (state.currentCountry !== country) {
                    loadCountryData(country, state.viewState[country]);
                    updateURL();
                }
            });
            elements.countryNav.appendChild(link);
        });
    }

    function updateAdvancedNav() {
        elements.advancedNav.querySelectorAll('.advanced-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === state.currentMode);
        });
        elements.careerControls.classList.toggle('hidden', state.currentMode !== 'career');
    }

    function renderInfoPane(data) {
        if (!data || !data.coachId) {
            elements.infoPane.innerHTML = `<div class="info-pane-default-text">Hover over a season to see details or select a country to see stats.</div>`;
            if (state.currentCountry) {
                renderCountryStats();
            }
            return;
        }

        const prizesHTML = data.prizes && data.prizes.length > 0 ?
            `<div class="trophy-item"><span class="trophy-icon">🏆</span> <span class="trophy-count">${data.prizes.join(', ')}</span></div>` :
            '';

        elements.infoPane.innerHTML = `
            <div class="info-pane-content">
                <img src="${getFlagUrl(data.nationality, true)}" class="info-pane-img" alt="${data.nationality} flag">
                <div>
                    <h3 class="name">${data.coachName}</h3>
                    <p class="nationality">${data.nationality}</p>
                </div>
                <div class="info-pane-extra">
                    <p class="club">${data.club}</p>
                    <p class="tenure">${data.season} &bull; ${(data.tenureInYears || 0).toFixed(1)} yrs</p>
                </div>
            </div>`;
    }

    function renderCountryStats() {
        if (!state.currentCountry || !state.allData[state.currentCountry]) {
            elements.statGrid.parentElement.classList.add('hidden');
            return;
        }
        elements.statGrid.parentElement.classList.remove('hidden');

        const allSpells = Object.values(state.allData[state.currentCountry])
            .flatMap(club => Object.values(club.seasons).map(s => ({ ...s, clubName: club.name })));

        if (allSpells.length === 0) return;

        const coachTrophies = allSpells.reduce((acc, spell) => {
            if (spell.prizes && spell.prizes.length > 0) {
                acc[spell.coachId] = acc[spell.coachId] || { name: spell.coachName, count: 0 };
                acc[spell.coachId].count += spell.prizes.length;
            }
            return acc;
        }, {});
        const mostSuccessful = Object.values(coachTrophies).sort((a, b) => b.count - a.count)[0];

        const longestTenure = allSpells.filter(s => s.totalTenureDays).sort((a, b) => b.totalTenureDays - a.totalTenureDays)[0];

        const uniqueTenures = [...new Map(allSpells.map(item => [item.coachId + item.clubName, item])).values()];
        const avgTenureDays = uniqueTenures.reduce((sum, spell) => sum + (spell.totalTenureDays || 0), 0) / uniqueTenures.length;
        
        const coachClubs = allSpells.reduce((acc, spell) => {
            if(!acc[spell.coachId]) acc[spell.coachId] = { name: spell.coachName, clubs: new Set() };
            acc[spell.coachId].clubs.add(spell.clubName);
            return acc;
        }, {});
        const journeyman = Object.values(coachClubs).sort((a, b) => b.clubs.size - a.clubs.size)[0];
        
        const icons = {
            avgTenure: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.414-1.415L11 9.586V6z" clip-rule="evenodd" /></svg>',
            longestTenure: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3h10v3l-5 5 5 5v3H5v-3l5-5-5-5V3z" /></svg>',
            mostSuccessful: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M11.982 1.993a1 1 0 00-1.964 0l-1.334 4.12a1 1 0 01-.95.693l-4.332.63a1 1 0 00-.554 1.706l3.135 3.056a1 1 0 01.286.885l-.74 4.316a1 1 0 001.451 1.054l3.875-2.037a1 1 0 01.93 0l3.875 2.037a1 1 0 001.45-1.054l-.74-4.316a1 1 0 01.287-.885l3.135-3.056a1 1 0 00-.554-1.706l-4.332-.63a1 1 0 01-.95-.693l-1.334-4.12z" /></svg>',
            journeyman: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M8 1a3 3 0 100 6 3 3 0 000-6zM4 10a2 2 0 00-2 2v1a2 2 0 002 2h8a2 2 0 002-2v-1a2 2 0 00-2-2H4zM16 8a3 3 0 100-6 3 3 0 000 6z" /></svg>'
        };

        elements.statGrid.innerHTML = `
            <div class="stat-card"><div class="stat-icon">${icons.mostSuccessful}</div><div><div class="stat-label">Most Successful</div><div class="stat-value">${mostSuccessful ? mostSuccessful.name : 'N/A'}</div><div class="stat-sub-value">${mostSuccessful ? mostSuccessful.count + ' trophies' : ''}</div></div></div>
            <div class="stat-card"><div class="stat-icon">${icons.longestTenure}</div><div><div class="stat-label">Longest Tenure</div><div class="stat-value">${longestTenure ? longestTenure.coachName : 'N/A'}</div><div class="stat-sub-value">${longestTenure ? (longestTenure.totalTenureDays / 365.25).toFixed(1) + ' yrs at ' + longestTenure.clubName : ''}</div></div></div>
            <div class="stat-card"><div class="stat-icon">${icons.avgTenure}</div><div><div class="stat-label">Average Tenure</div><div class="stat-value">${(avgTenureDays / 365.25).toFixed(1)} years</div><div class="stat-sub-value">Across all clubs</div></div></div>
            <div class="stat-card"><div class="stat-icon">${icons.journeyman}</div><div><div class="stat-label">Top Journeyman</div><div class="stat-value">${journeyman ? journeyman.name : 'N/A'}</div><div class="stat-sub-value">${journeyman ? journeyman.clubs.size + ' clubs' : ''}</div></div></div>
        `;
    }

    // --- INTERACTIONS & HIGHLIGHTING ---
    function highlightCoach(coachId) {
        d3.selectAll('.bar').classed('is-dimmed', d => d.coachId !== coachId);
    }
    function unhighlightAll() {
        d3.selectAll('.bar').classed('is-dimmed', false);
    }

    // --- FILTERS ---
    function setupFilterListeners() {
        elements.filterToggleButton.addEventListener('click', () => {
            state.isFilterPanelOpen = !state.isFilterPanelOpen;
            elements.filterPanel.classList.toggle('hidden', !state.isFilterPanelOpen);
            elements.filterToggleButton.classList.toggle('open', state.isFilterPanelOpen);
        });
        
        elements.filterResetButton.addEventListener('click', () => {
            elements.nationalityFilter.value = "";
            elements.tenureFilter.value = "";
            elements.prizeFilter.value = "";
            elements.nameFilter.value = "";
            applyFilters();
        });

        ['change', 'keyup'].forEach(evt => {
            elements.filterPanel.addEventListener(evt, applyFilters);
        });
    }

    function applyFilters() {
        state.activeFilters = {
            nationality: elements.nationalityFilter.value,
            minTenure: parseFloat(elements.tenureFilter.value) || 0,
            hasPrizes: elements.prizeFilter.value,
            coachName: elements.nameFilter.value.toLowerCase()
        };
        renderHeatmap();
    }

    function checkFilters(coachInfo) {
        const { nationality, minTenure, hasPrizes, coachName } = state.activeFilters;
        if (nationality && coachInfo.nationality !== nationality) return true;
        if (minTenure && (coachInfo.tenureInYears || 0) < minTenure) return true;
        if (hasPrizes === 'yes' && (!coachInfo.prizes || coachInfo.prizes.length === 0)) return true;
        if (hasPrizes === 'no' && coachInfo.prizes && coachInfo.prizes.length > 0) return true;
        if (coachName && !coachInfo.coachName.toLowerCase().includes(coachName)) return true;
        return false;
    }

    function populateNationalityFilter() {
        if (!state.currentCountry || !state.allData[state.currentCountry]) return;
        const nationalities = new Set(Object.values(state.allData[state.currentCountry])
            .flatMap(club => Object.values(club.seasons).map(s => s.nationality))
            .filter(Boolean));
        
        elements.nationalityFilter.innerHTML = '<option value="">All Nationalities</option>' + 
            [...nationalities].sort().map(n => `<option value="${n}">${n}</option>`).join('');
    }
    
    // --- MODAL ---
    function setupModal() {
        elements.modalCloseButton.addEventListener('click', () => elements.clubModal.classList.add('modal-hidden'));
        window.addEventListener('click', (e) => {
            if (e.target === elements.clubModal) elements.clubModal.classList.add('modal-hidden');
        });
        elements.clubSearchInput.addEventListener('keyup', renderClubList);
        elements.clubModal.addEventListener('modal:open', renderClubList);
    }
    
    function renderClubList() {
        const searchTerm = elements.clubSearchInput.value.toLowerCase();
        const availableClubs = state.allClubs[state.currentCountry]
            .filter(c => !state.activeClubs.some(ac => ac.name === c.name))
            .filter(c => c.name.toLowerCase().includes(searchTerm));
        
        elements.clubListContainer.innerHTML = availableClubs.map(club => `
            <div class="club-list-item" data-club-name="${club.name}">
                <span>${club.name}</span>
            </div>
        `).join('');
        
        document.querySelectorAll('.club-list-item').forEach(item => {
            item.addEventListener('click', () => {
                const clubName = item.dataset.clubName;
                const newClubs = [...state.activeClubs.map(c => c.name), clubName];
                setActiveClubs(newClubs);
                renderHeatmap();
                updateURL();
                elements.clubModal.classList.add('modal-hidden');
            });
        });
    }

    // --- UTILS ---
    function getPrizeEmoji(prize) {
        const p = prize.toLowerCase();
        if (p.includes('league') || p.includes('divisi')) return '🏆';
        if (p.includes('cup') || p.includes('copa')) return '🎟️';
        if (p.includes('champions')) return '⭐';
        if (p.includes('europa')) return '🇪🇺';
        return '🏅';
    }
    
    function getFlagUrl(nationality, large = false) {
        const map = { "Spanish": "es", "English": "gb", "Italian": "it", "German": "de", "French": "fr", "Dutch": "nl", "Portuguese": "pt", "Argentine": "ar", "Scottish": "gb-sct", "Welsh": "gb-wls", "Northern Irish": "gb-nir", "Irish": "ie", "Brazilian": "br", "Swedish": "se", "Norwegian": "no", "Danish": "dk", "Chilean": "cl", "Uruguayan": "uy", "Mexican": "mx", "American": "us", "Swiss": "ch", "Austrian": "at", "Belgian": "be", "Croatian": "hr" };
        const code = map[nationality] || "xx";
        const size = large ? 'w80' : 'w20';
        return `https://flagcdn.com/${size}/${code}.png`;
    }
    
    function setupEventListeners() {
        setupFilterListeners();
        setupModal();
        
        elements.advancedNav.addEventListener('click', (e) => {
            if (e.target.classList.contains('advanced-nav-btn')) {
                const mode = e.target.dataset.mode;
                if (mode === 'default') state.careerCoach = null;
                setActiveMode(mode);
            }
        });

        elements.shareButton.addEventListener('click', () => {
            navigator.clipboard.writeText(window.location.href).then(() => {
                const originalContent = elements.shareButton.innerHTML;
                elements.shareButton.innerHTML = `<span>✔️</span> Copied!`;
                elements.shareButton.classList.add('clicked');
                setTimeout(() => {
                    elements.shareButton.innerHTML = originalContent;
                    elements.shareButton.classList.remove('clicked');
                }, 2000);
            }).catch(err => console.error('Failed to copy: ', err));
        });

        if(elements.mobileOverlayClose) {
            elements.mobileOverlayClose.addEventListener('click', () => elements.mobileOverlay.classList.add('mobile-overlay-hidden'));
        }
        
        window.addEventListener('scroll', setHeaderStyle);
    }

    function checkMobile() {
        if (window.innerWidth <= 768) {
            elements.mobileOverlay.classList.remove('mobile-overlay-hidden');
        }
    }
    
    function setHeaderStyle() {
        elements.siteHeader.classList.toggle('site-header-home', window.scrollY <= 20);
    }

    // --- KICK OFF ---
    initializeApp();
});
