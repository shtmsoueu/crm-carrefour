import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { HeaderTrailerDef, LayoutDef, RecordDef } from '../layouts/types.js';
import { recordDefFor } from '../layouts/definitions.js';
import { normalizeNumericId, parseDateAnyFormat, parseField, type Severity } from './fields.js';

export interface Issue {
  line: number | null;
  recordType: string | null;
  field: string | null;
  value: string | null;
  message: string;
  severity: Severity;
}

export interface ParsedRecord {
  lineNumber: number;
  recordType: string;
  valid: boolean;
  fields: Record<string, string | null>;
  contractKey: string | null;
  cpf: string | null;
  name: string | null;
  ahid: string | null;
  eventDate: string | null;
  amount: string | null;
  hash: string;
  isDuplicate: boolean;
  raw: string;
  errors: string[];
}

export interface SectionResult {
  present: boolean;
  lineNumber: number | null;
  fields: Record<string, string | null>;
}

export interface ParseResult {
  layout: LayoutDef['code'];
  headerVariant: string | null;
  header: SectionResult;
  trailer: SectionResult;
  totalLines: number;
  blankLines: number;
  dataLines: number;
  validRecords: number;
  rejectedRecords: number;
  duplicateRecords: number;
  byRecordType: Record<string, number>;
  issues: Issue[];
  /** Contagem total por mensagem (inclui issues não armazenadas por limite). */
  issueCounts: Record<string, { severity: Severity; count: number }>;
  generationDate: string | null;
  sequenceNumber: string | null;
  trailerCount: number | null;
  trailerCountMatches: 'DADOS' | 'TOTAL_LINHAS' | 'NAO_CONFERE' | 'NAO_APLICAVEL';
  /** Arquivo com zero bytes / sem linhas. */
  empty: boolean;
  /** Possui erros de nível de arquivo que impedem a confirmação. */
  fileErrors: number;
}

export interface UnstructuredConfig {
  mode: 'delimited' | 'fixed';
  delimiter?: string;
  contractIndex?: number;
  reasonIndex?: number;
  contractStart?: number;
  contractEnd?: number;
  reasonStart?: number;
  reasonEnd?: number;
}

const MAX_STORED_ISSUES = 2000;

class IssueCollector {
  issues: Issue[] = [];
  counts: Record<string, { severity: Severity; count: number }> = {};
  fileErrorCount = 0;
  add(i: Issue) {
    const key = `${i.severity}|${i.recordType ?? '-'}|${i.field ?? '-'}|${i.message}`;
    const c = (this.counts[key] ??= { severity: i.severity, count: 0 });
    c.count++;
    if (this.issues.length < MAX_STORED_ISSUES) this.issues.push(i);
  }
  fileError(message: string) {
    this.fileErrorCount++;
    this.add({ line: null, recordType: null, field: null, value: null, message, severity: 'ERRO' });
  }
  fileWarning(message: string) {
    this.add({ line: null, recordType: null, field: null, value: null, message, severity: 'ALERTA' });
  }
  fileInfo(message: string) {
    this.add({ line: null, recordType: null, field: null, value: null, message, severity: 'INFO' });
  }
}

function parseSection(line: string, def: RecordDef, lineNumber: number, ic: IssueCollector): SectionResult {
  if (line.length !== def.length) {
    ic.add({
      line: lineNumber,
      recordType: def.code,
      field: null,
      value: String(line.length),
      message: `${def.name}: tamanho ${line.length} difere do layout (${def.length})`,
      severity: 'ALERTA',
    });
  }
  const fields: Record<string, string | null> = {};
  for (const fd of def.fields) {
    if (fd.filler) continue;
    const p = parseField(line, fd);
    fields[fd.name] = p.value;
    if (p.issue) {
      // Datas de header/trailer: diagnosticar formato alternativo.
      if (fd.type === 'D') {
        const alt = parseDateAnyFormat(line.slice(fd.start - 1, fd.end).trim());
        if (alt) {
          fields[fd.name] = alt.iso;
          ic.add({
            line: lineNumber,
            recordType: def.code,
            field: fd.name,
            value: p.issue.value,
            message: `${def.name}: data em formato ${alt.format}, divergente do layout (${fd.dateFormat})`,
            severity: 'ALERTA',
          });
          continue;
        }
      }
      ic.add({ line: lineNumber, recordType: def.code, field: fd.name, value: p.issue.value, message: `${def.name}: ${p.issue.message}`, severity: 'ALERTA' });
    }
  }
  return { present: true, lineNumber, fields };
}

