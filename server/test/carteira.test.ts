import { describe, expect, it } from 'vitest';
import { classifyFaixa, classifyOrigem, classifyProduto, classifyRanking, FAIXAS } from '../src/portfolio/rules.js';
import { equivalent, normKey, parseDateAny, parseNum } from '../src/crm/compare.js';
import { parseCsv } from '../src/crm/parse.js';

describe('regra 1 — origem pelo AHCOLLID', () => {
  it('LEALCO é ASSESSORIA (DIRETO), inclusive com espaços/minúsculas', () => {
    expect(classifyOrigem('LEALCO').value).toBe('ASSESSORIA (DIRETO)');
    expect(classifyOrigem(' lealco ').value).toBe('ASSESSORIA (DIRETO)');
  });
  it('qualquer outro identificador é INDIRETO', () => {
    for (const v of ['Serasa', 'MIA', 'APP', 'LEALCO2', '26110609']) expect(classifyOrigem(v).value).toBe('INDIRETO');
  });
  it('ausência de AHCOLLID é informação complementar ausente: sem origem e sem alerta', () => {
    expect(classifyOrigem('')).toEqual({ value: null });
    expect(classifyOrigem(null)).toEqual({ value: null });
  });
});

describe('regra 4 — produto', () => {
  it('códigos reais da carteira', () => {
    for (const c of ['MCATGOLD', 'MCATAINT', 'VSATGOLD', 'MCATGFUN', 'VSATAINT', 'MCATAFUN', 'VSATGFUN']) expect(classifyProduto(c).value).toBe('ATACADÃO');
    for (const c of ['MC GOLD', 'MC LOCAL', 'VS GOLD', 'VS INTL', 'PL', 'PLDC', 'VISA', 'PL FUNC', 'MC FUNC']) expect(classifyProduto(c).value).toBe('CARREFOUR');
  });
  it('SAMS', () => expect(classifyProduto('MCSAMSGOLD').value).toBe('SAMS CLUB'));
  it('sem sobreposição: AT e SAMS juntos ficam sem classificação e sinalizados', () => {
    const r = classifyProduto('SAMSAT');
    expect(r.value).toBeNull();
    expect(r.flag).toBe('PRODUTO_AMBIGUO');
  });
  it('sem código é sinalizado', () => expect(classifyProduto(null).flag).toBe('PRODUTO_SEM_CODIGO'));
});

describe('regra 3 — ranking', () => {
  it('limites de dias', () => {
    expect(classifyRanking(0, 2000).ranking).toBe('G1 – MAIOR MIL');
    expect(classifyRanking(364, 2000).ranking).toBe('G1 – MAIOR MIL');
    expect(classifyRanking(365, 2000).ranking).toBe('G2 – MAIOR MIL');
    expect(classifyRanking(9999, 100).ranking).toBe('G2 – MENOR MIL');
  });
  it('limite de saldo: 1.500,01 é MAIOR e 1.499,99 é MENOR', () => {
    expect(classifyRanking(400, 1500.01).ranking).toBe('G2 – MAIOR MIL');
    expect(classifyRanking(400, 1499.99).ranking).toBe('G2 – MENOR MIL');
  });
  it('saldo exatamente 1.500 não é classificado e é sinalizado', () => {
    const r = classifyRanking(400, 1500);
    expect(r.ranking).toBeNull();
    expect(r.grupo).toBe('G2');
    expect(r.flags).toContain('RANKING_SALDO_IGUAL_1500');
  });
  it('dias fora das regras', () => {
    expect(classifyRanking(10000, 2000).flags).toContain('RANKING_DIAS_FORA_DA_REGRA');
    expect(classifyRanking(-1, 2000).flags).toContain('RANKING_DIAS_FORA_DA_REGRA');
  });
  it('G1 – MENOR MIL é sinalizado como conflito entre as regras 3 e 5', () => {
    const r = classifyRanking(100, 500);
    expect(r.ranking).toBe('G1 – MENOR MIL');
    expect(r.flags).toContain('RANKING_G1_MENOR_MIL_CONFLITO');
  });
  it('dados ausentes', () => expect(classifyRanking(null, 10).flags).toContain('RANKING_SEM_DADOS'));
});

