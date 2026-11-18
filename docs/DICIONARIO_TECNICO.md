# Dicionário técnico dos arquivos — Carteira Carrefour

> Gerado automaticamente por `npm run docs:dictionary` a partir de `server/src/layouts/definitions.ts`, que é a especificação efetivamente usada pelos importadores.
> Fontes: `DE_PARA_LAYOUTS_ASSESSORIAS.xlsx` e `Layouts_Pos_validacao.zip`. Encoding dos arquivos: ISO-8859-1 (confirmado nas cargas de teste).

## Resumo

| Tipo | Nomenclatura oficial | Finalidade (De-Para) | Layout | Tamanho do registro |
|---|---|---|---|---|
| `REM_CONTRATOS` | `REM_CONTRATOS_XXXXX_AAAAMMDD_HHMMSS.txt` | Arquivo com os contratos distribuídos à assessoria | LayoutRemContratoV3.xlsx | tipo 1: 970 |
| `BAT_CONTRATOS` | `BAT_CONTRATOS_XXXXX_AAAAMMDD_HHMMSS.txt` | Arquivo de batimento com os contratos da assessoria | Layout_Bat_ContratoV3.xlsx | tipo 1: 970 |
| `RET_DISTRIBUICAO` | `RET_DISTRIBUICAO_XXXXX_AAAAMMDD.txt` | Arquivo com os contratos que foram redistribuídos | LayoutRetiradaDistribuiçãoV2.xlsx | tipo 1: 59 |
| `RET_CARTEIRA` | `RET_CARTEIRA_XXXXX_DDMMAAAA.txt` | Arquivo com os contratos a serem retirados da cobrança | LayoutRetiradaCarteiraV2.xlsx | tipo 1: 71 |
| `ACORDO_ASSESSORIA` | `ACORDO_ASSESSORIA_XXXXX_AAAAMMDD_HHMMSS.txt` | Arquivo que envia os acordos feitos pela assessoria | Layout_Acordo_AssessoriaV4.xlsx | tipo 1: 244 |
| `BAT_ACORDO` | `BAT_ACORDO_XXXXX_AAAAMMDD_HHMMSS.txt` | Arquivo de batimento com os acordos | Layout_Bat_Acordo_Assessoria_.xlsx | tipo 1: 244 |
| `BAT_ACORDO_PGTO` | `BAT_ACORDO_PGTO_XXXXX_AAAAMMDD_HHMMSS.txt` | Arquivo de batimento com os pagamentos de acordos | Layout_Bat_Acordo_Pagto.xlsx | tipo 1: 244 |
| `REPASSE` | `REPASSE_XXXXX_DDMMAAAA.txt` | Arquivo que envia os pagamentos dos acordos | Layout Arquivo de Pagtos (REPASSE).xlsx | tipo 1: 134 |
| `REM_BOLETOS` | `REM_BOLETOS_XXXXX_AAAAMMDD_HHMMSS.txt` | Boletos de parcelas | Layout Remessa BoletoV2.xlsx | tipo 1: 406, tipo 2: 406, tipo 3: 406, tipo 4: 406 |
| `CCAM` | `CCAM_XXXXX_AAAAMMDD_HHMMSS.txt` | Arquivo que envia carta campanha | Layout Remessa Carta - Campanha - (Arquivo CCAM).xlsx | tipo 1: 380, tipo 2: 380, tipo 3: 380, tipo 4: 380 |
| `QUEBRA_ACORDO` | `QUEBRA_ACORDO_XXXXX_AAAAMMDD_HHMMSS.txt` | Arquivo com os acordos que foram quebrados | Layout_Quebra_Acordos_V2.xlsx | 73 |
| `ELEGIBILIDADE` | `ELEGIBILIDADE_XXXXX_AAAAMMDD_HHMMSS.txt` | Arquivo com os contratos elegíveis a acordo | LayoutElegibilidadesAcordoCyber_v2.xlsx | 113 |
| `COMISSAO` | `AAAAMMDD_HHMMSS_comissao_XXXXX_out.txt` | Arquivo para acompanhamento das comissões | Layout_Comissao_Cyber_Assessoria_V3.xlsx | tipo 1: 130 |
| `REJ_CAMPANHA_EXT` | `tb_campanha_rej_ext_XXXXX_AAAAMMDD_HHMMSS.txt` | Arquivo com os contratos que tiveram a campanha rejeitada | Sem layout | — |
| `REJ_CAMPANHA_INT` | `tb_campanha_rej_int_XXXXX_AAAAMMDD_HHMMSS.txt` | Arquivo com os contratos que tiveram a campanha rejeitada (interna) | Sem layout | — |
| `CAMPANHA_ASSESSORIA` | `CY_IE003_AAAAMMDD_XXXXX.txt` | Arquivo de campanha da assessoria | Layout_campanha_assessoria_V3 - Arq_CY (não fornecido) | — |
| `RAJADA_PIX` | `CSF_RAJADAS_PGTOS_PIX_XXXXX_AAAAMMDD` | Pagamentos via pix do contrato distribuído para assessoria | Layout_Rajada Pix (não fornecido) | — |

## Remessa de Contratos (`REM_CONTRATOS`)

- **Nomenclatura:** `REM_CONTRATOS_XXXXX_AAAAMMDD_HHMMSS.txt`
- **Finalidade:** Arquivo com os contratos distribuídos à assessoria
- **Planilha de origem:** LayoutRemContratoV3.xlsx

**Observações**

- _Informação:_ Tipo Arquivo: REMESSA_CONTRATOS_ASSESSORIA. Gerado na inclusão/atualização e/ou distribuição/redistribuição de contratos.
- _Informação:_ A planilha não marca campos obrigatórios; DMACCT é tratado como obrigatório por ser identificado como "(Chave)".
- _Arquivo real x layout:_ Carga de teste: header informa "REMESSA_CONTRATOS_ASSESSORIAS" (com S). Divergência de nome no header é registrada como alerta.
- _Arquivo real x layout:_ Carga de teste: a quantidade do trailer corresponde apenas aos registros de dados (sem header/trailer).

### Header: Template Header-Trailler Arquivos Cyber-Assessorias (H/T, 100 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Identificação do registro "H" - Header |
| `EMPRESA` | 2 | 9 | 8 | A |  |  | Fixo 'CYBER' |
| `ARQUIVO` | 10 | 39 | 30 | A |  |  | Tipo de arquivo conforme definição em cada lay-out |
| `TIPO_ENVIO` | 40 | 40 | 1 | A |  |  | Tipo de envio D - DIARIO S - SEMANAL E - ESPECIAL |
| `DATA_GERACAO` | 41 | 48 | 8 | D (DDMMAAAA) |  |  | Data de Geração do arquivo (DDMMAAAA) |
| `SEQUENCIA_ARQUIVO` | 49 | 58 | 10 | N |  |  | Sequência do arquivo (iniciada em 0000000000, +1 a cada disponibilização) |
| `FILLER` | 59 | 100 | 42 | A |  |  | Brancos |

### Trailer

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Identificação do registro "T" - Trailer |
| `DATA_GERACAO` | 2 | 9 | 8 | D (DDMMAAAA) |  |  | Data de Geração do arquivo (DDMMAAAA) |
| `QTD_REGISTROS` | 10 | 17 | 8 | N |  |  | Quantidade de registros arquivo |
| `SEQUENCIA_ARQUIVO` | 18 | 27 | 10 | N |  |  | Sequência do arquivo |
| `FILLER` | 28 | 100 | 73 | A |  |  | Brancos |

