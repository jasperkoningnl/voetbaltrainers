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

Transfermarkt heeft geen publiek ondersteunde API. De links in het dashboard blijven daarom de handmatig controleerbare bron. Automatisch ophalen is kwetsbaar en kan botsen met gebruiksvoorwaarden; gebruik de back-upimport hieronder alleen bewust en bewaar de opgehaalde cache als momentopname.

Voor een eenmalige, controleerbare back-upimport is wel een apart script beschikbaar. Het leest uitsluitend de clubhistorie voor `Manager` (rol 1) en `Caretaker Manager` (rol 10), cachet de bronpagina's en schrijft een vergelijkingsrapport. Het wijzigt de dataset niet:

```powershell
node data/bronnen/importeer_transfermarkt.mjs --seasons 2025/26
```

Gericht testen kan met bijvoorbeeld `--clubs Ajax`, `--limit 1` en `--refresh`. De 35 gecontroleerde club-ID's staan in `data/bronnen/transfermarkt_clubs.json`. HTML en rapporten komen onder `.cache/transfermarkt/` en worden niet gecommit. Alleen regels met een exacte trainersrol worden verwerkt; sportief en technisch directeuren vallen buiten beide gebruikte rolcodes.

De import gebruikt dezelfde seizoensregel als de site: een trainer telt mee bij minstens drie kalenderdagen tussen 1 augustus en 20 mei. Zomerbenoemingen en zeer korte interims buiten dat venster tellen daardoor niet mee. De originele datums blijven ongewijzigd in het rapport staan.

Voor 2025/26 bouwt `node data/bronnen/maak_seizoensimport.mjs 2025/26` uit het gecontroleerde rapport het dashboardbestand `data/import_2025-26.json`. De prijswinnaars en hun controlelinks staan apart in `data/bronnen/prijzen_2025-26.json`. Met `node data/bronnen/merge_seizoensimport.mjs` worden die rijen ook in de publieke snapshot en de lokale terugvaldata gezet. De dagelijkse Firestore-export past dezelfde aanvulling toe zolang de nieuwe clubseizoenen nog niet in Firestore staan.

## football-data.org

football-data.org v4 is bruikbaar voor clubs, wedstrijden, eindstanden en actuele opstellingen. Wedstrijdobjecten kunnen een coach bevatten, maar de API biedt geen compleet historisch overzicht van trainersperiodes. Daardoor is deze bron niet geschikt voor het opbouwen van de historische trainersdataset.

De eindstanden zijn wel bruikbaar om `landstitel` per seizoen te controleren. Het script vergelijkt de nummer 1 van de zeven nationale competities met de titelmarkering in `data/*.json`, bewaart responses lokaal en wijzigt de dataset nooit automatisch:

```powershell
$env:FOOTBALL_DATA_ORG_KEY = Read-Host -MaskInput "football-data.org key"
node data/bronnen/controle_football_data_org.mjs --seasons 2024
```

Eén seizoen kost maximaal zeven requests en blijft daarmee onder de gratis limiet van tien requests per minuut. Bij meerdere komma-gescheiden seizoenen wacht het script standaard tussen requests. Als de API toch een tijdelijke limietmelding geeft, respecteert het script de opgegeven wachttijd en probeert het verzoek eenmaal opnieuw. De cache en het rapport komen onder `.cache/football-data-org/` en worden niet gecommit.

Bekende bronbeperking: football-data.org noemt Ajax als nummer 1 van de eindstand van de afgebroken Eredivisie 2019/20. Dat seizoen had officieel geen kampioen; het controlescript behandelt dit expliciet als uitzondering.


### API-bewijs in twijfelgevallen

`voeg_api_bewijs_toe.py <cache.json>` zet per twijfelgeval het veld `api_football` (gevonden periodes en dagen binnen het seizoen). Er wordt alleen een `langst` ingevuld als alle kandidaten in API-Football zijn opgezocht én gevonden; anders blijft het `null`. Het dashboard toont dit onder elke kaart. De eerste ronde (27 september 2026) dekte 10 van de 66 gevallen; daarna werd het API-account geschorst na ongeveer 35 requests.