describe('regra 5 — faixas de atraso', () => {
  const fx = (d: number, s = 5000) => classifyFaixa(d, classifyRanking(d, s));
  it('limites de todas as faixas', () => {
    const cases: [number, string][] = [
      [61, '03'], [90, '03'], [91, '04'], [120, '04'], [121, '05'], [150, '05'], [151, '06'], [180, '06'], [181, '07'], [210, '07'],
      [211, '08'], [240, '08'], [241, '09'], [270, '09'], [271, '10'], [300, '10'], [301, '11'], [330, '11'], [331, '12'], [364, '12'],
      [365, '14'], [450, '14'], [451, '15'], [540, '15'], [541, '16'], [630, '16'], [631, '17'], [720, '17'], [721, '18'], [810, '18'],
      [811, '19'], [1080, '19'], [1081, '21'], [1440, '21'], [1441, '22'], [9999, '22'],
    ];
    for (const [d, c] of cases) expect(fx(d).value?.codigo, `${d} dias`).toBe(c);
  });
  it('faixas não se sobrepõem e cobrem 61 em diante sem lacunas', () => {
    for (let d = 61; d <= 3000; d++) {
      const n = FAIXAS.filter((f) => d >= f.de && (f.ate === null || d <= f.ate)).length;
      expect(n, `${d} dias`).toBe(1);
    }
  });
  it('G1 até 60 dias não tem faixa e é sinalizado', () => {
    const r = fx(60);
    expect(r.value).toBeNull();
    expect(r.flag).toBe('FAIXA_G1_ATE_60_DIAS');
  });
  it('MENOR MIL usa as faixas do grupo 2', () => expect(fx(500, 800).value?.codigo).toBe('15'));
  it('MENOR MIL não recebe faixa no grupo 1', () => expect(fx(100, 800).value).toBeNull());
  it('saldo igual a 1.500: G2 recebe a faixa (independe do ranking); G1 não recebe', () => {
    expect(classifyFaixa(500, classifyRanking(500, 1500)).value?.codigo).toBe('15');
    expect(classifyFaixa(100, classifyRanking(100, 1500)).value).toBeNull();
  });
});

describe('normalização para confronto com o CRM', () => {
  it('números em pt-BR e en', () => {
    expect(parseNum('1.234,56')).toBe(1234.56);
    expect(parseNum('1,234.56')).toBe(1234.56);
    expect(parseNum('R$ 50,00')).toBe(50);
    expect(parseNum('29')).toBe(29);
    expect(parseNum('abc')).toBeNull();
  });
  it('datas', () => {
    expect(parseDateAny('17/11/2026')).toBe('2026-11-17');
    expect(parseDateAny('2026-11-17T10:00:00')).toBe('2026-11-17');
    expect(parseDateAny('46343')).toBe('2026-11-17');
  });
  it('chave com e sem zeros à esquerda', () => {
    expect(normKey('00001089721', { stripLeadingZeros: true, digitsOnly: false })).toBe('1089721');
    expect(normKey('6700849917-9', { stripLeadingZeros: true, digitsOnly: true })).toBe('67008499179');
  });
  it('texto sem acento/caixa e equivalências', () => {
    expect(equivalent('text', 'ATACADÃO', 'atacadao')).toBe(true);
    expect(equivalent('text', 'LEALCO', 'Assessoria', new Map([['ASSESSORIA', 'LEALCO']]))).toBe(true);
    expect(equivalent('number', 29, '29,00')).toBe(true);
    expect(equivalent('number', 29, '30')).toBe(false);
  });
  it('CSV com aspas, delimitador e quebra de linha no campo', () => {
    const m = parseCsv('a;b\r\n"x;1";"linha\nnova"\r\n"aspas ""ok""";2\r\n', ';');
    expect(m).toEqual([['a', 'b'], ['x;1', 'linha\nnova'], ['aspas "ok"', '2']]);
  });
});