### Registro tipo 1: Contrato (970 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `DMACCTG` | 1 | 1 | 1 | A |  | x | Fixo '1' — Grupo 1 – Produtos cartão CSF |
| `DMACCT` | 2 | 26 | 25 | A |  | x | Nº Conta-Nº Contrato / Nº Contrato (Chave) |
| `DMSSNUM` | 27 | 51 | 25 | A |  |  | Nº CPF/CNPJ |
| `U1TPPES` | 52 | 52 | 1 | A |  |  | Tipo Pessoa |
| `DMNAME` | 53 | 102 | 50 | A |  |  | Nome do Cliente |
| `U1DTNASCCLTE` | 103 | 110 | 8 | D (MMDDAAAA) |  |  | Data de Nascimento do Cliente (MMDDAAAA) |
| `U1NUMRG` | 111 | 121 | 11 | A |  |  | Número do RG |
| `U1DIGRG` | 122 | 123 | 2 | A |  |  | Dígito do RG |
| `U1ESTRG` | 124 | 125 | 2 | A |  |  | Estado do RG |
| `U1ORGEMISRG` | 126 | 130 | 5 | A |  |  | Órgão emissor RG |
| `U1DTEMISRG` | 131 | 138 | 8 | D (MMDDAAAA) |  |  | Data Emissão RG (MMDDAAAA) |
| `U1SEXO` | 139 | 139 | 1 | A |  |  | Sexo 'M' - Masculino 'F' - Feminino |
| `U1ESTCIVIL` | 140 | 140 | 1 | A |  |  | Estado Civil (S, C, D, E, V, O) |
| `DMADDR1` | 141 | 200 | 60 | A |  |  | Endereço do Cliente |
| `U1NUMENDCLTE` | 201 | 205 | 5 | A |  |  | Número do endereço |
| `DMADDR2` | 206 | 250 | 45 | A |  |  | Complemento do Endereço |
| `DMADDR3` | 251 | 280 | 30 | A |  |  | Bairro do Cliente |
| `DMCITY` | 281 | 320 | 40 | A |  |  | Código do Município |
| `DMSTATE` | 321 | 322 | 2 | A |  |  | Estado do Cliente |
| `DMZIP` | 323 | 331 | 9 | A |  |  | CEP do Cliente |
| `DMACODE` | 332 | 333 | 2 | A |  |  | DDD Telefone Residência 1 |
| `DMPHONE` | 334 | 345 | 12 | A |  |  | Telefone Residência 1 |
| `DMCACODE` | 346 | 347 | 2 | A |  |  | DDD Telefone Celular 1 |
| `DMCPHONE` | 348 | 359 | 12 | A |  |  | Telefone Celular 1 |
| `U1DDDREF1` | 360 | 361 | 2 | A |  |  | DDD Telefone Referência 1 |
| `U1FONEREF1` | 362 | 373 | 12 | A |  |  | Telefone Referência 1 |
| `U1NMREF1` | 374 | 423 | 50 | A |  |  | Nome Referência 1 |
| `DMEMAIL` | 424 | 483 | 60 | A |  |  | Email Principal de Contato |
| `DMBNAME` | 484 | 523 | 40 | A |  |  | Empresa que trabalha |
| `U1CNPJEMP` | 524 | 538 | 15 | A |  |  | CNPJ Empresa que trabalha |
| `U1CARGO` | 539 | 544 | 6 | A |  |  | Código Cargo _Obs.: Layout indica tipo N; tratado como texto para preservar o conteúdo recebido (brancos)._ |
| `DMBADDR1` | 545 | 604 | 60 | A |  |  | Endereço da Empresa |
| `DMBADDR2` | 605 | 649 | 45 | A |  |  | Complemento do Endereço Empresa |
| `DMBADDR3` | 650 | 679 | 30 | A |  |  | Bairro da Empresa |
| `DMBCITY` | 680 | 719 | 40 | A |  |  | Município da Empresa |
| `DMBSTATE` | 720 | 721 | 2 | A |  |  | Estado da Empresa |
| `DMBZIP` | 722 | 730 | 9 | A |  |  | CEP da Empresa |
| `DMBACODE` | 731 | 732 | 2 | A |  |  | DDD Telefone Comercial 1 |
| `DMBPHONE` | 733 | 744 | 12 | A |  |  | Telefone Comercial 1 |
| `DMBPEXT` | 745 | 748 | 4 | A |  |  | Ramal Comercial 1 |
| `U1ACCTORIG` | 749 | 773 | 25 | A |  |  | Nº Conta original |
| `U1DTCADCLTE` | 774 | 781 | 8 | D (MMDDAAAA) |  |  | Data Adesão Conta (MMDDAAAA) |
| `DMSTATUS` | 782 | 782 | 1 | A |  |  | Status Conta |
| `U1BBLOQUEIO` | 783 | 802 | 20 | A |  |  | Código de bloqueio da TSYS |
| `U1PRODUTO` | 803 | 822 | 20 | A |  |  | Código Produto _Obs.: Layout indica tipo N, porém o conteúdo é alfanumérico (ex.: "MC GOLD"); armazenado como texto._ |
| `U1BPRODUCT` | 823 | 842 | 20 | A |  |  | Produto TSYS |
| `U1DAYSGER02` | 843 | 847 | 5 | N |  |  | Dias de Atraso - Envio |
| `DMDLQDT` | 848 | 855 | 8 | D (MMDDAAAA) |  |  | Data Vencimento Contrato (MMDDAAAA) |
| `DMCURBAL` | 856 | 870 | 15 | N | 2 |  | Saldo Devedor (Contábil) Contrato |
| `DMAMTDLQ` | 871 | 885 | 15 | N | 2 |  | Valor Principal Dívida Contrato |
| `DMQUE` | 886 | 889 | 4 | A |  |  | Fila Segmentada |
| `U1DTRETOR` | 890 | 897 | 8 | D (MMDDAAAA) |  |  | Data Final de Permanência (MMDDAAAA) |
| `U1CDCREDOR` | 898 | 905 | 8 | A |  |  | Descrição credor |
| `PKBUYID` | 906 | 913 | 8 | A |  |  | ID Comprador (Cessionário) da carteira |
| `U1SCORE14` | 914 | 935 | 22 | N |  |  | Informação Score14 |
| `U1SCORE15` | 936 | 957 | 22 | N |  |  | Informação Score15 |
| `U1DTPRIMACORDO` | 958 | 965 | 8 | D (MMDDAAAA) |  |  | Data do Primeiro Acordo (MMDDAAAA) (01011900 = primeiro acordo) |
| `U1DTAGDAYS` | 966 | 970 | 5 | N |  |  | Quantidade de dias de atraso do último acordo |

## Batimento de Contratos (`BAT_CONTRATOS`)

- **Nomenclatura:** `BAT_CONTRATOS_XXXXX_AAAAMMDD_HHMMSS.txt`
- **Finalidade:** Arquivo de batimento com os contratos da assessoria
- **Planilha de origem:** Layout_Bat_ContratoV3.xlsx

**Observações**

- _Informação:_ O trailer deste layout não possui quantidade de registros (posições 10-17 fixas "00000000"); a contagem não pode ser validada.
- _Limitação:_ Header/trailer definidos com 406 posições enquanto o registro de dados possui 970. Divergência de tamanho do header/trailer é tratada como alerta.
- _Limitação:_ Não há carga de teste deste arquivo; o importador segue estritamente o layout.

### Header: Template Header-Trailler Arquivos Batimento de Contratos (406 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Identificação do registro "H" - Header |
| `IDENTIFICACAO` | 2 | 40 | 39 | A |  |  | CYBER   BATIMENTO_CONTRATOS_ASSESSORIAD |
| `DATA_GERACAO` | 41 | 48 | 8 | D (MMDDAAAA) |  |  | Data de Geração do arquivo (MMDDAAAA) |
| `SEQUENCIA_ARQUIVO` | 49 | 58 | 10 | A |  |  | Controle de sequência do arquivo |
| `FILLER` | 59 | 406 | 348 | A |  |  | Completar registro com brancos |

### Trailer

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Identificação do registro "T" - Trailer |
| `DATA_GERACAO` | 2 | 9 | 8 | D (MMDDAAAA) |  |  | Data de Geração do arquivo (MMDDAAAA) |
| `FILLER_ZEROS` | 10 | 17 | 8 | N |  |  | "00000000" |
| `SEQUENCIA_ARQUIVO` | 18 | 27 | 10 | N |  |  | Controle de sequência do arquivo |
| `FILLER` | 28 | 406 | 379 | A |  |  | Completar registro com brancos |

### Registro tipo 1: Contrato (batimento) (970 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `DMACCTG` | 1 | 1 | 1 | A |  | x | Fixo '1' — Grupo 1 – Produtos cartão CSF |
| `DMACCT` | 2 | 26 | 25 | A |  | x | Nº Conta-Nº Contrato / Nº Contrato (Chave) |
| `DMSSNUM` | 27 | 51 | 25 | A |  | x | Nº CPF/CNPJ |
| `U1TPPES` | 52 | 52 | 1 | A |  |  | Tipo Pessoa |
| `DMNAME` | 53 | 102 | 50 | A |  |  | Nome do Cliente |
| `U1DTNASCCLTE` | 103 | 110 | 8 | D (MMDDAAAA) |  |  | Data de Nascimento do Cliente (MMDDAAAA) |
| `U1NUMRG` | 111 | 121 | 11 | A |  |  | Número do RG |
| `U1DLGRG` | 122 | 123 | 2 | A |  |  | Dígito do RG |
| `U1ESTRG` | 124 | 125 | 2 | A |  |  | Estado do RG |
| `U1ORGEMISRG` | 126 | 130 | 5 | A |  |  | Órgão emissor RG |
| `FILLER` | 131 | 138 | 8 | A |  |  | BRANCOS |
| `U1SEXO` | 139 | 139 | 1 | A |  |  | Sexo 'M' - Masculino 'F' - Feminino |
| `U1ESTCIVIL` | 140 | 140 | 1 | A |  |  | Estado Civil (S, C, D, E, V, O) |
| `DMADDR1` | 141 | 200 | 60 | A |  |  | Endereço do Cliente |
| `U1NUMENDCLTE` | 201 | 205 | 5 | A |  |  | Número do endereço |
| `DMADDR2` | 206 | 250 | 45 | A |  |  | Complemento do Endereço |
| `DMADDR3` | 251 | 280 | 30 | A |  |  | Bairro do Cliente |
| `DMCITY` | 281 | 320 | 40 | A |  |  | Cidade |
| `DMSTATE` | 321 | 322 | 2 | A |  |  | Estado do Cliente |
| `DMZIP` | 323 | 331 | 9 | A |  |  | CEP do Cliente |
| `DMACODE` | 332 | 333 | 2 | A |  |  | DDD Telefone Residência 1 |
| `DMPHONE` | 334 | 345 | 12 | A |  |  | Telefone Residência 1 |
| `DMCACODE` | 346 | 347 | 2 | A |  |  | DDD Telefone Celular 1 |
| `DMCPHONE` | 348 | 359 | 12 | A |  |  | Telefone Celular 1 |
| `U1DDDREF` | 360 | 361 | 2 | A |  |  | DDD Telefone Referência 1 |
| `U1FONEREF` | 362 | 373 | 12 | A |  |  | Telefone Referência 1 |
| `U1NMREF` | 374 | 423 | 50 | A |  |  | Nome Referência 1 |
| `DMEMAIL` | 424 | 483 | 60 | A |  |  | Email Principal de Contato |
| `DMBNAME` | 484 | 523 | 40 | A |  |  | Empresa que trabalha |
| `U1CNPJEMP` | 524 | 538 | 15 | A |  |  | CNPJ Empresa que trabalha |
| `U1CARGO` | 539 | 544 | 6 | A |  |  | Código Cargo |
| `DMBADDR1` | 545 | 604 | 60 | A |  |  | Endereço da Empresa |
| `DMBADDR2` | 605 | 649 | 45 | A |  |  | Complemento do Endereço Empresa |
| `DMBADDR3` | 650 | 679 | 30 | A |  |  | Bairro da Empresa |
| `DMBCITY` | 680 | 719 | 40 | A |  |  | Município da Empresa |
| `DMBSTATE` | 720 | 721 | 2 | A |  |  | Estado da Empresa |
| `DMBZIP` | 722 | 730 | 9 | A |  |  | CEP da Empresa |
| `DMBACODE` | 731 | 732 | 2 | A |  |  | DDD Telefone Comercial 1 |
| `DMBPHONE` | 733 | 744 | 12 | A |  |  | Telefone Comercial 1 |
| `DMBPEXT` | 745 | 748 | 4 | A |  |  | Ramal Comercial 1 |
| `U1ACCTORIG` | 749 | 773 | 25 | A |  |  | Nº Conta original |
| `U1DTINICONTR` | 774 | 781 | 8 | A |  |  | Data início do contrato |
| `DMSTATUS` | 782 | 782 | 1 | A |  |  | Status Conta |
| `U1BBLOQUEIO` | 783 | 802 | 20 | A |  |  | Código de bloqueio da TSYS |
| `U1PRODUTO` | 803 | 822 | 20 | A |  |  | Código Produto |
| `U1BPRODUCT` | 823 | 842 | 20 | A |  |  | Produto TSYS |
| `U1DAYSGER02` | 843 | 847 | 5 | N |  |  | Dias de Atraso - Envio |
| `DMDLQDT` | 848 | 855 | 8 | D (MMDDAAAA) |  |  | Data início do atraso (MMDDAAAA) |
| `DMCURBAL` | 856 | 870 | 15 | N | 2 |  | Saldo Devedor (Contábil) Contrato |
| `DMAMTDLQ` | 871 | 885 | 15 | N | 2 |  | Valor Principal Dívida Contrato |
| `DMQUE` | 886 | 889 | 4 | A |  |  | Fila Segmentada |
| `U1DTRETOR` | 890 | 897 | 8 | D (MMDDAAAA) |  |  | Data retorno (MMDDAAAA) |
| `U1CDCREDOR` | 898 | 905 | 8 | A |  |  | Código credor |
| `PKBUYID` | 906 | 913 | 8 | A |  |  | Identificador pacote |
| `U1SCORE14` | 914 | 935 | 22 | N |  |  | Informação Score14 |
| `U1SCORE15` | 936 | 957 | 22 | N |  |  | Informação Score15 |
| `U1DTPRIMACORDO` | 958 | 965 | 8 | D (MMDDAAAA) |  |  | Data do Primeiro Acordo (MMDDAAAA) (01011900 = primeiro acordo) |
| `U1DTAGDAYS` | 966 | 970 | 5 | N |  |  | Quantidade de dias de atraso do último acordo |

