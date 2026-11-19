import sys, zipfile, io, csv, json, statistics
from collections import defaultdict
A=sys.argv[1]
def rows(kind, eps):
    z=zipfile.ZipFile(f"{A}/20261119_{kind}_{eps}_OUT.zip"); f=io.TextIOWrapper(z.open(z.namelist()[0]),encoding='latin-1',newline='')
    r=csv.reader(f,delimiter=';'); h=[x.strip() for x in next(r)]; return {k:i for i,k in enumerate(h)},r
fl=lambda s: float(s or 0)
O={}; docs={}; cts={}; allatr=[]; tot=defaultdict(float)
grp=defaultdict(lambda: defaultdict(lambda:[0,0.0,[]]))
for e in ['0140','0144','0900']:
    h,r=rows('REMESSA_ARC4U',e); d=set(); c=set(); atr=[]; curva=0; princ=0; ac=0
    for x in r:
        d.add(x[h['documento']]); c.add(x[h['contrato_original']])
        a=int(x[h['dias_atraso']] or 0); atr.append(a)
        cv=fl(x[h['valor_curva']]); curva+=cv; princ+=fl(x[h['valor_principal']])
        g=grp[e][x[h['grupo_arc4u']]]; g[0]+=1; g[1]+=cv; g[2].append(a)
    docs[e]=d; cts[e]=c
    O[e]=dict(contratos=len(c), cpfs=len(d), curva=round(curva,2), principal=round(princ,2), atraso_medio=round(statistics.mean(atr),1), atraso_mediano=int(statistics.median(atr)))
    allatr+=atr
    O[e]['grupos']={g:[v[0],round(v[1],2),round(statistics.mean(v[2]),1),int(statistics.median(v[2]))] for g,v in grp[e].items()}
E=['0140','0144','0900']
union_c=set().union(*cts.values()); union_d=set().union(*docs.values())
multi=[c for c in union_c if sum(c in cts[e] for e in E)>1]
for e in E:
    O[e]['coincidentes_eps']=sum(1 for c in cts[e] if any(c in cts[o] for o in E if o!=e))
    O[e]['cpfs_em_outra_eps']=sum(1 for d in docs[e] if any(d in docs[o] for o in E if o!=e))
O['consolidado']=dict(posicoes=sum(O[e]['contratos'] for e in E), contratos_unicos=len(union_c), cpfs_unicos=len(union_d), curva=round(sum(O[e]['curva'] for e in E),2), atraso_medio=round(statistics.mean(allatr),1), atraso_mediano=int(statistics.median(allatr)), coincidentes_eps=len(multi))
# retiradas por motivo e eps
for e in E:
    h,r=rows('RETIRADA',e); m=defaultdict(int)
    for x in r: m[x[h['motivo_retirada']]]+=1
    O[e]['retiradas']=dict(m)
json.dump(O,open('/home/claude/eps_stats.json','w'),indent=1,ensure_ascii=False)
for k,v in O.items():
    print(k,{a:b for a,b in v.items() if a!='grupos'})
