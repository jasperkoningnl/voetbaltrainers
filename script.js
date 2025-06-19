// Versie van dit script
console.log("Script versie: 2.4 - Tooltip Debugging");

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
    const margin = {top: 20, right: 30, bottom: 80, left: 220};
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
    const logoData = clubs.map(club => {
        const entry = data.find(d => d.Club === club);
        return { Club: club, Logo_URL: entry ? entry.Logo_URL : '' };
    });

    const x = d3.scaleBand().range([0, width]).domain(seizoenen).padding(0);
    const y = d3.scaleBand().range([height, 0]).domain(clubs).padding(0.1);

    const tickValues = seizoenen.filter((d, i) => i % 5 === 0 || i === seizoenen.length - 1);
    const xAxis = d3.axisBottom(x).tickValues(tickValues).tickSizeOuter(0);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0, ${height})`).call(xAxis)
       .selectAll("text")
         .style("text-anchor", "end")
         .attr("dx", "-.8em")
         .attr("dy", "-.5em")
         .attr("transform", "rotate(-90)");

    const yAxisGroup = svg.append("g").attr("class", "axis y-axis");
    const yAxisTicks = yAxisGroup.selectAll(".tick").data(logoData).enter().append("g")
        .attr("class", "tick")
        .attr("transform", d => `translate(0, ${y(d.Club) + y.bandwidth() / 2})`);

    yAxisTicks.append("rect")
        .attr("x", -margin.left + 30).attr("y", -y.bandwidth()/2)
        .attr("width", 180).attr("height", y.bandwidth())
        .attr("fill", "#f8f9fa").attr("rx", 4);

    yAxisTicks.append("image")
        .attr("xlink:href", d => d.Logo_URL)
        .attr("x", -margin.left + 40).attr("y", -15)
        .attr("width", 30).attr("height", 30);
    
    yAxisTicks.append("text")
        .attr("x", -margin.left + 85).attr("dy", ".32em")
        .style("text-anchor", "start").text(d => d.Club);

    const getColor = function(d) {
        if (d.stintLength === 1) return "#ff3333";
        if (d.stintLength > 1) {
            if (d.Seizoen_Nummer_Coach === 1) return "#99ff99";
            if (d.Seizoen_Nummer_Coach === 2) return "#66cc66";
            if (d.Seizoen_Nummer_Coach <= 5) return "#339933";
            if (d.Seizoen_Nummer_Coach <= 10) return "#006600";
            return "#003300";
        }
    };
    
    // --- TOOLTIP LOGICA (DEBUGGING-VERSIE) ---
    const tooltip = d3.select("#tooltip");

    const mouseover = function(event, d) {
        tooltip.transition().duration(200).style("opacity", 1);
        // We verplaatsen de tooltip hier al, zodat hij niet in de weg zit
        tooltip.style("left", (event.pageX + 15) + "px")
               .style("top", (event.pageY - 28) + "px");
    };

    const mousemove = function(event, d) {
        // EXTREEM SIMPELE VERSIE OM TE TESTEN: Toon alleen de naam van de coach
        tooltip.html(d.Coach)
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 28) + "px");
    };

    const mouseleave = function(event, d) {
        tooltip.transition().duration(500).style("opacity", 0);
    };

    svg.selectAll(".bar").data(data).enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.Seizoen))
        .attr("y", d => y(d.Club))
        .attr("width", x.bandwidth() + 1)
        .attr("height", y.bandwidth())
        .style("fill", d => getColor(d))
        .attr("shape-rendering", "crispEdges")
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave);

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
          if (d.Europese_Prijs === 'Y') prijzen.push({color: '#FFD700'});
          if (d.Landstitel === 'Y') prijzen.push({color: '#C0C0C0'});
          if (d.Nationale_Beker === 'Y') prijzen.push({color: '#CD7F32'});
          
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

function drawLegend() {
    const legendData = [
        { color: "#ff3333", label: "1 Season" },
        { color: "#99ff99", label: "Year 1" },
        { color: "#66cc66", label: "Year 2" },
        { color: "#339933", label: "Years 3-5" },
        { color: "#006600", label: "Years 6-10" },
        { color: "#003300", label: "Years 11+" }
    ];
    
    const prizeData = [
        { color: '#FFD700', label: 'European Trophy' },
        { color: '#C0C0C0', label: 'National Title' },
        { color: '#CD7F32', label: 'National Cup' }
    ];

    const svgNode = d3.select("#legend-container").append("svg")
        .attr("width", "100%")
        .attr("height", 50);

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
            currentOffset += itemGroup.node().getBBox().width + 30;
        });
    }

    drawItem(legendGroup, legendData, false);
    currentOffset += 20;
    const iconPath = "M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z";
    drawItem(legendGroup, prizeData.map(d => ({...d, path: iconPath, fill: d.color})), true);

    const containerWidth = d3.select("#legend-container").node().getBoundingClientRect().width;
    const legendWidth = legendGroup.node().getBBox().width;
    const xOffset = (containerWidth - legendWidth) / 2;
    legendGroup.attr("transform", `translate(${xOffset}, 20)`);
}