## Retirada por Distribuição (`RET_DISTRIBUICAO`)

- **Nomenclatura:** `RET_DISTRIBUICAO_XXXXX_AAAAMMDD.txt`
- **Finalidade:** Arquivo com os contratos que foram redistribuídos
- **Planilha de origem:** LayoutRetiradaDistribuiçãoV2.xlsx

**Observações**

- _Informação:_ Tipo Arquivo: RETIRADA_ASSESSORIA_DISTRIBUICAO.
- _Arquivo real x layout:_ Nomenclatura: De-Para indica AAAAMMDD e o layout AAAAMMDD_HHMMSS; a carga de teste usa DDMMAAAA (RET_DISTRIBUICAO_LEALCO_17112026.txt). A data do nome é interpretada de forma tolerante, com alerta.
- _Arquivo real x layout:_ Carga de teste: a quantidade do trailer inclui header e trailer.

### Header: Template Header-Trailler Arquivos Cyber-Assessorias (H/T, 100 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Identificação do registro "H" - Header |
| `EMPRESA` | 2 | 9 | 8 | A |  |  | Fixo 'CYBER' |
| `ARQUIVO` | 10 | 39 | 30 | A |  |  | Tipo de arquivo conforme definição em cada lay-out |
| `TIPO_ENVIO` | 40 | 40 | 1 | A |  |  | Tipo de envio D - DIARIO S - SEMANAL E - ESPECIAL |
| `DATA_GERACAO` | 41 | 48 | 8 | D (MMDDAAAA) |  |  | Data de Geração do arquivo (MMDDAAAA) |
| `SEQUENCIA_ARQUIVO` | 49 | 58 | 10 | N |  |  | Sequência do arquivo (iniciada em 0000000000, +1 a cada disponibilização) |
| `FILLER` | 59 | 100 | 42 | A |  |  | Brancos |

### Trailer

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Identificação do registro "T" - Trailer |
| `DATA_GERACAO` | 2 | 9 | 8 | D (MMDDAAAA) |  |  | Data de Geração do arquivo (MMDDAAAA) |
| `QTD_REGISTROS` | 10 | 17 | 8 | N |  |  | Quantidade de registros arquivo |
| `SEQUENCIA_ARQUIVO` | 18 | 27 | 10 | N |  |  | Sequência do arquivo |
| `FILLER` | 28 | 100 | 73 | A |  |  | Brancos |

### Registro tipo 1: Retirada por redistribuição (59 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `DMACCTG` | 1 | 1 | 1 | A |  | x | Fixo '1' — Grupo 1 – Produtos cartão CSF |
| `DMACCT` | 2 | 26 | 25 | A |  | x | Nº Conta-Nº Contrato / Nº Contrato (Chave) |
| `DMSSNUM` | 27 | 51 | 25 | A |  | x | Nº CPF/CNPJ |
| `IXFDATE` | 52 | 59 | 8 | D (MMDDAAAA) |  |  | Data da Retirada de Cobrança por redistribuição (MMDDAAAA) |

## Retirada da Carteira (`RET_CARTEIRA`)

- **Nomenclatura:** `RET_CARTEIRA_XXXXX_DDMMAAAA.txt`
- **Finalidade:** Arquivo com os contratos a serem retirados da cobrança
- **Planilha de origem:** LayoutRetiradaCarteiraV2.xlsx

**Observações**

- _Correção aplicada:_ Campo U?MOTBXA: posição corrigida de 38-57 para 52-71 (INI/FIM da planilha conflitam com DMSSNUM; TAM=20 preservado).
- _Informação:_ Tipo Arquivo: RETIRADA_ASSESSORIA. Lay-out válido para Retiradas (Exclusões) e Baixa.
- _Arquivo real x layout:_ Carga de teste: a quantidade do trailer inclui header e trailer.

### Header: Template Header-Trailler Arquivos Cyber-Assessorias (H/T, 100 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Identificação do registro "H" - Header |
| `EMPRESA` | 2 | 9 | 8 | A |  |  | Fixo 'CYBER' |
| `ARQUIVO` | 10 | 39 | 30 | A |  |  | Tipo de arquivo conforme definição em cada lay-out |
| `TIPO_ENVIO` | 40 | 40 | 1 | A |  |  | Tipo de envio D - DIARIO S - SEMANAL E - ESPECIAL |
| `DATA_GERACAO` | 41 | 48 | 8 | D (MMDDAAAA) |  |  | Data de Geração do arquivo (MMDDAAAA) |
| `SEQUENCIA_ARQUIVO` | 49 | 58 | 10 | N |  |  | Sequência do arquivo (iniciada em 0000000000, +1 a cada disponibilização) |
| `FILLER` | 59 | 100 | 42 | A |  |  | Brancos |

### Trailer

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Identificação do registro "T" - Trailer |
| `DATA_GERACAO` | 2 | 9 | 8 | D (MMDDAAAA) |  |  | Data de Geração do arquivo (MMDDAAAA) |
| `QTD_REGISTROS` | 10 | 17 | 8 | N |  |  | Quantidade de registros arquivo |
| `SEQUENCIA_ARQUIVO` | 18 | 27 | 10 | N |  |  | Sequência do arquivo |
| `FILLER` | 28 | 100 | 73 | A |  |  | Brancos |

### Registro tipo 1: Retirada / Baixa (71 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `DMACCTG` | 1 | 1 | 1 | A |  | x | Fixo '1' — Grupo 1 – Produtos cartão CSF |
| `DMACCT` | 2 | 26 | 25 | A |  | x | Nº Conta-Nº Contrato / Nº Contrato (Chave) |
| `DMSSNUM` | 27 | 51 | 25 | A |  | x | Nº CPF/CNPJ |
| `U_MOTBXA` | 52 | 71 | 20 | A |  | x | Motivo da baixa 'Liquidado' 'Atualizado' 'Óbito' 'Alerta' 'Jurídico' _Obs.: Planilha indica INI 38 / FIM 57 (sobrepõe DMSSNUM 27-51). Aplicado 52-71 (TAM=20, imediatamente após DMSSNUM), coerente com o tamanho real da linha (71)._ |

## Acordos da Assessoria (`ACORDO_ASSESSORIA`)

- **Nomenclatura:** `ACORDO_ASSESSORIA_XXXXX_AAAAMMDD_HHMMSS.txt`
- **Finalidade:** Arquivo que envia os acordos feitos pela assessoria
- **Planilha de origem:** Layout_Acordo_AssessoriaV4.xlsx

**Observações**

- _Informação:_ Cada linha representa uma parcela do acordo (APDUEDT/APAMT variam); os dados do acordo (AHID, AHDT, AHTOTPMT, AHPRD, AHTYPE) se repetem por parcela.
- _Informação:_ As versões .xls e .xlsx do Layout_Acordo_AssessoriaV4 foram comparadas e são idênticas.

### Header: Header-Trailler "0"/"9" (244 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Identificação do registro "0" - Header |
| `DATA_GERACAO` | 2 | 9 | 8 | D (AAAAMMDD) |  |  | Data de Geração do arquivo (AAAAMMDD) |
| `TIPO_FORMULARIO` | 10 | 11 | 2 | A |  |  | Tipo de formulário |
| `SEQUENCIA_ARQUIVO` | 12 | 21 | 10 | N |  |  | Controle de sequência do arquivo |
| `FILLER` | 22 | 236 | 215 | A |  |  | Completar registro com brancos |
| `SEQ_REG` | 237 | 244 | 8 | N |  |  | Sequência relativa do registro no arquivo '00000001' |

### Trailer

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Identificação do registro "9" - Trailer |
| `TOTAL_REGISTROS` | 2 | 16 | 15 | N |  |  | Total de registros do arquivo (sem header e trailler) |
| `TOTAL_CARTAS` | 17 | 31 | 15 | N |  |  | Total de cartas de cobrança |
| `FILLER` | 32 | 236 | 205 | A |  |  | Completar registro com espaços |
| `SEQ_REG` | 237 | 244 | 8 | N |  |  | Sequência relativa do registro no arquivo |

