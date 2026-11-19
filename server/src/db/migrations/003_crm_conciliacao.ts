// Conciliação em massa com o CRM externo. As exportações do CRM são somente lidas:
// nenhuma informação é gravada de volta no CRM oficial.
export default `
CREATE TABLE crm_snapshots (
  id             SERIAL PRIMARY KEY,
  original_name  TEXT NOT NULL,
  sha256         CHAR(64) NOT NULL,
  size_bytes     BIGINT NOT NULL,
  format         TEXT NOT NULL CHECK (format IN ('CSV', 'XLSX')),
  delimiter      TEXT,
  encoding       TEXT,
  headers        JSONB NOT NULL,
  rows_count     INTEGER NOT NULL,
  warnings       JSONB,
  status         TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'CANCELADO')),
  uploaded_by    INTEGER REFERENCES users(id),
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX crm_snapshots_sha_uq ON crm_snapshots (sha256) WHERE status = 'ATIVO';

CREATE TABLE crm_snapshot_files (
  snapshot_id INTEGER PRIMARY KEY REFERENCES crm_snapshots(id),
  content     BYTEA NOT NULL
);

CREATE TABLE crm_snapshot_rows (
  snapshot_id INTEGER NOT NULL REFERENCES crm_snapshots(id),
  row_number  INTEGER NOT NULL,
  data        JSONB NOT NULL,
  PRIMARY KEY (snapshot_id, row_number)
);

CREATE TABLE crm_recon_runs (
  id           SERIAL PRIMARY KEY,
  snapshot_id  INTEGER NOT NULL REFERENCES crm_snapshots(id),
  scope        TEXT NOT NULL,
  profile      JSONB NOT NULL,
  rules        JSONB NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('EXECUTANDO', 'CONCLUIDO', 'ERRO')),
  summary      JSONB,
  message      TEXT,
  started_by   INTEGER REFERENCES users(id),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);

CREATE TABLE crm_recon_items (
  id            BIGSERIAL PRIMARY KEY,
  run_id        INTEGER NOT NULL REFERENCES crm_recon_runs(id),
  contrato      TEXT NOT NULL,
  situacao      TEXT NOT NULL CHECK (situacao IN ('CONFORME', 'NAO_IMPORTADO', 'DIVERGENTE', 'NAO_CONSTA_NA_BASE')),
  motivo        TEXT,
  duplicado     BOOLEAN NOT NULL DEFAULT FALSE,
  crm_rows      INTEGER[],
  divergencias  JSONB,
  base          JSONB,
  crm           JSONB
);
CREATE INDEX crm_recon_items_run_idx ON crm_recon_items (run_id, situacao);
CREATE INDEX crm_recon_items_contrato_idx ON crm_recon_items (run_id, contrato);
`;
