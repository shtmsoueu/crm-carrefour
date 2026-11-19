/**
 * CONCILIAÇÃO EM MASSA COM O CRM EXTERNO
 *
 * - A exportação do CRM é armazenada (original compactado + linhas) e nunca alterada.
 * - O confronto cobre 100% das contas do escopo escolhido e 100% das linhas do CRM.
 * - Situações: CONFORME, NÃO IMPORTADO, DIVERGENTE e, à parte, NÃO CONSTA NA BASE
 *   (linha do CRM sem conta correspondente na base original — fora das três situações pedidas).
 * - Nada é escrito no CRM oficial.
 */
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gunzip as gunzipCb, gzip as gzipCb } from 'node:zlib';
import { pool, withTransaction } from '../db/pool.js';
import { audit, type Actor } from '../services/audit.js';
import { getSetting, setSetting } from '../services/settings.js';
import { ImportError } from '../imports/service.js';
import { AGREEMENT_ATTRIBUTES, BASE_ATTRIBUTES, buildAgreementView, buildPersonView, getPortfolioCached, PERSON_ATTRIBUTES, type PortfolioRow } from '../portfolio/portfolio.js';
import { FLAG_LABELS } from '../portfolio/rules.js';
import { equivalent, normKey, normText, type Kind } from './compare.js';
import { parseCrmExport } from './parse.js';

const gzip = promisify(gzipCb);
const gunzip = promisify(gunzipCb);

export const SETTING_CRM_PROFILE = 'crm_perfil_conciliacao';

export interface Comparison {
  crmColumn: string;
  baseAttribute: string;
  kind?: Kind;
  /** Equivalências de valores: valor no CRM -> valor na base (ex.: "Em dia" -> "ATIVO"). */
  equivalences?: { crm: string; base: string }[];
  /**
   * Quando a base original não possui a informação para a conta (ex.: conta sem acordo não tem
   * parcelas nem AHCOLLID): 'ignore' (padrão) não confronta o campo; 'compare' exige que o CRM também esteja vazio.
   */
  whenBaseEmpty?: 'ignore' | 'compare';
}
export type Pillar = 'CONTRATO' | 'ACORDO' | 'CPF';
export const PILLARS: Record<Pillar, string> = {
  CONTRATO: 'Pilar 2 — Nº Conta / Nº Contrato (visão contrato)',
  ACORDO: 'Pilar 1 — Número do Acordo (visão conta)',
  CPF: 'Pilar 3 — CPF/CNPJ (visão unique)',
};
export interface CrmProfile {
  /** Identificador usado no confronto (padrão: contrato). */
  pillar?: Pillar;
  keyColumn: string;
  key: { stripLeadingZeros: boolean; digitsOnly: boolean };
  comparisons: Comparison[];
}
export type Scope = 'ATIVOS' | 'COM_CADASTRO' | 'TODOS';
export const SCOPES: Record<Scope, string> = {
  ATIVOS: 'Carteira ativa (contratos com situação ATIVO)',
  COM_CADASTRO: 'Contratos com cadastro (REM/BAT_CONTRATOS), inclusive retirados',
  TODOS: 'Todos os contratos presentes em qualquer arquivo importado',
};

type Attr = { key: string; label: string; kind: Kind; source: string };
export function attributesFor(pillar: Pillar): Map<string, Attr> {
  const list = (pillar === 'ACORDO' ? AGREEMENT_ATTRIBUTES : pillar === 'CPF' ? PERSON_ATTRIBUTES : BASE_ATTRIBUTES) as Attr[];
  return new Map(list.map((a) => [a.key as string, a]));
}
const ATTR = attributesFor('CONTRATO');

