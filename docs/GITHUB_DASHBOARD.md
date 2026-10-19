# Dashboard zonder Firebase

Clubs, trainers en seizoenen staan in `data/snapshot.json` op GitHub. Het dashboard leest de nieuwste versie, verzamelt bewerkingen in een concept en publiceert die met één expliciete commit. De website blijft op GitHub Pages. Firebase wordt niet meer gebruikt, ook niet voor inloggen, bezoekersmeldingen of het v0.9-archief.

## Eenmalige koppeling met de bestaande OAuth-app

1. Open de [bestaande GitHub OAuth-app](https://github.com/settings/applications/3946768) en stel de Authorization callback URL in op:

   `https://managerhistory-auth-jasper-konings-projects.vercel.app/api/github/callback`

2. Open [Vercel → managerhistory-auth → Environment Variables](https://vercel.com/jasper-konings-projects/managerhistory-auth/settings/environment-variables). Voeg voor Production toe:

   - `GITHUB_CLIENT_ID`: de Client ID uit dezelfde OAuth-app.
   - `GITHUB_CLIENT_SECRET`: de eerder gegenereerde Client secret.

   Vul deze rechtstreeks in Vercel in; stuur de secret niet naar een chat en zet hem niet in broncode.

3. Maak daarna een nieuwe Production-deployment van managerhistory-auth, zodat de variabelen actief worden. De dienst is ingericht met `AUTH_ORIGIN` en `ALLOWED_ORIGINS`; die hoeven niet gewijzigd te worden.

4. Controleer [de gereedheidscontrole](https://managerhistory-auth-jasper-konings-projects.vercel.app/api/health): `ready` moet `true` zijn. Dit bewijst dat de instellingen aanwezig zijn, nog niet dat de inlog werkt. Log vervolgens echt in via het dashboard en controleer een opslag en geslaagde publicatie.

## Inloggen en publiceren

**Inloggen met GitHub** opent een apart GitHub-venster. De kleine Vercel-dienst wisselt de inlogcode met de serversecret uit. Een ondertekende HttpOnly-cookie, een tijdelijke state en PKCE controleren de aanvraag. Het resultaat gaat alleen naar de toegestane dashboard-origin en wordt gecontroleerd op origin, venster en aanvraag-ID. Er staat geen toegangstoken in een redirect-URL.

De GitHub-toegang blijft alleen in het geheugen van het geopende tabblad. Na sluiten of verversen log je opnieuw in. Alleen een account met repositoryschrijfrechten kan publiceren. OAuth vraagt `public_repo`, dus geen privérepositories. Deze GitHub OAuth-scope kan ook toegang geven tot andere openbare repositories van het account; de code gebruikt uitsluitend jasperkoningnl/voetbaltrainers.

Opslaan en importeren maken eerst een concept. **Wijzigingen bekijken en publiceren** toont de gewijzigde records en schrijft één GitHub-commit. Een bevestigde commit is nog geen geslaagde publicatie: volg de getoonde publicatielink. Een tussentijdse wijziging aan de dataset blokkeert de opslag, zonder het concept weg te gooien. Download je concept voordat je het tabblad sluit of bij een conflict de nieuwste versie laadt. De browser waarschuwt bij niet-gepubliceerde wijzigingen.

## Bezoekersmeldingen en foto’s

Het formulier toont dat meldingen openbaar op GitHub komen en een GitHub-account vereisen. **Continue on GitHub** opent een vooraf ingevulde issue; de bezoeker verzendt die zelf. Het formulier vraagt geen e-mailadres en meldt geen ontvangst voordat de bezoeker daadwerkelijk heeft verzonden. Het dashboard leest deze issues en kan ze sluiten, afwijzen of heropenen. Notities zijn openbare GitHub-comments en worden direct opgeslagen, buiten het gegevensconcept.

Kandidaatfoto’s worden rechtstreeks bij Wikipedia opgezocht. De bestaande handmatige fotocontroles en gegevens blijven behouden; een kandidaat is geen automatische identiteits- of licentiecontrole.

## Oude Firebase-gegevens

De bestaande externe Firestore-database is niet verwijderd. Historische bezoekersmeldingen kunnen privécontactgegevens bevatten; ze worden niet automatisch naar openbare GitHub Issues gekopieerd. Bewaar die zo nodig via de oorspronkelijke console voordat je het oude Firebase-project later zelf verwijdert. Firebase-bronconfiguratie, SDK-imports, functies en het exportscript zijn uit deze repository verwijderd. Git bewaart de oude versies.

## Controle

`node --test data/bronnen/*.test.mjs` controleert de gegevenslaag, herimport, conflicten, OAuth-state, PKCE, callback en openbare meldingsopbouw. `node .github/scripts/validate-snapshot.mjs` controleert de publiceerbare datasetstructuur. Echte OAuth-inlog en opslag vereisen de ingevulde Client ID, secret en juiste callback; aanwezigheid van code of een groene healthcheck bewijst dat niet.
