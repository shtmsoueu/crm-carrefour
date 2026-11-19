# CRM de Cobrança ARC4

Plataforma de consulta, análise e rastreabilidade da carteira ARC4 (27 arquivos diários: 9 tipos × 3 carteiras `0140 · CLEAN`, `0144 · CAÍDOS`, `0900 · DESAFIANTE`). Projeto independente do CRM Carrefour que fica na raiz deste repositório (ver `docs/DECISOES.md`, D-001).

- Instruções de trabalho e regras de negócio: [`CLAUDE.md`](CLAUDE.md)
- Fases e critérios de aceite: [`docs/BACKLOG.md`](docs/BACKLOG.md)
- Decisões e riscos: [`docs/DECISOES.md`](docs/DECISOES.md)
- Proposta completa: [`docs/proposta/`](docs/proposta/Proposta_Remodelagem_CRM_ARC4.md)

## Estrutura

```
arc4/
  api/          FastAPI (arc4_api)
  importador/   leitura dos ZIPs, dicionário de colunas, fixtures sintéticas (arc4_importador)
  db/           Alembic: migrations em SQL puro + testes do esquema
  web/          React + TypeScript + Vite
  docs/         proposta, backlog, modelo, protótipo, diagnóstico, decisões
  dados/        ZIPs reais do banco — ignorado pelo Git
```

## Pré-requisitos

Docker com Compose, [uv](https://docs.astral.sh/uv/) e Node.js 22.

## Começar

```bash
make setup
```

```bash
make up
```

```bash
make migrate
```

Web em http://localhost:8080 e API em http://localhost:8000/health (documentação em `/api/docs`).

## Comandos

| Comando | O que faz |
| --- | --- |
| `make db` | Sobe só o PostgreSQL 16 |
| `make migrate` | Aplica as migrations (reaplicável) |
| `make test` | Testes Python e do frontend; os de banco usam `TEST_DATABASE_URL` (padrão: banco do Compose) e criam um banco temporário |
| `make lint` | ruff, ESLint e tsc |
| `make dev` | API com reload (:8000) e Vite (:5173) |
| `make fixtures` | Gera os 27 ZIPs sintéticos em `importador/tests/.fixtures/20261119` |
| `make import DATA=…` | Fase 2, ainda não implementado |

## Dados sensíveis

Os ZIPs do banco contêm dados pessoais. Ficam apenas em `dados/` (ignorado pelo Git) e nunca aparecem em logs, testes, commits ou PRs. Os testes usam só fixtures sintéticas.