### Registro tipo 1: Acordo / parcela (244 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `DMACCTG` | 1 | 1 | 1 | A |  | x | Fixo '1' — Grupo 1 – Produtos cartão CSF |
| `DMACCT` | 2 | 26 | 25 | A |  | x | Nº Conta-Nº Contrato / Nº Contrato (Chave) |
| `DMSSNUM` | 27 | 51 | 25 | A |  | x | Nº CPF/CNPJ |
| `DMAMTDLQ` | 52 | 66 | 15 | N | 2 |  | Valor da dívida |
| `U1ATUJUR` | 67 | 81 | 15 | N | 2 |  | Valor do juros |
| `AHDT` | 82 | 89 | 8 | D (AAAAMMDD) |  |  | Data do Acordo _Obs.: Formato não informado na coluna DESCRIÇÃO; AAAAMMDD conforme amostra do próprio layout (20260316)._ |
| `APDUEDT_PROX` | 90 | 97 | 8 | D (AAAAMMDD) |  |  | Data do próximo Pagamento (APDUEDT) |
| `AHTOTPMT` | 98 | 110 | 13 | N | 2 |  | Valor Acordo |
| `VALOR_ENTRADA` | 111 | 123 | 13 | N | 2 |  | Valor Entrada |
| `APDUEDT` | 124 | 131 | 8 | D (AAAAMMDD) |  |  | Data vencimento das parcelas |
| `AHPRD` | 132 | 136 | 5 | N |  |  | Qtde de Parcelas |
| `AHTYPE` | 137 | 144 | 8 | A |  |  | Tipo Acordo |
| `U1IOF` | 145 | 159 | 15 | N | 2 |  | Valor total de imposto |
| `AHVDESC` | 160 | 174 | 15 | N | 2 |  | Valor do desconto |
| `AHPDESCP` | 175 | 181 | 7 | N | 4 |  | Porcentagem do desconto |
| `DMPAYDT` | 182 | 189 | 8 | D (AAAAMMDD) |  |  | Dt. Último Pagamento |
| `AHCOLLID` | 190 | 197 | 8 | A |  |  | Usuário (Canal) |
| `APAMT` | 198 | 210 | 13 | N | 2 |  | Valor Parcelas |
| `APTAXAMT` | 211 | 223 | 13 | N | 2 |  | Valor do IOF por parcela |
| `AHID` | 224 | 236 | 13 | N |  | x | ID do acordo |
| `SEQ_REG` | 237 | 244 | 8 | N |  |  | Sequência relativa do registro no arquivo _Obs.: Layout indica DECIMAIS=2 para a sequência; desconsiderado por se tratar de contador inteiro._ |

## Batimento de Acordos (`BAT_ACORDO`)

- **Nomenclatura:** `BAT_ACORDO_XXXXX_AAAAMMDD_HHMMSS.txt`
- **Finalidade:** Arquivo de batimento com os acordos
- **Planilha de origem:** Layout_Bat_Acordo_Assessoria_.xlsx

**Observações**

- _Limitação:_ Header/trailer definidos com 406 posições e registro de dados com 244. Tamanho de header/trailer validado como alerta.
- _Limitação:_ Não há carga de teste deste arquivo; o importador segue estritamente o layout.

### Header: Header-Trailler "0"/"9" (406 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Identificação do registro "0" - Header |
| `DATA_GERACAO` | 2 | 9 | 8 | D (MMDDAAAA) |  |  | Data de Geração do arquivo (MMDDAAAA) |
| `TIPO_FORMULARIO` | 10 | 11 | 2 | A |  |  | Tipo de formulário |
| `SEQUENCIA_ARQUIVO` | 12 | 21 | 10 | N |  |  | Controle de sequência do arquivo |
| `FILLER` | 22 | 398 | 377 | A |  |  | Completar registro com brancos |
| `SEQ_REG` | 399 | 406 | 8 | N |  |  | Sequência relativa do registro no arquivo '00000001' |

### Trailer

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Identificação do registro "9" - Trailer |
| `TOTAL_REGISTROS` | 2 | 16 | 15 | N |  |  | Total de registros do arquivo (sem header e trailler) |
| `TOTAL_CARTAS` | 17 | 31 | 15 | N |  |  | Total de cartas de cobrança |
| `FILLER` | 32 | 398 | 367 | A |  |  | Completar registro com espaços |
| `SEQ_REG` | 399 | 406 | 8 | N |  |  | Sequência relativa do registro no arquivo |

### Registro tipo 1: Acordo (batimento) (244 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `DMACCTG` | 1 | 1 | 1 | A |  | x | Fixo '1' — Grupo 1 – Produtos cartão CSF |
| `DMACCT` | 2 | 26 | 25 | A |  | x | Nº Conta-Nº Contrato / Nº Contrato (Chave) |
| `DMSSNUM` | 27 | 51 | 25 | A |  | x | Nº CPF/CNPJ |
| `DMAMTDLQ` | 52 | 66 | 15 | N | 2 |  | Valor da dívida |
| `U1ATUJUR` | 67 | 81 | 15 | N | 2 |  | Valor do juros |
| `AHDT` | 82 | 89 | 8 | D (AAAAMMDD) |  |  | Data do Acordo _Obs.: Formato não informado na coluna DESCRIÇÃO; AAAAMMDD conforme amostra do próprio layout (20260316)._ |
| `APDUEDT_PROX` | 90 | 97 | 8 | D (AAAAMMDD) |  |  | Data do próximo Pagamento (APDUEDT) |
| `AHTOTPMT` | 98 | 110 | 13 | N | 2 |  | Valor Acordo |
| `VALOR_ENTRADA` | 111 | 123 | 13 | N | 2 |  | Valor Entrada |
| `APDUEDT` | 124 | 131 | 8 | D (AAAAMMDD) |  |  | Data vencimento das parcelas |
| `AHPRD` | 132 | 136 | 5 | N |  |  | Qtde de Parcelas |
| `AHTYPE` | 137 | 144 | 8 | A |  |  | Tipo Acordo |
| `U1IOF` | 145 | 159 | 15 | N | 2 |  | Valor total de imposto |
| `AHVDESC` | 160 | 174 | 15 | N | 2 |  | Valor do desconto |
| `AHPDESCP` | 175 | 181 | 7 | N | 4 |  | Porcentagem do desconto |
| `DMPAYDT` | 182 | 189 | 8 | D (AAAAMMDD) |  |  | Dt. Último Pagamento |
| `AHCOLLID` | 190 | 197 | 8 | A |  |  | Usuário (Canal) |
| `APAMT` | 198 | 210 | 13 | N | 2 |  | Valor Parcelas |
| `APTAXAMT` | 211 | 223 | 13 | N | 2 |  | Valor do IOF por parcela |
| `AHID` | 224 | 236 | 13 | N |  | x | ID do acordo |
| `SEQ_REG` | 237 | 244 | 8 | N |  |  | Sequência relativa do registro no arquivo _Obs.: Layout indica DECIMAIS=2 para a sequência; desconsiderado por se tratar de contador inteiro._ |

## Batimento de Pagamentos de Acordos (`BAT_ACORDO_PGTO`)

- **Nomenclatura:** `BAT_ACORDO_PGTO_XXXXX_AAAAMMDD_HHMMSS.txt`
- **Finalidade:** Arquivo de batimento com os pagamentos de acordos
- **Planilha de origem:** Layout_Bat_Acordo_Pagto.xlsx

**Observações**

- _Informação:_ Posição 182-189 contém APINDATE (Data do pagamento da parcela).
- _Limitação:_ Não há carga de teste deste arquivo; o importador segue estritamente o layout.

### Header: Header-Trailler "0"/"9" (406 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Identificação do registro "0" - Header |
| `DATA_GERACAO` | 2 | 9 | 8 | D (MMDDAAAA) |  |  | Data de Geração do arquivo (MMDDAAAA) |
| `TIPO_FORMULARIO` | 10 | 11 | 2 | A |  |  | Tipo de formulário |
| `SEQUENCIA_ARQUIVO` | 12 | 21 | 10 | N |  |  | Controle de sequência do arquivo |
| `FILLER` | 22 | 398 | 377 | A |  |  | Completar registro com brancos |
| `SEQ_REG` | 399 | 406 | 8 | N |  |  | Sequência relativa do registro no arquivo '00000001' |

### Trailer

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Identificação do registro "9" - Trailer |
| `TOTAL_REGISTROS` | 2 | 16 | 15 | N |  |  | Total de registros do arquivo (sem header e trailler) |
| `TOTAL_CARTAS` | 17 | 31 | 15 | N |  |  | Total de cartas de cobrança |
| `FILLER` | 32 | 398 | 367 | A |  |  | Completar registro com espaços |
| `SEQ_REG` | 399 | 406 | 8 | N |  |  | Sequência relativa do registro no arquivo |

### Registro tipo 1: Pagamento de parcela (batimento) (244 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `DMACCTG` | 1 | 1 | 1 | A |  | x | Fixo '1' — Grupo 1 – Produtos cartão CSF |
| `DMACCT` | 2 | 26 | 25 | A |  | x | Nº Conta-Nº Contrato / Nº Contrato (Chave) |
| `DMSSNUM` | 27 | 51 | 25 | A |  | x | Nº CPF/CNPJ |
| `DMAMTDLQ` | 52 | 66 | 15 | N | 2 |  | Valor da dívida |
| `U1ATUJUR` | 67 | 81 | 15 | N | 2 |  | Valor do juros |
| `AHDT` | 82 | 89 | 8 | D (AAAAMMDD) |  |  | Data do Acordo _Obs.: Formato não informado na coluna DESCRIÇÃO; AAAAMMDD conforme amostra do próprio layout (20260316)._ |
| `APDUEDT_PROX` | 90 | 97 | 8 | D (AAAAMMDD) |  |  | Data do próximo Pagamento (APDUEDT) |
| `AHTOTPMT` | 98 | 110 | 13 | N | 2 |  | Valor Acordo |
| `VALOR_ENTRADA` | 111 | 123 | 13 | N | 2 |  | Valor Entrada |
| `APDUEDT` | 124 | 131 | 8 | D (AAAAMMDD) |  |  | Data vencimento das parcelas |
| `AHPRD` | 132 | 136 | 5 | N |  |  | Qtde de Parcelas |
| `AHTYPE` | 137 | 144 | 8 | A |  |  | Tipo Acordo |
| `U1IOF` | 145 | 159 | 15 | N | 2 |  | Valor total de imposto |
| `AHVDESC` | 160 | 174 | 15 | N | 2 |  | Valor do desconto |
| `AHPDESCP` | 175 | 181 | 7 | N | 4 |  | Porcentagem do desconto |
| `APINDATE` | 182 | 189 | 8 | D (AAAAMMDD) |  |  | Data do pagamento da parcela |
| `AHCOLLID` | 190 | 197 | 8 | A |  |  | Usuário (Canal) |
| `APAMT` | 198 | 210 | 13 | N | 2 |  | Valor Parcelas |
| `APTAXAMT` | 211 | 223 | 13 | N | 2 |  | Valor do IOF por parcela |
| `AHID` | 224 | 236 | 13 | N |  | x | ID do acordo |
| `SEQ_REG` | 237 | 244 | 8 | N |  |  | Sequência relativa do registro no arquivo _Obs.: Layout indica DECIMAIS=2 para a sequência; desconsiderado por se tratar de contador inteiro._ |

