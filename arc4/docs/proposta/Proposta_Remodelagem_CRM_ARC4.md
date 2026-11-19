# Proposta de Remodelagem — CRM de Cobrança ARC4

Nov 19, 2026 · @Matheus

## Resumo executivo

A proposta troca o CRM centrado em contrato e alimentado por sobrescrita
por uma **base 360º do devedor, versionada por carga**: cada arquivo do
banco vira um lote rastreável, cada campo guarda sua origem, e toda
edição manual fica registrada sem ser apagada pela próxima importação.

A carga de 19/11/2026 (27 arquivos, 9 tipos × 3 EPS) mostra por que isso
é necessário:

- **10.353 contratos** chegam ao mesmo tempo nas EPS 0140 e 0900, com o
  mesmo grupo e a mesma curva. Hoje não há regra explícita de qual
  marcação prevalece.

- **177 telefones** enviados como contato aparecem também na lista de
  telefones bloqueados. Esses números não devem ser acionados pela
  operação.

- **24.778 acordos** vêm no ACORDO_ATUAL, mas o campo acordo_ativo da
  remessa está N em 100% dos contratos. O sinalizador do banco não é
  confiável e precisa ser derivado.

- **18.858 retiradas** referem contratos que já não estão na remessa do
  dia. Elas só fazem sentido aplicadas sobre o histórico, não sobre o
  arquivo.

- **253.317 linhas de telefone duplicadas** (mesmo contrato e número)
  entre as três EPS.

O que muda para a operação:

1.  Uma única tela de consulta por CPF, com todos os contratos,
    credores, rankings e contatos visíveis sem trocar de aba.

2.  Qualquer campo é editável no lugar, com motivo, autor e data, e com
    a indicação de quando o banco enviou um valor diferente depois.

3.  Uma central de importação que valida, reconcilia e publica cada
    lote, com relatório de divergências antes de afetar a carteira.

4.  Os rankings oficiais ARC4 (grupos G1–G4, C1–C3, COINCIDENTES, M, A1,
    Mundo Z, \<500, Prescrito) viram dimensão de primeira classe:
    filtro, fila, cor e histórico de migração.

## Diagnóstico

A carga é coerente internamente (zero órfãos entre parcelas, telefones e
remessa), mas traz conflitos entre EPS, campos sem valor informativo e
quatro formatos de data. O CRM atual absorve tudo isso sem sinalizar.

### Arquivos da carga de 19/11/2026

Todos chegam como CSV em ZIP, separador ;, codificação Latin-1, um
arquivo por tipo e por EPS (0140, 0144, 0900).

| Arquivo              | Chave                              | Linhas 0140 | Linhas 0144 | Linhas 0900 | Achado principal                                                                                |
|----------------------|------------------------------------|-------------|-------------|-------------|-------------------------------------------------------------------------------------------------|
| REMESSA_ARC4U        | contrato_original                  | 660.367     | 15.679      | 171.015     | 82 colunas; base do estoque. 10.353 contratos repetidos entre 0140 e 0900                       |
| PARCELAS             | contrato_original + numero_parcela | 1.813.224   | 158.226     | 315.303     | Soma de curva_parcela bate com valor_curva em 99,8%; 1.704 contratos divergem de R\$ 1 a R\$ 10 |
| TELEFONE             | contrato_original + ddd + número   | 2.018.955   | 49.545      | 536.476     | 253.317 linhas duplicadas; 177 números constam na lista de bloqueio                             |
| TELEFONES_BLOQUEADOS | ddd + número (contrato \*)         | 6.661       | 6.661       | 6.661       | Arquivo idêntico nas 3 EPS: é uma lista global, não por contrato                                |
| ACORDO_ATUAL         | contrato_original → contrato_atual | 8.388       | 14.522      | 1.868       | Remessa marca acordo_ativo = N para todos eles                                                  |
| PAGAMENTO            | contrato_original + data + parcela | 30.494      | 32.655      | 1.579       | R\$ 12,94 mi no total, com histórico desde 05/2021: vem acumulado, não só o dia                 |
| RETIRADA             | contrato_original                  | 18.688      | 54          | 116         | Nenhum contrato retirado está na remessa do dia                                                 |
| GARANTIAS            | contrato_original + id_garantia    | 790         | 881         | 0           | Veículos (AliFidVeiculo) e FGO; 58 colunas, a maioria vazia                                     |
| AVALISTAS            | contrato_original                  | 0           | 0           | 0           | Só cabeçalho; estrutura precisa existir para quando vier                                        |

### Problemas de qualidade dos dados

- **Datas em formatos mistos.** MMDDAAAA na remessa, parcelas, retiradas
  e nascimento; DDMMAAAA no PAGAMENTO (ex.: 13112026); DD/MM/AAAA no
  vencimento do acordo. Uma leitura errada inverte dia e mês sem gerar
  erro.

- **Cabeçalhos irregulares.** numero_parcelas \_atraso (espaço no meio)
  e CamecDate \| data_camec. O importador deve mapear por dicionário,
  não por nome literal.

- **Campos sem informação.** segmentacao_do_contrato vem como
  ERROR_LEVEL\_… em 100% das linhas; inibicao_cobranca, ajuizado e
  elegivel_entrega_amigavel vêm N em 100%. risco_devedor é S/I em 91%
  (0140).

- **Duas chaves de contrato.** contrato muda com renegociação
  (CP-53691257A-REN01) e contrato_original não. Divergem em 11.923
  (0140), 14.657 (0144) e 1.609 (0900) contratos. A chave estável é
  contrato_original.

- **Vários contratos por pessoa.** Na 0140 são 660.367 contratos para
  482.881 CPF/CNPJ. O devedor precisa ser a entidade central, não o
  contrato.

### Telas do CRM atual

As telas mostram a mesma informação espalhada em 10+ abas e travada em
campos somente leitura.

| Tela      | O que funciona                                | O que atrapalha                                                                                                                              |
|-----------|-----------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------|
| Cadastro  | Reúne dados pessoais e débito atual           | Um contrato por vez; Grupo, Ranking e Segmento em cinza sem explicação; status em fundo vermelho saturado; sem origem nem data de cada valor |
| Endereços | Lista e “Definir como primário”               | Formulário separado da grade; sem fonte, data nem validação de CEP                                                                           |
| Telefones | Score, prioridade, origem, bloqueio visível   | Score -1 e Qualidade sem legenda; não diz se o número está na lista de bloqueio do banco nem quando chegou                                   |
| E-mails   | Status de validade                            | Mostra True cru; colunas técnicas (IdEnderecoDeE…) expostas ao operador                                                                      |
| Débitos   | Todos os contratos do CPF, de vários credores | Detalhamento vazio até selecionar; sem grupo/ranking por contrato; sem totais                                                                |
| Acordos   | Parcelas e ajuste de parcelamento             | Editar valor e vencimento sem motivo nem trilha de auditoria                                                                                 |

