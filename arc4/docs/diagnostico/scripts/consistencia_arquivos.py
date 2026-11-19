import sys, zipfile, io, csv, json
from collections import Counter, defaultdict
A=sys.argv[1]
def rows(kind, eps):
    z=zipfile.ZipFile(f"{A}/20261119_{kind}_{eps}_OUT.zip"); f=io.TextIOWrapper(z.open(z.namelist()[0]),encoding='latin-1',newline='')
    r=csv.reader(f,delimiter=';'); h=[x.strip() for x in next(r)]; return {k:i for i,k in enumerate(h)},r
f=lambda s: float(s or 0)
O={}
h,r=rows('TELEFONES_BLOQUEADOS','0140'); blk=set((x[h['ddd_telefone_inibido']].lstrip('0'),x[h['numero_telefone_inibido']]) for x in r)
rem={}
for e in ['0140','0144','0900']:
    h,r=rows('REMESSA_ARC4U',e)
    for x in r: rem[(e,x[h['contrato_original']])]=(f(x[h['valor_curva']]),x[h['grupo_arc4u']],x[h['contrato']],f(x[h['valor_principal']]),int(x[h['dias_atraso']] or 0),x[h['acordo_ativo']])
for e in ['0140','0144','0900']:
    h,r=rows('PARCELAS',e); s=defaultdict(float)
    for x in r: s[x[h['contrato_original']]]+=f(x[h['curva_parcela']])
    ok=bad=0; ex=[]
    for co,v in s.items():
        c=rem[(e,co)][0]
        if abs(c-v)<=1: ok+=1
        else:
            bad+=1
            if len(ex)<3: ex.append([round(c,2),round(v,2)])
    O[f'curva_{e}']=dict(bate=ok,diverge=bad,ex=ex)
    h,r=rows('TELEFONE',e); hit=0; n=0
    for x in r:
        n+=1
        if (x[h['ddd_telefone']].lstrip('0'),x[h['numero_telefone']]) in blk: hit+=1
    O[f'tel_bloqueado_ainda_enviado_{e}']=hit
    h,r=rows('ACORDO_ATUAL',e); m=Counter()
    for x in r:
        k=(e,x[h['contrato_original']]); rr=rem.get(k)
        m['contrato_atual==remessa.contrato' if rr and rr[2]==x[h['contrato_atual']] else 'diferente']+=1
        m['remessa.acordo_ativo='+rr[5]]+=1
    O[f'acordo_{e}']=dict(m)
# overlap 0140/0900
ov=Counter(); same=0
for (e,co),v in rem.items():
    if e=='0140' and ('0900',co) in rem:
        w=rem[('0900',co)]; ov[(v[1],w[1])]+=1
        if abs(v[0]-w[0])<1: same+=1
O['overlap_0140_0900_grupos']=[[a,b,n] for (a,b),n in ov.most_common(10)]; O['overlap_mesma_curva']=same
# dias atraso faixas por grupo (todas EPS)
fx=defaultdict(list)
for (e,co),v in rem.items(): fx[v[1]].append(v[4])
import statistics
O['atraso_por_grupo']={g:[len(l),min(l),int(statistics.median(l)),max(l)] for g,l in fx.items()}
json.dump(O,open('/home/claude/profile2.json','w'),indent=1,ensure_ascii=False); print(json.dumps(O,ensure_ascii=False,indent=0))
