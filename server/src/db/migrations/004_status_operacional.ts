// Status operacional do contrato (ciclo da carga) e do acordo (grade de parcelas), derivados dos
// arquivos operacionais e separados do batimento oficial (mensal, arquivos BAT).
export default `
-- Contrato: RET_CARTEIRA / RET_DISTRIBUICAO passam a significar 005 - PARALISADO.
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
UPDATE contracts SET status = '005 - PARALISADO' WHERE status = 'RETIRADO';
ALTER TABLE contracts ADD CONSTRAINT contracts_status_check CHECK (status IN ('ATIVO', '005 - PARALISADO', 'SEM_DISTRIBUICAO'));
ALTER TABLE contracts ADD COLUMN status_import_id INTEGER REFERENCES imports(id);
ALTER TABLE contracts ADD COLUMN status_record_id BIGINT;

-- Acordo: novo conjunto de status e rastreabilidade até o registro de origem.
ALTER TABLE agreements DROP CONSTRAINT IF EXISTS agreements_status_check;
UPDATE agreements SET status = CASE status WHEN 'ATIVO' THEN 'PROMESSA_ATIVA' WHEN 'QUEBRADO' THEN 'QUEBRA_DE_ACORDO' ELSE 'NAO_IDENTIFICADO' END;
ALTER TABLE agreements ALTER COLUMN status SET DEFAULT 'NAO_IDENTIFICADO';
ALTER TABLE agreements ADD CONSTRAINT agreements_status_check
  CHECK (status IN ('PROMESSA_ATIVA', 'PROMESSA_EM_ATRASO', 'ACORDO', 'QUEBRA_DE_ACORDO', 'ACORDO_EXTERNO', 'NAO_IDENTIFICADO'));
ALTER TABLE agreements ADD COLUMN status_date DATE;
ALTER TABLE agreements ADD COLUMN status_source TEXT;
ALTER TABLE agreements ADD COLUMN status_import_id INTEGER REFERENCES imports(id);
ALTER TABLE agreements ADD COLUMN status_record_id BIGINT;
ALTER TABLE agreements ADD COLUMN status_ref_date DATE;
ALTER TABLE agreements ADD COLUMN status_reason TEXT;
ALTER TABLE agreements ADD COLUMN days_late INTEGER;
ALTER TABLE agreements ADD COLUMN beyond_tolerance BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE agreements ADD COLUMN ahcollid TEXT;
ALTER TABLE agreements ADD COLUMN ahcollid_source TEXT;

-- Grade de parcelas (00 = entrada, 01 = colchão). Recalculada a cada atualização de status.
CREATE TABLE agreement_installments (
  ahid                 BIGINT NOT NULL REFERENCES agreements(ahid) ON DELETE CASCADE,
  numero               INTEGER NOT NULL,
  due_date             DATE,
  amount               NUMERIC(15,2),
  status               TEXT NOT NULL CHECK (status IN ('PAGA', 'A_VENCER', 'EM_ATRASO', 'VENCIDA', 'QUEBRADA')),
  days_late            INTEGER,
  tolerance_days       INTEGER,
  paid_at              DATE,
  paid_amount          NUMERIC(15,2),
  agreement_record_id  BIGINT,
  agreement_import_id  INTEGER REFERENCES imports(id),
  payment_record_id    BIGINT,
  payment_import_id    INTEGER REFERENCES imports(id),
  PRIMARY KEY (ahid, numero)
);
`;
