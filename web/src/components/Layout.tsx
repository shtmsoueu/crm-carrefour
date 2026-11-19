import {
  Activity, BookOpen, ClipboardList, FileSearch, FolderClock, GitCompareArrows, LayoutDashboard, LogOut, Menu,
  Search, Settings, ShieldCheck, TriangleAlert, Upload, Users, Wallet, X, type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth, type Role } from '../auth';

const ROLE_LABEL: Record<string, string> = { ADMIN: 'Administrador', OPERADOR: 'Operador', CONSULTA: 'Consulta' };

interface Item { to: string; label: string; icon: LucideIcon; end?: boolean; min?: Role; badge?: 'imports' | 'divergences' }
interface Group { label: string; items: Item[] }

/**
 * Navegação da plataforma. Só entram páginas implementadas (sem páginas vazias):
 * o grupo Financeiro e as visões por perfil são adicionados nas próximas fases.
 */
export const NAV: Group[] = [
  { label: 'Visão geral', items: [{ to: '/', label: 'Dashboard executivo', icon: LayoutDashboard, end: true }] },
  {
    label: 'Operação',
    items: [
      { to: '/importacao', label: 'Importação de arquivos', icon: Upload, badge: 'imports' },
      { to: '/historico', label: 'Histórico de importações', icon: FolderClock },
      { to: '/batimentos', label: 'Central de batimentos', icon: GitCompareArrows },
      { to: '/pendencias', label: 'Pendências e divergências', icon: TriangleAlert, badge: 'divergences' },
    ],
  },
  {
    label: 'Dados e carteira',
    items: [
      { to: '/contratos', label: 'Consulta de contratos', icon: FileSearch },
      { to: '/carteira', label: 'Carteira classificada', icon: Wallet },
      { to: '/conciliacao-crm', label: 'Conciliação com CRM', icon: ClipboardList },
      { to: '/layouts', label: 'Dicionário de layouts', icon: BookOpen },
    ],
  },
  {
    label: 'Governança',
    items: [
      { to: '/auditoria', label: 'Auditoria', icon: Activity, min: 'OPERADOR' },
      { to: '/usuarios', label: 'Usuários e permissões', icon: Users, min: 'ADMIN' },
      { to: '/configuracoes', label: 'Configurações', icon: Settings, min: 'ADMIN' },
    ],
  },
];

function currentPage(path: string): { group: string; label: string } | null {
  for (const g of NAV) for (const i of g.items) {
    if (i.end ? path === i.to : path === i.to || path.startsWith(i.to + '/')) return { group: g.label, label: i.label };
  }
  return null;
}

export function Layout() {
  const { user, setUser, can, authEnabled } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<{ imports: number; divergences: number } | null>(null);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    Promise.all([api('/imports?status=PRE_VISUALIZACAO&pageSize=1'), api('/divergences?status=ABERTAS&pageSize=1')])
      .then(([i, d]) => setPending({ imports: i.total, divergences: d.total }))
      .catch(() => undefined);
  }, [loc.pathname]);
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  };
  const search = (e: FormEvent) => {
    e.preventDefault();
    const t = q.trim();
    if (t.length >= 3) nav(`/contratos/${encodeURIComponent(t)}`);
  };
  const page = currentPage(loc.pathname);

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Menu principal">
        <div className="brand">
          <strong><span className="t-leve">CRM</span> Carrefour</strong>
          <span>Carteira, conciliação e financeiro</span>
          <button className="icon-btn sidebar-close" onClick={() => setOpen(false)} aria-label="Fechar menu"><X size={18} /></button>
        </div>
        <nav className="nav">
          {NAV.map((g) => {
            const items = g.items.filter((i) => !i.min || can(i.min));
            if (!items.length) return null;
            return (
              <div key={g.label} className="nav-section">
                <div className="nav-group">{g.label}</div>
                {items.map((i) => {
                  const n = i.badge && pending ? pending[i.badge] : 0;
                  return (
                    <NavLink key={i.to} to={i.to} end={i.end}>
                      <span className="nav-label"><i.icon size={17} aria-hidden="true" />{i.label}</span>
                      {n > 0 && <span className="count" title={i.badge === 'imports' ? 'Aguardando confirmação' : 'Abertas ou em análise'}>{n.toLocaleString('pt-BR')}</span>}
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open}><Menu size={20} /></button>
          <div className="crumb" aria-label="Localização">
            {page ? <><span>{page.group}</span><span aria-hidden="true">›</span><b>{page.label}</b></> : <b>CRM Carrefour</b>}
          </div>
          <form className="topsearch" role="search" onSubmit={search}>
            <Search size={16} aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Contrato ou CPF/CNPJ" aria-label="Buscar contrato ou CPF/CNPJ" />
          </form>
          {!authEnabled ? (
            <span className="access-flag" title="Login desativado: qualquer pessoa com o endereço acessa os dados"><ShieldCheck size={15} aria-hidden="true" />Acesso sem login</span>
          ) : (
            <div className="userchip">
              <span className="avatar" aria-hidden="true">{(user?.name ?? '?').slice(0, 1).toUpperCase()}</span>
              <span className="who"><b>{user?.name}</b><small>{user ? ROLE_LABEL[user.role] : ''}</small></span>
              <button className="icon-btn" onClick={logout} aria-label="Sair"><LogOut size={17} /></button>
            </div>
          )}
        </header>
        <main className="main" id="conteudo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
