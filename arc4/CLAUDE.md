# CRM de Cobrança ARC4 — instruções para o Claude Code

Plataforma de consulta, análise e rastreabilidade da carteira ARC4. Recebe 27 arquivos diários do banco (9 tipos × 3 EPS), versiona cada carga e oferece Consulta 360º, Carteira por instituição/produto, Movimentações, Batimento entre cargas, Importação com dupla aprovação e Administração.

O projeto vive em `arc4/` dentro do repositório `crm-carrefour`, isolado do CRM Carrefour da raiz (`docs/DECISOES.md`, D-001). Rode todos os comandos a partir de `arc4/` e não altere arquivos fora desta pasta, exceto `.github/workflows/arc4.yml`.

A plataforma **não** envia SMS, **não** dispara mensagens e **não** negocia dívidas. Não crie integrações para isso.

## Documentos de referência (leia antes de mudar comportamento)

- `docs/proposta/Proposta_Remodelagem_CRM_ARC4.md`: especificação completa (regras, perfis, indicadores, fluxo de importação).
- `docs/BACKLOG.md`: fases, tarefas e critérios de aceite. Trabalhe uma fase por vez, na ordem.
- `docs/aceite_carga_20261119.json`: números reais da carga de 19/11/2026. São o teste de aceitação do importador e dos indicadores.
- `docs/modelo/schema_postgresql.sql`: esquema proposto. Ponto de partida para as migrations, não verdade absoluta.
- `docs/prototipo/*.dc.html`: protótipo das telas (formato de canvas). Use como referência de layout e interação. **Não copie esse código**: reconstrua no frontend do projeto.
- `docs/diagnostico/scripts/*.py`: scripts que leem os ZIPs. Reaproveite a lógica de leitura no importador.

## Stack (adotada na Fase 0 — confirme com o time antes da Fase 1; D-002)

| Camada | Escolha | Observação |
| --- | --- | --- |
| Banco | PostgreSQL 16 | Esquemas `bruto`, `canonico`, `operacao`, `seguranca`, `analitico` |
| Importador | Python 3.12 + Polars ou DuckDB | Lê ZIP em streaming; grava com `COPY` |
| API | Python + FastAPI | Mesma linguagem do importador; regras de permissão no backend |
| Frontend | React + TypeScript + Vite, TanStack Query/Table | Identidade visual BTG Pactual (abaixo) |
| Testes | pytest (backend), Vitest + Testing Library (frontend), Playwright (fluxos) | |
| Ambiente local | Docker Compose (postgres + api + web) | |
| Ferramentas | uv (workspace), Alembic com SQL puro, ruff, ESLint + tsc | D-003 |

Se o time escolher outra stack, atualize esta seção antes de escrever código.

## Comandos

Rode a partir de `arc4/`. Mantenha esta lista atualizada (`make help` lista todos).

```bash
make setup                        # uv sync + npm ci
docker compose up -d db           # banco local (ou: make db)
make up                           # postgres + api (:8000) + web (:8080)
make migrate                      # aplica migrations (reaplicável)
make test                         # pytest + vitest (banco temporário via TEST_DATABASE_URL)
make lint                         # ruff + eslint + tsc
make dev                          # api (reload) + vite em modo desenvolvimento
make fixtures                     # 27 ZIPs sintéticos em importador/tests/.fixtures/
make import DATA=./dados/20261119 # importa uma carga local (Fase 2: ainda não implementado)
```

Onde fica cada coisa:

- Dicionário de colunas (fonte única): `importador/src/arc4_importador/layout.py`, parcial até termos os cabeçalhos reais (D-004).
- Gerador de fixtures: `importador/src/arc4_importador/fixtures.py`. Novos casos de borda entram aqui e no `manifesto.json`.
- Migrations: `db/migrations/versions/` + SQL em `db/migrations/sql/`. Nunca edite uma migration já aplicada: crie outra.

## Dados sensíveis — regras obrigatórias

- Os ZIPs do banco contêm CPF, nome, endereço, telefone, e-mail e dados bancários. **Nunca** versionar: ficam em `./dados/` (no `.gitignore`) ou em armazenamento fora do repositório.
- Testes automatizados usam fixtures sintéticas geradas por script. Os números de `aceite_carga_20261119.json` são agregados e podem ser versionados.
- Não imprimir linhas de dados reais em logs, mensagens de commit, PRs ou saídas de teste.
- CPF, telefone, e-mail, conta, chassi e placa aparecem mascarados nas listas; abrir o dado completo gera log de acesso.

## Regras de negócio que não podem ser quebradas

