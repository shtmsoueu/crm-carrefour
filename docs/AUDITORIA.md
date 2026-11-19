# Auditoria técnica, funcional e de integridade

Data: 19/11/2026. Base: cargas de teste reais (12 arquivos, 45 mil registros) + simulação de 30 dias acumulados (454 mil registros).

## Método
- **Leitura independente:** script Python à parte lê os arquivos brutos com as posições da planilha oficial, sem usar o código do sistema. Os totais foram confrontados com o banco, a API e as exportações.
- **Testes independentes** (`server/test/auditoria.integration.test.ts`):
  - os arquivos são montados por um formatador próprio, com posições transcritas da planilha (não usa `definitions.ts`);
  - os valores esperados são constantes calculadas à mão;
  - os totais são conferidos por três caminhos: banco, API e CSV exportado.
- **Escala:** 30 fotografias diárias do ACORDO_ASSESSORIA acumuladas num banco separado.

## Comprovações (independente x sistema)
| Indicador | Arquivos brutos | Sistema |
|---|---|---|
| Comissão: linhas / valor (todas as linhas) | 13.672 / R$ 2.707.663,02 | 13.672 / R$ 2.707.663,02 |
| Comissão: linhas distintas / valor | 6.681 / R$ 1.336.503,48 | 6.681 / R$ 1.336.503,48 |
| REPASSE: linhas / valor | 425 / R$ 98.406,47 | 425 / R$ 98.406,47 |
| ACORDO: acordos / valor negociado | 1.183 / R$ 2.253.433,62 | 1.183 / R$ 2.253.433,62 |
| Pilar 1: acordos distintos (todos os arquivos) | 1.688 | 1.688 |
| Pilar 1: acordos com mais de um contrato | 1 | 1 |
| Pilar 2: contratos distintos / com CPF | 19.316 / 19.119 | 19.316 / 19.119 |
| Pilar 2: contratos com CPF divergente entre arquivos | 0 | 0 |
| Pilar 3: CPF/CNPJ distintos / com mais de um contrato | 19.042 / 77 | 19.042 / 77 |
| Fechamento pilar 3: contratos com CPF + sem CPF = contratos | 19.119 + 197 = 19.316 | ok |
| 30 dias acumulados: acordos, valores, contratos, clientes, comissão | inalterados | inalterados |

## Achados

### CRÍTICO
**C1. Comissão: o arquivo traz linhas idênticas, e o sistema aplicava duas regras de contagem diferentes.** *Decisão pendente.*
- **Evidência:**
  - 13.672 linhas, sendo 6.681 distintas.
  - **Todas** as repetições ocorrem em quantidade par (2×, 4×, 6×, 10×, 18×, 58×). Os pares estão a ~5.500–7.300 linhas de distância, indicando que cada registro foi emitido duas vezes pelo banco.
  - O campo "Prestação em Atraso" é `000` em 100% das linhas, então não há como distinguir parcelas.
- **Impacto:** a Carteira somava R$ 2.707.663,02 (todas as linhas). O batimento G confrontava apenas as linhas distintas (R$ 1.336.503,48). Se o arquivo estiver duplicado, a remuneração real seria **metade do total, R$ 1.353.831,51**. Esse valor é diferente do de linhas distintas, porque a deduplicação também elimina as multiplicidades legítimas (os casos 4×, 6×…).
- **Correção aplicada (sem mudar regra):** carteira, painel, conciliação com o CRM e exportações exibem lado a lado o total de todas as linhas e o de linhas distintas. A duplicidade continua como pendência, com o número de ocorrências.

**C2. Sistema sem login em endereço público, com CPF, valores e remuneração.** Desativação decidida pelo usuário. Para reativar, defina `AUTH_ENABLED=true` antes de usar dados reais.