function chooseVariant(layout: LayoutDef, first: string | undefined): HeaderTrailerDef | null {
  const variants = layout.headerTrailer.filter((v) => v.header);
  if (!variants.length || first === undefined) return null;
  const byCodeAndLen = variants.find((v) => v.header!.code === first[0] && v.header!.length === first.length);
  return byCodeAndLen ?? variants.find((v) => v.header!.code === first[0]) ?? null;
}

function roleField(def: RecordDef, role: string): string | undefined {
  return def.fields.find((f) => f.roles?.includes(role as never))?.name;
}

/** Interpreta um registro de dados. */
export function parseDataRecord(line: string, def: RecordDef, lineNumber: number, ic: IssueCollector | null): ParsedRecord {
  const errors: string[] = [];
  const fields: Record<string, string | null> = {};
  if (line.length !== def.length) {
    const msg = `Tamanho da linha ${line.length} difere do layout (${def.length})`;
    errors.push(msg);
    ic?.add({ line: lineNumber, recordType: def.code, field: null, value: String(line.length), message: msg, severity: 'ERRO' });
  }
  for (const fd of def.fields) {
    if (fd.filler) continue;
    const p = parseField(line, fd);
    fields[fd.name] = p.value;
    if (p.issue) {
      if (p.issue.severity === 'ERRO') errors.push(`${fd.name}: ${p.issue.message}`);
      ic?.add({ line: lineNumber, recordType: def.code, field: fd.name, value: p.issue.value, message: p.issue.message, severity: p.issue.severity });
    }
  }
  const get = (role: string) => {
    const n = roleField(def, role);
    return n ? (fields[n] ?? null) : null;
  };
  return {
    lineNumber,
    recordType: def.code,
    valid: errors.length === 0,
    fields,
    contractKey: get('contract'),
    cpf: get('cpf'),
    name: get('name'),
    ahid: normalizeNumericId(get('ahid')),
    eventDate: get('eventDate'),
    amount: get('amount'),
    hash: createHash('sha1').update(line).digest('hex'),
    isDuplicate: false,
    raw: line,
    errors,
  };
}

export type RecordSink = (rec: ParsedRecord) => void | Promise<void>;

/**
 * Interpreta um arquivo de largura fixa conforme o layout.
 * Processa em fluxo (uma linha de antecipação para identificar o trailer),
 * permitindo arquivos de grande volume.
 */
