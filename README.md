# The Managerial Merry-Go-Round

**Version:** 2.1
**Changelog:** Converted to code format for easier copy-pasting into GitHub.

## 1. Overview

**The Managerial Merry-Go-Round** is an interactive data visualization project that explores the relationship between managerial tenure and success at Europe's top football clubs. The project, developed by Jasper Koning in collaboration with Google's Gemini, aims to answer the question: Was Sir Alex Ferguson's long reign at Manchester United an anomaly, or is stability a true indicator of success?

The project consists of three main components:

1.  **The D3.js Visualization:** A dynamic heatmap that displays the tenures of managers at 35 top European clubs since the 1955/56 season. It visually represents tenure length, trophies won, and allows for advanced filtering, comparison, and a "Career Mode" to track individual managers.
2.  **Supporting Articles:** A series of articles that use the visualization's data to explore narratives around different types of managers, such as "The Architect vs. The Journeyman."
3.  **The React Dashboard:** A comprehensive, behind-the-scenes admin panel for managing all project data, which is stored in a Google Firestore database.

## 2. Technical Architecture

The project leverages a modern web stack to separate data management from the public-facing visualization:

* **Frontend:**
    * **Intro (`index.html`):** schermvullende presentatie Ferguson vs Mourinho (7 scènes).
    * **Verkenner (`explore.html`):** weergaven League, Compare clubs en Career. Link naar een weergave: `explore.html#country=Spain`, `#clubs=id,id` of `#career=Naam`.
    * **Tekstpagina's:** `articles.html`, `articles/*.html`, `about.html`, `data-methodology.html`, in dezelfde stijl.
    * **Logica en stijl:** `app.js` (vanilla JavaScript + **D3.js**, één script voor intro en verkenner) en `style.css` (alle pagina's).
    * **Archief (`v0.9/`):** de eerste versie van de visualisatie, ongewijzigd behalve de paden. Oude links naar `v2/` sturen door naar de hoofdversie.

* **Backend & Data:**
    * **Database:** **Google Firestore** serves as the single source of truth, housing collections for `clubs`, `coaches`, and `seasons`. This allows for real-time data updates without redeploying the application.
    * **Data Management (`dashboard.html`):** A sophisticated single-page application built with **React** and **Tailwind CSS**. It allows for full CRUD (Create, Read, Update, Delete) operations on all Firestore data.
    * **Serverless Functions (`index.js`):** Google Cloud Functions written in Node.js are used for advanced data processing tasks, such as enriching coach data with images from external APIs.

## Data snapshot (publieke pagina's)

`index.html`, `explore.html` en het archief `v0.9/` lezen hun data uit `data/snapshot.json`, niet rechtstreeks uit Firestore. Elke bezoeker die alle collecties uit Firestore leest kost duizenden document-reads; daarmee raakt het dagelijkse gratis quotum snel op ([Firestore quotas](https://firebase.google.com/docs/firestore/quotas)). Firestore wordt alleen nog gelezen als `data/snapshot.json` ontbreekt of onleesbaar is.

De snapshot wordt automatisch bijgewerkt door de GitHub Action `.github/workflows/pages.yml`:

- **Dagelijks om 08:23 UTC** (na de quotumreset rond middernacht Pacific-tijd) leest `.github/scripts/firestore-snapshot.mjs` de collecties `clubs`, `coaches` en `seizoenen` via de Firestore REST API (ruim 3.000 reads). Is de data veranderd, dan commit de Action `data/snapshot.json` en publiceert de site.
- **Direct bijwerken** na wijzigingen in het dashboard: GitHub → Actions → *Site publiceren* → **Run workflow**.
- **Bij elke push naar `main`** publiceert de Action de site met de snapshot die al in de repo staat, zonder Firestore te lezen.
- `data/import_transfermarkt_compleet.json` bevat het actuele seizoen en de 66 historisch gecontroleerde twijfelgevallen. De dagelijkse snapshot past deze Transfermarkt-gegevens toe zolang ze nog niet volledig in Firestore staan.
- Mislukt het uitlezen (bijvoorbeeld quotum op), dan blijft de vorige snapshot staan en stuurt GitHub een melding van de mislukte run.

Eenmalige instelling: Settings → Pages → Build and deployment → Source: **GitHub Actions**. In een openbare repo schakelt GitHub geplande workflows uit na 60 dagen zonder activiteit in de repo; zet hem dan aan via Actions → *Site publiceren* → Enable workflow.

## Site (hoofdversie)

- Ontwerp: Claude Design. Verkenner optie 7a, header 12b, intro `design_handoff_intro`. Donker thema; logo: `logo-carousel.svg`; favicon: `favicon.svg` (donkere lijnen, licht in een donkere browser). Mobiel is nog niet apart ontworpen (tekst boven de figuur, vegen voor volgende/vorige).
- Intro: speelt zelf af (pijltjes ←/→ wisselen scène, spatie start of pauzeert). De huidige scène staat in `localStorage` (`mmgr-intro-step`). Alle cijfers en teksten met cijfers komen uit de data.
- Foto's intro: zet eigen bestanden in `images/intro/`: `ferguson-hero.jpg`, `mourinho-hero.jpg` (titelscherm), `ferguson-1986.jpg`, `ferguson-trophy.jpg`, `mourinho-porto.jpg` (portretten). Ontbreekt een bestand, dan toont de app de foto uit de database (Wikimedia).
- `data/mourinho_buiten_dataset.json`: Mourinho's seizoenen buiten de database (União de Leiria, Tottenham, Fenerbahçe, Benfica 2025/26), met bronnen. Alleen voor de Mourinho-rij en de filmstrip in het intro; de statistieken (duel, staven, spreiding) rekenen alleen met de database.
- Leest `clubs`, `coaches` en `seizoenen` uit `data/snapshot.json` (zie de README in de hoofdmap). Alleen als dat bestand ontbreekt, leest de app Firestore.
- Seizoenen met meer dan één trainer (incl. interim) worden gesplitst in k gelijke rode stukken, één per trainer (max 5). Bron: veld `trainers_seizoen` op elk seizoen-document:
  `[{ naam, van: "YYYY-MM-DD", tot: "YYYY-MM-DD", interim: bool }]` plus `trainers_bron` (URL).
- Zolang dat veld nog niet in Firestore staat, gebruikt de app `data/trainers_seizoen.json` als terugval.
- Importeren in Firestore: dashboard → **Importer** → **Gecontroleerde import laden** → importeer. Dit schrijft 101 gecontroleerde clubseizoenen, maakt ontbrekende hoofdtrainers (zoals Cristian Chivu) als bewerkbaar coachprofiel aan en neemt de volledige trainerslijst en bron mee. Opnieuw importeren werkt hetzelfde document bij en maakt geen dubbel clubseizoen.
- Voor historische seizoenstrainers blijft dashboard → **Importer** → **Seizoenstrainers (trainers_seizoen)** → `data/trainers_seizoen.json` beschikbaar. Die route schrijft alleen `trainers_seizoen` en `trainers_bron`.

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

### Twijfelgevallen

De 66 eerdere twijfelgevallen zijn op 28 september 2026 gecontroleerd met de volledige Transfermarkt-trainerhistorie en opgenomen in `data/import_transfermarkt_compleet.json`. `data/twijfelgevallen.json` is daardoor leeg. Nieuwe uitzonderingen kunnen via dezelfde dashboardroute opnieuw worden beoordeeld.

## 3. Project Structure

```
.
├── articles/               # artikelen
├── data/
│   ├── snapshot.json       # export van Firestore (zie hierboven)
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

## 5. External Requirements & Configuration

To use the full functionality of this project (especially the dashboard), you will need to set up your own Firebase project.

1.  **Firebase Project:**
    * Create a new project on the [Firebase Console](https://console.firebase.google.com/).
    * Enable **Firestore Database**.
    * Enable **Authentication** and add **Google** as a Sign-in provider.
    * From your project settings, get the `firebaseConfig` object.
    * **Crucially, you must replace the placeholder `firebaseConfig` objects in `index.html` and `dashboard.html` with your own project's configuration.**

2.  **Cloud Functions:**
    * To deploy the Cloud Functions in `index.js`, you will need the Firebase CLI. Follow the official [Firebase documentation](https://firebase.google.com/docs/functions/get-started) for setup and deployment instructions.
    * The functions may require you to enable billing on your Google Cloud project.
