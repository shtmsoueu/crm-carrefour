import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, Loading, Modal, Notice, useLoad, useToast, titulo } from '../components/ui';
import { fmtDateTime } from '../format';

const ROLES = { ADMIN: 'Administrador', OPERADOR: 'Operador', CONSULTA: 'Consulta' } as const;

export function UsersPage() {
  const { can, user } = useAuth();
  const toast = useToast();
  const { data, error, reload } = useLoad(() => api('/users'), []);
  const [form, setForm] = useState<any>(null);
  if (!can('ADMIN')) return <Notice tone="info">Somente administradores gerenciam usuários.</Notice>;
  const save = async () => {
    try {
      if (form.id) await api(`/users/${form.id}`, { method: 'PATCH', json: { name: form.name, role: form.role, active: form.active, password: form.password || undefined } });
      else await api('/users', { method: 'POST', json: form });
      toast.show('ok', form.id ? 'Usuário atualizado.' : 'Usuário criado.');
      setForm(null);
      reload();
    } catch (e) {
      toast.show('bad', (e as Error).message);
    }
  };
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>{titulo('Usuários')}</h1><p>Administrador: tudo, inclusive cancelar e reprocessar importações. Operador: importa, confirma, executa batimentos e trata pendências. Consulta: somente leitura.</p></div>
        <button className="btn primary" onClick={() => setForm({ username: '', name: '', role: 'OPERADOR', password: '' })}>Novo usuário</button>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <section className="panel">
        {!data ? <Loading /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Último acesso</th><th /></tr></thead>
              <tbody>{data.map((u: any) => (
                <tr key={u.id}><td>{u.name}</td><td className="code">{u.username}</td><td>{ROLES[u.role as keyof typeof ROLES]}</td>
                  <td>{u.active ? <Badge tone="ok">Ativo</Badge> : <Badge>Inativo</Badge>}</td><td>{fmtDateTime(u.last_login_at)}</td>
                  <td><button className="btn sm" onClick={() => setForm({ ...u, password: '' })}>Editar</button></td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      {form && (
        <Modal title={form.id ? `Editar ${form.username}` : 'Novo usuário'} onClose={() => setForm(null)} footer={<><button className="btn" onClick={() => setForm(null)}>Voltar</button><button className="btn primary" onClick={save}>{form.id ? 'Salvar alterações' : 'Criar usuário'}</button></>}>
          {!form.id && <label className="field">Usuário<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>}
          <label className="field">Nome<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field">Perfil<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={form.id === user?.id}>{Object.entries(ROLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          {form.id && form.id !== user?.id && <label className="row small"><input type="checkbox" style={{ height: 'auto' }} checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Acesso ativo</label>}
          <label className="field">{form.id ? 'Nova senha (deixe em branco para manter)' : 'Senha'}<input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <p className="small muted">Mínimo de 10 caracteres, com letras e números.</p>
        </Modal>
      )}
      {toast.node}
    </div>
  );
}
