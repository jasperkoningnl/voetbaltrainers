// Script Versie: 10.0 - Refactored for Performance using D3 Enter/Update/Exit pattern
console.log("Script versie: 10.0 geladen.");

import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const infoPane = d3.select("#info-pane");
const heatmapContainer = d3.select("#heatmap-container");
const tabsContainer = d3.select("#country-tabs-container");
const legendContainer = d3.select("#legend-container");

let allData = [];
let allSeasons = [];
let visualizationInitialized = false;
let selectedTenureId = null;

// --- Data Loading & Processing ---

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
            if (!coachInfo) {
                // console.warn(`Geen coach gevonden voor coachId: ${seizoenData.coachId} in seizoen`, seizoenData);
                return null; // Sla seizoenen zonder geldige coach over
            }
            const { naam = 'Unknown Coach', nationaliteit = 'Unknown', nat_code = '', foto_url = '' } = coachInfo;
            return { ...seizoenData, Coach: naam, nationaliteit, nat_code, foto_url };
        }).filter(d => d && d.land && d.club && d.seizoen); // Filter ongeldige data uit
        
        console.log(`Data succesvol geladen: ${joinedData.length} documenten.`);
        return joinedData;
    } catch (error) {
        console.error("Fout bij het laden van data:", error);
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
            // Unieke ID voor een aanstelling (tenure)
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
        const eeuw = Math.floor(parseInt(startDeel) / 100) * 100;
        const eindJaar = (parseInt(eindDeel) < parseInt(startDeel.substring(2,4))) ? eeuw + 100 + parseInt(eindDeel) : eeuw + parseInt(eindDeel);

        p.seizoenen.forEach(s => {
            s.stintLength = p.seizoenen.length;
            s.tenureId = p.id;
            s.tenureStartYear = startJaar;
            s.tenureEndYear = eindJaar.toString();
        });
    });
    return data;
}

// --- Visualization ---

const margin = {top: 20, right: 30, bottom: 80, left: 220};
let width, svg, g;

const x = d3.scaleBand().padding(0);
const y = d3.scaleBand().padding(0.1);

const getColor = d3.scaleThreshold()
    .domain([1, 2, 3, 5, 7, 10])
    .range(["#ccc", "#ff0033", "#ccffcc", "#99ff99", "#66cc66", "#00ff00", "#006600"]);


function initializeVisualization() {
    width = parseInt(d3.select("#heatmap-container").style("width")) - margin.left - margin.right;
    
    svg = heatmapContainer.append("svg")
        .attr("width", '100%')
        .attr("height", 500) // Start height
        .attr("viewBox", `0 0 ${width + margin.left + margin.right} 500`);

    g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);
    
    g.append("g").attr("class", "axis x-axis");
    g.append("g").attr("class", "axis y-axis");
    
    g.append("g").attr("class", "bars-group");
    g.append("g").attr("class", "season-dividers-group");
    g.append("g").attr("class", "coach-dividers-group");
    g.append("g").attr("class", "prizes-group");

    // Click on background to deselect
    svg.on('click', () => {
        if (selectedTenureId) {
            selectedTenureId = null;
            g.selectAll(".bar, .coach-divider, .season-divider, .prize-group").classed("is-dimmed is-highlighted", false);
            setInfoPaneDefault();
        }
    });
    
    visualizationInitialized = true;
    drawLegend();
}

