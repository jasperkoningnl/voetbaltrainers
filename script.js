// Stap 1: Data laden (deze code hadden we al)
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
    // We selecteren de 'div' met de id 'heatmap-container' die we in de HTML hebben gemaakt.
    const svg = d3.select("#heatmap-container")
      .append("svg") // We voegen een SVG-element toe aan de div.
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g") // We voegen een 'groep' (<g>) element toe aan de SVG.
        // Dit wordt onze tekenruimte, verschoven volgens de marges.
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    console.log("SVG Canvas en groepselement zijn aangemaakt.");
    
    // --- HIER KOMT STRAKS DE REST VAN DE CODE ---
}
