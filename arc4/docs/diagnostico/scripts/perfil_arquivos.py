import sys, zipfile, io, csv, glob, os, json, re
from collections import Counter, defaultdict
A=sys.argv[1]
def rows(kind, eps):
    p=f"{A}/20261119_{kind}_{eps}_OUT.zip"
    z=zipfile.ZipFile(p); f=io.TextIOWrapper(z.open(z.namelist()[0]),encoding='latin-1',newline='')
    r=csv.reader(f,delimiter=';'); h=[x.strip().lstrip('﻿') for x in next(r)]
    return h,r
def fnum(s):
    try: return float(s or 0)
    except: return 0.0
OUT={}
EPS=['0140','0144','0900']
rem_ct={}; rem_doc={}; rem_curva={}
datefmt=Counter()
for e in EPS:
    h,r=rows('REMESSA_ARC4U',e); I={k:i for i,k in enumerate(h)}
    st=defaultdict(Counter); curva=defaultdict(float); trans=Counter(); cts=set(); docs=set(); dup=0
    n=0; mism=0; renum=0; badseg=0; ncols=Counter()
    for row in r:
        n+=1; ncols[len(row)]+=1
        if len(row)<len(h): continue
        g=lambda k: row[I[k]].strip()
        co=g('contrato_original')
        if co in cts: dup+=1
        cts.add(co); docs.add(g('documento'))
        c=fnum(g('valor_curva')); rem_curva[(e,co)]=c
        gr=g('grupo_arc4u') or '(vazio)'
        st['grupo'][gr]+=1; curva[gr]+=c
        trans[(g('grupo_anterior_arc4u') or '(vazio)', gr)]+=1
        for k in ['cluster_eps','risco_devedor','acordo_ativo','inibicao_cobranca','ajuizado','tipo_de_pagamento','segmento_npl','area_de_negocio','tipo_cliente','processo_ativo','protesto','esta_demitido','elegivel_entrega_amigavel']:
            st[k][g(k) or '(vazio)']+=1
        st['estrategia'][g('nome_estrategia')]+=1
        st['prefixo'][re.split(r'[-0-9]',co)[0] or co[:3]]+=1
        if g('marcacao_ativa_atual')!=g('codigo_eps'): mism+=1
        if g('contrato')!=co: renum+=1
        if g('segmentacao_do_contrato').startswith('ERROR'): badseg+=1
        d=g('menor_data_atraso'); datefmt['remessa.menor_data_atraso:'+('8dig' if re.fullmatch(r'\d{8}',d) else 'slash' if '/' in d else 'vazio' if not d else 'outro')]+=1
    rem_ct[e]=cts; rem_doc[e]=docs
    OUT[f'remessa_{e}']=dict(linhas=n, contratos=len(cts), docs=len(docs), dup_contrato=dup, eps_vs_marcacao_diverge=mism, contrato_diferente_original=renum, segmentacao_error=badseg, ncols=dict(ncols),
        grupos={k:[v,round(curva[k],2)] for k,v in st['grupo'].most_common()},
        transicoes=[[a,b,v] for (a,b),v in trans.most_common(25)],
        **{k:dict(st[k].most_common(12)) for k in st if k!='grupo'})
    print('remessa',e,n,file=sys.stderr)
