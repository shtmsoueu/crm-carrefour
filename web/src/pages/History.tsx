import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, exportUrl, qs } from '../api';
import { ExportButtons, Loading, MapBadge, Notice, Pager, useLoad, titulo } from '../components/ui';
import { FILE_TYPE_LABELS, fmtDateTime, fmtInt, IMPORT_STATUS } from '../format';

export function HistoryPage() {
  const nav = useNavigate();
  const [f, setF] = useState({ fileType: '', status: '', q: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const { data, error, loading } = useLoad(() => api(`/imports${qs({ ...f, page, pageSize: 50 })}`), [f, page]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setPage(1); setF({ ...f, [k]: e.target.value }); };
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{titulo('Histórico')}</h1>
        </div>
        <ExportButtons href={(fmt) => exportUrl('/imports', f, fmt)} />
      </div>
      <div className="filters">
        <label className="field">Arquivo<input value={f.q} onChange={set('q')} placeholder="Parte do nome" /></label>
        <label className="field">Tipo<select value={f.fileType} onChange={set('fileType')}><option value="">Todos</option>{Object.entries(FILE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="field">Situação<select value={f.status} onChange={set('status')}><option value="">Todas</option>{Object.entries(IMPORT_STATUS).map(([v, l]) => <option key={v} value={v}>{l.label}</option>)}</select></label>
        <label className="field">Importado de<input type="date" value={f.from} onChange={set('from')} /></label>
        <label className="field">até<input type="date" value={f.to} onChange={set('to')} /></label>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <section className="panel">
        {loading && !data ? <Loading /> : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Arquivo</th><th>Tipo</th><th>Importado em</th><th>Usuário</th>
                  <th className="num">Recebidos</th><th className="num">Processados</th><th className="num">Conciliados</th>
                  <th className="num">Divergências abertas</th><th className="num">Rejeitados</th><th>Situação</th><th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((r: any) => (
                  <tr key={r.id} className="clickable" onClick={() => nav(`/importacao/${r.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/importacao/${r.id}`)}>
                    <td className="code">{r.original_name}</td>
                    <td className="nowrap">{FILE_TYPE_LABELS[r.file_type] ?? r.file_type}</td>
                    <td className="nowrap">{fmtDateTime(r.uploaded_at)}</td>
                    <td>{r.uploaded_by_name ?? 'sistema'}</td>
                    <td className="num">{fmtInt(r.data_records)}</td>
                    <td className="num">{fmtInt(r.valid_records)}</td>
                    <td className="num">{fmtInt(r.conciliated_records)}</td>
                    <td className="num">{fmtInt(r.open_divergences)}</td>
                    <td className="num">{fmtInt(r.rejected_records)}</td>
                    <td><MapBadge map={IMPORT_STATUS} value={r.status} /></td>
                    <td className="small" style={{ minWidth: 220 }}>{r.processing_result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data?.rows.length === 0 && <div className="empty">Nenhuma importação encontrada.</div>}
          </div>
        )}
        {data && <Pager page={page} pageSize={50} total={data.total} onPage={setPage} />}
      </section>
    </div>
  );
}
