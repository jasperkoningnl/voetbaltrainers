// Script Versie: 16.0 - Bugfixes voor clubnamen en hover-effect. Design revisies doorgevoerd.
console.log("Script versie: 16.0 geladen.");

// --- Globale Variabelen ---
const infoPane = d3.select("#info-pane");
const heatmapContainer = d3.select("#heatmap-container");
const legendContainer = d3.select("#legend-container");
let selectedTenureId = null;
let currentResizeObserver = null;

// --- Main Application Flow ---

/**
 * Initialiseert de applicatie, stelt navigatie-eventlisteners in en laadt het standaardland.
 */
function initApp() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const country = e.target.dataset.country;
            if (!e.target.classList.contains('active')) {
                loadCountry(country);
            }
        });
    });
    const countriesToLoad = Array.from(navLinks).map(link => link.dataset.country);
    
    if (countriesToLoad.length > 0) {
        loadCountry(countriesToLoad[0]);
    }
}

/**
 * Laadt en toont de visualisatie voor een specifiek land.
 * @param {string} country - De naam van het land om te laden (bv. "England").
 */
async function loadCountry(country) {
    console.log(`Bezig met laden van visualisatie voor: ${country}`);

    if (currentResizeObserver) {
        currentResizeObserver.disconnect();
    }

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.country === country) {
            link.classList.add('active');
        }
    });

    heatmapContainer.html('<p class="loading-text">Loading data...</p>');
    legendContainer.html("");
    setInfoPaneDefault();
    
    const data = await loadDataFromFirestore(country);
    if (!data || data.length === 0) {
        heatmapContainer.html(`<p class="error">No data found for ${country}. Please check the database and data spelling.</p>`);
        return;
    }
    
    heatmapContainer.html('');
    const processedData = prepareData(data);
    const updateFunction = drawVisualization(processedData);

    currentResizeObserver = new ResizeObserver(entries => {
        if (entries[0].contentRect.width > 0) {
            updateFunction();
        }
    });
    currentResizeObserver.observe(heatmapContainer.node());
}


// --- Data Loading & Processing ---

/**
 * Haalt data op uit Firestore voor een specifiek land en koppelt deze.
 * @param {string} country - Het land waarvoor data opgehaald moet worden.
 * @returns {Promise<Array>} - Een array met gecombineerde data.
 */
async function loadDataFromFirestore(country) {
    if (!window.db || !window.firestore) {
        console.error("Firestore database or functions are not initialized.");
        return [];
    }
    try {
        const { query, collection, where, getDocs } = window.firestore;

        const coachesCol = collection(window.db, "coaches");
        const seizoenenCol = collection(window.db, "seizoenen");
        const clubsCol = collection(window.db, "clubs");

        const seizoenenQuery = query(seizoenenCol, where("land", "==", country));

        const [coachesSnapshot, seizoenenSnapshot, clubsSnapshot] = await Promise.all([
            getDocs(coachesCol),
            getDocs(seizoenenQuery),
            getDocs(clubsCol)
        ]);
        
        const coachesMap = new Map(coachesSnapshot.docs.map(doc => [doc.id, doc.data()]));
        const clubsMap = new Map(clubsSnapshot.docs.map(doc => [doc.id, doc.data()]));
        
        const joinedData = seizoenenSnapshot.docs
            .map(doc => {
                const seizoenData = doc.data();
                const coachInfo = coachesMap.get(seizoenData.coachId);
                const clubInfo = clubsMap.get(seizoenData.club); // seizoenData.club is de ID, bv "psg"

                if (!coachInfo || !clubInfo) {
                    console.warn("Could not find full info for:", seizoenData);
                    return null;
                };

                const { naam = 'Unknown', nationaliteit = 'Unknown', nat_code = '', foto_url = '' } = coachInfo;
                
                // BUGFIX: Gebruik de naam uit de clubInfo, niet de code uit seizoenData.
                return { 
                    ...seizoenData, 
                    club: clubInfo.naam || seizoenData.club, // Vervang code door volledige naam
                    Coach: naam, 
                    nationaliteit, 
                    nat_code, 
                    foto_url,
                    logo_url: clubInfo.logo_url || ''
                };
            })
            .filter(d => d);
        
        console.log(`Data voor ${country} succesvol geladen: ${joinedData.length} documenten.`);
        return joinedData;
    } catch (error) {
        console.error("Fout bij het laden van data:", error);
        heatmapContainer.html(`<p class="error">An error occurred while loading the data from the database. See console for details.</p>`);
        return [];
    }
}