A produtividade diária (8 acessados, 0 acionados, 0 promessas) aparece
num canto da tela de cadastro, competindo com a consulta.

## Rankings oficiais ARC4

O campo grupo_arc4u da remessa é o ranking oficial e passa a ser a
dimensão principal de organização: filtro padrão, agrupamento das filas
e etiqueta em cada contrato. O sistema guarda também
grupo_anterior_arc4u (A/B/C/D) e o histórico de cada migração entre
cargas.

| Grupo        | Contratos 0140 | Contratos 0144 | Contratos 0900 | Curva total (R\$ mi) | Atraso mediano (dias) |
|--------------|----------------|----------------|----------------|----------------------|-----------------------|
| G1           | 166.476        | —              | 328            | 1.117,9              | 618                   |
| G2           | 308.715        | —              | 32.263         | 2.452,3              | 1.071                 |
| G3           | —              | —              | 78.386         | 268,3                | 1.354                 |
| G4           | —              | —              | 56.483         | 206,4                | 1.569                 |
| COINCIDENTES | 185.064        | 2              | 1.728          | 1.550,7              | 1.242                 |
| C1           | 37             | 32             | 514            | 2,1                  | 83                    |
| C2           | —              | 15.314         | 25             | 72,6                 | 0                     |
| C3           | —              | 331            | 3              | 1,6                  | 524                   |
| M            | 37             | —              | 50             | 5,9                  | 989                   |
| Prescrito    | 1              | —              | 1.235          | 2,7                  | 1.834                 |
| A1           | 10             | —              | —              | 0,2                  | 0                     |
| Mundo Z      | 20             | —              | —              | 0,1                  | 49                    |
| \<500        | 7              | —              | —              | 0,02                 | 39                    |

Contagens por arquivo, antes de remover os 10.353 contratos repetidos
entre 0140 e 0900 (todos com o mesmo grupo nas duas EPS).

Regras propostas para preservar o ranking:

- O grupo é sempre o **valor do banco**: não é editável pelo operador. A
  operação pode criar etiquetas e filas próprias por cima, sem alterar o
  oficial.

- Os códigos de EPS (0140, 0144, 0900) são uma segunda dimensão, a
  carteira/canal de origem. Os nomes de exibição ficam num cadastro
  editável, não no código.

- Cada mudança de grupo entre duas cargas gera um evento (de G2 para G3,
  por exemplo), consultável na linha do tempo do contrato e agregável
  numa matriz de migração.

- Grupos novos que apareçam numa carga não quebram a importação: entram
  como “grupo não catalogado” e geram alerta para o cadastro.

## Novo conceito

O sistema separa o que o banco diz do que a operação sabe, e mostra os
dois juntos numa só tela. Seis princípios orientam o desenho:

1.  **O devedor é o centro.** A consulta abre por CPF/CNPJ e mostra
    todos os contratos, de todas as EPS e credores, com totais. O
    contrato é um nível abaixo.

2.  **Nada é sobrescrito.** Cada carga é um lote imutável. O estado
    atual é calculado a partir dos lotes e das edições, e qualquer
    versão anterior pode ser reconstruída.

3.  **Todo campo tem origem.** Cada valor exibido sabe de qual arquivo,
    lote e linha veio, ou quem o editou, quando e por quê. Isso aparece
    ao passar o mouse.

4.  **Edição é uma camada, não uma substituição.** O operador edita
    qualquer campo no lugar. A edição vira um registro sobreposto ao
    valor do banco. Quando o banco envia um valor novo, o sistema avisa
    o conflito em vez de apagar a correção.

5.  **Contatos têm ciclo de vida.** Telefone e e-mail acumulam fontes,
    datas, resultados de contato e bloqueios. A lista global de bloqueio
    prevalece sobre qualquer prioridade.

6.  **O ranking oficial é intocável e sempre visível.** Grupo ARC4 e EPS
    aparecem em cada contrato, filtram as filas e têm histórico de
    migração.

Para ficar claro o que “100% editável” significa:

| Tipo de campo             | Exemplos                                                              | Comportamento                                                              |
|---------------------------|-----------------------------------------------------------------------|----------------------------------------------------------------------------|
| Editável livre            | Telefone, e-mail, endereço, observações, melhor horário               | Edita no lugar; pede motivo apenas ao invalidar ou excluir                 |
| Editável com sobreposição | Nome, data de nascimento, profissão, risco                            | Edita no lugar com motivo obrigatório; valor do banco fica visível ao lado |
| Editável com alçada       | Parcelas e vencimentos de acordo, status do cadastro                  | Exige perfil autorizado; gera evento de auditoria                          |
| Somente banco             | Grupo ARC4, EPS, curva, principal, dias de atraso, parcelas originais | Leitura; o operador pode abrir uma contestação para o banco                |

A interface também é configurável: cada perfil escolhe colunas, ordem
dos blocos, filtros salvos e visões por grupo, sem mexer no código.

## Modelo de dados integrado

O modelo tem três camadas: **bruta** (o arquivo como chegou),
**canônica** (entidades limpas e versionadas) e **operação** (edições,
acionamentos e filas). A chave de ligação entre todos os arquivos é
contrato_original; a do devedor é o documento normalizado (11 ou 14
dígitos).

