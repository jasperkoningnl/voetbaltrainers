# Meldingen van bezoekers

Bezoekers melden fouten via **Report an error** in de footer van elke pagina (report.js). Vanuit de verkenner kan dat ook per seizoen: `window.reportError({ club, season, coach })` opent hetzelfde formulier, vooringevuld.

Een melding komt in de Firestore-collectie `meldingen` en staat in het dashboard onder **Meldingen**. Daar zet je hem op opgelost of afgewezen, met een notitie.

## Eenmalig: Firestore-regel

Het formulier schrijft zonder inlog. Voeg in de Firebase-console (Firestore → Regels) dit blok toe binnen `match /databases/{database}/documents { ... }`, naast de bestaande regels:

```
match /meldingen/{id} {
  allow create: if request.auth == null
    && request.resource.data.keys().hasOnly(['soort','club','seizoen','coach','bericht','bron','contact','pagina','status','aangemaakt'])
    && request.resource.data.bericht is string
    && request.resource.data.bericht.size() > 0 && request.resource.data.bericht.size() <= 2000
    && request.resource.data.status == 'nieuw';
  allow read, update, delete: if request.auth != null;
}
```

Zonder deze regel geeft het formulier een foutmelding met een verwijzing naar GitHub Issues als tweede optie.