/**
 * Bereidt de onbewerkte data voor op visualisatie door seizoenen te groeperen in periodes.
 * @param {Array} data - De array met seizoen-data.
 * @returns {Array} - De data met toegevoegde periode-informatie.
 */
function prepareData(data) {
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

        if (eindDeel.length === 4) {
            eindJaarNum = parseInt(eindDeel);
        } else {
            const eeuw = Math.floor(parseInt(startDeel) / 100) * 100;
            const startJaarKort = parseInt(startDeel.substring(2, 4));
            eindJaarNum = parseInt(eindDeel);
            if (eindJaarNum < startJaarKort) {
                eindJaarNum = eeuw + 100 + eindJaarNum;
            } else {
                eindJaarNum = eeuw + eindJaarNum;
            }
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

// --- Visualization ---

const margin = {top: 10, right: 20, bottom: 80, left: 220};
const x = d3.scaleBand().padding(0);
const y = d3.scaleBand().padding(0.15);

function drawVisualization(data) {
    const clubs = [...new Set(data.map(d => d.club))].sort(d3.ascending);
    const seasons = [...new Set(data.map(d => d.seizoen))].sort(d3.ascending);
    const height = clubs.length * 55;

    const svg = heatmapContainer.append("svg")
        .attr("width", '100%')
        .attr("height", height + margin.top + margin.bottom);

    const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);
    
    svg.on('click', () => {
        if (selectedTenureId) {
            selectedTenureId = null;
            g.selectAll(".bar, .coach-divider, .season-divider, .prize-group").classed("is-dimmed is-highlighted", false);
            setInfoPaneDefault();
        }
    });
    
    y.domain(clubs).range([0, height]);
    const getColor = d3.scaleThreshold()
        .domain([1, 2, 3, 5, 7, 10])
        .range(["#ccc", "#ff0033", "#ccffcc", "#99ff99", "#66cc66", "#00ff00", "#006600"]);


    const xAxisG = g.append("g").attr("class", "axis x-axis").attr("transform", `translate(0, ${height})`);
    const yAxisG = g.append("g").attr("class", "axis y-axis");

    const logoData = clubs.map(club => ({
        club: club,
        logo_url: (data.find(d => d.club === club) || {}).logo_url || ''
    }));
    
    const yAxisLabels = yAxisG.selectAll(".club-label")
      .data(logoData, d => d.club)
      .join("g")
      .attr("class", "club-label")
      .attr("transform", d => `translate(0, ${y(d.club)})`);

    yAxisLabels.append("rect")
        .attr("x", -margin.left + 20)
        .attr("y", 0)
        .attr("width", 190)
        .attr("height", y.bandwidth())
        .attr("fill", "#f8f9fa")
        .attr("rx", 6);

    yAxisLabels.append("image")
        .attr("xlink:href", d => d.logo_url)
        .attr("x", -margin.left + 30)
        .attr("y", y.bandwidth() / 2 - 16)
        .attr("width", 32)
        .attr("height", 32)
        .on("error", function() {
            d3.select(this).style("display", "none"); 
        });

    yAxisLabels.append("text")
        .attr("x", -margin.left + 75)
        .attr("y", y.bandwidth() / 2)
        .attr("dy", ".35em")
        .style("text-anchor", "start")
        .text(d => d.club);
    
    const barGroup = g.append("g").attr("class", "bars-group");
    const seasonDividerGroup = g.append("g").attr("class", "season-dividers-group");
    const coachDividerGroup = g.append("g").attr("class", "coach-dividers-group");
    const prizeGroup = g.append("g").attr("class", "prizes-group");
    
    function updateXAxis() {
        const containerNode = heatmapContainer.node();
        if (!containerNode) return;
        const width = containerNode.clientWidth - margin.left - margin.right;
        
        if (width <= 0) return;

        x.domain(seasons).range([0, width]);
        
        svg.attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);

        const tickValues = seasons.filter((d, i) => i % 5 === 0 || i === seasons.length - 1);
        xAxisG.call(d3.axisBottom(x).tickValues(tickValues).tickSizeOuter(0))
            .selectAll("text").style("text-anchor", "end").attr("dx", "-.8em").attr("dy", ".15em").attr("transform", "rotate(-65)");

        // BUGFIX: Trillen opgelost door +1 weg te halen bij de breedte.
        barGroup.selectAll(".bar").attr("x", d => x(d.seizoen)).attr("width", x.bandwidth()).attr("rx", 2);
        seasonDividerGroup.selectAll(".season-divider").attr("x1", d => x(d.seizoen)).attr("x2", d => x(d.seizoen));
        coachDividerGroup.selectAll(".coach-divider").attr("x1", d => x(d.seizoen)).attr("x2", d => x(d.seizoen));
        prizeGroup.selectAll(".prize-group").attr("transform", d => `translate(${x(d.seizoen) + x.bandwidth() / 2}, ${y(d.club) + y.bandwidth() / 2})`);
    }

    barGroup.selectAll(".bar").data(data).enter().append("rect")
        .attr("class", "bar")
        .attr("y", d => y(d.club)).attr("height", y.bandwidth())
        .style("fill", d => getColor(d.stintLength))
        .on("click", handleMouseClick)
        .on("mouseover", handleMouseOver)
        .on("mouseleave", handleMouseLeave);
    
    seasonDividerGroup.selectAll(".season-divider").data(data.filter(d => d.seizoen.substring(0, 4) !== d.tenureStartYear)).enter().append("line")
        .attr("class", "season-divider")
        .attr("y1", d => y(d.club)).attr("y2", d => y(d.club) + y.bandwidth());

    coachDividerGroup.selectAll(".coach-divider").data(data.filter(d => {
        const prevSeason = seasons[seasons.indexOf(d.seizoen) - 1];
        if (!prevSeason) return false;
        const prevData = data.find(item => item.club === d.club && item.seizoen === prevSeason);
        return !prevData || prevData.tenureId !== d.tenureId;
    })).enter().append("line")
        .attr("class", "coach-divider")
        .attr("y1", d => y(d.club)).attr("y2", d => y(d.club) + y.bandwidth());

    const prizeData = data.filter(d => d.landstitel === 'Y' || d.nationale_beker === 'Y' || d.europese_prijs === 'Y');
    const prizeGroups = prizeGroup.selectAll(".prize-group").data(prizeData).enter().append("g")
        .attr("class", "prize-group");
        
    prizeGroups.each(function(d) {
        const currentGroup = d3.select(this);
        const icons = { schild: "M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z" };
        const prijzen = [];
        if (d.europese_prijs === 'Y') prijzen.push('#FFD700');
        if (d.landstitel === 'Y') prijzen.push('#C0C0C0');
        if (d.nationale_beker === 'Y') prijzen.push('#CD7F32');
        const totalHeight = (prijzen.length - 1) * 12;
        prijzen.forEach((p, i) => {
            currentGroup.append("path").attr("d", icons.schild).attr("fill", p).attr("stroke", "#222")
                .attr("stroke-width", 0.5).attr("transform", `translate(-8, ${-totalHeight/2 + i*12 - 8}) scale(0.8)`);
        });
    });

    updateXAxis();
    drawLegend();
    
    return updateXAxis;
}

