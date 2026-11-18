# CRM de Batimento — Carteira Carrefour

Sistema web para importar os arquivos diários e mensais enviados pelo banco (layouts Cyber → Assessoria), guardar as informações em uma base relacional e conciliar automaticamente contratos, acordos, boletos, pagamentos, quebras, elegibilidade, comissão e campanhas. Ele substitui a conferência manual em Excel e mantém a rastreabilidade até o arquivo original.

## Funcionalidades

| Área | O que faz |
|---|---|
| **Importação** | Envio de um ou vários arquivos. O tipo é identificado pela nomenclatura do De-Para, ou escolhido manualmente. Cada arquivo é interpretado com o próprio layout de largura fixa. A tela de pré-visualização mostra dados interpretados, header/trailer e validações antes da confirmação. |
| **Validações** | Header/trailer, tamanho de cada linha, quantidade do trailer, campos obrigatórios, tipos e datas, linhas repetidas, arquivo vazio ou fora do padrão. Reimportar o mesmo arquivo é bloqueado (SHA-256 e tipo + data de geração + sequência). |
| **Motor de batimento** | 8 fluxos (A–H) com resultado individual por registro: origem, destino, chave, campo, valor recebido, valor esperado e motivo. Fluxos sem arquivo de origem ficam como *aguardando arquivo*, sem resultado simulado. |
| **Painel** | Contratos (recebidos, distribuídos, retirados, ativos), acordos (realizados, reconhecidos, divergentes, quebrados, valor negociado), pagamentos (identificados, valor recebido), pendências e % de conciliação por etapa. Filtros por período, data de processamento, tipo de arquivo, contrato, CPF e status do batimento. |
| **Consulta de contrato** | Busca por contrato ou CPF e linha do tempo completa (recebimento, distribuição, alterações, elegibilidade, acordos, boletos, pagamentos, quebras, retiradas, comissão), com o resultado do batimento de cada evento. |
| **Pendências de batimento** | 11 categorias, tratamento (em análise / resolvida / justificada, com observação), encerramento automático quando a divergência some e reabertura quando volta. Exportação em Excel e CSV. |
| **Histórico e auditoria** | Cada importação com recebidos / processados / conciliados / divergências / rejeitados, usuário e resultado. Log de todas as operações. O original fica armazenado e pode ser baixado. |
| **Acesso** | **Login desativado por padrão (acesso livre)**: todas as operações são feitas e auditadas como o usuário técnico `acesso-livre`. Para exigir login, defina `AUTH_ENABLED=true`. Aí valem os perfis Administrador, Operador e Consulta, senhas com bcrypt, sessão em cookie httpOnly/SameSite e bloqueio após tentativas de login. |

## Princípios aplicados

- **Nada é inventado.** Posições, tipos e chaves vêm das planilhas oficiais (`server/src/layouts/definitions.ts`). Quando a planilha é internamente contraditória, a correção fica registrada e visível (ver [`docs/VALIDACAO_CARGAS_TESTE.md`](docs/VALIDACAO_CARGAS_TESTE.md)).
- **CPF nunca é chave de relacionamento.** As chaves são `DMACCT` (contrato), `AHID` (acordo) e `AHTYPE` (tipo de acordo), conforme cada layout.
- **Sem regra definida, o sistema sinaliza.** Exemplos: elegibilidade por contrato (o layout não tem contrato) e rejeições de campanha (sem layout). Esses casos aparecem como *requer configuração*.
- **Nada é apagado em silêncio.** Importações confirmadas só são *canceladas*: os registros ficam guardados e saem dos batimentos. O reprocessamento substitui apenas os registros da própria importação e é auditado.

## Arquitetura

```
web/     React 18 + Vite + TypeScript (SPA, sem dependências de UI externas; fontes locais)
server/  Node.js 22 + Express + PostgreSQL (pg), TypeScript
  src/layouts/        dicionário técnico (definições oficiais) + identificação por nomenclatura
  src/parsing/        parser de largura fixa em fluxo (streaming), validações por campo
  src/imports/        pré-visualização, confirmação, descarte, cancelamento, reprocessamento, armazenamento
  src/reconciliation/ motor de batimento e fluxos A–H
  src/services/       painel, linha do tempo, pendências, exportação, auditoria
  src/db/migrations/  esquema SQL
docs/    dicionário técnico gerado + relatório de validação das cargas
```

**Modelo de dados**: `imports` (arquivo, hash, header/trailer, contagens, situação) → `records` (uma linha por registro, com a linha original, os campos interpretados em JSONB e as chaves extraídas) → `contracts` e `agreements` (entidades com integridade referencial, vinculadas na confirmação) → `reconciliation_runs` / `reconciliation_results` (execução vigente de cada fluxo) → `divergences` (pendências persistentes, identificadas por *fingerprint*) e `audit_log`.

**Volume**: a leitura é feita em fluxo, a inserção em lotes (padrão 1.000 linhas) e os batimentos em conjunto. A carga de teste completa (~45 mil registros) importa e concilia em cerca de 10 s.

## Como executar

Pré-requisitos: Node.js 22+ e PostgreSQL 14+.

```bash
npm install
```

```bash
cp .env.example .env   # preencha DATABASE_URL e JWT_SECRET
```

```bash
npm run migrate
```

Somente se o login estiver ativo (`AUTH_ENABLED=true`):

```bash
npm run create-user -- admin "Nome do Administrador" ADMIN
```

Desenvolvimento (API em :3333 e interface em :5173 com proxy):

```bash
npm run dev
```

Produção (a API serve a interface compilada):

```bash
npm run build && npm start
```

Ou com Docker:

```bash
DB_PASSWORD=... JWT_SECRET=$(openssl rand -hex 32) docker compose up -d --build
```

```bash
docker compose exec app node dist/cli/create-user.js admin "Administrador" ADMIN
```

## Testes e validação

Testes automatizados (layouts, parser e integração da API com PostgreSQL; usa o banco de `TEST_DATABASE_URL` e **recria o schema**):

```bash
TEST_DATABASE_URL=postgres://crm:senha@localhost:5432/crm_test npm test
```

Validação obrigatória com as cargas de teste (banco de desenvolvimento; `--reset` recria o schema):

```bash
npm run validate-loads -- /caminho/para/Cargas_teste --reset
```

Para regenerar o dicionário técnico depois de alterar um layout:

```bash
npm run docs:dictionary
```

> Os arquivos de carga e as planilhas de layout recebidos do banco contêm dados pessoais e **não devem ser versionados** (já estão no `.gitignore`).

## Limitações conhecidas

- Com o login desativado, qualquer pessoa que tenha o endereço do sistema vê os dados (inclui CPF e valores). Use apenas em rede interna ou reative o login antes de expor o sistema na internet.

- BAT_CONTRATOS, BAT_ACORDO e BAT_ACORDO_PGTO não vieram nas cargas de teste. Os importadores e regras estão prontos e testados com arquivos sintéticos; os indicadores de reconhecimento pelo banco ficam como *aguardando arquivo* até a primeira importação.
- Faltam o layout de CY_IE003 (campanha da assessoria) e o da Rajada PIX. Esses arquivos são identificados e guardados, mas não interpretados.
- Rejeição de campanha: a extração de contrato e motivo precisa ser configurada quando o banco confirmar o formato.
- A tabela de domínio do *Status do Contrato* / *Tipo de Cobrança* da comissão não foi fornecida.