| Entidade                    | Alimentada por                                       | Chave natural                             | Observação                                                                        |
|-----------------------------|------------------------------------------------------|-------------------------------------------|-----------------------------------------------------------------------------------|
| devedor                     | REMESSA (nome, nascimento, gênero, profissão, risco) | documento                                 | Uma linha por CPF/CNPJ; atributos com versão                                      |
| contrato                    | REMESSA                                              | contrato_original                         | Guarda também contrato_atual (sufixo REN), produto, estratégia e safra            |
| contrato_posicao            | REMESSA                                              | contrato_original + lote                  | Foto financeira por carga: curva, principal, juros, multa, atraso, grupo, cluster |
| marcacao_eps                | REMESSA                                              | contrato_original + EPS                   | Permite um contrato em duas EPS e decide a primária por regra                     |
| parcela                     | PARCELAS                                             | contrato_original + número                | Versão por lote; base para conferir a curva                                       |
| acordo / acordo_parcela     | ACORDO_ATUAL                                         | id_acordo_atual                           | Status, EPS do acordo, parcela atual e atraso                                     |
| pagamento                   | PAGAMENTO                                            | hash de contrato + data + parcela + valor | Idempotente: o arquivo vem acumulado desde 2021                                   |
| retirada                    | RETIRADA                                             | contrato_original + data_baixa            | Encerra o contrato na carteira com motivo                                         |
| garantia                    | GARANTIAS                                            | id_garantia                               | Veículo/FGO; colunas vazias ficam em JSON                                         |
| avalista                    | AVALISTAS                                            | contrato_original + documento             | Pronta mesmo sem dados hoje                                                       |
| endereco / email / telefone | REMESSA, TELEFONE, operação                          | devedor + valor normalizado               | Um contato, várias fontes (contato_fonte)                                         |
| bloqueio_contato            | TELEFONES_BLOQUEADOS, operação                       | ddd + número                              | Global; prevalece sobre prioridade e score                                        |
| ranking_grupo               | cadastro                                             | código do grupo                           | Nome, ordem, cor e descrição dos grupos ARC4                                      |
| lote_importacao / arquivo   | importador                                           | data + tipo + EPS + hash                  | Rastreabilidade de toda linha                                                     |
| valor_sobreposto            | operador                                             | entidade + campo                          | Edição manual com autor, motivo e valor do banco na época                         |
| evento                      | tudo                                                 | id                                        | Linha do tempo: cargas, mudanças de grupo, edições, acordos, pagamentos           |

Cada linha canônica carrega lote_id, arquivo_id e linha_origem. Com
isso, qualquer número na tela leva ao arquivo e à linha que o
produziram.

-- Núcleo da rastreabilidade (PostgreSQL)  
create table lote_importacao (  
id bigserial primary key,  
data_carga date not null,  
status text not null check (status in
('recebido','validado','publicado','rejeitado')),  
publicado_em timestamptz  
);  
  
create table arquivo (  
id bigserial primary key,  
lote_id bigint not null references lote_importacao(id),  
tipo text not null, -- REMESSA_ARC4U, PARCELAS, TELEFONE...  
eps char(4) not null, -- 0140, 0144, 0900  
sha256 char(64) not null unique, -- impede importar o mesmo arquivo duas
vezes  
linhas integer not null  
);  
  
create table contrato_posicao (  
contrato_original text not null,  
lote_id bigint not null references lote_importacao(id),  
eps char(4) not null,  
grupo_arc4u text not null references ranking_grupo(codigo),  
grupo_anterior text,  
valor_curva numeric(14,2),  
valor_principal numeric(14,2),  
dias_atraso integer,  
arquivo_id bigint not null references arquivo(id),  
linha_origem integer not null,  
primary key (contrato_original, lote_id, eps)  
);  
  
create table valor_sobreposto (  
id bigserial primary key,  
entidade text not null, -- devedor, telefone, endereco...  
entidade_id text not null,  
campo text not null,  
valor_banco text, -- o que o banco dizia quando foi editado  
valor_editado text not null,  
motivo text not null,  
autor text not null,  
criado_em timestamptz not null default now(),  
ativo boolean not null default true  
);

## Pipeline de importação e rastreabilidade

Cada carga diária passa por oito etapas e só chega à operação depois de
publicada inteira. Se algo falha, a base continua na versão anterior.

1.  **Receber.** Os 27 ZIPs entram como um lote com identificador único.
    O SHA-256 de cada arquivo impede reimportação; o nome
    (AAAAMMDD_TIPO_EPS_OUT) define tipo e EPS.

2.  **Validar estrutura.** Cabeçalho conferido contra um dicionário de
    colunas por tipo, com apelidos (numero_parcelas \_atraso →
    numero_parcelas_atraso). Coluna nova vira aviso; coluna obrigatória
    ausente rejeita o arquivo.

3.  **Normalizar campos e domínios.** Datas pelo formato declarado de
    cada coluna; valores, documentos e telefones padronizados;
    instituição e produto pelos dicionários de domínio.

4.  **Conciliar entre arquivos.** Parcelas contra remessa, telefones
    contra bloqueios, acordos contra contratos, retiradas contra a base
    histórica.

5.  **Simular.** O lote é aplicado numa cópia da base e gera o relatório
    de impacto, sem tocar na versão publicada.

6.  **Revisar.** O aprovador lê o relatório de simulação.

7.  **Aprovar.** Sempre por outro usuário, com perfil Aprovador; quem
    enviou não aprova.

8.  **Publicar.** Troca atômica para a nova versão, eventos na linha do
    tempo e atualização das filas. A versão anterior fica guardada.

### Regras de reconciliação

| Regra                  | Quando dispara                                                       | Ação                                                                                                        | Volume em 19/11              |
|------------------------|----------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|------------------------------|
| Contrato em duas EPS   | Mesmo contrato_original em mais de uma remessa                       | Mantém as duas marcações; define a primária pela tabela de precedência; vai para a fila de conflitos        | 10.378 contratos             |
| Telefone bloqueado     | DDD + número consta em TELEFONES_BLOQUEADOS                          | Marca o contato como bloqueado; vai para o fim da lista e não aparece como opção no registro de acionamento | 177 linhas                   |
| Telefone duplicado     | Mesmo contrato + DDD + número                                        | Uma linha só; guarda todas as fontes e a menor prioridade                                                   | 253.317 linhas               |
| Acordo sem sinalizador | Existe ACORDO_ATUAL e acordo_ativo = N                               | acordo_ativo passa a ser derivado do status do acordo                                                       | 24.778 acordos               |
| Curva divergente       | Soma das parcelas difere da curva em mais de R\$ 1                   | Aviso no contrato e no relatório; não bloqueia                                                              | 1.704 contratos              |
| Retirada               | Contrato listado em RETIRADA                                         | Encerra na base histórica com motivo e data; se voltar numa remessa futura, gera evento de reativação       | 18.858 contratos             |
| Saída sem retirada     | Estava na remessa anterior, não está na atual e não veio em RETIRADA | Marca como ausente e alerta; não apaga                                                                      | a medir a partir da 2ª carga |
| Pagamento repetido     | Mesma chave de pagamento já importada                                | Ignora; só pagamentos novos geram evento                                                                    | arquivo acumulado desde 2021 |
| Conflito com edição    | Banco muda um campo que o operador sobrepôs                          | Mantém a edição e mostra o novo valor do banco para decisão                                                 | a medir                      |
| Grupo não catalogado   | grupo_arc4u fora de ranking_grupo                                    | Importa e alerta o administrador                                                                            | 0                            |