## Repasse de Pagamentos (`REPASSE`)

- **Nomenclatura:** `REPASSE_XXXXX_DDMMAAAA.txt`
- **Finalidade:** Arquivo que envia os pagamentos dos acordos
- **Planilha de origem:** Layout Arquivo de Pagtos (REPASSE).xlsx

**Observações**

- _Informação:_ Tipo Arquivo: PAGAMENTO_ASSESSORIA. Repasse de Pagamento para Assessorias.
- _Arquivo real x layout:_ Carga de teste usa header/trailer padrão Cyber (H/T, 100 posições, "REPASSE PAGAMENTO") e não o "0"/"9" do layout. As duas variantes são aceitas; a utilizada é registrada como alerta.
- _Arquivo real x layout:_ Carga de teste: a quantidade do trailer inclui header e trailer.
- _Informação:_ Um mesmo acordo pode ter vários pagamentos no mesmo dia, distinguidos pelo PMBATCH (número da parcela).

### Header: Template Header-Trailler REPASSE ("0"/"9", 134 posições) — oficial do layout

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Identificação do registro "0" - Header |
| `DATA_GERACAO` | 2 | 9 | 8 | D (MMDDAAAA) |  |  | Data de Geração do arquivo (MMDDAAAA) |
| `NOME_ARQUIVO` | 10 | 29 | 20 | A |  |  | Fixo "PAGAMENTOS PORTAIS" |
| `FILLER` | 30 | 134 | 105 | A |  |  | Espaços |

### Trailer

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Identificação do registro "9" - Trailer |
| `TOTAL_REGISTROS` | 2 | 16 | 15 | N |  |  | Total de registros do arquivo (sem header a trailler do arquivo) |
| `FILLER` | 17 | 134 | 118 | A |  |  | Espaços |

### Header: Template Header-Trailler Cyber-Assessorias (H/T) — observado na carga real

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Identificação do registro "H" - Header |
| `EMPRESA` | 2 | 9 | 8 | A |  |  | Fixo 'CYBER' |
| `ARQUIVO` | 10 | 39 | 30 | A |  |  | Tipo de arquivo conforme definição em cada lay-out |
| `TIPO_ENVIO` | 40 | 40 | 1 | A |  |  | Tipo de envio D - DIARIO S - SEMANAL E - ESPECIAL |
| `DATA_GERACAO` | 41 | 48 | 8 | D (MMDDAAAA) |  |  | Data de Geração do arquivo (MMDDAAAA) |
| `SEQUENCIA_ARQUIVO` | 49 | 58 | 10 | N |  |  | Sequência do arquivo (iniciada em 0000000000, +1 a cada disponibilização) |
| `FILLER` | 59 | 100 | 42 | A |  |  | Brancos |

### Trailer

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Identificação do registro "T" - Trailer |
| `DATA_GERACAO` | 2 | 9 | 8 | D (MMDDAAAA) |  |  | Data de Geração do arquivo (MMDDAAAA) |
| `QTD_REGISTROS` | 10 | 17 | 8 | N |  |  | Quantidade de registros arquivo |
| `SEQUENCIA_ARQUIVO` | 18 | 27 | 10 | N |  |  | Sequência do arquivo |
| `FILLER` | 28 | 100 | 73 | A |  |  | Brancos |

### Registro tipo 1: Pagamento (134 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `PMACCTG` | 1 | 1 | 1 | A |  | x | Fixo '1' — Grupo 1 – Produtos cartão CSF |
| `PMACCT` | 2 | 26 | 25 | A |  | x | Nº Conta-Nº Contrato / Nº Contrato (Chave) |
| `PMTDATE_TRANSACAO` | 27 | 34 | 8 | D (MMDDAAAA) |  | x | Data da transação (PMTDATE) _Obs.: Formato não informado para esta posição; MMDDAAAA conforme demais datas do layout._ |
| `DMSSNUM` | 35 | 59 | 25 | A |  | x | Identificador Único Cliente Nº CPF/CNPJ |
| `PMTCODE` | 60 | 65 | 6 | A |  | x | Código da transação |
| `PMTDATE` | 66 | 73 | 8 | D (MMDDAAAA) |  | x | Data do Pagamento no Banco (MMDDAAAA) |
| `PMEDATE` | 74 | 81 | 8 | D (MMDDAAAA) |  | x | Data de Entrada do Pagamento no Cyber (MMDDAAAA) |
| `PMAMT` | 82 | 96 | 15 | N | 2 | x | Valor do Pagamento |
| `PMBATCH` | 97 | 98 | 2 | A |  | x | Número da parcela paga |
| `AHID` | 99 | 111 | 13 | N |  |  | ID do acordo _Obs.: Layout indica tipo A; tratado como numérico (mesmo identificador AHID dos demais layouts, tipo N)._ |
| `AHCOLLID` | 112 | 119 | 8 | A |  | x | Gestor que capturou o acordo |
| `DMAMTDLQ` | 120 | 134 | 15 | N | 2 | x | Valor Risco Salvo (Saldo Principal) com 2 decimais _Obs.: Layout indica tipo A; a descrição informa "com 2 decimais", portanto interpretado como numérico com 2 decimais._ |

## Remessa de Boletos (`REM_BOLETOS`)

- **Nomenclatura:** `REM_BOLETOS_XXXXX_AAAAMMDD_HHMMSS.txt`
- **Finalidade:** Boletos de parcelas
- **Planilha de origem:** Layout Remessa BoletoV2.xlsx

**Observações**

- _Correção aplicada:_ Header: planilha indica SEQ-REG em 22-29, sobreposto ao FILLER 12-362. Aplicada a posição 399-406 (mesma do trailer e dos registros de dados), coerente com o arquivo real.
- _Informação:_ Registros agrupados por boleto: 1 (endereço), 2 (parcela), 3 (ficha de compensação), 4 (dívida original).
- _Arquivo real x layout:_ Carga de teste em ISO-8859-1. O trailer informa 2.315 registros e 761 cartas, enquanto o arquivo contém 3.062 registros de dados (765 cartas tipo 1). Divergência reportada como alerta.

### Header: Template Header-Trailler Arquivos BOLETO DE PARCELAS ("0"/"9", 406 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Fixo '0' |
| `IFXDATE` | 2 | 9 | 8 | D (AAAAMMDD) |  |  | Data do Processamento _Obs.: Formato não informado no layout; AAAAMMDD é o formato das demais datas do mesmo layout._ |
| `EMPRESA` | 10 | 11 | 2 | N |  |  | Empresa |
| `SEQUENCIA` | 12 | 21 | 10 | A |  |  | Sequência (sequence_cartacamp.nextval) |
| `FILLER` | 22 | 398 | 377 | A |  |  | Brancos |
| `SEQ_REG` | 399 | 406 | 8 | A |  |  | Sequência relativa do registro no arquivo |

### Trailer

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Fixo '9' |
| `TOTAL_REGISTROS` | 2 | 16 | 15 | N |  |  | Total de registros do arquivo (sem header a trailler do arquivo) |
| `TOTAL_CARTAS` | 17 | 31 | 15 | N |  |  | Total de cartas de cobrança |
| `FILLER` | 32 | 398 | 367 | A |  |  | Completar registro com espaços |
| `SEQ_REG` | 399 | 406 | 8 | A |  |  | Sequência relativa do registro no arquivo |

### Registro tipo 1: Endereço de correspondência (406 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `DMACCTG` | 1 | 1 | 1 | A |  | x | Fixo '1' — Grupo 1 – Produtos cartão CSF |
| `DMACCT` | 2 | 17 | 16 | A |  | x | Nº Conta-Nº Contrato / Nº Contrato (Chave) |
| `DMZIP` | 18 | 25 | 8 | N |  | x | CEP do endereço de correspondência |
| `DMNAME` | 26 | 75 | 50 | A |  | x | Nome do titular |
| `DMADDR1` | 76 | 125 | 50 | A |  | x | Rua do endereço de correspondência |
| `U1NUMENDCLTE` | 126 | 130 | 5 | A |  |  | Número do endereço de correspondência |
| `DMADDR2` | 131 | 180 | 50 | A |  |  | Complemento do endereço de correspondência |
| `DMADDR3` | 181 | 205 | 25 | A |  |  | Bairro do endereço de correspondência |
| `DMCITY` | 206 | 230 | 25 | A |  |  | Cidade do endereço de correspondência |
| `DMSTATE` | 231 | 232 | 2 | A |  |  | Estado do endereço de correspondência |
| `FILLER` | 233 | 388 | 156 | A |  |  | Completar registro com espaços |
| `ID_CORRESPONDENCIA` | 389 | 398 | 10 | N |  |  | Identificador da correspondência (zeros à esquerda) |
| `SEQ_REG` | 399 | 406 | 8 | N |  |  | Sequência relativa do registro no arquivo |

### Registro tipo 2: Parcela (406 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Fixo '2' |
| `DMACCT` | 2 | 17 | 16 | A |  | x | Nº Conta-Nº Contrato / Nº Contrato (Chave) |
| `BLNUMPARC` | 18 | 19 | 2 | N |  | x | Número da Parcela |
| `BLDTVENC` | 20 | 27 | 8 | D (AAAAMMDD) |  | x | Vencimento da Parcela (AAAAMMDD) |
| `BLVLBOLETO` | 28 | 38 | 11 | N | 2 | x | Valor da Parcela |
| `SITUACAO_PARCELA` | 39 | 58 | 20 | A |  |  | Situação da Parcela (get_status_parcela) |
| `QTD_PARCELAS` | 59 | 61 | 3 | N |  | x | Quantidade de Parcelas (ahprd+1) |
| `DMSSNUM` | 62 | 91 | 30 | A |  | x | Identificador do cliente (des_regis) |
| `BLNUMACORDO` | 92 | 99 | 8 | N |  | x | Identificador do acordo (cod_parce) _Obs.: Layout indica tipo A; o conteúdo é o AHID (8 posições) e é comparado numericamente com o AHID de 13 posições dos demais layouts._ |
| `FILLER` | 100 | 398 | 299 | A |  |  | Completar registro com espaços |
| `SEQ_REG` | 399 | 406 | 8 | N |  |  | Sequência relativa do registro no arquivo |

