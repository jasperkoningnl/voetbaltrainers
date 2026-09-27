# Managerial Merry-Go-Round v2

Nieuwe versie naast de bestaande (`/index.html` blijft ongewijzigd).

- `index.html`, `style.css`, `app.js`: scrollende intro (Ferguson vs Mourinho) die eindigt in de verkenner (landen, clubs vergelijken, carrièremodus).
- Leest dezelfde Firestore-collecties: `clubs`, `coaches`, `seizoenen`.
- Seizoenen met meer dan één trainer (incl. interim) krijgen een gestreept patroon. Bron: veld `trainers_seizoen` op elk seizoen-document:
  `[{ naam, van: "YYYY-MM-DD", tot: "YYYY-MM-DD", interim: bool }]` plus `trainers_bron` (URL).
- Zolang dat veld nog niet in Firestore staat, gebruikt de app `data/trainers_seizoen.json` als terugval.
- Importeren in Firestore: dashboard → **Seizoenstrainers** → kies `data/trainers_seizoen.json` → controleer de preview → importeer. Alleen `trainers_seizoen` en `trainers_bron` worden geschreven.

Regel voor het gestreepte vlak: een trainer telt mee voor een seizoen als hij minstens 3 dagen tussen 1 augustus en 20 mei aan het roer stond. Wissels in de zomerstop tellen dus niet.

## Bronnen extra trainers

- `data/bronnen/*.txt`: per club de bronlijst (Wikipedia, per club de taal met de meest precieze lijst) met bron-URL bovenaan. Twee formaten: trainersperiodes met datums, of per seizoen de volgorde van trainers (`#type season`).
- `data/bronnen/build_trainers.py`: zet de bronlijsten om naar `data/trainers_seizoen.json` en vergelijkt elk seizoen met de hoofdtrainer in Firestore (verwacht lokale exports `seizoenen.json`, `coaches.json`, `clubs.json` en de map `src/`).
- `data/controlelijst.md`: seizoenen waar bron en database uit elkaar lopen. De database is niet aangepast.
- Nog geen data voor AS Monaco, Athletic Bilbao, Boavista en S.C. Braga (bronnen geven alleen jaartallen).
