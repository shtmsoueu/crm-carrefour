import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, exportUrl, qs } from '../api';
import { useAuth } from '../auth';
import { ExportButtons, Loading, MapBadge, Modal, Notice, Pager, useLoad, useToast, titulo } from '../components/ui';
import { DIV_STATUS, fmtDateTime, fmtInt } from '../format';
import { CATEGORY } from './Dashboard';

export function DivergencesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const category = sp.get('category') ?? '';
  const status = sp.get('status') ?? 'ABERTAS';
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [query, setQuery] = useState(sp.get('q') ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<any>(null);
  const [newStatus, setNewStatus] = useState('EM_ANALISE');
  const [note, setNote] = useState('');
  const summary = useLoad(() => api('/divergences/summary'), []);
  const params = { category, status, q: query, from, to };
  const list = useLoad(() => api(`/divergences${qs({ ...params, page, pageSize: 50 })}`), [category, status, query, from, to, page]);

  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    setSp(n);
    setPage(1);
  };
  const counts: Record<string, number> = {};
  for (const r of summary.data?.rows ?? []) {
    const open = r.status === 'ABERTA' || r.status === 'EM_ANALISE';
    if (status === 'ABERTAS' ? open : !status || r.status === status) counts[r.category] = (counts[r.category] ?? 0) + r.n;
  }
  const totalShown = Object.values(counts).reduce((a, b) => a + b, 0);

  const save = async () => {
    try {
      await api(`/divergences/${edit.id}`, { method: 'PATCH', json: { status: newStatus, note } });
      toast.show('ok', `Pendência #${edit.id} atualizada para ${DIV_STATUS[newStatus].label.toLowerCase()}.`);
      setEdit(null);
      list.reload();
      summary.reload();
    } catch (e) {
      toast.show('bad', (e as Error).message);
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{titulo('Pendências e divergências')}</h1>
          <p>Ocorrências identificadas na importação e nos batimentos. Uma pendência que deixa de ser detectada é encerrada automaticamente; se voltar a ocorrer, é reaberta.</p>
        </div>
        <ExportButtons href={(fmt) => exportUrl('/divergences', params, fmt)} />
      </div>

      <section className="panel">
        <div className="tabs" role="tablist" aria-label="Categorias">
          <button className={!category ? 'on' : ''} onClick={() => setParam('category', '')}>Todas<span className="num">{fmtInt(totalShown)}</span></button>
          {Object.entries(CATEGORY).map(([k, l]) => (
            <button key={k} className={category === k ? 'on' : ''} onClick={() => setParam('category', k)}>{l}<span className="num">{fmtInt(counts[k] ?? 0)}</span></button>
          ))}
        </div>
        <form className="row" style={{ padding: '12px 16px', alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); setQuery(q); setPage(1); }}>
          <label className="field">Status da resolução
            <select value={status} onChange={(e) => setParam('status', e.target.value)}>
              <option value="ABERTAS">Abertas e em análise</option>
              <option value="">Todas</option>
              {Object.entries(DIV_STATUS).map(([v, l]) => <option key={v} value={v}>{l.label}</option>)}
            </select>
          </label>
          <label className="field">Detectada de<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label>
          <label className="field">até<input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label>
          <label className="field">Contrato, CPF, acordo ou identificador<input value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <button className="btn">Buscar</button>
        </form>
        {list.error && <Notice tone="bad">{list.error}</Notice>}
        {list.loading && !list.data ? <Loading /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th className="num">ID</th><th>Tipo</th><th>Contrato</th><th>CPF/CNPJ</th><th>Arquivo / fluxo</th><th>Campo</th><th>Recebido</th><th>Esperado</th><th>Descrição</th><th>Ocorrência</th><th>Status</th><th /></tr></thead>
              <tbody>
                {list.data?.rows.map((r: any) => (
                  <tr key={r.id}>
                    <td className="num">{r.id}</td>
                    <td className="small nowrap">{CATEGORY[r.category]}</td>
                    <td className="code">{r.contract_key ? <Link to={`/contratos/${encodeURIComponent(r.contract_key)}`}>{r.contract_key}</Link> : '—'}{r.ahid && <div className="small muted">Acordo {r.ahid}</div>}</td>
                    <td className="code">{r.cpf ?? '—'}</td>
                    <td className="small">{r.source_file && <div className="code">{r.source_file}</div>}<span className="muted">{r.flow} {r.rule}</span></td>
                    <td className="code small">{r.field ?? ''}</td>
                    <td className="small">{r.value_received ?? ''}</td>
                    <td className="small">{r.value_expected ?? <span className="muted">sem referência</span>}</td>
                    <td className="small" style={{ minWidth: 260 }}>{r.description}{r.occurrences > 1 && <div className="muted">{fmtInt(r.occurrences)} ocorrências</div>}{r.resolution_note && <div className="muted">Obs.: {r.resolution_note}</div>}</td>
                    <td className="small nowrap">{fmtDateTime(r.first_detected_at)}</td>
                    <td><MapBadge map={DIV_STATUS} value={r.status} /></td>
                    <td>{can('OPERADOR') && <button className="btn sm" onClick={() => { setEdit(r); setNewStatus(r.status === 'ABERTA' ? 'EM_ANALISE' : 'RESOLVIDA'); setNote(''); }}>Tratar</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.data?.rows.length === 0 && <div className="empty"><strong>Nenhuma pendência nesta seleção</strong>Ajuste a categoria ou o status para ver outras ocorrências.</div>}
          </div>
        )}
        {list.data && <Pager page={page} pageSize={50} total={list.data.total} onPage={setPage} />}
      </section>

      {edit && (
        <Modal title={`Tratar pendência #${edit.id}`} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Voltar</button><button className="btn primary" onClick={save}>Salvar tratamento</button></>}>
          <p className="small">{edit.description}</p>
          <label className="field">Novo status
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              {['ABERTA', 'EM_ANALISE', 'RESOLVIDA', 'JUSTIFICADA'].map((s) => <option key={s} value={s}>{DIV_STATUS[s].label}</option>)}
            </select>
          </label>
          <label className="field">Observação{['RESOLVIDA', 'JUSTIFICADA'].includes(newStatus) ? ' (obrigatória)' : ''}<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </Modal>
      )}
      {toast.node}
    </div>
  );
}
