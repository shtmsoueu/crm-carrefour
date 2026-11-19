import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, exportUrl, qs } from '../api';
import { useAuth } from '../auth';
import { Badge, ExportButtons, Loading, Notice, Pager, useLoad, useToast } from '../components/ui';
import { CONTRACT_STATUS, fmtInt, fmtMoney } from '../format';
import { MapBadge } from '../components/ui';

const RANKINGS = ['G1 – MAIOR MIL', 'G1 – MENOR MIL', 'G2 – MAIOR MIL', 'G2 – MENOR MIL'];
const VAZIO = '__VAZIO__';
const EMPTY = { scope: 'ATIVOS', produto: '', ranking: '', faixa: '', origem: '', flag: '', comissao: '', q: '' };

export function CarteiraPage() {
  const { can } = useAuth();
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const regras = useLoad(() => api('/carteira/regras'), []);
  const { data, error, loading } = useLoad(() => api(`/carteira${qs({ ...f, page, pageSize: 50 })}`), [f, page]);
  const set = (patch: Partial<typeof EMPTY>) => { setPage(1); setF({ ...f, ...patch }); };
  const s = data?.summary;
  const faixas: { codigo: string; label: string; grupo: string }[] = regras.data?.faixas ?? [];
  const active = Object.entries(f).some(([k, v]) => k !== 'scope' && v);

  const changeSaldo = async (saldoCampo: string) => {
    try {
      await api('/carteira/regras', { method: 'PUT', json: { saldoCampo } });
      toast.show('ok', `Saldo de risco passa a usar ${saldoCampo}.`);
      regras.reload();
      set({});
    } catch (e) {
      toast.show('bad', (e as Error).message);
    }
  };
  const cell = (r: string, fx: string) => s?.matriz?.[r]?.[fx];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Carteira classificada</h1>
          <p>Cada conta com produto, origem, grupo, ranking e faixa de atraso, calculados a partir dos arquivos importados. Situações que as regras não cobrem ficam sinalizadas, sem classificação presumida.</p>
        </div>
        <ExportButtons href={(fmt) => exportUrl('/carteira', f, fmt)} />
      </div>

      <div className="filters">
        <label className="field">Escopo
          <select value={f.scope} onChange={(e) => set({ scope: e.target.value })} style={{ width: 260 }}>
            {Object.entries((regras.data?.escopos ?? {}) as Record<string, string>).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="field">Produto
          <select value={f.produto} onChange={(e) => set({ produto: e.target.value })}>
            <option value="">Todos</option><option>ATACADÃO</option><option>CARREFOUR</option><option>SAMS CLUB</option><option value={VAZIO}>Não identificado</option>
          </select>
        </label>
        <label className="field">Origem
          <select value={f.origem} onChange={(e) => set({ origem: e.target.value })}>
            <option value="">Todas</option><option>ASSESSORIA (DIRETO)</option><option>INDIRETO</option><option value={VAZIO}>Sem acordo identificado</option>
          </select>
        </label>
        <label className="field">Ranking
          <select value={f.ranking} onChange={(e) => set({ ranking: e.target.value })}>
            <option value="">Todos</option>{RANKINGS.map((r) => <option key={r}>{r}</option>)}<option value={VAZIO}>Sem ranking</option>
          </select>
        </label>
        <label className="field">Faixa
          <select value={f.faixa} onChange={(e) => set({ faixa: e.target.value })}>
            <option value="">Todas</option>{faixas.map((x) => <option key={x.codigo} value={x.codigo}>{x.label}</option>)}<option value={VAZIO}>Sem faixa</option>
          </select>
        </label>
        <label className="field">Contas com comissão
          <select value={f.comissao} onChange={(e) => set({ comissao: e.target.value })}><option value="">Todas</option><option value="true">Somente com comissão</option></select>
        </label>
        <form className="row" onSubmit={(e) => { e.preventDefault(); set({ q }); }} style={{ alignItems: 'flex-end' }}>
          <label className="field">Contrato ou CPF<input value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <button className="btn">Buscar</button>
        </form>
        {active && <button className="btn ghost" onClick={() => { setQ(''); set({ ...EMPTY, scope: f.scope }); }}>Limpar filtros</button>}
      </div>

      {regras.data && (
        <Notice tone="info">
          <div>
            Saldo de risco calculado com <b className="code">{regras.data.settings.saldoCampo}</b>
            {regras.data.settings.saldoCampo === 'DMAMTDLQ' ? ' ("Valor Risco Salvo (Saldo Principal)", conforme o layout do REPASSE)' : ' (Saldo Devedor Contábil)'}.
            {' '}Dias de atraso: <b className="code">U1DAYSGER02</b>. Produto pelo código <b className="code">U1PRODUTO</b>. Origem (complementar) pelo <b className="code">AHCOLLID</b> do acordo da conta, localizado pelo AHID em qualquer arquivo que traga a coluna.
            {can('ADMIN') && (
              <span> Alterar saldo para{' '}
                <button className="btn sm" onClick={() => changeSaldo(regras.data.settings.saldoCampo === 'DMAMTDLQ' ? 'DMCURBAL' : 'DMAMTDLQ')}>
                  {regras.data.settings.saldoCampo === 'DMAMTDLQ' ? 'DMCURBAL (saldo devedor)' : 'DMAMTDLQ (risco/principal)'}
                </button>
              </span>
            )}
          </div>
        </Notice>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
      {loading && !data && <Loading />}

      {s && (
        <>
          <section className="kpi-band" aria-label="Resumo da carteira">
            <div className="kpi-group">
              <h2>Contas no escopo</h2>
              <div className="kpi-lead">{fmtInt(s.contas)}</div>
              <div className="kpi-lead-label">saldo de risco {fmtMoney(s.saldo_risco)}</div>
            </div>
            <div className="kpi-group">
              <h2>Produto</h2>
              <ul className="kpi-list">
                {['ATACADÃO', 'CARREFOUR', 'SAMS CLUB', VAZIO].map((k) => (
                  <li key={k} className={k === VAZIO && s.porProduto[k] ? 'alert' : ''}>{k === VAZIO ? 'Não identificado' : k} <b>{fmtInt(s.porProduto[k]?.contas ?? 0)}</b></li>
                ))}
              </ul>
            </div>
            <div className="kpi-group">
              <h2>Origem (AHCOLLID)</h2>
              <ul className="kpi-list">
                {['ASSESSORIA (DIRETO)', 'INDIRETO', VAZIO].map((k) => (
                  <li key={k}>{k === VAZIO ? 'Sem acordo identificado' : k} <b>{fmtInt(s.porOrigem[k]?.contas ?? 0)}</b></li>
                ))}
              </ul>
            </div>
            <div className={`kpi-group ${Object.keys(s.flags).length ? 'alert' : ''}`}>
              <h2>Inconsistências</h2>
              <div className="kpi-lead">{fmtInt(Object.values(s.flags as Record<string, { contas: number }>).reduce((a, b) => a + b.contas, 0))}</div>
              <div className="kpi-lead-label">contas com dados fora das regras</div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div><h2>Distribuição por ranking e faixa de atraso</h2><p>Quantidade de contas (e saldo de risco) por ranking e faixa. Clique em um número para listar as contas.</p></div>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Ranking</th>
                    {faixas.map((x) => <th key={x.codigo} className="num" title={x.label}>F{x.codigo}</th>)}
                    <th className="num">Sem faixa</th><th className="num">Total</th><th className="num">Saldo de risco</th>
                  </tr>
                </thead>
                <tbody>
                  {[...RANKINGS, VAZIO].map((r) => {
                    const row = s.matriz[r] ?? {};
                    const tot = Object.values(row as Record<string, { contas: number; saldo: number }>).reduce((a, b) => ({ contas: a.contas + b.contas, saldo: a.saldo + b.saldo }), { contas: 0, saldo: 0 });
                    return (
                      <tr key={r}>
                        <td className="nowrap"><b>{r === VAZIO ? 'Sem ranking' : r}</b>{r === 'G1 – MENOR MIL' && (s.matriz[r] ? <div className="small" style={{ color: 'var(--warn)' }}>conflito entre regras 3 e 5</div> : null)}</td>
                        {faixas.map((x) => {
                          const c = cell(r, x.codigo);
                          // Combinações inexistentes pelas regras: faixa de outro grupo, e MENOR MIL no G1 (regra 5).
                          const invalid = (x.grupo !== r.slice(0, 2) && r !== VAZIO) || r === 'G1 – MENOR MIL';
                          return (
                            <td key={x.codigo} className="num" style={invalid ? { background: 'var(--surface-sunk)' } : undefined}>
                              {c ? <button className="btn ghost sm" style={{ padding: 0, height: 'auto' }} onClick={() => set({ ranking: r, faixa: x.codigo })}>{fmtInt(c.contas)}</button> : invalid || r === VAZIO ? '' : <span className="muted">0</span>}
                            </td>
                          );
                        })}
                        <td className="num">{cell(r, VAZIO) ? <button className="btn ghost sm" style={{ padding: 0, height: 'auto' }} onClick={() => set({ ranking: r, faixa: VAZIO })}>{fmtInt(cell(r, VAZIO)!.contas)}</button> : ''}</td>
                        <td className="num"><b>{fmtInt(tot.contas)}</b></td>
                        <td className="num">{fmtMoney(tot.saldo)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid-2">
            <section className="panel">
              <div className="panel-head"><div><h2>Inconsistências com as regras</h2><p>Somente contas cujos dados efetivamente contrariam ou não se enquadram nas regras.</p></div></div>
              <div className="panel-body">
                {Object.keys(s.flags).length === 0 ? <p className="muted">Nenhuma inconsistência com as regras neste escopo. Categorias sem registros no dia aparecem com zero na distribuição.</p> : (
                  <ul className="hbars">
                    {Object.entries(s.flags as Record<string, { label: string; contas: number }>).sort((a, b) => b[1].contas - a[1].contas).map(([k, v]) => (
                      <li key={k} style={{ gridTemplateColumns: '1fr 64px' }}>
                        <button className="btn ghost sm" style={{ justifyContent: 'flex-start', whiteSpace: 'normal', height: 'auto', textAlign: 'left', padding: 0, color: 'var(--ink)' }} onClick={() => set({ flag: k })}>{v.label}</button>
                        <b>{fmtInt(v.contas)}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
            <section className="panel">
              <div className="panel-head"><div><h2>Códigos de produto encontrados</h2><p>Confira a identificação automática (regra 4).</p></div></div>
              <div className="table-wrap" style={{ maxHeight: 320 }}>
                <table className="data">
                  <thead><tr><th>U1PRODUTO</th><th>Produto</th><th className="num">Contas</th></tr></thead>
                  <tbody>{Object.entries(s.produtoCodigos as Record<string, { produto: string | null; contas: number }>).sort((a, b) => b[1].contas - a[1].contas).map(([k, v]) => (
                    <tr key={k}><td className="code">{k === VAZIO ? '(sem código)' : k}</td><td>{v.produto ?? <Badge tone="warn">não identificado</Badge>}</td><td className="num">{fmtInt(v.contas)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="panel">
            <div className="panel-head"><div><h2>Comissão por origem</h2><p>Arquivo de comissão preservado integralmente (todas as linhas). Remuneração em valor bruto, pois o layout não define casas decimais.</p></div></div>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Origem</th><th className="num">Contas</th><th className="num">Linhas de comissão</th><th className="num">Valor recebido</th><th className="num">Remuneração devida (bruto)</th></tr></thead>
                <tbody>{Object.entries(s.comissaoPorOrigem as Record<string, any>).map(([k, v]) => (
                  <tr key={k}><td>{k === VAZIO ? 'Sem acordo identificado' : k}</td><td className="num">{fmtInt(v.contas)}</td><td className="num">{fmtInt(v.linhas)}</td><td className="num">{fmtMoney(v.valor_recebido)}</td><td className="num">{fmtInt(v.remuneracao_bruta)}</td></tr>
                ))}</tbody>
              </table>
              {Object.keys(s.comissaoPorOrigem).length === 0 && <div className="empty">Nenhuma conta com comissão neste escopo.</div>}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Contas ({fmtInt(data.total)})</h2></div>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Contrato</th><th>Status</th><th>Produto</th><th className="num">Dias</th><th className="num">Saldo risco</th><th>Ranking</th><th>Faixa</th><th>Origem</th><th>Acordo</th><th className="num">Parcelas</th><th className="num">Comissão</th><th>Alertas</th></tr></thead>
                <tbody>{data.rows.map((p: any) => (
                  <tr key={p.contrato}>
                    <td className="code"><Link to={`/contratos/${encodeURIComponent(p.contrato)}`}>{p.contrato}</Link></td>
                    <td><MapBadge map={CONTRACT_STATUS} value={p.status_contrato} /></td>
                    <td className="small">{p.produto ?? '—'}<div className="muted code">{p.produto_codigo}</div></td>
                    <td className="num">{p.dias_atraso ?? '—'}</td>
                    <td className="num">{p.saldo_risco === null ? '—' : fmtMoney(p.saldo_risco)}</td>
                    <td className="small nowrap">{p.ranking ?? '—'}</td>
                    <td className="small">{p.faixa_codigo ? `F${p.faixa_codigo}` : '—'}</td>
                    <td className="small">{p.origem ?? <span className="muted">sem acordo</span>}{p.origem_ahcollid && <div className="muted">{p.origem_ahcollid}</div>}</td>
                    <td className="small code">{p.acordo_id ?? '—'}</td>
                    <td className="num">{p.parcelas ?? '—'}</td>
                    <td className="num">{p.comissao_linhas ? fmtMoney(p.comissao_valor_recebido) : '—'}</td>
                    <td className="small">{p.flags.map((x: string) => <div key={x} style={{ color: 'var(--warn)' }}>{regras.data?.flags?.[x] ?? x}</div>)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <Pager page={page} pageSize={50} total={data.total} onPage={setPage} />
          </section>
        </>
      )}
      {toast.node}
    </div>
  );
}
