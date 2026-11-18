import { useState } from 'react';
import { api, qs } from '../api';
import { Loading, Notice, Pager, useLoad } from '../components/ui';
import { fmtDateTime } from '../format';

export function AuditPage() {
  const [f, setF] = useState({ action: '', user: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const { data, error, loading } = useLoad(() => api(`/audit${qs({ ...f, page, pageSize: 50 })}`), [f, page]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setPage(1); setF({ ...f, [k]: e.target.value }); };
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Auditoria</h1><p>Registro de todas as operações: acessos, importações, confirmações, cancelamentos, reprocessamentos, batimentos, exportações e tratamentos de pendência.</p></div></div>
      <div className="filters">
        <label className="field">Ação<select value={f.action} onChange={set('action')}><option value="">Todas</option>{data?.actions?.map((a: string) => <option key={a}>{a}</option>)}</select></label>
        <label className="field">Usuário<input value={f.user} onChange={set('user')} /></label>
        <label className="field">De<input type="date" value={f.from} onChange={set('from')} /></label>
        <label className="field">até<input type="date" value={f.to} onChange={set('to')} /></label>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <section className="panel">
        {loading && !data ? <Loading /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Detalhes</th><th>IP</th></tr></thead>
              <tbody>{data?.rows.map((r: any) => (
                <tr key={r.id}><td className="nowrap">{fmtDateTime(r.created_at)}</td><td>{r.username}</td><td className="code small">{r.action}</td>
                  <td className="small">{r.entity}{r.entity_id ? ` #${r.entity_id}` : ''}</td>
                  <td>{r.details && <pre className="raw" style={{ maxWidth: 520 }}>{JSON.stringify(r.details)}</pre>}</td><td className="small">{r.ip}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {data && <Pager page={page} pageSize={50} total={data.total} onPage={setPage} />}
      </section>
    </div>
  );
}
