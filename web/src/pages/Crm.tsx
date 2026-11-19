import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, exportUrl, fileForm, qs } from '../api';
import { useAuth } from '../auth';
import { Badge, Empty, ExportButtons, Loading, Notice, Pager, useLoad, useToast, titulo } from '../components/ui';
import { fmtDateTime, fmtInt, fmtMoney } from '../format';

interface Attr { key: string; label: string; kind: string; source: string }
interface Comparison { crmColumn: string; baseAttribute: string; kind?: string; equivalences?: { crm: string; base: string }[]; whenBaseEmpty?: 'ignore' | 'compare' }
interface Profile { pillar?: string; keyColumn: string; key: { stripLeadingZeros: boolean; digitsOnly: boolean }; comparisons: Comparison[] }

const SITUACAO: Record<string, { label: string; tone: string }> = {
  CONFORME: { label: 'Conforme', tone: 'ok' },
  NAO_IMPORTADO: { label: 'Não importado', tone: 'bad' },
  DIVERGENTE: { label: 'Divergente', tone: 'bad' },
  NAO_CONSTA_NA_BASE: { label: 'Não consta na base', tone: 'warn' },
};

const eqToText = (e?: { crm: string; base: string }[]) => (e ?? []).map((x) => `${x.crm} = ${x.base}`).join('\n');
const textToEq = (t: string) =>
  t.split('\n').map((l) => l.split('=')).filter((p) => p.length >= 2 && p[0].trim()).map(([a, ...b]) => ({ crm: a.trim(), base: b.join('=').trim() }));

