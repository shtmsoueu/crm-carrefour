# Remodelagem profissional — diagnóstico e plano por fases

Referência: `Remodelagem_Profissional_CRM_Carrefour.md`. Princípio: evoluir sem substituir o que já funciona. Parser, layouts, motor de batimento, importação e conciliação com o CRM são preservados.

## 1. Diagnóstico do estado atual

### Inventário
| Camada | Situação |
|---|---|
| Telas (14 rotas) | Painel, Importar, Detalhe da importação, Histórico, Batimentos, Pendências, Consulta de contrato, Carteira classificada, Conciliação CRM, Dicionário, Auditoria, Usuários, Configurações, Login |
| API (43 endpoints) | auth, imports (enviar, pré-visualizar, confirmar, descartar, cancelar, reprocessar, baixar), reconciliation, divergences, dashboard, contracts, carteira (+ pilares, regras), crm (snapshots, perfil, execuções, itens), audit, users, settings |
| Banco (18 tabelas) | users, audit_log, settings, imports, import_issues, import_files, records, contracts, agreements, reconciliation_runs/results, divergences, crm_snapshots/_files/_rows, crm_recon_runs/_items |
| Batimentos | A Distribuição, B Acordos, C Pagamentos, D Boletos, E Quebra, F Elegibilidade, G Comissão, H Campanhas, I Integridade das chaves |
| Testes | 145 (layouts, parser, regras, integração API+banco, auditoria independente) |

### Situação por funcionalidade pedida
| Item do documento | Situação | Observação |
|---|---|---|
| Importação com validação, pré-visualização e confirmação | **Completo** | Falta a apresentação por etapas e o resultado consolidado após a confirmação |
| Esteira Recebido → … → Conciliado | **Parcial** | Os dados existem (status da importação + execuções); falta a visualização |
| Central de batimentos | **Completo** | Falta a competência por fluxo e a diferenciação visual de todos os estados |
| Pendências | **Completo** | Falta idade, prioridade e ordenação. Não existe atribuição de responsável (não será exibida) |
| Dossiê do contrato | **Parcial** | Linha do tempo e acordos existem; faltam abas, cabeçalho classificado e CPF mascarado |
| Carteira classificada | **Completo** | Falta a organização em abas |
| Conciliação CRM | **Completo** | Falta o percentual de aderência explícito na visão executiva |
| Dashboards BackOffice / MIS / Gerência / CFO | **Pendente** | Existe só um painel único; os dados para os quatro existem |
| Páginas financeiras (Acordos, Pagamentos, Boletos, Quebras, Comissão, Reconhecimento) | **Pendente** | Dados existem em `records` e resultados; o Reconhecimento depende dos BAT, ainda não recebidos |
| Alertas e ocorrências | **Pendente** | Pode ser derivado de pendências + avisos dos fluxos |
| Permissões BackOffice, MIS, Gerência, CFO | **Pendente** | Hoje existem ADMIN, OPERADOR e CONSULTA |
| Login em ambiente exposto | **Risco aberto** | Está desativado por padrão (decisão anterior). O documento exige reativar: tratado na Fase 5 |
| Competência como filtro | **Pendente** | Não existe campo "competência" nos layouts. Ver decisão D1 |

### Riscos identificados
1. **Competência:** os layouts não têm campo de competência. Usar "mês da data de geração do arquivo" é uma premissa e precisa de validação (D1).
2. **CFO, valores aguardando reconhecimento:** sem os arquivos BAT, nada pode aparecer como "reconhecido". Esses indicadores ficam como "aguardando arquivo", nunca zero nem sucesso.
3. **Comissão:** a regra de contagem das linhas idênticas segue pendente (decisão C1 da auditoria). O CFO mostrará os dois totais, identificados.
4. **Arquivos ausentes ou atrasados:** exige um calendário de recebimento configurado, que não existe. Será exibido somente após a configuração.

## 2. Plano por fase e por arquivo

### Fase 1 — Fundação visual e navegação
- `web/src/components/Layout.tsx`: menu agrupado (Visão geral, Operação, Dados e carteira, Governança), com ícones e topo com contexto, busca de contrato/CPF e indicador de acesso. **Financeiro** e as novas páginas entram no menu somente quando implementadas (sem páginas vazias).
- `web/src/components/ui.tsx`: `PageHeader`, `StatusBadge` padronizado e `Icon`.
- `web/src/format.ts`: mapa único de estados, nas cores do documento (verde, vermelho, amarelo, cinza, azul), sempre com texto.
- `web/src/styles.css`: topo, cabeçalho fixo nas tabelas longas e responsividade.
- Páginas: títulos alinhados aos nomes do novo menu.

### Fase 2 — Dashboards por perfil
- `server/src/services/indicators.ts` (novo): catálogo único de indicadores, com nome, definição, origem, período, regra, quantidade e link para os registros.
- Endpoints `/api/visoes/backoffice|mis|gerencia|cfo` reutilizando os cálculos atuais.
- `web/src/pages/Visoes*.tsx`: quatro visões, uma esteira visual e alertas.

### Fase 3 — Operação
- Importação por etapas, resultado após a confirmação, esteira, histórico com filtros e pendências com idade, prioridade e ordenação.

### Fase 4 — Dados e Financeiro
- Dossiê do contrato em abas, com CPF mascarado.
- Carteira em abas.
- Visão executiva do CRM.
- Páginas Financeiro (Acordos, Pagamentos, Boletos, Quebras, Comissão, Reconhecimento) sobre endpoints de listagem que já existem ou são novos, só leitura.

### Fase 5 — Governança
- Perfis BackOffice, MIS, Gerência e CFO com permissões aplicadas na API.
- Login obrigatório em produção.
- Mascaramento de CPF por perfil.
- Auditoria de exportações e downloads (já existe) com filtros.

### Fase 6 — Homologação
- Regressão completa, testes de volume, validação dos indicadores com as cargas reais e conferência das exportações.

## Diretriz de nomenclatura (definida pelo usuário)
Nomes curtos e diretos, sem termos redundantes ("executivo", "central de", "consulta de", "e permissões"), e sem textos que explicam o óbvio sob os títulos. Critérios de cálculo ficam disponíveis sob demanda (ícone ⓘ). Menu: Painel; Operação (Importação, Histórico, Batimentos, Pendências); Dados (Contratos, Carteira, Conciliação CRM, Layouts); Governança (Auditoria, Usuários, Configurações).

## 3. Decisões necessárias
- **D1. Competência:** pode ser o mês da data de geração do arquivo, ou existe outra definição operacional?
- **D2. Login:** a Fase 5 tornará o login obrigatório em produção, como pede o documento. Confirmar.
- **D3. Perfis:** o que cada perfil (BackOffice, MIS, Gerência, CFO) pode **alterar**? Proposta: BackOffice importa, confirma e trata pendências; MIS executa batimentos e exporta; Gerência e CFO só consultam; Administrador faz tudo.
- **D4. Comissão (C1, pendente):** regra de contagem das linhas idênticas.
- **D5. Calendário de recebimento:** quais arquivos são esperados em quais dias, para os alertas de atraso.
