-- CRM de Batimento — Carteira Carrefour
-- Estrutura inicial. Convenções:
--   * Nenhum dado importado é apagado silenciosamente: importações são canceladas
--     (status CANCELADO) e permanecem auditáveis; reprocessamentos são auditados.
--   * Registros guardam o conteúdo original da linha (raw) + campos interpretados (fields).

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('ADMIN', 'OPERADOR', 'CONSULTA')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE audit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id),
  username   TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  details    JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Arquivos importados -------------------------------------------------------
CREATE TABLE imports (
  id                 SERIAL PRIMARY KEY,
  file_type          TEXT NOT NULL,
  type_detection     TEXT NOT NULL CHECK (type_detection IN ('AUTOMATICA', 'MANUAL')),
  original_name      TEXT NOT NULL,
  stored_path        TEXT NOT NULL,
  sha256             CHAR(64) NOT NULL,
  size_bytes         BIGINT NOT NULL,
  agency_code        TEXT,
  file_name_date     DATE,
  generation_date    DATE,
  sequence_number    TEXT,
  header_variant     TEXT,
  header             JSONB,
  trailer            JSONB,
  trailer_count      INTEGER,
  trailer_count_match TEXT,
  total_lines        INTEGER NOT NULL DEFAULT 0,
  blank_lines        INTEGER NOT NULL DEFAULT 0,
  data_records       INTEGER NOT NULL DEFAULT 0,
  valid_records      INTEGER NOT NULL DEFAULT 0,
  rejected_records   INTEGER NOT NULL DEFAULT 0,
  duplicate_records  INTEGER NOT NULL DEFAULT 0,
  by_record_type     JSONB,
  issue_counts       JSONB,
  file_errors        INTEGER NOT NULL DEFAULT 0,
  -- PRE_VISUALIZACAO -> CONFIRMADO | DESCARTADO ; CONFIRMADO -> CANCELADO
  -- VAZIO / SEM_LAYOUT são estados finais informativos (nunca "sucesso").
  status             TEXT NOT NULL CHECK (status IN ('PRE_VISUALIZACAO', 'CONFIRMADO', 'DESCARTADO', 'CANCELADO', 'VAZIO', 'SEM_LAYOUT', 'INVALIDO')),
  processing_result  TEXT,
  reprocess_count    INTEGER NOT NULL DEFAULT 0,
  uploaded_by        INTEGER REFERENCES users(id),
  uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_by       INTEGER REFERENCES users(id),
  confirmed_at       TIMESTAMPTZ,
  cancelled_by       INTEGER REFERENCES users(id),
  cancelled_at       TIMESTAMPTZ,
  cancel_reason      TEXT
);
-- Impede a mesma carga ativa duas vezes (conteúdo idêntico). Arquivos de 0 byte compartilham o
-- mesmo hash e são controlados pelo nome original + tipo.
CREATE UNIQUE INDEX imports_sha_active_uq ON imports (sha256)
  WHERE status IN ('PRE_VISUALIZACAO', 'CONFIRMADO', 'VAZIO', 'SEM_LAYOUT', 'INVALIDO') AND size_bytes > 0;
CREATE UNIQUE INDEX imports_empty_name_uq ON imports (file_type, original_name)
  WHERE status IN ('PRE_VISUALIZACAO', 'CONFIRMADO', 'VAZIO', 'SEM_LAYOUT', 'INVALIDO') AND size_bytes = 0;
CREATE INDEX imports_type_idx ON imports (file_type, status);

CREATE TABLE import_issues (
  id          BIGSERIAL PRIMARY KEY,
  import_id   INTEGER NOT NULL REFERENCES imports(id),
  line_number INTEGER,
  record_type TEXT,
  field       TEXT,
  value       TEXT,
  message     TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('ERRO', 'ALERTA', 'INFO'))
);
CREATE INDEX import_issues_import_idx ON import_issues (import_id);

