# Decisões — CRM de Cobrança ARC4

Registro de decisões técnicas e de negócio: data, decisão, motivo e situação. Uma decisão "provisória" vale até ser confirmada pelo time; mudar uma delas exige nova entrada aqui.

| ID | Data | Situação |
| --- | --- | --- |
| D-001 | 2026-11-19 | Provisória: confirmar |
| D-002 | 2026-11-19 | Provisória: confirmar antes da Fase 1 |
| D-003 | 2026-11-19 | Adotada |
| D-004 | 2026-11-19 | Adotada; pendência antes da F2.2 |
| D-005 | 2026-11-19 | Adotada |
| D-006 | 2026-11-19 | Adotada |
| R-001…R-004 | 2026-11-19 | Riscos para as próximas fases |

---

## D-001 · O ARC4 fica em `arc4/` dentro do repositório `crm-carrefour`

**Decisão.** O projeto ARC4 foi criado na pasta `arc4/`, isolado do CRM Carrefour que já existe na raiz (Node/Express, publicado na Vercel). Nada da raiz foi alterado, exceto o workflow `.github/workflows/arc4.yml`, que só roda quando `arc4/**` muda.

**Motivo.** O `COMO_COMECAR.md` do pacote previa um repositório próprio (`crm-arc4`), mas esta sessão só tem acesso a `crm-carrefour`. Os dois sistemas têm fontes, layouts e regras diferentes (Cyber de largura fixa × CSV ARC4) e não compartilham código.

**Como reverter.** Para mover para um repositório próprio preservando o histórico: `git subtree split --prefix=arc4 -b arc4-split` e push para o novo repositório. Os caminhos dentro de `arc4/` já são relativos à pasta.

## D-002 · Stack da proposta adotada na Fase 0

**Decisão.** Python 3.12 + FastAPI (API), Python (importador), PostgreSQL 16, React 18 + TypeScript + Vite + TanStack Query (web), Docker Compose. É a stack proposta no `CLAUDE.md`.

**Motivo.** A Fase 0 precisa de uma stack para existir. A proposta mantém importador e API na mesma linguagem, reaproveita a leitura dos scripts Python de diagnóstico e põe as regras de permissão no backend.

**Alternativa considerada.** Reaproveitar a stack Node/TypeScript do CRM Carrefour (mesma equipe, mesma infraestrutura). Não adotada porque o importador ARC4 se beneficia de Polars/DuckDB e os scripts de referência estão em Python. **O `CLAUDE.md` pede confirmação com o time antes da Fase 1.**

## D-003 · Ferramentas

- **uv** com workspace (`importador/`, `api/`) e um único `uv.lock`.
- **Alembic** com SQL puro (`db/migrations/sql/*.sql`), sem ORM: o esquema é revisado como SQL e a mesma linguagem serve ao Power BI. Cada migration roda numa transação.
- **ruff** (lint e formatação) no Python; **ESLint + tsc** no frontend.
- **Figtree** servida pelo próprio app (`@fontsource/figtree`), sem chamada a CDN externa, e isolada na variável `--fonte` para a troca por BTG Pactual Sans.
- O frontend chama `/api/*`; em desenvolvimento o Vite repassa para `:8000`, no Compose o nginx repassa para o serviço `api`.

## D-004 · Dicionário de colunas parcial até termos os cabeçalhos reais

**Decisão.** `importador/src/arc4_importador/layout.py` é a fonte única do dicionário de colunas (fixtures, leitura e, na Fase 2, validação e seed de `canonico.dicionario_coluna`). Ele contém as colunas que os scripts de diagnóstico e a proposta realmente usam. Colunas com `confirmada=False` (`nome`, `data_nascimento`, `data_camec`, `parcela_paga`, `data_compra_garantia`) têm nome exato a conferir.

**Motivo.** O pacote não trouxe a lista completa de cabeçalhos (a REMESSA tem 82 colunas, a GARANTIAS 58). Inventar nomes de colunas faria a validação rejeitar arquivos reais.

**Pendência antes da F2.2.** Rodar `docs/diagnostico/scripts/cabecalhos.py` sobre `dados/20261119/` (só cabeçalhos, sem imprimir linhas de dados), completar o `layout.py` e marcar as obrigatórias. Também confirmar em qual arquivo vem `CamecDate | data_camec` e qual é o formato da data.

## D-005 · Ajustes ao esquema proposto na migration 0001

A migration parte de `docs/modelo/schema_postgresql.sql` com estes ajustes:

1. O esquema `seguranca` é criado antes de `canonico`, para que a autoria tenha chave estrangeira.
2. `canonico.lote_importacao.enviado_por` e `aprovado_por` passam a referenciar `seguranca.usuario(id)`. O `check (aprovado_por <> enviado_por)` foi mantido: "quem envia não aprova" é garantido no banco (regra 8), com teste.
3. `canonico.regra_produto` recebeu o mesmo `check` de `regra_instituicao`: quem propõe não aprova.
4. `seguranca.usuario_carteira` é criada depois de `canonico.eps`, da qual depende.

`docs/modelo/schema_postgresql.sql` continua sendo a referência da proposta. O que vale no banco é `db/migrations/`.

## D-006 · Fixtures geradas, não versionadas

**Decisão.** Os testes geram os 27 ZIPs sintéticos em tempo de execução (`arc4_importador.fixtures`, semente fixa, saída determinística) e conferem o conteúdo lendo os ZIPs de volta. `make fixtures` grava uma cópia em `importador/tests/.fixtures/` (ignorada pelo Git).

**Motivo.** O repositório não guarda binários e não há risco de um ZIP real ser confundido com fixture. Os valores de domínio (estratégias, produtos, grupos, status) são plausíveis, mas **não** representam regras aprovadas: não use as fixtures como fonte de dicionário de domínio.

---

## Riscos identificados para as próximas fases

- **R-001 · Chave do pagamento (F2.8).** O esquema propõe `sha256(contrato|data|parcela|valor)`. Dois pagamentos legítimos iguais no mesmo dia (mesmo contrato, parcela e valor) seriam fundidos num só. Antes da F2.8, verificar no arquivo acumulado se existem linhas idênticas e se o banco tem um identificador de transação.
- **R-002 · Reprocessamento (F2.7).** `canonico.lote_importacao.data_carga` é `unique`. Reprocessar uma carga corrigida da mesma data exige outro desenho (ex.: unicidade só entre lotes não rejeitados/substituídos). Decidir na F2.7.
- **R-003 · TELEFONES_BLOQUEADOS.** O conteúdo é igual nas 3 EPS, mas os ZIPs têm hashes diferentes (o nome interno muda). A deduplicação deve ser pelo conteúdo, e a lista tratada como global, sem triplicar os bloqueios. As fixtures reproduzem esse comportamento.
- **R-004 · Build de imagens atrás de proxy com inspeção TLS.** Em redes corporativas que substituem o certificado TLS, `pip` e `npm` dentro do `docker build` falham. Se for o caso na BTG, incluir a CA corporativa no build com um *build secret*. Não foi incluído agora para não presumir a infraestrutura.