### O que o operador consegue rastrear

- De qualquer valor na tela: arquivo, lote, data da carga e linha de
  origem, ou o autor e o motivo da edição.

- De qualquer contrato: todas as posições por carga, com o que mudou
  entre elas.

- De qualquer lote: o que entrou, saiu, mudou de grupo e quais regras
  dispararam, com exportação em CSV.

<img src="media/image1.png" style="width:6in;height:3.29464in"
alt="fluxo de importação · 8 etapas, aprovação independente" />

fluxo de importação · 8 etapas, aprovação independente

Um arquivo reprovado na validação também rejeita o lote; em nenhum caso
a base publicada fica pela metade.

### Ambiente de importação

Todo o processo acontece numa área própria do sistema, separada da
consulta: o operador de importação envia os ZIPs, acompanha as etapas e
outro usuário aprova a publicação.

| Controle               | Como funciona                                                                                                                            |
|------------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| Acesso                 | Só o perfil Importação abre a área; login com MFA, sessão curta e log de cada ação                                                       |
| Envio                  | Arrastar ou selecionar os arquivos; aceita envio em partes e mostra a matriz 9 tipos × 3 EPS                                             |
| Validação no envio     | Nome no padrão AAAAMMDD_TIPO_EPS_OUT.zip, mesma data para o lote, arquivo não vazio; REMESSA, PARCELAS e TELEFONE obrigatórios nas 3 EPS |
| Verificação do arquivo | Antivírus, limite de tamanho, hash SHA-256 contra reenvio e leitura do ZIP em área isolada, sem execução de conteúdo                     |
| Armazenamento          | Upload direto para armazenamento de objetos criptografado, por link assinado de uso único; o servidor da aplicação não guarda o arquivo  |
| Processamento          | Fila de trabalho separada da API; o importador roda com credencial própria, sem acesso à tela de consulta                                |
| Aprovação              | Quem envia não aprova; a publicação exige um segundo usuário com perfil de aprovador                                                     |
| Retenção               | Arquivos brutos guardados pelo prazo definido e apagados da área de entrada após a publicação                                            |

No futuro, o mesmo fluxo pode receber os arquivos direto do banco por
SFTP, sem envio manual: a validação e a aprovação continuam iguais.

### Informações por arquivo e relatório de simulação

Cada arquivo do lote registra nome original, tipo, EPS, data e hora de
recebimento, quantidade de registros, tamanho, hash SHA-256, resultado
da validação e status no fluxo. Na carga de 19/11, por exemplo, o
REMESSA_ARC4U_0140 tem 78,1 MB e 660.367 registros.

O relatório de simulação, lido pelo aprovador, mostra:

- arquivos esperados e recebidos, ausentes e excedentes;

- estruturas válidas e inválidas;

- registros lidos, inseridos, atualizados e rejeitados;

- duplicidades, inconsistências e divergências;

- impacto em contratos e saldo, por EPS, instituição e produto.

Falhas e reprocessamentos ficam no histórico do lote, com responsável,
data e desfecho.

## Interface de consulta

A consulta vira uma tela única do devedor, em três faixas, no lugar das
10+ abas atuais. O operador busca por CPF, contrato, telefone ou nome e
cai direto nela.