allct=set().union(*rem_ct.values())
OUT['overlap_contratos']={f'{a}&{b}':len(rem_ct[a]&rem_ct[b]) for a,b in [('0140','0144'),('0140','0900'),('0144','0900')]}
OUT['overlap_docs']={f'{a}&{b}':len(rem_doc[a]&rem_doc[b]) for a,b in [('0140','0144'),('0140','0900'),('0144','0900')]}
for e in EPS:
    # parcelas
    h,r=rows('PARCELAS',e); I={k:i for i,k in enumerate(h)}
    n=0; orf=0; orf_other=0; stc=Counter(); cts=set(); sumopen=defaultdict(float); fmt=Counter(); esc=Counter()
    for row in r:
        n+=1
        co=row[I['contrato_original']]; cts.add(co)
        if co not in rem_ct[e]:
            orf+=1
            if co in allct: orf_other+=1
        s=row[I['status_parcela']]; stc[s]+=1; esc[row[I['escriturado']]]+=1
        if s!='PA': sumopen[co]+=fnum(row[I['curva_parcela']])
        d=row[I['vencimento_parcela']]; fmt['8dig' if re.fullmatch(r'\d{8}',d) else d[:3]]+=1
    # consistency: remessa valor_curva vs sum of open parcels
    ok=bad=0; diffs=[]
    for co,s in list(sumopen.items()):
        c=rem_curva.get((e,co))
        if c is None: continue
        if abs(c-s)<=1: ok+=1
        else: bad+=1
    sem_parc=len(rem_ct[e]-cts)
    OUT[f'parcelas_{e}']=dict(linhas=n, contratos=len(cts), orfas_linhas=orf, orfas_presentes_em_outro_eps=orf_other, status=dict(stc), escriturado=dict(esc), venc_fmt=dict(fmt), curva_bate_remessa=ok, curva_diverge=bad, contratos_remessa_sem_parcela=sem_parc)
    print('parcelas',e,n,file=sys.stderr)
    # telefone
    h,r=rows('TELEFONE',e); I={k:i for i,k in enumerate(h)}
    n=0; orf=0; nums=set(); per=Counter(); ori=Counter(); src=Counter(); pri=Counter(); dupk=set(); dup=0; badlen=0
    for row in r:
        n+=1; co=row[I['contrato_original']]
        if co not in rem_ct[e]: orf+=1
        k=(co,row[I['ddd_telefone']],row[I['numero_telefone']])
        if k in dupk: dup+=1
        dupk.add(k); nums.add(k[1:]); per[co]+=1
        ori[row[I['origem_telefone']]]+=1; src[row[I['data_source_telefone']]]+=1; pri[row[I['prioridade_telefone']]]+=1
        if len(row[I['numero_telefone']]) not in (8,9): badlen+=1
    dist=Counter(min(v,10) for v in per.values())
    OUT[f'telefone_{e}']=dict(linhas=n, numeros_distintos=len(nums), orfas=orf, duplicadas=dup, numero_tamanho_invalido=badlen, origem=dict(ori.most_common(8)), fonte=dict(src.most_common(8)), prioridade=dict(pri.most_common(8)), contratos_sem_telefone=len(rem_ct[e]-set(per)), tel_por_contrato=dict(sorted(dist.items())))
    del dupk
    print('tel',e,n,file=sys.stderr)
    for kind in ['ACORDO_ATUAL','PAGAMENTO','RETIRADA','GARANTIAS','TELEFONES_BLOQUEADOS']:
        h,r=rows(kind,e); I={k:i for i,k in enumerate(h)}
        n=0; orf=0; c=defaultdict(Counter); tot=0.0; dmin=None; dmax=None
        for row in r:
            n+=1
            co=row[I['contrato_original']] if 'contrato_original' in I else ''
            if co!='*' and co not in rem_ct[e]: orf+=1
            if kind=='ACORDO_ATUAL':
                for k in ['status_acordo_atual','tipo_status_acordo_atual','eps_acordo_atual','acordo_atual_em_atraso','tipo_acordo_atual','codigo_eps_atual']: c[k][row[I[k]]]+=1
            if kind=='PAGAMENTO':
                tot+=fnum(row[I['valor_pago']]); d=row[I['data_pagamento']]
                iso=d[4:]+d[2:4]+d[:2] if len(d)==8 else d
                dmin=min(dmin or iso,iso); dmax=max(dmax or iso,iso)
            if kind=='RETIRADA': c['motivo'][row[I['motivo_retirada']]]+=1; c['data'][row[I['data_baixa']]]+=1
            if kind=='GARANTIAS': c['tipo'][row[I['tipo_garantia']]]+=1
            if kind=='TELEFONES_BLOQUEADOS': c['contrato'][ '*' if co=='*' else 'especifico']+=1
        OUT[f'{kind.lower()}_{e}']=dict(linhas=n, orfas=orf, total=round(tot,2), periodo=[dmin,dmax], **{k:dict(v.most_common(10)) for k,v in c.items()})
json.dump(OUT,open('/home/claude/profile.json','w'),ensure_ascii=False,indent=1)
