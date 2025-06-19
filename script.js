// Versie van dit script
console.log("Script versie: 1.9 - Finale Vormgeving");

/**
 * Een helper-functie die de data groepeert in aaneengesloten periodes per coach.
 * Deze functie voegt ook de totale lengte van een periode ('stintLength') toe
 * aan elk individueel seizoen-datapunt.
 */
function voegPeriodeDataToe(data) {
    if (data.length === 0) return [];
    const periodes = [];
    data.sort((a, b) => d3.ascending(a.Club, b.Club) || d3.ascending(a.Seizoen, b.Seizoen));
    let huidigePeriode = { coach: data[0].Coach, club: data[0].Club, seizoenen: [data[0]] };
    for (let i = 1; i < data.length; i++) {
        if (data[i].Coach === huidigePeriode.coach && data[i].Club === huidigePeriode.club) {
            huidigePeriode.seizoenen.push(data[i]);
        } else {
            periodes.push(huidigePeriode);
            huidigePeriode = { coach: data[i].Coach, club: data[i].Club, seizoenen: [data[i]] };
        }
    }
    periodes.push(huidigePeriode);
    periodes.forEach(p => {
        const lengte = p.seizoenen.length;
        p.seizoenen.forEach(s => { s.stintLength = lengte; });
    });
    return data;
}

// Start het laadproces
d3.csv("engeland.csv").then(function(data) {
    data.forEach(function(d) {
        d.Seizoen_Nummer_Coach = +d.Seizoen_Nummer_Coach;
    });
    const verrijkteData = voegPeriodeDataToe(data);
    console.log("Data succesvol geladen en verrijkt:", verrijkteData);
    drawHeatmap(verrijkteData);
    drawLegend();
}).catch(function(error) {
    console.error("Fout bij het laden van engeland.csv:", error);
});


