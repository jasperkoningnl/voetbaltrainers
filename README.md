# The Managerial Merry-Go-Round

**Version:** 2.1
**Changelog:** Converted to code format for easier copy-pasting into GitHub.

## 1. Overview

**The Managerial Merry-Go-Round** is an interactive data visualization project that explores the relationship between managerial tenure and success at Europe's top football clubs. The project, developed by Jasper Koning in collaboration with Google's Gemini, aims to answer the question: Was Sir Alex Ferguson's long reign at Manchester United an anomaly, or is stability a true indicator of success?

The project consists of three main components:

1.  **The D3.js Visualization:** A dynamic heatmap that displays the tenures of managers at 35 top European clubs since the 1955/56 season. It visually represents tenure length, trophies won, and allows for advanced filtering, comparison, and a "Career Mode" to track individual managers.
2.  **Supporting Articles:** A series of articles that use the visualization's data to explore narratives around different types of managers, such as "The Architect vs. The Journeyman."
3.  **The React Dashboard:** A comprehensive, behind-the-scenes admin panel for managing all project data, which is stored in a versioned JSON file on GitHub.

## 2. Technical Architecture

The project leverages a modern web stack to separate data management from the public-facing visualization:

* **Frontend:**
    * **Intro (`index.html`):** schermvullende presentatie Ferguson vs Mourinho (7 scènes).
    * **Verkenner (`explore.html`):** weergaven League, Compare clubs en Career. Link naar een weergave: `explore.html#country=Spain`, `#clubs=id,id` of `#career=Naam`.
    * **Tekstpagina's:** `articles.html`, `articles/*.html`, `about.html`, `data-methodology.html`, in dezelfde stijl.
    * **Logica en stijl:** `app.js` (vanilla JavaScript + **D3.js**, één script voor intro en verkenner) en `style.css` (alle pagina's).
    * **Archief (`v0.9/`):** de eerste versie van de visualisatie, ongewijzigd behalve de paden. Oude links naar `v2/` sturen door naar de hoofdversie.

* **Backend & Data:**
    * **Data:** GitHub stores `data/snapshot.json` with `clubs`, `coaches` and `seizoenen`. Firestore remains for existing visitor reports.
    * **Data Management (`dashboard.html`):** A sophisticated single-page application built with **React** and **Tailwind CSS**. It allows for CRUD operations on the GitHub dataset, with a concept and an explicit publish action.
    * **Serverless Functions (`index.js`):** Google Cloud Functions written in Node.js are used for advanced data processing tasks, such as enriching coach data with images from external APIs.

## Gegevens beheren via GitHub

GitHub is de enige gegevensbron voor clubs, trainers en seizoenen. De website leest `data/snapshot.json`; het dashboard beheert hetzelfde bestand op `main`. Google-inloggen is vervangen door GitHub-inloggen via Firebase Authentication. Die provider moet eenmalig worden ingericht.

Bewerkingen en imports blijven eerst in een concept in het geopende tabblad. **Wijzigingen bekijken en publiceren** schrijft alles in één commit naar GitHub. De publicatieworkflow controleert de gegevens en publiceert de site. Er is geen dagelijkse Firestore-export en oude imports worden niet opnieuw over dashboardwijzigingen gelegd.

[Gebruiksaanwijzing, inlogconfiguratie en migratiegrenzen](docs/GITHUB_DASHBOARD.md).

Bezoekersmeldingen blijven voorlopig in Firestore. Firebase Authentication en de bestaande fotozoekfunctie blijven ook nodig. Verwijder het Firebase-project niet.

## Site (hoofdversie)

- Ontwerp: Claude Design. Verkenner optie 7a, header 12b, intro `design_handoff_intro`. Donker thema; logo: `logo-carousel.svg`; favicon: `favicon.svg` (donkere lijnen, licht in een donkere browser). Mobiel is nog niet apart ontworpen (tekst boven de figuur, vegen voor volgende/vorige).
- Intro: speelt zelf af (pijltjes ←/→ wisselen scène, spatie start of pauzeert). De huidige scène staat in `localStorage` (`mmgr-intro-step`). Alle cijfers en teksten met cijfers komen uit de data.
- Foto's intro: zet eigen bestanden in `images/intro/`: `ferguson-hero.jpg`, `mourinho-hero.jpg` (titelscherm), `ferguson-1986.jpg`, `ferguson-trophy.jpg`, `mourinho-porto.jpg` (portretten). Ontbreekt een bestand, dan toont de app de foto uit de database (Wikimedia).
- `data/mourinho_buiten_dataset.json`: Mourinho's seizoenen buiten de database (União de Leiria, Tottenham, Fenerbahçe, Benfica 2025/26), met bronnen. Alleen voor de Mourinho-rij en de filmstrip in het intro; de statistieken (duel, staven, spreiding) rekenen alleen met de database.
- Leest `clubs`, `coaches` en `seizoenen` uit `data/snapshot.json` (zie de README in de hoofdmap). Bij een laadfout verschijnt een foutmelding; de app leest geen oudere Firestore-gegevens.
- Seizoenen met meer dan één trainer (incl. interim) worden gesplitst in k gelijke rode stukken, één per trainer (max 5). Bron: veld `trainers_seizoen` op elk seizoen-document:
  `[{ naam, van: "YYYY-MM-DD", tot: "YYYY-MM-DD", interim: bool }]` plus `trainers_bron` (URL).
- Zolang dat veld nog niet in de snapshot staat, gebruikt de app `data/trainers_seizoen.json` als terugval.
- Importeren in het concept: dashboard → **Importer** → **Gecontroleerde import laden** → importeer. Dit voegt 437 clubseizoenen aan het concept toe, maakt ontbrekende hoofdtrainers als bewerkbaar coachprofiel aan en neemt de trainerslijst en bron mee. Publiceer daarna expliciet naar GitHub. Opnieuw importeren werkt hetzelfde record bij en maakt geen dubbel clubseizoen.
- Voor historische seizoenstrainers blijft dashboard → **Importer** → **Seizoenstrainers (trainers_seizoen)** → `data/trainers_seizoen.json` beschikbaar. Die route wijzigt alleen `trainers_seizoen` en `trainers_bron` in het concept.

In de verkenner staat een gesplitst seizoen aan het begin of eind van een periode los van die periode (trainer kwam of ging halverwege het seizoen). Het intro rekent met de volledige periodes.

Regel voor een gesplitst seizoen: een trainer telt mee voor een seizoen als hij minstens 3 dagen tussen 1 augustus en 20 mei aan het roer stond. Wissels in de zomerstop tellen dus niet.

### Bronnen extra trainers

- `data/bronnen/*.txt`: per club de bronlijst (Wikipedia, per club de taal met de meest precieze lijst) met bron-URL bovenaan. Twee formaten: trainersperiodes met datums, of per seizoen de volgorde van trainers (`#type season`).
- `data/bronnen/build_trainers.py`: bouwt de ruwe bronlijsten met lokale exports van `seizoenen`, `coaches` en `clubs`.
- `data/bronnen/normaliseer_trainers.mjs`: splitst gezamenlijke trainers, verwijdert expliciete technische directeuren en past controleerbare correcties toe.
- `data/BRONNEN.md`: werkwijze voor bronrevisies en aanvullende controle met API-Football, Transfermarkt en football-data.org.
- `data/controlelijst.md`: seizoenen waar bron en database uit elkaar lopen. De database is niet aangepast.
- Transfermarkt vult voor 2025/26 ook AS Monaco, Athletic Bilbao, Boavista en S.C. Braga met exacte datums aan. Historische jaargangen van die vier clubs zijn nog niet volledig overgezet naar `trainers_seizoen.json`.

### Dashboard: Data Health

Alles wat aandacht nodig heeft staat in het dashboard onder **Data Health**, in tabbladen:

- **Foto's en logo's**: trainers zonder foto (*Ontbreekt*, met gevonden kandidaat-foto's en zoeklinks), zekere nieuwe foto's (*Nieuw*, met één knop naar de database), bestaande foto's die niet kloppen (*Te controleren*), afgekeurde vondsten (*Niet toegevoegd*) en een controle van de clublogo's. Bron: `data/fotos_aanvulling.json`.
- **Twijfelgevallen**: seizoenen waar bron en database uit elkaar lopen (`data/twijfelgevallen.json`).
- **Meldingen**: fouten die bezoekers melden (zie `docs/MELDINGEN.md`).
- **Datakwaliteit**: dubbele coaches, nationaliteiten, export per land en wees-seizoenen.

Fotozoekrun 29 september 2026 (voor alle trainers zonder foto): kandidaten uit Wikidata (foto van de persoon, gekoppeld aan dezelfde club), de infobox op Wikipedia in meerdere talen en een zoekopdracht op naam in Wikimedia Commons. Alleen vrije bestanden op Commons. *Zeker* betekent: de identiteit klopt (Wikidata-koppeling met de club of een bestandsbeschrijving die de trainer noemt), de licentie staat op de Commons-bestandspagina en de foto is bekeken. Die staan onder *Nieuw* en gaan met één knop naar het concept; publiceren vraagt GitHub-inlog. Alles wat daar niet aan voldoet staat met reden onder *Ontbreekt* (twijfel) of *Niet toegevoegd* (verkeerde persoon, geen portret).

### Twijfelgevallen

De aanvullende vergelijking van 2.450 historische clubseizoenen met de Transfermarkt-momentopname van 28 september 2026 levert 338 correctierijen op: 310 trainerlijst- of rolcorrecties en 74 wijzigingen van hoofdtrainer (deze categorieën overlappen). Bestaande expliciete interimstatussen, gezamenlijk optredende trainers en exact gedateerde periodes blijven behouden waar Transfermarkt ze overslaat. Voor 60 afwijkende bronreeksen blijft de bestaande bron staan; 90 clubseizoenen hebben geen Transfermarkt-data. Dit is geen garantie dat alle korte waarnemingen en datums volledig zijn.

Alle wijzigingen en behouden uitzonderingen staan in [data/TRANSFERMARKT_CORRECTIES.md](data/TRANSFERMARKT_CORRECTIES.md). `node data/bronnen/maak_volledige_correctie.mjs` reproduceert de import vanuit de vastgelegde bronperiodes en nulmeting. `node data/bronnen/merge_seizoensimport.mjs` verwerkt die import in snapshot en terugvaldata. Er zijn geen nieuwe menselijke keuzepunten in `data/twijfelgevallen.json` toegevoegd.

## 3. Project Structure

```
.
├── articles/               # artikelen
├── data/
│   ├── snapshot.json       # centrale dataset op GitHub
│   ├── trainers_seizoen.json, twijfelgevallen.json, mourinho_buiten_dataset.json
│   └── bronnen/            # bronlijsten en scripts voor de trainers per seizoen
├── functions/              # Cloud Functions
├── images/                 # logo's (images/logos), foto's intro (images/intro)
├── v0.9/                   # archief: eerste versie
├── v2/index.html           # doorverwijzing voor oude links
├── index.html              # intro
├── explore.html            # verkenner
├── articles.html, about.html, data-methodology.html
├── dashboard.html          # beheer (React)
├── app.js
├── style.css
└── README.md
```

## 4. Local Development Setup

To run the full project locally, you need a simple web server to handle the ES module imports for Firebase.

1.  **Prerequisites:** Make sure you have Python 3 installed.
2.  **Start the Server:** Open a terminal in the root directory of the project and run the following command:
    ```bash
    # For Python 3
    python3 -m http.server
    ```
3.  **Access the Visualization:** Open your web browser and navigate to `http://localhost:8000/`.
4.  **Access the Dashboard:** To manage data, navigate to `http://localhost:8000/dashboard.html`.

## 5. Inloggen en resterende Firebase-functies

Volg [docs/GITHUB_DASHBOARD.md](docs/GITHUB_DASHBOARD.md) om GitHub-inloggen te activeren. De client secret hoort uitsluitend in Firebase Authentication, nooit in de repository. Firebase blijft voorlopig nodig voor inloggen, bezoekersmeldingen en de fotozoekfunctie.