export async function parseLines(lines: AsyncIterable<string> | Iterable<string>, layout: LayoutDef, sink: RecordSink): Promise<ParseResult> {
  const ic = new IssueCollector();
  const res: ParseResult = {
    layout: layout.code,
    headerVariant: null,
    header: { present: false, lineNumber: null, fields: {} },
    trailer: { present: false, lineNumber: null, fields: {} },
    totalLines: 0,
    blankLines: 0,
    dataLines: 0,
    validRecords: 0,
    rejectedRecords: 0,
    duplicateRecords: 0,
    byRecordType: {},
    issues: [],
    issueCounts: {},
    generationDate: null,
    sequenceNumber: null,
    trailerCount: null,
    trailerCountMatches: 'NAO_APLICAVEL',
    empty: false,
    fileErrors: 0,
  };
  const seen = new Set<string>();
  const hasHeaderLayout = layout.headerTrailer.some((v) => v.header);
  let variant: HeaderTrailerDef | null = null;
  let pending: { line: string; n: number } | null = null;
  let n = 0;

  const handleData = async (line: string, lineNo: number) => {
    if (line.trim() === '') {
      res.blankLines++;
      ic.add({
        line: lineNo,
        recordType: null,
        field: null,
        value: null,
        message: layout.ignoreBlankLines ? 'Linha em branco ignorada' : 'Linha em branco fora do padrão (ignorada)',
        severity: 'ALERTA',
      });
      return;
    }
    res.dataLines++;
    const def = recordDefFor(layout, line[0]);
    if (!def) {
      res.rejectedRecords++;
      ic.add({ line: lineNo, recordType: line[0], field: null, value: line.slice(0, 20), message: `Tipo de registro '${line[0]}' não previsto no layout`, severity: 'ERRO' });
      return;
    }
    const rec = parseDataRecord(line, def, lineNo, ic);
    res.byRecordType[def.code] = (res.byRecordType[def.code] ?? 0) + 1;
    if (seen.has(rec.hash)) {
      rec.isDuplicate = true;
      res.duplicateRecords++;
    } else seen.add(rec.hash);
    if (rec.valid) res.validRecords++;
    else res.rejectedRecords++;
    await sink(rec);
  };

  for await (const rawLine of lines as AsyncIterable<string>) {
    const line = rawLine.replace(/\r$/, '');
    n++;
    if (n === 1 && hasHeaderLayout) {
      variant = chooseVariant(layout, line);
      if (variant) {
        res.headerVariant = variant.id;
        res.header = parseSection(line, variant.header!, n, ic);
        if (variant !== layout.headerTrailer[0]) {
          ic.fileWarning(`Header no formato "${variant.description}", diferente do formato principal do layout ("${layout.headerTrailer[0].description}").`);
        }
        continue;
      }
      ic.fileError(`Header não identificado: a primeira linha deveria iniciar com '${layout.headerTrailer[0].header!.code}'.`);
    }
    if (pending) await handleData(pending.line, pending.n);
    pending = { line, n };
  }
  res.totalLines = n;

  if (n === 0) {
    res.empty = true;
    ic.fileError('Arquivo vazio (0 linhas). Não há registros para processar.');
  }

  if (pending) {
    const trailerDef = variant?.trailer;
    if (trailerDef && pending.line[0] === trailerDef.code) {
      res.trailer = parseSection(pending.line, trailerDef, pending.n, ic);
    } else {
      if (trailerDef) ic.fileError(`Trailer não identificado: a última linha deveria iniciar com '${trailerDef.code}'.`);
      await handleData(pending.line, pending.n);
    }
  }

  // Validações de controle
  if (variant) {
    if (variant.headerDateField) res.generationDate = res.header.fields[variant.headerDateField] ?? null;
    if (variant.headerSequenceField) res.sequenceNumber = res.header.fields[variant.headerSequenceField] ?? null;
    if (variant.trailerCountField && res.trailer.present) {
      const v = res.trailer.fields[variant.trailerCountField];
      res.trailerCount = v === null || v === undefined ? null : Number(v);
      if (res.trailerCount === null) {
        ic.fileWarning('Quantidade de registros do trailer não informada.');
        res.trailerCountMatches = 'NAO_CONFERE';
      } else if (res.trailerCount === res.dataLines) {
        res.trailerCountMatches = 'DADOS';
        ic.fileInfo(`Quantidade do trailer (${res.trailerCount}) confere com os registros de dados.`);
      } else if (res.trailerCount === res.totalLines) {
        res.trailerCountMatches = 'TOTAL_LINHAS';
        ic.fileWarning(`Quantidade do trailer (${res.trailerCount}) confere com o total de linhas, incluindo header e trailer (${res.dataLines} registros de dados).`);
      } else {
        res.trailerCountMatches = 'NAO_CONFERE';
        ic.fileWarning(`Quantidade do trailer (${res.trailerCount}) não confere com os registros de dados (${res.dataLines}) nem com o total de linhas (${res.totalLines}).`);
      }
    }
    const fixedName = res.header.fields['ARQUIVO'];
    if (fixedName !== undefined) ic.fileInfo(`Tipo de arquivo informado no header: "${fixedName ?? ''}".`);
  }

  if (!res.empty && res.dataLines === 0) {
    ic.fileWarning('Arquivo sem registros de dados (somente header/trailer). Nenhum dado a processar.');
  }
  if (res.duplicateRecords > 0) {
    ic.fileWarning(`${res.duplicateRecords} linha(s) idêntica(s) a outra linha do mesmo arquivo (duplicidade).`);
  }

  res.issues = ic.issues;
  res.issueCounts = ic.counts;
  res.fileErrors = ic.fileErrorCount;
  return res;
}

