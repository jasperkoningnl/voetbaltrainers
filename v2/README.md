# Managerial Merry-Go-Round v2

Nieuwe versie naast de bestaande (`/index.html` blijft ongewijzigd).

- `index.html`, `style.css`, `app.js`: scrollende intro (Ferguson vs Mourinho) die eindigt in de verkenner (landen, clubs vergelijken, carrièremodus).
- Leest dezelfde Firestore-collecties: `clubs`, `coaches`, `seizoenen`.
- Seizoenen met meer dan één trainer (incl. interim) krijgen een gestreept patroon. Bron: veld `trainers_seizoen` op elk seizoen-document:
  `[{ naam, van: "YYYY-MM-DD", tot: "YYYY-MM-DD", interim: bool }]` plus `trainers_bron` (URL).
- Zolang dat veld nog niet in Firestore staat, gebruikt de app `data/trainers_seizoen.json` als terugval.
- Importeren in Firestore: dashboard → **Seizoenstrainers** → kies `data/trainers_seizoen.json` → controleer de preview → importeer. Alleen `trainers_seizoen` en `trainers_bron` worden geschreven.

Regel voor het gestreepte vlak: een trainer telt mee voor een seizoen als hij minstens 3 dagen tussen 1 augustus en 20 mei aan het roer stond. Wissels in de zomerstop tellen dus niet.
