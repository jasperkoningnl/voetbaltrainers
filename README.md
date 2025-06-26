# The Managerial Merry-Go-Round

Een D3.js-visualisatie die de ambtstermijnen van voetbaltrainers bij Europese topclubs in kaart brengt en een verband probeert te leggen met behaalde successen. Dit project wordt ontwikkeld in samenwerking met Google's Gemini.

## Overzicht

Het doel van dit project is om de ambtstermijn van voetbalcoaches bij topclubs in Europa te visualiseren. Een D3.js heatmap toont elk seizoen per club, waarbij gewonnen prijzen en trainerswissels worden gemarkeerd. Alle data wordt opgeslagen in een Google Firestore-database, die kan worden beheerd via een admin-dashboard. Het project integreert ook met de Gemini API van Google om ontbrekende seizoenen aan te vullen.

## Mappenstructuur

```
.
├── about.html       # Achtergrondinformatie en changelog
├── dashboard.html   # Op React gebaseerd admin-dashboard
├── data/            # Voorbeeld-JSON-data gebruikt tijdens de ontwikkeling
├── index.html       # Hoofdpagina van de visualisatie
├── script.js        # Logica voor de heatmap en Firestore-queries
├── style.css        # Gedeelde styling
└── README.md
```

## De Visualisatie Lokaal Draaien

Om de visualisatie correct te laten werken, inclusief de ES-module-imports voor Firebase, moet je de bestanden via een lokale webserver serveren.

1.  Open een terminal in de projectmap.
2.  Start een simpele Python-webserver:
    ```bash
    python3 -m http.server
    ```
3.  Open `http://localhost:8000/index.html` in je browser.

## Het Admin Dashboard Gebruiken

1.  Start dezelfde lokale server als hierboven beschreven.
2.  Navigeer naar `http://localhost:8000/dashboard.html`.
3.  Log in met een Google-account om de Firestore-collecties te beheren.
4.  Het tabblad "AI Assistent" maakt gebruik van de Gemini API. Zorg ervoor dat de API-sleutel in de code overeenkomt met een geldige sleutel uit je Google Cloud-project.

## Externe Vereisten

-   **Firebase Project:** Een actief Firebase-project met Firestore en Authentication (Google Sign-In) ingeschakeld. De `firebaseConfig`-objecten in `index.html` en `dashboard.html` moeten worden vervangen door de credentials van je eigen project.
-   **Google Cloud & Gemini API:**
    - De **Generative Language API** moet zijn ingeschakeld in het bijbehorende Google Cloud-project.
    - Er moet een aparte **API-sleutel voor de Gemini API** worden aangemaakt via [AI Studio](https://aistudio.google.com/apikey).
    - Deze Gemini API-sleutel moet in het `dashboard.html`-bestand worden geplakt.
    - De sleutel moet beperkt zijn tot het domein waarop het dashboard wordt gehost (bijv. `jasperkoningnl.github.io/*`) om misbruik te voorkomen.