/** Arquivos sem layout (rejeição de campanha): armazenamento integral e extração configurável. */
export async function parseUnstructured(
  lines: AsyncIterable<string> | Iterable<string>,
  layout: LayoutDef,
  config: UnstructuredConfig | null,
  sink: RecordSink,
): Promise<ParseResult> {
  const ic = new IssueCollector();
  const res: ParseResult = {
    layout: layout.code,
    headerVariant: null,
    header: { present: false, lineNumber: null, fields: {} },
    trailer: { present: false, lineNumber: null, fields: {} },
    totalLines: 0,
    blankLines: 0,
    dataLines: 0,
    validRecords: 0,
    rejectedRecords: 0,
    duplicateRecords: 0,
    byRecordType: {},
    issues: [],
    issueCounts: {},
    generationDate: null,
    sequenceNumber: null,
    trailerCount: null,
    trailerCountMatches: 'NAO_APLICAVEL',
    empty: false,
    fileErrors: 0,
  };
  const seen = new Set<string>();
  for await (const rawLine of lines as AsyncIterable<string>) {
    const line = rawLine.replace(/\r$/, '');
    res.totalLines++;
    if (line.trim() === '') {
      res.blankLines++;
      continue;
    }
    res.dataLines++;
    let contract: string | null = null;
    let reason: string | null = null;
    if (config?.mode === 'delimited' && config.delimiter) {
      const parts = line.split(config.delimiter);
      contract = parts[config.contractIndex ?? 0]?.trim() || null;
      reason = config.reasonIndex !== undefined ? parts[config.reasonIndex]?.trim() || null : null;
    } else if (config?.mode === 'fixed' && config.contractStart && config.contractEnd) {
      contract = line.slice(config.contractStart - 1, config.contractEnd).trim() || null;
      if (config.reasonStart && config.reasonEnd) reason = line.slice(config.reasonStart - 1, config.reasonEnd).trim() || null;
    }
    const hash = createHash('sha1').update(line).digest('hex');
    const dup = seen.has(hash);
    seen.add(hash);
    if (dup) res.duplicateRecords++;
    res.validRecords++;
    res.byRecordType['R'] = (res.byRecordType['R'] ?? 0) + 1;
    await sink({
      lineNumber: res.totalLines,
      recordType: 'R',
      valid: true,
      fields: { LINHA: line, CONTRATO: contract, MOTIVO: reason },
      contractKey: contract,
      cpf: null,
      name: null,
      ahid: null,
      eventDate: null,
      amount: null,
      hash,
      isDuplicate: dup,
      raw: line,
      errors: [],
    });
  }
  if (res.totalLines === 0) {
    res.empty = true;
    ic.fileError('Arquivo vazio (0 bytes). A condição é registrada e NÃO é considerada processamento concluído.');
  } else if (!config) {
    ic.fileWarning('Arquivo sem layout oficial: linhas armazenadas integralmente. Configure a extração de contrato/motivo para habilitar o batimento.');
  }
  res.issues = ic.issues;
  res.issueCounts = ic.counts;
  res.fileErrors = ic.fileErrorCount;
  return res;
}

/** Leitura em fluxo de um arquivo armazenado, na codificação do layout. */
export function fileLines(path: string, encoding: BufferEncoding = 'latin1'): AsyncIterable<string> {
  return createInterface({ input: createReadStream(path, { encoding }), crlfDelay: Infinity });
}