function updateVisualization(country) {
    console.log(`Updating for: ${country}`);
    tabsContainer.selectAll(".tab").classed("active", function() {
        return d3.select(this).attr("data-country") === country;
    });

    let filteredData = allData.filter(d => d.land === country);
    
    if (filteredData.length === 0) {
        heatmapContainer.html(`<p class="error">No data found for ${country}.</p>`);
        return;
    }
    
    let processedData = prepareData(filteredData);
    
    const clubs = [...new Set(processedData.map(d => d.club))].sort(d3.ascending);
    const seasons = [...new Set(processedData.map(d => d.seizoen))].sort(d3.ascending);
    
    // Update scales
    x.domain(seasons).range([0, width]);
    y.domain(clubs).range([0, clubs.length * 50]);
    
    // Adjust SVG height
    const newHeight = clubs.length * 50 + margin.top + margin.bottom;
    svg.attr("height", newHeight)
       .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${newHeight}`);
    
    // --- Update Axes ---
    const tickValues = seasons.filter((d, i) => i % 5 === 0 || i === seasons.length - 1);
    g.select(".x-axis")
        .attr("transform", `translate(0, ${clubs.length * 50})`)
        .transition().duration(500)
        .call(d3.axisBottom(x).tickValues(tickValues).tickSizeOuter(0))
        .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-.8em").attr("dy", "-.5em")
        .attr("transform", "rotate(-90)");

    g.select(".y-axis").call(d3.axisLeft(y).tickSize(0)).select(".domain").remove();
    g.select(".y-axis").selectAll("text").remove(); // Remove old text labels

    const logoData = clubs.map(club => ({
        Club: club,
        Logo_URL: (processedData.find(d => d.club === club) || {}).logo_url || ''
    }));

    const yAxisTicks = g.select(".y-axis").selectAll(".tick")
        .data(logoData, d => d.Club)
        .join("g")
        .attr("transform", d => `translate(0, ${y(d.Club) + y.bandwidth() / 2})`);

    yAxisTicks.selectAll("rect").data(d => [d]).join("rect")
      .attr("x", -margin.left + 30).attr("y", -y.bandwidth()/2)
      .attr("width", 180).attr("height", y.bandwidth())
      .attr("fill", "#f8f9fa").attr("rx", 4);
      
    yAxisTicks.selectAll("image").data(d => [d]).join("image")
      .attr("xlink:href", d => d.Logo_URL)
      .attr("x", -margin.left + 40).attr("y", -15)
      .attr("width", 30).attr("height", 30);
      
    yAxisTicks.selectAll("text").data(d => [d]).join("text")
      .attr("x", -margin.left + 85).attr("dy", ".32em")
      .style("text-anchor", "start").text(d => d.Club);


    // --- Update Bars (the core of the update) ---
    const bars = g.select(".bars-group").selectAll(".bar")
        .data(processedData, d => `${d.club}-${d.seizoen}`);

    bars.exit().transition().duration(500).attr("height", 0).remove();

    bars.enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.seizoen))
        .attr("y", d => y(d.club) + y.bandwidth()) // Start from bottom for nice transition
        .attr("width", x.bandwidth() + 1)
        .attr("height", 0)
        .merge(bars)
        .on("click", handleMouseClick)
        .on("mouseover", handleMouseOver)
        .on("mouseleave", handleMouseLeave)
        .transition().duration(750)
        .attr("x", d => x(d.seizoen))
        .attr("y", d => y(d.club))
        .attr("height", y.bandwidth())
        .style("fill", d => getColor(d.stintLength));
        
    // --- Update Dividers ---
    updateDividers(g.select(".season-dividers-group"), "season-divider", processedData.filter(d => d.seizoen.substring(0, 4) !== d.tenureStartYear), processedData);
    updateDividers(g.select(".coach-dividers-group"), "coach-divider", processedData.filter(d => {
        const prevSeason = seasons[seasons.indexOf(d.seizoen) - 1];
        if (!prevSeason) return false;
        const prevData = processedData.find(item => item.club === d.club && item.seizoen === prevSeason);
        return !prevData || prevData.tenureId !== d.tenureId;
    }), processedData);

    // --- Update Prizes ---
    const prizeData = processedData.filter(d => d.landstitel === 'Y' || d.nationale_beker === 'Y' || d.europese_prijs === 'Y');
    const prizeGroups = g.select(".prizes-group").selectAll(".prize-group")
      .data(prizeData, d => `${d.club}-${d.seizoen}-prize`);

    prizeGroups.exit().transition().duration(500).style("opacity", 0).remove();
    
    const prizeGroupsEnter = prizeGroups.enter().append("g")
      .attr("class", "prize-group")
      .style("opacity", 0);

    prizeGroupsEnter.merge(prizeGroups)
      .attr("transform", d => `translate(${x(d.seizoen) + x.bandwidth() / 2}, ${y(d.club) + y.bandwidth() / 2})`)
      .each(function(d) {
          d3.select(this).selectAll("*").remove(); // Clear existing icons before redraw
          const el = d3.select(this);
          const icons = { schild: "M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z" };
          const prijzen = [];
          if (d.europese_prijs === 'Y') prijzen.push('#FFD700');
          if (d.landstitel === 'Y') prijzen.push('#C0C0C0');
          if (d.nationale_beker === 'Y') prijzen.push('#CD7F32');
          const totalHeight = (prijzen.length - 1) * 12;
          prijzen.forEach((p, i) => {
              el.append("path").attr("d", icons.schild).attr("fill", p).attr("stroke", "#222")
                .attr("stroke-width", 0.5).attr("transform", `translate(-8, ${-totalHeight/2 + i*12 - 8}) scale(0.8)`);
          });
      })
      .transition().duration(750).style("opacity", 1);
}

function updateDividers(group, className, data, allProcessedData) {
    const dividers = group.selectAll(`.${className}`)
        .data(data, d => `${d.club}-${d.seizoen}`);

    dividers.exit().remove();

    dividers.enter().append("line")
        .attr("class", className)
        .merge(dividers)
        .transition().duration(750)
        .attr("x1", d => x(d.seizoen)).attr("y1", d => y(d.club))
        .attr("x2", d => x(d.seizoen)).attr("y2", d => y(d.club) + y.bandwidth());
}


// --- Event Handlers ---
function handleMouseClick(event, d) {
    event.stopPropagation();
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
        g.selectAll(".bar, .coach-divider, .season-divider, .prize-group").classed("is-dimmed", item => item.tenureId !== d.tenureId);
        updateInfoPane(d);
    }
}
function handleMouseLeave() {
    if (!selectedTenureId) {
        g.selectAll(".bar, .coach-divider, .season-divider, .prize-group").classed("is-dimmed", false);
        setInfoPaneDefault();
    }
}


// --- Info Pane & Legend ---
function setInfoPaneDefault() {
    infoPane.attr("class", "default-state").html('<p>Hover over a tenure or select a club to see details.</p>');
}

function updateInfoPane(d) {
    // ... This function remains the same as before ...
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

function drawLegend() {
    // ... This function remains the same as before ...
    legendContainer.html("");
    const legendData = [
        { color: "#ff0033", label: "1 Season" }, { color: "#ccffcc", label: "2 Seasons" },
        { color: "#99ff99", label: "3-4 Seasons" }, { color: "#66cc66", label: "5-6 Seasons" },
        { color: "#00ff00", label: "7-9 Seasons" }, { color: "#006600", label: "10+ Seasons" },
    ];
    const prizeData = [
        { color: '#FFD700', label: 'European Trophy' }, { color: '#C0C0C0', label: 'National Title' },
        { color: '#CD7F32', label: 'National Cup' }
    ];

    const svgNode = legendContainer.append("svg").attr("height", 50);
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
    const containerWidth = legendContainer.node().getBoundingClientRect().width;
    mainGroup.attr("transform", `translate(${(containerWidth - totalWidth) / 2}, 20)`);
    svgNode.attr("width", containerWidth);
}


// --- Main Application Flow ---

function setupTabs(countries) {
    tabsContainer.html("");
    countries.forEach(country => {
        tabsContainer.append("button")
            .attr("class", "tab")
            .attr("data-country", country)
            .text(country)
            .on("click", function() {
                updateVisualization(country);
            });
    });
}

async function main() {
    allData = await loadDataFromFirestore();
    if (!allData || allData.length === 0) {
        tabsContainer.html(`<p class="error">Could not load any data.</p>`);
        return;
    }

    allSeasons = [...new Set(allData.map(d => d.seizoen))].sort(d3.ascending);
    
    const countries = [...new Set(allData.map(d => d.land))].sort();
    
    if (countries.length > 0) {
        setupTabs(countries);
        initializeVisualization();
        updateVisualization(countries[0]); // Start with the first country
    } else {
        heatmapContainer.html(`<p class="error">No countries found in the data.</p>`);
    }

    window.addEventListener('resize', () => {
        const activeCountry = tabsContainer.select(".tab.active").attr("data-country");
        if (activeCountry && visualizationInitialized) {
            width = parseInt(d3.select("#heatmap-container").style("width")) - margin.left - margin.right;
            svg.attr("viewBox", `0 0 ${width + margin.left + margin.right} ${svg.attr("height")}`);
            updateVisualization(activeCountry);
        }
    });
}

main();