// --- Event Handlers & Info Pane/Legend ---
function handleMouseClick(event, d) {
    event.stopPropagation();
    const g = d3.select(this.closest("svg > g"));
    if (selectedTenureId === d.tenureId) {
        selectedTenureId = null;
        g.selectAll(".bar, .coach-divider, .season-divider, .prize-group").classed("is-dimmed is-highlighted", false);
        setInfoPaneDefault();
    } else {
        selectedTenureId = d.tenureId;
        g.selectAll(".bar, .coach-divider, .season-divider, .prize-group").classed("is-dimmed", item => item.tenureId !== d.tenureId);
        g.selectAll(".bar, .coach-divider, .season-divider, .prize-group").classed("is-highlighted", item => item.tenureId === d.tenureId);
        updateInfoPane(d);
    }
}
function handleMouseOver(event, d) {
    if (!selectedTenureId) {
        const g = d3.select(this.closest("svg > g"));
        g.selectAll(".bar, .coach-divider, .season-divider, .prize-group").classed("is-dimmed", item => item.tenureId !== d.tenureId);
        updateInfoPane(d);
    }
}
function handleMouseLeave() {
    if (!selectedTenureId) {
        const g = d3.select(this.closest("svg > g"));
        g.selectAll(".bar, .coach-divider, .season-divider, .prize-group").classed("is-dimmed", false);
        setInfoPaneDefault();
    }
}
function setInfoPaneDefault() { infoPane.attr("class", "default-state").html('<p>Hover over a tenure for details, or click to lock the selection.</p>'); }
function updateInfoPane(d) {
    const hasPhoto = d.foto_url && d.foto_url.trim() !== '';
    const flagApiUrl = d.nat_code ? `https://flagcdn.com/w40/${d.nat_code.toLowerCase()}.png` : '';
    const avatarIconPath = "M25 26.5 C20 26.5 15 29 15 34 V37 H35 V34 C35 29 30 26.5 25 26.5 Z M25 15 C21.1 15 18 18.1 18 22 C18 25.9 21.1 29 25 29 C28.9 29 32 25.9 32 22 C32 18.1 28.9 15 25 15 Z";
    let imageHtml = hasPhoto ? `<img src="${d.foto_url}" class="info-pane-img" onerror="this.onerror=null; this.outerHTML='<svg class=\\'info-pane-img\\' viewBox=\\'0 0 50 50\\'><path d=\\'${avatarIconPath}\\' fill=\\'#ccc\\'></path></svg>';">` : `<svg class="info-pane-img" viewBox="0 0 50 50"><path d="${avatarIconPath}" fill="#ccc"></path></svg>`;
    const tenureYears = d.tenureStartYear === d.tenureEndYear ? d.tenureStartYear : `${d.tenureStartYear} – ${d.tenureEndYear}`;
    
    // Aangepaste HTML structuur voor betere layout
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
    infoPane.attr("class", "details-state").html(content);
}

