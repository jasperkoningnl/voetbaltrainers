// Versie van dit script
console.log("Script versie: 1.2 - Stapsgewijze Kleurschaal");

// Stap 1: Data laden
d3.csv("engeland.csv").then(function(data) {
    
    // Data types omzetten van string naar getal
    data.forEach(function(d) {
        d.Seizoen_Nummer_Coach = +d.Seizoen_Nummer_Coach;
    });

    console.log("Data succesvol geladen en types gecorrigeerd:", data);
    
    // De functie aanroepen die de visualisatie tekent
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

    const x = d3.scaleBand()
      .range([ 0, width ])
      .domain(seizoenen)
      .padding(0.05);

    const y = d3.scaleBand()
      .range([ height, 0 ])
      .domain(clubs)
      .padding(0.05);

    svg.append("g")
      .attr("transform", `translate(0, ${height})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
        .attr("transform", "translate(-10,0)rotate(-45)")
        .style("text-anchor", "end");

    svg.append("g")
      .call(d3.axisLeft(y));

    // AANGEPASTE STAPSGEWIJZE KLEURENSCHAAL
    const myColor = d3.scaleThreshold()
      .domain([2, 5]) // Drempels: verandert van kleur bij 2 en bij 5
      .range(["#e67e22", "#73c6b6", "#1e8449"]); // Kleuren: [voor <2], [voor <5], [voor >=5]
      // Jaar 1: Oranje
      // Jaar 2,3,4: Lichtgroen
      // Jaar 5+: Donkergroen

    svg.selectAll(".bar")
      .data(data, function(d) { return d.Club+':'+d.Seizoen; })
      .enter()
      .append("rect")
        .attr("class", "bar")
        .attr("x", function(d) { return x(d.Seizoen); })
        .attr("y", function(d) { return y(d.Club); })
        .attr("width", x.bandwidth() )
        .attr("height", y.bandwidth() )
        .style("fill", function(d) { return myColor(d.Seizoen_Nummer_Coach); });

    svg.selectAll(".prize-icon")
        .data(data, function(d) { return d.Club+':'+d.Seizoen; })
        .enter()
        .append("text")
            .attr("class", "prize-icon")
            .text(function(d){ return d.Landstitel + d.Nationale_Beker + d.Europese_Prijs; })
            .attr("x", function(d) { return x(d.Seizoen) + x.bandwidth() / 2; })
            .attr("y", function(d) { return y(d.Club) + y.bandwidth() / 2; })
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .style("font-size", "10px");
}
