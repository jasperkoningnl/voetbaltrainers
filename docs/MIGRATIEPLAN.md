# Migratieplan: van Firestore naar een andere database

Stand: 27 september 2026. Prijzen en limieten gecontroleerd op de genoemde pagina's op die datum.

## 1. Uitgangssituatie

**Wat er in Firestore staat.** Drie collecties: `clubs` (35), `coaches` (ruim 700) en `seizoenen` (2.450). Samen ongeveer 1 MB. Een seizoen heeft platte velden (`club`, `seizoen`, `coachId`, `land`, `landstitel`, `nationale_beker`, `europese_prijs`) en geneste velden (`trainers_seizoen`, `trainers_controle`).

**Wie wat doet.**
- De publieke pagina's (`index.html`, `explore.html`, `v0.9/`) lezen sinds de snapshot-Action alleen `data/snapshot.json`. Ze zijn dus al los van Firestore.
- De Action leest Firestore één keer per dag (ruim 3.000 reads).
- Alleen het dashboard (`dashboard.html`) gebruikt Firestore nog echt: Google-login (Firebase Auth), lezen, schrijven en de Cloud Function `enrichCoachData`.

**Het resterende risico zit in het dashboard.** Na elke opslag in Clubs, Coaches, Seizoenen, Data Health of Importer roept het dashboard `fetchAllData` aan. Dat leest alle drie de collecties opnieuw: ruim 3.000 reads per opslag, ook bij inloggen. Met een gratis quotum van 50.000 reads per dag ([Firestore quotas](https://firebase.google.com/docs/firestore/quotas)) zit je na ongeveer 15 opslagen aan de grens. Het quotum geldt voor het hele project, dus dan valt ook de dagelijkse snapshot-run uit.

**Wat het dashboard van Firebase gebruikt** (aantal keer in de code): `getDocs` 13, `updateDoc` 7, `addDoc` 7, `deleteDoc` 5, `writeBatch` 10, `where` 4, `orderBy` 2, `serverTimestamp` 4, Google-login via `signInWithPopup` en de Cloud Function `enrichCoachData`. Die functie doet niets anders dan de Wikipedia-API vragen om een foto per trainer.

## 2. Eerst: is verhuizen nodig?

Er zijn goede redenen om te verhuizen. SQL is handiger voor analyses (tenures, trofeeën per trainer), je wordt minder afhankelijk van Google, en er is geen harde dagelijkse leesgrens meer.

Maar het quotumprobleem is ook op te lossen zonder te verhuizen. Na een opslag hoeft het dashboard alleen de lokale lijst aan te passen, in plaats van alles opnieuw te lezen. Dat is een kleine wijziging in één bestand en haalt het grootste deel van de reads weg.

**Advies:** doe die dashboardfix hoe dan ook (stap 0). Kies daarna rustig of je verder wilt verhuizen. De publieke site hangt al niet meer van de database af, dus er is geen haast.

## 3. Opties vergeleken

| | Supabase | Neon | Turso | Cloudflare D1 |
|---|---|---|---|---|
| Soort database | Postgres | Postgres | SQLite (libSQL) | SQLite |
| Gratis limiet (relevant) | 500 MB, 5 GB dataverkeer, 2 projecten | 0,5 GB, 100 rekenuren per maand | 5 GB, 500 mln rijen lezen per maand | 5 mln rijen lezen en 100.000 schrijven per dag |
| Direct vanuit de browser (zonder eigen server) | Ja: REST-API met rechten per rij (RLS) | Ja: Data API met JWT en RLS | Alleen met een token in de browser | Nee, er is een Worker nodig |
| Google-login | Ingebouwd | Via Neon Auth of een externe dienst (o.a. Firebase Auth) | Via externe dienst (Clerk, Auth0) | Zelf bouwen |
| Aandachtspunt | Gratis project pauzeert na 1 week zonder activiteit | Rekenkracht slaapt na 5 min (korte opstarttijd) | Geen ingebouwde login | Meeste bouwwerk |
| Bron | [prijzen](https://supabase.com/pricing), [pauzeren](https://supabase.com/docs/guides/platform/free-project-pausing), [Google-login](https://supabase.com/docs/guides/auth/social-login/auth-google) | [prijzen](https://neon.com/pricing), [Data API](https://neon.com/docs/data-api/get-started) | [prijzen](https://turso.tech/pricing), [autorisatie](https://docs.turso.tech/sdk/authorization) | [prijzen](https://developers.cloudflare.com/d1/platform/pricing/) |

**Supabase** past het best bij hoe de site nu werkt: het dashboard praat direct met de database, met Google-login en zonder eigen server. Dat komt het dichtst bij Firebase en kost de minste herbouw. Het pauzeren na een week is hier geen probleem: de dagelijkse snapshot-Action leest de database elke dag, en dat telt als activiteit. Wel moet je bij Google een OAuth-client aanmaken; dat gaat online in de Google Cloud Console.

**Neon** kan ook, en is een goede keuze als je puur Postgres wilt. De Data API accepteert tokens van Firebase Auth, dus je kunt de Google-login in eerste instantie laten staan en alleen de data verhuizen. Wel zijn er dan twee diensten om te beheren in plaats van één.

**Turso** is ruim en goedkoop. Voor een dashboard in de browser mist het ingebouwde login. Met één beheerder kan het wel: je plakt eenmalig een schrijf-token in het dashboard, dat het in de browser bewaart. Dat is eenvoudig, maar wie dat token heeft, kan alles schrijven. Veilig genoeg alleen als jij de enige gebruiker bent en het token geheim blijft.

**Cloudflare D1** vraagt een eigen Worker (serverfunctie) voor alle dashboardacties. Dat is het meeste werk en past minder bij de huidige opzet.

**Advies:** Supabase. Kies Neon als je Postgres zonder extra diensten wilt, en accepteert dat de login dan (voorlopig) bij Firebase blijft.

## 4. Stappenplan (uitgewerkt voor Supabase)

Alles gaat via de browser: de Supabase-website, de Google Cloud Console en GitHub. Scripts draaien als GitHub Action.

**Stap 0. Dashboard zuiniger maken (los van de migratie).**
Na opslaan alleen de gewijzigde rij in `appData` bijwerken in plaats van `fetchAllData`. Test: inloggen plus tien bewerkingen moet ruim 3.000 reads kosten in plaats van ruim 33.000.

**Stap 1. Supabase-project en schema.**
Project aanmaken in regio EU (Frankfurt). Tabellen aanmaken via de SQL-editor:
- `clubs(id text primary key, naam text, land text, logo_url text)`
- `coaches(id text primary key, naam text, nationaliteit text, nat_code text, foto_url text)`
- `seizoenen(id text primary key, club text references clubs, seizoen text, land text, coach_id text references coaches, landstitel text, nationale_beker text, europese_prijs text, trainers_seizoen jsonb, trainers_bron text, trainers_controle jsonb, overige jsonb)`

De bestaande Firestore-ID's blijven de sleutels. Zo blijven links en de koppeling met `data/*.json` werken. Onbekende extra velden gaan naar `overige`, zodat er niets verloren gaat.

**Stap 2. Beveiliging.**
Rechten per rij (RLS) aanzetten op alle tabellen. Lezen mag voor iedereen (de data is al openbaar via de snapshot). Schrijven mag alleen voor jouw Google-account: het e-mailadres staat in de policy. Daarna Google-login instellen, met de OAuth-client uit de Google Cloud Console.

**Stap 3. Data overzetten.**
Een eenmalige GitHub Action (handmatig te starten) leest `data/snapshot.json` en schrijft alles naar Supabase met de service-sleutel. Die sleutel staat als geheim (secret) in GitHub en niet in de code. Controle: aantallen per tabel gelijk aan de snapshot, en een steekproef van tien seizoenen.

**Stap 4. Snapshot-Action omzetten.**
`.github/scripts/firestore-snapshot.mjs` gaat lezen uit Supabase in plaats van Firestore, met hetzelfde uitvoerformaat. De publieke pagina's hoeven dan niet te veranderen.

**Stap 5. Dashboard omzetten.**
Dit is het grootste deel.
- Firebase-imports vervangen door `supabase-js`.
- De 13 leesacties, 7 updates, 7 toevoegingen, 5 verwijderingen en 10 batches herschrijven naar Supabase-aanroepen. Batches worden één `upsert` of een databasefunctie.
- `serverTimestamp` wordt `now()` in de database.
- `enrichCoachData` vervalt: het dashboard kan de Wikipedia-API rechtstreeks vragen, omdat die aanroepen vanuit de browser toestaat met `origin=*`.

Testen per scherm: Clubs, Coaches, Seizoenen, Importer, Data Health, Seizoenstrainers, Twijfelgevallen.

**Stap 6. Overgang.**
Een week lang met Supabase werken, terwijl Firestore alleen-lezen blijft als reserve. Daarna de Firestore-terugval uit `app.js` en `v0.9/` halen, en de Firebase-config en `functions/` opruimen.

**Stap 7. Afsluiten.**
Een laatste export van Firestore bewaren in de repo. Het Firebase-project kan daarna blijven bestaan (gratis) of worden verwijderd.

**Terugvalplan.** Tot en met stap 6 blijft Firestore ongewijzigd. Terug is dus: de dashboard-commit terugdraaien en het snapshot-script weer op Firestore zetten.

## 5. Open vragen voor jou

1. Staat het Firebase-project op het gratis Spark-plan? De quotumfout wijst daarop. Cloud Functions vereist het betaalde Blaze-plan ([Firebase-prijzen](https://firebase.google.com/pricing)), dus mogelijk werkt `enrichCoachData` nu niet. Werkt de knop "Zoek Afbeeldingen" in het dashboard?
2. Wil je Google-login houden, of is één beheerder met een geheime sleutel ook goed? Dat bepaalt of Turso een optie is.
3. Supabase of Neon? Supabase is het minste werk; Neon betekent puur Postgres met de login voorlopig bij Firebase.
4. Eerst alleen stap 0 doen, en de migratie later?
