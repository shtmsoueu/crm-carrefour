import './flows.js';
export { listFlows, runFlow, runAllFlows } from './engine.js';

/** Fluxos impactados por cada tipo de arquivo (executados automaticamente após confirmação/cancelamento). */
import { listFlows } from './engine.js';
export function flowsForFileType(fileType: string): string[] {
  return listFlows()
    .filter((f) => f.sources.includes(fileType) || (fileType.startsWith('REJ_CAMPANHA') && f.code === 'H_CAMPANHAS'))
    .map((f) => f.code);
}