export function validateProfile(p: unknown): CrmProfile {
  const v = p as CrmProfile;
  if (!v || typeof v.keyColumn !== 'string' || !v.keyColumn.trim()) throw new ImportError('Informe a coluna do CRM que contém o número do contrato (chave).');
  if (!Array.isArray(v.comparisons)) throw new ImportError('Lista de campos a comparar inválida.');
  const pillar: Pillar = v.pillar && PILLARS[v.pillar] ? v.pillar : 'CONTRATO';
  const attrs = attributesFor(pillar);
  for (const c of v.comparisons) {
    if (!c.crmColumn || !attrs.has(c.baseAttribute)) throw new ImportError(`Campo de comparação inválido para ${PILLARS[pillar]}: ${c.crmColumn} x ${String(c.baseAttribute)}`);
    if (c.kind && !['text', 'number', 'date'].includes(c.kind)) throw new ImportError(`Tipo de comparação inválido em ${c.crmColumn}.`);
  }
  return {
    pillar,
    keyColumn: v.keyColumn,
    key: { stripLeadingZeros: v.key?.stripLeadingZeros !== false, digitsOnly: !!v.key?.digitsOnly },
    comparisons: v.comparisons.map((c) => ({
      ...c,
      whenBaseEmpty: c.whenBaseEmpty === 'compare' ? 'compare' : 'ignore',
      equivalences: (c.equivalences ?? []).filter((e) => e && String(e.crm).trim() !== ''),
    })),
  };
}

export const getProfile = () => getSetting<CrmProfile>(SETTING_CRM_PROFILE);
export async function saveProfile(p: unknown, actor: Actor) {
  const v = validateProfile(p);
  await setSetting(SETTING_CRM_PROFILE, v, actor.id);
  await audit(actor, 'CRM_PERFIL_ALTERADO', 'settings', SETTING_CRM_PROFILE, v);
  return v;
}

