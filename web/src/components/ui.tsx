import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, ListFilter, UserRound } from 'lucide-react';

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

/** Critério ou explicação disponível sob demanda (ícone ⓘ), sem poluir a tela. */
export function Hint({ text }: { text: string }) {
  return (
    <span className="hint" tabIndex={0} role="note" aria-label={text} data-tip={text}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M8 7v4.2M8 4.6v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
    </span>
  );
}

// ---------------------------------------------------------------- Filtros rápidos e ações por linha

export interface Quick { id: string; label: string; active: boolean; onClick: () => void; count?: number }

/** Filtros de 1 clique para os gargalos mais comuns; combinam com os demais filtros da tela. */
export function QuickFilters({ items, onClear }: { items: Quick[]; onClear?: () => void }) {
  const any = items.some((i) => i.active);
  return (
    <div className="quick" role="group" aria-label="Filtros rápidos">
      {items.map((i) => (
        <button key={i.id} type="button" className={`chip${i.active ? ' on' : ''}${i.count === 0 && !i.active ? ' zero' : ''}`} aria-pressed={i.active} onClick={i.onClick}>
          {i.label}{i.count !== undefined && <span className="num">{i.count.toLocaleString('pt-BR')}</span>}
        </button>
      ))}
      {any && onClear && <button type="button" className="chip clear" onClick={onClear}>Limpar</button>}
    </div>
  );
}

/** Copia o valor para a área de transferência, com confirmação visual no próprio botão. */
export function CopyButton({ value, label, inline }: { value: string; label: string; inline?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const t = document.createElement('textarea');
      t.value = value;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    setDone(true);
    window.setTimeout(() => setDone(false), 1500);
  };
  return (
    <button type="button" className={`ico${inline ? ' inline' : ''}${done ? ' done' : ''}`} onClick={copy} title={done ? 'Copiado' : `Copiar ${label}`} aria-label={done ? 'Copiado' : `Copiar ${label}`}>
      {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
    </button>
  );
}

const onlyDigits = (v: string) => v.replace(/\D/g, '').replace(/^0+/, '');
export const clienteHref = (cpf: string) => `/clientes/${onlyDigits(cpf)}`;

/** CPF/CNPJ como link para a visão consolidada do cliente, com cópia ao lado. */
export function CpfLink({ cpf, copy = true }: { cpf: string | null | undefined; copy?: boolean }) {
  if (!cpf || !onlyDigits(cpf)) return <span className="muted">—</span>;
  return (
    <span className="nowrap">
      <Link className="code" to={clienteHref(cpf)} onClick={(e) => e.stopPropagation()}>{cpf}</Link>
      {copy && <CopyButton value={cpf} label="CPF/CNPJ" inline />}
    </span>
  );
}

/** Contrato como link para o dossiê, com cópia ao lado. */
export function ContractLink({ contract }: { contract: string | null | undefined }) {
  if (!contract) return <span className="muted">—</span>;
  return (
    <span className="nowrap">
      <Link className="code" to={`/contratos/${encodeURIComponent(contract)}`} onClick={(e) => e.stopPropagation()}>{contract}</Link>
      <CopyButton value={contract} label="contrato" inline />
    </span>
  );
}

/** Ações compactas da linha: abrir o cliente e abrir os itens relacionados (a cópia fica junto de cada valor). */
export function RowActions({ cpf, related, children }: { cpf?: string | null; related?: { to: string; label: string }; children?: ReactNode }) {
  const hasCpf = !!cpf && !!onlyDigits(cpf);
  return (
    <span className="row-actions" onClick={(e) => e.stopPropagation()}>
      {hasCpf && <Link className="ico" to={clienteHref(cpf!)} title="Abrir cliente" aria-label="Abrir cliente"><UserRound size={14} aria-hidden /></Link>}
      {related && <Link className="ico" to={related.to} title={related.label} aria-label={related.label}><ListFilter size={14} aria-hidden /></Link>}
      {children}
    </span>
  );
}
