// Versie van dit script
console.log("Script versie: 3.2 - Firestore Herstructurering");

// Importeer de benodigde Firestore functies die in index.html zijn geïnitialiseerd
import { collection, getDocs, addDoc, doc, writeBatch } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- EENMALIGE DATA MIGRATIE FUNCTIE ---
// Deze functie leest de lokale CSV en schrijft de data naar de nieuwe databasestructuur.
window.migrateCSVtoFirestore = async function() {
    if (!window.db) {
        console.error("Firestore DB is niet geïnitialiseerd.");
        return;
    }

    try {
        const data = await d3.csv("engeland.csv");
        const coachesCollection = collection(window.db, "coaches");
        const seizoenenCollection = collection(window.db, "seizoenen");

        console.log("Start herstructurering en migratie...");
        const coachesMap = new Map(); // Houdt unieke coaches bij om duplicaten te voorkomen

        // Stap 1: Vind alle unieke coaches en voeg ze toe aan de 'coaches' collectie
        for (const row of data) {
            if (!coachesMap.has(row.Coach)) {
                console.log(`Nieuwe coach gevonden: ${row.Coach}`);
                const coachDoc = await addDoc(coachesCollection, {
                    naam: row.Coach,
                    nationaliteit: row.Nationaliteit_Coach,
                    nat_code: row.Coach_Nat_Code,
                    foto_url: row.Coach_Foto_URL
                });
                coachesMap.set(row.Coach, coachDoc.id); // Sla de nieuwe ID op
            }
        }
        console.log(`${coachesMap.size} unieke coaches toegevoegd aan Firestore.`);

        // Stap 2: Voeg alle seizoenen toe met een verwijzing naar de coach
        const batch = writeBatch(window.db);
        data.forEach(row => {
            const coachId = coachesMap.get(row.Coach);
            const seasonData = {
                coachId: coachId,
                seizoen: row.Seizoen,
                club: row.Club,
                land_club: row.Land_Club,
                logo_url: row.Logo_URL,
                seizoen_nummer_coach: +row.Seizoen_Nummer_Coach,
                landstitel: row.Landstitel,
                nationale_beker: row.Nationale_Beker,
                europese_prijs: row.Europese_Prijs
            };
            const seasonDocRef = doc(seizoenenCollection); // Maak een nieuwe referentie aan in de seizoenen collectie
            batch.set(seasonDocRef, seasonData);
        });
        
        await batch.commit(); // Schrijf alle seizoenen in één keer weg (veel efficiënter)

        console.log("Migratie succesvol voltooid! Alle data staat nu in de nieuwe structuur in Firestore.");
        alert("Migratie voltooid! Ververs de pagina om de data vanuit Firestore te laden.");

    } catch (error) {
        console.error("Fout tijdens de migratie:", error);
        alert("Er is een fout opgetreden tijdens de migratie. Zie de console voor details.");
    }
};


// --- HOOFDLOGICA: DATA LADEN VANUIT FIRESTORE ---
async function loadDataFromFirestore() {
    if (!window.db) return [];

    // Haal data op uit BEIDE collecties tegelijk
    const [coachesSnapshot, seizoenenSnapshot] = await Promise.all([
        getDocs(collection(window.db, "coaches")),
        getDocs(collection(window.db, "seizoenen"))
    ]);

    // Maak een 'lookup map' voor coaches voor efficiëntie
    const coachesMap = new Map();
    coachesSnapshot.forEach(doc => {
        coachesMap.set(doc.id, doc.data());
    });

    // Knoop de data aan elkaar
    const joinedData = [];
    seizoenenSnapshot.forEach(doc => {
        const seizoenData = doc.data();
        const coachInfo = coachesMap.get(seizoenData.coachId);
        if (coachInfo) {
            joinedData.push({
                ...seizoenData, // Alle data van het seizoen
                Coach: coachInfo.naam,
                Nationaliteit_Coach: coachInfo.nationaliteit,
                Coach_Nat_Code: coachInfo.nat_code,
                Coach_Foto_URL: coachInfo.foto_url
            });
        }
    });

    console.log(`Data succesvol geladen en samengevoegd: ${joinedData.length} documenten.`);
    return joinedData;
}


// Start het laadproces vanuit Firestore
loadDataFromFirestore().then(data => {
    if (data.length === 0) {
        console.warn("Geen data gevonden in Firestore. Voer de migratie uit als dit de eerste keer is.");
        return;
    }
    
    // Verwerk de geladen data
    data.forEach(function(d) {
        d.Seizoen_Nummer_Coach = +d.Seizoen_Nummer_Coach;
    });
    const verrijkteData = voegPeriodeDataToe(data);
    
    drawHeatmap(verrijkteData);
    drawLegend();
}).catch(error => {
    console.error("Fout bij het laden van data uit Firestore:", error);
});


