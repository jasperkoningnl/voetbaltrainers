/*
  JS Versie: 17.3 - Correctie Witruimte & Icoon
  Changelog:
  - SVG-icoon voor 'Longest Tenure' in het Key Insights-paneel vervangen door een zandloper.
*/

document.addEventListener('DOMContentLoaded', () => {
    // Firebase configuration
    const firebaseConfig = {
        apiKey: "YOUR_API_KEY", // Replace with your actual config
        authDomain: "managerial-merry-go-round.firebaseapp.com",
        projectId: "managerial-merry-go-round",
        storageBucket: "managerial-merry-go-round.appspot.com",
        messagingSenderId: "YOUR_SENDER_ID",
        appId: "YOUR_APP_ID"
    };

    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();

    // Global state object
    const state = {
        allData: {},
        currentCountry: null,
        activeClubs: [],
        allClubs: {},
        colorScale: null,
        prizeScale: null,
        currentMode: 'default', // 'default', 'compare', 'career'
        compareClub1: null,
        compareClub2: null,
        careerCoach: null,
        lastHovered: null,
        activeFilters: {},
        isFilterPanelOpen: false,
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
    function initializeApp() {
        checkMobile();
        setHeaderStyle();
        setupEventListeners();
        createColorScales();
        loadInitialDataFromURL().then(() => {
            console.log("Initialization complete.");
        }).catch(error => {
            console.error("Initialization failed:", error);
            // Fallback to default if URL loading fails
            loadCountryData('england', ['Arsenal', 'Chelsea', 'Liverpool', 'Manchester City', 'Manchester United', 'Tottenham Hotspur']);
        });
    }

    // --- DATA LOADING & HANDLING ---
    async function loadInitialDataFromURL() {
        const params = new URLSearchParams(window.location.search);
        const country = params.get('country') || 'england';
        const clubsParam = params.get('clubs');
        const coach = params.get('coach');

        let clubs = [];
        if (clubsParam) {
            clubs = clubsParam.split(',');
        } else {
            clubs = ['Arsenal', 'Chelsea', 'Liverpool', 'Manchester City', 'Manchester United', 'Tottenham Hotspur'];
        }

        await loadCountryData(country, clubs);

        if (coach) {
            state.careerCoach = coach;
            setActiveMode('career');
        }
    }

    async function loadCountryData(country, initialClubs = []) {
        if (state.allData[country]) {
            await setupCountry(country, initialClubs);
        } else {
            try {
                const doc = await db.collection('countries').doc(country).get();
                if (doc.exists) {
                    const data = doc.data();
                    state.allData[country] = data.clubs;
                    state.allClubs[country] = Object.values(data.clubs).sort((a, b) => a.name.localeCompare(b.name));
                    await setupCountry(country, initialClubs);
                } else {
                    console.error(`No data found for ${country}`);
                }
            } catch (error) {
                console.error("Error loading country data:", error);
            }
        }
    }

    async function setupCountry(country, clubs) {
        state.currentCountry = country;
        state.activeClubs = clubs.map(clubName => state.allClubs[country].find(c => c.name === clubName)).filter(Boolean);

        updateCountryNav();
        renderHeatmap();
        renderCountryStats();
        populateNationalityFilter();
    }

    // --- STATE MANAGEMENT ---
    function setActiveMode(mode) {
        state.currentMode = mode;
        updateAdvancedNav();
        renderHeatmap(); // Re-render to apply mode-specific styles
    }

    function updateURL() {
        const params = new URLSearchParams();
        if (state.currentCountry) params.set('country', state.currentCountry);
        if (state.activeClubs.length > 0) params.set('clubs', state.activeClubs.map(c => c.name).join(','));
        if (state.currentMode === 'career' && state.careerCoach) {
            params.set('coach', state.careerCoach);
        }

        const newUrl = `${window.location.pathname}?${params.toString()}`;
        history.pushState({}, '', newUrl);
    }

    // --- UI RENDERING ---

    function createColorScales() {
        // Color scale for tenure duration (in years)
        state.colorScale = d3.scaleSequential(d3.interpolateYlGnBu)
            .domain([10, 0]); // Inverted: shorter tenure = cooler, longer = warmer

        // Scale for prize icon size
        state.prizeScale = d3.scaleSqrt()
            .domain([1, 5]) // Number of prizes
            .range([5, 10]) // Icon size (radius)
            .clamp(true);
    }

    function renderHeatmap() {
        if (!state.currentCountry || state.activeClubs.length === 0) {
            elements.heatmapContainer.innerHTML = '<p style="text-align:center; color: #888;">Select a country and add clubs to begin.</p>';
            return;
        }

        d3.select(elements.heatmapContainer).select("svg").remove();

        const data = state.activeClubs;
        const seasons = Object.keys(data[0].seasons).sort();
        const firstSeason = parseInt(seasons[0].split('/')[0]);
        const lastSeason = parseInt(seasons[seasons.length - 1].split('/')[0]);

        const margin = { top: 20, right: 20, bottom: 50, left: 200 };
        const barHeight = 40;
        const width = (lastSeason - firstSeason + 1) * 20;
        const height = data.length * barHeight + margin.top + margin.bottom;

        const svg = d3.select(elements.heatmapContainer)
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // --- AXES ---
        const x = d3.scaleLinear()
            .domain([firstSeason, lastSeason + 1])
            .range([0, width]);

        const y = d3.scaleBand()
            .domain(data.map(d => d.name))
            .range([0, height - margin.top - margin.bottom])
            .padding(0.1);

        // X-axis (Seasons)
        svg.append("g")
            .attr("class", "x-axis axis")
            .attr("transform", `translate(0,${height - margin.top - margin.bottom})`)
            .call(d3.axisBottom(x).tickFormat(d => `'${String(d).slice(-2)}`).tickValues(d3.range(firstSeason, lastSeason + 1, 5)));

        // Y-axis (Clubs)
        const yAxis = svg.append("g")
            .attr("class", "y-axis axis")
            .call(d3.axisLeft(y).tickSize(0).tickPadding(10));

        yAxis.selectAll(".tick").remove(); // Remove default labels

        const clubLabels = yAxis.selectAll(".club-label")
            .data(data)
            .enter()
            .append("g")
            .attr("class", "club-label")
            .attr("transform", d => `translate(0, ${y(d.name) + y.bandwidth() / 2})`);

        clubLabels.append("text")
            .attr("x", -10)
            .attr("dy", "0.32em")
            .attr("text-anchor", "end")
            .text(d => d.name);

        // --- BARS & DATA VIS ---
        const clubsGroup = svg.selectAll(".club-group")
            .data(data)
            .enter()
            .append("g")
            .attr("class", "club-group")
            .attr("transform", d => `translate(0, ${y(d.name)})`);

        clubsGroup.each(function(clubData) {
            const group = d3.select(this);
            const seasonData = Object.entries(clubData.seasons).sort((a, b) => a[0].localeCompare(b[0]));

            seasonData.forEach(([season, coachInfo], i) => {
                const startYear = parseInt(season.split('/')[0]);
                const isFilteredOut = checkFilters(coachInfo, clubData.name, season);
                const isCareerHighlight = state.currentMode === 'career' && coachInfo.coachId === state.careerCoach;

                const bar = group.append("rect")
                    .attr("class", "bar")
                    .attr("x", x(startYear))
                    .attr("y", 0)
                    .attr("width", x(startYear + 1) - x(startYear))
                    .attr("height", y.bandwidth())
                    .attr("fill", coachInfo.tenureInYears !== undefined ? state.colorScale(coachInfo.tenureInYears) : '#eee')
                    .style("opacity", isFilteredOut ? 0.1 : 1)
                    .style("stroke", isCareerHighlight ? 'gold' : 'none')
                    .style("stroke-width", isCareerHighlight ? 3 : 0);

                // Add data to the element
                bar.datum({ ...coachInfo, club: clubData.name, season: season });

                // Add prize indicators
                if (coachInfo.prizes && coachInfo.prizes.length > 0 && !isFilteredOut) {
                    const prizeGroup = group.append("g").attr("class", "prize-group");
                    coachInfo.prizes.forEach((prize, j) => {
                        prizeGroup.append('text')
                            .attr('x', x(startYear) + (x(startYear + 1) - x(startYear)) / 2)
                            .attr('y', y.bandwidth() / 2)
                            .attr('dy', (j - (coachInfo.prizes.length -1) / 2) * 10 + 4) // Adjust position
                            .attr('text-anchor', 'middle')
                            .attr('font-size', '12px')
                            .attr('fill', '#fff')
                            .text(getPrizeEmoji(prize));
                    });
                }
            });
        });

        // --- INTERACTIONS ---
        clubsGroup.selectAll('.bar')
            .on('mouseover', function(event, d) {
                if (d.coachId && !checkFilters(d, d.club, d.season)) {
                    state.lastHovered = d;
                    renderInfoPane(d);
                    highlightCoach(d.coachId);
                }
            })
            .on('mouseout', () => {
                if (state.currentMode !== 'career') {
                    renderInfoPane(null);
                    unhighlightAll();
                }
            })
            .on('click', (event, d) => {
                if (d.coachId && !checkFilters(d, d.club, d.season)) {
                    state.careerCoach = d.coachId;
                    setActiveMode('career');
                    updateURL();
                }
            });
    }

    function updateCountryNav() {
        elements.countryNav.innerHTML = '';
        const countries = ['england', 'spain', 'italy', 'germany', 'france', 'netherlands', 'portugal'];
        countries.forEach(country => {
            const link = document.createElement('a');
            link.href = "#";
            link.textContent = country.charAt(0).toUpperCase() + country.slice(1);
            link.className = 'nav-link';
            if (state.currentCountry === country) {
                link.classList.add('active');
            }
            link.addEventListener('click', (e) => {
                e.preventDefault();
                // A simple default club list for when switching countries
                const defaultClubsByCountry = {
                    england: ['Arsenal', 'Chelsea', 'Liverpool', 'Manchester City', 'Manchester United', 'Tottenham Hotspur'],
                    spain: ['FC Barcelona', 'Real Madrid', 'Atlético Madrid', 'Sevilla FC', 'Valencia CF'],
                    italy: ['Juventus', 'AC Milan', 'Inter Milan', 'AS Roma', 'Napoli'],
                    germany: ['Bayern Munich', 'Borussia Dortmund', 'RB Leipzig', 'Bayer 04 Leverkusen'],
                    france: ['Paris Saint-Germain', 'Olympique Marseille', 'AS Monaco', 'Olympique Lyonnais'],
                    netherlands: ['Ajax', 'PSV', 'Feyenoord'],
                    portugal: ['SL Benfica', 'FC Porto', 'Sporting CP']
                };
                loadCountryData(country, defaultClubsByCountry[country] || []);
                updateURL();
            });
            elements.countryNav.appendChild(link);
        });
    }

    function updateAdvancedNav() {
        const buttons = elements.advancedNav.querySelectorAll('.advanced-nav-btn');
        buttons.forEach(btn => {
            if (btn.dataset.mode === state.currentMode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        // Show/hide career controls
        elements.careerControls.classList.toggle('hidden', state.currentMode !== 'career');
        if (state.currentMode === 'career' && state.careerCoach) {
            renderInfoPane(state.lastHovered); // Keep infopane updated
            highlightCoach(state.careerCoach);
        } else {
            renderInfoPane(null);
            unhighlightAll();
        }
    }

    function renderInfoPane(data) {
        if (!data || !data.coachId) {
            elements.infoPane.innerHTML = `<div class="info-pane-default-text">Hover over a season to see details</div>`;
            return;
        }
        const prizesHTML = data.prizes && data.prizes.length > 0 ?
            `<p><strong>🏆 Prizes:</strong> ${data.prizes.join(', ')}</p>` :
            '<p>No major prizes won this season.</p>';

        elements.infoPane.innerHTML = `
            <div class="info-pane-details">
                 <div class="info-pane-main">
                    <p class="name">${data.coachName}</p>
                    <p class="nationality">
                        <img src="${getFlagUrl(data.nationality)}" class="info-pane-flag" alt="${data.nationality} flag">
                        ${data.nationality}
                    </p>
                </div>
                <div class="info-pane-extra">
                     <p class="club">${data.club}</p>
                     <p class="season">${data.season}</p>
                     <p class="tenure">${(data.tenureInYears || 0).toFixed(1)} years at season start</p>
                </div>
                 <div class="info-pane-trophies">
                    ${prizesHTML}
                </div>
            </div>
        `;
    }

    function renderCountryStats() {
        if (!state.currentCountry || !state.allData[state.currentCountry]) {
            elements.statGrid.innerHTML = '';
            return;
        }

        const clubs = Object.values(state.allData[state.currentCountry]);
        let allManagerialSpells = [];
        clubs.forEach(club => {
            Object.values(club.seasons).forEach(spell => {
                allManagerialSpells.push({ ...spell, clubName: club.name });
            });
        });

        if (allManagerialSpells.length === 0) return;

        // Most trophies
        const coachTrophies = allManagerialSpells.reduce((acc, spell) => {
            if (spell.prizes && spell.prizes.length > 0) {
                acc[spell.coachId] = acc[spell.coachId] || { name: spell.coachName, count: 0 };
                acc[spell.coachId].count += spell.prizes.length;
            }
            return acc;
        }, {});
        const mostSuccessful = Object.values(coachTrophies).sort((a, b) => b.count - a.count)[0];

        // Longest single tenure
        const longestTenure = allManagerialSpells.sort((a, b) => (b.totalTenureDays || 0) - (a.totalTenureDays || 0))[0];

        // Average tenure
        const uniqueTenures = [...new Map(allManagerialSpells.map(item => [item.coachId + item.clubName, item])).values()];
        const avgTenureDays = uniqueTenures.reduce((sum, spell) => sum + (spell.totalTenureDays || 0), 0) / uniqueTenures.length;
        const avgTenureYears = (avgTenureDays / 365.25).toFixed(1);

        // Most clubs managed
        const coachClubs = allManagerialSpells.reduce((acc, spell) => {
            acc[spell.coachId] = acc[spell.coachId] || { name: spell.coachName, clubs: new Set() };
            acc[spell.coachId].clubs.add(spell.clubName);
            return acc;
        }, {});
        const journeyman = Object.values(coachClubs).sort((a, b) => b.clubs.size - a.clubs.size)[0];
        
        const icons = {
            totalClubs: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" clip-rule="evenodd" /></svg>',
            avgTenure: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.414-1.415L11 9.586V6z" clip-rule="evenodd" /></svg>',
            longestTenure: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3h10v3l-5 5 5 5v3H5v-3l5-5-5-5V3z" /></svg>',
            mostSuccessful: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M11.982 1.993a1 1 0 00-1.964 0l-1.334 4.12a1 1 0 01-.95.693l-4.332.63a1 1 0 00-.554 1.706l3.135 3.056a1 1 0 01.286.885l-.74 4.316a1 1 0 001.451 1.054l3.875-2.037a1 1 0 01.93 0l3.875 2.037a1 1 0 001.45-1.054l-.74-4.316a1 1 0 01.287-.885l3.135-3.056a1 1 0 00-.554-1.706l-4.332-.63a1 1 0 01-.95-.693l-1.334-4.12z" /></svg>',
            journeyman: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M8 1a3 3 0 100 6 3 3 0 000-6zM4 10a2 2 0 00-2 2v1a2 2 0 002 2h8a2 2 0 002-2v-1a2 2 0 00-2-2H4zM16 8a3 3 0 100-6 3 3 0 000 6z" /></svg>'
        };

        const statsHTML = `
            <div class="stat-card">
                <div class="stat-icon">${icons.mostSuccessful}</div>
                <div>
                    <div class="stat-label">Most Successful</div>
                    <div class="stat-value">${mostSuccessful ? mostSuccessful.name : 'N/A'}</div>
                    <div class="stat-sub-value">${mostSuccessful ? mostSuccessful.count + ' trophies' : ''}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">${icons.longestTenure}</div>
                <div>
                    <div class="stat-label">Longest Tenure</div>
                    <div class="stat-value">${longestTenure ? longestTenure.coachName : 'N/A'}</div>
                    <div class="stat-sub-value">${longestTenure ? (longestTenure.totalTenureDays / 365.25).toFixed(1) + ' years at ' + longestTenure.clubName : ''}</div>
                </div>
            </div>
             <div class="stat-card">
                <div class="stat-icon">${icons.avgTenure}</div>
                <div>
                    <div class="stat-label">Average Tenure</div>
                    <div class="stat-value">${avgTenureYears} years</div>
                    <div class="stat-sub-value">Across all clubs</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">${icons.journeyman}</div>
                <div>
                    <div class="stat-label">Top Journeyman</div>
                    <div class="stat-value">${journeyman ? journeyman.name : 'N/A'}</div>
                    <div class="stat-sub-value">${journeyman ? journeyman.clubs.size + ' clubs' : ''}</div>
                </div>
            </div>
        `;
        elements.statGrid.innerHTML = statsHTML;
    }


    // --- INTERACTIONS & HIGHLIGHTING ---
    function highlightCoach(coachId) {
        d3.selectAll('.bar')
            .classed('is-dimmed', d => d.coachId !== coachId)
            .classed('is-highlighted', d => d.coachId === coachId);
    }

    function unhighlightAll() {
        d3.selectAll('.bar').classed('is-dimmed', false).classed('is-highlighted', false);
    }

    // --- FILTERS ---
    function setupFilterListeners() {
        elements.filterToggleButton.addEventListener('click', toggleFilterPanel);
        elements.filterResetButton.addEventListener('click', resetFilters);
        [elements.nationalityFilter, elements.tenureFilter, elements.prizeFilter, elements.nameFilter].forEach(el => {
            el.addEventListener('change', applyFilters);
            if (el.tagName === 'INPUT') {
                el.addEventListener('keyup', applyFilters);
            }
        });
    }

    function toggleFilterPanel() {
        state.isFilterPanelOpen = !state.isFilterPanelOpen;
        elements.filterPanel.classList.toggle('hidden', !state.isFilterPanelOpen);
        elements.filterToggleButton.classList.toggle('open', state.isFilterPanelOpen);
    }

    function applyFilters() {
        state.activeFilters = {
            nationality: elements.nationalityFilter.value,
            minTenure: parseFloat(elements.tenureFilter.value),
            hasPrizes: elements.prizeFilter.value,
            coachName: elements.nameFilter.value.toLowerCase()
        };
        renderHeatmap();
    }

    function checkFilters(coachInfo, club, season) {
        const { nationality, minTenure, hasPrizes, coachName } = state.activeFilters;

        if (nationality && coachInfo.nationality !== nationality) return true;
        if (minTenure && (coachInfo.tenureInYears || 0) < minTenure) return true;
        if (hasPrizes === 'yes' && (!coachInfo.prizes || coachInfo.prizes.length === 0)) return true;
        if (hasPrizes === 'no' && coachInfo.prizes && coachInfo.prizes.length > 0) return true;
        if (coachName && !coachInfo.coachName.toLowerCase().includes(coachName)) return true;

        return false;
    }

    function resetFilters() {
        elements.nationalityFilter.value = "";
        elements.tenureFilter.value = "";
        elements.prizeFilter.value = "";
        elements.nameFilter.value = "";
        state.activeFilters = {};
        renderHeatmap();
    }

    function populateNationalityFilter() {
        if (!state.currentCountry) return;
        const nationalities = new Set();
        Object.values(state.allData[state.currentCountry]).forEach(club => {
            Object.values(club.seasons).forEach(season => {
                if (season.nationality) nationalities.add(season.nationality);
            });
        });
        const sortedNations = Array.from(nationalities).sort();
        elements.nationalityFilter.innerHTML = '<option value="">All Nationalities</option>';
        sortedNations.forEach(nat => {
            const option = document.createElement('option');
            option.value = nat;
            option.textContent = nat;
            elements.nationalityFilter.appendChild(option);
        });
    }

    // --- UTILS ---
    function getFlagUrl(nationality) {
        // This is a placeholder. In a real app, you'd map nationalities to country codes.
        // For now, it might fail for many, but it's a start.
        const countryCodeMap = {
            "Spanish": "es", "English": "gb", "Italian": "it", "German": "de", "French": "fr",
            "Dutch": "nl", "Portuguese": "pt", "Argentine": "ar", "Scottish": "gb-sct", "Welsh": "gb-wls",
            "Northern Irish": "gb-nir", "Irish": "ie", "Brazilian": "br", "Swedish": "se",
             "Norwegian": "no", "Danish": "dk", "Chilean": "cl", "Uruguayan": "uy", "Mexican": "mx",
            "American": "us", "Swiss": "ch", "Austrian": "at", "Belgian": "be", "Croatian": "hr"
            // Add more mappings as needed
        };
        const code = countryCodeMap[nationality] || "xx"; // xx for unknown
        return `https://flagcdn.com/w20/${code}.png`;
    }

    function getPrizeEmoji(prize) {
        if (prize.toLowerCase().includes('league') || prize.toLowerCase().includes('division')) return '🏆';
        if (prize.toLowerCase().includes('cup')) return '🎟️'; // A ticket for a cup final
        if (prize.toLowerCase().includes('champions')) return '⭐';
        if (prize.toLowerCase().includes('europa')) return '🇪🇺';
        return '🏅'; // Generic medal
    }
    
    function setupEventListeners() {
        setupFilterListeners();
        
        elements.advancedNav.addEventListener('click', (e) => {
            if (e.target.classList.contains('advanced-nav-btn')) {
                const mode = e.target.dataset.mode;
                if (mode === 'default') state.careerCoach = null;
                setActiveMode(mode);
            }
        });

        elements.shareButton.addEventListener('click', () => {
            const url = window.location.href;
            navigator.clipboard.writeText(url).then(() => {
                const originalText = elements.shareButton.innerHTML;
                elements.shareButton.innerHTML = `<span>✔️</span> Copied!`;
                elements.shareButton.classList.add('clicked');
                setTimeout(() => {
                    elements.shareButton.innerHTML = originalText;
                    elements.shareButton.classList.remove('clicked');
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy: ', err);
            });
        });

        if(elements.mobileOverlayClose) {
            elements.mobileOverlayClose.addEventListener('click', () => {
                elements.mobileOverlay.classList.add('mobile-overlay-hidden');
            });
        }
        
        window.addEventListener('scroll', setHeaderStyle);

    }

    function checkMobile() {
        if (window.innerWidth <= 768) {
            elements.mobileOverlay.classList.remove('mobile-overlay-hidden');
        }
    }
    
    function setHeaderStyle() {
        if (window.scrollY > 20) {
            elements.siteHeader.classList.remove('site-header-home');
        } else {
            elements.siteHeader.classList.add('site-header-home');
        }
    }


    // --- KICK OFF ---
    initializeApp();
});
