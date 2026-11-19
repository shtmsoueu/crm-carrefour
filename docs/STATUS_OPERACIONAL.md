# Status operacional e batimento mensal

## Separação
| | Arquivos | Quando roda | O que faz |
|---|---|---|---|
| **Status operacional** | REM_CONTRATOS, RET_CARTEIRA, RET_DISTRIBUICAO, ACORDO_ASSESSORIA, QUEBRA_ACORDO, REPASSE | A cada confirmação, cancelamento ou reprocessamento; e na virada do dia (prazos) | Atualiza o status do contrato e do acordo e a grade de parcelas. Não confronta arquivos. |
| **Batimento oficial** | BAT_CONTRATOS, BAT_ACORDO, BAT_ACORDO_PGTO (1 vez por mês) | Ao confirmar ou cancelar um arquivo BAT; execução manual somente com BAT importado | Motor de batimento (fluxos A–I) contra a fotografia mensal do banco. |

## Contrato (ciclo da carga)
- REM_CONTRATOS → **ATIVO**.
- RET_CARTEIRA ou RET_DISTRIBUICAO → **005 - PARALISADO**.
- Vale o evento mais recente entre remessa e retirada. Na mesma data, a retirada prevalece.
- Rastreabilidade: `contracts.status`, `status_date`, `status_source`, `status_import_id`, `status_record_id`.
- No batimento (fluxo A), a situação é recalculada **na data do BAT_CONTRATOS**, considerando só os eventos até essa data.

## Acordo (grade de parcelas)
Prioridade de cima para baixo:

| Status | Regra |
|---|---|
| QUEBRA DE ACORDO | Existe registro em QUEBRA_ACORDO para o AHID (data AHAUTDT) |
| ACORDO EXTERNO | AHCOLLID preenchido e diferente de LEALCO (REPASSE; na falta, ACORDO_ASSESSORIA) |
| ACORDO | Entrada (parcela 00) paga e colchão (01) sem atraso |
| PROMESSA EM ATRASO | Entrada vencida sem pagamento (tolerância 7 dias) ou colchão vencido sem pagamento (tolerância 30 dias) |
| PROMESSA ATIVA | Acordo válido, sem quebra, dentro do prazo |
| (sem ACORDO_ASSESSORIA) | AHID conhecido só por outros arquivos |

- **Grade:** as linhas do ACORDO_ASSESSORIA do AHID, em ordem de vencimento (APDUEDT), formam a grade.
  - 00 = entrada; 01 = colchão.
  - Nos dados recebidos, cada acordo tem AHPRD + 1 linhas.
- **Pagamento:** linha do REPASSE do AHID, associada pelo **PMBATCH** ("Número da parcela paga"). Linhas idênticas contam uma vez.
  - Sem número utilizável, o pagamento vai para a primeira parcela em aberto.
- **Status da parcela:**
  - PAGA, A VENCER ou EM ATRASO;
  - FORA DA TOLERÂNCIA, quando passa de 7 ou 30 dias;
  - QUEBRADA, quando a parcela não foi paga e o acordo tem quebra.
- **Acima da tolerância sem QUEBRA_ACORDO:** o acordo continua PROMESSA EM ATRASO, marcado "fora da tolerância". A quebra só é registrada com o arquivo do banco.
- **Parcelas 02 em diante:** o atraso aparece na grade, mas não muda o status do acordo, porque a regra só define entrada e colchão.
- **Data de referência:** hoje (São Paulo). `STATUS_REF_DATE=AAAA-MM-DD` fixa a data em testes e homologação.
- **Rastreabilidade:**
  - no acordo: `agreements.status_source`, `status_import_id`, `status_record_id` e `status_reason`;
  - em cada parcela: arquivo e linha do acordo e do pagamento (`agreement_installments`).

## Premissas a validar
1. Colchão = parcela 01 (primeira após a entrada).
2. Origem do AHCOLLID: REPASSE antes de ACORDO_ASSESSORIA, igual à Carteira.
3. A RAJADA_PIX não marca parcelas, porque não tem layout e é armazenada sem interpretação.
