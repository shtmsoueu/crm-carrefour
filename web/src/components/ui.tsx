import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export function Badge({ tone = 'wait', children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function MapBadge({ map, value }: { map: Record<string, { label: string; tone: string }>; value: string | null | undefined }) {
  if (!value) return <span className="muted">—</span>;
  const m = map[value];
  return <Badge tone={m?.tone}>{m?.label ?? value}</Badge>;
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <span>
        {total === 0 ? 'Nenhum registro' : `${((page - 1) * pageSize + 1).toLocaleString('pt-BR')}–${Math.min(page * pageSize, total).toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`}
      </span>
      <span className="row">
        <button className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
        <span>Página {page} de {pages}</span>
        <button className="btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Próxima</button>
      </span>
    </div>
  );
}

export function Modal({ title, children, footer, onClose }: { title: string; children: ReactNode; footer: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header><h2>{title}</h2></header>
        <div className="body">{children}</div>
        <footer>{footer}</footer>
      </div>
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'warn' | 'bad' | 'info' | 'ok'; children: ReactNode }) {
  return <div className={`notice ${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>{children}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><strong>{title}</strong>{children}</div>;
}

export function Loading() {
  return <div className="empty" aria-busy="true">Carregando…</div>;
}

/** Carrega dados assíncronos com estados de carregamento e erro. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const reload = useCallback(() => {
    const n = ++seq.current;
    setLoading(true);
    setError(null);
    fn()
      .then((d) => n === seq.current && setData(d))
      .catch((e) => n === seq.current && setError(e.message))
      .finally(() => n === seq.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => reload(), [reload]);
  return { data, error, loading, reload, setData };
}

export function ExportButtons({ href }: { href: (f: 'csv' | 'xlsx') => string }) {
  return (
    <span className="row">
      <a className="btn sm" href={href('xlsx')}>Exportar Excel</a>
      <a className="btn sm" href={href('csv')}>Exportar CSV</a>
    </span>
  );
}

let toastTimer: number | undefined;
export function useToast() {
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad' | 'info' | 'warn'; text: string } | null>(null);
  const show = (tone: 'ok' | 'bad' | 'info' | 'warn', text: string) => {
    setMsg({ tone, text });
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => setMsg(null), 6000);
  };
  const node = msg ? <div className="toast"><Notice tone={msg.tone}>{msg.text}</Notice></div> : null;
  return { show, node };
}

/** Padrão da identidade visual: primeira palavra em peso leve, restante em negrito. */
export function titulo(text: string) {
  const i = text.indexOf(' ');
  if (i < 0) return text;
  return (
    <>
      <span className="t-leve">{text.slice(0, i)}</span>
      {text.slice(i)}
    </>
  );
}