### Registro tipo 3: Ficha de compensação (406 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Fixo '3' |
| `DMACCT` | 2 | 17 | 16 | A |  | x | Número do cartão do cliente |
| `BLLOCAL1` | 18 | 107 | 90 | A |  | x | Local de pagamento da ficha de compensação |
| `BLDTVENC` | 108 | 115 | 8 | D (AAAAMMDD) |  | x | Vencimento da ficha de compensação |
| `BLCEDENTE` | 116 | 161 | 46 | A |  | x | Cedente da ficha de compensação _Obs.: Layout indica tipo D (data); conteúdo é texto (nome do cedente). Armazenado como texto._ |
| `BLAGENCIA` | 162 | 167 | 6 | A |  | x | Agência/Código cedente na ficha de compensação |
| `BLDVAGENCIA` | 168 | 169 | 2 | A |  |  | Dígito da agência |
| `BLCONTACOR` | 170 | 177 | 8 | A |  | x | Conta |
| `BLDTCONTACOR` | 178 | 180 | 3 | A |  | x | Dígito da Conta |
| `IFXDATE` | 181 | 188 | 8 | D (AAAAMMDD) |  | x | Data de processamento / Documento na ficha de compensação |
| `BLNUMDOC` | 189 | 206 | 18 | A |  | x | Número do documento na ficha |
| `BLCARTEIRA_REC` | 207 | 208 | 2 | A |  | x | Nosso número no recibo do cliente (carteira) |
| `BARRA` | 209 | 209 | 1 | A |  | x | Fixo '/' |
| `NOSSO_NUMERO` | 210 | 220 | 11 | A |  | x | Nosso número na ficha de compensação |
| `HIFEN` | 221 | 221 | 1 | A |  | x | Fixo '-' |
| `NOSSO_NUMERO_DV` | 222 | 224 | 3 | A |  | x | Dígito do nosso número |
| `BLDTVENC_FATURA` | 225 | 232 | 8 | D (AAAAMMDD) |  | x | Data de vencimento da fatura em atraso |
| `BLVLBOLETO` | 233 | 243 | 11 | N | 2 | x | Total a pagar |
| `U1VLMINIMO` | 244 | 254 | 11 | N | 2 | x | Pagamento mínimo |
| `USO_BANCO` | 255 | 264 | 10 | A |  |  | Uso do banco na ficha de compensação |
| `BLTPDOC` | 265 | 267 | 3 | A |  | x | Espécie de documento |
| `BLCARTEIRA` | 268 | 270 | 3 | A |  | x | Carteira na Ficha de Compensação |
| `BLMOEDA` | 271 | 275 | 5 | A |  | x | Moeda na ficha de compensação |
| `BLCODBARRA` | 276 | 325 | 50 | A |  | x | Código de Barras da Ficha de Compensação |
| `BLLINHADIG` | 326 | 394 | 69 | A |  | x | Linha Digitável (Formatada) da Ficha de Compensação |
| `BLNUMPARC` | 395 | 396 | 2 | N |  | x | Número da Parcela |
| `QTD_PARCELAS` | 397 | 398 | 2 | N |  | x | Quantidade de Parcelas (ahprd+1) |
| `SEQ_REG` | 399 | 406 | 8 | N |  |  | Sequência relativa do registro no arquivo |

### Registro tipo 4: Dívida original (406 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Fixo '4' |
| `U1CDCREDOR` | 2 | 9 | 8 | A |  | x | Código do Credor |
| `DMSSNUM` | 10 | 39 | 30 | A |  | x | Identificação do cliente |
| `U1PRODUTO` | 40 | 47 | 8 | A |  | x | Código do Produto |
| `DMACCT` | 48 | 77 | 30 | A |  | x | Nº do Contrato |
| `DMDLQDT` | 78 | 85 | 8 | D (AAAAMMDD) |  | x | Vencimento do Original |
| `AHID` | 86 | 93 | 8 | N |  | x | Identificador do Parcelamento |
| `PRESTACAO_ORIGINAL` | 94 | 96 | 3 | A |  | x | Número da Prestação Original _Obs.: Sem tipo definido no layout; amostra contém "0  " (alinhado à esquerda). Armazenado como texto._ |
| `DMAMTDLQ` | 97 | 107 | 11 | N | 2 | x | Valor Principal da Dívida Original |
| `DMCURBAL` | 108 | 118 | 11 | N | 2 | x | Valor corrigido da Dívida |
| `FILLER` | 119 | 398 | 280 | A |  |  | Completar registro com espaços |
| `SEQ_REG` | 399 | 406 | 8 | N |  |  | Sequência |

## Carta Campanha (CCAM) (`CCAM`)

- **Nomenclatura:** `CCAM_XXXXX_AAAAMMDD_HHMMSS.txt`
- **Finalidade:** Arquivo que envia carta campanha
- **Planilha de origem:** Layout Remessa Carta - Campanha - (Arquivo CCAM).xlsx

**Observações**

- _Informação:_ Existem duas planilhas CCAM no pacote ("(Arquivo CCAM).xlsx" e "(Arquivo CCAM)(1).xlsx"); o conteúdo foi comparado e é idêntico.
- _Correção aplicada:_ Header: planilha indica SEQ-REG em 22-29, sobreposto ao FILLER 12-362. Aplicada a posição 373-380 (mesma do trailer e dos registros de dados).
- _Arquivo real x layout:_ Carga de teste contém somente header e trailer (0 registros). O sistema registra a condição como "sem registros de dados".

### Header: Template Header-Trailler Arquivos CARTA CAMPANHA ("0"/"9", 380 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Fixo '0' |
| `IFXDATE` | 2 | 9 | 8 | D (AAAAMMDD) |  |  | Data do Processamento _Obs.: Formato não informado no layout; AAAAMMDD é o formato das demais datas do mesmo layout._ |
| `EMPRESA` | 10 | 11 | 2 | N |  |  | Empresa |
| `SEQUENCIA` | 12 | 21 | 10 | A |  |  | Sequência (sequence_cartacamp.nextval) |
| `FILLER` | 22 | 372 | 351 | A |  |  | Brancos |
| `SEQ_REG` | 373 | 380 | 8 | A |  |  | Sequência relativa do registro no arquivo |

### Trailer

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Fixo '9' |
| `TOTAL_REGISTROS` | 2 | 16 | 15 | N |  |  | Total de registros do arquivo (sem header a trailler do arquivo) |
| `TOTAL_CARTAS` | 17 | 31 | 15 | N |  |  | Total de cartas de cobrança |
| `FILLER` | 32 | 372 | 341 | A |  |  | Completar registro com espaços |
| `SEQ_REG` | 373 | 380 | 8 | A |  |  | Sequência relativa do registro no arquivo |

### Registro tipo 1: Endereço de correspondência (380 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `DMACCTG` | 1 | 1 | 1 | A |  | x | Fixo '1' — Grupo 1 – Produtos cartão CSF |
| `DMACCT` | 2 | 17 | 16 | A |  | x | Nº Conta-Nº Contrato / Nº Contrato (Chave) |
| `DMZIP` | 18 | 25 | 8 | A |  | x | CEP do endereço de correspondência |
| `DMNAME` | 26 | 75 | 50 | A |  | x | Nome do titular |
| `DNADDR1` | 76 | 125 | 50 | A |  | x | Rua do endereço de correspondência |
| `NUMERO_ENDERECO` | 126 | 130 | 5 | A |  |  | Número do endereço de correspondência |
| `DMADDR2` | 131 | 180 | 50 | A |  |  | Complemento do endereço de correspondência |
| `DMADDR3` | 181 | 205 | 25 | A |  |  | Bairro do endereço de correspondência |
| `DMCITY` | 206 | 230 | 25 | A |  |  | Cidade do endereço de correspondência |
| `DMSTATE` | 231 | 232 | 2 | A |  |  | Estado do endereço de correspondência |
| `FILLER` | 233 | 364 | 132 | A |  |  | Completar registro com espaços |
| `AHID` | 365 | 372 | 8 | N |  | x | ID do acordo |
| `SEQ_REG` | 373 | 380 | 8 | N |  |  | Sequência relativa do registro no arquivo |

### Registro tipo 2: Plano da campanha (380 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Fixo '2' |
| `DMACCT` | 2 | 17 | 16 | A |  | x | Nº Conta-Nº Contrato / Nº Contrato (Chave) |
| `CADTPROC` | 18 | 25 | 8 | D (AAAAMMDD) |  | x | Data de atualização da dívida _Obs.: Formato não informado no layout; AAAAMMDD por analogia ao layout de boletos._ |
| `CODIGO_BANCO` | 26 | 28 | 3 | A |  | x | Código do banco do cliente |
| `DMCURBAL` | 29 | 39 | 11 | N | 2 | x | Valor atualizado da dívida |
| `CADTVCENTR` | 40 | 47 | 8 | D (AAAAMMDD) |  |  | Data de validade da campanha |
| `CAQTDPA` | 48 | 49 | 2 | N |  | x | Quantidade de vezes do plano |
| `CAVLRPREST` | 50 | 60 | 11 | N | 2 | x | Valor da parcela do plano |
| `CAVLRDESC` | 61 | 71 | 11 | N | 2 | x | Valor do desconto do plano |
| `CAVLRDIVIDA` | 72 | 82 | 11 | N | 2 | x | Valor Total da Opção do plano |
| `NUM_CARTA_BOLETO` | 83 | 90 | 8 | N |  | x | Nº da Carta Boleto |
| `DMSSNUM` | 91 | 120 | 30 | A |  | x | Identificador do Cliente |
| `FILLER` | 121 | 372 | 252 | A |  |  | Brancos |
| `SEQ_REG` | 373 | 380 | 8 | N |  |  | Sequência relativa do registro no arquivo |