// --- Vanaf hier blijven de teken-functies grotendeels hetzelfde ---

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

function drawHeatmap(data) {
    const margin = {top: 20, right: 30, bottom: 80, left: 220};
    const width = 1400 - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;

    d3.select("#heatmap-container").html("");

    const svg = d3.select("#heatmap-container")
      .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const seizoenen = [...new Set(data.map(d => d.seizoen))].sort();
    const clubs = [...new Set(data.map(d => d.club))];
    const logoData = clubs.map(club => {
        const entry = data.find(d => d.club === club);
        return { Club: club, Logo_URL: entry ? entry.logo_url : '' };
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
            if (d.seizoen_nummer_coach === 1) return "#99ff99";
            if (d.seizoen_nummer_coach === 2) return "#66cc66";
            if (d.seizoen_nummer_coach <= 5) return "#339933";
            if (d.seizoen_nummer_coach <= 10) return "#006600";
            return "#003300";
        }
    };
    
    const tooltip = d3.select("#tooltip");
    const avatarIconPath = "M25 26.5 C20 26.5 15 29 15 34 V37 H35 V34 C35 29 30 26.5 25 26.5 Z M25 15 C21.1 15 18 18.1 18 22 C18 25.9 21.1 29 25 29 C28.9 29 32 25.9 32 22 C32 18.1 28.9 15 25 15 Z";

    const mouseover = function(event, d) {
        tooltip.transition().duration(200).style("opacity", 1);
    };

    const mousemove = function(event, d) {
        tooltip.html('');

        if (d.Coach_Foto_URL && d.Coach_Foto_URL.trim() !== '') {
            tooltip.append('img')
                .attr('src', d.Coach_Foto_URL)
                .attr('class', 'tooltip-img')
                .on('error', function() {
                    d3.select(this).remove();
                    tooltip.insert('svg', ':first-child')
                           .attr('class', 'tooltip-img')
                           .attr('viewBox', '0 0 50 50')
                           .append('path')
                           .attr('d', avatarIconPath)
                           .attr('fill', '#ccc');
                });
        } else {
            tooltip.append('svg')
                   .attr('class', 'tooltip-img')
                   .attr('viewBox', '0 0 50 50')
                   .append('path')
                   .attr('d', avatarIconPath)
                   .attr('fill', '#ccc');
        }
        
        const infoDiv = tooltip.append('div').attr('class', 'tooltip-info');
        infoDiv.append('p').attr('class', 'name').text(d.Coach);
        const nationalityDiv = infoDiv.append('div').attr('class', 'nationality');
        
        if (d.Coach_Nat_Code && d.Coach_Nat_Code.trim() !== '') {
            const flagApiUrl = `https://flagcdn.com/w40/${d.Coach_Nat_Code.toLowerCase()}.png`;
            nationalityDiv.append('img').attr('src', flagApiUrl).attr('class', 'tooltip-flag');
        }
        nationalityDiv.append('span').text(d.Nationaliteit_Coach);
        
        tooltip.style("left", (event.pageX + 15) + "px")
               .style("top", (event.pageY - 28) + "px");
    };

    const mouseleave = function(event, d) {
        tooltip.transition().duration(500).style("opacity", 0);
    };

    svg.selectAll(".bar").data(data).enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.seizoen))
        .attr("y", d => y(d.club))
        .attr("width", x.bandwidth() + 1)
        .attr("height", y.bandwidth())
        .style("fill", d => getColor(d))
        .attr("shape-rendering", "crispEdges")
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave);

    const icons = { schild: "M9 0 L1 4 V9 C1 14 9 17 9 17 S17 14 17 9 V4 L9 0 Z" };

    const coachChanges = data.filter(d => d.seizoen_nummer_coach === 1 && d.seizoen !== seizoenen[0]);
    svg.selectAll(".coach-divider").data(coachChanges).enter().append("line")
        .attr("class", "coach-divider")
        .attr("x1", d => x(d.seizoen))
        .attr("y1", d => y(d.club))
        .attr("x2", d => x(d.seizoen))
        .attr("y2", d => y(d.club) + y.bandwidth());

    svg.selectAll(".prize-group")
      .data(data.filter(d => d.landstitel === 'Y' || d.nationale_beker === 'Y' || d.europese_prijs === 'Y'))
      .enter().append("g")
      .attr("class", "prize-group")
      .attr("transform", d => `translate(${x(d.seizoen) + x.bandwidth() / 2}, ${y(d.club) + y.bandwidth() / 2})`)
      .each(function(d) {
          const el = d3.select(this);
          const prijzen = [];
          if (d.europese_prijs === 'Y') prijzen.push({color: '#FFD700'});
          if (d.landstitel === 'Y') prijzen.push({color: '#C0C0C0'});
          if (d.nationale_beker === 'Y') prijzen.push({color: '#CD7F32'});
          
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
    d3.select("#legend-container").html("");

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