// ---------------------------------------------------------------- Exportações do CRM
export async function createSnapshot(buf: Buffer, originalName: string, actor: Actor) {
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const dup = await pool.query(`SELECT id FROM crm_snapshots WHERE sha256 = $1 AND status = 'ATIVO'`, [sha256]);
  if (dup.rows[0]) throw new ImportError(`Esta exportação do CRM já foi carregada (carga #${dup.rows[0].id}).`, 409, { snapshotId: dup.rows[0].id });
  let t;
  try {
    t = await parseCrmExport(buf, originalName);
  } catch (e) {
    throw new ImportError(`Não foi possível ler a exportação do CRM: ${(e as Error).message}`);
  }
  if (!t.rows.length) throw new ImportError('A exportação do CRM não contém linhas de dados.');
  const id = await withTransaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`crm:${sha256}`]);
    const again = await db.query(`SELECT id FROM crm_snapshots WHERE sha256 = $1 AND status = 'ATIVO'`, [sha256]);
    if (again.rows[0]) throw new ImportError(`Esta exportação do CRM já foi carregada (carga #${again.rows[0].id}).`, 409, { snapshotId: again.rows[0].id });
    const r = await db.query<{ id: number }>(
      `INSERT INTO crm_snapshots (original_name, sha256, size_bytes, format, delimiter, encoding, headers, rows_count, warnings, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [originalName, sha256, buf.length, t.format, t.delimiter, t.encoding, JSON.stringify(t.headers), t.rows.length, JSON.stringify(t.warnings), actor.id],
    );
    const sid = r.rows[0].id;
    await db.query(`INSERT INTO crm_snapshot_files (snapshot_id, content) VALUES ($1, $2)`, [sid, await gzip(buf)]);
    for (let i = 0; i < t.rows.length; i += 2000) {
      await db.query(
        `INSERT INTO crm_snapshot_rows (snapshot_id, row_number, data)
         SELECT $1, (x.n)::int, x.d FROM jsonb_to_recordset($2::jsonb) AS x(n int, d jsonb)`,
        [sid, JSON.stringify(t.rows.slice(i, i + 2000).map((d, j) => ({ n: i + j + 2, d })))],
      );
    }
    await audit(actor, 'CRM_EXPORTACAO_CARREGADA', 'crm_snapshot', sid, { file: originalName, rows: t.rows.length, format: t.format }, db);
    return sid;
  });
  return getSnapshot(id);
}

export async function getSnapshot(id: number) {
  const r = await pool.query(
    `SELECT s.id, s.original_name, s.sha256, s.size_bytes, s.format, s.delimiter, s.encoding, s.headers, s.rows_count, s.warnings, s.status,
       s.uploaded_at, u.name AS uploaded_by_name FROM crm_snapshots s LEFT JOIN users u ON u.id = s.uploaded_by WHERE s.id = $1`,
    [id],
  );
  if (!r.rows[0]) throw new ImportError('Exportação do CRM não encontrada.', 404);
  const sample = await pool.query(`SELECT row_number, data FROM crm_snapshot_rows WHERE snapshot_id = $1 ORDER BY row_number LIMIT 20`, [id]);
  return { ...r.rows[0], sample: sample.rows };
}

export async function readSnapshotFile(id: number): Promise<Buffer | null> {
  const r = await pool.query<{ content: Buffer }>(`SELECT content FROM crm_snapshot_files WHERE snapshot_id = $1`, [id]);
  return r.rows[0] ? gunzip(r.rows[0].content) : null;
}

/** Sugestão de mapeamento pelo nome das colunas (o usuário revisa e confirma antes de salvar). */
export function suggestProfile(headers: string[]): CrmProfile {
  const h = headers.map((x) => ({ x, n: normText(x) }));
  const find = (...re: RegExp[]) => h.find(({ n }) => re.some((r) => r.test(n)))?.x;
  const key = find(/^(CONTRATO|NUMERO DO CONTRATO|N CONTRATO|NR CONTRATO|DMACCT|CONTA|NUMERO DA CONTA)$/, /CONTRATO/, /CONTA/) ?? headers[0];
  const comparisons: Comparison[] = [];
  const add = (col: string | undefined, attr: keyof PortfolioRow) => col && col !== key && comparisons.push({ crmColumn: col, baseAttribute: attr, kind: ATTR.get(attr)!.kind, equivalences: [] });
  add(find(/^(CPF|CNPJ|CPF\/CNPJ|CPF CNPJ|DOCUMENTO|DMSSNUM)$/, /CPF/), 'cpf');
  add(find(/^STATUS$/, /STATUS/, /SITUACAO/), 'status_contrato');
  add(find(/PARCELA/), 'parcelas');
  add(find(/CANAL/), 'canal_acordo');
  add(find(/AHCOLLID/), 'origem_ahcollid');
  add(find(/DIAS/, /ATRASO/), 'dias_atraso');
  add(find(/RANKING/), 'ranking');
  add(find(/FAIXA/), 'faixa_codigo');
  add(find(/PRODUTO/), 'produto');
  return { keyColumn: key, key: { stripLeadingZeros: true, digitsOnly: false }, comparisons };
}

// ---------------------------------------------------------------- Execução da conciliação
const BASE_SNAPSHOT_FIELDS: (keyof PortfolioRow)[] = [
  'cpf', 'nome', 'status_contrato', 'produto', 'origem', 'origem_ahcollid', 'grupo', 'ranking', 'faixa_codigo', 'dias_atraso', 'saldo_risco',
  'acordo_id', 'acordo_status', 'parcelas', 'canal_acordo', 'ultimo_pagamento_codigo', 'comissao_linhas', 'comissao_valor_recebido', 'comissao_remuneracao_bruta',
  'comissao_linhas_distintas', 'comissao_valor_linhas_distintas',
];

export async function runReconciliation(snapshotId: number, scope: Scope, actor: Actor) {
  if (!SCOPES[scope]) throw new ImportError('Escopo inválido.');
  const profile = await getProfile();
  if (!profile) throw new ImportError('Configure o mapeamento de colunas do CRM antes de executar a conciliação.', 409);
  const snap = await getSnapshot(snapshotId);
  if (snap.status !== 'ATIVO') throw new ImportError('Esta exportação do CRM foi cancelada.', 409);
  const headers = snap.headers as string[];
  const missing = [profile.keyColumn, ...profile.comparisons.map((c) => c.crmColumn)].filter((c) => !headers.includes(c));
  if (missing.length) throw new ImportError(`Colunas do mapeamento não encontradas nesta exportação: ${missing.join(', ')}.`, 422);

  const { rows: portfolio, settings } = await getPortfolioCached();
  const pillar: Pillar = profile.pillar ?? 'CONTRATO';
  const run = await pool.query<{ id: number }>(
    `INSERT INTO crm_recon_runs (snapshot_id, scope, profile, rules, status, started_by) VALUES ($1,$2,$3,$4,'EXECUTANDO',$5) RETURNING id`,
    [snapshotId, scope, JSON.stringify(profile), JSON.stringify({ carteira: settings, pilar: pillar }), actor.id],
  );
  const runId = run.rows[0].id;
  try {
    const t0 = Date.now();
    const crmRows = await pool.query<{ row_number: number; data: Record<string, string> }>(`SELECT row_number, data FROM crm_snapshot_rows WHERE snapshot_id = $1 ORDER BY row_number`, [snapshotId]);
    // Número do acordo e CPF/CNPJ são identificadores numéricos: comparados só por dígitos, sem zeros à esquerda.
    const ko = pillar === 'CONTRATO' ? profile.key : { stripLeadingZeros: true, digitsOnly: true };
    const items: Record<string, unknown>[] = [];
    const crmBy = new Map<string, { row_number: number; data: Record<string, string> }[]>();
    let blankKeys = 0;
    for (const r of crmRows.rows) {
      const k = normKey(r.data[profile.keyColumn], ko);
      if (!k) {
        // Nenhuma linha do CRM sai da análise: linhas sem chave ficam listadas.
        blankKeys++;
        items.push({ contrato: `(linha ${r.row_number})`, situacao: 'NAO_CONSTA_NA_BASE', motivo: `Linha do CRM sem valor na coluna-chave "${profile.keyColumn}"`, crm_rows: [r.row_number], crm: r.data });
        continue;
      }
      const l = crmBy.get(k);
      if (l) l.push(r);
      else crmBy.set(k, [r]);
    }

    // Base original conforme o pilar escolhido
    const portScope = (p: PortfolioRow) => scope === 'TODOS' || (scope === 'ATIVOS' ? p.status_contrato === 'ATIVO' : p.fonte_cadastro !== null);
    type BaseRow = { key: string; attrs: Record<string, unknown>; snap: Record<string, unknown>; outOfScope?: string };
    let inScope: BaseRow[];
    let allRows: BaseRow[];
    let semChaveNaBase = 0;
    const baseSnap = (p: PortfolioRow) => Object.fromEntries(BASE_SNAPSHOT_FIELDS.map((k) => [k, p[k]]));
    if (pillar === 'ACORDO') {
      const byCt = new Map(portfolio.map((p) => [p.contrato, p]));
      const ag = await buildAgreementView();
      const rows = ag.map((a) => {
        const p = a.contrato ? byCt.get(a.contrato) : undefined;
        return { key: a.acordo_id, attrs: a as unknown as Record<string, unknown>, snap: { ...a }, inScope: !p ? scope === 'TODOS' : portScope(p), status: p?.status_contrato };
      });
      inScope = rows.filter((r) => r.inScope);
      allRows = rows.map((r) => ({ ...r, outOfScope: `Acordo existe na base original, mas o contrato está fora do escopo (situação ${r.status ?? 'desconhecida'})` }));
    } else if (pillar === 'CPF') {
      const scoped = buildPersonView(portfolio.filter(portScope));
      const all = buildPersonView(portfolio);
      semChaveNaBase = scoped.semCpf;
      inScope = scoped.people.map((x) => ({ key: x.cpf, attrs: x as unknown as Record<string, unknown>, snap: { ...x } }));
      allRows = all.people.map((x) => ({ key: x.cpf, attrs: x as unknown as Record<string, unknown>, snap: { ...x }, outOfScope: 'CPF/CNPJ existe na base original, mas sem contratos no escopo' }));
    } else {
      inScope = portfolio.filter(portScope).map((p) => ({ key: p.contrato, attrs: p as unknown as Record<string, unknown>, snap: baseSnap(p) }));
      allRows = portfolio.map((p) => ({ key: p.contrato, attrs: p as unknown as Record<string, unknown>, snap: baseSnap(p), outOfScope: `Conta existe na base original, mas fora do escopo (situação ${p.status_contrato})` }));
    }
    const ATTRS = attributesFor(pillar);
    const allBy = new Map(allRows.map((p) => [normKey(p.key, ko), p]));
    const baseKeys = new Set<string>();
    const equivMaps = profile.comparisons.map((c) => new Map((c.equivalences ?? []).map((e) => [normText(e.crm), String(e.base)])));

    const fieldCounts: Record<string, number> = {};
    const notCompared: Record<string, number> = {};
    let semConfronto = 0;

    for (const p of inScope) {
      const k = normKey(p.key, ko);
      if (baseKeys.has(k)) {
        // duas entradas da base com a mesma chave normalizada (ex.: zeros à esquerda)
        items.push({ contrato: p.key, situacao: 'DIVERGENTE', motivo: 'Chave duplicada na base original após normalização', duplicado: true, base: p.snap });
        continue;
      }
      baseKeys.add(k);
      const found = crmBy.get(k);
      if (!found) {
        items.push({ contrato: p.key, situacao: 'NAO_IMPORTADO', motivo: 'Registro da base original não localizado no CRM', base: p.snap });
        continue;
      }
      const div: { campo: string; atributo: string; coluna_crm: string; base: unknown; crm: unknown }[] = [];
      if (found.length > 1) div.push({ campo: 'REGISTRO DUPLICADO NO CRM', atributo: 'chave', coluna_crm: profile.keyColumn, base: 1, crm: found.length });
      let compared = 0;
      const skipped: string[] = [];
      profile.comparisons.forEach((c, i) => {
        const attr = ATTRS.get(c.baseAttribute)!;
        const kind = c.kind ?? attr.kind;
        const bv = p.attrs[c.baseAttribute];
        if ((bv === null || bv === undefined || bv === '') && c.whenBaseEmpty !== 'compare') {
          notCompared[attr.label] = (notCompared[attr.label] ?? 0) + 1;
          skipped.push(attr.label);
          return;
        }
        compared++;
        // Em duplicidades, todas as linhas do CRM são confrontadas.
        for (const r of found) {
          const cv = r.data[c.crmColumn];
          if (!equivalent(kind, bv, cv, equivMaps[i])) {
            div.push({ campo: attr.label, atributo: String(c.baseAttribute), coluna_crm: c.crmColumn, base: bv ?? null, crm: cv ?? null });
            fieldCounts[attr.label] = (fieldCounts[attr.label] ?? 0) + 1;
            break;
          }
        }
      });
      let motivo: string;
      if (div.length) motivo = `${div.length} inconsistência(s)`;
      else if (!profile.comparisons.length) motivo = 'Localizado no CRM (somente existência: nenhum campo mapeado para confronto)';
      else if (!compared) {
        semConfronto++;
        motivo = `Localizado no CRM; nenhum campo confrontado (base sem os dados: ${skipped.join(', ')})`;
      } else motivo = `${compared} campo(s) conferem${skipped.length ? `; não confrontados por ausência na base: ${skipped.join(', ')}` : ''}`;
      items.push({
        contrato: p.key,
        situacao: div.length ? 'DIVERGENTE' : 'CONFORME',
        motivo,
        duplicado: found.length > 1,
        crm_rows: found.map((r) => r.row_number),
        divergencias: div.length ? div : null,
        base: p.snap,
        crm: found[0].data,
      });
    }
    // Linhas do CRM sem correspondência no escopo da base
    let foraEscopo = 0;
    let semBase = 0;
    for (const [k, list] of crmBy) {
      if (baseKeys.has(k)) continue;
      const p = allBy.get(k);
      if (p) foraEscopo++;
      else semBase++;
      items.push({
        contrato: p?.key ?? list[0].data[profile.keyColumn],
        situacao: 'NAO_CONSTA_NA_BASE',
        motivo: p ? p.outOfScope : 'Registro do CRM não localizado em nenhum arquivo importado da base original',
        duplicado: list.length > 1,
        crm_rows: list.map((r) => r.row_number),
        base: p ? p.snap : null,
        crm: list[0].data,
      });
    }
    const duplicated = [...crmBy.values()].filter((l) => l.length > 1).length;
    void duplicated;

    const count = (s: string) => items.filter((i) => i.situacao === s).length;
    // Comissão: referência de remuneração — contas com comissão e sua situação no CRM.
    // Totais em centavos (inteiros) para não acumular erro de ponto flutuante.
    const cents = { valor: 0, nao_importado: 0, distinto: 0 };
    const comissao = { contas: 0, linhas: 0, valor_recebido: 0, linhas_distintas: 0, valor_linhas_distintas: 0, nao_importadas: 0, valor_nao_importado: 0, divergentes: 0 };
    for (const it of items) {
      const b = it.base as Record<string, number> | null;
      if (!b || !b.comissao_linhas) continue;
      comissao.contas++;
      comissao.linhas += b.comissao_linhas;
      comissao.linhas_distintas += b.comissao_linhas_distintas ?? 0;
      cents.valor += Math.round(b.comissao_valor_recebido * 100);
      cents.distinto += Math.round((b.comissao_valor_linhas_distintas ?? 0) * 100);
      if (it.situacao === 'NAO_IMPORTADO') {
        comissao.nao_importadas++;
        cents.nao_importado += Math.round(b.comissao_valor_recebido * 100);
      }
      if (it.situacao === 'DIVERGENTE') comissao.divergentes++;
    }
    comissao.valor_recebido = cents.valor / 100;
    comissao.valor_linhas_distintas = cents.distinto / 100;
    comissao.valor_nao_importado = cents.nao_importado / 100;
    const flagCounts: Record<string, number> = {};
    if (pillar === 'CONTRATO') for (const p of portfolio.filter(portScope)) for (const f of p.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;

    const summary = {
      escopo: SCOPES[scope],
      pilar: pillar,
      pilar_descricao: PILLARS[pillar],
      base_contas: inScope.length,
      base_sem_chave: semChaveNaBase,
      conforme_sem_campos_confrontados: semConfronto,
      crm_linhas: crmRows.rows.length,
      crm_contas: crmBy.size,
      crm_linhas_sem_chave: blankKeys,
      conforme: count('CONFORME'),
      nao_importado: count('NAO_IMPORTADO'),
      divergente: count('DIVERGENTE'),
      nao_consta_na_base: count('NAO_CONSTA_NA_BASE'),
      nao_consta_fora_do_escopo: foraEscopo,
      nao_consta_sem_base: semBase,
      duplicados_no_crm: [...crmBy.values()].filter((l) => l.length > 1).length,
      divergencias_por_campo: fieldCounts,
      nao_comparados_por_campo: notCompared,
      duplicados_itens: items.filter((i) => i.duplicado).length,
      comissao,
      alertas_regras: Object.fromEntries(Object.entries(flagCounts).map(([k, v]) => [FLAG_LABELS[k as keyof typeof FLAG_LABELS] ?? k, v])),
      duracao_ms: 0,
    };

    await withTransaction(async (db) => {
      for (let i = 0; i < items.length; i += 2000) {
        await db.query(
          `INSERT INTO crm_recon_items (run_id, contrato, situacao, motivo, duplicado, crm_rows, divergencias, base, crm)
           SELECT $1, x.contrato, x.situacao, x.motivo, COALESCE(x.duplicado, false), x.crm_rows, x.divergencias, x.base, x.crm
           FROM jsonb_to_recordset($2::jsonb) AS x(contrato text, situacao text, motivo text, duplicado boolean, crm_rows int[], divergencias jsonb, base jsonb, crm jsonb)`,
          [runId, JSON.stringify(items.slice(i, i + 2000))],
        );
      }
      summary.duracao_ms = Date.now() - t0;
      await db.query(`UPDATE crm_recon_runs SET status='CONCLUIDO', finished_at=now(), summary=$2 WHERE id=$1`, [runId, JSON.stringify(summary)]);
      await audit(actor, 'CRM_CONCILIACAO_EXECUTADA', 'crm_recon_run', runId, { snapshotId, scope, conforme: summary.conforme, nao_importado: summary.nao_importado, divergente: summary.divergente }, db);
    });
    return { runId, ...summary };
  } catch (e) {
    await pool.query(`UPDATE crm_recon_runs SET status='ERRO', finished_at=now(), message=$2 WHERE id=$1`, [runId, (e as Error).message]);
    throw e;
  }
}
