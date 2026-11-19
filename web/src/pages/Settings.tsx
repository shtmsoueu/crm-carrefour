import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Notice, useToast, titulo } from '../components/ui';

export function SettingsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const [cfg, setCfg] = useState<any>(null);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    api('/settings/rejeicao').then((r) => { setEnabled(!!r.value); setCfg(r.value ?? { mode: 'delimited', delimiter: ';', contractIndex: 0, reasonIndex: 1 }); });
  }, []);
  if (!can('ADMIN')) return <Notice tone="info">Somente administradores alteram configurações.</Notice>;
  if (!cfg) return null;
  const num = (k: string) => (e: { target: { value: string } }) => setCfg({ ...cfg, [k]: e.target.value === '' ? undefined : Number(e.target.value) });
  const save = async () => {
    try {
      await api('/settings/rejeicao', { method: 'PUT', json: { value: enabled ? cfg : null } });
      toast.show('ok', 'Configuração salva. Reprocesse os arquivos de rejeição já importados para aplicá-la.');
    } catch (e) {
      toast.show('bad', (e as Error).message);
    }
  };
  return (
    <div className="stack">
      <div className="page-head"><div><h1>{titulo('Configurações')}</h1></div></div>
      <section className="panel">
        <div className="panel-head"><div><h2>Arquivos de rejeição de campanha</h2>
          <p>O De-Para informa que estes arquivos não possuem layout e contêm somente o contrato e o motivo da rejeição. Defina como extrair esses dados quando a estrutura for confirmada com o banco. Até lá, as linhas são armazenadas integralmente e o batimento de campanhas fica pendente de configuração.</p></div></div>
        <div className="panel-body stack" style={{ gap: 12 }}>
          <label className="row small"><input type="checkbox" style={{ height: 'auto' }} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Extrair contrato e motivo das linhas</label>
          {enabled && (
            <>
              <label className="field">Formato da linha
                <select value={cfg.mode} onChange={(e) => setCfg({ ...cfg, mode: e.target.value })} style={{ width: 260 }}>
                  <option value="delimited">Campos separados por delimitador</option>
                  <option value="fixed">Posições fixas</option>
                </select>
              </label>
              {cfg.mode === 'delimited' ? (
                <div className="row">
                  <label className="field">Delimitador<input value={cfg.delimiter ?? ''} maxLength={3} onChange={(e) => setCfg({ ...cfg, delimiter: e.target.value })} style={{ width: 80 }} /></label>
                  <label className="field">Coluna do contrato (0 = primeira)<input type="number" min={0} value={cfg.contractIndex ?? ''} onChange={num('contractIndex')} /></label>
                  <label className="field">Coluna do motivo<input type="number" min={0} value={cfg.reasonIndex ?? ''} onChange={num('reasonIndex')} /></label>
                </div>
              ) : (
                <div className="row">
                  <label className="field">Contrato: início<input type="number" min={1} value={cfg.contractStart ?? ''} onChange={num('contractStart')} /></label>
                  <label className="field">Contrato: fim<input type="number" min={1} value={cfg.contractEnd ?? ''} onChange={num('contractEnd')} /></label>
                  <label className="field">Motivo: início<input type="number" min={1} value={cfg.reasonStart ?? ''} onChange={num('reasonStart')} /></label>
                  <label className="field">Motivo: fim<input type="number" min={1} value={cfg.reasonEnd ?? ''} onChange={num('reasonEnd')} /></label>
                </div>
              )}
            </>
          )}
          <div><button className="btn primary" onClick={save}>Salvar configuração</button></div>
        </div>
      </section>
      {toast.node}
    </div>
  );
}
