// Versie van dit script
console.log("Script versie: 3.1 - Data Correctie Tools");

// Importeer de benodigde Firestore functies die in index.html zijn geïnitialiseerd
import { collection, getDocs, addDoc, doc, writeBatch, query, where, updateDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- EENMALIGE DATA CORRECTIE TOOLS ---

/**
 * EXPORT FUNCTIE: Genereert een lijst van unieke coaches voor correctie.
 * Aanroepen vanuit de console met: exportCoachDataForCorrection()
 */
window.exportCoachDataForCorrection = async function() {
    if (!window.db) return console.error("DB niet klaar.");
    console.log("Ophalen van unieke coaches uit Firestore...");

    const coachesSnapshot = await getDocs(collection(window.db, "coaches"));
    const coaches = [];
    coachesSnapshot.forEach(doc => {
        const data = doc.data();
        coaches.push({
            id: doc.id,
            naam: data.naam,
            foto_url: data.foto_url || '' // Zorg dat er altijd een string is
        });
    });

    console.log("Kopieer het onderstaande object, plak het in een editor, corrigeer de URLs en gebruik het voor de update-functie.");
    console.log(JSON.stringify(coaches, null, 2));
    alert("Check de console voor de lijst met coaches.");
};

/**
 * UPDATE FUNCTIE: Werkt de foto-URLs in Firestore bij.
 * Aanroepen vanuit de console met: updateCoachPhotosInFirestore(jouwGecorrigeerdeData)
 * @param {Array} correctedData - De array met gecorrigeerde coach-data.
 */
window.updateCoachPhotosInFirestore = async function(correctedData) {
    if (!window.db) return console.error("DB niet klaar.");
    if (!correctedData || !Array.isArray(correctedData)) {
        return alert("Geen correcte data meegegeven. Kopieer de volledige, gecorrigeerde array.");
    }
    console.log(`Starten met het updaten van ${correctedData.length} coach-documenten...`);
    const batch = writeBatch(window.db);

    correctedData.forEach(coach => {
        const docRef = doc(window.db, "coaches", coach.id);
        batch.update(docRef, { foto_url: coach.foto_url });
    });

    try {
        await batch.commit();
        console.log("Update succesvol voltooid!");
        alert("Alle foto-URLs zijn bijgewerkt in de database! Herlaad de pagina om de wijzigingen te zien.");
    } catch (error) {
        console.error("Fout tijdens het updaten:", error);
        alert("Er is een fout opgetreden. Zie de console voor details.");
    }
};


// --- HOOFDLOGICA: DATA LADEN VANUIT FIRESTORE ---
async function loadDataFromFirestore() {
    if (!window.db) return [];
    const [coachesSnapshot, seizoenenSnapshot] = await Promise.all([
        getDocs(collection(window.db, "coaches")),
        getDocs(collection(window.db, "seizoenen"))
    ]);
    const coachesMap = new Map();
    coachesSnapshot.forEach(doc => {
        coachesMap.set(doc.id, doc.data());
    });
    const joinedData = [];
    seizoenenSnapshot.forEach(doc => {
        const seizoenData = doc.data();
        const coachInfo = coachesMap.get(seizoenData.coachId);
        if (coachInfo) {
            joinedData.push({
                ...seizoenData,
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
    data.sort((a, b) => d3.ascending(a.club, b.club) || d3.ascending(a.seizoen, b.seizoen));
    let huidigePeriode = { coach: data[0].Coach, club: data[0].club, seizoenen: [data[0]] };
    for (let i = 1; i < data.length; i++) {
        if (data[i].Coach === huidigePeriode.coach && data[i].club === huidigePeriode.club) {
            huidigePeriode.seizoenen.push(data[i]);
        } else {
            periodes.push(huidigePeriode);
            huidigePeriode = { coach: data[i].Coach, club: data[i].club, seizoenen: [data[i]] };
        }
    }
    periodes.push(huidigePeriode);
    periodes.forEach(p => {
        const lengte = p.seizoenen.length;
        p.seizoenen.forEach(s => {
            s.stintLength = lengte;
            s.seizoen_nummer_coach = +s.seizoen_nummer_coach;
        });
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
