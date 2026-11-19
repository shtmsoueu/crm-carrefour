import sys, zipfile, io, csv, json, re
from collections import defaultdict
A=sys.argv[1]
def rows(kind, eps):
    z=zipfile.ZipFile(f"{A}/20261119_{kind}_{eps}_OUT.zip"); f=io.TextIOWrapper(z.open(z.namelist()[0]),encoding='latin-1',newline='')
    r=csv.reader(f,delimiter=';'); h=[x.strip() for x in next(r)]; return {k:i for i,k in enumerate(h)},r
# dicionário de instituição: (regex sobre nome_estrategia, instituição, prioridade)
INST=[(r'^ITAU',"ITAU"),(r'^SANTANDER',"SANTANDER"),(r'^PEFISA',"PERNAMBUCANAS"),(r'^NEON',"NEON"),(r'^MERCADO PAGO',"MERCADO PAGO"),
 (r'^SUPERSIM',"SUPER SIM"),(r'^PAN\b',"PAN"),(r'^NOVERDE',"NOVERDE"),(r'^INTER\b',"INTER"),(r'^LOJAS QUERO QUERO',"QUEROQUERO"),
 (r'^BRADESCO',"BRADESCO"),(r'^BTG',"BTG"),(r'^BV\b',"BV"),(r'^NUBANK',"NUBANK"),(r'^PORTOBANK',"PORTOBANK")]
# dicionário de categoria por segmento do código (sugestão, aguarda aprovação)
CAT=[(r'^NCARDC$',"Cartão"),(r'CARD$',"Cartão"),(r'CPES$',"Crédito pessoal"),(r'CONS$',"Consignado"),(r'(VEIL|VEI)$',"Financiamento de veículo"),(r'CESP$|RCES$',"Cheque especial")]
def inst(s):
    for rx,n in INST:
        if re.search(rx,s.strip()): return n
    return None
def cat(p):
    for rx,n in CAT:
        if re.search(rx,p): return n
    return None
def bucket(d):
    if d<=0: return '0'
    if d<=90: return '1-90'
    if d<=180: return '91-180'
    if d<=360: return '181-360'
    if d<=720: return '1-2a'
    if d<=1080: return '2-3a'
    return '3a+'
fl=lambda s: float(s or 0)
agg=defaultdict(lambda: dict(n=0,saldo=0.0,atr=0,b=defaultdict(int),g=defaultdict(int),pagN=0,pagV=0.0,pagNovN=0,pagNovV=0.0,acN=0,acAtivo=0,acAtraso=0,acParc=0.0))
ctr={}; unmapped=defaultdict(lambda:[0,0.0]); instc=defaultdict(set); prodmeta={}
for e in ['0140','0144','0900']:
    h,r=rows('REMESSA_ARC4U',e)
    for x in r:
        est=x[h['nome_estrategia']].strip(); p=x[h['produto_legado']].strip(); co=x[h['contrato_original']]
        i=inst(est) or 'NÃO MAPEADO'
        if i=='NÃO MAPEADO': unmapped[est][0]+=1; unmapped[est][1]+=fl(x[h['valor_curva']])
        k=(i,p,e); a=agg[k]; a['n']+=1; v=fl(x[h['valor_curva']]); a['saldo']+=v; d=int(x[h['dias_atraso']] or 0); a['atr']+=d
        a['b'][bucket(d)]+=1; a['g'][x[h['grupo_arc4u']]]+=1
        ctr[(e,co)]=k; instc[i].add(co); prodmeta[p]=cat(p)
    h,r=rows('PAGAMENTO',e)
    for x in r:
        k=ctr.get((e,x[h['contrato_original']]))
        if not k: continue
        d=x[h['data_pagamento']]; v=fl(x[h['valor_pago']]); a=agg[k]; a['pagN']+=1; a['pagV']+=v
        if d[4:]=='2026' and d[2:4]=='11' or (len(d)==8 and d[4:]+d[:2]=='202611'): a['pagNovN']+=1; a['pagNovV']+=v
    h,r=rows('ACORDO_ATUAL',e)
    for x in r:
        k=ctr.get((e,x[h['contrato_original']]))
        if not k: continue
        a=agg[k]; a['acN']+=1
        t=x[h['tipo_status_acordo_atual']]
        if t in ('ACTIVE','PROMISE'): a['acAtivo']+=1
        if x[h['acordo_atual_em_atraso']]=='Y': a['acAtraso']+=1
        a['acParc']+=fl(x[h['valor_parcela_atual']])
out=[]
for (i,p,e),a in agg.items():
    out.append([i,p,e,a['n'],round(a['saldo'],2),a['atr'],dict(a['b']),dict(a['g']),a['pagN'],round(a['pagV'],2),a['pagNovN'],round(a['pagNovV'],2),a['acN'],a['acAtivo'],a['acAtraso'],round(a['acParc'],2)])
res=dict(rows=out, inst_unicos={k:len(v) for k,v in instc.items()}, prodcat=prodmeta, unmapped={k:[v[0],round(v[1],2)] for k,v in unmapped.items()},
 inst_rules=[[rx,n] for rx,n in INST], cat_rules=[[rx,n] for rx,n in CAT])
json.dump(res,open('/home/claude/inst_agg.json','w'),ensure_ascii=False)
tot=defaultdict(lambda:[0,0.0,0,0.0])
for r in out: t=tot[r[0]]; t[0]+=r[3]; t[1]+=r[4]; t[2]+=r[10]; t[3]+=r[11]
for k,v in sorted(tot.items(), key=lambda kv:-kv[1][1]): print(f'{k:15s} {v[0]:8d} pos  uniq {res["inst_unicos"][k]:8d}  saldo {v[1]/1e6:9.1f} mi  pag nov {v[2]} {v[3]:.0f}')
print('unmapped', res['unmapped'])
print('cat none', sorted([p for p,c in prodmeta.items() if not c]))
