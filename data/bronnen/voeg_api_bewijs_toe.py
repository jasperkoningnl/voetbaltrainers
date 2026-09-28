"""Voegt API-Football-bewijs toe aan twijfelgevallen.json (veld `api_football`).

Leest een lokale cache met /coachs?search-responses (niet in de repo) en schrijft per twijfelgeval
welke kandidaten volgens API-Football bij de club stonden, met periode en dagen binnen het seizoen
(1 augustus tot 20 mei). Bestaande velden blijven ongewijzigd. API-Football geeft alleen maanden,
en loopbanen gaan meestal niet verder terug dan de jaren tachtig.

Gebruik: python voeg_api_bewijs_toe.py <pad-naar-af_cache.json>
"""
import json, re, sys, unicodedata, datetime as dt
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent
cache = json.load(open(sys.argv[1], encoding='utf-8'))
path = DATA / 'twijfelgevallen.json'
doc = json.load(open(path, encoding='utf-8'))

def asc(s): return unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().lower()
def surname(n):
    n = re.sub(r'\(.*?\)', '', n).replace('"', '')
    t = re.sub(r"[^a-z ]", '', asc(n)).split()
    return t[-1] if t else ''
ALIAS = {'Internazionale': ['inter'], 'Olympique Marseille': ['marseille'], 'Olympique Lyonnais': ['lyon'],
         'Paris Saint-Germain': ['paris saint germain'], 'AS Saint-Étienne': ['saint etienne', 'saint-etienne'],
         'Bayern München': ['bayern'], 'Borussia Mönchengladbach': ['monchengladbach'], 'Hamburger SV': ['hamburger'],
         'Valencia CF': ['valencia'], 'FC Porto': ['porto'], 'Sporting CP': ['sporting cp', 'sporting lisbon'],
         'Atlético Madrid': ['atletico madrid'], 'Borussia Dortmund': ['dortmund'], 'FC Barcelona': ['barcelona']}
# cache-sleutels zijn zoektermen; koppel op achternaam
by_surname = {}
opgezocht = {surname(t) for t in cache}  # achternamen waarnaar gezocht is
for term, coaches in cache.items():
    for c in coaches:
        by_surname.setdefault(surname(c['name']), []).append(c)

n = 0
for case in doc['twijfel']:
    y = int(case['seizoen'][:4])
    w0, w1 = dt.date(y, 8, 1), (dt.date(y + 1, 8, 31) if y == 2019 else dt.date(y + 1, 5, 20))
    aliases = ALIAS.get(case['clubNaam'], [asc(case['clubNaam'])])
    names = [k['naam'] for k in case['kandidaten']] + ([case['dbCoach']] if case['dbCoach'] not in [k['naam'] for k in case['kandidaten']] else [])
    found = []
    for name in names:
        for coach in by_surname.get(surname(name), []):
            for car in coach['career']:
                team = asc(car['team'])
                if not any(a in team for a in aliases) or any(x in team for x in ('women', ' ii', 'u19', 'u21')):
                    continue
                s = dt.date.fromisoformat(car['start'])
                e = dt.date.fromisoformat(car['end']) if car['end'] else dt.date(2026, 6, 30)
                days = (min(e, w1) - max(s, w0)).days
                if days >= 3:
                    found.append(dict(naam=name, api_naam=coach['name'], van=car['start'], tot=car['end'], dagen=days))
    uniq = {(f['naam'], f['van'], f['tot']): f for f in found}
    found = list(uniq.values())
    niet_gezocht = [nm for nm in names if surname(nm) not in opgezocht]
    case.pop('api_football', None)
    if found:
        per = {}
        for f in found: per[f['naam']] = per.get(f['naam'], 0) + f['dagen']
        # 'langst' alleen als alle kandidaten zijn opgezocht, anders is de vergelijking scheef
        case['api_football'] = dict(bron='API-Football /coachs (maandprecisie)', opgehaald='2026-09-27',
                                    trainers=found, niet_opgezocht=niet_gezocht,
                                    langst=(max(per, key=per.get) if not niet_gezocht and all(nm in per for nm in names if not re.search(r'interim', nm, re.I)) else None))
        n += 1
json.dump(doc, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(n, 'twijfelgevallen aangevuld met API-Football')