### Registro tipo 3: Ficha de compensação (380 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Fixo '3' |
| `DMSSNUM` | 2 | 17 | 16 | A |  | x | Número do cartão do cliente _Obs.: Campo nomeado DMSSNUM no layout, porém descrito como "Número do cartão do cliente"; não utilizado como CPF._ |
| `LOCAL_PAGAMENTO` | 18 | 180 | 163 | A |  | x | Local de pagamento da ficha de compensação |
| `VENCIMENTO` | 181 | 188 | 8 | D (AAAAMMDD) |  | x | Vencimento da ficha de compensação |
| `CEDENTE` | 189 | 224 | 36 | A |  | x | Cedente da ficha de compensação |
| `DATA_PROCESSAMENTO` | 225 | 232 | 8 | D (AAAAMMDD) |  |  | Data Processamento |
| `USO_BANCO` | 233 | 242 | 10 | A |  | x | Uso do banco na ficha de compensação |
| `ESPECIE_DOC` | 243 | 245 | 3 | A |  | x | Espécie de documento |
| `CARTEIRA` | 246 | 248 | 3 | A |  | x | Carteira na Ficha de Compensação |
| `MOEDA` | 249 | 253 | 5 | A |  | x | Moeda na ficha de compensação |
| `CODIGO_BARRAS` | 254 | 303 | 50 | A |  | x | Código de Barras da Carta Campanha |
| `LINHA_DIGITAVEL` | 304 | 372 | 69 | A |  | x | Linha digitável da carta campanha |
| `SEQ_REG` | 373 | 380 | 8 | N |  |  | Sequência relativa do registro no arquivo |

### Registro tipo 4: Dívida original / loja (380 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | A |  |  | Fixo '4' |
| `CODIGO_CREDOR` | 2 | 9 | 8 | A |  | x | Código do Credor |
| `IDENT_CLIENTE` | 10 | 39 | 30 | A |  | x | Identificação do cliente |
| `CODIGO_PRODUTO` | 40 | 47 | 8 | A |  | x | Código do Produto |
| `CONTRATO` | 48 | 77 | 30 | A |  | x | Nº do Contrato |
| `VENC_ORIGINAL` | 78 | 85 | 8 | D (AAAAMMDD) |  |  | Vencimento do Original |
| `ID_PARCELAMENTO` | 86 | 93 | 8 | N |  | x | Identificador do Parcelamento |
| `PRESTACAO_ORIGINAL` | 94 | 96 | 3 | N |  | x | Número da Prestação Original |
| `VALOR_PRINCIPAL_ORIG` | 97 | 107 | 11 | N | 2 | x | Valor Principal da Dívida Original |
| `VALOR_CORRIGIDO_SEM_DESC` | 108 | 118 | 11 | N | 2 | x | Valor corrigido da Dívida sem desconto |
| `VALOR_CORRIGIDO_COM_DESC` | 119 | 129 | 11 | N | 2 | x | Valor corrigido da Dívida com desconto |
| `CODIGO_REDE` | 130 | 137 | 8 | A |  | x | Código da Rede |
| `NOME_REDE` | 138 | 182 | 45 | A |  |  | Nome da Rede |
| `CODIGO_LOJA` | 183 | 190 | 8 | A |  |  | Código da Loja |
| `NOME_LOJA` | 191 | 235 | 45 | A |  |  | Nome da Loja |
| `FILLER` | 236 | 372 | 137 | A |  |  | Completar registro com espaços |
| `SEQ_REG` | 373 | 380 | 8 | N |  |  | Sequência |

## Quebra de Acordos (`QUEBRA_ACORDO`)

- **Nomenclatura:** `QUEBRA_ACORDO_XXXXX_AAAAMMDD_HHMMSS.txt`
- **Finalidade:** Arquivo com os acordos que foram quebrados
- **Planilha de origem:** Layout_Quebra_Acordos_V2.xlsx

**Observações**

- _Informação:_ Layout sem header/trailer: todas as linhas são registros de dados; não há quantidade de controle.

### Registro Acordo quebrado (73 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `AHID` | 1 | 13 | 13 | N |  | x | Número do Acordo _Obs.: Layout indica tipo A; tratado como numérico (identificador AHID)._ |
| `DMAGENCY` | 14 | 21 | 8 | A |  | x | Id da Assessoria que criou o acordo |
| `AHTYPE` | 22 | 29 | 8 | A |  | x | Tipo do Acordo Criado |
| `AHDT` | 30 | 37 | 8 | D (DDMMAAAA) |  | x | Data de Negociação (DDMMAAAA) |
| `AHPRD` | 38 | 40 | 3 | N |  | x | Número Total de Parcelas (incluindo a entrada) |
| `AHAUTDT` | 41 | 48 | 8 | D (DDMMAAAA) |  | x | Data da Quebra do Acordo (DDMMAAAA) |
| `DMACCT` | 49 | 73 | 25 | A |  | x | Número do contrato _Obs.: Layout indica tipo D (data); conteúdo é o número do contrato. Armazenado como texto._ |

## Elegibilidade de Acordos (`ELEGIBILIDADE`)

- **Nomenclatura:** `ELEGIBILIDADE_XXXXX_AAAAMMDD_HHMMSS.txt`
- **Finalidade:** Arquivo com os contratos elegíveis a acordo
- **Planilha de origem:** LayoutElegibilidadesAcordoCyber_v2.xlsx

**Observações**

- _Limitação:_ Apesar do De-Para descrever "contratos elegíveis a acordo", o layout NÃO possui contrato nem CPF: é um catálogo de tipos de acordo (AGTYPE) com vigência e parâmetros. A elegibilidade por contrato não pode ser determinada; o batimento é feito por Tipo de Acordo (AHTYPE) e vigência na data do acordo.
- _Arquivo real x layout:_ Carga de teste contém linhas compostas apenas por um espaço (1ª e última); são ignoradas com alerta.

### Registro Critério de acordo (tipo de acordo) (113 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `AGTYPE` | 1 | 8 | 8 | A |  | x | Tipo de Acordo |
| `AGINITDT` | 9 | 16 | 8 | D (MMDDAAAA) |  | x | Data Início Vigência (MMDDAAAA) |
| `AGENDDT` | 17 | 24 | 8 | D (MMDDAAAA) |  | x | Data Fim Vigência (MMDDAAAA) |
| `AGGRDAYS` | 25 | 27 | 3 | N |  | x | Dias de Carência |
| `AGRATE2` | 28 | 32 | 5 | N | 2 | x | Taxa de Juros carência |
| `AGBREAK` | 33 | 35 | 3 | N |  | x | Número de pagamentos não cumpridos para quebrar o acordo |
| `AGDMDAYSMIN` | 36 | 39 | 4 | N |  | x | Dias de atraso mínimo |
| `AGDMDAYSMAX` | 40 | 43 | 4 | N |  | x | Dias de atraso máximo |
| `AGPYTYPE` | 44 | 73 | 30 | A |  | x | Tipo Cotas / Juros |
| `AGRATE` | 74 | 78 | 5 | N | 2 | x | Taxa de Juros |
| `AGTAXRATE` | 79 | 83 | 5 | N | 2 | x | Imposto |
| `AGINITPYDAYS` | 84 | 87 | 4 | N |  | x | Max. Dias Pagamento Inicial |
| `AGLSTPYDAYS` | 88 | 91 | 4 | N |  | x | Max. Dias Pagamento Final |
| `AGINITPYMINP` | 92 | 94 | 3 | N |  | x | Faixa Pagamento Inicial |
| `AGINITPYMAXP` | 95 | 97 | 3 | N |  | x | Faixa Pagamento Final |
| `AGMININITPY` | 98 | 110 | 13 | N | 2 | x | Pagamento Inicial mínimo |
| `AGMAXPMTS` | 111 | 113 | 3 | N |  | x | Número de pagamentos máximo |

## Comissão (`COMISSAO`)

- **Nomenclatura:** `AAAAMMDD_HHMMSS_comissao_XXXXX_out.txt`
- **Finalidade:** Arquivo para acompanhamento das comissões
- **Planilha de origem:** Layout_Comissao_Cyber_Assessoria_V3.xlsx

**Observações**

- _Arquivo real x layout:_ A planilha indica a nomenclatura "RET_DISTRIBUICAO_..." na aba de dados (erro de cópia); a nomenclatura oficial (De-Para e aba Header) é AAAAMMDD_HHMMSS_comissao_XXXXX_out.txt.
- _Correção aplicada:_ Header: posições da planilha (2-18 e 19-24) conflitam com TAM (8 e 6). Aplicado 2-9 e 10-15, coerente com o tamanho real do header (15).
- _Arquivo real x layout:_ Carga de teste: data do trailer em AAAAMMDD (layout indica ddmmaaaa) e quantidade do trailer inclui header e trailer. Ambos registrados como alerta.
- _Arquivo real x layout:_ Carga de teste: campo GLOSA preenchido com branco (layout prevê S/N).
- _Limitação:_ O layout não possui ID do acordo (AHID). O relacionamento com acordos e repasses é feito apenas por contrato (e data/valor para o repasse).

### Header: Interface de Lote Comissões — Registro 0 (Header) / 9 (Trailler)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | N |  |  | Tipo de Registro — Fixo 0 |
| `DATA_GERACAO` | 2 | 9 | 8 | D (AAAAMMDD) |  |  | Data da Geração do Arquivo (AAAAMMDD) _Obs.: Planilha indica INI 2 / FIM 18 com TAM 8; aplicado 2-9 (TAM preservado)._ |
| `HORA_GERACAO` | 10 | 15 | 6 | N |  |  | Hora de Geração do Arquivo (hhmmss) _Obs.: Planilha indica INI 19 / FIM 24 com TAM 6; aplicado 10-15 (sequencial ao campo anterior)._ |

### Trailer

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | N |  |  | Tipo de Registro — Fixo 9 |
| `DATA_GERACAO` | 2 | 9 | 8 | D (DDMMAAAA) |  |  | Data de Geração do Arquivo (ddmmaaaa) |
| `HORA_GERACAO` | 10 | 15 | 6 | N |  |  | Hora de Geração do Arquivo (hhmmss) |
| `QTD_REGISTROS` | 16 | 23 | 8 | N |  |  | Total de registros do arquivo |

### Registro tipo 1: Dados da Comissão (130 posições)

