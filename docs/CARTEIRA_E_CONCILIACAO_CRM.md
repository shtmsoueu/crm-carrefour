# Carteira classificada e conciliação com o CRM externo

## Objetivo
Confrontar 100% das contas da **base original** (arquivos do banco já importados) com a **exportação do CRM oficial**, classificar cada conta como **CONFORME**, **NÃO IMPORTADO** ou **DIVERGENTE** e mostrar, para cada divergência, o registro, o campo, o valor da base e o valor do CRM.

A conciliação é **somente leitura**:
- a exportação do CRM é guardada (original compactado + linhas) e nunca alterada;
- nada é gravado no CRM oficial;
- os arquivos do banco e os registros importados não são modificados.

## Como usar
1. **Conciliação com o CRM → Carregar exportação do CRM:** CSV (recomendado) ou XLSX, com cabeçalho na primeira linha. O delimitador (`;` `,` tab `|`) e o encoding (UTF-8 ou ISO-8859-1) são detectados automaticamente.
2. **Mapeamento:** escolha a coluna do CRM com o número do contrato (chave) e, para cada campo a confrontar, a coluna do CRM e o campo da base original. Equivalências de valores (ex.: `Assessoria = LEALCO`) traduzem o vocabulário do CRM. O mapeamento fica salvo e é registrado em cada execução.
3. **Executar conciliação:** escolha o escopo (carteira ativa, contas com cadastro ou todas). O resultado traz:
   - contadores por situação;
   - inconsistências por campo, incluindo registros duplicados no CRM;
   - visão da comissão;
   - lista detalhada, exportável em Excel/CSV com uma linha por campo divergente.

| Situação | Significado |
|---|---|
| CONFORME | Conta encontrada no CRM e todos os campos mapeados conferem. |
| NÃO IMPORTADO | Conta da base original sem linha correspondente no CRM. |
| DIVERGENTE | Conta encontrada, mas com campo divergente ou duplicada no CRM (todas as linhas duplicadas são confrontadas). |
| NÃO CONSTA NA BASE | *Sinalização extra, fora das três situações pedidas:* linha do CRM sem conta correspondente no escopo da base. Distingue "fora do escopo" (ex.: conta retirada) de "não existe em nenhum arquivo importado". |

Teste de volume com as 5.225 contas ativas reais e uma exportação simulada com alterações propositais: 100% das alterações detectadas, em 0,16 s de processamento.

## Princípio de operação diária
As regras são permanentes; o conteúdo das cargas varia a cada dia.
- **Ausência não bloqueia.** Um produto, faixa, ranking, arquivo ou coluna ausente no dia não gera alerta nem pendência e não interrompe nada: a categoria aparece com **zero** e o processamento segue.
- **Inconsistência é sinalizada.** Só geram alerta os dados que existem e contrariam ou não se enquadram nas regras (ver tabela abaixo). A lista de alertas mostra apenas o que ocorreu no escopo.
- **Informação complementar é usada quando disponível.** Exemplo: a origem (AHCOLLID). Cada arquivo é interpretado pelo próprio layout, sem dependência obrigatória entre arquivos.
- **Arquivo vazio** (ex.: rejeição de campanha sem ocorrências) fica registrado com a situação VAZIO, sem pendência. Ele não é contado como processamento concluído com dados.

## Regras de negócio implementadas

### 1. Origem do acordo (informação complementar)
- `AHCOLLID = LEALCO` → **ASSESSORIA (DIRETO)**; qualquer outro identificador preenchido → **INDIRETO**. A comparação ignora espaços e maiúsculas/minúsculas.
- O AHCOLLID é procurado, **pela chave AHID**, em todo arquivo que tenha a coluna. Prioridade: REPASSE ("Gestor que capturou o acordo"), ACORDO_ASSESSORIA, BAT_ACORDO, BAT_ACORDO_PGTO.
- A origem da conta é a do seu acordo mais recente. Se a conta não tem acordo no ACORDO_ASSESSORIA, vale o acordo do último pagamento.
- **Sem AHCOLLID disponível** (conta sem acordo, ou arquivo sem a coluna): a origem fica vazia ("sem acordo identificado"), **sem alerta**, e as demais classificações seguem normalmente.
- No REPASSE o campo é marcado como obrigatório no layout, mas é tratado como complementar: a ausência **não rejeita** o pagamento.
- Só é sinalizado quando o **mesmo AHID tem AHCOLLID diferente entre arquivos**. Na carga real, os 139 acordos presentes no ACORDO e no REPASSE têm o mesmo AHCOLLID nos dois.

