import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, Empty, Loading, MapBadge, Modal, Notice, Pager, useLoad, useToast } from '../components/ui';
import { FILE_TYPE_LABELS, fmtBytes, fmtDate, fmtDateTime, fmtInt, fmtMoney, IMPORT_STATUS } from '../format';
import { getLayouts, type LayoutDef } from '../layouts';

const MATCH_LABEL: Record<string, string> = {
  DADOS: 'Confere com os registros de dados',
  TOTAL_LINHAS: 'Confere com o total de linhas (inclui header/trailer)',
  NAO_CONFERE: 'Não confere',
  NAO_APLICAVEL: 'Layout sem quantidade de controle',
};

function fmtField(v: string | null, type: string, decimals?: number) {
  if (v === null || v === undefined) return <span className="muted">—</span>;
  if (type === 'D') return fmtDate(v);
  if (type === 'N' && decimals === 2) return fmtMoney(v);
  return v;
}

function Records({ id, layout, types }: { id: number; layout: LayoutDef | undefined; types: Record<string, number> }) {
  const codes = Object.keys(types ?? {});
  const [rt, setRt] = useState(codes[0] ?? '');
  const [page, setPage] = useState(1);
  const [onlyInvalid, setOnlyInvalid] = useState(false);
  useEffect(() => setPage(1), [rt, onlyInvalid]);
  const { data, loading } = useLoad(() => api(`/imports/${id}/records?recordType=${encodeURIComponent(rt)}&page=${page}&pageSize=25&onlyInvalid=${onlyInvalid}`), [id, rt, page, onlyInvalid]);
  const def = layout?.records.find((r) => r.code === rt) ?? layout?.records[0];
  const fields = (def?.fields ?? []).filter((f) => !f.filler);
  if (!codes.length) return <Empty title="Nenhum registro de dados neste arquivo" />;
  return (
    <>
      <div className="row" style={{ padding: '12px 16px' }}>
        {codes.length > 1 && (
          <label className="field">Tipo de registro
            <select value={rt} onChange={(e) => setRt(e.target.value)}>
              {codes.map((c) => <option key={c} value={c}>{c} {layout?.records.find((r) => r.code === c)?.name ?? ''} ({fmtInt(types[c])})</option>)}
            </select>
          </label>
        )}
        <label className="row small"><input type="checkbox" checked={onlyInvalid} onChange={(e) => setOnlyInvalid(e.target.checked)} style={{ height: 'auto' }} /> Somente rejeitados</label>
      </div>
      {loading && !data ? <Loading /> : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="num">Linha</th>
                <th>Situação</th>
                {fields.map((f) => <th key={f.name} title={`${f.label} — posições ${f.start}-${f.end}, tipo ${f.type}`}>{f.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((r: any) => (
                <tr key={r.id}>
                  <td className="num">{r.line_number}</td>
                  <td>
                    {r.valid ? (r.dup_in_file ? <Badge tone="warn">Linha repetida</Badge> : <Badge tone="ok">Válido</Badge>) : <Badge tone="bad">Rejeitado</Badge>}
                    {r.errors?.map((e: string, i: number) => <div key={i} className="small" style={{ color: 'var(--bad)' }}>{e}</div>)}
                  </td>
                  {fields.map((f) => <td key={f.name} className={f.type === 'N' ? 'num' : 'nowrap'}>{fmtField(r.fields[f.name], f.type, f.decimals)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={page} pageSize={25} total={data.total} onPage={setPage} />}
    </>
  );
}

function Issues({ id }: { id: number }) {
  const [sev, setSev] = useState('');
  const { data } = useLoad(() => api(`/imports/${id}/issues${sev ? `?severity=${sev}` : ''}`), [id, sev]);
  const counts = Object.entries((data?.counts ?? {}) as Record<string, { severity: string; count: number }>);
  return (
    <div className="panel-body" style={{ paddingTop: 12 }}>
      {counts.length === 0 ? <Empty title="Nenhuma ocorrência de validação" /> : (
        <>
          <h3 style={{ marginBottom: 8 }}>Resumo das validações</h3>
          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table className="data">
              <thead><tr><th>Gravidade</th><th>Registro</th><th>Campo</th><th>Mensagem</th><th className="num">Ocorrências</th></tr></thead>
              <tbody>
                {counts.map(([k, v]) => {
                  const [, rt, field, msg] = k.split('|');
                  return (
                    <tr key={k}>
                      <td><Badge tone={v.severity === 'ERRO' ? 'bad' : v.severity === 'ALERTA' ? 'warn' : 'info'}>{v.severity === 'ERRO' ? 'Erro' : v.severity === 'ALERTA' ? 'Alerta' : 'Informação'}</Badge></td>
                      <td>{rt === '-' ? 'Arquivo' : rt}</td>
                      <td className="code">{field === '-' ? '' : field}</td>
                      <td>{msg}</td>
                      <td className="num">{fmtInt(v.count)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginBottom: 8 }}>
            <h3>Ocorrências por linha</h3>
            <select value={sev} onChange={(e) => setSev(e.target.value)} aria-label="Filtrar gravidade">
              <option value="">Todas</option><option value="ERRO">Erros</option><option value="ALERTA">Alertas</option>
            </select>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th className="num">Linha</th><th>Registro</th><th>Campo</th><th>Valor recebido</th><th>Mensagem</th></tr></thead>
              <tbody>
                {data?.rows.filter((r: any) => r.line_number !== null).map((r: any, i: number) => (
                  <tr key={i}><td className="num">{r.line_number}</td><td>{r.record_type}</td><td className="code">{r.field}</td><td><pre className="raw">{r.value}</pre></td><td>{r.message}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, fields }: { title: string; fields: Record<string, string | null> | null }) {
  if (!fields || !Object.keys(fields).length) return null;
  return (
    <div>
      <h3 style={{ marginBottom: 6 }}>{title}</h3>
      <dl className="kv">{Object.entries(fields).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd className="code">{v ?? '—'}</dd></Fragment>)}</dl>
    </div>
  );
}

export function ImportDetailPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const toast = useToast();
  const { data: imp, error, reload } = useLoad(() => api(`/imports/${id}`), [id]);
  const [layouts, setLayouts] = useState<LayoutDef[]>([]);
  useEffect(() => void getLayouts().then(setLayouts).catch(() => undefined), []);
  const layout = useMemo(() => layouts.find((l) => l.code === imp?.file_type), [layouts, imp]);
  const [tab, setTab] = useState<'registros' | 'validacoes' | 'controle'>('registros');
  const [action, setAction] = useState<null | 'discard' | 'cancel'>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (path: string, body?: unknown, ok?: string) => {
    setBusy(true);
    try {
      const r = await api(`/imports/${id}/${path}`, { method: 'POST', json: body ?? {} });
      const flows = r.flows as { flow: string; divergences: number }[] | undefined;
      toast.show('ok', `${ok}${flows?.length ? ` Batimentos atualizados: ${flows.map((f) => f.flow.split('_')[0]).join(', ')}.` : ''}`);
      setAction(null);
      setReason('');
      reload();
    } catch (e) {
      toast.show('bad', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!imp) return <Loading />;
  const fileErrors = imp.fileIssues.filter((i: any) => i.severity === 'ERRO');
  const fileWarns = imp.fileIssues.filter((i: any) => i.severity === 'ALERTA');

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <Link to="/historico" className="small">Histórico de importações</Link>
          <h1 className="code" style={{ fontSize: 'var(--t-xl)', wordBreak: 'break-all' }}>{imp.original_name}</h1>
          <p className="row"><MapBadge map={IMPORT_STATUS} value={imp.status} /> {FILE_TYPE_LABELS[imp.file_type] ?? imp.file_type} <span className="muted">({imp.type_detection === 'AUTOMATICA' ? 'identificado pela nomenclatura' : 'tipo selecionado manualmente'})</span></p>
        </div>
        <div className="row">
          {can('OPERADOR') && imp.status !== 'VAZIO' && <a className="btn" href={`/api/imports/${id}/download`}>Baixar original</a>}
          {can('ADMIN') && ['PRE_VISUALIZACAO', 'CONFIRMADO', 'INVALIDO'].includes(imp.status) && <button className="btn" disabled={busy} onClick={() => run('reprocess', {}, 'Arquivo reprocessado a partir do original armazenado.')}>Reprocessar</button>}
          {can('ADMIN') && imp.status === 'CONFIRMADO' && <button className="btn danger" onClick={() => setAction('cancel')}>Cancelar importação</button>}
          {can('OPERADOR') && ['PRE_VISUALIZACAO', 'INVALIDO', 'VAZIO', 'SEM_LAYOUT'].includes(imp.status) && <button className="btn danger" onClick={() => setAction('discard')}>Descartar</button>}
          {can('OPERADOR') && imp.status === 'PRE_VISUALIZACAO' && (
            <button className="btn primary" disabled={busy} onClick={() => run('confirm', {}, 'Importação confirmada.')}>{busy ? 'Processando…' : `Confirmar ${fmtInt(imp.valid_records)} registro(s)`}</button>
          )}
        </div>
      </div>

      {imp.processing_result && <Notice tone={imp.status === 'CONFIRMADO' ? 'ok' : ['VAZIO', 'INVALIDO'].includes(imp.status) ? 'bad' : 'info'}>{imp.processing_result}</Notice>}
      {fileErrors.map((i: any, n: number) => <Notice key={n} tone="bad">{i.message}</Notice>)}
      {fileWarns.map((i: any, n: number) => <Notice key={n} tone="warn">{i.message}</Notice>)}
      {imp.status === 'PRE_VISUALIZACAO' && imp.rejected_records > 0 && (
        <Notice tone="warn">{fmtInt(imp.rejected_records)} registro(s) fora do layout serão mantidos como rejeitados e gerarão pendências. Os demais serão processados.</Notice>
      )}

      <section className="panel">
        <div className="panel-body" style={{ paddingTop: 16 }}>
          <dl className="facts">
            <div><dt>Registros de dados</dt><dd className="num">{fmtInt(imp.data_records)}</dd></div>
            <div><dt>Válidos</dt><dd className="num">{fmtInt(imp.valid_records)}</dd></div>
            <div><dt>Rejeitados</dt><dd className="num" style={{ color: imp.rejected_records ? 'var(--bad)' : undefined }}>{fmtInt(imp.rejected_records)}</dd></div>
            <div><dt>Linhas repetidas no arquivo</dt><dd className="num">{fmtInt(imp.duplicate_records)}</dd></div>
            <div><dt>Total de linhas</dt><dd className="num">{fmtInt(imp.total_lines)}</dd></div>
            <div><dt>Quantidade do trailer</dt><dd>{imp.trailer_count ?? '—'} <span className="small muted">{MATCH_LABEL[imp.trailer_count_match] ?? ''}</span></dd></div>
            <div><dt>Data de geração (header)</dt><dd>{fmtDate(imp.generation_date)}</dd></div>
            <div><dt>Sequência do arquivo</dt><dd className="code">{imp.sequence_number ?? '—'}</dd></div>
            <div><dt>Data no nome do arquivo</dt><dd>{fmtDate(imp.file_name_date)}</dd></div>
            <div><dt>Assessoria</dt><dd>{imp.agency_code ?? '—'}</dd></div>
            <div><dt>Tamanho</dt><dd>{fmtBytes(Number(imp.size_bytes))}</dd></div>
            <div><dt>Enviado</dt><dd>{fmtDateTime(imp.uploaded_at)} por {imp.uploaded_by_name ?? 'sistema'}</dd></div>
            <div><dt>Confirmado</dt><dd>{imp.confirmed_at ? `${fmtDateTime(imp.confirmed_at)} por ${imp.confirmed_by_name ?? 'sistema'}` : '—'}</dd></div>
            <div><dt>Reprocessamentos</dt><dd className="num">{imp.reprocess_count}</dd></div>
            <div><dt>SHA-256</dt><dd className="code small" style={{ wordBreak: 'break-all' }}>{imp.sha256}</dd></div>
          </dl>
        </div>
      </section>

      <section className="panel">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'registros'} className={tab === 'registros' ? 'on' : ''} onClick={() => setTab('registros')}>Dados interpretados<span className="num">{fmtInt(imp.data_records)}</span></button>
          <button role="tab" aria-selected={tab === 'validacoes'} className={tab === 'validacoes' ? 'on' : ''} onClick={() => setTab('validacoes')}>Validações</button>
          <button role="tab" aria-selected={tab === 'controle'} className={tab === 'controle' ? 'on' : ''} onClick={() => setTab('controle')}>Header e trailer</button>
        </div>
        {tab === 'registros' && <Records id={id} layout={layout} types={imp.by_record_type} />}
        {tab === 'validacoes' && <Issues id={id} />}
        {tab === 'controle' && (
          <div className="panel-body grid-2" style={{ paddingTop: 16 }}>
            {imp.header_variant ? (
              <>
                <Section title={`Header (${imp.header_variant})`} fields={imp.header} />
                <Section title="Trailer" fields={imp.trailer} />
              </>
            ) : <Empty title="Este layout não possui header/trailer" />}
          </div>
        )}
      </section>

      {action && (
        <Modal
          title={action === 'cancel' ? 'Cancelar importação confirmada' : 'Descartar arquivo'}
          onClose={() => setAction(null)}
          footer={
            <>
              <button className="btn" onClick={() => setAction(null)}>Voltar</button>
              <button className="btn danger" disabled={busy || (action === 'cancel' && !reason.trim())} onClick={() => run(action, { reason }, action === 'cancel' ? 'Importação cancelada.' : 'Arquivo descartado.')}>
                {action === 'cancel' ? 'Cancelar importação' : 'Descartar arquivo'}
              </button>
            </>
          }
        >
          <p className="small">
            {action === 'cancel'
              ? 'Os registros permanecem armazenados para auditoria, mas deixam de compor batimentos e indicadores. Os batimentos afetados são recalculados.'
              : 'Os dados interpretados são removidos da pré-visualização. O arquivo original e o registro da operação permanecem para auditoria.'}
          </p>
          <label className="field">Motivo{action === 'cancel' ? ' (obrigatório)' : ''}<textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        </Modal>
      )}
      {toast.node}
    </div>
  );
}
