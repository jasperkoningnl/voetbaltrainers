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
    // We maken een unieke, gesorteerde lijst van alle seizoenen.
    const seizoenen = [...new Set(data.map(d => d.Seizoen))].sort();
    // We maken een unieke lijst van alle clubs.
    const clubs = [...new Set(data.map(d => d.Club))];

    console.log("Clubs voor y-as:", clubs);
    console.log("Seizoenen voor x-as:", seizoenen);

    // --- IV. De X- en Y-schalen (assen) definiëren ---
    // De X-as (seizoenen)
    const x = d3.scaleBand()
      .range([ 0, width ]) // De as loopt over de hele breedte
      .domain(seizoenen) // De 'stapjes' op de as zijn onze seizoenen
      .padding(0.05); // Een beetje witruimte tussen de blokjes

    // De Y-as (clubs)
    const y = d3.scaleBand()
      .range([ height, 0 ]) // De as loopt van onder naar boven
      .domain(clubs) // De 'stapjes' zijn onze clubs
      .padding(0.05);

    // --- V. De assen aan de SVG toevoegen ---
    // Voeg de X-as toe onderaan de visualisatie
    svg.append("g")
      .attr("transform", `translate(0, ${height})`) // Positioneer op de bodem
      .call(d3.axisBottom(x))
      .selectAll("text") // Selecteer de labels om ze te draaien
        .attr("transform", "translate(-10,0)rotate(-45)")
        .style("text-anchor", "end");

    // Voeg de Y-as toe aan de linkerkant
    svg.append("g")
      .call(d3.axisLeft(y));

    // --- HIER KOMT DE CODE VOOR DE GEKLEURDE RECHTHOEKEN ---
}