function drawHeatmap(data) {
    const margin = {top: 20, right: 30, bottom: 80, left: 150}; // Meer bottom margin voor verticale labels
    const width = 1400 - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;

    const svg = d3.select("#heatmap-container")
      .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const seizoenen = [...new Set(data.map(d => d.Seizoen))].sort();
    const clubs = [...new Set(data.map(d => d.Club))];

    const x = d3.scaleBand().range([0, width]).domain(seizoenen).padding(0);
    const y = d3.scaleBand().range([height, 0]).domain(clubs).padding(0.1);

    // --- AANGEPASTE X-AS MET VERTICALE LABELS ---
    const tickValues = seizoenen.filter((d, i) => i % 5 === 0 || i === seizoenen.length - 1);
    const xAxis = d3.axisBottom(x).tickValues(tickValues).tickSizeOuter(0);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0, ${height})`).call(xAxis)
       .selectAll("text")
         .style("text-anchor", "end")
         .attr("dx", "-.8em")
         .attr("dy", ".15em")
         .attr("transform", "rotate(-90)"); // Draai de labels 90 graden

    svg.append("g").attr("class", "axis").call(d3.axisLeft(y));

    const getColor = function(d) {
        if (d.stintLength === 1) return "#ff3333"; // Rood
        if (d.stintLength > 1) {
            if (d.Seizoen_Nummer_Coach === 1) return "#99ff99";
            if (d.Seizoen_Nummer_Coach === 2) return "#66cc66";
            if (d.Seizoen_Nummer_Coach <= 5) return "#339933";
            if (d.Seizoen_Nummer_Coach <= 10) return "#006600";
            return "#003300"; // 11+ jaar
        }
    };
    
    svg.selectAll(".bar").data(data).enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.Seizoen))
        .attr("y", d => y(d.Club))
        .attr("width", x.bandwidth() + 1)
        .attr("height", y.bandwidth())
        .style("fill", d => getColor(d));

    const icons = { schild: "M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z" };

    const coachChanges = data.filter(d => d.Seizoen_Nummer_Coach === 1 && d.Seizoen !== seizoenen[0]);
    svg.selectAll(".coach-divider").data(coachChanges).enter().append("line")
        .attr("class", "coach-divider")
        .attr("x1", d => x(d.Seizoen))
        .attr("y1", d => y(d.Club))
        .attr("x2", d => x(d.Seizoen))
        .attr("y2", d => y(d.Club) + y.bandwidth());

    svg.selectAll(".prize-group")
      .data(data.filter(d => d.Landstitel === 'Y' || d.Nationale_Beker === 'Y' || d.Europese_Prijs === 'Y'))
      .enter().append("g")
      .attr("class", "prize-group")
      .attr("transform", d => `translate(${x(d.Seizoen) + x.bandwidth() / 2}, ${y(d.Club) + y.bandwidth() / 2})`)
      .each(function(d) {
          const el = d3.select(this);
          const prijzen = [];
          if (d.Europese_Prijs === 'Y') prijzen.push({color: '#FFD700'}); // Goud eerst
          if (d.Landstitel === 'Y') prijzen.push({color: '#C0C0C0'}); // Zilver
          if (d.Nationale_Beker === 'Y') prijzen.push({color: '#CD7F32'}); // Brons
          
          const totalHeight = (prijzen.length - 1) * 12;
          prijzen.forEach((p, i) => {
               el.append("path")
                 .attr("d", icons.schild)
                 .attr("fill", p.color)
                 .attr("stroke", "#222").attr("stroke-width", 0.5)
                 .attr("transform", `translate(-8, ${-totalHeight/2 + i*12 - 8}) scale(0.8)`);
          });
      });
}

/**
 * Tekent de legenda onder de heatmap.
 */
function drawLegend() {
    const legendData = [
        { color: "#ff3333", label: "1 Seizoen" },
        { color: "#99ff99", label: "Jaar 1" },
        { color: "#66cc66", label: "Jaar 2" },
        { color: "#339933", label: "Jaar 3-5" },
        { color: "#006600", label: "Jaar 6-10" },
        { color: "#003300", label: "Jaar 11+" }
    ];
    
    const prizeData = [
        { color: '#FFD700', label: 'Europese Prijs' },
        { color: '#C0C0C0', label: 'Nationale Titel' },
        { color: '#CD7F32', label: 'Nationale Beker' }
    ];

    const svgNode = d3.select("#legend-container").append("svg")
        .attr("width", "100%")
        .attr("height", 50);

    const legendGroup = svgNode.append("g");
    
    let currentOffset = 0;
    
    // Functie om een legenda-item te tekenen
    function drawItem(group, data, offset) {
        data.forEach(d => {
            const itemGroup = group.append("g").attr("transform", `translate(${offset}, 0)`);
            if (d.color.startsWith('#')) { // Kleurblokje
                itemGroup.append("rect").attr("width", 20).attr("height", 20).attr("fill", d.color);
            } else { // Prijs-icoon
                itemGroup.append("path").attr("d", d.color).attr("transform", "scale(1.2)").attr("fill", d.fill).attr("stroke", "#222").attr("stroke-width", 0.5);
            }
            itemGroup.append("text").attr("x", 25).attr("y", 15).text(d.label).style("font-size", "12px").attr("fill", "#333");
            offset += itemGroup.node().getBBox().width + 25; // Update offset
        });
        return offset;
    }

    const prizeIcons = { schild: "M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z" };
    const prizeLegendItems = prizeData.map(d => ({ color: prizeIcons.schild, fill: d.color, label: d.label }));

    let colorsWidth = drawItem(legendGroup, legendData, currentOffset);
    drawItem(legendGroup, prizeLegendItems, colorsWidth + 40);

    // Nu de hele legenda centreren
    const containerWidth = d3.select("#legend-container").node().getBoundingClientRect().width;
    const legendWidth = legendGroup.node().getBBox().width;
    const xOffset = (containerWidth - legendWidth) / 2;
    legendGroup.attr("transform", `translate(${xOffset}, 20)`);
}
