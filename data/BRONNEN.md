# Bronnen en controle

## Bronstrategie

De dataset maakt onderscheid tussen drie soorten bewijs:

1. Een vaste bronrevisie met individuele trainers en bruikbare periodes.
2. Een actuele bron-URL zonder vaste revisie. Deze is bruikbaar, maar niet volledig reproduceerbaar.
3. Een aanvullende controlebron. Die kan een record bevestigen of tegenspreken, maar vervangt de primaire bron niet automatisch.

Wikipedia-links horen waar mogelijk als vaste `oldid`-revisie te worden opgeslagen in `bron_revision`. Dat voorkomt dat een latere wijziging van de pagina stilzwijgend de betekenis van een oude import verandert.

## Normalisatie

Een volledige herbouw gebruikt lokale Firestore-exports in `data/bronnen/input/` en voert daarna automatisch de normalisatie uit:

```powershell
py data/bronnen/build_trainers.py
```

Alleen de bestaande JSON opnieuw normaliseren en testen:

```powershell
node data/bronnen/normaliseer_trainers.mjs
node --test data/bronnen/normaliseer_trainers.test.mjs data/bronnen/data_integriteit.test.mjs
```

De normalisatie:

- splitst gezamenlijke trainers in afzonderlijke personen;
- verwijdert uitsluitend personen die expliciet met `(DT)` als technisch directeur zijn gemarkeerd;
- legt de precisie van de brondata vast in `datum_precisie`;
- past controleerbare aanvullingen uit `correcties.json` toe;
- schrijft `normalisatie_rapport.json` met resterende beperkingen.

## API-Football

API-Football is geschikt als aanvullende controlebron. Het endpoint `/coachs?search=...` geeft per gevonden coach een loopbaan met club en begin- en einddatum. De gratis limiet is 100 requests per dag. Daarom zoekt het controlescript alleen namen uit `twijfelgevallen.json`, bewaart het iedere response lokaal en herhaalt het geen gecachete requests.

Gebruik een omgevingsvariabele; zet de sleutel nooit in een bestand of opdrachtregel:

```powershell
$env:API_FOOTBALL_KEY = Read-Host -MaskInput "API-Football key"
node data/bronnen/controle_api_football.mjs --limit 90
```

De cache en het rapport komen onder `.cache/api-football/` en worden niet gecommit. Een API-resultaat is bewijs voor handmatige controle, geen automatische toestemming om Firestore te wijzigen.

## Transfermarkt

Transfermarkt heeft geen publiek ondersteunde API. De site blijft daarom alleen een handmatige tweede bron via de links in het dashboard. Automatisch scrapen is bewust niet ingebouwd: het is kwetsbaar, slecht reproduceerbaar en kan botsen met gebruiksvoorwaarden.

## football-data.org

football-data.org v4 is bruikbaar voor clubs, wedstrijden en actuele opstellingen. Wedstrijdobjecten kunnen een coach bevatten, maar de API biedt geen compleet historisch overzicht van trainersperiodes. Daardoor is deze bron alleen geschikt voor gerichte controle van een concrete wedstrijd of recente situatie, niet voor het opbouwen van de historische dataset.


### API-bewijs in twijfelgevallen

`voeg_api_bewijs_toe.py <cache.json>` zet per twijfelgeval het veld `api_football` (gevonden periodes en dagen binnen het seizoen). Er wordt alleen een `langst` ingevuld als alle kandidaten in API-Football zijn opgezocht én gevonden; anders blijft het `null`. Het dashboard toont dit onder elke kaart. De eerste ronde (27 september 2026) dekte 10 van de 66 gevallen; daarna werd het API-account geschorst na ongeveer 35 requests.