O [protótipo
navegável](https://claude.ai/artifact/Hy81t2EmVyXkDAsWfHuycQ) tem seis
telas ligadas entre si: Login, Consulta 360º, Carteira, Movimentações,
Importação e Usuários. Devedor e usuários são fictícios; os indicadores
de 19/11/2026 são reais e as cargas de 17/11 e 18/11 são simuladas.

### Estrutura da tela 360º

| Faixa            | Conteúdo                                                                                                                                                      | Interação                                                                                           |
|------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------|
| Cabeçalho fixo   | Nome, documento, idade, risco, total da curva, nº de contratos, maior atraso, chips de grupo ARC4 e EPS, alertas (acordo ativo, bloqueio, conflito, retirada) | Sempre visível ao rolar; ação principal: Registrar acionamento                                      |
| Coluna principal | Contratos em cartões expansíveis (grupo, produto, credor, curva, atraso, parcelas, acordo); abaixo, a linha do tempo unificada                                | Expandir um contrato mostra parcelas e pagamentos sem sair da tela; filtros por EPS, grupo e status |
| Coluna lateral   | Contatos (telefones, e-mails, endereços) ordenados por chance de contato, com fonte, data, bloqueio e resultado da última tentativa                           | Edição no lugar, invalidar com motivo, marcar melhor contato, arrastar para reordenar               |

### Comportamentos de edição

- **Clique para editar.** Todo campo editável abre no próprio lugar;
  Enter salva, Esc cancela. Não existe botão “Editar” de tela inteira.

- **Marca de origem.** Um ponto ao lado do valor indica de onde ele vem:
  banco, operação ou conflito. Passar o mouse mostra arquivo, lote,
  linha e data.

- **Motivo quando importa.** Sobrepor um dado do banco ou invalidar um
  contato pede um motivo curto, com opções prontas.

- **Desfazer.** Toda edição tem desfazer imediato e fica na linha do
  tempo.

- **Conflitos à vista.** Quando a carga traz um valor diferente da
  edição, o campo ganha um aviso com as duas versões e a escolha fica
  com o operador.

- **Estados completos.** Carregando, sem dados (ex.: avalistas vazios),
  erro de gravação e sucesso têm visual próprio.

### Outras telas

- **Carteira.** Visão por grupo ARC4 × EPS com contagem, curva e atraso;
  clique leva à lista filtrada. Matriz de migração de grupos entre
  cargas.

- **Central de importação.** Lotes do dia por tipo e EPS, status de cada
  etapa, regras disparadas e botão de publicar ou rejeitar.

- **Fila de conflitos.** Contratos em duas EPS, edições contestadas pelo
  banco e curvas divergentes, com ação em lote.

- **Movimentações.** Entradas, saídas efetivas, reclassificações,
  transferências entre EPS e ausentes em análise, com filtros e
  exportação.

### Acessibilidade e consistência

- Cor nunca sozinha: grupo e status têm texto e ícone, não só fundo
  colorido como o “PARALISADO” vermelho atual.

- Contraste mínimo AA, navegação completa por teclado, atalhos (/ busca,
  N negociar, A acionar).

- Valores em formato brasileiro (R\$ 13.275,22; 24/08/2023), sem
  True/False nem IDs técnicos na tela.

### Identidade visual

As telas seguem o [guia visual do BTG
Pactual](https://brandcenter.btgpactual.com/guia-visual): a paleta de 11
azuis, ícones de traço aberto sem preenchimento e gráficos flat, sem
sombras ou 3D.

| Uso                              | Cor                                    |
|----------------------------------|----------------------------------------|
| Barra superior e texto principal | \#05132A                               |
| Títulos e hover escuro           | \#0B2859                               |
| Botão principal e links          | \#195AB4 (hover \#10408D)              |
| Foco e destaques                 | \#307AE0                               |
| Gráficos e grupos ARC4           | \#549CFF, \#6BAAFF, \#87BAFF, \#B1D2FF |
| Seleção e chips                  | \#D2E5FF                               |
| Fundo dos cartões                | \#FFFFFF                               |

- **Tipografia:** a BTG Pactual Sans é proprietária e não tem versão
  pública para web. O protótipo usa Figtree, também geométrica; com a
  licença, a troca é uma linha de CSS. O styleguide completo é pedido à
  equipe de Branding pelo e-mail DL-MKT-Branding@btgpactual.com.

- **Status:** a paleta só tem azuis. Alerta (âmbar) e erro (vermelho)
  aparecem apenas em estados críticos, sempre com texto.

- **Logotipo:** não aparece no protótipo. O produto continua
  identificado como ARC4 Cobrança.

- **Textos de apoio:** explicações ficam em ícones de informação,
  abertos ao passar o mouse, ao clicar ou pelo teclado; a tela mostra só
  rótulos e valores.

## Instituições e produtos

A Carteira abre pela instituição: o usuário vê a lista resumida, clica
numa instituição para ver seus produtos e num produto para ver estoque,
movimentação e eficiência, até chegar aos contratos. O caminho (Carteira
› Instituição › Produto › Contratos) fica no topo e o retorno preserva
carteira, ordenação e filtros.

### Normalização

Instituição e produto são classificações separadas, cada uma com seu
dicionário configurável. O valor original do arquivo nunca muda.

| Classificação | Campo de origem              | Como é feita                                                                   | Situação em 19/11/2026                                         |
|---------------|------------------------------|--------------------------------------------------------------------------------|----------------------------------------------------------------|
| Instituição   | nome_estrategia (44 valores) | 15 regras por prefixo, com prioridade e vigência, seguindo a lista de adm.Nome | 839.525 posições mapeadas; 7.536 sem instituição               |
| Produto       | produto_legado (60 códigos)  | Categoria por código, só com regra aprovada                                    | 26 códigos com sugestão pelo padrão do código; 34 não mapeados |

- **Sem instituição:** “NPL Consumer” (7.522 contratos, R\$ 242,4 mi) e
  “EMPACOTAMENTO DESENROLA 2.0 ARC” (14). Aparecem como NÃO MAPEADO na
  Carteira até alguém propor e outro usuário aprovar a regra.

- **Sugestões de produto:** códigos terminados em CARD (Cartão), CPES
  (Crédito pessoal), CONS (Consignado), VEIL/VEI (Financiamento de
  veículo) e CESP (Cheque especial). O NCARDC também vem como Cartão,
  porque o CRM atual o mostra como “BTG Cartão Cancelado”. Nenhuma
  sugestão vale antes de aprovada.

- **Não mapeados:** os 34 códigos restantes (ex.: NARDES, NDCANC,
  NDCRED, NSPSIM) somam 268.109 posições e R\$ 1,00 bi. Ficam como “Não
  mapeado”, sem categoria presumida.

- **Governança:** quem propõe não aprova. Cada regra guarda prioridade,
  vigência, autor, aprovador e histórico de alterações.

### Carteira por instituição · 19/11/2026

| Instituição   | Posições | Contratos únicos | Saldo          | Participação | Pago em nov. (até 18/11) |
|---------------|----------|------------------|----------------|--------------|--------------------------|
| PAN           | 128.865  | 126.693          | R\$ 1.463,5 mi | 25,8%        | R\$ 460,3 mil            |
| ITAU          | 175.345  | 175.345          | R\$ 1.270,1 mi | 22,4%        | R\$ 209,3 mil            |
| NEON          | 145.103  | 138.496          | R\$ 746,7 mi   | 13,1%        | R\$ 80,9 mil             |
| MERCADO PAGO  | 76.059   | 76.059           | R\$ 503,1 mi   | 8,9%         | R\$ 0,3 mil              |
| SANTANDER     | 117.004  | 117.004          | R\$ 461,1 mi   | 8,1%         | R\$ 107,4 mil            |
| NOVERDE       | 38.231   | 36.713           | R\$ 376,6 mi   | 6,6%         | R\$ 123,4 mil            |
| PERNAMBUCANAS | 86.543   | 86.462           | R\$ 330,1 mi   | 5,8%         | R\$ 42,5 mil             |
| NÃO MAPEADO   | 7.536    | 7.536            | R\$ 242,4 mi   | 4,3%         | R\$ 29,9 mil             |
| INTER         | 16.583   | 16.583           | R\$ 107,9 mi   | 1,9%         | R\$ 40,1 mil             |
| SUPER SIM     | 44.478   | 44.478           | R\$ 93,1 mi    | 1,6%         | R\$ 43,1 mil             |
| QUEROQUERO    | 7.517    | 7.517            | R\$ 29,5 mi    | 0,5%         | R\$ 0,7 mil              |
| BTG           | 1.337    | 1.337            | R\$ 27,2 mi    | 0,5%         | R\$ 11,7 mil             |
| BRADESCO      | 2.036    | 2.036            | R\$ 17,3 mi    | 0,3%         | R\$ 14,5 mil             |
| BV            | 277      | 277              | R\$ 11,8 mi    | 0,2%         | R\$ 55,4 mil             |
| PORTOBANK     | 58       | 58               | R\$ 0,2 mi     | 0,0%         | R\$ 0,7 mil              |
| NUBANK        | 89       | 89               | R\$ 0,2 mi     | 0,0%         | R\$ 0,0                  |

Saldo somado por posição (R\$ 5,68 bi). Posições e contratos únicos só
diferem onde há contratos em mais de uma EPS: PAN, NEON, NOVERDE e
PERNAMBUCANAS.

## Eficiência e resultado

Estoque, acordo e pagamento ficam sempre separados: acordo não é
pagamento e saída de contrato não é perda financeira.

| Bloco        | Indicadores                                                                            | Fonte                                  | Disponível hoje         |
|--------------|----------------------------------------------------------------------------------------|----------------------------------------|-------------------------|
| Estoque      | Contratos, saldo, saldo médio, distribuição por EPS, grupo e faixa de atraso, evolução | REMESSA_ARC4U                          | Sim                     |
| Movimentação | Entradas, saídas, líquido, saldo envolvido, mudanças de grupo, transferências          | Comparação entre cargas + RETIRADA     | A partir da 2ª carga    |
| Acordado     | Acordos vigentes, em atraso, soma da parcela atual                                     | ACORDO_ATUAL                           | Sim                     |
| Pago         | Valor pago, quantidade, ticket médio, recuperação sobre o saldo                        | PAGAMENTO                              | Sim                     |
| Operacional  | Contratos trabalhados, % trabalhada, CPC, conversão de CPC e de trabalhados em acordo  | Acionamentos registrados na plataforma | Quando houver registros |

Na comparação entre instituições, cada taxa aparece ao lado do perfil da
carteira (saldo médio, atraso médio, % acima de 3 anos e volume).
Exemplo real: BV recupera 0,47% do saldo no mês, mas tem 277 contratos e
saldo médio de R\$ 42.637; não se compara diretamente com ITAU (175.345
contratos, R\$ 7.243 de saldo médio).

## Autenticação e controle de acesso

Cada pessoa entra com login e senha próprios e MFA; não existe login
compartilhado. O cadastro não libera nada além do que o perfil permite.

- **Login:** usuário ou e-mail, senha e código do autenticador. Após 5
  tentativas erradas, a conta é bloqueada temporariamente. A sessão
  expira por inatividade, com tempo configurável.

- **Cadastro:** feito pelo Administrador, com nome, e-mail, login,
  perfis e carteiras visíveis. O usuário recebe um link para criar a
  própria senha.

- **Ciclo da conta:** aguardando primeiro acesso, ativa, bloqueada e
  desativada. Contas desativadas não são apagadas, para manter a autoria
  dos registros.

- **Senha:** recuperação por link de uso único. O administrador só envia
  o link de redefinição e nunca vê a senha.

- **Registro:** último acesso e histórico de atividades por usuário.

### Perfis e permissões

As permissões são por módulo e ação, configuráveis pelo Administrador.
Uma pessoa pode ter mais de um perfil. Abaixo, a configuração inicial
proposta.

| Módulo                   | Operação       | Supervisão     | Gerência      | MIS / BackOffice | Importador  | Aprovador | Administrador        |
|--------------------------|----------------|----------------|---------------|------------------|-------------|-----------|----------------------|
| Consulta 360º            | Ver, editar    | Ver, editar    | Ver           | Ver              | —           | —         | Ver                  |
| Acionamentos             | Ver, registrar | Ver, registrar | Ver           | —                | —           | —         | —                    |
| Acompanhamento da equipe | —              | Ver            | Ver, exportar | —                | —           | —         | —                    |
| Carteira                 | —              | Ver            | Ver, exportar | Ver, exportar    | Ver         | Ver       | Ver                  |
| Batimento entre cargas   | —              | —              | Ver, exportar | Ver, exportar    | —           | Ver       | —                    |
| Movimentações            | —              | Ver            | Ver, exportar | Ver, exportar    | Ver         | Ver       | —                    |
| Importação e simulação   | —              | —              | —             | Ver              | Ver, enviar | Ver       | —                    |
| Aprovação e publicação   | —              | —              | —             | —                | —           | Aprovar   | —                    |
| Restauração de versão    | —              | —              | —             | —                | —           | Aprovar   | —                    |
| Domínios e mapeamentos   | —              | —              | —             | Ver, propor      | —           | —         | Ver, propor, aprovar |
| Usuários e permissões    | —              | —              | —             | —                | —           | —         | Ver, editar          |
| Auditoria                | —              | —              | —             | —                | —           | —         | Ver, exportar        |

- **Segregação:** quem envia uma carga não pode aprová-la, mesmo tendo o
  perfil de aprovador.

- **Carteiras visíveis:** além do perfil, cada usuário pode ver só
  algumas carteiras (ex.: operação dedicada à 0144 · CAÍDOS).

- **Exportação:** só aparece para quem tem a ação Exportar no módulo;
  cada exportação fica na auditoria.

- **Auditoria de segurança:** logins, tentativas inválidas, bloqueios,
  criação e desativação de contas, mudanças de perfil e de permissão,
  publicações e restaurações.

## Consulta 360º: acionamentos

O sistema não envia SMS nem faz negociação: a tela não tem esses botões.
A ação principal é **Registrar acionamento**, sem integração externa.

| Campo              | Preenchimento                                                                                                                          |
|--------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| Operador           | Automático, pelo login                                                                                                                 |
| Data e horário     | Automático                                                                                                                             |
| Telefone utilizado | Lista dos telefones ativos ou “Não se aplica”                                                                                          |
| Tipo               | Ligação ativa, ligação receptiva, mensagem manual, e-mail, outro                                                                       |
| Resultado          | Contato com o titular, contato com terceiro, não atende, caixa postal, número inválido, promessa de pagamento, recusa, retornar depois |
| Observações        | Texto livre, até 500 caracteres                                                                                                        |

O registro entra na linha do tempo marcado como “Registro operacional”,
com o nome e o login de quem registrou. Clicar no número de telefone
copia o número e mostra “Copiado” por 2 segundos.

O registro também guarda **retorno solicitado ou próximo passo** (data e
texto). Um registro novo nunca apaga os anteriores.

- **Telefones:** cada número aparece como válido, terceiro, bloqueado
  pelo banco ou inválido, com a fonte (banco ou operação). Marcar como
  terceiro ou inválido é um registro operacional: o número recebido do
  banco não muda.

- **Contratos:** cada cartão mostra instituição, produto, EPS, grupo,
  saldo e atraso.

- **Acordos:** entrada, parcelas pagas, em atraso e futuras, situação,
  datas e valores, só quando vierem em ACORDO_ATUAL e PAGAMENTO. Sem
  informação na fonte, o campo fica vazio: nada é inferido.

- **Dados do devedor:** cada campo mostra o dado original (ex.:
  nascimento 03141979), o tratado (14/03/1979) e o operacional, quando
  houver, com autor, data e justificativa.

## Carteiras, batimento e movimentações

As três carteiras aparecem sempre com código e nome juntos: **0140 ·
CLEAN**, **0144 · CAÍDOS** e **0900 · DESAFIANTE**, em consultas,
filtros, exportações, importações e movimentações.

### Visão executiva

Cada carteira tem sua leitura e o consolidado usa os mesmos critérios.
Valores reais da carga de 19/11/2026:

| Indicador              | 0140 · CLEAN | 0144 · CAÍDOS | 0900 · DESAFIANTE | Consolidado    |
|------------------------|--------------|---------------|-------------------|----------------|
| Contratos              | 660.367      | 15.679        | 171.015           | 836.683 únicos |
| CPFs/CNPJs únicos      | 482.881      | 13.802        | 170.679           | 657.021        |
| Saldo (curva)          | R\$ 4,90 bi  | R\$ 74,4 mi   | R\$ 705,9 mi      | R\$ 5,61 bi    |
| Atraso médio (dias)    | 984          | 76            | 1.367             | 1.045          |
| Atraso mediano (dias)  | 1.027        | 0             | 1.378             | 1.079          |
| Coincidentes entre EPS | 10.353       | 25            | 10.378            | 10.378         |
| Retiradas na carga     | 18.688       | 54            | 116               | 18.858         |

No consolidado, contratos e CPFs que aparecem em mais de uma EPS contam
uma vez; por isso o saldo consolidado (R\$ 5,61 bi) é menor que a soma
das três carteiras (R\$ 5,68 bi). “Coincidente entre EPS” é diferente do
grupo ARC4 “COINCIDENTES”, que é um ranking do banco.

### Batimento entre cargas

O usuário escolhe duas cargas (A anterior, B posterior) e uma carteira
ou o consolidado. O sistema compara contratos, CPFs, saldo e
coincidentes e lista os contratos de cada indicador: entraram, saíram,
mudaram de grupo, mudaram de EPS, tiveram alteração de saldo, passaram a
coincidentes e deixaram de ser coincidentes. Cada lista abre na tela e
exporta em CSV, conforme a permissão.

### Regras de classificação das movimentações

A classificação compara a carga B com a última carga publicada (A),
contrato a contrato, por contrato_original.

| Tipo                      | Condição                                          | Efeito no estoque                                                           |
|---------------------------|---------------------------------------------------|-----------------------------------------------------------------------------|
| Entrada                   | Não estava em nenhuma carteira em A e está em B   | Soma                                                                        |
| Saída efetiva             | Listado em RETIRADA de B, com motivo              | Subtrai                                                                     |
| Ausente em análise        | Estava em A, não veio em B e não está em RETIRADA | Não subtrai; vira saída só com retirada ou confirmação do MIS após 3 cargas |
| Transferência entre EPS   | Só na EPS X em A, só na EPS Y em B                | Neutro no consolidado; sai de X e entra em Y                                |
| Passou a coincidente      | Em uma EPS em A, em duas ou mais em B             | Neutro                                                                      |
| Deixou de ser coincidente | Em duas EPS em A, em uma em B                     | Neutro                                                                      |
| Reclassificação de grupo  | Mesma EPS, grupo_arc4u diferente                  | Neutro                                                                      |
| Alteração de saldo        | Mesma EPS, diferença de curva acima de R\$ 1      | Altera só o saldo                                                           |

A aba Movimentações mostra esses tipos com filtros por período,
carteira, tipo, grupo e contrato. Cada contrato abre com a regra
aplicada e os arquivos de origem.

## Governança e histórico das cargas

Todas as cargas e os arquivos originais ficam guardados; a base vigente
só muda depois de uma publicação bem-sucedida.

- **Identificação da carga:** id, data, quem enviou, quem aprovou,
  arquivos originais com hash, resultado de cada etapa e histórico de
  publicação.

- **Publicação:** a nova versão é montada à parte e só vira vigente no
  fim; a anterior continua guardada.

- **Restauração:** um aprovador pode voltar a base para uma carga
  anterior, com motivo. A carga substituída não é apagada e pode ser
  republicada.

- **Alterações operacionais:** cada campo mostra o valor original
  recebido, o valor alterado, o valor considerado, quem alterou, quando
  e o motivo.

A ordem de desenvolvimento segue a prioridade definida: acesso e perfis,
governança e histórico das cargas, regras de comparação e movimentações;
depois, as telas de consulta e de gestão.

### Exportação

Toda exportação respeita o perfil, aplica os filtros ativos e traz no
cabeçalho data e hora da extração, usuário, filtros e origem dos dados.
Cada exportação gera um evento de auditoria.

### Auditoria

São registrados login e logout, tentativas de acesso, cadastro e
alteração de usuários e permissões, importação, simulação, aprovação,
publicação, reprocessamento e restauração de cargas, ajustes em dados,
acionamentos, mudanças de domínio e exportações. Cada evento tem
usuário, data e hora, ação, objeto afetado e os dados necessários para
reconstruir o histórico.

## Regras de negócio e dicionário de indicadores

1.  Instituição e produto são classificações separadas.

2.  Contrato único e posição por EPS são contados e exibidos
    separadamente.

3.  Transferência entre EPS não é entrada nem saída no consolidado.

4.  Ausência num arquivo não é exclusão definitiva sem regra de
    confirmação.

5.  Promessa ou acordo não é pagamento realizado.

6.  Saída de estoque não é perda financeira realizada.

7.  Dado operacional nunca sobrescreve o dado original do banco.

8.  Nenhuma carga é publicada sem validação e aprovação independente.

9.  Todo indicador tem definição, regra, período e origem, acessíveis
    pelo ícone de informação.

10. Eficiência só se compara junto com o perfil da carteira.

| Indicador             | Definição                      | Regra de cálculo                                                           | Período                    | Origem                |
|-----------------------|--------------------------------|----------------------------------------------------------------------------|----------------------------|-----------------------|
| Contratos únicos      | Contratos distintos            | Contagem distinta de contrato_original nas 3 EPS                           | Carga selecionada          | REMESSA_ARC4U         |
| Posições por EPS      | Linhas de contrato por remessa | Soma das linhas das remessas                                               | Carga selecionada          | REMESSA_ARC4U         |
| Saldo total           | Saldo devedor                  | Soma de valor_curva; contratos coincidentes contam uma vez no consolidado  | Carga selecionada          | REMESSA_ARC4U         |
| Saldo médio           | Saldo por contrato             | Saldo total ÷ contratos                                                    | Carga selecionada          | REMESSA_ARC4U         |
| Participação          | Peso no saldo                  | Saldo do item ÷ saldo do nível acima                                       | Carga selecionada          | REMESSA_ARC4U         |
| Entradas / saídas     | Movimento de estoque           | Regras de classificação entre carga A e B                                  | Entre duas cargas          | Comparação + RETIRADA |
| Acordos vigentes      | Acordos ativos ou prometidos   | tipo_status_acordo_atual em ACTIVE ou PROMISE                              | Carga selecionada          | ACORDO_ATUAL          |
| Valor pago            | Pagamento efetivo              | Soma de valor_pago no período                                              | Mês ou intervalo escolhido | PAGAMENTO             |
| Recuperação           | Pago sobre o estoque           | Valor pago no período ÷ saldo da carga                                     | Mês ou intervalo escolhido | PAGAMENTO + REMESSA   |
| Contratos trabalhados | Contratos com acionamento      | Contratos com ao menos um registro no período                              | Período escolhido          | Acionamentos          |
| CPC                   | Contato com o titular          | Acionamentos com resultado “Contato com o titular” ÷ contratos trabalhados | Período escolhido          | Acionamentos          |

## Arquitetura técnica e segurança

A recomendação é PostgreSQL como fonte única, um importador em lote
separado da aplicação e uma API que serve a tela e o Power BI. O volume
diário é de cerca de 5,9 milhões de linhas, das quais 2,6 milhões são
telefones, 2,3 milhões parcelas e 847 mil posições de contrato: cabe com
folga num Postgres bem indexado.

| Camada     | Recomendação                                                                                                                                | Motivo                                                                    |
|------------|---------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------|
| Banco      | PostgreSQL 16, esquemas bruto, canonico, operacao, analitico                                                                                | Transação para publicação atômica; pg_trgm para busca por nome            |
| Importador | Python com DuckDB ou Polars, executado por agendador                                                                                        | Lê os ZIPs de 300 MB em streaming, compara lotes com SQL e grava via COPY |
| API        | TypeScript (NestJS ou Fastify) ou Python (FastAPI), a escolher pelo time                                                                    | Regras de edição, alçada e auditoria num só lugar                         |
| Front      | React + TypeScript, TanStack Query/Table, design system próprio documentado no Figma                                                        | Edição no lugar, grades grandes virtualizadas, componentes reutilizáveis  |
| BI         | Power BI lendo o esquema analitico (estrela: fato posição, fato pagamento, fato acionamento; dimensões devedor, contrato, grupo, EPS, data) | Indicadores sem consultar as tabelas transacionais                        |

### Histórico sem explodir o banco

Guardar a foto inteira de 850 mil contratos por dia geraria mais de 300
milhões de linhas por ano. A posição usa histórico por vigência (SCD
tipo 2): uma nova linha só quando algum campo muda, com valido_de e
valido_ate. Os arquivos brutos ficam em armazenamento de objetos pelo
prazo de retenção definido.

### Segurança e LGPD

- Perfis de acesso (operador, supervisor, qualidade, administrador)
  controlam o que é editável e o que aparece mascarado.

- CPF, telefone, e-mail, conta bancária, chassi e placa mascarados por
  padrão nas listas; abertos na tela do devedor com registro de acesso.

- Todo acesso a uma ficha e toda edição geram log imutável.

- Criptografia em trânsito e em repouso; ZIPs recebidos por canal
  autenticado e apagados da área de entrada após a importação.

- Lista de bloqueio aplicada também nas exportações de telefones, não só
  na tela.

## Roadmap, riscos e decisões

A entrega vai em quatro fases, cada uma liberada por um critério
objetivo. A primeira já traz valor sem trocar a tela: o importador novo
roda em paralelo ao CRM atual e mostra as divergências.

<img src="media/image2.png" style="width:6in;height:2.51786in"
alt="roadmap · 4 fases, 3 critérios de passagem" />

roadmap · 4 fases, 3 critérios de passagem

Os prazos de cada fase dependem do tamanho do time e ficam para o
planejamento; os critérios de passagem não mudam.

### Riscos

| Risco                                   | Impacto                                  | Mitigação                                                                                  |
|-----------------------------------------|------------------------------------------|--------------------------------------------------------------------------------------------|
| Layout do banco muda sem aviso          | Carga rejeitada ou campo perdido         | Dicionário de colunas com apelidos; coluna nova vira aviso, não erro                       |
| Regra de EPS primária errada            | Contrato na fila ou no canal errado      | Tabela de precedência configurável e fila de conflitos revisada nas primeiras semanas      |
| Operador sobrepõe dado correto do banco | Informação pior que a original           | Motivo obrigatório, valor do banco sempre visível, relatório de sobreposições por operador |
| Migração do histórico do CRM atual      | Perda de acionamentos e contatos antigos | Carga única do histórico como lote “legado”, com origem identificada                       |
| Disparo para número bloqueado           | Reclamação e sanção                      | Bloqueio aplicado no motor de envio e conferido antes de cada campanha                     |

### Decisões em aberto

- [ ] Qual EPS prevalece quando um contrato vem em duas remessas (hoje
  10.353 contratos em 0140 e 0900)?

- [ ] O que significa cada código de motivo_retirada (1 e 2) e
  status_parcela = PA?

- [ ] Nomes oficiais de exibição das EPS 0140, 0144 e 0900 e a descrição
  de cada grupo ARC4.

- [ ] Prazo de retenção dos arquivos brutos e do histórico de posições.

- [ ] Quais campos cada perfil pode sobrepor e quais exigem alçada.

- [ ] O CRM atual será desligado ou mantido como discador durante a
  transição?
