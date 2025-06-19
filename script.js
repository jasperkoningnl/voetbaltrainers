// Versie van dit script
console.log("Script versie: 1.6 - Simpele Schild-Iconen");

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
        .attr("width", x.bandwidth() + 1) // +1 om rendering-artefacten (dunne lijntjes) te voorkomen
        .attr("height", y.bandwidth())
        .style("fill", d => getColor(d));

    // Definieer het SVG-pad voor het schild-icoon
    const icons = {
        schild: "M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z"
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

    // Teken de prijzen, nu als gekleurde schilden
    svg.selectAll(".prize-group")
      .data(data.filter(d => d.Landstitel === 'Y' || d.Nationale_Beker === 'Y' || d.Europese_Prijs === 'Y'))
      .enter()
      .append("g")
      .attr("class", "prize-group")
      .attr("transform", d => `translate(${x(d.Seizoen) + x.bandwidth() / 2}, ${y(d.Club) + y.bandwidth() / 2})`)
      .each(function(d) {
          const el = d3.select(this);
          const prijzen = [];
          // Bepaal welke schilden getoond moeten worden
          if (d.Landstitel === 'Y') prijzen.push({color: '#C0C0C0'}); // Zilver
          if (d.Nationale_Beker === 'Y') prijzen.push({color: '#CD7F32'}); // Brons
          if (d.Europese_Prijs === 'Y') prijzen.push({color: '#FFD700'}); // Goud
          
          const totalHeight = (prijzen.length - 1) * 12;
          
          prijzen.forEach((p, i) => {
               el.append("path")
                 .attr("d", icons.schild) // Gebruik altijd het schild-icoon
                 .attr("fill", p.color) // Maar met de juiste kleur
                 .attr("stroke", "#222")
                 .attr("stroke-width", 0.5)
                 .attr("transform", `translate(-8, ${-totalHeight/2 + i*12 - 8}) scale(0.8)`);
          });
      });
}