| Campo | Início | Fim | Tam. | Tipo | Dec. | Obrig. | Descrição |
|---|---:|---:|---:|---|---:|:-:|---|
| `TIPO` | 1 | 1 | 1 | N |  |  | Tipo de Registro — Fixo 1 |
| `DATA_RECEBIMENTO` | 2 | 9 | 8 | D (MMDDAAAA) |  | x | Data do Recebimento da Prestação (mmddaaaa) |
| `CLIENTE` | 10 | 41 | 32 | A |  |  | Nome ou razão social do cliente - devedor principal |
| `CPF_CNPJ` | 42 | 55 | 14 | A |  |  | CPF/CNPJ do Cliente – devedor principal _Obs.: Layout indica tipo N; o conteúdo é alinhado à esquerda com brancos. Armazenado como texto._ |
| `GRUPO` | 56 | 56 | 1 | A |  |  | Grupo do Contrato |
| `CONTRATO` | 57 | 81 | 25 | A |  | x | Número identificador do contrato com dígito _Obs.: Layout indica tipo N; alinhado à esquerda com brancos. Armazenado como texto (mesma chave DMACCT)._ |
| `DATA_DISPONIBILIZACAO` | 82 | 89 | 8 | D (DDMMAAAA) |  |  | Data da Disponibilização do Contrato (ddmmaaaa) |
| `DATA_FIM` | 90 | 97 | 8 | D (DDMMAAAA) |  |  | Data Prevista para a saída do contrato ("Fim de Prazo") |
| `STATUS_CONTRATO` | 98 | 99 | 2 | A |  |  | Status do Contrato — conforme tabela _Obs.: Layout indica tipo N "conforme tabela", porém a tabela de domínio não foi fornecida e o conteúdo real é alfabético (A/R). Valor exibido sem tradução._ |
| `TIPO_COBRANCA` | 100 | 101 | 2 | A |  |  | Tipo de Cobrança — conforme tabela _Obs.: Tabela de domínio não fornecida._ |
| `PRESTACAO_ATRASO` | 102 | 104 | 3 | N |  |  | Prestação em Atraso — Número da Prestação |
| `ZEROS` | 105 | 105 | 1 | N |  |  | Zeros |
| `VALOR_RECEBIDO` | 106 | 117 | 12 | N | 2 |  | Valor de recebimento da prestação (10 inteiras e 2 decimais) |
| `GLOSA` | 118 | 118 | 1 | A |  |  | Informa se o pagamento foi glosado (S = Sim, N = Não) |
| `PCT_REM` | 119 | 121 | 3 | N |  |  | %Rem — Percentual da Remuneração Devida _Obs.: Casas decimais não definidas no layout; valor bruto._ |
| `REMUNERACAO_DEVIDA` | 122 | 130 | 9 | N |  |  | Total da remuneração devida _Obs.: Casas decimais não definidas no layout; armazenado o valor bruto (inteiro) sem conversão._ |

## Rejeição de Campanha Externa (`REJ_CAMPANHA_EXT`)

- **Nomenclatura:** `tb_campanha_rej_ext_XXXXX_AAAAMMDD_HHMMSS.txt`
- **Finalidade:** Arquivo com os contratos que tiveram a campanha rejeitada
- **Planilha de origem:** não há (De-Para)

**Observações**

- _Limitação:_ De-Para: "Sem layout, contém somente o contrato e o motivo da rejeição". Como não há posições definidas, as linhas são armazenadas integralmente; a extração de contrato/motivo depende de configuração (Configurações > Rejeição de campanha).

## Rejeição de Campanha Interna (`REJ_CAMPANHA_INT`)

- **Nomenclatura:** `tb_campanha_rej_int_XXXXX_AAAAMMDD_HHMMSS.txt`
- **Finalidade:** Arquivo com os contratos que tiveram a campanha rejeitada (interna)
- **Planilha de origem:** não há (De-Para)

**Observações**

- _Limitação:_ Não consta no De-Para com nomenclatura própria; segue a mesma regra da rejeição externa (sem layout: contrato e motivo). Extração depende de configuração.

## Campanha da Assessoria (CY_IE003) (`CAMPANHA_ASSESSORIA`)

- **Nomenclatura:** `CY_IE003_AAAAMMDD_XXXXX.txt`
- **Finalidade:** Arquivo de campanha da assessoria
- **Planilha de origem:** Layout_campanha_assessoria_V3 - Arq_CY (não fornecido)

**Observações**

- _Limitação:_ Citado no De-Para, mas o layout não está no pacote Layouts_Pos_validacao.zip. O arquivo é armazenado para auditoria sem interpretação.

## Rajada de Pagamentos PIX (`RAJADA_PIX`)

- **Nomenclatura:** `CSF_RAJADAS_PGTOS_PIX_XXXXX_AAAAMMDD`
- **Finalidade:** Pagamentos via pix do contrato distribuído para assessoria
- **Planilha de origem:** Layout_Rajada Pix (não fornecido)

**Observações**

- _Limitação:_ Citado no De-Para, mas o layout não está no pacote. Armazenado para auditoria sem interpretação.

## Regras de relacionamento do motor de batimento

### A. Distribuição de contratos

Contratos enviados pelo banco, reconhecidos no batimento, redistribuídos e retirados da carteira.

Arquivos: `REM_CONTRATOS`, `BAT_CONTRATOS`, `RET_DISTRIBUICAO`, `RET_CARTEIRA`

- Chave: DMACCT (Nº Conta-Nº Contrato / Nº Contrato).
- Situação do contrato: evento mais recente entre distribuição (data de geração do REM_CONTRATOS) e retirada (IXFDATE do RET_DISTRIBUICAO ou data de geração do RET_CARTEIRA). Retirada na mesma data ou posterior => RETIRADO.
- REM_CONTRATOS é incremental (inclusões/atualizações): a ausência de remessa para um contrato retirado é informativa. O reconhecimento oficial é feito contra a fotografia BAT_CONTRATOS.
- BAT_CONTRATOS (última fotografia): contratos ativos distribuídos até a data do batimento x contratos do batimento. Campos comparados: DMSSNUM, DMNAME, DMCURBAL, DMAMTDLQ, DMDLQDT.

### B. Acordos

Acordos realizados pela assessoria e seu reconhecimento no arquivo de batimento do banco.

Arquivos: `ACORDO_ASSESSORIA`, `BAT_ACORDO`

- Chave: AHID (ID do acordo), presente na posição 224-236 dos dois layouts.
- Cada AHID é representado pela importação mais recente que o contém (uma linha por parcela).
- Campos comparados com BAT_ACORDO: DMACCT, DMSSNUM, AHDT, AHTOTPMT, VALOR_ENTRADA, AHPRD, AHTYPE.
- Acordos com data posterior à geração do BAT_ACORDO não são cobrados como não reconhecidos.

### C. Pagamentos

Pagamentos repassados pelo banco confrontados com os acordos e com o batimento de pagamentos.

Arquivos: `REPASSE`, `BAT_ACORDO_PGTO`, `ACORDO_ASSESSORIA`

- REPASSE x ACORDO_ASSESSORIA: chave AHID; compara PMACCT x DMACCT e CPF.
- Pagamento sem AHID ou com AHID inexistente nos acordos => Pagamento não identificado.
- Linhas de REPASSE idênticas em arquivos diferentes => Duplicidade (contabilizadas uma única vez).
- REPASSE x BAT_ACORDO_PGTO: chave AHID + data do pagamento (PMTDATE x APINDATE) + valor (PMAMT x APAMT). Mesmo AHID e data com valor diferente => Divergência de valor.
- Acordos com parcela vencida no período coberto pelos repasses e sem pagamento => informativo.

### D. Parcelas e boletos

Parcelas, vencimentos e valores dos boletos confrontados com os acordos.

Arquivos: `REM_BOLETOS`, `ACORDO_ASSESSORIA`

- Registro tipo 2 (parcela). Chave: BLNUMACORDO (AHID, comparado numericamente) + BLDTVENC x APDUEDT.
- Campos comparados: BLVLBOLETO x APAMT, DMACCT, DMSSNUM e QTD_PARCELAS (ahprd+1) x AHPRD+1.
- Mesmo acordo e vencimento repetidos no mesmo arquivo => Duplicidade.

### E. Quebra de acordos

Acordos quebrados relacionados ao acordo original, com atualização de status.

Arquivos: `QUEBRA_ACORDO`, `ACORDO_ASSESSORIA`

- Chave: AHID (Número do Acordo). O status do acordo passa a QUEBRADO com a data AHAUTDT.
- Campos comparados: DMACCT, AHTYPE e AHDT (Data de Negociação x Data do Acordo).
- AHPRD não é comparado: na Quebra significa "total incluindo a entrada" e no Acordo "Qtde de parcelas".

### F. Elegibilidade

Tipos de acordo elegíveis (catálogo) confrontados com os acordos realizados.

Arquivos: `ELEGIBILIDADE`, `ACORDO_ASSESSORIA`, `REM_CONTRATOS`

- O layout de Elegibilidade NÃO contém contrato nem CPF; é um catálogo de tipos de acordo (AGTYPE) com vigência.
- Chave: AHTYPE (Tipo Acordo) x AGTYPE (Tipo de Acordo) da última Elegibilidade importada.
- Elegível: tipo existente e AHDT dentro de AGINITDT..AGENDDT. Fora da vigência => Divergência de data. Tipo inexistente => Divergência cadastral.
- Elegibilidade por contrato (REM_CONTRATOS): requer configuração de regra — não há campo de relacionamento no layout.

### G. Comissionamento

Registros de comissão relacionados a acordos e pagamentos.

Arquivos: `COMISSAO`, `ACORDO_ASSESSORIA`, `REPASSE`

- O layout de Comissão não possui AHID: relacionamento por CONTRATO (mesma chave DMACCT).
- COMISSAO x REPASSE: CONTRATO + DATA_RECEBIMENTO (x PMTDATE) + VALOR_RECEBIDO (x PMAMT). Mesmo contrato e data com valor diferente => Divergência de valor.
- Recebimentos em datas não cobertas pelos repasses importados => informativo.
- Linhas idênticas no mesmo arquivo de comissão => Duplicidade.

### H. Campanhas

Registros de campanha enviados (CCAM) e rejeitados (rejeição interna/externa).

Arquivos: `CCAM`, `REJ_CAMPANHA_EXT`, `REJ_CAMPANHA_INT`

- Chave: contrato (DMACCT do registro tipo 1 da CCAM x contrato informado na rejeição).
- Arquivos de rejeição não possuem layout: a extração do contrato e do motivo depende de configuração.
- Arquivos de rejeição vazios são registrados como "sem informação" e não como sucesso.
