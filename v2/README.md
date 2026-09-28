# Managerial Merry-Go-Round v2

Nieuwe versie naast de bestaande (`/index.html` blijft ongewijzigd).

- `index.html`, `style.css`, `app.js`: scrollende intro (Ferguson vs Mourinho) die eindigt in de verkenner (weergaven League, Compare clubs en Career).
- Ontwerp verkenner en header: Claude Design, optie 7a (verkenner) en 12b (header). Donker thema; logo en favicon: `logo-carousel.svg`. Mobiel en intro zijn nog niet apart ontworpen.
- Leest `clubs`, `coaches` en `seizoenen` uit `../data/snapshot.json` (zie de README in de hoofdmap). Alleen als dat bestand ontbreekt, leest de app Firestore.
- Seizoenen met meer dan één trainer (incl. interim) worden gesplitst in k gelijke rode stukken, één per trainer (max 5). Bron: veld `trainers_seizoen` op elk seizoen-document:
  `[{ naam, van: "YYYY-MM-DD", tot: "YYYY-MM-DD", interim: bool }]` plus `trainers_bron` (URL).
- Zolang dat veld nog niet in Firestore staat, gebruikt de app `data/trainers_seizoen.json` als terugval.
- Importeren in Firestore: dashboard → **Seizoenstrainers** → kies `data/trainers_seizoen.json` → controleer de preview → importeer. Alleen `trainers_seizoen` en `trainers_bron` worden geschreven.

In de verkenner staat een gesplitst seizoen aan het begin of eind van een periode los van die periode (trainer kwam of ging halverwege het seizoen). Het intro rekent met de volledige periodes.

Regel voor een gesplitst seizoen: een trainer telt mee voor een seizoen als hij minstens 3 dagen tussen 1 augustus en 20 mei aan het roer stond. Wissels in de zomerstop tellen dus niet.

## Bronnen extra trainers

- `data/bronnen/*.txt`: per club de bronlijst (Wikipedia, per club de taal met de meest precieze lijst) met bron-URL bovenaan. Twee formaten: trainersperiodes met datums, of per seizoen de volgorde van trainers (`#type season`).
- `data/bronnen/build_trainers.py`: bouwt de ruwe bronlijsten met lokale exports van `seizoenen`, `coaches` en `clubs`.
- `data/bronnen/normaliseer_trainers.mjs`: splitst gezamenlijke trainers, verwijdert expliciete technische directeuren en past controleerbare correcties toe.
- `data/BRONNEN.md`: werkwijze voor bronrevisies en aanvullende controle met API-Football, Transfermarkt en football-data.org.
- `data/controlelijst.md`: seizoenen waar bron en database uit elkaar lopen. De database is niet aangepast.
- Nog geen data voor AS Monaco, Athletic Bilbao, Boavista en S.C. Braga (bronnen geven alleen jaartallen).

## Twijfelgevallen

`data/twijfelgevallen.json` bevat alle seizoenen waar bron en database uit elkaar lopen. In het dashboard onder **Twijfelgevallen** vink je per seizoen de trainers aan of uit, kies je de hoofdtrainer en sla je op. Dat schrijft `trainers_seizoen`, zo nodig een nieuwe `coachId`, en `trainers_controle` (status gecontroleerd). De import onder Seizoenstrainers slaat gecontroleerde seizoenen daarna over.
