/**
 * Tipos do dicionário técnico de layouts.
 *
 * Toda definição de layout em `definitions.ts` reproduz a planilha oficial
 * correspondente (Layouts_Pos_validacao.zip). Quando a planilha é internamente
 * contraditória (ex.: INI/FIM incompatível com TAM), a correção aplicada é
 * registrada em `LayoutNote` com tipo `CORRECAO` e exibida ao usuário.
 */

export type FieldType = 'A' | 'N' | 'D';

/** Formatos de data presentes nos layouts oficiais. */
export type DateFormat = 'DDMMAAAA' | 'MMDDAAAA' | 'AAAAMMDD';

/** Papel semântico de um campo para o motor de batimento. */
export type FieldRole = 'contract' | 'cpf' | 'ahid' | 'eventDate' | 'amount' | 'name';

export interface FieldDef {
  /** Nome técnico do campo conforme a planilha (coluna CAMPO). */
  name: string;
  /** Descrição conforme a planilha (coluna DESCRIÇÃO). */
  label: string;
  start: number; // INI (1-based, inclusivo)
  end: number; // FIM (1-based, inclusivo)
  type: FieldType;
  /** Casas decimais implícitas (coluna DECIMAIS). null = não definido no layout. */
  decimals?: number;
  dateFormat?: DateFormat;
  /** Coluna "CAMPOS OBRIGATÓRIOS" marcada com "x" ou campo identificado como "(Chave)". */
  required?: boolean;
  /** Permite sinal '-' em campos numéricos (ex.: dias de atraso da Elegibilidade). */
  signed?: boolean;
  roles?: FieldRole[];
  /** Filler/brancos — não é armazenado como dado de negócio. */
  filler?: boolean;
  /** Valor fixo esperado (ex.: DMACCTG = '1'). */
  fixed?: string;
  note?: string;
}

export interface RecordDef {
  /** Identificador do tipo de registro (1º caractere) ou '*' quando o layout não possui discriminador. */
  code: string;
  name: string;
  length: number;
  fields: FieldDef[];
}

export type NoteKind = 'CORRECAO' | 'DIVERGENCIA_ARQUIVO_REAL' | 'LIMITACAO' | 'INFORMACAO';

export interface LayoutNote {
  kind: NoteKind;
  text: string;
}

export interface HeaderTrailerDef {
  /** Identificador desta variante (para exibição). */
  id: string;
  description: string;
  header?: RecordDef;
  trailer?: RecordDef;
  /** Nome do campo do trailer que contém a quantidade de registros. */
  trailerCountField?: string;
  /** Nome do campo do header que contém a data de geração. */
  headerDateField?: string;
  /** Nome do campo do header que contém a sequência do arquivo. */
  headerSequenceField?: string;
  /** Validação de tamanho de header/trailer apenas como alerta (layout ambíguo). */
  lengthIsWarning?: boolean;
}

export type FileTypeCode =
  | 'REM_CONTRATOS'
  | 'RET_DISTRIBUICAO'
  | 'RET_CARTEIRA'
  | 'ACORDO_ASSESSORIA'
  | 'REPASSE'
  | 'REM_BOLETOS'
  | 'QUEBRA_ACORDO'
  | 'ELEGIBILIDADE'
  | 'CCAM'
  | 'COMISSAO'
  | 'BAT_CONTRATOS'
  | 'BAT_ACORDO'
  | 'BAT_ACORDO_PGTO'
  | 'REJ_CAMPANHA_EXT'
  | 'REJ_CAMPANHA_INT'
  | 'CAMPANHA_ASSESSORIA'
  | 'RAJADA_PIX';

export interface LayoutDef {
  code: FileTypeCode;
  title: string;
  /** Nome da planilha oficial de origem. */
  sourceLayout: string | null;
  /** Nomenclatura oficial conforme De-Para. */
  namingPattern: string;
  /** Finalidade conforme De-Para (coluna OBS). */
  purpose: string;
  /** Regex para identificação automática pelo nome do arquivo. */
  filenameRegex: RegExp;
  /** Índices dos grupos da regex: código da assessoria e data. */
  filenameGroups: { agency?: number; date?: number; time?: number; dateFormat?: DateFormat };
  encoding: 'latin1';
  /** false = De-Para cita o arquivo mas o layout não foi fornecido; arquivo é armazenado sem interpretação. */
  layoutAvailable: boolean;
  /** Variantes aceitas de header/trailer (a primeira é a oficial do layout). */
  headerTrailer: HeaderTrailerDef[];
  records: RecordDef[];
  /** Linhas compostas apenas por brancos são ignoradas com alerta. */
  ignoreBlankLines?: boolean;
  notes: LayoutNote[];
}
