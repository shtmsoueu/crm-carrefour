import { useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { MapBadge, Notice, useLoad, titulo, Hint } from '../components/ui';
import { FILE_TYPE_LABELS, fmtBytes, fmtDateTime, fmtInt, IMPORT_STATUS } from '../format';

interface Item { file: File; type: string; state: 'fila' | 'enviando' | 'ok' | 'erro'; message?: string; importId?: number; status?: string; records?: number; rejected?: number }

export function ImportPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pending = useLoad(() => api('/imports?status=PRE_VISUALIZACAO&pageSize=20'), []);

  const add = (files: FileList | null) => {
    if (!files) return;
    // Copia a lista agora: o FileList é esvaziado quando o campo é limpo logo em seguida.
    const picked = Array.from(files).map((file) => ({ file, type: '', state: 'fila' as const }));
    setItems((prev) => [...prev, ...picked]);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    add(e.dataTransfer.files);
  };
  const update = (i: number, patch: Partial<Item>) => setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const send = async () => {
    setBusy(true);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.state === 'ok') continue;
      update(i, { state: 'enviando', message: undefined });
      const fd = new FormData();
      // Compacta no navegador (arquivos texto reduzem ~10x) para caber no limite de requisição da hospedagem.
      if (typeof CompressionStream !== 'undefined' && it.file.size > 0) {
        const gz = await new Response(it.file.stream().pipeThrough(new CompressionStream('gzip'))).blob();
        fd.append('encoding', 'gzip');
        fd.append('file', new File([gz], it.file.name, { type: 'application/gzip' }));
      } else {
        fd.append('file', it.file);
      }
      if (it.type) fd.append('fileType', it.type);
      try {
        const r = await api('/imports', { method: 'POST', body: fd });
        update(i, { state: 'ok', importId: r.id, status: r.status, records: r.data_records, rejected: r.rejected_records });
      } catch (e) {
        const err = e as ApiError;
        update(i, { state: 'erro', message: err.message, importId: (err.details as { importId?: number })?.importId });
      }
    }
    setBusy(false);
    pending.reload();
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{titulo('Importação')}</h1>
        </div>
      </div>

      {!can('OPERADOR') ? (
        <Notice tone="info">Seu perfil é de consulta. A importação de arquivos é feita por operadores.</Notice>
      ) : (
        <section className="panel">
          <div className="panel-body" style={{ paddingTop: 16 }}>
            <div
              className={`drop ${over ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={onDrop}
              onClick={() => input.current?.click()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
              role="button"
              tabIndex={0}
            >
              <strong>Arraste os arquivos ou clique para selecionar</strong>
              <span className="muted">TXT, CSV ou XLSX, um ou vários</span>
              <input ref={input} type="file" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
            </div>
          </div>
          {items.length > 0 && (
            <>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Arquivo</th><th>Tamanho</th><th>Tipo</th><th>Resultado</th><th /></tr></thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i}>
                        <td className="code">{it.file.name}</td>
                        <td className="num">{fmtBytes(it.file.size)}</td>
                        <td>
                          <select value={it.type} disabled={it.state !== 'fila' && it.state !== 'erro'} onChange={(e) => update(i, { type: e.target.value })} aria-label={`Tipo do arquivo ${it.file.name}`}>
                            <option value="">Identificar pelo nome</option>
                            {Object.entries(FILE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </td>
                        <td>
                          {it.state === 'fila' && <span className="muted">Pronto para enviar</span>}
                          {it.state === 'enviando' && <span>Interpretando…</span>}
                          {it.state === 'ok' && (
                            <span className="row"><MapBadge map={IMPORT_STATUS} value={it.status} /> <span className="small">{fmtInt(it.records)} registro(s){it.rejected ? `, ${fmtInt(it.rejected)} rejeitado(s)` : ''}</span></span>
                          )}
                          {it.state === 'erro' && <span style={{ color: 'var(--bad)' }} className="small">{it.message}</span>}
                        </td>
                        <td className="nowrap">
                          {it.importId && <Link className="btn sm" to={`/importacao/${it.importId}`}>{it.state === 'ok' && it.status === 'PRE_VISUALIZACAO' ? 'Conferir e confirmar' : 'Abrir'}</Link>}
                          {it.state === 'fila' && <button className="btn sm ghost" onClick={() => setItems(items.filter((_, j) => j !== i))}>Remover</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pager">
                <span>{items.filter((i) => i.state === 'fila' || i.state === 'erro').length} arquivo(s) a enviar</span>
                <span className="row">
                  <button className="btn" onClick={() => setItems(items.filter((i) => i.state !== 'ok'))} disabled={busy}>Limpar enviados</button>
                  <button className="btn primary" onClick={send} disabled={busy || !items.some((i) => i.state === 'fila' || i.state === 'erro')}>{busy ? 'Enviando…' : 'Enviar e interpretar'}</button>
                </span>
              </div>
            </>
          )}
        </section>
      )}

      <section className="panel">
        <div className="panel-head"><div><h2>Aguardando confirmação <Hint text="Arquivos interpretados que ainda não compõem a base." /></h2></div></div>
        {pending.data?.rows.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Arquivo</th><th>Tipo</th><th className="num">Registros</th><th className="num">Rejeitados</th><th>Enviado em</th><th /></tr></thead>
              <tbody>
                {pending.data.rows.map((r: any) => (
                  <tr key={r.id}>
                    <td className="code">{r.original_name}</td>
                    <td>{FILE_TYPE_LABELS[r.file_type] ?? r.file_type}</td>
                    <td className="num">{fmtInt(r.data_records)}</td>
                    <td className="num">{fmtInt(r.rejected_records)}</td>
                    <td>{fmtDateTime(r.uploaded_at)} · {r.uploaded_by_name ?? 'sistema'}</td>
                    <td><Link className="btn sm" to={`/importacao/${r.id}`}>Conferir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Nenhum arquivo aguardando confirmação.</div>
        )}
      </section>
    </div>
  );
}
