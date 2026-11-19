import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { ContractLink, CopyButton, CpfLink, Empty, Hint, Loading, MapBadge, Notice, titulo, useLoad } from '../components/ui';
import { AGREEMENT_STATUS, CONTRACT_STATUS, fmtDate, fmtInt, fmtMoney, INSTALLMENT_STATUS } from '../format';

const SOURCE: Record<string, string> = { ACORDO_ASSESSORIA: 'ACORDO_ASSESSORIA', REPASSE: 'REPASSE', QUEBRA_ACORDO: 'QUEBRA_ACORDO' };

/** Acordo com status operacional e grade completa de parcelas (00 = entrada, 01 = colchão). */
export function AcordoPage() {
  const { ahid = '' } = useParams();
  const { data, error, loading } = useLoad(() => api(`/acordos/${encodeURIComponent(ahid)}`), [ahid]);
  const a = data?.acordo;
  const parcelas: any[] = data?.parcelas ?? [];
  const pagas = parcelas.filter((p) => p.status === 'PAGA');
  const label = (n: number) => (n === 0 ? 'Entrada' : n === 1 ? 'Colchão' : `Parcela ${String(n).padStart(2, '0')}`);

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>{titulo('Acordo')}</h1></div>
        {a?.contract_key && <Link className="btn sm" to={`/contratos/${encodeURIComponent(a.contract_key)}`}>Abrir contrato</Link>}
      </div>
      {loading && !data && <Loading />}
      {error && <Notice tone="bad">{error}</Notice>}
      {a && (
        <>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2 className="code" style={{ fontSize: 'var(--t-xl)' }}>{a.ahid} <CopyButton value={a.ahid} label="acordo" /></h2>
                <p>{a.name ?? 'Titular não informado'}{a.cpf && <>, CPF/CNPJ <CpfLink cpf={a.cpf} /></>}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <MapBadge map={AGREEMENT_STATUS} value={a.status} />
                <div className="small muted">{a.status_reason}</div>
              </div>
            </div>
            <div className="panel-body">
              <dl className="facts">
                <div><dt>Contrato</dt><dd><ContractLink contract={a.contract_key} /> {a.contract_status && <MapBadge map={CONTRACT_STATUS} value={a.contract_status} />}</dd></div>
                <div><dt>Data do acordo</dt><dd>{fmtDate(a.agreement_date)}</dd></div>
                <div><dt>Tipo</dt><dd className="code">{a.agreement_type ?? '—'}</dd></div>
                <div><dt>Valor</dt><dd className="num">{fmtMoney(a.total_amount)}</dd></div>
                <div><dt>Parcelas pagas</dt><dd className="num">{fmtInt(pagas.length)} / {fmtInt(parcelas.length)}</dd></div>
                <div><dt>Origem / canal</dt><dd>{a.ahcollid ?? <span className="muted">não informado</span>}{a.ahcollid_source && <span className="small muted"> ({a.ahcollid_source})</span>}</dd></div>
                <div>
                  <dt>Origem do status <Hint text={`Calculado em ${fmtDate(a.status_ref_date)} a partir dos arquivos operacionais.`} /></dt>
                  <dd className="small">{a.status_source ? <>{SOURCE[a.status_source] ?? a.status_source}{a.status_file && <div className="code"><Link to={`/importacao/${a.status_import_id}`}>{a.status_file}</Link>{a.status_line ? `, linha ${a.status_line}` : ''}</div>}</> : '—'}</dd>
                </div>
              </dl>
              {a.beyond_tolerance && <div style={{ marginTop: 12 }}><Notice tone="warn">Atraso acima da tolerância ({fmtInt(a.days_late)} dias). A quebra só é registrada com o arquivo QUEBRA_ACORDO.</Notice></div>}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Parcelas <Hint text="00 = entrada (tolerância 7 dias) · 01 = colchão (tolerância 30 dias). Pagamento identificado pelo número da parcela (PMBATCH) do REPASSE." /></h2></div>
            {parcelas.length === 0 ? <Empty title="Sem grade de parcelas">O acordo não consta em nenhum ACORDO_ASSESSORIA importado.</Empty> : (
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th className="num">Nº</th><th>Parcela</th><th>Vencimento</th><th className="num">Valor</th><th>Status</th><th className="num">Atraso</th><th>Pagamento</th><th>Origem</th></tr></thead>
                  <tbody>
                    {parcelas.map((p) => (
                      <tr key={p.numero}>
                        <td className="num code">{String(p.numero).padStart(2, '0')}</td>
                        <td>{label(p.numero)}{p.tolerance_days !== null && <span className="small muted"> · tolerância {p.tolerance_days} dias</span>}</td>
                        <td>{fmtDate(p.due_date)}</td>
                        <td className="num">{fmtMoney(p.amount)}</td>
                        <td><MapBadge map={INSTALLMENT_STATUS} value={p.status} /></td>
                        <td className="num">{p.days_late !== null ? `${fmtInt(p.days_late)} d` : '—'}</td>
                        <td className="small">{p.paid_at ? <>{fmtDate(p.paid_at)} · {fmtMoney(p.paid_amount)}{p.payment_code && <span className="muted"> ({p.payment_code})</span>}</> : <span className="muted">—</span>}</td>
                        <td className="small code">
                          <Link to={`/importacao/${p.agreement_import_id}`}>{p.agreement_file}</Link>{p.agreement_line ? `:${p.agreement_line}` : ''}
                          {p.payment_file && <div><Link to={`/importacao/${p.payment_import_id}`}>{p.payment_file}</Link>{p.payment_line ? `:${p.payment_line}` : ''}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {data.pagamentos_sem_parcela.length > 0 && (
            <section className="panel">
              <div className="panel-head"><h2>Pagamentos sem parcela na grade <Hint text="Linhas do REPASSE deste acordo não associadas a uma parcela (número acima da grade ou linha repetida)." /></h2></div>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Data</th><th className="num">Valor</th><th>Parcela informada</th><th>Código</th><th>Arquivo</th></tr></thead>
                  <tbody>
                    {data.pagamentos_sem_parcela.map((p: any) => (
                      <tr key={`${p.import_id}:${p.line_number}`}>
                        <td>{fmtDate(p.event_date)}</td><td className="num">{fmtMoney(p.amount)}</td><td className="code">{p.parcela ?? '—'}</td><td className="code">{p.codigo ?? '—'}</td>
                        <td className="small code"><Link to={`/importacao/${p.import_id}`}>{p.file}</Link>:{p.line_number}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
