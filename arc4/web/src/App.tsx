import { useQuery } from '@tanstack/react-query';
import { buscarSaude, type Saude } from './api';
import { EPS, rotuloEps } from './eps';

function EstadoApi({ dados, erro, carregando }: { dados?: Saude; erro: boolean; carregando: boolean }) {
  if (carregando) return <span className="estado estado--neutro">Verificando…</span>;
  if (erro || !dados) return <span className="estado estado--erro">API indisponível</span>;
  if (dados.banco !== 'ok') return <span className="estado estado--alerta">API ativa, banco indisponível</span>;
  return <span className="estado estado--ok">Operacional</span>;
}

export function App() {
  const saude = useQuery({ queryKey: ['saude'], queryFn: ({ signal }) => buscarSaude(signal), retry: false });

  return (
    <>
      <header className="barra">
        <h1>CRM de Cobrança ARC4</h1>
      </header>
      <main>
        <h2 className="titulo">Ambiente</h2>

        <section className="cartao" aria-labelledby="t-servicos">
          <h3 id="t-servicos">Serviços</h3>
          <dl className="lista-def">
            <dt>Situação</dt>
            <dd aria-live="polite">
              <EstadoApi dados={saude.data} erro={saude.isError} carregando={saude.isPending} />
            </dd>
            <dt>Versão da API</dt>
            <dd>{saude.data?.versao ?? '—'}</dd>
            <dt>Migração do banco</dt>
            <dd>{saude.data?.migracao ?? (saude.data ? 'não aplicada' : '—')}</dd>
          </dl>
        </section>

        <section className="cartao" aria-labelledby="t-carteiras">
          <h3 id="t-carteiras">Carteiras</h3>
          <ul className="chips">
            {EPS.map((e) => (
              <li key={e.codigo} className="chip">
                {rotuloEps(e.codigo)}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
