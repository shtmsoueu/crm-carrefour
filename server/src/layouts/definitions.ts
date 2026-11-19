/**
 * DICIONÁRIO TÉCNICO DOS LAYOUTS — CARTEIRA CARREFOUR (Cyber -> Assessorias)
 *
 * Fonte: DE_PARA_LAYOUTS_ASSESSORIAS.xlsx + Layouts_Pos_validacao.zip.
 * Cada campo reproduz INI/FIM/TAM/DECIMAIS/TIPO/DESCRIÇÃO da planilha oficial.
 * Correções só são aplicadas quando a planilha é internamente contraditória, e
 * ficam registradas em `notes` (exibidas na tela "Dicionário de Layouts").
 */
import type { DateFormat, FieldDef, FieldType, HeaderTrailerDef, LayoutDef, RecordDef } from './types.js';

type Opts = Partial<Omit<FieldDef, 'name' | 'label' | 'start' | 'end' | 'type'>>;

function f(name: string, start: number, end: number, type: FieldType, label: string, opts: Opts = {}): FieldDef {
  return { name, label, start, end, type, ...opts };
}
const d = (name: string, start: number, end: number, fmt: DateFormat, label: string, opts: Opts = {}) =>
  f(name, start, end, 'D', label, { dateFormat: fmt, ...opts });
const filler = (start: number, end: number, label = 'Brancos') =>
  f('FILLER', start, end, 'A', label, { filler: true });

// ---------------------------------------------------------------------------
// Templates de Header/Trailer
// ---------------------------------------------------------------------------

/** "Template Header-Trailler Arquivos Cyber-Assessorias" (registro H/T, 100 posições). */
function cyberHT(headerDateFmt: DateFormat, trailerDateFmt: DateFormat, id = 'CYBER_HT'): HeaderTrailerDef {
  return {
    id,
    description: 'Template Header-Trailler Arquivos Cyber-Assessorias (H/T, 100 posições)',
    headerDateField: 'DATA_GERACAO',
    headerSequenceField: 'SEQUENCIA_ARQUIVO',
    trailerCountField: 'QTD_REGISTROS',
    header: {
      code: 'H',
      name: 'Header',
      length: 100,
      fields: [
        f('TIPO', 1, 1, 'A', 'Identificação do registro "H" - Header', { fixed: 'H' }),
        f('EMPRESA', 2, 9, 'A', "Fixo 'CYBER'"),
        f('ARQUIVO', 10, 39, 'A', 'Tipo de arquivo conforme definição em cada lay-out'),
        f('TIPO_ENVIO', 40, 40, 'A', 'Tipo de envio D - DIARIO S - SEMANAL E - ESPECIAL'),
        d('DATA_GERACAO', 41, 48, headerDateFmt, `Data de Geração do arquivo (${headerDateFmt})`),
        f('SEQUENCIA_ARQUIVO', 49, 58, 'N', 'Sequência do arquivo (iniciada em 0000000000, +1 a cada disponibilização)'),
        filler(59, 100),
      ],
    },
    trailer: {
      code: 'T',
      name: 'Trailer',
      length: 100,
      fields: [
        f('TIPO', 1, 1, 'A', 'Identificação do registro "T" - Trailer', { fixed: 'T' }),
        d('DATA_GERACAO', 2, 9, trailerDateFmt, `Data de Geração do arquivo (${trailerDateFmt})`),
        f('QTD_REGISTROS', 10, 17, 'N', 'Quantidade de registros arquivo'),
        f('SEQUENCIA_ARQUIVO', 18, 27, 'N', 'Sequência do arquivo'),
        filler(28, 100),
      ],
    },
  };
}

/** Header/Trailer "0"/"9" dos arquivos de acordo (ACORDO_ASSESSORIA, BAT_ACORDO, BAT_ACORDO_PGTO). */
function acordoHT(dateFmt: DateFormat, length: number): HeaderTrailerDef {
  const seqStart = length - 7;
  return {
    id: 'ACORDO_0_9',
    description: `Header-Trailler "0"/"9" (${length} posições)`,
    headerDateField: 'DATA_GERACAO',
    headerSequenceField: 'SEQUENCIA_ARQUIVO',
    trailerCountField: 'TOTAL_REGISTROS',
    header: {
      code: '0',
      name: 'Header',
      length,
      fields: [
        f('TIPO', 1, 1, 'A', 'Identificação do registro "0" - Header', { fixed: '0' }),
        d('DATA_GERACAO', 2, 9, dateFmt, `Data de Geração do arquivo (${dateFmt})`),
        f('TIPO_FORMULARIO', 10, 11, 'A', 'Tipo de formulário'),
        f('SEQUENCIA_ARQUIVO', 12, 21, 'N', 'Controle de sequência do arquivo'),
        filler(22, seqStart - 1, 'Completar registro com brancos'),
        f('SEQ_REG', seqStart, length, 'N', "Sequência relativa do registro no arquivo '00000001'"),
      ],
    },
    trailer: {
      code: '9',
      name: 'Trailer',
      length,
      fields: [
        f('TIPO', 1, 1, 'A', 'Identificação do registro "9" - Trailer', { fixed: '9' }),
        f('TOTAL_REGISTROS', 2, 16, 'N', 'Total de registros do arquivo (sem header e trailler)'),
        f('TOTAL_CARTAS', 17, 31, 'N', 'Total de cartas de cobrança'),
        filler(32, seqStart - 1, 'Completar registro com espaços'),
        f('SEQ_REG', seqStart, length, 'N', 'Sequência relativa do registro no arquivo'),
      ],
    },
  };
}