1. Chave estável do contrato: `contrato_original`. O campo `contrato` muda com renegociação (`-RENnn`).
2. Contrato único ≠ posição por EPS. Exibir os dois e dizer qual é qual.
3. Instituição (de `nome_estrategia`) e produto (de `produto_legado`) são classificações separadas, por dicionários de domínio. Sem regra aprovada: "Não mapeado". Nunca presumir categoria.
4. Dado original do banco nunca é sobrescrito. Guardar original, tratado e operacional (com autor, data, justificativa).
5. Transferência entre EPS não é entrada nem saída no consolidado.
6. Ausência numa remessa não é saída. Saída efetiva exige RETIRADA (ou a regra de confirmação definida).
7. Acordo/promessa não é pagamento. Saída de estoque não é perda financeira.
8. Nenhuma carga é publicada sem simulação e aprovação de outro usuário. Quem envia não aprova (garantir no banco e na API, não só na tela).
9. A publicação é atômica; a versão anterior fica guardada e pode ser restaurada.
10. Todo indicador tem definição, regra, período e origem (exibidos em tooltip).
11. `grupo_arc4u` (ranking oficial) e EPS vêm do banco e não são editáveis.
12. As carteiras aparecem sempre como `0140 · CLEAN`, `0144 · CAÍDOS`, `0900 · DESAFIANTE`.

## Particularidades dos arquivos (já confirmadas)

- CSV dentro de ZIP, separador `;`, codificação Latin-1, nome `AAAAMMDD_TIPO_EPS_OUT.zip`.
- Datas: `MMDDAAAA` em REMESSA, PARCELAS, RETIRADA, GARANTIAS e nascimento; **`DDMMAAAA` em PAGAMENTO**; `DD/MM/AAAA` em `ACORDO_ATUAL.vencimento_parcela_atual`. Converter por coluna, com base no dicionário — nunca adivinhar pelo valor.
- Cabeçalhos irregulares: `numero_parcelas _atraso` (espaço) e `CamecDate | data_camec`. Mapear por dicionário com apelidos.
- `TELEFONES_BLOQUEADOS` é idêntico nas 3 EPS e usa `*` no contrato: é lista global.
- `acordo_ativo` vem `N` em 100% das linhas: derivar de ACORDO_ATUAL.
- `segmentacao_do_contrato` vem `ERROR_LEVEL_…` em 100%: ignorar.
- AVALISTAS vem só com cabeçalho; a estrutura precisa existir mesmo assim.
- PAGAMENTO vem acumulado desde 2021: importar de forma idempotente.

## Identidade visual

Guia: https://brandcenter.btgpactual.com/guia-visual

- Paleta (escura → clara): `#05132A` `#0B2859` `#10408D` `#195AB4` `#307AE0` `#549CFF` `#6BAAFF` `#87BAFF` `#B1D2FF` `#D2E5FF` `#FFFFFF`.
- Uso: barra e texto principal `#05132A`; botão primário e links `#195AB4` (hover `#10408D`); foco `#307AE0`; seleção `#D2E5FF`. Alerta âmbar e erro vermelho só em estados críticos, sempre com texto.
- Fonte: BTG Pactual Sans é proprietária. Sem licença, usar Figtree e isolar a família numa variável CSS para a troca.
- Ícones de traço aberto, sem preenchimento; visual flat, sem sombras nem 3D. Não usar o logotipo da BTG Pactual.
- Textos explicativos longos vão em tooltip/popover. Telas iniciais com indicadores e listas resumidas; tabelas só no detalhamento.
- Acessibilidade AA: contraste 4.5:1, navegação por teclado, `aria-label` em botões só com ícone.

## Como trabalhar

- Uma fase do `docs/BACKLOG.md` por vez. Antes de codar, leia a fase e proponha o plano.
- Testes primeiro para regras de negócio e para o importador.
- A cada tarefa: rodar testes, verificar o critério de aceite e atualizar o checkbox no backlog.
- Mudou uma regra ou decisão? Registre em `docs/DECISOES.md` (data, decisão, motivo).
- Commits pequenos, em português, no imperativo ("Adiciona regra de retirada").

## Decisões em aberto (perguntar antes de assumir)

- EPS prevalecente quando um contrato vem em duas remessas (hoje 10.353 contratos em 0140 e 0900).
- Significado de `motivo_retirada` 1 e 2 e de `status_parcela = PA`.
- Se "NPL Consumer" (7.522 contratos) é BTG.
- Regra de confirmação de saída para contrato ausente (proposta: RETIRADA ou confirmação do MIS após 3 cargas).
- Login próprio ou SSO corporativo; prazo de retenção dos arquivos originais.
