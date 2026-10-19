# Dashboard met GitHub als gegevensbron

Clubs, trainers en seizoenen staan uitsluitend in `data/snapshot.json` op `main` van `jasperkoningnl/voetbaltrainers`. Het dashboard leest de nieuwste GitHub-versie, ook wanneer de website nog op een eerdere publicatie staat.

## Gebruiken

1. Open `https://managerhistory.com/dashboard.html`.
2. Bewerk gegevens zoals voorheen. Opslaan en importeren voegt wijzigingen toe aan het concept in het geopende tabblad.
3. Kies **Wijzigingen bekijken en publiceren**. Bekijk welke records zijn toegevoegd, gewijzigd of verwijderd en geef een omschrijving.
4. Kies **Inloggen met GitHub** als je nog niet verbonden bent.
5. Kies **Publiceren naar GitHub**. Er wordt één commit gemaakt met alle wijzigingen. De bevestiging bevat de commitlink en een link naar de publicatiestatus. Een bevestigde commit is nog geen bevestigde publicatie: wacht totdat de GitHub Action geslaagd is.

Een GitHub-account zonder schrijfrechten op deze repository kan niet publiceren. Verwijderen is onderdeel van het concept en wordt pas definitief in GitHub na publiceren; oude versies blijven in de wijzigingsgeschiedenis.

Concepten en GitHub-toegang worden niet in browseropslag bewaard. Download je concept voordat je het tabblad sluit of herlaadt. De browser waarschuwt bij niet-gepubliceerde wijzigingen. De download bevat de volledige openbare dataset, geen toegangstokens en geen bezoekersmeldingen.

## Eenmalig GitHub-inloggen activeren

De code gebruikt Firebase Authentication als OAuth-tussenstap. Google is vervangen door de knop **Inloggen met GitHub**. Firestore is voor deze gegevens niet nodig; Firebase Authentication blijft wel nodig.

Controle op 19 oktober 2026: in de Firebase-console was alleen Google ingeschakeld. GitHub-inloggen is dus pas bruikbaar na onderstaande inrichting. De OAuth-configuratie wordt niet door een GitHub-codewijziging geactiveerd.

1. Registreer in [GitHub Developer settings een OAuth App](https://github.com/settings/applications/new):
   - Application name: `Manager History dashboard`.
   - Homepage URL: `https://managerhistory.com`.
   - Authorization callback URL: `https://voetbaltrainers.firebaseapp.com/__/auth/handler`.
2. Open [Firebase Authentication → Sign-in method](https://console.firebase.google.com/project/voetbaltrainers/authentication/providers), voeg **GitHub** toe en schakel die provider in.
3. Vul de Client ID en Client secret van de OAuth-app uitsluitend daar in en sla op. Zet de secret nooit in broncode, een chat, een screenshot of een repositorybestand.
4. Controleer bij Firebase Authentication → Settings → Authorized domains dat `managerhistory.com` is toegestaan. Voeg voor lokaal inlogtesten alleen een benodigde lokale testhost toe; voor lokaal gegevens bekijken is dat niet nodig.
5. Open het nieuwe dashboard, log in met GitHub en controleer in het toestemmingsvenster de gevraagde rechten.

De OAuth-app vraagt `public_repo` aan, geen `repo`: dus geen toegang tot privérepositories. GitHub OAuth beperkt deze scope niet tot één repository; het kan ook toegang tot andere openbare repositories geven waar het account rechten heeft. De dashboardcode gebruikt uitsluitend `jasperkoningnl/voetbaltrainers`. Voor fijnmaziger machtigingen is een aparte GitHub App met een serverkoppeling nodig.

Bij de eerste migratie koppelt de knop GitHub aan de reeds ingelogde Firebase-gebruiker, zodat diens bestaande UID en meldingsrechten behouden blijven. Sluit die eerste bestaande beheersessie niet voordat je hebt gekoppeld. Bij `account-exists-with-different-credential` moet de bestaande accountkoppeling worden hersteld; verlaag geen Firestore-beveiligingsregels om dit te omzeilen.

Officiële uitleg: [Firebase GitHub-inloggen](https://firebase.google.com/docs/auth/web/github-auth) en [GitHub OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps).

## Gelijktijdige wijzigingen en fouten

Het dashboard onthoudt de GitHub-bestandsversie waarop je concept is gebaseerd. Is de dataset intussen gewijzigd, dan weigert GitHub de opslag. Je concept blijft in het tabblad beschikbaar. Download het, open de nieuwste versie en verwerk de gewenste verschillen opnieuw; laat desgewenst het gedownloade concept vergelijken met de nieuwste versie. Het dashboard voert geen automatische conflictoplossing uit.

Bij een mislukte of onduidelijke netwerkrespons blijft het concept behouden. Controleer de commitgeschiedenis voordat je opnieuw publiceert. Een niet-bevestigde opslag wordt niet als geslaagd getoond.

Vóór publiceren worden unieke IDs, unieke clubseizoenen, geldige seizoenen, bestaande club- en trainerverwijzingen en prijswaarden gecontroleerd. Ook de publicatieworkflow controleert de dataset. Dat zijn structuurcontroles, geen onafhankelijke historische feitencontrole.

## Wat nog Firebase gebruikt

- Bezoekersmeldingen in de bestaande collectie `meldingen`, inclusief eventueel privécontact en afhandelnotities. Deze worden nooit aan de openbare GitHub-dataset toegevoegd. Afhandelen in het meldingen-tabblad schrijft nog direct naar Firestore.
- Firebase Authentication als tussenstap voor GitHub-inloggen.
- De bestaande functie om kandidaatfoto's op te zoeken.

Laat het Firebase-project en de huidige meldingsregels daarom bestaan. Het meldformulier op de publieke site verandert in deze stap niet. Zet meldingen pas in een volgende migratie over naar GitHub Issues, met een expliciete keuze over openbare tekst, accountvereiste en privécontact.

## Publicatie en terugdraaien

De dagelijkse Firestore-export is uit `.github/workflows/pages.yml` verwijderd. Ook handmatig **Run workflow** publiceert de gegevens uit GitHub, zonder oude imports opnieuw toe te passen. De gewone verkenner valt niet terug op verouderde Firestore-data. Het historische `v0.9/`-archief is in deze stap niet omgebouwd.

`data/import_transfermarkt_compleet.json`, de historische controlebestanden en de importknoppen blijven beschikbaar als hulpmiddel. Een import komt eerst in je concept; hij wordt niet elke dag opnieuw opgelegd aan de dataset.

Voor terugdraaien: herstel de betreffende eerdere versie van `data/snapshot.json` via een GitHub-commit en laat de publicatieworkflow draaien. De bestaande Firestore-collecties zijn in deze migratie niet verwijderd of gewijzigd. Het oude exportscript weigert nu om `data/snapshot.json` te overschrijven; gebruik voor een bewuste back-up altijd een apart uitvoerbestand.

## Validatie vóór ingebruikname

- `node --test data/bronnen/*.test.mjs`.
- `node .github/scripts/validate-snapshot.mjs`.
- Browser: laden, bewerken, conceptoverzicht en verwerpen.
- Na OAuth-inrichting: GitHub-inlog, koppeling aan bestaande Firebase-gebruiker, echte opslag en geslaagde publicatie, plus toegang tot bestaande bezoekersmeldingen. Deze laatste stappen moeten met het bevoegde account worden getest en zijn niet bewezen door unit-tests.
