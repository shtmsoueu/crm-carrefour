import './flows.js';
import { pool } from '../db/pool.js';
import type { Actor } from '../services/audit.js';
import { refreshStatuses } from '../status/refresh.js';
import { listFlows, runAllFlows } from './engine.js';
export { listFlows, runFlow, runAllFlows } from './engine.js';

/** Arquivos do batimento oficial (enviados 1 vez por mês). Só eles disparam o motor de batimento. */
export const BAT_TYPES = ['BAT_CONTRATOS', 'BAT_ACORDO', 'BAT_ACORDO_PGTO'];

/** Fluxos que usam um tipo de arquivo (referência para telas e documentação). */
export function flowsForFileType(fileType: string): string[] {
  return listFlows()
    .filter((f) => f.sources.includes(fileType) || (fileType.startsWith('REJ_CAMPANHA') && f.code === 'H_CAMPANHAS'))
    .map((f) => f.code);
}

/** Existe ao menos um arquivo BAT confirmado (condição para executar o batimento). */
export async function hasBatimento(): Promise<boolean> {
  const r = await pool.query(`SELECT 1 FROM imports WHERE file_type = ANY($1::text[]) AND status = 'CONFIRMADO' LIMIT 1`, [BAT_TYPES]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * Após confirmação, cancelamento ou reprocessamento:
 *   - arquivos operacionais: atualizam apenas o status do contrato e do acordo (sem confronto);
 *   - arquivos BAT (mensais): atualizam o status e executam o batimento oficial.
 */
export async function afterDataChange(fileTypes: string[], actor: Actor) {
  const status = await refreshStatuses();
  const bat = fileTypes.some((t) => BAT_TYPES.includes(t));
  const flows = bat ? (await runAllFlows(actor)).map((r) => ({ flow: r.flow, total: r.total, divergences: r.divergences })) : [];
  return { status, flows, batimento: bat ? 'EXECUTADO' : 'SOMENTE_STATUS' };
}
