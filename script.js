// Versie van dit script
console.log("Script versie: 1.3 - Visuele Overhaul & Nieuwe Logica");

/**
 * Een helper-functie die de data groepeert in aaneengesloten periodes per coach.
 * @param {Array} data De platte data-array uit de CSV.
 * @returns {Array} Een array met objecten, waarbij elk object een volledige coach-periode is.
 */
function groepeerPeriodes(data) {
    const periodes = [];
    if (data.length === 0) return periodes;

    // Sorteer data om zeker te zijn van de volgorde
    data.sort((a, b) => d3.ascending(a.Club, b.Club) || d3.ascending(a.Seizoen, b.Seizoen));

    let huidigePeriode = {
        coach: data[0].Coach,
        club: data[0].Club,
        seizoenen: [data[0]]
    };

    for (let i = 1; i < data.length; i++) {
        if (data[i].Coach === huidigePeriode.coach && data[i].Club === huidigePeriode.club) {
            huidigePeriode.seizoenen.push(data[i]);
        } else {
            periodes.push(huidigePeriode);
            huidigePeriode = {
                coach: data[i].Coach,
                club: data[i].Club,
                seizoenen: [data[i]]
            };
        }
    }
    periodes.push(huidigePeriode);
    
    // Voeg de totale lengte van de periode toe aan elk individueel seizoen-datapunt
    periodes.forEach(p => {
        const lengte = p.seizoenen.length;
        p.seizoenen.forEach(s => {
            s.stintLength = lengte;
        });
    });

    return periodes;
}

// Data laad-functie
d3.csv("engeland.csv").then(function(data) {
    
    // Data types omzetten van string naar getal
    data.forEach(function(d) {
        d.Seizoen_Nummer_Coach = +d.Seizoen_Nummer_Coach;
    });
    
    drawHeatmap(data);

}).catch(function(error) {
    console.error("Fout bij het laden van engeland.csv:", error);
});


function drawHeatmap(data) {
    const margin = {top: 50, right: 30, bottom: 100, left: 150};
    const width = 1200 - margin.left - margin.right;
    const height = 600 - margin.top - margin.bottom;

    const svg = d3.select("#heatmap-container")
      .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const seizoenen = [...new Set(data.map(d => d.Seizoen))].sort();
    const clubs = [...new Set(data.map(d => d.Club))];

    const x = d3.scaleBand().range([0, width]).domain(seizoenen).padding(0.02);
    const y = d3.scaleBand().range([height, 0]).domain(clubs).padding(0.05);

    svg.append("g").attr("class", "axis").attr("transform", `translate(0, ${height})`).call(d3.axisBottom(x))
      .selectAll("text").attr("transform", "translate(-10,0)rotate(-45)").style("text-anchor", "end");

    svg.append("g").attr("class", "axis").call(d3.axisLeft(y));

    // Jouw nieuwe, slimme kleurlogica
    const getColor = function(d) {
        if (d.stintLength === 1) return "#e67e22"; // Oranje: Coach voor 1 seizoen
        if (d.stintLength > 1) {
            if (d.Seizoen_Nummer_Coach === 1) return "#a9dfbf"; // Lichtgroen: Start van stabiele periode
            if (d.Seizoen_Nummer_Coach < 5) return "#73c6b6"; // Mediumgroen: Opbouwfase
            return "#1e8449"; // Donkergroen: Dynastie (5+ jaar)
        }
    };
    
    // Voordat we tekenen, berekenen we de periodes om de stintLength te bepalen
    const periodes = groepeerPeriodes(data);
    const dataMetStintLength = periodes.flatMap(p => p.seizoenen);

    // Teken de gekleurde blokjes per seizoen
    svg.selectAll(".bar")
      .data(dataMetStintLength, d => d.Club + ':' + d.Seizoen)
      .enter()
      .append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.Seizoen))
        .attr("y", d => y(d.Club))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .style("fill", d => getColor(d));

    // Teken de omlijning per volledige coach-periode
    svg.selectAll(".period-border")
        .data(periodes)
        .enter()
        .append("rect")
        .attr("class", "period-border")
        .attr("x", d => x(d.seizoenen[0].Seizoen))
        .attr("y", d => y(d.club))
        .attr("width", d => x(d.seizoenen[d.seizoenen.length - 1].Seizoen) + x.bandwidth() - x(d.seizoenen[0].Seizoen))
        .attr("height", y.bandwidth());

    // Teken de prijzen, netjes gestapeld
    svg.selectAll(".prize-icon")
        .data(data.filter(d => d.Landstitel || d.Nationale_Beker || d.Europese_Prijs))
        .enter()
        .append("text")
            .attr("class", "prize-icon")
            .attr("x", d => x(d.Seizoen) + x.bandwidth() / 2)
            .attr("y", d => y(d.Club) + y.bandwidth() / 2 - 8)
            .attr("text-anchor", "middle")
            .each(function(d) {
                const el = d3.select(this);
                const prijzen = [d.Landstitel, d.Nationale_Beker, d.Europese_Prijs].filter(Boolean);
                prijzen.forEach((prijs, i) => {
                    el.append("tspan")
                      .attr("x", x(d.Seizoen) + x.bandwidth() / 2)
                      .attr("dy", `${i > 0 ? 1 : 0}em`)
                      .text(prijs);
                });
            });
}
