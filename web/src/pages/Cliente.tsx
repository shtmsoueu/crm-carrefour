import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { Badge, ContractLink, CopyButton, Empty, Hint, Loading, MapBadge, Notice, RowActions, titulo, useLoad } from '../components/ui';
import { AGREEMENT_STATUS, CONTRACT_STATUS, DIV_STATUS, fmtDate, fmtInt, fmtMoney, RESULT_LABELS } from '../format';
import { CATEGORY } from './Dashboard';


/** Visão consolidada do cliente: todos os contratos do mesmo CPF/CNPJ no mesmo contexto. */
export function ClientePage() {
  const { cpf = '' } = useParams();
  const { data, error, loading } = useLoad(() => api(`/clientes/${encodeURIComponent(cpf)}`), [cpf]);
  const [ctr, setCtr] = useState('');
  const [kind, setKind] = useState('');

  const t = data?.totais;
  const timeline = (data?.timeline ?? []).filter((e: any) =>
    (!ctr || e.contrato === ctr) && (!kind || (kind === 'PENDENCIA' ? e.kind === 'PENDENCIA' : e.kind !== 'PENDENCIA')));

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>{titulo('Cliente')}</h1></div>
        <Link className="btn sm" to="/contratos">Buscar outro</Link>
      </div>
      {loading && !data && <Loading />}
      {error && <Notice tone="bad">{error}</Notice>}
      {data && (
        <>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2 className="code" style={{ fontSize: 'var(--t-xl)' }}>{data.cpf_original} <CopyButton value={data.cpf_original} label="CPF/CNPJ" /></h2>
                <p>{data.nome ?? 'Nome não informado nos arquivos'}</p>
              </div>
              {t.pendencias_abertas > 0 ? <Badge tone="warn">{fmtInt(t.pendencias_abertas)} pendência(s) aberta(s)</Badge> : <Badge tone="ok">Sem pendências abertas</Badge>}
            </div>
            <div className="panel-body">
              <dl className="facts">
                <div><dt>Contratos</dt><dd className="num">{fmtInt(t.contratos)} <span className="small muted">({fmtInt(t.contratos_ativos)} ativos)</span></dd></div>
                <div><dt>Saldo em risco <Hint text={`Soma do saldo de risco dos contratos (campo definido em Carteira).${t.saldo_risco_sem_dado ? ` ${t.saldo_risco_sem_dado} contrato(s) sem o dado.` : ''}`} /></dt><dd className="num">{fmtMoney(t.saldo_risco)}</dd></div>
                <div><dt>Acordado</dt><dd className="num">{fmtMoney(t.acordado)} <span className="small muted">({fmtInt(t.acordos)})</span></dd></div>
                <div><dt>Pago <Hint text="Soma do PMAMT no REPASSE." /></dt><dd className="num">{fmtMoney(t.pago)}</dd></div>
                <div><dt>Comissão recebida</dt><dd className="num">{fmtMoney(t.comissao_recebida)}</dd></div>
                <div><dt>Faixa principal <Hint text="Faixa do contrato com maior saldo de risco." /></dt>
                  <dd>{t.faixa_principal ? <>{t.faixa_principal.codigo} <span className="small muted">{t.faixa_principal.faixa}</span></> : <span className="muted">—</span>}</dd></div>
              </dl>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Contratos</h2></div>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Contrato</th><th>Situação</th><th>Produto</th><th>Ranking</th><th>Faixa</th><th className="num">Dias</th><th className="num">Saldo em risco</th><th>Acordo</th><th className="num">Pago</th><th className="num">Pendências</th><th /></tr></thead>
                <tbody>
                  {data.contratos.map((c: any) => (
                    <tr key={c.contrato}>
                      <td><ContractLink contract={c.contrato} /></td>
                      <td><MapBadge map={CONTRACT_STATUS} value={c.status} /></td>
                      <td className="small">{c.produto ?? '—'}</td>
                      <td className="small">{c.ranking ?? '—'}</td>
                      <td className="small code">{c.faixa_codigo ?? '—'}</td>
                      <td className="num">{fmtInt(c.dias_atraso)}</td>
                      <td className="num">{fmtMoney(c.saldo_risco)}</td>
                      <td className="small">{c.acordo_status ? <><MapBadge map={AGREEMENT_STATUS} value={c.acordo_status} /> {c.acordo_id ? <Link to={`/acordos/${c.acordo_id}`}>{fmtMoney(c.acordo_valor)}</Link> : fmtMoney(c.acordo_valor)}</> : <span className="muted">—</span>}</td>
                      <td className="num">{fmtMoney(c.pagamentos_valor)}</td>
                      <td className="num" style={{ color: c.pendencias_abertas ? 'var(--bad)' : undefined }}>{fmtInt(c.pendencias_abertas)}<span className="muted"> / {fmtInt(c.pendencias_total)}</span></td>
                      <td className="acts"><RowActions related={{ to: `/pendencias?status=&q=${encodeURIComponent(c.contrato)}`, label: 'Pendências do contrato' }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Linha do tempo</h2>
              <div className="row">
                {data.contratos.length > 1 && (
                  <label className="field">Contrato
                    <select value={ctr} onChange={(e) => setCtr(e.target.value)}>
                      <option value="">Todos</option>
                      {data.contratos.map((c: any) => <option key={c.contrato} value={c.contrato}>{c.contrato}</option>)}
                    </select>
                  </label>
                )}
                <label className="field">Tipo
                  <select value={kind} onChange={(e) => setKind(e.target.value)}>
                    <option value="">Todos</option>
                    <option value="EVENTO">Arquivos e batimentos</option>
                    <option value="PENDENCIA">Pendências</option>
                  </select>
                </label>
              </div>
            </div>
            {data.timeline_limitada && <Notice tone="info">Linha do tempo com os primeiros {data.timeline_limitada} contratos.</Notice>}
            {timeline.length === 0 ? <Empty title="Nenhum evento" /> : (
              <ol className="timeline">
                {timeline.map((e: any, i: number) => (
                  <li key={i}>
                    <div className="when">{fmtDate(e.date)}</div>
                    <div className="rail"><span className={`dot k-${e.kind}`} /></div>
                    <div className="card">
                      <h3>{e.kind === 'PENDENCIA' ? CATEGORY[e.category] ?? e.label : e.label}{e.contrato && data.contratos.length > 1 && <span className="ctr">{e.contrato}</span>}</h3>
                      {e.kind === 'PENDENCIA' ? (
                        <>
                          <div className="meta"><Link to={`/pendencias?status=&q=${e.divergenceId}`}>Pendência #{e.divergenceId}</Link>{e.file && <span className="code"> · {e.file}</span>}</div>
                          <p>{e.info}</p>
                          <div className="row"><MapBadge map={DIV_STATUS} value={e.divStatus} /></div>
                        </>
                      ) : (
                        <>
                          <div className="meta"><Link to={`/importacao/${e.importId}`} className="code">{e.file}</Link> <span>({String(e.status).toLowerCase()})</span></div>
                          <p>{e.info}</p>
                          {e.results.length > 0 && (
                            <div className="row">
                              {e.results.map((r: any, j: number) => (
                                <span key={j} title={r.reason ?? ''}><MapBadge map={RESULT_LABELS} value={r.status} /> <span className="small muted">{r.flow.split('_')[0]} {r.rule}</span></span>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}
