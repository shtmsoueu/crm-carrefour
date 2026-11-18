import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, exportUrl, qs } from '../api';
import { useAuth } from '../auth';
import { ExportButtons, Loading, MapBadge, Notice, Pager, useLoad, useToast } from '../components/ui';
import { FILE_TYPE_LABELS, fmtDate, fmtDateTime, fmtInt, RESULT_LABELS } from '../format';

export function ReconciliationPage() {
  const { can } = useAuth();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const flow = sp.get('flow') ?? '';
  const [status, setStatus] = useState('');
  const [rule, setRule] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [running, setRunning] = useState<string | null>(null);
  const flows = useLoad(() => api('/reconciliation/flows'), []);
  const params = { flow, status, rule, q: query };
  const results = useLoad(() => api(`/reconciliation/results${qs({ ...params, page, pageSize: 50 })}`), [flow, status, rule, query, page]);
  const current = flows.data?.find((f: any) => f.code === flow);

  const runFlow = async (code?: string) => {
    setRunning(code ?? 'ALL');
    try {
      const r = await api('/reconciliation/run', { method: 'POST', json: code ? { flow: code } : {} });
      toast.show('ok', `Batimento executado: ${r.map((x: any) => `${x.flow.split('_')[0]} (${fmtInt(x.total)} resultados)`).join(', ')}.`);
      flows.reload();
      results.reload();
    } catch (e) {
      toast.show('bad', (e as Error).message);
    } finally {
      setRunning(null);
    }
  };
  const pick = (code: string) => {
    setPage(1);
    setRule('');
    setStatus('');
    setSp(code ? { flow: code } : {});
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Batimentos</h1>
          <p>Resultado individual por registro, com origem, destino, chave utilizada e motivo. Os fluxos são recalculados automaticamente a cada confirmação de arquivo.</p>
        </div>
        {can('OPERADOR') && <button className="btn primary" disabled={!!running} onClick={() => runFlow()}>{running === 'ALL' ? 'Executando…' : 'Executar todos os batimentos'}</button>}
      </div>

      <section className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Fluxo</th><th>Arquivos</th><th>Última execução</th><th className="num">Resultados</th><th className="num">Conciliados</th><th className="num">Pendências</th><th /></tr></thead>
            <tbody>
              {flows.data?.map((f: any) => {
                const s = f.lastRun?.summary;
                return (
                  <tr key={f.code} className="clickable" onClick={() => pick(f.code)} style={flow === f.code ? { background: 'var(--primary-tint)' } : undefined}>
                    <td><b>{f.title}</b><div className="small muted">{f.description}</div>
                      {s?.notes?.filter((n: any) => n.level === 'AGUARDANDO').map((n: any, i: number) => <div key={i} className="small" style={{ color: 'var(--warn)' }}>{n.text}</div>)}
                    </td>
                    <td className="small">{f.sources.map((x: string) => FILE_TYPE_LABELS[x] ?? x).join(', ')}</td>
                    <td className="small nowrap">{f.lastRun ? fmtDateTime(f.lastRun.finished_at ?? f.lastRun.started_at) : 'Nunca'}{f.lastRun?.status === 'ERRO' && <div style={{ color: 'var(--bad)' }}>{f.lastRun.message}</div>}</td>
                    <td className="num">{fmtInt(s?.total ?? 0)}</td>
                    <td className="num">{fmtInt(s?.byStatus?.CONCILIADO ?? 0)}</td>
                    <td className="num">{fmtInt(s?.divergences ?? 0)}</td>
                    <td>{can('OPERADOR') && <button className="btn sm" disabled={!!running} onClick={(e) => { e.stopPropagation(); runFlow(f.code); }}>{running === f.code ? 'Executando…' : 'Executar'}</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {current && (
        <section className="panel">
          <div className="panel-head"><h2>Regras aplicadas em {current.title}</h2>{flow && <button className="btn sm ghost" onClick={() => pick('')}>Ver todos os fluxos</button>}</div>
          <div className="panel-body">
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{current.rules.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
            {current.lastRun?.summary?.byRule && (
              <div className="row" style={{ marginTop: 12 }}>
                {Object.entries(current.lastRun.summary.byRule as Record<string, Record<string, number>>).map(([r, st]) => (
                  <button key={r} className="btn sm" onClick={() => { setRule(r === rule ? '' : r); setPage(1); }} style={r === rule ? { borderColor: 'var(--primary)', color: 'var(--primary)' } : undefined}>
                    {r} ({fmtInt(Object.values(st).reduce((a, b) => a + b, 0))})
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <form className="filters" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q); }}>
        <label className="field">Resultado
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            {Object.entries(RESULT_LABELS).map(([v, l]) => <option key={v} value={v}>{l.label}</option>)}
          </select>
        </label>
        <label className="field">Contrato, CPF ou acordo<input value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button className="btn">Buscar</button>
        <span style={{ marginLeft: 'auto' }}><ExportButtons href={(fmt) => exportUrl('/reconciliation/results', params, fmt)} /></span>
      </form>

      <section className="panel">
        {results.error && <Notice tone="bad">{results.error}</Notice>}
        {results.loading && !results.data ? <Loading /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Fluxo / regra</th><th>Resultado</th><th>Chave</th><th>Contrato</th><th>Origem</th><th>Destino</th><th>Campo</th><th>Recebido</th><th>Esperado</th><th>Motivo</th></tr></thead>
              <tbody>
                {results.data?.rows.map((r: any) => (
                  <tr key={r.id}>
                    <td className="small"><b>{r.flow.split('_')[0]}</b> {r.rule}</td>
                    <td><MapBadge map={RESULT_LABELS} value={r.status} /></td>
                    <td className="small"><span className="muted">{r.key_name}</span><div className="code">{r.key_value ?? '—'}</div></td>
                    <td className="code">{r.contract_key ? <Link to={`/contratos/${encodeURIComponent(r.contract_key)}`}>{r.contract_key}</Link> : '—'}</td>
                    <td className="small">{r.source_type ?? '—'}{r.source_file && <div className="muted code">{r.source_file}</div>}</td>
                    <td className="small">{r.target_type ?? '—'}{r.target_file && <div className="muted code">{r.target_file}</div>}</td>
                    <td className="code small">{r.field ?? ''}</td>
                    <td className="small">{r.value_received ?? ''}</td>
                    <td className="small">{r.value_expected ?? ''}</td>
                    <td className="small" style={{ minWidth: 260 }}>{r.reason}{r.event_date && <div className="muted">Data de referência {fmtDate(r.event_date)}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {results.data?.rows.length === 0 && <div className="empty">Nenhum resultado para os filtros. Se o fluxo depende de um arquivo ainda não importado, ele aparece acima como aguardando arquivo.</div>}
          </div>
        )}
        {results.data && <Pager page={page} pageSize={50} total={results.data.total} onPage={setPage} />}
      </section>
      {toast.node}
    </div>
  );
}
