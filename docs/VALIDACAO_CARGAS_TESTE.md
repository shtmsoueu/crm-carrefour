# Validação com as cargas de teste

Execução: `npm run validate-loads -- <pasta com os arquivos de Cargas_teste.zip> --reset`
(importa cada arquivo, confirma os que podem ser confirmados, executa todos os batimentos e confere a integridade referencial).

> Os arquivos de carga contêm dados pessoais reais (nomes, CPFs, endereços) e **não fazem parte do repositório**. Este relatório traz apenas contagens agregadas.

## 1. Importação e interpretação

| Arquivo | Tipo identificado | Situação | Linhas | Registros | Válidos | Rejeitados | Linhas repetidas | Trailer |
|---|---|---|---:|---:|---:|---:|---:|---|
| REM_CONTRATOS_LEALCO_20261117_051318.txt | REM_CONTRATOS | Confirmado | 5.227 | 5.225 | 5.225 | 0 | 0 | confere (registros de dados) |
| RET_DISTRIBUICAO_LEALCO_17112026.txt | RET_DISTRIBUICAO | Confirmado | 6.117 | 6.115 | 6.115 | 0 | 0 | confere (inclui header/trailer) |
| RET_CARTEIRA_LEALCO_17112026.txt | RET_CARTEIRA | Confirmado | 69 | 67 | 67 | 0 | 0 | confere (inclui header/trailer) |
| REPASSE_LEALCO_17112026.txt | REPASSE | Confirmado | 427 | 425 | 425 | 0 | 0 | confere (inclui header/trailer) |
| REM_BOLETOS_LEALCO_20261117_051639.txt | REM_BOLETOS | Confirmado | 3.064 | 3.062 | 3.059 | 3 | 0 | **não confere** (trailer informa 2.315) |
| QUEBRA_ACORDO_LEALCO_20261117_053345.txt | QUEBRA_ACORDO | Confirmado | 242 | 242 | 242 | 0 | 0 | layout sem controle |
| ELEGIBILIDADE_LEALCO_20261117_053338.txt | ELEGIBILIDADE | Confirmado | 2.055 | 2.053 | 2.053 | 0 | 0 | layout sem controle (2 linhas em branco ignoradas) |
| CCAM_LEALCO_20261117_051523.txt | CCAM | Confirmado | 2 | 0 | 0 | 0 | 0 | confere (0) — **sem registros de dados** |
| ACORDO_ASSESSORIA_LEALCO_20261117_053059.txt | ACORDO_ASSESSORIA | Confirmado | 14.102 | 14.100 | 14.100 | 0 | 0 | confere (registros de dados) |
| 20261117_053402_comissao_LEALCO_out.txt | COMISSAO | Confirmado | 13.674 | 13.672 | 13.672 | 0 | 6.991 | confere (inclui header/trailer) |
| tb_campanha_rej_ext_LEALCO_20261117_034554.txt | REJ_CAMPANHA_EXT | **Vazio** | 0 | 0 | 0 | 0 | 0 | — |
| tb_campanha_rej_int_LEALCO_20261117_034551.txt | REJ_CAMPANHA_INT | **Vazio** | 0 | 0 | 0 | 0 | 0 | — |

Os dois arquivos de rejeição vazios ficam com situação **VAZIO** e **não podem ser confirmados**: não são tratados como processamento concluído com dados. Eles não geram pendência, porque a ausência de ocorrências no dia é uma condição normal. Como todo arquivo de 0 byte tem o mesmo SHA-256, a duplicidade de arquivos vazios é controlada pelo nome + tipo (sem isso, o segundo seria bloqueado indevidamente).

### Registros rejeitados (violações reais do layout)

| Arquivo | Qtde | Motivo |
|---|---:|---|
| REM_BOLETOS (registro tipo 1) | 3 | `DMZIP` é numérico (N 8) e veio com hífen (ex.: `NNNNN-NN`). |

Cada um vira pendência **"Outros erros de layout"** com linha, campo e motivo. O `AHCOLLID` do REPASSE, embora marcado como obrigatório no layout, é tratado como informação complementar: os 4 pagamentos sem esse campo são aceitos.

### Alertas (registro aceito)

- Valores numéricos com sinal negativo (`-0000000055`) em campos N, sem previsão de sinal no layout: 1 em REM_CONTRATOS, 1 em REM_BOLETOS e 2 em REPASSE. O valor é aceito como negativo e a linha é sinalizada. A alternativa seria descartar o registro financeiro.

## 2. Divergências entre layout e arquivo real

Todas estão no dicionário técnico (`docs/DICIONARIO_TECNICO.md`) e na tela *Dicionário de layouts*.