function drawLegend() {
    legendContainer.html("");
    const legendData = [
        { color: "#ff0033", label: "1 Season" }, { color: "#ccffcc", label: "2 Seasons" },
        { color: "#99ff99", label: "3-4 Seasons" }, { color: "#66cc66", label: "5-6 Seasons" },
        { color: "#00ff00", label: "7-9 Seasons" }, { color: "#006600", label: "10+ Seasons" }
    ];
    const prizeData = [
        { color: '#FFD700', label: 'European Trophy' }, 
        { color: '#C0C0C0', label: 'National Title' }, 
        { color: '#CD7F32', label: 'National Cup' }
    ];
    
    // Legenda terug naar compacte opzet
    const tenureGroup = legendContainer.append("div").attr("class", "legend-section");
    const prizeGroup = legendContainer.append("div").attr("class", "legend-section");

    tenureGroup.selectAll(".legend-item").data(legendData).join("div").attr("class", "legend-item")
        .html(d => `<div class="legend-swatch" style="background-color:${d.color};"></div><span>${d.label}</span>`);

    prizeGroup.selectAll(".legend-item").data(prizeData).join("div").attr("class", "legend-item")
        .html(d => `<svg class="legend-swatch" viewBox="0 0 18 17"><path d="M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z" fill="${d.color}" stroke="#444" stroke-width="0.5"></path></svg><span>${d.label}</span>`);
}

// --- Initialize App ---
document.addEventListener('DOMContentLoaded', initApp);