### ALTO
| # | Achado | Onde | Evidência | Correção |
|---|---|---|---|---|
| A1 | **Registro de quebra perdido em silêncio** quando o mesmo AHID vem com dois contratos | `flows.ts` (E) — mapa por AHID sobrescrevia | AHID 22549386, linhas 185 e 186: 242 registros, 241 resultados | Processa cada (AHID, contrato): 242/242 |
| A2 | Associação AHID→contrato e contrato→CPF sem verificação entre arquivos (o cadastro usa o primeiro valor visto) | `imports/service.ts` (linkDomain) | 1 AHID com 2 contratos não era apontado | Novo batimento **I. Integridade das chaves** (pilares 1, 2 e 3) com pendência de divergência cadastral |
| A3 | Registros sem a contraparte importada não tinham resultado individual (sumiam da análise) | `flows.ts` (C, D, E) | QUEBRA sem ACORDO: 0 resultados | Resultado "aguardando arquivo" por registro |
| A4 | Carteira levava 7,6 s (risco de estourar os 60 s da Vercel com o acúmulo diário) | `portfolio.ts` (CTE materializado; planejador estimava 2 linhas e repetia a varredura 1.183×) | `EXPLAIN ANALYZE` | `NOT MATERIALIZED`: **0,22 s**, resultado idêntico (mesmo SHA-256) |
| A5 | REPASSE: linhas idênticas no **mesmo** arquivo eram unificadas no total sem pendência | `flows.ts` (C) | Código (0 ocorrências na carga) | Pendência de duplicidade + painel mostra linhas e valor desconsiderados |
| A6 | CRM: linhas sem chave ficavam fora da lista de itens; "conforme" sem nenhum campo comparado não era explicitado; só havia a visão contrato | `crm/service.ts` | Código | Linhas sem chave listadas; motivo explícito; conciliação pelos **três pilares** (acordo, contrato, CPF) |

### MÉDIO
| # | Achado | Situação |
|---|---|---|
| M1 | Dois envios simultâneos do mesmo arquivo geravam erro 500 (sem corrupção: o índice único protegia) | Corrigido: trava + 409 |
| M2 | Painel não mostrava clientes únicos (visão unique) | Corrigido |
| M3 | Totais de comissão somados em ponto flutuante | Corrigido: soma em centavos |
| M4 | O KPI "Retirados" conta todo contrato com retirada, inclusive se foi redistribuído depois | **Decisão:** manter ou contar só a situação atual (RETIRADO) |
| M5 | BOLETOS/CCAM guardam o AHID com 8 posições; o maior AHID hoje é 22.906.449. Acima de 99.999.999 o campo não comporta | Monitorar; limite do layout do banco |
| M6 | CPF/CNPJ comparado sem zeros à esquerda: risco teórico de um CNPJ coincidir com um CPF | Hoje 100% pessoa física; sem mudança |
| M7 | Contratos com 11, 15 e 19 posições | Verificado que as chaves longas não contêm chaves curtas conhecidas; tratadas como identificadores distintos, sem equivalência presumida |
| M8 | Vercel limita cada envio a 4,5 MB; CSV é compactado no navegador, XLSX não | Exportar o CRM em CSV |

### BAIXO
- O fluxo de campanhas depende da configuração do formato das rejeições.
- Prioridade da origem quando os arquivos divergem: REPASSE > ACORDO > BAT. Hoje não há divergência: 139/139 acordos concordam.

## Escala (30 dias acumulados, 454 mil registros)
| Etapa | Tempo | Memória |
|---|---|---|
| Carteira | 3,2 s | 38 MB |
| 9 batimentos | 6,5 s (total) | 83 MB |
| Painel | 2,7 s | — |

Acordos (1.183), valores e contagens permanecem idênticos ao de um dia: as fotografias diárias não multiplicam valores.

## Decisões necessárias
1. **Comissão (C1):** qual valor é a referência da remuneração?
   - (a) todas as linhas: R$ 2.707.663,02;
   - (b) linhas distintas: R$ 1.336.503,48;
   - (c) arquivo considerado duplicado: metade, R$ 1.353.831,51.
   
   Recomendação: confirmar com o banco se o arquivo é gerado em duplicidade antes de definir.
2. **Login (C2)** antes de usar dados reais.
3. **KPI Retirados (M4):** histórico de retiradas ou situação atual.
4. **Acordo com dois contratos (A2):** qual contrato vale como titular do acordo quando os arquivos divergem. Hoje vale o primeiro registro e a divergência fica sinalizada.
5. Regras pendentes anteriores: saldo exatamente 1.500, G1 – MENOR MIL, G1 com 0–60 dias.
