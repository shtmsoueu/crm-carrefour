// Arquivos originais armazenados no próprio banco (compactados em gzip), para
// hospedagens sem disco permanente (ex.: Vercel). Imutáveis: nunca são atualizados.
export default `
CREATE TABLE import_files (
  import_id  INTEGER PRIMARY KEY REFERENCES imports(id),
  encoding   TEXT NOT NULL DEFAULT 'gzip',
  content    BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;
