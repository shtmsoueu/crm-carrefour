import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Notice, titulo } from '../components/ui';

export function LoginPage() {
  const { setUser } = useAuth();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api('/auth/login', { method: 'POST', json: { username, password } });
      setUser(r.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login">
      <section className="login-side">
        <div>
          <h1>{titulo('Batimento da Carteira Carrefour')}</h1>
          <p>Importe os arquivos recebidos do banco, acompanhe a conciliação de contratos, acordos e pagamentos e trate as pendências em um só lugar.</p>
        </div>
        <p className="small">Acesso restrito. Todas as operações são registradas em auditoria.</p>
      </section>
      <section className="login-form">
        <form onSubmit={submit}>
          <h2>Entrar</h2>
          {error && <Notice tone="bad">{error}</Notice>}
          <label className="field">Usuário<input autoComplete="username" value={username} onChange={(e) => setU(e.target.value)} required autoFocus /></label>
          <label className="field">Senha<input type="password" autoComplete="current-password" value={password} onChange={(e) => setP(e.target.value)} required /></label>
          <button className="btn primary" disabled={busy} style={{ height: 40, justifyContent: 'center' }}>{busy ? 'Entrando…' : 'Entrar'}</button>
        </form>
      </section>
    </div>
  );
}
