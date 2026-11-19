# Backlog — CRM de Cobrança ARC4

Ordem de execução definida pela operação: acesso e perfis → governança e histórico das cargas → comparação entre cargas e movimentações → telas de consulta e gestão.

Cada fase só começa quando os critérios da anterior passam. Números de referência: `docs/aceite_carga_20261119.json`.

---

## Fase 0 — Fundação do repositório

- [x] **F0.1 Estrutura do monorepo.** _(em `arc4/`, D-001)_ Pastas `api/`, `importador/`, `web/`, `db/migrations/`, `docs/`, `dados/` (no `.gitignore`).
  - Aceite: `git status` limpo depois de copiar os ZIPs para `dados/`.
- [x] **F0.2 Docker Compose** com PostgreSQL 16, API e web.
  - Aceite: `docker compose up` sobe os três; a API responde `GET /health`.
- [x] **F0.3 Migrations base** a partir de `docs/modelo/schema_postgresql.sql`, com ferramenta de migração (Alembic ou equivalente).
  - Aceite: `make migrate` cria todos os esquemas num banco vazio e é reaplicável sem erro.
- [x] **F0.4 Gerador de fixtures sintéticas**: 27 ZIPs pequenos no mesmo layout, com casos de borda (cabeçalho com espaço, data DDMMAAAA no PAGAMENTO, contrato em duas EPS, telefone bloqueado, acordo com `acordo_ativo = N`, AVALISTAS vazio).
  - Aceite: testes rodam sem os arquivos reais.
- [x] **F0.5 CI** rodando lint e testes a cada push. _(`.github/workflows/arc4.yml`: Python, web e Compose)_

> Fase 0 verificada em 2026-11-19: `docker compose up` sobe os três serviços, `/health` responde 200, `make migrate` roda duas vezes sem erro num banco vazio, 57 testes Python e 5 do frontend passam sem arquivos reais. Pendência herdada para a Fase 2: completar o dicionário de colunas com os cabeçalhos reais (D-004).

## Fase 1 — Acesso, usuários e perfis

- [ ] **F1.1 Autenticação individual**: login com usuário/e-mail e senha (argon2id), MFA (TOTP), sessão com expiração por inatividade, logout.
  - Aceite: 5 senhas erradas bloqueiam a conta temporariamente; cada tentativa gera evento em `seguranca.evento`.
- [ ] **F1.2 Recuperação de senha** por link de uso único com validade.
  - Aceite: o link expira e não funciona duas vezes; o administrador nunca vê nem define a senha.
- [ ] **F1.3 Cadastro e ciclo de usuários**: criar, editar, ativar, bloquear, desativar; status "aguardando primeiro acesso"; carteiras visíveis por usuário.
  - Aceite: conta desativada não entra e não é apagada (a autoria dos registros continua).
- [ ] **F1.4 Perfis e permissões por módulo e ação** com os 7 perfis (Operação, Supervisão, Gerência, MIS/BackOffice, Importador, Aprovador, Administrador) e a matriz inicial da proposta.
  - Aceite: cada endpoint checa a permissão no backend; teste automatizado para cada perfil × módulo.
- [ ] **F1.5 Auditoria de segurança** (login, logout, falhas, bloqueios, usuários, perfis, permissões) com tela de consulta e exportação.
  - Aceite: toda ação de F1.1–F1.4 aparece na auditoria com usuário, data/hora, ação e objeto.
- [ ] **F1.6 Telas**: Login e Administração (Usuários, Perfis e permissões, Auditoria), seguindo `Login.dc.html` e `Usuarios.dc.html`.

## Fase 2 — Importação, governança e histórico das cargas

- [ ] **F2.1 Recebimento**: upload dos ZIPs (em partes), identificação de tipo/EPS/data pelo nome, SHA-256, tamanho, horário e responsável; arquivo original guardado em armazenamento de objetos.
  - Aceite: reenviar o mesmo arquivo é bloqueado pelo hash; nome fora do padrão é ignorado com motivo.
- [ ] **F2.2 Validação de estrutura** por dicionário de colunas com apelidos.
  - Aceite: os 27 arquivos de 19/11 passam; uma coluna obrigatória removida rejeita o arquivo.
- [ ] **F2.3 Normalização**: datas por coluna (MMDDAAAA, DDMMAAAA, DD/MM/AAAA), decimais, documentos, telefones; staging em `bruto`.
  - Aceite: registros lidos por arquivo batem com `arquivos[*].registros` do aceite (ex.: REMESSA_ARC4U_0140 = 660.367).
- [ ] **F2.4 Conciliação entre arquivos**: parcelas × remessa, telefones × bloqueio, acordos × contratos, retiradas × histórico.
  - Aceite: 0 parcelas e 0 telefones órfãos; 177 telefones em bloqueio (156/6/15); 24.778 acordos com `acordo_ativo = N`; 1.704 curvas divergentes acima de R$ 1 (1.683/7/14); 18.858 retiradas, nenhuma na remessa do dia.
- [ ] **F2.5 Simulação** em cópia da base com relatório: arquivos esperados/recebidos/ausentes/excedentes, estruturas válidas/inválidas, registros lidos/inseridos/atualizados/rejeitados, duplicidades, inconsistências e impacto em contratos e saldo por EPS, instituição e produto.
  - Aceite: a base publicada não muda durante a simulação; o relatório é gravado em `canonico.simulacao`.