function MappingEditor({ headers, attrsByPillar, pillars, initial, onSaved }: { headers: string[]; attrsByPillar: Record<string, Attr[]>; pillars: Record<string, string>; initial: Profile; onSaved: () => void }) {
  const toast = useToast();
  const [p, setP] = useState<Profile>(initial);
  const [eqText, setEqText] = useState<string[]>(initial.comparisons.map((c) => eqToText(c.equivalences)));
  useEffect(() => { setP(initial); setEqText(initial.comparisons.map((c) => eqToText(c.equivalences))); }, [initial]);
  const upd = (i: number, patch: Partial<Comparison>) => setP({ ...p, comparisons: p.comparisons.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const save = async () => {
    try {
      const profile = { ...p, comparisons: p.comparisons.map((c, i) => ({ ...c, equivalences: textToEq(eqText[i] ?? '') })) };
      await api('/crm/perfil', { method: 'PUT', json: { profile } });
      toast.show('ok', 'Mapeamento salvo. Ele será usado nas próximas conciliações.');
      onSaved();
    } catch (e) {
      toast.show('bad', (e as Error).message);
    }
  };
  const pillar = p.pillar ?? 'CONTRATO';
  const attrs = attrsByPillar[pillar] ?? [];
  const attrBy = new Map(attrs.map((a) => [a.key, a]));
  return (
    <div className="stack" style={{ gap: 12 }}>
      <label className="field">Identificador do confronto (pilar)
        <select value={pillar} style={{ width: 380 }} onChange={(e) => { setP({ ...p, pillar: e.target.value, comparisons: [] }); setEqText([]); }}>
          {Object.entries(pillars).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field">{pillar === 'ACORDO' ? 'Coluna do CRM com o número do acordo (chave)' : pillar === 'CPF' ? 'Coluna do CRM com o CPF/CNPJ (chave)' : 'Coluna do CRM com o número do contrato (chave)'}
          <select value={p.keyColumn} onChange={(e) => setP({ ...p, keyColumn: e.target.value })} style={{ width: 260 }}>
            {headers.map((h) => <option key={h}>{h}</option>)}
          </select>
        </label>
        {pillar === 'CONTRATO' ? <><label className="row small"><input type="checkbox" style={{ height: 'auto' }} checked={p.key.stripLeadingZeros} onChange={(e) => setP({ ...p, key: { ...p.key, stripLeadingZeros: e.target.checked } })} /> Ignorar zeros à esquerda</label>
        <label className="row small"><input type="checkbox" style={{ height: 'auto' }} checked={p.key.digitsOnly} onChange={(e) => setP({ ...p, key: { ...p.key, digitsOnly: e.target.checked } })} /> Considerar só dígitos (remove pontos, traços e espaços)</label></> : <span className="small muted">Comparado só por dígitos, sem zeros à esquerda.</span>}
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Coluna no CRM</th><th>Campo da base original</th><th>Comparar como</th><th>Equivalências de valores (CRM = base, um por linha)</th><th /></tr></thead>
          <tbody>
            {p.comparisons.map((c, i) => (
              <tr key={i}>
                <td><select value={c.crmColumn} onChange={(e) => upd(i, { crmColumn: e.target.value })} aria-label="Coluna no CRM">{headers.map((h) => <option key={h}>{h}</option>)}</select></td>
                <td>
                  <select value={c.baseAttribute} onChange={(e) => upd(i, { baseAttribute: e.target.value, kind: attrBy.get(e.target.value)?.kind })} aria-label="Campo da base">
                    {attrs.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                  <div className="small muted">{attrBy.get(c.baseAttribute)?.source}</div>
                </td>
                <td>
                  <select value={c.kind ?? attrBy.get(c.baseAttribute)?.kind} onChange={(e) => upd(i, { kind: e.target.value })} aria-label="Tipo de comparação">
                    <option value="text">Texto</option><option value="number">Número</option><option value="date">Data</option>
                  </select>
                </td>
                <td>
                  <textarea rows={2} style={{ width: 240 }} value={eqText[i] ?? ''} placeholder="Ex.: Assessoria = LEALCO" onChange={(e) => setEqText(eqText.map((t, j) => (j === i ? e.target.value : t)))} />
                  <label className="row small" style={{ marginTop: 4 }} title="Ex.: conta sem acordo não tem parcelas na base. Marcado: o CRM também precisa estar vazio.">
                    <input type="checkbox" style={{ height: 'auto' }} checked={c.whenBaseEmpty === 'compare'} onChange={(e) => upd(i, { whenBaseEmpty: e.target.checked ? 'compare' : 'ignore' })} />
                    Comparar mesmo quando a base não tem o dado
                  </label>
                </td>
                <td><button className="btn sm ghost" onClick={() => { setP({ ...p, comparisons: p.comparisons.filter((_, j) => j !== i) }); setEqText(eqText.filter((_, j) => j !== i)); }}>Remover</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row">
        <button className="btn" onClick={() => { setP({ ...p, comparisons: [...p.comparisons, { crmColumn: headers[0], baseAttribute: attrs[1]?.key ?? attrs[0].key, kind: attrs[1]?.kind ?? 'text', equivalences: [] }] }); setEqText([...eqText, '']); }}>Adicionar campo</button>
        <button className="btn primary" onClick={save}>Salvar mapeamento</button>
      </div>
      <p className="small muted">Quando a base original não tem a informação da conta (ex.: conta sem acordo não tem parcelas nem AHCOLLID), o campo não é confrontado, a menos que a opção acima esteja marcada. Textos são comparados sem acentos, sem diferença de maiúsculas e com espaços normalizados. Números aceitam formatos 1.234,56 e 1234.56. Datas aceitam dd/mm/aaaa, aaaa-mm-dd e o formato do Excel.</p>
      {toast.node}
    </div>
  );
}

function Results({ runId }: { runId: number }) {
  const [sit, setSit] = useState('DIVERGENTE');
  const [campo, setCampo] = useState('');
  const [comissao, setComissao] = useState(false);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const run = useLoad(() => api(`/crm/execucoes/${runId}`), [runId]);
  const params = { situacao: sit === 'DUPLICADOS' ? '' : sit, duplicado: sit === 'DUPLICADOS' ? 'true' : '', campo, comissao: comissao ? 'true' : '', q: query };
  const items = useLoad(() => api(`/crm/execucoes/${runId}/itens${qs({ ...params, page, pageSize: 50 })}`), [runId, sit, campo, comissao, query, page]);
  const s = run.data?.summary;
  if (!s) return <Loading />;
  const cards: [string, number][] = [['CONFORME', s.conforme], ['NAO_IMPORTADO', s.nao_importado], ['DIVERGENTE', s.divergente], ['NAO_CONSTA_NA_BASE', s.nao_consta_na_base]];
  return (
    <div className="stack">
      <section className="kpi-band">
        {cards.map(([k, n]) => (
          <button key={k} className={`kpi-group ${k === 'NAO_IMPORTADO' && n ? 'alert' : ''}`} onClick={() => { setSit(k); setPage(1); }}
            style={{ textAlign: 'left', background: sit === k ? 'var(--primary-tint)' : 'transparent', border: 0, borderLeft: '1px solid var(--rule)', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
            <h2>{SITUACAO[k].label}</h2>
            <div className="kpi-lead">{fmtInt(n)}</div>
            <div className="kpi-lead-label">
              {k === 'NAO_CONSTA_NA_BASE' ? `${fmtInt(s.nao_consta_fora_do_escopo)} fora do escopo, ${fmtInt(s.nao_consta_sem_base)} sem base` : `${s.base_contas ? ((n / s.base_contas) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : 0}% das ${fmtInt(s.base_contas)} contas`}
            </div>
          </button>
        ))}
      </section>
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><h2>Inconsistências por campo</h2></div>
          <div className="panel-body">
            <ul className="hbars">
              {s.duplicados_no_crm > 0 && <li><button className="btn ghost sm" onClick={() => { setSit('DIVERGENTE'); setCampo('REGISTRO DUPLICADO NO CRM'); setPage(1); }}>Registro duplicado no CRM</button><span /><b>{fmtInt(s.duplicados_no_crm)}</b></li>}
              {Object.entries(s.divergencias_por_campo as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                <li key={k}><button className="btn ghost sm" style={{ justifyContent: 'flex-start' }} onClick={() => { setSit('DIVERGENTE'); setCampo(k); setPage(1); }}>{k}</button><span /><b>{fmtInt(n)}</b></li>
              ))}
              {!s.duplicados_no_crm && !Object.keys(s.divergencias_por_campo).length && <li className="muted">Nenhuma inconsistência de campo.</li>}
            </ul>
            {Object.keys(s.nao_comparados_por_campo ?? {}).length > 0 && (
              <p className="small muted" style={{ marginTop: 12 }}>
                Não confrontados por ausência do dado na base original: {Object.entries(s.nao_comparados_por_campo as Record<string, number>).map(([k, n]) => `${k} (${fmtInt(n)})`).join(', ')}.
              </p>
            )}
            <p className="small muted" style={{ marginTop: 12 }}>
              {s.pilar_descricao ?? 'Pilar 2 — visão contrato'}. {s.conforme_sem_campos_confrontados ? `${fmtInt(s.conforme_sem_campos_confrontados)} conforme(s) sem nenhum campo confrontado (base sem os dados). ` : ''}CRM: {fmtInt(s.crm_linhas)} linhas, {fmtInt(s.crm_contas)} chaves distintas{s.crm_linhas_sem_chave ? `, ${fmtInt(s.crm_linhas_sem_chave)} linhas sem número de contrato` : ''}. Escopo: {s.escopo}. Processado em {(s.duracao_ms / 1000).toLocaleString('pt-BR')} s.
            </p>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><div><h2>Comissão x CRM</h2><p>Contas com comissão no escopo e sua situação no CRM.</p></div></div>
          <div className="panel-body">
            <ul className="kpi-list">
              <li>Contas com comissão <b>{fmtInt(s.comissao.contas)}</b></li>
              <li>Linhas de comissão <b>{fmtInt(s.comissao.linhas)}</b></li>
              <li>Valor recebido <b>{fmtMoney(s.comissao.valor_recebido)}</b></li>
              <li className={s.comissao.nao_importadas ? 'alert' : ''}>Não importadas no CRM <b>{fmtInt(s.comissao.nao_importadas)} ({fmtMoney(s.comissao.valor_nao_importado)})</b></li>
              <li>Divergentes no CRM <b>{fmtInt(s.comissao.divergentes)}</b></li>
            </ul>
            {Object.keys(s.alertas_regras ?? {}).length > 0 && (
              <>
                <h3 style={{ margin: '12px 0 4px' }}>Alertas de regra no escopo</h3>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{Object.entries(s.alertas_regras as Record<string, number>).map(([k, n]) => <li key={k}>{k}: <b>{fmtInt(n)}</b></li>)}</ul>
              </>
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="tabs" role="tablist">
          {cards.map(([k, n]) => <button key={k} className={sit === k ? 'on' : ''} onClick={() => { setSit(k); setCampo(''); setPage(1); }}>{SITUACAO[k].label}<span className="num">{fmtInt(n)}</span></button>)}
          <button className={sit === 'DUPLICADOS' ? 'on' : ''} onClick={() => { setSit('DUPLICADOS'); setCampo(''); setPage(1); }}>Duplicados no CRM<span className="num">{fmtInt(s.duplicados_itens ?? s.duplicados_no_crm)}</span></button>
        </div>
        <form className="row" style={{ padding: '12px 16px', alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); setQuery(q); setPage(1); }}>
          {sit === 'DIVERGENTE' && (
            <label className="field">Campo inconsistente
              <select value={campo} onChange={(e) => { setCampo(e.target.value); setPage(1); }}>
                <option value="">Todos</option><option>REGISTRO DUPLICADO NO CRM</option>
                {Object.keys(s.divergencias_por_campo).map((k) => <option key={k}>{k}</option>)}
              </select>
            </label>
          )}
          <label className="row small"><input type="checkbox" style={{ height: 'auto' }} checked={comissao} onChange={(e) => { setComissao(e.target.checked); setPage(1); }} /> Somente contas com comissão</label>
          <label className="field">Contrato ou CPF<input value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <button className="btn">Buscar</button>
          <span style={{ marginLeft: 'auto' }}><ExportButtons href={(fmt) => exportUrl(`/crm/execucoes/${runId}/itens`, params, fmt)} /></span>
        </form>
        {items.loading && !items.data ? <Loading /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Contrato</th><th>Situação</th><th>Campo inconsistente</th><th>Valor na base original</th><th>Valor no CRM</th><th>Produto / ranking / origem</th><th>Linha(s) no CRM</th></tr></thead>
              <tbody>
                {items.data?.rows.map((it: any) => {
                  const divs = it.divergencias ?? [];
                  const shown = open === it.id ? divs : divs.slice(0, 3);
                  return (
                    <Fragment key={it.id}>
                      <tr>
                        <td className="code">{it.base?.contrato || (it.base && s.pilar !== 'ACORDO' && s.pilar !== 'CPF') ? <Link to={`/contratos/${encodeURIComponent(it.base?.contrato ?? it.contrato)}`}>{it.contrato}</Link> : it.contrato}{s.pilar === 'ACORDO' && it.base?.contrato && <div className="small muted">contrato {it.base.contrato}</div>}</td>
                        <td><Badge tone={SITUACAO[it.situacao].tone}>{SITUACAO[it.situacao].label}</Badge>{it.duplicado && <div className="small" style={{ color: 'var(--warn)' }}>duplicado no CRM</div>}</td>
                        <td className="small">{divs.length ? shown.map((d: any, i: number) => <div key={i}>{d.campo} <span className="muted">({d.coluna_crm})</span></div>) : <span className="muted">{it.motivo}</span>}</td>
                        <td className="small">{shown.map((d: any, i: number) => <div key={i}>{String(d.base ?? '—')}</div>)}</td>
                        <td className="small">{shown.map((d: any, i: number) => <div key={i} style={{ color: 'var(--bad)' }}>{String(d.crm ?? '—')}</div>)}</td>
                        <td className="small">{it.base ? `${it.base.produto ?? '—'} / ${it.base.ranking ?? '—'} / ${it.base.origem ?? '—'}` : '—'}</td>
                        <td className="small">{(it.crm_rows ?? []).join(', ') || '—'}{divs.length > 3 && <div><button className="btn ghost sm" onClick={() => setOpen(open === it.id ? null : it.id)}>{open === it.id ? 'ver menos' : `+${divs.length - 3} campos`}</button></div>}</td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {items.data?.rows.length === 0 && <div className="empty">Nenhuma conta nesta situação.</div>}
          </div>
        )}
        {items.data && <Pager page={page} pageSize={50} total={items.data.total} onPage={setPage} />}
      </section>
    </div>
  );
}

export function CrmPage() {
  const { can } = useAuth();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [snapId, setSnapId] = useState<number | null>(null);
  const [scope, setScope] = useState('ATIVOS');
  const [runId, setRunId] = useState<number | null>(null);
  const snaps = useLoad(() => api('/crm/snapshots'), []);
  const runs = useLoad(() => api('/crm/execucoes'), []);
  const perfil = useLoad(() => api('/crm/perfil'), []);
  const snap = useLoad(() => (snapId ? api(`/crm/snapshots/${snapId}`) : Promise.resolve(null)), [snapId]);
  useEffect(() => {
    if (!snapId && snaps.data?.length) setSnapId(snaps.data[0].id);
  }, [snaps.data, snapId]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await api('/crm/snapshots', { method: 'POST', body: await fileForm(file) });
      toast.show('ok', `Exportação carregada: ${fmtInt(r.rows_count)} linhas e ${r.headers.length} colunas.`);
      snaps.reload();
      setSnapId(r.id);
    } catch (e) {
      toast.show('bad', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const conciliar = async () => {
    if (!snapId) return;
    setBusy(true);
    try {
      const r = await api(`/crm/snapshots/${snapId}/conciliar`, { method: 'POST', json: { scope } });
      toast.show('ok', `Conciliação concluída: ${fmtInt(r.conforme)} conformes, ${fmtInt(r.nao_importado)} não importadas, ${fmtInt(r.divergente)} divergentes.`);
      runs.reload();
      setRunId(r.runId);
    } catch (e) {
      toast.show('bad', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const headers: string[] = snap.data?.headers ?? [];
  const profile: Profile | null = perfil.data?.profile ?? null;
  const missing = profile && headers.length ? [profile.keyColumn, ...profile.comparisons.map((c) => c.crmColumn)].filter((c) => !headers.includes(c)) : [];
  const initial: Profile | null = profile && !missing.length ? profile : (snap.data?.suggestion ?? null);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{titulo('Conciliação com o CRM oficial')}</h1>
          <p>Confronta 100% das contas da base original (arquivos do banco) com a exportação do CRM oficial. O CRM nunca é alterado: o sistema apenas lê a exportação.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head"><div><h2>1. Exportação do CRM</h2><p>Envie a extração do CRM oficial em CSV (recomendado) ou XLSX, com uma linha por conta e cabeçalho na primeira linha.</p></div>
          {can('OPERADOR') && <button className="btn primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Processando…' : 'Carregar exportação do CRM'}</button>}
          <input ref={input} type="file" accept=".csv,.txt,.xlsx" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {snaps.data?.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th /><th>Arquivo</th><th>Formato</th><th className="num">Linhas</th><th>Carregado em</th><th className="num">Conciliações</th></tr></thead>
              <tbody>{snaps.data.map((s: any) => (
                <tr key={s.id} className="clickable" onClick={() => setSnapId(s.id)} style={snapId === s.id ? { background: 'var(--primary-tint)' } : undefined}>
                  <td><input type="radio" readOnly checked={snapId === s.id} style={{ height: 'auto' }} aria-label={`Selecionar ${s.original_name}`} /></td>
                  <td className="code">{s.original_name}</td><td>{s.format}</td><td className="num">{fmtInt(s.rows_count)}</td>
                  <td>{fmtDateTime(s.uploaded_at)} por {s.uploaded_by_name ?? 'sistema'}</td><td className="num">{s.runs}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <Empty title="Nenhuma exportação do CRM carregada">Carregue a extração do CRM oficial para iniciar.</Empty>}
        {snap.data?.warnings?.length > 0 && <div className="panel-body">{snap.data.warnings.map((w: string, i: number) => <Notice key={i} tone="warn">{w}</Notice>)}</div>}
        {snap.data && (
          <details className="panel-body">
            <summary>Ver as primeiras linhas desta exportação</summary>
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="data">
                <thead><tr><th className="num">Linha</th>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{snap.data.sample.map((r: any) => <tr key={r.row_number}><td className="num">{r.row_number}</td>{headers.map((h) => <td key={h} className="small">{r.data[h]}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      {snap.data && initial && perfil.data && (
        <section className="panel">
          <div className="panel-head"><div><h2>2. Mapeamento das colunas</h2>
            <p>Defina qual coluna do CRM corresponde a cada campo da base original. {profile && !missing.length ? 'Mapeamento salvo carregado.' : 'Sugestão automática pelo nome das colunas: revise antes de salvar.'}</p></div></div>
          {missing.length > 0 && profile && <div className="panel-body"><Notice tone="warn">O mapeamento salvo usa colunas que não existem nesta exportação: {missing.join(', ')}. Revise e salve novamente.</Notice></div>}
          <div className="panel-body">
            {can('OPERADOR') ? <MappingEditor headers={headers} attrsByPillar={perfil.data.atributosPorPilar} pillars={perfil.data.pilares} initial={initial} onSaved={perfil.reload} /> : <p className="muted">Somente operadores alteram o mapeamento.</p>}
          </div>
        </section>
      )}

      {snap.data && (
        <section className="panel">
          <div className="panel-head">
            <div><h2>3. Executar conciliação</h2><p>Cada execução fica registrada com o mapeamento e as regras usadas, para auditoria.</p></div>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <label className="field">Escopo da base original
                <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ width: 300 }}>
                  {Object.entries((perfil.data?.escopos ?? {}) as Record<string, string>).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              {can('OPERADOR') && <button className="btn primary" disabled={busy || !profile || missing.length > 0} onClick={conciliar}>{busy ? 'Conciliando…' : 'Executar conciliação'}</button>}
            </div>
          </div>
          {!profile && <div className="panel-body"><Notice tone="info">Salve o mapeamento das colunas para habilitar a conciliação.</Notice></div>}
        </section>
      )}

      {runs.data?.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h2>Conciliações executadas</h2></div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th className="num">#</th><th>Exportação do CRM</th><th>Escopo</th><th>Executada em</th><th className="num">Conforme</th><th className="num">Não importado</th><th className="num">Divergente</th><th className="num">Não consta</th><th /></tr></thead>
              <tbody>{runs.data.map((r: any) => (
                <tr key={r.id} style={runId === r.id ? { background: 'var(--primary-tint)' } : undefined}>
                  <td className="num">{r.id}</td><td className="code small">{r.original_name}</td><td className="small">{r.scope}</td>
                  <td className="small">{fmtDateTime(r.started_at)} por {r.started_by_name ?? 'sistema'}{r.status === 'ERRO' && <div style={{ color: 'var(--bad)' }}>{r.message}</div>}</td>
                  <td className="num">{fmtInt(r.summary?.conforme)}</td><td className="num">{fmtInt(r.summary?.nao_importado)}</td><td className="num">{fmtInt(r.summary?.divergente)}</td><td className="num">{fmtInt(r.summary?.nao_consta_na_base)}</td>
                  <td>{r.status === 'CONCLUIDO' && <button className="btn sm" onClick={() => setRunId(r.id)}>Ver resultado</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      {runId && <Results runId={runId} key={runId} />}
      {toast.node}
    </div>
  );
}
