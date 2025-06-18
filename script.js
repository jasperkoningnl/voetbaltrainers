// Stap 1: Data laden
d3.csv("engeland.csv").then(function(data) {
    
    console.log("Data succesvol geladen:", data);
    
    // Nadat de data is geladen, voeren we de functie uit die de visualisatie tekent.
    drawHeatmap(data);

}).catch(function(error) {
    console.error("Fout bij het laden van engeland.csv:", error);
});


// Stap 2: De functie die onze visualisatie gaat tekenen
function drawHeatmap(data) {
    // --- I. Marges en afmetingen van de visualisatie definiëren ---
    const margin = {top: 50, right: 30, bottom: 100, left: 150};
    const width = 1200 - margin.left - margin.right;
    const height = 600 - margin.top - margin.bottom;

    // --- II. Het SVG-element selecteren en opzetten ---
    const svg = d3.select("#heatmap-container")
      .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // --- III. De domeinen voor de assen bepalen ---
    const seizoenen = [...new Set(data.map(d => d.Seizoen))].sort();
    const clubs = [...new Set(data.map(d => d.Club))];

    // --- IV. De X- en Y-schalen (assen) definiëren ---
    const x = d3.scaleBand()
      .range([ 0, width ])
      .domain(seizoenen)
      .padding(0.05);

    const y = d3.scaleBand()
      .range([ height, 0 ])
      .domain(clubs)
      .padding(0.05);

    // --- V. De assen aan de SVG toevoegen ---
    svg.append("g")
      .attr("transform", `translate(0, ${height})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
        .attr("transform", "translate(-10,0)rotate(-45)")
        .style("text-anchor", "end");

    svg.append("g")
      .call(d3.axisLeft(y));

    // --- VI. De kleurenschaal voor de heatmap definiëren ---
    // We maken een schaal die het aantal seizoenen omzet naar een kleur.
    const myColor = d3.scaleSequential()
      .interpolator(d3.interpolateRgb("orange", "green")) // Van oranje (nieuw) naar groen (lang)
      .domain([1,15]); // We stellen de schaal in van 1 tot 15 jaar.

    // --- VII. De rechthoeken (de heatmap) tekenen ---
    svg.selectAll()
      .data(data, function(d) { return d.Club+':'+d.Seizoen; }) // Koppel data aan elementen
      .enter() // Creëer placeholders voor nieuwe data
      .append("rect") // Voeg voor elk datumpunt een rechthoek toe
        .attr("x", function(d) { return x(d.Seizoen) })
        .attr("y", function(d) { return y(d.Club) })
        .attr("width", x.bandwidth() )
        .attr("height", y.bandwidth() )
        .style("fill", function(d) { return myColor(d.Seizoen_Nummer_Coach)} );

    // --- VIII. De prijs-iconen toevoegen ---
    svg.selectAll()
        .data(data, function(d) { return d.Club+':'+d.Seizoen; })
        .enter()
        .append("text")
            .text(function(d){ return d.Landstitel + d.Nationale_Beker + d.Europese_Prijs; })
            .attr("x", function(d) { return x(d.Seizoen) + x.bandwidth() / 2; }) // Midden van de cel
            .attr("y", function(d) { return y(d.Club) + y.bandwidth() / 2; })   // Midden van de cel
            .attr("text-anchor", "middle") // Horizontaal centreren
            .attr("dominant-baseline", "middle") // Verticaal centreren
            .style("font-size", "10px");
}
