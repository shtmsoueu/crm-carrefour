import { useEffect, useState } from 'react';
import { Badge, Loading, Notice } from '../components/ui';
import { getLayouts, type LayoutDef, type RecordDef } from '../layouts';

const NOTE_TONE: Record<string, string> = { CORRECAO: 'warn', DIVERGENCIA_ARQUIVO_REAL: 'origin', LIMITACAO: 'bad', INFORMACAO: 'info' };
const NOTE_LABEL: Record<string, string> = { CORRECAO: 'Correção aplicada', DIVERGENCIA_ARQUIVO_REAL: 'Arquivo real x layout', LIMITACAO: 'Limitação', INFORMACAO: 'Informação' };

function FieldTable({ rec, title }: { rec: RecordDef; title: string }) {
  return (
    <div style={{ marginTop: 16 }}>
      <h3>{title} <span className="muted small">({rec.length} posições)</span></h3>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Campo</th><th className="num">Início</th><th className="num">Fim</th><th className="num">Tam.</th><th>Tipo</th><th className="num">Dec.</th><th>Obrig.</th><th>Descrição</th></tr></thead>
          <tbody>{rec.fields.map((f, i) => (
            <tr key={i} style={f.filler ? { color: 'var(--ink-3)' } : undefined}>
              <td className="code">{f.name}</td><td className="num">{f.start}</td><td className="num">{f.end}</td><td className="num">{f.end - f.start + 1}</td>
              <td>{f.type}{f.dateFormat ? ` (${f.dateFormat})` : ''}</td><td className="num">{f.decimals ?? ''}</td><td>{f.required ? 'Sim' : ''}</td>
              <td className="small">{f.label}{f.note && <div style={{ color: 'var(--warn)' }}>{f.note}</div>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

export function LayoutsPage() {
  const [list, setList] = useState<LayoutDef[] | null>(null);
  const [sel, setSel] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => void getLayouts().then((l) => { setList(l); setSel(l[0]?.code ?? ''); }).catch((e) => setError(e.message)), []);
  const l = list?.find((x) => x.code === sel);
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!list) return <Loading />;
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Dicionário de layouts</h1>
          <p>Especificação técnica usada por cada importador, construída a partir das planilhas oficiais. Correções e divergências observadas nas cargas reais estão registradas em cada layout.</p>
        </div>
        <label className="field">Layout
          <select value={sel} onChange={(e) => setSel(e.target.value)}>{list.map((x) => <option key={x.code} value={x.code}>{x.title}</option>)}</select>
        </label>
      </div>
      {l && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>{l.title} <span className="code muted">{l.code}</span></h2>
              <p>{l.purpose}</p>
            </div>
            {!l.layoutAvailable && <Badge tone="warn">Layout não fornecido</Badge>}
          </div>
          <div className="panel-body">
            <dl className="kv">
              <dt>Nomenclatura oficial</dt><dd className="code">{l.namingPattern}</dd>
              <dt>Planilha de origem</dt><dd>{l.sourceLayout ?? 'Sem layout (De-Para)'}</dd>
            </dl>
            <div className="stack" style={{ gap: 8, marginTop: 16 }}>
              {l.notes.map((n, i) => <div key={i} className="row small" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}><Badge tone={NOTE_TONE[n.kind]}>{NOTE_LABEL[n.kind]}</Badge><span>{n.text}</span></div>)}
            </div>
            {l.headerTrailer.map((v) => (
              <div key={v.id}>
                {v.header && <FieldTable rec={v.header} title={`Header: ${v.description}`} />}
                {v.trailer && <FieldTable rec={v.trailer} title="Trailer" />}
              </div>
            ))}
            {l.records.map((r) => <FieldTable key={r.code} rec={r} title={`Registro ${r.code === '*' ? '' : `tipo ${r.code}: `}${r.name}`} />)}
          </div>
        </section>
      )}
    </div>
  );
}
