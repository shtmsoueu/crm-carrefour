import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

const ROLE_LABEL = { ADMIN: 'Administrador', OPERADOR: 'Operador', CONSULTA: 'Consulta' };

export function Layout() {
  const { user, setUser, can } = useAuth();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{ imports: number; divergences: number } | null>(null);
  const loc = useLocation();
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
  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Menu principal">
        <div className="brand">
          <strong>Batimento Carrefour</strong>
          <span>Gestão da carteira e conciliação</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end>Painel</NavLink>
          <NavLink to="/contratos">Consulta de contrato</NavLink>
          <div className="nav-group">Arquivos</div>
          <NavLink to="/importacao">
            Importar arquivos {pending && pending.imports > 0 && <span className="count" title="Aguardando confirmação">{pending.imports}</span>}
          </NavLink>
          <NavLink to="/historico">Histórico de importações</NavLink>
          <NavLink to="/layouts">Dicionário de layouts</NavLink>
          <div className="nav-group">Conciliação</div>
          <NavLink to="/batimentos">Batimentos</NavLink>
          <NavLink to="/pendencias">
            Pendências de batimento {pending && pending.divergences > 0 && <span className="count">{pending.divergences.toLocaleString('pt-BR')}</span>}
          </NavLink>
          {can('OPERADOR') && (
            <>
              <div className="nav-group">Administração</div>
              <NavLink to="/auditoria">Auditoria</NavLink>
            </>
          )}
          {can('ADMIN') && (
            <>
              <NavLink to="/usuarios">Usuários</NavLink>
              <NavLink to="/configuracoes">Configurações</NavLink>
            </>
          )}
        </nav>
        <div className="userbox">
          <div>{user?.name}</div>
          <div className="muted small">{user ? ROLE_LABEL[user.role] : ''}</div>
          <button onClick={logout}>Sair</button>
        </div>
      </aside>
      <main className="main" id="conteudo">
        <button className="btn menu-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>Menu</button>
        <Outlet />
      </main>
    </div>
  );
}
