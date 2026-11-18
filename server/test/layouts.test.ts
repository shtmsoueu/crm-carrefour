import { describe, expect, it } from 'vitest';
import { LAYOUTS } from '../src/layouts/definitions.js';
import { identifyByFilename } from '../src/layouts/identify.js';

describe('dicionário de layouts', () => {
  for (const l of LAYOUTS) {
    const recs = [...l.records, ...l.headerTrailer.flatMap((v) => [v.header, v.trailer].filter(Boolean))];
    for (const r of recs) {
      it(`${l.code} / ${r!.name}: campos dentro do registro e sem sobreposição`, () => {
        const sorted = [...r!.fields].sort((a, b) => a.start - b.start);
        let last = 0;
        for (const f of sorted) {
          expect(f.start, `${f.name} início`).toBeGreaterThan(last);
          expect(f.end, `${f.name} fim`).toBeGreaterThanOrEqual(f.start);
          expect(f.end, `${f.name} excede o registro`).toBeLessThanOrEqual(r!.length);
          last = f.end;
        }
      });
    }
  }
});

describe('identificação pela nomenclatura do De-Para', () => {
  const cases: [string, string, string | null][] = [
    ['REM_CONTRATOS_LEALCO_20261117_051318.txt', 'REM_CONTRATOS', '2026-11-17'],
    ['RET_DISTRIBUICAO_LEALCO_17112026.txt', 'RET_DISTRIBUICAO', '2026-11-17'],
    ['RET_DISTRIBUICAO_LEALCO_20261117.txt', 'RET_DISTRIBUICAO', '2026-11-17'],
    ['RET_CARTEIRA_LEALCO_17112026.txt', 'RET_CARTEIRA', '2026-11-17'],
    ['REPASSE_LEALCO_17112026.txt', 'REPASSE', '2026-11-17'],
    ['REM_BOLETOS_LEALCO_20261117_051639.txt', 'REM_BOLETOS', '2026-11-17'],
    ['QUEBRA_ACORDO_LEALCO_20261117_053345.txt', 'QUEBRA_ACORDO', '2026-11-17'],
    ['ELEGIBILIDADE_LEALCO_20261117_053338.txt', 'ELEGIBILIDADE', '2026-11-17'],
    ['CCAM_LEALCO_20261117_051523.txt', 'CCAM', '2026-11-17'],
    ['ACORDO_ASSESSORIA_LEALCO_20261117_053059.txt', 'ACORDO_ASSESSORIA', '2026-11-17'],
    ['20261117_053402_comissao_LEALCO_out.txt', 'COMISSAO', '2026-11-17'],
    ['BAT_CONTRATOS_LEALCO_20261117_010101.txt', 'BAT_CONTRATOS', '2026-11-17'],
    ['BAT_ACORDO_LEALCO_20261117_010101.txt', 'BAT_ACORDO', '2026-11-17'],
    ['BAT_ACORDO_PGTO_LEALCO_20261117_010101.txt', 'BAT_ACORDO_PGTO', '2026-11-17'],
    ['tb_campanha_rej_ext_LEALCO_20261117_034554.txt', 'REJ_CAMPANHA_EXT', '2026-11-17'],
    ['tb_campanha_rej_int_LEALCO_20261117_034551.txt', 'REJ_CAMPANHA_INT', '2026-11-17'],
    ['CY_IE003_20261117_LEALCO.txt', 'CAMPANHA_ASSESSORIA', '2026-11-17'],
    ['CSF_RAJADAS_PGTOS_PIX_LEALCO_20261117', 'RAJADA_PIX', '2026-11-17'],
  ];
  for (const [name, code, date] of cases) {
    it(name, () => {
      const id = identifyByFilename(name);
      expect(id?.code).toBe(code);
      expect(id?.fileDate).toBe(date);
      expect(id?.agency).toBe('LEALCO');
    });
  }
  it('BAT_ACORDO_PGTO não é confundido com BAT_ACORDO', () => {
    expect(identifyByFilename('BAT_ACORDO_PGTO_X_20261117_010101.txt')?.code).toBe('BAT_ACORDO_PGTO');
  });
  it('nome fora do padrão não é identificado', () => {
    expect(identifyByFilename('planilha_qualquer.txt')).toBeNull();
  });
});
