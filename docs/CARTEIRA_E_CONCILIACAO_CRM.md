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

## Regras de negócio implementadas

### 1. Origem
`AHCOLLID = LEALCO` → **ASSESSORIA (DIRETO)**. Qualquer outro identificador → **INDIRETO**. A comparação ignora espaços e maiúsculas/minúsculas. É usado o AHCOLLID do acordo mais recente da conta (ACORDO_ASSESSORIA); sem acordo, o do último pagamento (REPASSE).

### 3. Ranking
Usa os dias de atraso `U1DAYSGER02` e o saldo de risco `DMAMTDLQ` do cadastro mais recente (REM/BAT_CONTRATOS).
- 0–364 dias: G1; 365–9.999 dias: G2.
- Saldo maior que 1.500: MAIOR MIL; menor que 1.500: MENOR MIL.

### 4. Produto
Avaliado no código `U1PRODUTO`, em maiúsculas.
- Contém `AT` → ATACADÃO.
- Contém `SAMS` → SAMS CLUB.
- Nenhum dos dois → CARREFOUR.
- Os dois juntos → sem classificação e sinalizado.

### 5. Faixas
- G1: faixas 03 a 12 (61–364 dias).
- G2: faixas 14 a 22 (365 dias em diante). Não existem as faixas 13 e 20.
- Testes automatizados conferem todos os limites e que as faixas não se sobrepõem.

### 2. Comissão
O arquivo de comissão é preservado integralmente: todas as linhas, inclusive as idênticas, compõem os totais da conta. A comissão aparece na carteira (por origem) e na conciliação (contas com comissão não importadas ou divergentes no CRM).

## Situações não contempladas — PRECISAM DE DEFINIÇÃO
Essas contas ficam **sem classificação** e aparecem em "Situações não contempladas pelas regras".

| Alerta | Situação | Decisão necessária |
|---|---|---|
| `RANKING_G1_MENOR_MIL_CONFLITO` | A regra 3 cria **G1 – MENOR MIL**, mas a regra 5 diz que **não existe MENOR MIL no Grupo 1**. | O ranking G1 – MENOR MIL é mostrado e sinalizado, sem faixa. Definir se essas contas são válidas, se vão para outro ranking ou se são exceção. *Na carga de teste: 0 contas.* |
| `RANKING_SALDO_IGUAL_1500` | Saldo de risco exatamente 1.500. | Definir se é MAIOR ou MENOR MIL. No G2 a faixa é atribuída, porque independe do ranking; no G1 não é. *Na carga: 0 contas.* |
| `FAIXA_G1_ATE_60_DIAS` | G1 com 0 a 60 dias: as faixas do G1 começam em 61. | Definir faixa(s) para 0–60 dias, se existirem (faixas 01/02?). *Na carga: 0 contas (mínimo de 91 dias).* |
| `RANKING_DIAS_FORA_DA_REGRA` | Dias negativos ou acima de 9.999. | Definir tratamento. *Na carga: 0.* |
| `ORIGEM_SEM_AHCOLLID` | Conta sem acordo nem pagamento: não há AHCOLLID. | A regra classifica identificadores; a ausência de identificador não é "outro identificador". Definir se é INDIRETO, DIRETO ou "sem origem". *Na carga: todas as 5.225 contas ativas, porque nenhuma tem acordo no ACORDO_ASSESSORIA do dia.* |
| `RANKING_SEM_DADOS` / `PRODUTO_SEM_CODIGO` | Conta sem cadastro (só aparece em retiradas, comissão etc.). | Informativo; no escopo "carteira ativa" não ocorre. |

Outras premissas para validação:
- **Saldo de risco = `DMAMTDLQ`.** O layout do REPASSE descreve `DMAMTDLQ` como "Valor Risco Salvo (Saldo Principal)". Um administrador pode trocar para `DMCURBAL` (saldo devedor) na tela da carteira.
- **Dias de atraso = `U1DAYSGER02`** ("Dias de Atraso - Envio"): é o valor na data do envio do arquivo, não recalculado diariamente.
- **"MAIOR/MENOR MIL" com limite de 1.500:** os nomes foram mantidos exatamente como definidos.
- **Nenhum código com "SAMS"** existe na carga de teste: confirmar a sigla usada pelo banco para o Sam's Club.
- **PARCELAS:** a base usa `AHPRD` ("Qtde de Parcelas"). Para "1+29", AHPRD = 29. Se o CRM registra 30 (entrada + parcelas), todas as contas aparecerão divergentes: confirmar o critério do CRM.
- **CANAL DE PAGAMENTO:** pode corresponder ao AHCOLLID do acordo (canal), ao AHCOLLID do pagamento ou ao PMTCODE (PX/PC/REC). A escolha é feita no mapeamento.