-- Entidades de domínio (integridade referencial) -----------------------------
CREATE TABLE contracts (
  contract_key     TEXT PRIMARY KEY,
  cpf              TEXT,
  name             TEXT,
  status           TEXT NOT NULL DEFAULT 'SEM_DISTRIBUICAO'
                   CHECK (status IN ('ATIVO', 'RETIRADO', 'SEM_DISTRIBUICAO')),
  status_date      DATE,
  status_source    TEXT,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_import_id  INTEGER REFERENCES imports(id),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX contracts_cpf_idx ON contracts (cpf);

CREATE TABLE agreements (
  ahid            BIGINT PRIMARY KEY,
  contract_key    TEXT REFERENCES contracts(contract_key),
  status          TEXT NOT NULL DEFAULT 'NAO_IDENTIFICADO'
                  CHECK (status IN ('ATIVO', 'QUEBRADO', 'NAO_IDENTIFICADO')),
  broken_at       DATE,
  agreement_date  DATE,
  agreement_type  TEXT,
  total_amount    NUMERIC(15,2),
  installments    INTEGER,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agreements_contract_idx ON agreements (contract_key);

-- Registros interpretados (1 por linha de dados) -----------------------------
CREATE TABLE records (
  id            BIGSERIAL PRIMARY KEY,
  import_id     INTEGER NOT NULL REFERENCES imports(id),
  file_type     TEXT NOT NULL,
  line_number   INTEGER NOT NULL,
  record_type   TEXT NOT NULL,
  valid         BOOLEAN NOT NULL,
  -- *_ref: chave extraída na interpretação; contract_key/ahid: vínculo (FK) criado na confirmação.
  contract_ref  TEXT,
  ahid_ref      BIGINT,
  contract_key  TEXT REFERENCES contracts(contract_key),
  ahid          BIGINT REFERENCES agreements(ahid),
  cpf           TEXT,
  holder_name   TEXT,
  event_date    DATE,
  amount        NUMERIC(17,2),
  record_hash   CHAR(40) NOT NULL,
  dup_in_file   BOOLEAN NOT NULL DEFAULT FALSE,
  fields        JSONB NOT NULL,
  raw           TEXT NOT NULL,
  errors        TEXT[],
  UNIQUE (import_id, line_number)
);
CREATE INDEX records_contract_idx ON records (contract_key);
CREATE INDEX records_contract_ref_idx ON records (contract_ref);
CREATE INDEX records_ahid_ref_idx ON records (ahid_ref);
CREATE INDEX records_import_idx ON records (import_id);
CREATE INDEX records_cpf_idx ON records (cpf);
CREATE INDEX records_ahid_idx ON records (ahid);
CREATE INDEX records_type_idx ON records (file_type, record_type);
CREATE INDEX records_hash_idx ON records (file_type, record_hash);

-- Motor de batimento ----------------------------------------------------------
CREATE TABLE reconciliation_runs (
  id           SERIAL PRIMARY KEY,
  flow         TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('EXECUTANDO', 'CONCLUIDO', 'AGUARDANDO_ARQUIVOS', 'ERRO')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  started_by   INTEGER REFERENCES users(id),
  summary      JSONB,
  message      TEXT
);
CREATE INDEX reconciliation_runs_flow_idx ON reconciliation_runs (flow, id DESC);

-- Resultado individual por registro (somente da execução vigente de cada fluxo).
CREATE TABLE reconciliation_results (
  id                BIGSERIAL PRIMARY KEY,
  run_id            INTEGER NOT NULL REFERENCES reconciliation_runs(id),
  flow              TEXT NOT NULL,
  rule              TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('CONCILIADO', 'SOMENTE_ORIGEM', 'SOMENTE_DESTINO', 'DIVERGENTE', 'DUPLICADO', 'INFORMATIVO', 'PENDENTE_CONFIGURACAO', 'AGUARDANDO_ARQUIVO')),
  key_name          TEXT NOT NULL,
  key_value         TEXT,
  contract_key      TEXT,
  cpf               TEXT,
  ahid              BIGINT,
  source_type       TEXT,
  source_record_id  BIGINT REFERENCES records(id),
  target_type       TEXT,
  target_record_id  BIGINT REFERENCES records(id),
  field             TEXT,
  value_received    TEXT,
  value_expected    TEXT,
  reason            TEXT,
  event_date        DATE
);
CREATE INDEX recon_results_flow_idx ON reconciliation_results (flow, status);
CREATE INDEX recon_results_contract_idx ON reconciliation_results (contract_key);
CREATE INDEX recon_results_ahid_idx ON reconciliation_results (ahid);

-- PENDÊNCIAS DE BATIMENTO (persistentes entre execuções, identificadas por fingerprint).
CREATE TABLE divergences (
  id                BIGSERIAL PRIMARY KEY,
  fingerprint       TEXT NOT NULL UNIQUE,
  category          TEXT NOT NULL CHECK (category IN (
                      'NAO_LOCALIZADO_BANCO', 'NAO_LOCALIZADO_ASSESSORIA', 'DIVERGENCIA_CADASTRAL',
                      'DIVERGENCIA_VALOR', 'DIVERGENCIA_DATA', 'DUPLICIDADE', 'PAGAMENTO_NAO_IDENTIFICADO',
                      'ACORDO_NAO_RECONHECIDO', 'CONTRATO_NAO_RECONHECIDO', 'ARQUIVO_INVALIDO', 'ERRO_LAYOUT')),
  flow              TEXT,
  rule              TEXT,
  contract_key      TEXT,
  cpf               TEXT,
  ahid              BIGINT,
  import_id         INTEGER REFERENCES imports(id),
  source_file       TEXT,
  record_id         BIGINT,
  field             TEXT,
  value_received    TEXT,
  value_expected    TEXT,
  description       TEXT,
  occurrences       INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'ABERTA'
                    CHECK (status IN ('ABERTA', 'EM_ANALISE', 'RESOLVIDA', 'JUSTIFICADA', 'RESOLVIDA_AUTOMATICAMENTE')),
  resolution_note   TEXT,
  resolved_by       INTEGER REFERENCES users(id),
  resolved_at       TIMESTAMPTZ,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_detected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_id       INTEGER REFERENCES reconciliation_runs(id)
);
CREATE INDEX divergences_status_idx ON divergences (status, category);
CREATE INDEX divergences_contract_idx ON divergences (contract_key);
CREATE INDEX divergences_cpf_idx ON divergences (cpf);