/** Header/Trailer "0"/"9" de BOLETO DE PARCELAS e CARTA CAMPANHA. */
function cartaHT(length: number, desc: string): HeaderTrailerDef {
  const seqStart = length - 7;
  return {
    id: 'CARTA_0_9',
    description: desc,
    headerDateField: 'IFXDATE',
    headerSequenceField: 'SEQUENCIA',
    trailerCountField: 'TOTAL_REGISTROS',
    header: {
      code: '0',
      name: 'Header',
      length,
      fields: [
        f('TIPO', 1, 1, 'A', "Fixo '0'", { fixed: '0' }),
        d('IFXDATE', 2, 9, 'AAAAMMDD', 'Data do Processamento', {
          note: 'Formato não informado no layout; AAAAMMDD é o formato das demais datas do mesmo layout.',
        }),
        f('EMPRESA', 10, 11, 'N', 'Empresa'),
        f('SEQUENCIA', 12, 21, 'A', 'Sequência (sequence_cartacamp.nextval)'),
        filler(22, seqStart - 1),
        f('SEQ_REG', seqStart, length, 'A', 'Sequência relativa do registro no arquivo'),
      ],
    },
    trailer: {
      code: '9',
      name: 'Trailer',
      length,
      fields: [
        f('TIPO', 1, 1, 'A', "Fixo '9'", { fixed: '9' }),
        f('TOTAL_REGISTROS', 2, 16, 'N', 'Total de registros do arquivo (sem header a trailler do arquivo)'),
        f('TOTAL_CARTAS', 17, 31, 'N', 'Total de cartas de cobrança'),
        filler(32, seqStart - 1, 'Completar registro com espaços'),
        f('SEQ_REG', seqStart, length, 'A', 'Sequência relativa do registro no arquivo'),
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Blocos de campos reutilizados (layouts que compartilham a mesma estrutura)
// ---------------------------------------------------------------------------

const DMACCTG = f('DMACCTG', 1, 1, 'A', "Fixo '1' — Grupo 1 – Produtos cartão CSF", { required: true, fixed: '1' });
const DMACCT_25 = f('DMACCT', 2, 26, 'A', 'Nº Conta-Nº Contrato / Nº Contrato (Chave)', {
  required: true,
  roles: ['contract'],
});
const DMSSNUM_25 = f('DMSSNUM', 27, 51, 'A', 'Nº CPF/CNPJ', { roles: ['cpf'] });

/** Registro de contrato (970 posições) — LayoutRemContratoV3 / Layout_Bat_ContratoV3. */
function contratoFields(bat: boolean): FieldDef[] {
  return [
    DMACCTG,
    DMACCT_25,
    { ...DMSSNUM_25, required: bat },
    f('U1TPPES', 52, 52, 'A', 'Tipo Pessoa'),
    f('DMNAME', 53, 102, 'A', 'Nome do Cliente', { roles: ['name'] }),
    d('U1DTNASCCLTE', 103, 110, 'MMDDAAAA', 'Data de Nascimento do Cliente (MMDDAAAA)'),
    f('U1NUMRG', 111, 121, 'A', 'Número do RG'),
    f(bat ? 'U1DLGRG' : 'U1DIGRG', 122, 123, 'A', 'Dígito do RG'),
    f('U1ESTRG', 124, 125, 'A', 'Estado do RG'),
    f('U1ORGEMISRG', 126, 130, 'A', 'Órgão emissor RG'),
    bat
      ? filler(131, 138, 'BRANCOS')
      : d('U1DTEMISRG', 131, 138, 'MMDDAAAA', 'Data Emissão RG (MMDDAAAA)'),
    f('U1SEXO', 139, 139, 'A', "Sexo 'M' - Masculino 'F' - Feminino"),
    f('U1ESTCIVIL', 140, 140, 'A', 'Estado Civil (S, C, D, E, V, O)'),
    f('DMADDR1', 141, 200, 'A', 'Endereço do Cliente'),
    f('U1NUMENDCLTE', 201, 205, 'A', 'Número do endereço'),
    f('DMADDR2', 206, 250, 'A', 'Complemento do Endereço'),
    f('DMADDR3', 251, 280, 'A', 'Bairro do Cliente'),
    f('DMCITY', 281, 320, 'A', bat ? 'Cidade' : 'Código do Município'),
    f('DMSTATE', 321, 322, 'A', 'Estado do Cliente'),
    f('DMZIP', 323, 331, 'A', 'CEP do Cliente'),
    f('DMACODE', 332, 333, 'A', 'DDD Telefone Residência 1'),
    f('DMPHONE', 334, 345, 'A', 'Telefone Residência 1'),
    f('DMCACODE', 346, 347, 'A', 'DDD Telefone Celular 1'),
    f('DMCPHONE', 348, 359, 'A', 'Telefone Celular 1'),
    f(bat ? 'U1DDDREF' : 'U1DDDREF1', 360, 361, 'A', 'DDD Telefone Referência 1'),
    f(bat ? 'U1FONEREF' : 'U1FONEREF1', 362, 373, 'A', 'Telefone Referência 1'),
    f(bat ? 'U1NMREF' : 'U1NMREF1', 374, 423, 'A', 'Nome Referência 1'),
    f('DMEMAIL', 424, 483, 'A', 'Email Principal de Contato'),
    f('DMBNAME', 484, 523, 'A', 'Empresa que trabalha'),
    f('U1CNPJEMP', 524, 538, 'A', 'CNPJ Empresa que trabalha'),
    f('U1CARGO', 539, 544, bat ? 'A' : 'A', 'Código Cargo', {
      note: bat ? undefined : 'Layout indica tipo N; tratado como texto para preservar o conteúdo recebido (brancos).',
    }),
    f('DMBADDR1', 545, 604, 'A', 'Endereço da Empresa'),
    f('DMBADDR2', 605, 649, 'A', 'Complemento do Endereço Empresa'),
    f('DMBADDR3', 650, 679, 'A', 'Bairro da Empresa'),
    f('DMBCITY', 680, 719, 'A', 'Município da Empresa'),
    f('DMBSTATE', 720, 721, 'A', 'Estado da Empresa'),
    f('DMBZIP', 722, 730, 'A', 'CEP da Empresa'),
    f('DMBACODE', 731, 732, 'A', 'DDD Telefone Comercial 1'),
    f('DMBPHONE', 733, 744, 'A', 'Telefone Comercial 1'),
    f('DMBPEXT', 745, 748, 'A', 'Ramal Comercial 1'),
    f('U1ACCTORIG', 749, 773, 'A', 'Nº Conta original'),
    bat
      ? f('U1DTINICONTR', 774, 781, 'A', 'Data início do contrato')
      : d('U1DTCADCLTE', 774, 781, 'MMDDAAAA', 'Data Adesão Conta (MMDDAAAA)'),
    f('DMSTATUS', 782, 782, 'A', 'Status Conta'),
    f('U1BBLOQUEIO', 783, 802, 'A', 'Código de bloqueio da TSYS'),
    f('U1PRODUTO', 803, 822, 'A', 'Código Produto', {
      note: bat ? undefined : 'Layout indica tipo N, porém o conteúdo é alfanumérico (ex.: "MC GOLD"); armazenado como texto.',
    }),
    f('U1BPRODUCT', 823, 842, 'A', 'Produto TSYS'),
    f('U1DAYSGER02', 843, 847, 'N', 'Dias de Atraso - Envio'),
    d('DMDLQDT', 848, 855, 'MMDDAAAA', bat ? 'Data início do atraso (MMDDAAAA)' : 'Data Vencimento Contrato (MMDDAAAA)'),
    f('DMCURBAL', 856, 870, 'N', 'Saldo Devedor (Contábil) Contrato', { decimals: 2, roles: ['amount'] }),
    f('DMAMTDLQ', 871, 885, 'N', 'Valor Principal Dívida Contrato', { decimals: 2 }),
    f('DMQUE', 886, 889, 'A', 'Fila Segmentada'),
    d('U1DTRETOR', 890, 897, 'MMDDAAAA', bat ? 'Data retorno (MMDDAAAA)' : 'Data Final de Permanência (MMDDAAAA)'),
    f('U1CDCREDOR', 898, 905, 'A', bat ? 'Código credor' : 'Descrição credor'),
    f('PKBUYID', 906, 913, 'A', bat ? 'Identificador pacote' : 'ID Comprador (Cessionário) da carteira'),
    f('U1SCORE14', 914, 935, 'N', 'Informação Score14'),
    f('U1SCORE15', 936, 957, 'N', 'Informação Score15'),
    d('U1DTPRIMACORDO', 958, 965, 'MMDDAAAA', 'Data do Primeiro Acordo (MMDDAAAA) (01011900 = primeiro acordo)'),
    f('U1DTAGDAYS', 966, 970, 'N', 'Quantidade de dias de atraso do último acordo'),
  ];
}

/** Registro de acordo (244 posições) — Layout_Acordo_AssessoriaV4 / Bat_Acordo_Assessoria / Bat_Acordo_Pagto. */
function acordoFields(kind: 'ACORDO' | 'BAT_ACORDO' | 'BAT_PGTO'): FieldDef[] {
  return [
    DMACCTG,
    DMACCT_25,
    { ...DMSSNUM_25, required: true },
    f('DMAMTDLQ', 52, 66, 'N', 'Valor da dívida', { decimals: 2 }),
    f('U1ATUJUR', 67, 81, 'N', 'Valor do juros', { decimals: 2 }),
    d('AHDT', 82, 89, 'AAAAMMDD', 'Data do Acordo', {
      roles: ['eventDate'],
      note: 'Formato não informado na coluna DESCRIÇÃO; AAAAMMDD conforme amostra do próprio layout (20260316).',
    }),
    d('APDUEDT_PROX', 90, 97, 'AAAAMMDD', 'Data do próximo Pagamento (APDUEDT)'),
    f('AHTOTPMT', 98, 110, 'N', 'Valor Acordo', { decimals: 2, roles: ['amount'] }),
    f('VALOR_ENTRADA', 111, 123, 'N', 'Valor Entrada', { decimals: 2 }),
    d('APDUEDT', 124, 131, 'AAAAMMDD', 'Data vencimento das parcelas'),
    f('AHPRD', 132, 136, 'N', 'Qtde de Parcelas'),
    f('AHTYPE', 137, 144, 'A', 'Tipo Acordo'),
    f('U1IOF', 145, 159, 'N', 'Valor total de imposto', { decimals: 2 }),
    f('AHVDESC', 160, 174, 'N', 'Valor do desconto', { decimals: 2 }),
    f('AHPDESCP', 175, 181, 'N', 'Porcentagem do desconto', { decimals: 4 }),
    kind === 'BAT_PGTO'
      ? d('APINDATE', 182, 189, 'AAAAMMDD', 'Data do pagamento da parcela')
      : d('DMPAYDT', 182, 189, 'AAAAMMDD', 'Dt. Último Pagamento'),
    f('AHCOLLID', 190, 197, 'A', 'Usuário (Canal)'),
    f('APAMT', 198, 210, 'N', 'Valor Parcelas', { decimals: 2 }),
    f('APTAXAMT', 211, 223, 'N', 'Valor do IOF por parcela', { decimals: 2 }),
    f('AHID', 224, 236, 'N', 'ID do acordo', { required: true, roles: ['ahid'] }),
    f('SEQ_REG', 237, 244, 'N', 'Sequência relativa do registro no arquivo', {
      note: 'Layout indica DECIMAIS=2 para a sequência; desconsiderado por se tratar de contador inteiro.',
    }),
  ];
}

// ---------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------

const acct = '([A-Za-z0-9]+)';

export const LAYOUTS: LayoutDef[] = [
  {
    code: 'REM_CONTRATOS',
    title: 'Remessa de Contratos',
    sourceLayout: 'LayoutRemContratoV3.xlsx',
    namingPattern: 'REM_CONTRATOS_XXXXX_AAAAMMDD_HHMMSS.txt',
    purpose: 'Arquivo com os contratos distribuídos à assessoria',
    filenameRegex: new RegExp(`^REM_CONTRATOS_${acct}_(\\d{8})_(\\d{6})\\.txt$`, 'i'),
    filenameGroups: { agency: 1, date: 2, time: 3, dateFormat: 'AAAAMMDD' },
    encoding: 'latin1',
    layoutAvailable: true,
    headerTrailer: [cyberHT('DDMMAAAA', 'DDMMAAAA')],
    records: [{ code: '1', name: 'Contrato', length: 970, fields: contratoFields(false) }],
    notes: [
      { kind: 'INFORMACAO', text: 'Tipo Arquivo: REMESSA_CONTRATOS_ASSESSORIA. Gerado na inclusão/atualização e/ou distribuição/redistribuição de contratos.' },
      { kind: 'INFORMACAO', text: 'A planilha não marca campos obrigatórios; DMACCT é tratado como obrigatório por ser identificado como "(Chave)".' },
      { kind: 'DIVERGENCIA_ARQUIVO_REAL', text: 'Carga de teste: header informa "REMESSA_CONTRATOS_ASSESSORIAS" (com S). Divergência de nome no header é registrada como alerta.' },
      { kind: 'DIVERGENCIA_ARQUIVO_REAL', text: 'Carga de teste: a quantidade do trailer corresponde apenas aos registros de dados (sem header/trailer).' },
    ],
  },
  {
    code: 'BAT_CONTRATOS',
    title: 'Batimento de Contratos',
    sourceLayout: 'Layout_Bat_ContratoV3.xlsx',
    namingPattern: 'BAT_CONTRATOS_XXXXX_AAAAMMDD_HHMMSS.txt',
    purpose: 'Arquivo de batimento com os contratos da assessoria',
    filenameRegex: new RegExp(`^BAT_CONTRATOS_${acct}_(\\d{8})_(\\d{6})\\.txt$`, 'i'),
    filenameGroups: { agency: 1, date: 2, time: 3, dateFormat: 'AAAAMMDD' },
    encoding: 'latin1',
    layoutAvailable: true,
    headerTrailer: [
      {
        id: 'BAT_CONTRATOS_HT',
        description: 'Template Header-Trailler Arquivos Batimento de Contratos (406 posições)',
        headerDateField: 'DATA_GERACAO',
        headerSequenceField: 'SEQUENCIA_ARQUIVO',
        lengthIsWarning: true,
        header: {
          code: 'H',
          name: 'Header',
          length: 406,
          fields: [
            f('TIPO', 1, 1, 'A', 'Identificação do registro "H" - Header', { fixed: 'H' }),
            f('IDENTIFICACAO', 2, 40, 'A', 'CYBER   BATIMENTO_CONTRATOS_ASSESSORIAD'),
            d('DATA_GERACAO', 41, 48, 'MMDDAAAA', 'Data de Geração do arquivo (MMDDAAAA)'),
            f('SEQUENCIA_ARQUIVO', 49, 58, 'A', 'Controle de sequência do arquivo'),
            filler(59, 406, 'Completar registro com brancos'),
          ],
        },
        trailer: {
          code: 'T',
          name: 'Trailer',
          length: 406,
          fields: [
            f('TIPO', 1, 1, 'A', 'Identificação do registro "T" - Trailer', { fixed: 'T' }),
            d('DATA_GERACAO', 2, 9, 'MMDDAAAA', 'Data de Geração do arquivo (MMDDAAAA)'),
            f('FILLER_ZEROS', 10, 17, 'N', '"00000000"'),
            f('SEQUENCIA_ARQUIVO', 18, 27, 'N', 'Controle de sequência do arquivo'),
            filler(28, 406, 'Completar registro com brancos'),
          ],
        },
      },
    ],
    records: [{ code: '1', name: 'Contrato (batimento)', length: 970, fields: contratoFields(true) }],
    notes: [
      { kind: 'INFORMACAO', text: 'O trailer deste layout não possui quantidade de registros (posições 10-17 fixas "00000000"); a contagem não pode ser validada.' },
      { kind: 'LIMITACAO', text: 'Header/trailer definidos com 406 posições enquanto o registro de dados possui 970. Divergência de tamanho do header/trailer é tratada como alerta.' },
      { kind: 'LIMITACAO', text: 'Não há carga de teste deste arquivo; o importador segue estritamente o layout.' },
    ],
  },
  {
    code: 'RET_DISTRIBUICAO',
    title: 'Retirada por Distribuição',
    sourceLayout: 'LayoutRetiradaDistribuiçãoV2.xlsx',
    namingPattern: 'RET_DISTRIBUICAO_XXXXX_AAAAMMDD.txt',
    purpose: 'Arquivo com os contratos que foram redistribuídos',
    filenameRegex: new RegExp(`^RET_DISTRIBUICAO_${acct}_(\\d{8})(?:_(\\d{6}))?\\.txt$`, 'i'),
    filenameGroups: { agency: 1, date: 2, time: 3 },
    encoding: 'latin1',
    layoutAvailable: true,
    headerTrailer: [cyberHT('MMDDAAAA', 'MMDDAAAA')],
    records: [
      {
        code: '1',
        name: 'Retirada por redistribuição',
        length: 59,
        fields: [
          DMACCTG,
          DMACCT_25,
          { ...DMSSNUM_25, required: true },
          d('IXFDATE', 52, 59, 'MMDDAAAA', 'Data da Retirada de Cobrança por redistribuição (MMDDAAAA)', { roles: ['eventDate'] }),
        ],
      },
    ],
    notes: [
      { kind: 'INFORMACAO', text: 'Tipo Arquivo: RETIRADA_ASSESSORIA_DISTRIBUICAO.' },
      { kind: 'DIVERGENCIA_ARQUIVO_REAL', text: 'Nomenclatura: De-Para indica AAAAMMDD e o layout AAAAMMDD_HHMMSS; a carga de teste usa DDMMAAAA (RET_DISTRIBUICAO_LEALCO_17112026.txt). A data do nome é interpretada de forma tolerante, com alerta.' },
      { kind: 'DIVERGENCIA_ARQUIVO_REAL', text: 'Carga de teste: a quantidade do trailer inclui header e trailer.' },
    ],
  },
  {
    code: 'RET_CARTEIRA',
    title: 'Retirada da Carteira',
    sourceLayout: 'LayoutRetiradaCarteiraV2.xlsx',
    namingPattern: 'RET_CARTEIRA_XXXXX_DDMMAAAA.txt',
    purpose: 'Arquivo com os contratos a serem retirados da cobrança',
    filenameRegex: new RegExp(`^RET_CARTEIRA_${acct}_(\\d{8})\\.txt$`, 'i'),
    filenameGroups: { agency: 1, date: 2, dateFormat: 'DDMMAAAA' },
    encoding: 'latin1',
    layoutAvailable: true,
    headerTrailer: [cyberHT('MMDDAAAA', 'MMDDAAAA')],
    records: [
      {
        code: '1',
        name: 'Retirada / Baixa',
        length: 71,
        fields: [
          DMACCTG,
          DMACCT_25,
          { ...DMSSNUM_25, required: true },
          f('U_MOTBXA', 52, 71, 'A', "Motivo da baixa 'Liquidado' 'Atualizado' 'Óbito' 'Alerta' 'Jurídico'", {
            required: true,
            note: 'Planilha indica INI 38 / FIM 57 (sobrepõe DMSSNUM 27-51). Aplicado 52-71 (TAM=20, imediatamente após DMSSNUM), coerente com o tamanho real da linha (71).',
          }),
        ],
      },
    ],
    notes: [
      { kind: 'CORRECAO', text: 'Campo U?MOTBXA: posição corrigida de 38-57 para 52-71 (INI/FIM da planilha conflitam com DMSSNUM; TAM=20 preservado).' },
      { kind: 'INFORMACAO', text: 'Tipo Arquivo: RETIRADA_ASSESSORIA. Lay-out válido para Retiradas (Exclusões) e Baixa.' },
      { kind: 'DIVERGENCIA_ARQUIVO_REAL', text: 'Carga de teste: a quantidade do trailer inclui header e trailer.' },
    ],
  },
  {
    code: 'ACORDO_ASSESSORIA',
    title: 'Acordos da Assessoria',
    sourceLayout: 'Layout_Acordo_AssessoriaV4.xlsx',
    namingPattern: 'ACORDO_ASSESSORIA_XXXXX_AAAAMMDD_HHMMSS.txt',
    purpose: 'Arquivo que envia os acordos feitos pela assessoria',
    filenameRegex: new RegExp(`^ACORDO_ASSESSORIA_${acct}_(\\d{8})_(\\d{6})\\.txt$`, 'i'),
    filenameGroups: { agency: 1, date: 2, time: 3, dateFormat: 'AAAAMMDD' },
    encoding: 'latin1',
    layoutAvailable: true,
    headerTrailer: [acordoHT('AAAAMMDD', 244)],
    records: [{ code: '1', name: 'Acordo / parcela', length: 244, fields: acordoFields('ACORDO') }],
    notes: [
      { kind: 'INFORMACAO', text: 'Cada linha representa uma parcela do acordo (APDUEDT/APAMT variam); os dados do acordo (AHID, AHDT, AHTOTPMT, AHPRD, AHTYPE) se repetem por parcela.' },
      { kind: 'INFORMACAO', text: 'As versões .xls e .xlsx do Layout_Acordo_AssessoriaV4 foram comparadas e são idênticas.' },
    ],
  },
  {
    code: 'BAT_ACORDO',
    title: 'Batimento de Acordos',
    sourceLayout: 'Layout_Bat_Acordo_Assessoria_.xlsx',
    namingPattern: 'BAT_ACORDO_XXXXX_AAAAMMDD_HHMMSS.txt',
    purpose: 'Arquivo de batimento com os acordos',
    filenameRegex: new RegExp(`^BAT_ACORDO_(?!PGTO_)${acct}_(\\d{8})_(\\d{6})\\.txt$`, 'i'),
    filenameGroups: { agency: 1, date: 2, time: 3, dateFormat: 'AAAAMMDD' },
    encoding: 'latin1',
    layoutAvailable: true,
    headerTrailer: [{ ...acordoHT('MMDDAAAA', 406), lengthIsWarning: true }],
    records: [{ code: '1', name: 'Acordo (batimento)', length: 244, fields: acordoFields('BAT_ACORDO') }],
    notes: [
      { kind: 'LIMITACAO', text: 'Header/trailer definidos com 406 posições e registro de dados com 244. Tamanho de header/trailer validado como alerta.' },
      { kind: 'LIMITACAO', text: 'Não há carga de teste deste arquivo; o importador segue estritamente o layout.' },
    ],
  },
  {
    code: 'BAT_ACORDO_PGTO',
    title: 'Batimento de Pagamentos de Acordos',
    sourceLayout: 'Layout_Bat_Acordo_Pagto.xlsx',
    namingPattern: 'BAT_ACORDO_PGTO_XXXXX_AAAAMMDD_HHMMSS.txt',
    purpose: 'Arquivo de batimento com os pagamentos de acordos',
    filenameRegex: new RegExp(`^BAT_ACORDO_PGTO_${acct}_(\\d{8})_(\\d{6})\\.txt$`, 'i'),
    filenameGroups: { agency: 1, date: 2, time: 3, dateFormat: 'AAAAMMDD' },
    encoding: 'latin1',
    layoutAvailable: true,
    headerTrailer: [{ ...acordoHT('MMDDAAAA', 406), lengthIsWarning: true }],
    records: [{ code: '1', name: 'Pagamento de parcela (batimento)', length: 244, fields: acordoFields('BAT_PGTO') }],
    notes: [
      { kind: 'INFORMACAO', text: 'Posição 182-189 contém APINDATE (Data do pagamento da parcela).' },
      { kind: 'LIMITACAO', text: 'Não há carga de teste deste arquivo; o importador segue estritamente o layout.' },
    ],
  },
  {
    code: 'REPASSE',
    title: 'Repasse de Pagamentos',
    sourceLayout: 'Layout Arquivo de Pagtos (REPASSE).xlsx',
    namingPattern: 'REPASSE_XXXXX_DDMMAAAA.txt',
    purpose: 'Arquivo que envia os pagamentos dos acordos',
    filenameRegex: new RegExp(`^REPASSE_${acct}_(\\d{8})\\.txt$`, 'i'),
    filenameGroups: { agency: 1, date: 2, dateFormat: 'DDMMAAAA' },
    encoding: 'latin1',
    layoutAvailable: true,
    headerTrailer: [
      {
        id: 'REPASSE_0_9',
        description: 'Template Header-Trailler REPASSE ("0"/"9", 134 posições) — oficial do layout',
        headerDateField: 'DATA_GERACAO',
        trailerCountField: 'TOTAL_REGISTROS',
        header: {
          code: '0',
          name: 'Header',
          length: 134,
          fields: [
            f('TIPO', 1, 1, 'A', 'Identificação do registro "0" - Header', { fixed: '0' }),
            d('DATA_GERACAO', 2, 9, 'MMDDAAAA', 'Data de Geração do arquivo (MMDDAAAA)'),
            f('NOME_ARQUIVO', 10, 29, 'A', 'Fixo "PAGAMENTOS PORTAIS"'),
            filler(30, 134, 'Espaços'),
          ],
        },
        trailer: {
          code: '9',
          name: 'Trailer',
          length: 134,
          fields: [
            f('TIPO', 1, 1, 'A', 'Identificação do registro "9" - Trailer', { fixed: '9' }),
            f('TOTAL_REGISTROS', 2, 16, 'N', 'Total de registros do arquivo (sem header a trailler do arquivo)'),
            filler(17, 134, 'Espaços'),
          ],
        },
      },
      { ...cyberHT('MMDDAAAA', 'MMDDAAAA', 'CYBER_HT'), description: 'Template Header-Trailler Cyber-Assessorias (H/T) — observado na carga real' },
    ],
    records: [
      {
        code: '1',
        name: 'Pagamento',
        length: 134,
        fields: [
          f('PMACCTG', 1, 1, 'A', "Fixo '1' — Grupo 1 – Produtos cartão CSF", { required: true, fixed: '1' }),
          f('PMACCT', 2, 26, 'A', 'Nº Conta-Nº Contrato / Nº Contrato (Chave)', { required: true, roles: ['contract'] }),
          d('PMTDATE_TRANSACAO', 27, 34, 'MMDDAAAA', 'Data da transação (PMTDATE)', {
            required: true,
            note: 'Formato não informado para esta posição; MMDDAAAA conforme demais datas do layout.',
          }),
          f('DMSSNUM', 35, 59, 'A', 'Identificador Único Cliente Nº CPF/CNPJ', { required: true, roles: ['cpf'] }),
          f('PMTCODE', 60, 65, 'A', 'Código da transação', { required: true }),
          d('PMTDATE', 66, 73, 'MMDDAAAA', 'Data do Pagamento no Banco (MMDDAAAA)', { required: true, roles: ['eventDate'] }),
          d('PMEDATE', 74, 81, 'MMDDAAAA', 'Data de Entrada do Pagamento no Cyber (MMDDAAAA)', { required: true }),
          f('PMAMT', 82, 96, 'N', 'Valor do Pagamento', { decimals: 2, required: true, roles: ['amount'] }),
          f('PMBATCH', 97, 98, 'A', 'Número da parcela paga', { required: true }),
          f('AHID', 99, 111, 'N', 'ID do acordo', {
            roles: ['ahid'],
            note: 'Layout indica tipo A; tratado como numérico (mesmo identificador AHID dos demais layouts, tipo N).',
          }),
          f('AHCOLLID', 112, 119, 'A', 'Gestor que capturou o acordo', {
            note: 'Marcado como obrigatório no layout; tratado como informação complementar (origem do acordo) por definição de negócio: ausência não rejeita o pagamento.',
          }),
          f('DMAMTDLQ', 120, 134, 'N', 'Valor Risco Salvo (Saldo Principal) com 2 decimais', {
            decimals: 2,
            required: true,
            note: 'Layout indica tipo A; a descrição informa "com 2 decimais", portanto interpretado como numérico com 2 decimais.',
          }),
        ],
      },
    ],
    notes: [
      { kind: 'INFORMACAO', text: 'Tipo Arquivo: PAGAMENTO_ASSESSORIA. Repasse de Pagamento para Assessorias.' },
      { kind: 'DIVERGENCIA_ARQUIVO_REAL', text: 'Carga de teste usa header/trailer padrão Cyber (H/T, 100 posições, "REPASSE PAGAMENTO") e não o "0"/"9" do layout. As duas variantes são aceitas; a utilizada é registrada como alerta.' },
      { kind: 'DIVERGENCIA_ARQUIVO_REAL', text: 'Carga de teste: a quantidade do trailer inclui header e trailer.' },
      { kind: 'INFORMACAO', text: 'Um mesmo acordo pode ter vários pagamentos no mesmo dia, distinguidos pelo PMBATCH (número da parcela).' },
    ],
  },
  {
    code: 'REM_BOLETOS',
    title: 'Remessa de Boletos',
    sourceLayout: 'Layout Remessa BoletoV2.xlsx',
    namingPattern: 'REM_BOLETOS_XXXXX_AAAAMMDD_HHMMSS.txt',
    purpose: 'Boletos de parcelas',
    filenameRegex: new RegExp(`^REM_BOLETOS_${acct}_(\\d{8})_(\\d{6})\\.txt$`, 'i'),
    filenameGroups: { agency: 1, date: 2, time: 3, dateFormat: 'AAAAMMDD' },
    encoding: 'latin1',
    layoutAvailable: true,
    headerTrailer: [cartaHT(406, 'Template Header-Trailler Arquivos BOLETO DE PARCELAS ("0"/"9", 406 posições)')],
    records: [
      {
        code: '1',
        name: 'Endereço de correspondência',
        length: 406,
        fields: [
          DMACCTG,
          f('DMACCT', 2, 17, 'A', 'Nº Conta-Nº Contrato / Nº Contrato (Chave)', { required: true, roles: ['contract'] }),
          f('DMZIP', 18, 25, 'N', 'CEP do endereço de correspondência', { required: true }),
          f('DMNAME', 26, 75, 'A', 'Nome do titular', { required: true, roles: ['name'] }),
          f('DMADDR1', 76, 125, 'A', 'Rua do endereço de correspondência', { required: true }),
          f('U1NUMENDCLTE', 126, 130, 'A', 'Número do endereço de correspondência'),
          f('DMADDR2', 131, 180, 'A', 'Complemento do endereço de correspondência'),
          f('DMADDR3', 181, 205, 'A', 'Bairro do endereço de correspondência'),
          f('DMCITY', 206, 230, 'A', 'Cidade do endereço de correspondência'),
          f('DMSTATE', 231, 232, 'A', 'Estado do endereço de correspondência'),
          filler(233, 388, 'Completar registro com espaços'),
          f('ID_CORRESPONDENCIA', 389, 398, 'N', 'Identificador da correspondência (zeros à esquerda)'),
          f('SEQ_REG', 399, 406, 'N', 'Sequência relativa do registro no arquivo'),
        ],
      },
      {
        code: '2',
        name: 'Parcela',
        length: 406,
        fields: [
          f('TIPO', 1, 1, 'A', "Fixo '2'", { fixed: '2' }),
          f('DMACCT', 2, 17, 'A', 'Nº Conta-Nº Contrato / Nº Contrato (Chave)', { required: true, roles: ['contract'] }),
          f('BLNUMPARC', 18, 19, 'N', 'Número da Parcela', { required: true }),
          d('BLDTVENC', 20, 27, 'AAAAMMDD', 'Vencimento da Parcela (AAAAMMDD)', { required: true, roles: ['eventDate'] }),
          f('BLVLBOLETO', 28, 38, 'N', 'Valor da Parcela', { decimals: 2, required: true, roles: ['amount'] }),
          f('SITUACAO_PARCELA', 39, 58, 'A', 'Situação da Parcela (get_status_parcela)'),
          f('QTD_PARCELAS', 59, 61, 'N', 'Quantidade de Parcelas (ahprd+1)', { required: true }),
          f('DMSSNUM', 62, 91, 'A', 'Identificador do cliente (des_regis)', { required: true, roles: ['cpf'] }),
          f('BLNUMACORDO', 92, 99, 'N', 'Identificador do acordo (cod_parce)', {
            required: true,
            roles: ['ahid'],
            note: 'Layout indica tipo A; o conteúdo é o AHID (8 posições) e é comparado numericamente com o AHID de 13 posições dos demais layouts.',
          }),
          filler(100, 398, 'Completar registro com espaços'),
          f('SEQ_REG', 399, 406, 'N', 'Sequência relativa do registro no arquivo'),
        ],
      },
      {
        code: '3',
        name: 'Ficha de compensação',
        length: 406,
        fields: [
          f('TIPO', 1, 1, 'A', "Fixo '3'", { fixed: '3' }),
          f('DMACCT', 2, 17, 'A', 'Número do cartão do cliente', { required: true, roles: ['contract'] }),
          f('BLLOCAL1', 18, 107, 'A', 'Local de pagamento da ficha de compensação', { required: true }),
          d('BLDTVENC', 108, 115, 'AAAAMMDD', 'Vencimento da ficha de compensação', { required: true }),
          f('BLCEDENTE', 116, 161, 'A', 'Cedente da ficha de compensação', {
            required: true,
            note: 'Layout indica tipo D (data); conteúdo é texto (nome do cedente). Armazenado como texto.',
          }),
          f('BLAGENCIA', 162, 167, 'A', 'Agência/Código cedente na ficha de compensação', { required: true }),
          f('BLDVAGENCIA', 168, 169, 'A', 'Dígito da agência'),
          f('BLCONTACOR', 170, 177, 'A', 'Conta', { required: true }),
          f('BLDTCONTACOR', 178, 180, 'A', 'Dígito da Conta', { required: true }),
          d('IFXDATE', 181, 188, 'AAAAMMDD', 'Data de processamento / Documento na ficha de compensação', { required: true }),
          f('BLNUMDOC', 189, 206, 'A', 'Número do documento na ficha', { required: true }),
          f('BLCARTEIRA_REC', 207, 208, 'A', 'Nosso número no recibo do cliente (carteira)', { required: true }),
          f('BARRA', 209, 209, 'A', "Fixo '/'", { required: true }),
          f('NOSSO_NUMERO', 210, 220, 'A', 'Nosso número na ficha de compensação', { required: true }),
          f('HIFEN', 221, 221, 'A', "Fixo '-'", { required: true }),
          f('NOSSO_NUMERO_DV', 222, 224, 'A', 'Dígito do nosso número', { required: true }),
          d('BLDTVENC_FATURA', 225, 232, 'AAAAMMDD', 'Data de vencimento da fatura em atraso', { required: true }),
          f('BLVLBOLETO', 233, 243, 'N', 'Total a pagar', { decimals: 2, required: true }),
          f('U1VLMINIMO', 244, 254, 'N', 'Pagamento mínimo', { decimals: 2, required: true }),
          f('USO_BANCO', 255, 264, 'A', 'Uso do banco na ficha de compensação'),
          f('BLTPDOC', 265, 267, 'A', 'Espécie de documento', { required: true }),
          f('BLCARTEIRA', 268, 270, 'A', 'Carteira na Ficha de Compensação', { required: true }),
          f('BLMOEDA', 271, 275, 'A', 'Moeda na ficha de compensação', { required: true }),
          f('BLCODBARRA', 276, 325, 'A', 'Código de Barras da Ficha de Compensação', { required: true }),
          f('BLLINHADIG', 326, 394, 'A', 'Linha Digitável (Formatada) da Ficha de Compensação', { required: true }),
          f('BLNUMPARC', 395, 396, 'N', 'Número da Parcela', { required: true }),
          f('QTD_PARCELAS', 397, 398, 'N', 'Quantidade de Parcelas (ahprd+1)', { required: true }),
          f('SEQ_REG', 399, 406, 'N', 'Sequência relativa do registro no arquivo'),
        ],
      },
      {
        code: '4',
        name: 'Dívida original',
        length: 406,
        fields: [
          f('TIPO', 1, 1, 'A', "Fixo '4'", { fixed: '4' }),
          f('U1CDCREDOR', 2, 9, 'A', 'Código do Credor', { required: true }),
          f('DMSSNUM', 10, 39, 'A', 'Identificação do cliente', { required: true, roles: ['cpf'] }),
          f('U1PRODUTO', 40, 47, 'A', 'Código do Produto', { required: true }),
          f('DMACCT', 48, 77, 'A', 'Nº do Contrato', { required: true, roles: ['contract'] }),
          d('DMDLQDT', 78, 85, 'AAAAMMDD', 'Vencimento do Original', { required: true }),
          f('AHID', 86, 93, 'N', 'Identificador do Parcelamento', { required: true, roles: ['ahid'] }),
          f('PRESTACAO_ORIGINAL', 94, 96, 'A', 'Número da Prestação Original', {
            required: true,
            note: 'Sem tipo definido no layout; amostra contém "0  " (alinhado à esquerda). Armazenado como texto.',
          }),
          f('DMAMTDLQ', 97, 107, 'N', 'Valor Principal da Dívida Original', { decimals: 2, required: true }),
          f('DMCURBAL', 108, 118, 'N', 'Valor corrigido da Dívida', { decimals: 2, required: true }),
          filler(119, 398, 'Completar registro com espaços'),
          f('SEQ_REG', 399, 406, 'N', 'Sequência'),
        ],
      },
    ],
    notes: [
      { kind: 'CORRECAO', text: 'Header: planilha indica SEQ-REG em 22-29, sobreposto ao FILLER 12-362. Aplicada a posição 399-406 (mesma do trailer e dos registros de dados), coerente com o arquivo real.' },
      { kind: 'INFORMACAO', text: 'Registros agrupados por boleto: 1 (endereço), 2 (parcela), 3 (ficha de compensação), 4 (dívida original).' },
      { kind: 'DIVERGENCIA_ARQUIVO_REAL', text: 'Carga de teste em ISO-8859-1. O trailer informa 2.315 registros e 761 cartas, enquanto o arquivo contém 3.062 registros de dados (765 cartas tipo 1). Divergência reportada como alerta.' },
    ],
  },
  {
    code: 'CCAM',
    title: 'Carta Campanha (CCAM)',
    sourceLayout: 'Layout Remessa Carta - Campanha - (Arquivo CCAM).xlsx',
    namingPattern: 'CCAM_XXXXX_AAAAMMDD_HHMMSS.txt',
    purpose: 'Arquivo que envia carta campanha',
    filenameRegex: new RegExp(`^CCAM_${acct}_(\\d{8})_(\\d{6})\\.txt$`, 'i'),
    filenameGroups: { agency: 1, date: 2, time: 3, dateFormat: 'AAAAMMDD' },
    encoding: 'latin1',
    layoutAvailable: true,
    headerTrailer: [cartaHT(380, 'Template Header-Trailler Arquivos CARTA CAMPANHA ("0"/"9", 380 posições)')],
    records: [
      {
        code: '1',
        name: 'Endereço de correspondência',
        length: 380,
        fields: [
          DMACCTG,
          f('DMACCT', 2, 17, 'A', 'Nº Conta-Nº Contrato / Nº Contrato (Chave)', { required: true, roles: ['contract'] }),
          f('DMZIP', 18, 25, 'A', 'CEP do endereço de correspondência', { required: true }),
          f('DMNAME', 26, 75, 'A', 'Nome do titular', { required: true, roles: ['name'] }),
          f('DNADDR1', 76, 125, 'A', 'Rua do endereço de correspondência', { required: true }),
          f('NUMERO_ENDERECO', 126, 130, 'A', 'Número do endereço de correspondência'),
          f('DMADDR2', 131, 180, 'A', 'Complemento do endereço de correspondência'),
          f('DMADDR3', 181, 205, 'A', 'Bairro do endereço de correspondência'),
          f('DMCITY', 206, 230, 'A', 'Cidade do endereço de correspondência'),
          f('DMSTATE', 231, 232, 'A', 'Estado do endereço de correspondência'),
          filler(233, 364, 'Completar registro com espaços'),
          f('AHID', 365, 372, 'N', 'ID do acordo', { required: true, roles: ['ahid'] }),
          f('SEQ_REG', 373, 380, 'N', 'Sequência relativa do registro no arquivo'),
        ],
      },
      {
        code: '2',
        name: 'Plano da campanha',
        length: 380,
        fields: [
          f('TIPO', 1, 1, 'A', "Fixo '2'", { fixed: '2' }),
          f('DMACCT', 2, 17, 'A', 'Nº Conta-Nº Contrato / Nº Contrato (Chave)', { required: true, roles: ['contract'] }),
          d('CADTPROC', 18, 25, 'AAAAMMDD', 'Data de atualização da dívida', {
            required: true,
            roles: ['eventDate'],
            note: 'Formato não informado no layout; AAAAMMDD por analogia ao layout de boletos.',
          }),
          f('CODIGO_BANCO', 26, 28, 'A', 'Código do banco do cliente', { required: true }),
          f('DMCURBAL', 29, 39, 'N', 'Valor atualizado da dívida', { decimals: 2, required: true, roles: ['amount'] }),
          d('CADTVCENTR', 40, 47, 'AAAAMMDD', 'Data de validade da campanha'),
          f('CAQTDPA', 48, 49, 'N', 'Quantidade de vezes do plano', { required: true }),
          f('CAVLRPREST', 50, 60, 'N', 'Valor da parcela do plano', { decimals: 2, required: true }),
          f('CAVLRDESC', 61, 71, 'N', 'Valor do desconto do plano', { decimals: 2, required: true }),
          f('CAVLRDIVIDA', 72, 82, 'N', 'Valor Total da Opção do plano', { decimals: 2, required: true }),
          f('NUM_CARTA_BOLETO', 83, 90, 'N', 'Nº da Carta Boleto', { required: true }),
          f('DMSSNUM', 91, 120, 'A', 'Identificador do Cliente', { required: true, roles: ['cpf'] }),
          filler(121, 372),
          f('SEQ_REG', 373, 380, 'N', 'Sequência relativa do registro no arquivo'),
        ],
      },
      {
        code: '3',
        name: 'Ficha de compensação',
        length: 380,
        fields: [
          f('TIPO', 1, 1, 'A', "Fixo '3'", { fixed: '3' }),
          f('DMSSNUM', 2, 17, 'A', 'Número do cartão do cliente', {
            required: true,
            note: 'Campo nomeado DMSSNUM no layout, porém descrito como "Número do cartão do cliente"; não utilizado como CPF.',
          }),
          f('LOCAL_PAGAMENTO', 18, 180, 'A', 'Local de pagamento da ficha de compensação', { required: true }),
          d('VENCIMENTO', 181, 188, 'AAAAMMDD', 'Vencimento da ficha de compensação', { required: true }),
          f('CEDENTE', 189, 224, 'A', 'Cedente da ficha de compensação', { required: true }),
          d('DATA_PROCESSAMENTO', 225, 232, 'AAAAMMDD', 'Data Processamento'),
          f('USO_BANCO', 233, 242, 'A', 'Uso do banco na ficha de compensação', { required: true }),
          f('ESPECIE_DOC', 243, 245, 'A', 'Espécie de documento', { required: true }),
          f('CARTEIRA', 246, 248, 'A', 'Carteira na Ficha de Compensação', { required: true }),
          f('MOEDA', 249, 253, 'A', 'Moeda na ficha de compensação', { required: true }),
          f('CODIGO_BARRAS', 254, 303, 'A', 'Código de Barras da Carta Campanha', { required: true }),
          f('LINHA_DIGITAVEL', 304, 372, 'A', 'Linha digitável da carta campanha', { required: true }),
          f('SEQ_REG', 373, 380, 'N', 'Sequência relativa do registro no arquivo'),
        ],
      },
      {
        code: '4',
        name: 'Dívida original / loja',
        length: 380,
        fields: [
          f('TIPO', 1, 1, 'A', "Fixo '4'", { fixed: '4' }),
          f('CODIGO_CREDOR', 2, 9, 'A', 'Código do Credor', { required: true }),
          f('IDENT_CLIENTE', 10, 39, 'A', 'Identificação do cliente', { required: true, roles: ['cpf'] }),
          f('CODIGO_PRODUTO', 40, 47, 'A', 'Código do Produto', { required: true }),
          f('CONTRATO', 48, 77, 'A', 'Nº do Contrato', { required: true, roles: ['contract'] }),
          d('VENC_ORIGINAL', 78, 85, 'AAAAMMDD', 'Vencimento do Original'),
          f('ID_PARCELAMENTO', 86, 93, 'N', 'Identificador do Parcelamento', { required: true, roles: ['ahid'] }),
          f('PRESTACAO_ORIGINAL', 94, 96, 'N', 'Número da Prestação Original', { required: true }),
          f('VALOR_PRINCIPAL_ORIG', 97, 107, 'N', 'Valor Principal da Dívida Original', { decimals: 2, required: true }),
          f('VALOR_CORRIGIDO_SEM_DESC', 108, 118, 'N', 'Valor corrigido da Dívida sem desconto', { decimals: 2, required: true }),
          f('VALOR_CORRIGIDO_COM_DESC', 119, 129, 'N', 'Valor corrigido da Dívida com desconto', { decimals: 2, required: true }),
          f('CODIGO_REDE', 130, 137, 'A', 'Código da Rede', { required: true }),
          f('NOME_REDE', 138, 182, 'A', 'Nome da Rede'),
          f('CODIGO_LOJA', 183, 190, 'A', 'Código da Loja'),
          f('NOME_LOJA', 191, 235, 'A', 'Nome da Loja'),
          filler(236, 372, 'Completar registro com espaços'),
          f('SEQ_REG', 373, 380, 'N', 'Sequência'),
        ],
      },
    ],
    notes: [
      { kind: 'INFORMACAO', text: 'Existem duas planilhas CCAM no pacote ("(Arquivo CCAM).xlsx" e "(Arquivo CCAM)(1).xlsx"); o conteúdo foi comparado e é idêntico.' },
      { kind: 'CORRECAO', text: 'Header: planilha indica SEQ-REG em 22-29, sobreposto ao FILLER 12-362. Aplicada a posição 373-380 (mesma do trailer e dos registros de dados).' },
      { kind: 'DIVERGENCIA_ARQUIVO_REAL', text: 'Carga de teste contém somente header e trailer (0 registros). O sistema registra a condição como "sem registros de dados".' },
    ],
  },
  {
    code: 'QUEBRA_ACORDO',
    title: 'Quebra de Acordos',
    sourceLayout: 'Layout_Quebra_Acordos_V2.xlsx',
    namingPattern: 'QUEBRA_ACORDO_XXXXX_AAAAMMDD_HHMMSS.txt',
    purpose: 'Arquivo com os acordos que foram quebrados',
    filenameRegex: new RegExp(`^QUEBRA_ACORDO_${acct}_(\\d{8})_(\\d{6})\\.txt$`, 'i'),
    filenameGroups: { agency: 1, date: 2, time: 3, dateFormat: 'AAAAMMDD' },
    encoding: 'latin1',
    layoutAvailable: true,
    headerTrailer: [{ id: 'SEM_HEADER', description: 'Layout sem header/trailer' }],
    records: [
      {
        code: '*',
        name: 'Acordo quebrado',
        length: 73,
        fields: [
          f('AHID', 1, 13, 'N', 'Número do Acordo', { required: true, roles: ['ahid'], note: 'Layout indica tipo A; tratado como numérico (identificador AHID).' }),
          f('DMAGENCY', 14, 21, 'A', 'Id da Assessoria que criou o acordo', { required: true }),
          f('AHTYPE', 22, 29, 'A', 'Tipo do Acordo Criado', { required: true }),
          d('AHDT', 30, 37, 'DDMMAAAA', 'Data de Negociação (DDMMAAAA)', { required: true }),
          f('AHPRD', 38, 40, 'N', 'Número Total de Parcelas (incluindo a entrada)', { required: true }),
          d('AHAUTDT', 41, 48, 'DDMMAAAA', 'Data da Quebra do Acordo (DDMMAAAA)', { required: true, roles: ['eventDate'] }),
          f('DMACCT', 49, 73, 'A', 'Número do contrato', {
            required: true,
            roles: ['contract'],
            note: 'Layout indica tipo D (data); conteúdo é o número do contrato. Armazenado como texto.',
          }),
        ],
      },
    ],
    notes: [{ kind: 'INFORMACAO', text: 'Layout sem header/trailer: todas as linhas são registros de dados; não há quantidade de controle.' }],
  },
  {
    code: 'ELEGIBILIDADE',
    title: 'Elegibilidade de Acordos',
    sourceLayout: 'LayoutElegibilidadesAcordoCyber_v2.xlsx',
    namingPattern: 'ELEGIBILIDADE_XXXXX_AAAAMMDD_HHMMSS.txt',
    purpose: 'Arquivo com os contratos elegíveis a acordo',
    filenameRegex: new RegExp(`^ELEGIBILIDADE_${acct}_(\\d{8})_(\\d{6})\\.txt$`, 'i'),
    filenameGroups: { agency: 1, date: 2, time: 3, dateFormat: 'AAAAMMDD' },
    encoding: 'latin1',
    layoutAvailable: true,
    ignoreBlankLines: true,
    headerTrailer: [{ id: 'SEM_HEADER', description: 'Layout sem header/trailer' }],
    records: [
      {
        code: '*',
        name: 'Critério de acordo (tipo de acordo)',
        length: 113,
        fields: [
          f('AGTYPE', 1, 8, 'A', 'Tipo de Acordo', { required: true }),
          d('AGINITDT', 9, 16, 'MMDDAAAA', 'Data Início Vigência (MMDDAAAA)', { required: true }),
          d('AGENDDT', 17, 24, 'MMDDAAAA', 'Data Fim Vigência (MMDDAAAA)', { required: true }),
          f('AGGRDAYS', 25, 27, 'N', 'Dias de Carência', { required: true }),
          f('AGRATE2', 28, 32, 'N', 'Taxa de Juros carência', { decimals: 2, required: true }),
          f('AGBREAK', 33, 35, 'N', 'Número de pagamentos não cumpridos para quebrar o acordo', { required: true }),
          f('AGDMDAYSMIN', 36, 39, 'N', 'Dias de atraso mínimo', { required: true, signed: true }),
          f('AGDMDAYSMAX', 40, 43, 'N', 'Dias de atraso máximo', { required: true, signed: true }),
          f('AGPYTYPE', 44, 73, 'A', 'Tipo Cotas / Juros', { required: true }),
          f('AGRATE', 74, 78, 'N', 'Taxa de Juros', { decimals: 2, required: true }),
          f('AGTAXRATE', 79, 83, 'N', 'Imposto', { decimals: 2, required: true }),
          f('AGINITPYDAYS', 84, 87, 'N', 'Max. Dias Pagamento Inicial', { required: true }),
          f('AGLSTPYDAYS', 88, 91, 'N', 'Max. Dias Pagamento Final', { required: true }),
          f('AGINITPYMINP', 92, 94, 'N', 'Faixa Pagamento Inicial', { required: true }),
          f('AGINITPYMAXP', 95, 97, 'N', 'Faixa Pagamento Final', { required: true }),
          f('AGMININITPY', 98, 110, 'N', 'Pagamento Inicial mínimo', { decimals: 2, required: true }),
          f('AGMAXPMTS', 111, 113, 'N', 'Número de pagamentos máximo', { required: true }),
        ],
      },
    ],
    notes: [
      { kind: 'LIMITACAO', text: 'Apesar do De-Para descrever "contratos elegíveis a acordo", o layout NÃO possui contrato nem CPF: é um catálogo de tipos de acordo (AGTYPE) com vigência e parâmetros. A elegibilidade por contrato não pode ser determinada; o batimento é feito por Tipo de Acordo (AHTYPE) e vigência na data do acordo.' },
      { kind: 'DIVERGENCIA_ARQUIVO_REAL', text: 'Carga de teste contém linhas compostas apenas por um espaço (1ª e última); são ignoradas com alerta.' },
    ],
  },
  {
    code: 'COMISSAO',
    title: 'Comissão',
    sourceLayout: 'Layout_Comissao_Cyber_Assessoria_V3.xlsx',
    namingPattern: 'AAAAMMDD_HHMMSS_comissao_XXXXX_out.txt',
    purpose: 'Arquivo para acompanhamento das comissões',
    filenameRegex: new RegExp(`^(\\d{8})_(\\d{6})_comissao_${acct}_out\\.txt$`, 'i'),
    filenameGroups: { date: 1, time: 2, agency: 3, dateFormat: 'AAAAMMDD' },
    encoding: 'latin1',
    layoutAvailable: true,
    headerTrailer: [
      {
        id: 'COMISSAO_0_9',
        description: 'Interface de Lote Comissões — Registro 0 (Header) / 9 (Trailler)',
        headerDateField: 'DATA_GERACAO',
        trailerCountField: 'QTD_REGISTROS',
        header: {
          code: '0',
          name: 'Header',
          length: 15,
          fields: [
            f('TIPO', 1, 1, 'N', 'Tipo de Registro — Fixo 0', { fixed: '0' }),
            d('DATA_GERACAO', 2, 9, 'AAAAMMDD', 'Data da Geração do Arquivo (AAAAMMDD)', {
              note: 'Planilha indica INI 2 / FIM 18 com TAM 8; aplicado 2-9 (TAM preservado).',
            }),
            f('HORA_GERACAO', 10, 15, 'N', 'Hora de Geração do Arquivo (hhmmss)', {
              note: 'Planilha indica INI 19 / FIM 24 com TAM 6; aplicado 10-15 (sequencial ao campo anterior).',
            }),
          ],
        },
        trailer: {
          code: '9',
          name: 'Trailer',
          length: 23,
          fields: [
            f('TIPO', 1, 1, 'N', 'Tipo de Registro — Fixo 9', { fixed: '9' }),
            d('DATA_GERACAO', 2, 9, 'DDMMAAAA', 'Data de Geração do Arquivo (ddmmaaaa)'),
            f('HORA_GERACAO', 10, 15, 'N', 'Hora de Geração do Arquivo (hhmmss)'),
            f('QTD_REGISTROS', 16, 23, 'N', 'Total de registros do arquivo'),
          ],
        },
      },
    ],
    records: [
      {
        code: '1',
        name: 'Dados da Comissão',
        length: 130,
        fields: [
          f('TIPO', 1, 1, 'N', 'Tipo de Registro — Fixo 1', { fixed: '1' }),
          d('DATA_RECEBIMENTO', 2, 9, 'MMDDAAAA', 'Data do Recebimento da Prestação (mmddaaaa)', { required: true, roles: ['eventDate'] }),
          f('CLIENTE', 10, 41, 'A', 'Nome ou razão social do cliente - devedor principal', { roles: ['name'] }),
          f('CPF_CNPJ', 42, 55, 'A', 'CPF/CNPJ do Cliente – devedor principal', {
            roles: ['cpf'],
            note: 'Layout indica tipo N; o conteúdo é alinhado à esquerda com brancos. Armazenado como texto.',
          }),
          f('GRUPO', 56, 56, 'A', 'Grupo do Contrato'),
          f('CONTRATO', 57, 81, 'A', 'Número identificador do contrato com dígito', {
            required: true,
            roles: ['contract'],
            note: 'Layout indica tipo N; alinhado à esquerda com brancos. Armazenado como texto (mesma chave DMACCT).',
          }),
          d('DATA_DISPONIBILIZACAO', 82, 89, 'DDMMAAAA', 'Data da Disponibilização do Contrato (ddmmaaaa)'),
          d('DATA_FIM', 90, 97, 'DDMMAAAA', 'Data Prevista para a saída do contrato ("Fim de Prazo")'),
          f('STATUS_CONTRATO', 98, 99, 'A', 'Status do Contrato — conforme tabela', {
            note: 'Layout indica tipo N "conforme tabela", porém a tabela de domínio não foi fornecida e o conteúdo real é alfabético (A/R). Valor exibido sem tradução.',
          }),
          f('TIPO_COBRANCA', 100, 101, 'A', 'Tipo de Cobrança — conforme tabela', { note: 'Tabela de domínio não fornecida.' }),
          f('PRESTACAO_ATRASO', 102, 104, 'N', 'Prestação em Atraso — Número da Prestação'),
          f('ZEROS', 105, 105, 'N', 'Zeros'),
          f('VALOR_RECEBIDO', 106, 117, 'N', 'Valor de recebimento da prestação (10 inteiras e 2 decimais)', { decimals: 2, roles: ['amount'] }),
          f('GLOSA', 118, 118, 'A', 'Informa se o pagamento foi glosado (S = Sim, N = Não)'),
          f('PCT_REM', 119, 121, 'N', '%Rem — Percentual da Remuneração Devida', { note: 'Casas decimais não definidas no layout; valor bruto.' }),
          f('REMUNERACAO_DEVIDA', 122, 130, 'N', 'Total da remuneração devida', {
            note: 'Casas decimais não definidas no layout; armazenado o valor bruto (inteiro) sem conversão.',
          }),
        ],
      },
    ],
    notes: [
      { kind: 'DIVERGENCIA_ARQUIVO_REAL', text: 'A planilha indica a nomenclatura "RET_DISTRIBUICAO_..." na aba de dados (erro de cópia); a nomenclatura oficial (De-Para e aba Header) é AAAAMMDD_HHMMSS_comissao_XXXXX_out.txt.' },
      { kind: 'CORRECAO', text: 'Header: posições da planilha (2-18 e 19-24) conflitam com TAM (8 e 6). Aplicado 2-9 e 10-15, coerente com o tamanho real do header (15).' },
      { kind: 'DIVERGENCIA_ARQUIVO_REAL', text: 'Carga de teste: data do trailer em AAAAMMDD (layout indica ddmmaaaa) e quantidade do trailer inclui header e trailer. Ambos registrados como alerta.' },
      { kind: 'DIVERGENCIA_ARQUIVO_REAL', text: 'Carga de teste: campo GLOSA preenchido com branco (layout prevê S/N).' },
      { kind: 'LIMITACAO', text: 'O layout não possui ID do acordo (AHID). O relacionamento com acordos e repasses é feito apenas por contrato (e data/valor para o repasse).' },
    ],
  },
  {
    code: 'REJ_CAMPANHA_EXT',
    title: 'Rejeição de Campanha Externa',
    sourceLayout: null,
    namingPattern: 'tb_campanha_rej_ext_XXXXX_AAAAMMDD_HHMMSS.txt',
    purpose: 'Arquivo com os contratos que tiveram a campanha rejeitada',
    filenameRegex: new RegExp(`^tb_campanha_rej_ext_${acct}_(\\d{8})_(\\d{6})\\.txt$`, 'i'),
    filenameGroups: { agency: 1, date: 2, time: 3, dateFormat: 'AAAAMMDD' },
    encoding: 'latin1',
    layoutAvailable: false,
    headerTrailer: [],
    records: [],
    notes: [
      { kind: 'LIMITACAO', text: 'De-Para: "Sem layout, contém somente o contrato e o motivo da rejeição". Como não há posições definidas, as linhas são armazenadas integralmente; a extração de contrato/motivo depende de configuração (Configurações > Rejeição de campanha).' },
    ],
  },
  {
    code: 'REJ_CAMPANHA_INT',
    title: 'Rejeição de Campanha Interna',
    sourceLayout: null,
    namingPattern: 'tb_campanha_rej_int_XXXXX_AAAAMMDD_HHMMSS.txt',
    purpose: 'Arquivo com os contratos que tiveram a campanha rejeitada (interna)',
    filenameRegex: new RegExp(`^tb_campanha_rej_int_${acct}_(\\d{8})_(\\d{6})\\.txt$`, 'i'),
    filenameGroups: { agency: 1, date: 2, time: 3, dateFormat: 'AAAAMMDD' },
    encoding: 'latin1',
    layoutAvailable: false,
    headerTrailer: [],
    records: [],
    notes: [
      { kind: 'LIMITACAO', text: 'Não consta no De-Para com nomenclatura própria; segue a mesma regra da rejeição externa (sem layout: contrato e motivo). Extração depende de configuração.' },
    ],
  },
  {
    code: 'CAMPANHA_ASSESSORIA',
    title: 'Campanha da Assessoria (CY_IE003)',
    sourceLayout: 'Layout_campanha_assessoria_V3 - Arq_CY (não fornecido)',
    namingPattern: 'CY_IE003_AAAAMMDD_XXXXX.txt',
    purpose: 'Arquivo de campanha da assessoria',
    filenameRegex: new RegExp(`^CY_IE003_(\\d{8})_${acct}\\.txt$`, 'i'),
    filenameGroups: { date: 1, agency: 2, dateFormat: 'AAAAMMDD' },
    encoding: 'latin1',
    layoutAvailable: false,
    headerTrailer: [],
    records: [],
    notes: [{ kind: 'LIMITACAO', text: 'Citado no De-Para, mas o layout não está no pacote Layouts_Pos_validacao.zip. O arquivo é armazenado para auditoria sem interpretação.' }],
  },
  {
    code: 'RAJADA_PIX',
    title: 'Rajada de Pagamentos PIX',
    sourceLayout: 'Layout_Rajada Pix (não fornecido)',
    namingPattern: 'CSF_RAJADAS_PGTOS_PIX_XXXXX_AAAAMMDD',
    purpose: 'Pagamentos via pix do contrato distribuído para assessoria',
    filenameRegex: new RegExp(`^CSF_RAJADAS_PGTOS_PIX_${acct}_(\\d{8})(?:\\.\\w+)?$`, 'i'),
    filenameGroups: { agency: 1, date: 2, dateFormat: 'AAAAMMDD' },
    encoding: 'latin1',
    layoutAvailable: false,
    headerTrailer: [],
    records: [],
    notes: [{ kind: 'LIMITACAO', text: 'Citado no De-Para, mas o layout não está no pacote. Armazenado para auditoria sem interpretação.' }],
  },
];

export const LAYOUT_BY_CODE = new Map(LAYOUTS.map((l) => [l.code, l]));

export function getLayout(code: string): LayoutDef {
  const l = LAYOUT_BY_CODE.get(code as LayoutDef['code']);
  if (!l) throw new Error(`Tipo de arquivo desconhecido: ${code}`);
  return l;
}

export function recordDefFor(layout: LayoutDef, code: string): RecordDef | undefined {
  return layout.records.find((r) => r.code === code) ?? layout.records.find((r) => r.code === '*');
}
