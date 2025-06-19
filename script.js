// Versie van dit script
console.log("Script versie: 1.4 - Haarlijnen, Nieuwe Kleuren & SVG Iconen");

/**
 * Een helper-functie die de data groepeert in aaneengesloten periodes per coach.
 * Deze functie voegt ook de totale lengte van een periode ('stintLength') toe
 * aan elk individueel seizoen-datapunt.
 * @param {Array} data De platte data-array uit de CSV.
 * @returns {Array} De originele data-array, verrijkt met 'stintLength'.
 */
function voegPeriodeDataToe(data) {
    if (data.length === 0) return [];

    const periodes = [];
    // Sorteer data om zeker te zijn van de volgorde per club
    data.sort((a, b) => d3.ascending(a.Club, b.Club) || d3.ascending(a.Seizoen, b.Seizoen));

    let huidigePeriode = {
        coach: data[0].Coach,
        club: data[0].Club,
        seizoenen: [data[0]]
    };

    for (let i = 1; i < data.length; i++) {
        // Als coach en club hetzelfde zijn, voeg toe aan de huidige periode
        if (data[i].Coach === huidigePeriode.coach && data[i].Club === huidigePeriode.club) {
            huidigePeriode.seizoenen.push(data[i]);
        } else {
            // Anders, sla de vorige periode op en start een nieuwe
            periodes.push(huidigePeriode);
            huidigePeriode = {
                coach: data[i].Coach,
                club: data[i].Club,
                seizoenen: [data[i]]
            };
        }
    }
    periodes.push(huidigePeriode); // Voeg de allerlaatste periode toe

    // Voeg de totale lengte van de periode toe aan elk datapunt
    periodes.forEach(p => {
        const lengte = p.seizoenen.length;
        p.seizoenen.forEach(s => {
            s.stintLength = lengte;
        });
    });

    return data;
}


// Start het laadproces
d3.csv("engeland.csv").then(function(data) {
    
    // Converteer data types
    data.forEach(function(d) {
        d.Seizoen_Nummer_Coach = +d.Seizoen_Nummer_Coach;
    });

    // Verrijk de data met de periode-informatie
    const verrijkteData = voegPeriodeDataToe(data);
    
    console.log("Data succesvol geladen en verrijkt:", verrijkteData);
    
    // Teken de visualisatie met de verrijkte data
    drawHeatmap(verrijkteData);

}).catch(function(error) {
    console.error("Fout bij het laden van engeland.csv:", error);
});


function drawHeatmap(data) {
    const margin = {top: 50, right: 30, bottom: 100, left: 150};
    const width = 1400 - margin.left - margin.right;
    const height = 600 - margin.top - margin.bottom;

    const svg = d3.select("#heatmap-container")
      .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const seizoenen = [...new Set(data.map(d => d.Seizoen))].sort();
    const clubs = [...new Set(data.map(d => d.Club))];

    const x = d3.scaleBand().range([0, width]).domain(seizoenen).padding(0); // Padding op 0 voor aaneengesloten blokken
    const y = d3.scaleBand().range([height, 0]).domain(clubs).padding(0.1);

    // Teken de assen
    svg.append("g").attr("class", "axis").attr("transform", `translate(0, ${height})`).call(d3.axisBottom(x))
      .selectAll("text").attr("transform", "translate(-10,0)rotate(-45)").style("text-anchor", "end");
    svg.append("g").attr("class", "axis").call(d3.axisLeft(y));

    // Jouw nieuwe, slimme kleurlogica
    const getColor = function(d) {
        if (d.stintLength === 1) return "#ff3333"; // Rood
        if (d.stintLength > 1) {
            if (d.Seizoen_Nummer_Coach === 1) return "#99ff99"; // Lichtst groen
            if (d.Seizoen_Nummer_Coach === 2) return "#66cc66"; // Lichtgroen
            if (d.Seizoen_Nummer_Coach <= 5) return "#339933"; // Mediumgroen
            if (d.Seizoen_Nummer_Coach <= 10) return "#006600"; // Donkergroen
            return "#003300"; // Donkerst groen (11+ jaar)
        }
    };
    
    // Teken de gekleurde blokjes per seizoen
    svg.selectAll(".bar")
      .data(data)
      .enter()
      .append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.Seizoen))
        .attr("y", d => y(d.Club))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .style("fill", d => getColor(d));

    // Definieer de SVG-paden voor de iconen
    const icons = {
        schild: "M1.25 2.75V10C1.25 14.5 7 17.5 7 17.5S12.75 14.5 12.75 10V2.75L7 1.25L1.25 2.75Z",
        bekerZilver: "M4 1.5V3.5C4 4.5 6 4.5 6 4.5V11.5C6 12.5 4 13.5 4 13.5H10C10 13.5 8 12.5 8 11.5V4.5C8 4.5 10 4.5 10 3.5V1.5H4Z M5.5 14.5H8.5V16.5H5.5V14.5Z",
        bekerGoud: "M2.5 1.5H11.5V3.5C11.5 4.5 10 5.5 8.5 5.5H5.5C4 5.5 2.5 4.5 2.5 3.5V1.5Z M1 4.5C1 6.5 2.5 7.5 2.5 7.5V10.5C2.5 10.5 1 11.5 1 13.5H2.5 M13 4.5C13 6.5 11.5 7.5 11.5 7.5V10.5C11.5 10.5 13 11.5 13 13.5H11.5 M4.5 14.5H9.5V16.5H4.5V14.5Z"
    };

    // Teken de haarlijnen TUSSEN coachwissels
    const coachChanges = data.filter(d => d.Seizoen_Nummer_Coach === 1 && d.Seizoen !== seizoenen[0]);
    svg.selectAll(".coach-divider")
        .data(coachChanges)
        .enter()
        .append("line")
        .attr("class", "coach-divider")
        .attr("x1", d => x(d.Seizoen))
        .attr("y1", d => y(d.Club))
        .attr("x2", d => x(d.Seizoen))
        .attr("y2", d => y(d.Club) + y.bandwidth());

    // Teken de prijzen, netjes gestapeld
    svg.selectAll(".prize-group")
      .data(data.filter(d => d.Landstitel === 'Y' || d.Nationale_Beker === 'Y' || d.Europese_Prijs === 'Y'))
      .enter()
      .append("g")
      .attr("class", "prize-group")
      .attr("transform", d => `translate(${x(d.Seizoen) + x.bandwidth() / 2 - 7}, ${y(d.Club) + y.bandwidth() / 2 - 12})`)
      .each(function(d) {
          const el = d3.select(this);
          let prizeCount = 0;
          if (d.Landstitel === 'Y') {
              el.append("path").attr("d", icons.schild).attr("fill", "#CD7F32").attr("transform", `translate(0, ${prizeCount * 14}) scale(0.6)`);
              prizeCount++;
          }
          if (d.Nationale_Beker === 'Y') {
              el.append("path").attr("d", icons.bekerZilver).attr("fill", "#C0C0C0").attr("stroke", "#666").attr("transform", `translate(0, ${prizeCount * 14}) scale(0.6)`);
              prizeCount++;
          }
          if (d.Europese_Prijs === 'Y') {
              el.append("path").attr("d", icons.bekerGoud).attr("fill", "#FFD700").attr("stroke", "#B8860B").attr("transform", `translate(0, ${prizeCount * 14}) scale(0.6)`);
          }
      });
}