### 3. Ranking
Usa os dias de atraso `U1DAYSGER02` e o saldo de risco do cadastro mais recente (REM/BAT_CONTRATOS). O campo do saldo é configurável: `DMAMTDLQ` (padrão) ou `DMCURBAL`.
- 0–364 dias: G1; 365–9.999 dias: G2.
- Saldo maior que 1.500: MAIOR MIL; menor que 1.500: MENOR MIL.

### 4. Produto
Avaliado no código `U1PRODUTO`, em maiúsculas.
- Contém `AT` → ATACADÃO.
- Contém `SAMS` → SAMS CLUB.
- Nenhum dos dois → CARREFOUR.
- A ausência de SAMS (ou de qualquer produto) no dia apenas mostra zero.

### 5. Faixas
- G1: faixas 03 a 12 (61–364 dias).
- G2: faixas 14 a 22 (365 dias em diante).
- Faixas sem contas aparecem com zero.

### 2. Comissão
O arquivo de comissão é preservado integralmente: todas as linhas, inclusive as idênticas, compõem os totais. A comissão é cruzada pela chave de contrato com a carteira (por origem) e com o CRM (contas com comissão não importadas ou divergentes).

## Inconsistências sinalizadas (somente quando ocorrem)
Essas contas ficam **sem a classificação afetada** e aparecem em "Inconsistências com as regras" para análise.

| Alerta | Quando ocorre | Tratamento |
|---|---|---|
| `RANKING_SALDO_IGUAL_1500` | Saldo de risco exatamente 1.500. | Sem ranking; no G2 a faixa é atribuída (independe do ranking), no G1 não. Regra a definir. |
| `RANKING_G1_MENOR_MIL_CONFLITO` | Conta com 0–364 dias e saldo menor que 1.500: a regra 3 a classifica como G1 – MENOR MIL, mas a regra 5 diz que não existe MENOR MIL no G1. | Ranking mostrado, sem faixa. Regra a definir. |
| `FAIXA_G1_ATE_60_DIAS` | G1 com 0 a 60 dias (sem faixa definida). | Sem faixa. |
| `RANKING_DIAS_FORA_DA_REGRA` | Dias negativos ou acima de 9.999. | Sem grupo/ranking. |
| `RANKING_SEM_DADOS` | **Cadastro existente** com dias de atraso ou saldo de risco vazios. | Sem grupo/ranking. Conta sem cadastro (presente só em retiradas, comissão etc.) **não** gera alerta. |
| `PRODUTO_SEM_CODIGO` | **Cadastro existente** com U1PRODUTO vazio. | Sem produto. |
| `PRODUTO_AMBIGUO` | Código com AT e SAMS ao mesmo tempo. | Sem produto (evita sobreposição). |
| `ORIGEM_DIVERGENTE_ENTRE_ARQUIVOS` | O mesmo acordo (AHID) com AHCOLLID diferente entre arquivos. | Origem pela prioridade acima; detalhe das fontes exibido. |

Na carga de teste real não há nenhuma dessas ocorrências (0 alertas). Todos os casos são cobertos por testes automatizados.

## Conciliação: dados ausentes
- Quando a base original não tem a informação da conta (ex.: conta sem acordo não tem parcelas nem AHCOLLID), o campo **não é confrontado** por padrão. A quantidade de campos não confrontados é informada no resultado. Marque "Comparar mesmo quando a base não tem o dado" no mapeamento para exigir que o CRM também esteja vazio.
- Quando o CRM está vazio e a base tem o dado, o campo é **divergente**: a informação não foi importada no CRM.
- Situações sem registros mostram zero; a conciliação é executada normalmente.
- Duplicados no CRM têm aba própria, além de compor a situação DIVERGENTE (ou NÃO CONSTA NA BASE, quando a conta não existe na base).

## Premissas para validação
- **Saldo de risco = `DMAMTDLQ`** ("Valor Risco Salvo (Saldo Principal)" no layout do REPASSE), alterável para `DMCURBAL` na tela da carteira.
- **Dias de atraso = `U1DAYSGER02`** ("Dias de Atraso - Envio"), na data do envio do arquivo.
- **PARCELAS:** a base usa `AHPRD`. Para "1+29", AHPRD = 29. Se o CRM registra 30 (entrada + parcelas), use uma comparação específica ou valide o critério.
- **CANAL DE PAGAMENTO:** pode corresponder ao AHCOLLID do acordo, ao AHCOLLID do pagamento ou ao PMTCODE. A escolha é feita no mapeamento.
