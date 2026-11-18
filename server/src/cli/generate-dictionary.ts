/** Gera docs/DICIONARIO_TECNICO.md a partir das definições de layout (fonte única de verdade). */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LAYOUTS } from '../layouts/definitions.js';
import type { RecordDef } from '../layouts/types.js';
import { listFlows } from '../reconciliation/index.js';

const NOTE: Record<string, string> = { CORRECAO: 'Correção aplicada', DIVERGENCIA_ARQUIVO_REAL: 'Arquivo real x layout', LIMITACAO: 'Limitação', INFORMACAO: 'Informação' };
const esc = (s: string) => s.replace(/\|/g, '\\|');
const table = (r: RecordDef) =>
  [
    '| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |',
    '|---|---:|---:|---:|---|---:|:-:|---|',
    ...r.fields.map((f) => `| \`${f.name}\` | ${f.start} | ${f.end} | ${f.end - f.start + 1} | ${f.type}${f.dateFormat ? ` (${f.dateFormat})` : ''} | ${f.decimals ?? ''} | ${f.required ? 'x' : ''} | ${esc(f.label)}${f.note ? ` _Obs.: ${esc(f.note)}_` : ''} |`),
  ].join('\n');

const out: string[] = [
  '# Dicionário técnico dos arquivos — Carteira Carrefour',
  '',
  '> Gerado automaticamente por `npm run docs:dictionary` a partir de `server/src/layouts/definitions.ts`, que é a especificação efetivamente usada pelos importadores.',
  '> Fontes: `DE_PARA_LAYOUTS_ASSESSORIAS.xlsx` e `Layouts_Pos_validacao.zip`. Encoding dos arquivos: ISO-8859-1 (confirmado nas cargas de teste).',
  '',
  '## Resumo',
  '',
  '| Tipo | Nomenclatura oficial | Finalidade (De-Para) | Layout | Tamanho do registro |',
  '|---|---|---|---|---|',
  ...LAYOUTS.map((l) => `| \`${l.code}\` | \`${l.namingPattern}\` | ${l.purpose} | ${l.sourceLayout ?? 'Sem layout'} | ${l.records.map((r) => `${r.code === '*' ? '' : `tipo ${r.code}: `}${r.length}`).join(', ') || '—'} |`),
  '',
];
for (const l of LAYOUTS) {
  out.push(`## ${l.title} (\`${l.code}\`)`, '', `- **Nomenclatura:** \`${l.namingPattern}\``, `- **Finalidade:** ${l.purpose}`, `- **Planilha de origem:** ${l.sourceLayout ?? 'não há (De-Para)'}`, '');
  if (l.notes.length) {
    out.push('**Observações**', '');
    for (const n of l.notes) out.push(`- _${NOTE[n.kind]}:_ ${n.text}`);
    out.push('');
  }
  for (const v of l.headerTrailer) {
    if (v.header) out.push(`### Header: ${v.description}`, '', table(v.header), '');
    if (v.trailer) out.push(`### Trailer`, '', table(v.trailer), '');
  }
  for (const r of l.records) out.push(`### Registro ${r.code === '*' ? '' : `tipo ${r.code}: `}${r.name} (${r.length} posições)`, '', table(r), '');
}
out.push('## Regras de relacionamento do motor de batimento', '');
for (const f of listFlows()) {
  out.push(`### ${f.title}`, '', f.description, '', `Arquivos: ${f.sources.map((s) => `\`${s}\``).join(', ')}`, '', ...f.rules.map((r) => `- ${r}`), '');
}
const target = resolve(process.argv[2] ?? '../docs/DICIONARIO_TECNICO.md');
writeFileSync(target, out.join('\n'));
console.log(`Dicionário gerado em ${target}`);
