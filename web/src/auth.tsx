import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler } from './api';

export type Role = 'ADMIN' | 'OPERADOR' | 'CONSULTA';
export interface User { id: number; username: string; name: string; role: Role }

const Ctx = createContext<{ user: User | null; setUser: (u: User | null) => void; can: (r: Role) => boolean }>({ user: null, setUser: () => undefined, can: () => false });
const LEVEL: Record<Role, number> = { CONSULTA: 1, OPERADOR: 2, ADMIN: 3 };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api<{ user: User }>('/auth/me').then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);
  if (!ready) return null;
  return <Ctx.Provider value={{ user, setUser, can: (r) => !!user && LEVEL[user.role] >= LEVEL[r] }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
