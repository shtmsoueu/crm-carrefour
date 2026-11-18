import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, setUnauthorizedHandler } from './api';

export type Role = 'ADMIN' | 'OPERADOR' | 'CONSULTA';
export interface User { id: number; username: string; name: string; role: Role }

interface Ctx { user: User | null; authEnabled: boolean; setUser: (u: User | null) => void; can: (r: Role) => boolean }
const AuthCtx = createContext<Ctx>({ user: null, authEnabled: false, setUser: () => undefined, can: () => false });
const LEVEL: Record<Role, number> = { CONSULTA: 1, OPERADOR: 2, ADMIN: 3 };

function ApiUnavailable({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="login-form" style={{ minHeight: '100%' }}>
      <div style={{ maxWidth: 520 }} className="stack">
        <h1>Servidor do sistema indisponível</h1>
        <p>A interface carregou, mas não conseguiu falar com a API em <span className="code">/api</span>. Sem ela não há dados para exibir.</p>
        <p className="small muted">Verifique se o servidor (pasta <span className="code">server</span>) está em execução e conectado ao banco PostgreSQL. Detalhe: {message}</p>
        <div><button className="btn primary" onClick={retry}>Tentar novamente</button></div>
      </div>
    </div>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'down'>('loading');
  const [error, setError] = useState('');
  const load = () => {
    setState('loading');
    api<{ user: User; authEnabled: boolean }>('/auth/me')
      .then((r) => {
        setUser(r.user);
        setAuthEnabled(r.authEnabled);
        setState('ready');
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          // Login ativo e sem sessão: exibe a tela de login.
          setAuthEnabled(true);
          setUser(null);
          setState('ready');
        } else {
          setError(e instanceof ApiError ? `HTTP ${e.status}` : (e as Error).message);
          setState('down');
        }
      });
  };
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    load();
  }, []);
  if (state === 'loading') return null;
  if (state === 'down') return <ApiUnavailable message={error} retry={load} />;
  return <AuthCtx.Provider value={{ user, authEnabled, setUser, can: (r) => !!user && LEVEL[user.role] >= LEVEL[r] }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
