import json,glob,os,re,datetime as dt,unicodedata
S=json.load(open('seizoenen.json'));C={c['_id']:c for c in json.load(open('coaches.json'))};K={c['_id']:c for c in json.load(open('clubs.json'))}
byname={c['naam']:i for i,c in K.items()}
M={'january':1,'february':2,'march':3,'april':4,'may':5,'june':6,'july':7,'august':8,'september':9,'october':10,'november':11,'december':12}
def pd(s):
    s=s.strip()
    if re.match(r'\d{4}-\d\d-\d\d',s): return dt.date.fromisoformat(s[:10])
    d,m,y=s.split(); return dt.date(int(y),M[m.lower()],int(d))
def norm(s): return re.sub(r'[^a-z ]','',unicodedata.normalize('NFD',s).encode('ascii','ignore').decode().lower().replace('ij','y'))
def same(a,b):
    a,b=norm(a).split(),norm(b).split()
    if not a or not b: return False
    return a[-1]==b[-1] or a[-1] in b or b[-1] in a or ' '.join(a) in ' '.join(b) or ' '.join(b) in ' '.join(a)
def window(y):
    return dt.date(y,8,1), (dt.date(y+1,8,31) if y==2019 else dt.date(y+1,5,20))
out=[];report=[];warn=[];twijfel=[]
for f in sorted(glob.glob('src/*.txt')):
    club=os.path.basename(f)[:-4]; cid=byname[club]
    lines=open(f).read().splitlines()
    meta={l[1:].split(' ',1)[0]:l[1:].split(' ',1)[1] for l in lines if l.startswith('#')}
    src=meta['src']; typ=meta.get('type','stint')
    body=[l for l in lines if l.strip() and not l.startswith('#')]
    seasons=sorted([s for s in S if s['club']==cid],key=lambda s:s['seizoen'])
    if typ=='season':
        lo,hi=meta['range'].split('-')
        multi={}
        for l in body:
            s,rest=[x.strip() for x in l.split('|',1)]
            multi[s]=[dict(naam=n.replace('[i]','').strip(),interim='[i]' in n) for n in rest.split(';')]
        for s in seasons:
            main=C[s['coachId']]['naam']
            if s['seizoen']<lo or s['seizoen']>hi: continue
            if s['seizoen'] in multi:
                tr=multi[s['seizoen']]
                if 'Unavail' not in main and not any(same(main,t['naam']) for t in tr):
                    report.append(f"{club} {s['seizoen']}: db={main} src={[t['naam'] for t in tr]}")
                    twijfel.append(dict(docId=s['_id'],club=cid,clubNaam=club,land=K[cid]['land'],seizoen=s['seizoen'],soort='ontbreekt',dbCoach=main,dbCoachId=s['coachId'],kandidaten=tr,bron=src))
            else:
                tr=[dict(naam=main,interim=False)] if 'Unavail' not in main else []
            if tr: out.append(dict(club=cid,seizoen=s['seizoen'],trainers=tr,bron=src))
        # also: seasons where source lists single coach but differs from DB are not checked here
        continue
    stints=[]
    for l in body:
        n,a,b,i=[x.strip() for x in l.split('|')]
        stints.append((n,pd(a),pd(b),i.lower().startswith('y')))
    first=min(x[1] for x in stints)
    for s in seasons:
        y=int(s['seizoen'][:4]); w0,w1=window(y)
        if w0<first: continue
        tr=[];days={}
        for n,a,b,i in stints:
            ov=(min(b,w1)-max(a,w0)).days
            if ov>=3:
                tr.append(dict(naam=n,van=a.isoformat(),tot=b.isoformat(),interim=i)); days[n]=days.get(n,0)+ov
        main=C[s['coachId']]['naam']
        if 'Unavail' in main: pass
        elif not any(same(main,t['naam']) for t in tr):
            report.append(f"{club} {s['seizoen']}: db={main} src={[t['naam'] for t in tr]}")
            twijfel.append(dict(docId=s['_id'],club=cid,clubNaam=club,land=K[cid]['land'],seizoen=s['seizoen'],soort='ontbreekt',dbCoach=main,dbCoachId=s['coachId'],kandidaten=[dict(t,dagen=days.get(t['naam'])) for t in tr],bron=src))
        elif days and not same(main,max(days,key=days.get)):
            warn.append(f"{club} {s['seizoen']}: db={main} longest={max(days,key=days.get)} {days}")
            twijfel.append(dict(docId=s['_id'],club=cid,clubNaam=club,land=K[cid]['land'],seizoen=s['seizoen'],soort='langst',dbCoach=main,dbCoachId=s['coachId'],kandidaten=[dict(t,dagen=days.get(t['naam'])) for t in tr],bron=src))
        if tr: out.append(dict(club=cid,seizoen=s['seizoen'],trainers=tr,bron=src))
json.dump({'twijfel':twijfel},open('twijfelgevallen.json','w'),ensure_ascii=False,indent=1)
json.dump({'seizoenen':out},open('trainers_seizoen.json','w'),ensure_ascii=False,indent=1)
multi=[o for o in out if len(o['trainers'])>1]
print(len(out),'seasons,',len(multi),'multi,',len({o['club'] for o in out}),'clubs')
print('MISMATCH\n'+'\n'.join(report)); print('WARN (longest != db)\n'+'\n'.join(warn))
