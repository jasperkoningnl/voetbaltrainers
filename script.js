// Versie van dit script
console.log("Script versie: 1.8 - X-as en Legenda Fix");

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
    drawLegend(); // Roep de nieuwe legenda-functie aan
}).catch(function(error) {
    console.error("Fout bij het laden van engeland.csv:", error);
});


function drawHeatmap(data) {
    const margin = {top: 20, right: 30, bottom: 50, left: 150};
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

    // --- HERSTELDE X-AS LOGICA ---
    // Selecteer elke 5e seizoen voor een tick, plus de allerlaatste
    const tickValues = seizoenen.filter((d, i) => i % 5 === 0 || i === seizoenen.length - 1);
    const xAxis = d3.axisBottom(x).tickValues(tickValues).tickSizeOuter(0);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0, ${height})`).call(xAxis)
       .selectAll("text").style("text-anchor", "middle"); // Labels recht onder de ticks

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
          if (d.Landstitel === 'Y') prijzen.push({color: '#C0C0C0'}); // Zilver
          if (d.Nationale_Beker === 'Y') prijzen.push({color: '#CD7F32'}); // Brons
          if (d.Europese_Prijs === 'Y') prijzen.push({color: '#FFD700'}); // Goud
          
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

    const svg = d3.select("#legend-container").append("svg")
        .attr("width", "100%")
        .attr("height", 60);

    const legendGroup = svg.append("g").attr("transform", "translate(20, 20)");
    
    let colorOffset = 0;
    // Legenda voor kleuren
    legendData.forEach(d => {
        const group = legendGroup.append("g").attr("transform", `translate(${colorOffset}, 0)`);
        
        group.append("rect")
            .attr("width", 20)
            .attr("height", 20)
            .attr("fill", d.color);

        group.append("text")
            .attr("x", 25)
            .attr("y", 15)
            .text(d.label)
            .style("font-size", "12px")
            .attr("fill", "#333");
            
        colorOffset += (d.label.length * 6 + 45); // Dynamische breedte
    });

    // Legenda voor prijzen
    const prizeGroup = legendGroup.append("g").attr("transform", `translate(${colorOffset + 30}, 0)`);
    const iconPath = "M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z";
    
    let prizeOffset = 0;
    prizeData.forEach(d => {
        const group = prizeGroup.append("g").attr("transform", `translate(${prizeOffset}, 0)`);
        
        group.append("path")
            .attr("d", iconPath)
            .attr("transform", "translate(0, 2) scale(1)")
            .attr("fill", d.color)
            .attr("stroke", "#222").attr("stroke-width", 0.5);

        group.append("text")
            .attr("x", 25)
            .attr("y", 15)
            .text(d.label)
            .style("font-size", "12px")
            .attr("fill", "#333");
            
        prizeOffset += (d.label.length * 6 + 50); // Dynamische breedte
    });
}
