import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Empty, Loading, MapBadge, Notice } from '../components/ui';
import { AGREEMENT_STATUS, CONTRACT_STATUS, DIV_STATUS, fmtDate, fmtDateTime, fmtInt, fmtMoney, RESULT_LABELS } from '../format';
import { CATEGORY } from './Dashboard';

function Search({ initial }: { initial: string }) {
  const nav = useNavigate();
  const [q, setQ] = useState(initial);
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const go = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    try {
      const r = await api(`/contracts/search?q=${encodeURIComponent(q)}`);
      if (r.length === 1) nav(`/contratos/${encodeURIComponent(r[0].contract_key)}`);
      setRows(r);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <>
      <form className="filters" onSubmit={go} role="search">
        <label className="field" style={{ flex: 1 }}>Número do contrato ou CPF/CNPJ<input value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%' }} minLength={3} required autoFocus={!initial} /></label>
        <button className="btn primary">Pesquisar</button>
      </form>
      {error && <Notice tone="bad">{error}</Notice>}
      {rows && rows.length === 0 && <Notice tone="info">Nenhum contrato encontrado nos arquivos importados para "{q}".</Notice>}
      {rows && rows.length > 1 && (
        <section className="panel">
          <div className="panel-head"><h2>{rows.length} contratos encontrados</h2></div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Contrato</th><th>Titular</th><th>CPF/CNPJ</th><th>Situação</th><th className="num">Acordos</th><th className="num">Pendências</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.contract_key} className="clickable" onClick={() => nav(`/contratos/${encodeURIComponent(r.contract_key)}`)}>
                  <td className="code">{r.contract_key}</td><td>{r.name ?? '—'}</td><td className="code">{r.cpf ?? '—'}</td>
                  <td><MapBadge map={CONTRACT_STATUS} value={r.status} /></td><td className="num">{r.acordos}</td><td className="num">{r.pendencias}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

export function ContractPage() {
  const { key } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState('');
  useEffect(() => {
    if (!key) return;
    setData(null);
    setError(null);
    api(`/contracts/${encodeURIComponent(key)}`).then(setData).catch((e) => setError(e.message));
  }, [key]);
  const c = data?.contract;
  const kinds = [...new Set((data?.events ?? []).map((e: any) => e.label.replace(/ \d+.*$/, '')))] as string[];
  const events = (data?.events ?? []).filter((e: any) => !kind || e.label.startsWith(kind));
  const openDivs = (data?.divergences ?? []).filter((d: any) => d.status === 'ABERTA' || d.status === 'EM_ANALISE');

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Consulta de contrato</h1>
          <p>Linha do tempo completa do contrato a partir de todos os arquivos importados, com o resultado dos batimentos de cada evento.</p>
        </div>
      </div>
      <Search initial={key ?? ''} key={key} />
      {key && !data && !error && <Loading />}
      {error && <Notice tone="bad">{error}</Notice>}
      {c && (
        <>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2 className="code" style={{ fontSize: 'var(--t-xl)' }}>{c.contract_key}</h2>
                <p>{c.name ?? 'Titular não informado'}{c.cpf ? `, CPF/CNPJ ${c.cpf}` : ''}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <MapBadge map={CONTRACT_STATUS} value={c.status} />
                <div className="small muted">{c.status_date ? `desde ${fmtDate(c.status_date)} (${c.status_source})` : ''}</div>
              </div>
            </div>
            <div className="panel-body">
              <dl className="facts">
                <div><dt>Eventos</dt><dd className="num">{fmtInt(data.events.length)}</dd></div>
                <div><dt>Acordos</dt><dd className="num">{fmtInt(data.agreements.length)}</dd></div>
                <div><dt>Pendências abertas</dt><dd className="num" style={{ color: openDivs.length ? 'var(--bad)' : undefined }}>{fmtInt(openDivs.length)}</dd></div>
                <div><dt>Conhecido desde</dt><dd>{fmtDateTime(c.first_seen_at)}</dd></div>
              </dl>
            </div>
          </section>

          {data.agreements.length > 0 && (
            <section className="panel">
              <div className="panel-head"><h2>Acordos</h2></div>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Acordo (AHID)</th><th>Data</th><th>Tipo</th><th className="num">Valor</th><th className="num">Parcelas</th><th>Origem (AHCOLLID)</th><th>Situação</th></tr></thead>
                  <tbody>{data.agreements.map((a: any) => (
                    <tr key={a.ahid}><td className="code">{a.ahid}</td><td>{fmtDate(a.agreement_date)}</td><td className="code">{a.agreement_type ?? '—'}</td>
                      <td className="num">{fmtMoney(a.total_amount)}</td><td className="num">{a.installments ?? '—'}</td>
                      <td className="small">{a.ahcollid ? <>{a.ahcollid.toUpperCase() === 'LEALCO' ? 'ASSESSORIA (DIRETO)' : 'INDIRETO'} <span className="muted">({a.ahcollid}, {a.fonte})</span></> : <span className="muted">não informado nos arquivos</span>}</td>
                      <td><MapBadge map={AGREEMENT_STATUS} value={a.status} />{a.broken_at && <span className="small muted"> em {fmtDate(a.broken_at)}</span>}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel-head">
              <h2>Linha do tempo</h2>
              <label className="field">Evento
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="">Todos</option>
                  {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
            </div>
            {events.length === 0 ? <Empty title="Nenhum evento" /> : (
              <ol className="timeline">
                {events.map((e: any, i: number) => (
                  <li key={i}>
                    <div className="when">{fmtDate(e.date)}</div>
                    <div className="rail"><span className={`dot k-${e.kind}`} /></div>
                    <div className="card">
                      <h3>{e.label}</h3>
                      <div className="meta"><Link to={`/importacao/${e.importId}`} className="code">{e.file}</Link> <span>({e.status.toLowerCase()})</span></div>
                      <p>{e.info}</p>
                      {e.results.length > 0 && (
                        <div className="row">
                          {e.results.map((r: any, j: number) => (
                            <span key={j} title={r.reason ?? ''}><MapBadge map={RESULT_LABELS} value={r.status} /> <span className="small muted">{r.flow.split('_')[0]} {r.rule}</span></span>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Pendências deste contrato</h2><Link className="btn sm" to={`/pendencias?status=&q=${encodeURIComponent(c.contract_key)}`}>Abrir em pendências</Link></div>
            {data.divergences.length === 0 ? <Empty title="Nenhuma pendência registrada" /> : (
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Tipo</th><th>Campo</th><th>Recebido</th><th>Esperado</th><th>Descrição</th><th>Status</th></tr></thead>
                  <tbody>{data.divergences.map((d: any) => (
                    <tr key={d.id}><td className="small">{CATEGORY[d.category]}</td><td className="code small">{d.field ?? ''}</td><td className="small">{d.value_received ?? ''}</td><td className="small">{d.value_expected ?? ''}</td><td className="small">{d.description}</td><td><MapBadge map={DIV_STATUS} value={d.status} /></td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
