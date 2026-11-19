import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api';
import { Empty, Loading, Notice, useLoad } from '../components/ui';
import { FILE_TYPE_LABELS, fmtDate, fmtInt, fmtMoney, RESULT_LABELS } from '../format';

interface Etapa {
  flow: string;
  title: string;
  counts: Record<string, number>;
  compared: number;
  conciliated: number;
  percent: number | null;
  lastRun: { status: string; finishedAt: string; notes: { level: string; text: string }[] } | null;
}

const EMPTY_FILTERS = { from: '', to: '', procFrom: '', procTo: '', fileType: '', contract: '', cpf: '', status: '' };

const SEGMENTS: [string, string, string][] = [
  ['CONCILIADO', 'c-ok', 'Conciliado'],
  ['DIVERGENTE', 'c-bad', 'Divergente'],
  ['SOMENTE_ORIGEM', 'c-origin', 'Só na origem'],
  ['SOMENTE_DESTINO', 'c-dest', 'Só no destino'],
  ['DUPLICADO', 'c-dup', 'Duplicado'],
];

function Belt({ etapas }: { etapas: Etapa[] }) {
  return (
    <ul className="belt">
      {etapas.map((e) => {
        const waiting = e.lastRun?.notes.filter((n) => n.level === 'AGUARDANDO') ?? [];
        return (
          <li key={e.flow}>
            <div>
              <div className="flow-name"><Link to={`/batimentos?flow=${e.flow}`}>{e.title}</Link></div>
              {!e.lastRun && <div className="flow-note">Ainda não executado</div>}
              {waiting.map((w, i) => <div className="flow-note" key={i}>{w.text}</div>)}
            </div>
            <div>
              {e.compared > 0 ? (
                <>
                  <div className="bar" role="img" aria-label={SEGMENTS.map(([k, , l]) => `${l}: ${e.counts[k] ?? 0}`).join(', ')}>
                    {SEGMENTS.map(([k, cls]) => (e.counts[k] ? <span key={k} className={cls} style={{ width: `${(e.counts[k] / e.compared) * 100}%` }} /> : null))}
                  </div>
                  <div className="bar-legend">
                    {SEGMENTS.filter(([k]) => e.counts[k]).map(([k, cls, l]) => (
                      <span key={k}><i className={cls} />{l} <b className="num">{fmtInt(e.counts[k])}</b></span>
                    ))}
                    {e.counts.INFORMATIVO ? <span className="muted">Informativos {fmtInt(e.counts.INFORMATIVO)}</span> : null}
                  </div>
                </>
              ) : (
                <div className="small muted">
                  {e.counts.INFORMATIVO || e.counts.PENDENTE_CONFIGURACAO
                    ? `Sem registros comparáveis. ${fmtInt(e.counts.INFORMATIVO ?? 0)} resultado(s) informativo(s)${e.counts.PENDENTE_CONFIGURACAO ? ', regra pendente de configuração' : ''}.`
                    : 'Sem registros comparáveis.'}
                </div>
              )}
            </div>
            <div className={`pct ${e.percent === null ? 'none' : ''}`}>{e.percent === null ? 'sem base' : `${e.percent.toLocaleString('pt-BR')}%`}</div>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardPage() {
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const { data, error, loading } = useLoad(() => api(`/dashboard${qs(filters)}`), [filters]);
  const set = (k: keyof typeof EMPTY_FILTERS) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });
  const active = Object.values(filters).some(Boolean);
  const k = data?.kpis;
  const maxPend = Math.max(1, ...(data?.pendenciasPorCategoria ?? []).map((p: { n: number }) => p.n));
  const maxDay = Math.max(1, ...(data?.evolucaoRecebimentos ?? []).map((d: { v: string }) => Number(d.v)));

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Painel da carteira</h1>
          <p>Indicadores calculados exclusivamente a partir dos arquivos importados e confirmados.</p>
        </div>
      </div>

      <form className="filters" onSubmit={(e) => { e.preventDefault(); setFilters(draft); }} aria-label="Filtros do painel">
        <label className="field">Período de<input type="date" value={draft.from} onChange={set('from')} /></label>
        <label className="field">até<input type="date" value={draft.to} onChange={set('to')} /></label>
        <label className="field">Processado de<input type="date" value={draft.procFrom} onChange={set('procFrom')} /></label>
        <label className="field">até<input type="date" value={draft.procTo} onChange={set('procTo')} /></label>
        <label className="field">Tipo de arquivo
          <select value={draft.fileType} onChange={set('fileType')}>
            <option value="">Todos</option>
            {Object.entries(FILE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field">Contrato<input value={draft.contract} onChange={set('contract')} placeholder="Nº do contrato" /></label>
        <label className="field">CPF/CNPJ<input value={draft.cpf} onChange={set('cpf')} inputMode="numeric" /></label>
        <label className="field">Status do batimento
          <select value={draft.status} onChange={set('status')}>
            <option value="">Todos</option>
            {Object.entries(RESULT_LABELS).map(([v, l]) => <option key={v} value={v}>{l.label}</option>)}
          </select>
        </label>
        <button className="btn primary">Aplicar</button>
        {active && <button type="button" className="btn ghost" onClick={() => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); }}>Limpar filtros</button>}
      </form>

      {error && <Notice tone="bad">{error}</Notice>}
      {loading && !data && <Loading />}
      {k && (
        <>
          {Number(k.contratos_recebidos) === 0 && !active && (
            <Notice tone="info">Nenhum arquivo confirmado ainda. <Link to="/importacao">Importe os arquivos recebidos do banco</Link> para alimentar o painel.</Notice>
          )}
          <section className="kpi-band" aria-label="Indicadores">
            <div className="kpi-group">
              <h2>Contratos</h2>
              <div className="kpi-lead">{fmtInt(k.contratos_ativos)}</div>
              <div className="kpi-lead-label">ativos na carteira</div>
              <ul className="kpi-list">
                <li title="Contratos distintos presentes em qualquer arquivo importado">Recebidos (todos os arquivos) <b>{fmtInt(k.contratos_recebidos)}</b></li>
                <li title="Contratos distintos em REM_CONTRATOS">Distribuídos <b>{fmtInt(k.contratos_distribuidos)}</b></li>
                <li title="Contratos distintos em RET_DISTRIBUICAO ou RET_CARTEIRA">Retirados <b>{fmtInt(k.contratos_retirados)}</b></li>
                <li title="CPF/CNPJ distintos (visão unique): uma pessoa pode ter vários contratos">Clientes únicos (CPF/CNPJ) <b>{fmtInt(k.clientes_unicos)}</b></li>
              </ul>
            </div>
            <div className="kpi-group">
              <h2>Acordos</h2>
              <div className="kpi-lead">{fmtMoney(k.valor_negociado)}</div>
              <div className="kpi-lead-label">negociados em {fmtInt(k.acordos_realizados)} acordos</div>
              <ul className="kpi-list">
                <li>Reconhecidos pelo banco <b>{k.acordos_reconhecidos === null ? 'sem BAT_ACORDO' : fmtInt(k.acordos_reconhecidos)}</b></li>
                <li className={k.acordos_divergentes ? 'alert' : ''}>Divergentes <b>{k.acordos_divergentes === null ? 'sem BAT_ACORDO' : fmtInt(k.acordos_divergentes)}</b></li>
                <li className={k.acordos_quebrados ? 'alert' : ''}>Quebrados <b>{fmtInt(k.acordos_quebrados)}</b></li>
              </ul>
            </div>
            <div className="kpi-group">
              <h2>Pagamentos</h2>
              <div className="kpi-lead">{fmtMoney(k.valor_recebido)}</div>
              <div className="kpi-lead-label">recebidos em {fmtInt(k.pagamentos_identificados)} pagamentos</div>
              <ul className="kpi-list">
                <li title="Pagamentos distintos do REPASSE (linhas idênticas contam uma vez)">Identificados no repasse <b>{fmtInt(k.pagamentos_identificados)}</b></li>
                {k.pagamentos_linhas > k.pagamentos_identificados && (
                  <li className="alert" title="Linhas idênticas desconsideradas no total (ver pendências de duplicidade)">Linhas idênticas desconsideradas <b>{fmtInt(k.pagamentos_linhas - k.pagamentos_identificados)} ({fmtMoney(Number(k.pagamentos_valor_linhas) - Number(k.valor_recebido))})</b></li>
                )}
                <li title="Acordos (AHID) distintos em qualquer arquivo — visão conta">Acordos em todos os arquivos <b>{fmtInt(k.acordos_todos_arquivos)}</b></li>
              </ul>
            </div>
            <div className={`kpi-group ${k.pendentes ? 'alert' : ''}`}>
              <h2>Pendências</h2>
              <div className="kpi-lead">{fmtInt(k.pendentes)}</div>
              <div className="kpi-lead-label">abertas ou em análise</div>
              <Link className="btn sm" to="/pendencias?status=ABERTAS">Tratar pendências</Link>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Conciliação por etapa</h2>
                <p>Percentual de registros conciliados sobre os comparados em cada fluxo. Informativos não entram no cálculo.</p>
              </div>
              <Link className="btn sm" to="/batimentos">Ver batimentos</Link>
            </div>
            <Belt etapas={data.etapas} />
          </section>

          <div className="grid-2">
            <section className="panel">
              <div className="panel-head"><h2>Pendências por categoria</h2></div>
              <div className="panel-body">
                {data.pendenciasPorCategoria.length === 0 ? (
                  <Empty title="Nenhuma pendência aberta" />
                ) : (
                  <ul className="hbars">
                    {data.pendenciasPorCategoria.map((p: { category: string; n: number }) => (
                      <li key={p.category}>
                        <Link to={`/pendencias?status=ABERTAS&category=${p.category}`}>{CATEGORY[p.category] ?? p.category}</Link>
                        <div className="track"><div className="fill" style={{ width: `${(p.n / maxPend) * 100}%` }} /></div>
                        <b>{fmtInt(p.n)}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">
                <div><h2>Recebimentos por data de pagamento</h2><p>Valores do REPASSE, últimas datas com movimento.</p></div>
              </div>
              <div className="panel-body">
                {data.evolucaoRecebimentos.length === 0 ? (
                  <Empty title="Nenhum repasse importado" />
                ) : (
                  <div className="cols" role="img" aria-label="Recebimentos por data">
                    {data.evolucaoRecebimentos.map((d: { d: string; n: number; v: string }) => (
                      <div className="col" key={d.d} title={`${fmtDate(d.d)}: ${fmtMoney(d.v)} em ${d.n} pagamento(s)`}>
                        <span style={{ height: `${Math.max(2, (Number(d.v) / maxDay) * 120)}px` }} />
                        <small>{fmtDate(d.d).slice(0, 5)}</small>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export const CATEGORY: Record<string, string> = {
  NAO_LOCALIZADO_BANCO: 'Não localizado no banco',
  NAO_LOCALIZADO_ASSESSORIA: 'Não localizado na assessoria',
  DIVERGENCIA_CADASTRAL: 'Divergência cadastral',
  DIVERGENCIA_VALOR: 'Divergência de valor',
  DIVERGENCIA_DATA: 'Divergência de data',
  DUPLICIDADE: 'Duplicidade',
  PAGAMENTO_NAO_IDENTIFICADO: 'Pagamento não identificado',
  ACORDO_NAO_RECONHECIDO: 'Acordo não reconhecido',
  CONTRATO_NAO_RECONHECIDO: 'Contrato não reconhecido',
  ARQUIVO_INVALIDO: 'Arquivo inválido',
  ERRO_LAYOUT: 'Outros erros de layout',
};