- [ ] **F2.6 Aprovação independente e publicação atômica**.
  - Aceite: o mesmo usuário não consegue aprovar o que enviou (teste na API e constraint no banco); falha no meio da publicação mantém a versão anterior.
- [ ] **F2.7 Histórico, restauração e reprocessamento**: todas as cargas com etapas, responsáveis e horários; restaurar versão anterior com motivo; registrar falhas e reprocessamentos.
  - Aceite: restaurar 18/11 e depois republicar 19/11 deixa a base idêntica à publicação original.
- [ ] **F2.8 Modelo canônico versionado** (SCD tipo 2 em `contrato_posicao` e `parcela`), devedor por documento, marcação por EPS, contatos com múltiplas fontes.
  - Aceite (19/11): 836.683 contratos únicos; 847.061 posições; 657.021 CPFs/CNPJs; saldo por posição R$ 5.680.788.957,57; saldo único R$ 5.608.952.396,19; 10.378 coincidentes (10.353 em 0140+0900, 25 em 0144+0900); 253.317 telefones duplicados unificados.
- [ ] **F2.9 Dicionários de domínio**: regras de instituição (15) e de produto (sugestões por código), com proposta, aprovação por outro usuário, prioridade, vigência e histórico; visão de não mapeados.
  - Aceite: posições por instituição batem com `instituicoes` do aceite; "NPL Consumer" (7.522) e "EMPACOTAMENTO DESENROLA 2.0 ARC" (14) aparecem como não mapeados.
- [ ] **F2.10 Tela de Importação** e aba Domínios, seguindo `Importacao.dc.html` e `Usuarios.dc.html`.

## Fase 3 — Comparação entre cargas e movimentações

- [ ] **F3.1 Motor de comparação** entre duas cargas por `contrato_original`, gravando em `canonico.movimentacao`: entrada, saída, ausente em análise, transferência entre EPS, passou/deixou de ser coincidente, reclassificação de grupo, alteração de saldo.
  - Aceite: testes com fixtures cobrindo cada tipo; transferência não altera entradas/saídas do consolidado; ausência sem RETIRADA não vira saída.
- [ ] **F3.2 Regra de confirmação de saída** configurável (proposta: RETIRADA ou confirmação do MIS após N cargas).
- [ ] **F3.3 API de batimento**: indicadores entre cargas A e B por consolidado, EPS, instituição, produto e grupo, com lista paginada dos contratos de cada indicador.
- [ ] **F3.4 Exportação rastreável**: CSV com filtros ativos, data/hora, usuário e origem no cabeçalho; evento de auditoria; respeita permissão.
- [ ] **F3.5 Tela Movimentações** e aba Batimento, seguindo `Movimentacoes.dc.html` e `Carteira.dc.html`.
  - Aceite: com duas cargas reais importadas, cada indicador abre a lista de contratos que o compõe, e a soma da lista bate com o indicador.

## Fase 4 — Consulta 360º

- [ ] **F4.1 Busca** por CPF/CNPJ, contrato, telefone ou nome (`pg_trgm`).
- [ ] **F4.2 Ficha do devedor**: dados com original/tratado/operacional, contratos com instituição, produto, EPS, grupo, saldo, atraso, acordo (entrada, pagas, em atraso, futuras só quando vierem na fonte), linha do tempo.
- [ ] **F4.3 Ajuste operacional** no lugar, com motivo, sem sobrescrever o original; conflito quando o banco muda o campo depois.
- [ ] **F4.4 Telefones**: válido, terceiro, bloqueado pelo banco, inválido; copiar ao clicar com confirmação; marcações operacionais sem alterar o número recebido.
- [ ] **F4.5 Registro de acionamento**: operador pelo login, data/hora, telefone, tipo, resultado, observações, retorno/próximo passo; na linha do tempo como registro operacional; nunca apaga registros anteriores.
- [ ] **F4.6 Tela**, seguindo `Main.dc.html`.
  - Aceite: nenhum botão de SMS ou negociação; CPF completo só com log de acesso.

## Fase 5 — Carteira e eficiência

- [ ] **F5.1 Carteira por instituição** (tela inicial): contratos, saldo, saldo médio, participação, variação, entradas/saídas/líquido; consolidado ou por EPS; ordenação; destaque de maior participação e variação.
  - Aceite (19/11): PAN R$ 1.463,5 mi (25,8%), ITAU R$ 1.270,1 mi (22,4%), NEON R$ 746,7 mi (13,1%).
- [ ] **F5.2 Detalhe da instituição** → produtos → produto (estoque, EPS, grupo, faixa de atraso, evolução, movimentação) → contratos, com caminho e retorno preservando filtros.
- [ ] **F5.3 Eficiência financeira** (acordado e pago separados) e **operacional** (a partir dos acionamentos registrados).
  - Aceite: pago em novembro até 18/11 = 7.080 pagamentos, R$ 1.220.155,77.
- [ ] **F5.4 Comparação de eficiência** com colunas de perfil ao lado de cada taxa.
- [ ] **F5.5 Dicionário de indicadores** acessível por tooltip em todos os indicadores.
- [ ] **F5.6 Esquema `analitico`** em estrela para o Power BI.

## Fase 6 — Transição

- [ ] **F6.1 Migração do histórico do CRM atual** como lote "legado", com origem identificada.
- [ ] **F6.2 Operação paralela** e comparação de números com o CRM atual por 10 cargas seguidas.
- [ ] **F6.3 Desligamento** das telas antigas.