| Layout | Divergência | Tratamento |
|---|---|---|
| RET_CARTEIRA | `U?MOTBXA` indicado em 38-57, sobrepondo `DMSSNUM` (27-51) | Aplicado 52-71 (TAM=20 preservado), coerente com a linha real de 71 posições |
| REPASSE | Layout define header/trailer `0`/`9` (134 pos.); o arquivo real usa o template Cyber `H`/`T` (100 pos.) | As duas variantes são aceitas; a usada fica registrada como alerta |
| REM_BOLETOS / CCAM | Header com `SEQ-REG` em 22-29, sobreposto ao FILLER | Aplicado 399-406 / 373-380, como no trailer e nos registros |
| COMISSAO | Header com INI/FIM incompatíveis com TAM; data do trailer em AAAAMMDD (layout diz ddmmaaaa) | Posições sequenciais pelo TAM; data aceita com alerta |
| COMISSAO | `Status do Contrato` "conforme tabela": a tabela não foi fornecida e os valores reais são `A`/`R` | Exibido sem tradução |
| COMISSAO | `Remuneração Devida` sem casas decimais definidas | Armazenado o valor bruto |
| RET_DISTRIBUICAO | Nome com data em DDMMAAAA (De-Para/layout: AAAAMMDD) | Interpretação tolerante, com alerta |
| Trailers Cyber | A quantidade às vezes conta só os registros de dados (REM_CONTRATOS, ACORDO) e às vezes o total de linhas (RET_*, REPASSE, COMISSÃO) | As duas interpretações são aceitas e registradas; qualquer outro valor vira pendência |
| ELEGIBILIDADE | O De-Para fala em "contratos elegíveis", mas o layout **não tem contrato nem CPF** (é um catálogo de tipos de acordo) | Batimento por tipo de acordo + vigência; elegibilidade por contrato marcada como *requer configuração* |
| Rejeição de campanha | Sem layout ("somente o contrato e o motivo") | Linhas armazenadas na íntegra; extração configurável em *Configurações* |
| CY_IE003 / Rajada PIX | Citados no De-Para, layout ausente no pacote | Identificados pelo nome, original armazenado, status *Sem layout oficial* |

## 3. Batimentos

| Fluxo | Resultado |
|---|---|
| A. Distribuição | 5.225 contratos distribuídos (ativos); 6.182 retirados sem remessa no histórico (informativo, porque REM_CONTRATOS é incremental). **Aguardando BAT_CONTRATOS** para o reconhecimento pelo banco. |
| B. Acordos | 1.183 acordos (14.100 linhas de parcela) consolidados. **Aguardando BAT_ACORDO**: nenhum reconhecimento é simulado. |
| C. Pagamentos | 425 pagamentos válidos: 139 conciliados com o acordo pelo AHID e 286 sem acordo (4 deles sem ID de acordo) nos ACORDO_ASSESSORIA importados (pendência *Pagamento não identificado*). 171 acordos com parcela vencida no período dos repasses e sem pagamento (informativo). **Aguardando BAT_ACORDO_PGTO**. |
| D. Boletos | 766 parcelas: 534 conferem com o acordo (AHID + vencimento + valor); 232 de acordos não localizados (*Acordo não reconhecido*). |
| E. Quebra | 241 acordos quebrados (242 linhas, um AHID repetido) com status atualizado para QUEBRADO. Nenhum está nos ACORDO_ASSESSORIA da carga, então todos ficam como *Acordo não reconhecido*. |
| F. Elegibilidade | Os 227 tipos de acordo usados nos 1.183 acordos existem no catálogo e estão vigentes na data do acordo. A elegibilidade por contrato requer regra (layout sem contrato). |
| G. Comissão | 6.991 linhas idênticas a outra linha do arquivo, sempre em múltiplos pares (2, 4, 6…). Viram *Duplicidade* com ressalva, porque o layout não tem número de parcela (Prestação = `000` em 100% das linhas) e o repasse mostra pagamentos legítimos de mesmo valor no mesmo dia. 133 contratos têm acordo. As datas de recebimento (05–11/11) não se sobrepõem às do repasse (16–17/11), então quase todos são informativos. |
| H. Campanhas | CCAM sem registros e rejeições vazias: registrados, sem resultado simulado. |

Tempo total dos 8 batimentos sobre ~45 mil registros: cerca de 5 s.

## 4. Integridade

- 0 registros de contrato sem vínculo (FK) com `contracts` e 0 registros de acordo sem vínculo com `agreements`.
- Reprocessar o REM_BOLETOS real manteve 44.961 registros e 7.922 pendências: nada foi duplicado.
- Reimportar um arquivo idêntico é bloqueado (SHA-256), assim como um arquivo com o mesmo tipo + data de geração + sequência do header.

## 5. Arquivos sem carga de teste

BAT_CONTRATOS, BAT_ACORDO e BAT_ACORDO_PGTO têm importador e regras de batimento prontos e cobertos por teste automatizado com arquivos sintéticos (`server/test/api.integration.test.ts`). Os resultados deles só aparecem quando os arquivos oficiais forem importados.
