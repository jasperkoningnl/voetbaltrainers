// Dit script wordt uitgevoerd zodra de HTML-pagina volledig is geladen.

// Gebruik D3 om ons CSV-bestand in te laden.
// Belangrijk: d3.csv() is een 'asynchrone' functie.
// Dit betekent dat de code verdergaat terwijl het bestand laadt.
// De .then() functie wordt pas uitgevoerd als de data succesvol binnen is.
d3.csv("engeland.csv").then(function(data) {
    
    // Als het laden succesvol is, wordt deze functie uitgevoerd.
    // 'data' is nu een array van objecten. Elk object is een rij uit onze CSV.
    
    console.log("CSV-bestand succesvol geladen!");
    console.log(`Er zijn ${data.length} rijen met data gevonden.`);
    console.log("Hieronder de volledige dataset om te inspecteren:");
    
    // Log de complete dataset in de console.
    // Dit is de beste manier om te controleren of alles klopt.
    console.log(data);
    
    // --- HIER KOMT LATER DE CODE OM DE HEATMAP TE TEKENEN ---

}).catch(function(error) {
    // Als er een fout optreedt bij het laden van de CSV, wordt dit getoond.
    // Dit helpt enorm bij het vinden van problemen (bv. typefout in bestandsnaam).
    console.error("Fout bij het laden van engeland.csv:", error);
});
