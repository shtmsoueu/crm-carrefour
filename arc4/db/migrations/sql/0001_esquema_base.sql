-- Migration 0001 — esquema base do CRM ARC4.
-- Derivado de docs/modelo/schema_postgresql.sql com os ajustes registrados em docs/DECISOES.md (D-005):
--   * bloco seguranca criado antes de canonico (FKs de autoria);
--   * lote_importacao.enviado_por/aprovado_por com FK para seguranca.usuario;
--   * regra_produto também impede que quem propõe aprove;
--   * seguranca.usuario_carteira criada depois de canonico.eps.

-- =====================================================================
-- CRM de Cobrança ARC4 — modelo de dados proposto (PostgreSQL 16)
-- Camadas: bruto (arquivo como chegou) · canonico (entidades versionadas)
--          operacao (edições, contatos, eventos) · analitico (Power BI)
-- Chave de ligação entre arquivos: contrato_original
-- Proposta para discussão: ajuste tipos e índices ao volume real.
-- =====================================================================

create schema if not exists bruto;
create schema if not exists canonico;
create schema if not exists operacao;
create schema if not exists analitico;
create schema if not exists seguranca;

-- ---------------------------------------------------------------------
-- Autenticação, perfis e permissões
-- ---------------------------------------------------------------------

create table seguranca.usuario (
  id             bigserial primary key,
  nome           text not null,
  login          text not null unique,
  email          text not null unique,
  senha_hash     text,                      -- argon2id; nunca visível ao administrador
  mfa_segredo    bytea,                     -- cifrado
  status         text not null default 'pendente' check (status in ('pendente','ativo','bloqueado','desativado')),
  tentativas     smallint not null default 0,
  bloqueado_ate  timestamptz,
  ultimo_acesso  timestamptz,
  criado_por     bigint references seguranca.usuario(id),
  criado_em      timestamptz not null default now()
);

create table seguranca.perfil (
  codigo  text primary key,                 -- operacao, supervisao, gerencia, mis_backoffice, importador, aprovador, administrador
  nome    text not null
);

create table seguranca.usuario_perfil (
  usuario_id bigint not null references seguranca.usuario(id),
  perfil     text not null references seguranca.perfil(codigo),
  primary key (usuario_id, perfil)
);

-- Permissão = módulo + ação, concedida a um perfil
create table seguranca.permissao (
  perfil  text not null references seguranca.perfil(codigo),
  modulo  text not null,                    -- consulta, acionamentos, equipe, carteira, batimento, movimentacoes, importacao, publicacao, restauracao, dominios, usuarios, auditoria
  acao    text not null check (acao in ('ver','editar','exportar','aprovar')),
  primary key (perfil, modulo, acao)
);

create table seguranca.token_senha (
  token_hash  char(64) primary key,         -- link de uso único
  usuario_id  bigint not null references seguranca.usuario(id),
  expira_em   timestamptz not null,
  usado_em    timestamptz
);

create table seguranca.sessao (
  id          uuid primary key,
  usuario_id  bigint not null references seguranca.usuario(id),
  criada_em   timestamptz not null default now(),
  ultimo_uso  timestamptz not null default now(),
  encerrada_em timestamptz,
  ip          inet
);

create table seguranca.evento (
  id          bigserial primary key,
  em          timestamptz not null default now(),
  usuario_id  bigint references seguranca.usuario(id), -- null = sistema
  alvo        text,                         -- usuário, perfil ou carga afetada
  tipo        text not null,                -- login, logout, login_falha, bloqueio, usuario_criado, perfil_alterado, permissao_alterada, importacao, simulacao, aprovacao, publicacao, reprocessamento, restauracao, ajuste_dado, acionamento, dominio_alterado, exportacao
  detalhe     jsonb,
  ip          inet
);

-- ---------------------------------------------------------------------
-- Rastreabilidade das cargas
-- ---------------------------------------------------------------------
create table canonico.lote_importacao (
  id            bigserial primary key,
  data_carga    date not null unique,
  status        text not null check (status in ('recebido','validado','reconciliado','aguardando_aprovacao','publicado','rejeitado','substituido')),
  enviado_por   bigint references seguranca.usuario(id),
  aprovado_por  bigint references seguranca.usuario(id), -- quem envia não aprova (D-005)
  vigente       boolean not null default false,
  publicado_em  timestamptz,
  relatorio     jsonb,                      -- contagens e regras disparadas
  check (aprovado_por is null or aprovado_por <> enviado_por)
);
-- Só uma carga vigente por vez
create unique index on canonico.lote_importacao (vigente) where vigente;

create table canonico.arquivo (
  id         bigserial primary key,
  lote_id    bigint not null references canonico.lote_importacao(id),
  nome       text not null,                 -- 20261119_REMESSA_ARC4U_0140_OUT.zip
  tipo       text not null,                 -- REMESSA_ARC4U, PARCELAS, TELEFONE...
  eps        char(4) not null,              -- 0140, 0144, 0900
  sha256     char(64) not null unique,      -- impede reimportação
  tamanho    bigint not null,
  recebido_em timestamptz not null default now(),
  linhas     integer not null,
  validacao  text not null default 'pendente' check (validacao in ('pendente','valido','valido_com_aviso','invalido')),
  status     text not null default 'recebido',
  caminho_original text not null,            -- arquivo original preservado em armazenamento de objetos
  avisos     jsonb
);

-- Dicionário de colunas por tipo de arquivo (aceita apelidos de cabeçalho)
create table canonico.dicionario_coluna (
  tipo          text not null,
  coluna        text not null,              -- nome canônico
  apelidos      text[] not null default '{}', -- ex.: {'numero_parcelas _atraso'}
  formato_data  text,                       -- 'MMDDYYYY' | 'DD/MM/YYYY' | null
  obrigatoria   boolean not null default false,
  primary key (tipo, coluna)
);

-- ---------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------
create table canonico.ranking_grupo (
  codigo     text primary key,              -- G1..G4, C1..C3, COINCIDENTES, M, A1, Mundo Z, <500, Prescrito
  nome       text,
  descricao  text,
  ordem      smallint,
  cor        text,
  catalogado boolean not null default true  -- false = apareceu numa carga sem cadastro
);

create table canonico.eps (
  codigo     char(4) primary key,           -- 0140, 0144, 0900
  nome       text not null,                 -- CLEAN, CAÍDOS, DESAFIANTE (exibir sempre 'código · nome')
  precedencia smallint not null             -- define a EPS primária quando há duplicidade
);

-- ---------------------------------------------------------------------
-- Entidades canônicas
-- ---------------------------------------------------------------------
create table canonico.devedor (
  documento        varchar(14) primary key, -- CPF (11) ou CNPJ (14), só dígitos
  tipo_cliente     char(1) not null,        -- F | J
  nome             text,
  data_nascimento  date,
  genero           char(1),
  profissao        text,
  risco            text,
  atualizado_lote  bigint references canonico.lote_importacao(id)
);

create table canonico.contrato (
  contrato_original text primary key,
  documento         varchar(14) not null references canonico.devedor(documento),
  contrato_atual    text,                   -- muda com renegociação (sufixo -RENnn)
  produto_legado    text,
  nome_estrategia   text,                   -- ex.: ITAU CONSUMER 11/2025 (safra)
  area_negocio      text,
  situacao          text not null default 'ativo' check (situacao in ('ativo','retirado','ausente')),
  retirado_em       date,
  motivo_retirada   text
);
create index on canonico.contrato (documento);

-- Uma linha por contrato e EPS (permite o mesmo contrato em duas remessas)
create table canonico.marcacao_eps (
  contrato_original text not null references canonico.contrato(contrato_original),
  eps               char(4) not null references canonico.eps(codigo),
  primaria          boolean not null default false,
  primeiro_lote     bigint not null references canonico.lote_importacao(id),
  ultimo_lote       bigint not null references canonico.lote_importacao(id),
  primary key (contrato_original, eps)
);

-- Posição financeira e ranking: histórico por vigência (SCD tipo 2)
create table canonico.contrato_posicao (
  id                bigserial primary key,
  contrato_original text not null,
  eps               char(4) not null,
  grupo_arc4u       text not null references canonico.ranking_grupo(codigo),
  grupo_anterior    text,                   -- grupo_anterior_arc4u (A/B/C/D)
  cluster_arc4u     text,
  cluster_eps       text,
  segmento_npl      text,
  valor_principal   numeric(14,2),
  valor_curva       numeric(14,2),
  valor_curva_atraso numeric(14,2),
  juros_atraso      numeric(14,2),
  juros_fixados     numeric(14,2),
  multa             numeric(14,2),
  dias_atraso       integer,
  menor_data_atraso date,
  parcelas_atraso   integer,
  plano_total       integer,
  tipo_pagamento    text,
  valido_de         bigint not null references canonico.lote_importacao(id),
  valido_ate        bigint references canonico.lote_importacao(id), -- null = vigente
  arquivo_id        bigint not null references canonico.arquivo(id),
  linha_origem      integer not null,
  foreign key (contrato_original, eps) references canonico.marcacao_eps(contrato_original, eps)
);
create index on canonico.contrato_posicao (contrato_original) where valido_ate is null;
create index on canonico.contrato_posicao (grupo_arc4u, eps) where valido_ate is null;

create table canonico.parcela (
  contrato_original text not null references canonico.contrato(contrato_original),
  numero            integer not null,
  vencimento        date not null,
  status            text not null,          -- 'PA' (significado a confirmar com o banco)
  curva             numeric(14,2),
  principal         numeric(14,2),
  juros_atraso      numeric(14,2),
  juros_fixo        numeric(14,2),
  multa             numeric(14,2),
  escriturado       boolean,
  valido_de         bigint not null references canonico.lote_importacao(id),
  valido_ate        bigint references canonico.lote_importacao(id),
  arquivo_id        bigint not null references canonico.arquivo(id),
  linha_origem      integer not null,
  primary key (contrato_original, numero, valido_de)
);

create table canonico.acordo (
  id_acordo            uuid primary key,
  contrato_original    text not null references canonico.contrato(contrato_original),
  contrato_atual       text,
  eps                  char(4),
  canal                text,                -- eps_acordo_atual: serasa_limpa_nome, acordo_certo...
  status               text,                -- PROCESSED, OVERDUE, BROKEN, VALIDATED...
  tipo_status          text,                -- ACTIVE, PROMISE, OVERDUE
  tipo_acordo          text,                -- TOTAL, INSTALLMENT, WRAP
  possui_adesao        boolean,
  em_atraso            boolean,
  parcela_atual        integer,
  total_parcelas       integer,
  valor_parcela_atual  numeric(14,2),
  vencimento_atual     date,                -- chega como DD/MM/AAAA
  atualizado_lote      bigint not null references canonico.lote_importacao(id)
);

create table canonico.pagamento (
  chave             char(64) primary key,   -- sha256(contrato|data|parcela|valor): idempotente
  contrato_original text not null references canonico.contrato(contrato_original),
  data_pagamento    date not null,
  parcela_paga      integer,
  valor_pago        numeric(14,2) not null,
  primeiro_lote     bigint not null references canonico.lote_importacao(id)
);

create table canonico.garantia (
  id_garantia       text primary key,
  contrato_original text not null references canonico.contrato(contrato_original),
  tipo              text,                   -- AliFidVeiculo, FGO
  modelo            text,
  ano_modelo        integer,
  placa             text,
  chassi            text,
  renavam           text,
  valor_total       numeric(14,2),
  extras            jsonb                   -- demais colunas (a maioria vem vazia)
);

create table canonico.avalista (
  contrato_original text not null references canonico.contrato(contrato_original),
  documento         varchar(14) not null,
  nome              text,
  endereco          jsonb,
  telefones         jsonb,
  primary key (contrato_original, documento)
);

-- ---------------------------------------------------------------------
-- Contatos (um contato, várias fontes)
-- ---------------------------------------------------------------------
create table operacao.telefone (
  id              bigserial primary key,
  documento       varchar(14) not null references canonico.devedor(documento),
  ddd             char(2) not null,
  numero          varchar(9) not null,
  movel           boolean generated always as (length(numero) = 9) stored,
  status          text not null default 'ativo' check (status in ('ativo','bloqueado','invalido')),
  melhor_contato  boolean not null default false,
  motivo_status   text,
  unique (documento, ddd, numero)
);

create table operacao.contato_fonte (
  telefone_id       bigint not null references operacao.telefone(id),
  contrato_original text,
  origem            text,                   -- BULK_IMPORT, LESS, PORTAL_PME, DATA_LAKE, OPERACAO
  data_source       text,                   -- Enriquecimento - 16/11/2026, TakeOver..., CEDENTE
  prioridade        smallint,
  lote_id           bigint references canonico.lote_importacao(id),
  linha_origem      integer
);

create table operacao.bloqueio_contato (
  ddd          char(2) not null,
  numero       varchar(9) not null,
  reclamante   text,
  origem       text not null,               -- TELEFONES_BLOQUEADOS | OPERACAO
  desde_lote   bigint references canonico.lote_importacao(id),
  primary key (ddd, numero)
);

-- ---------------------------------------------------------------------
-- Edições manuais e linha do tempo
-- ---------------------------------------------------------------------
create table operacao.valor_sobreposto (
  id            bigserial primary key,
  entidade      text not null,              -- devedor, telefone, endereco...
  entidade_id   text not null,
  campo         text not null,
  valor_banco   text,                       -- o que o banco dizia na edição
  valor_editado text not null,
  motivo        text not null,
  autor         text not null,
  criado_em     timestamptz not null default now(),
  ativo         boolean not null default true,
  em_conflito   boolean not null default false -- banco mudou o valor depois da edição
);
create index on operacao.valor_sobreposto (entidade, entidade_id) where ativo;

create table operacao.evento (
  id                bigserial primary key,
  ocorrido_em       timestamptz not null default now(),
  documento         varchar(14),
  contrato_original text,
  tipo              text not null,          -- carga, mudanca_grupo, edicao, conflito, contato, acordo, pagamento, retirada
  titulo            text not null,
  detalhe           jsonb,
  autor             text,                   -- null = sistema/importador
  lote_id           bigint references canonico.lote_importacao(id)
);
create index on operacao.evento (documento, ocorrido_em desc);

create table operacao.log_acesso (
  id         bigserial primary key,
  usuario    text not null,
  documento  varchar(14) not null,
  acao       text not null,                 -- abrir_ficha, revelar_cpf, exportar
  em         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Visão vigente usada pela tela e pelo Power BI
-- acordo_ativo é DERIVADO (o campo da remessa veio N em 100% dos casos)
-- ---------------------------------------------------------------------
create view analitico.contrato_vigente as
select p.contrato_original, c.documento, p.eps, m.primaria, p.grupo_arc4u,
       p.valor_curva, p.valor_principal, p.dias_atraso,
       exists (select 1 from canonico.acordo a
               where a.contrato_original = p.contrato_original
                 and a.tipo_status in ('ACTIVE','PROMISE','OVERDUE')) as acordo_ativo
from canonico.contrato_posicao p
join canonico.contrato c using (contrato_original)
join canonico.marcacao_eps m on m.contrato_original = p.contrato_original and m.eps = p.eps
where p.valido_ate is null and c.situacao = 'ativo';

-- Telefones que podem ser acionados: ativos e fora da lista de bloqueio
create view analitico.telefones_acionaveis as
select t.documento, t.ddd, t.numero
from operacao.telefone t
where t.status = 'ativo'
  and not exists (select 1 from operacao.bloqueio_contato b where b.ddd = t.ddd and b.numero = t.numero);


insert into canonico.eps (codigo, nome, precedencia) values
  ('0140', 'CLEAN', 3), ('0144', 'CAÍDOS', 2), ('0900', 'DESAFIANTE', 1); -- precedência a confirmar

-- ---------------------------------------------------------------------
-- Acionamentos (registro manual, sem integração externa)
-- ---------------------------------------------------------------------
create table operacao.acionamento (
  id           bigserial primary key,
  documento    varchar(14) not null references canonico.devedor(documento),
  usuario_id   bigint not null references seguranca.usuario(id),
  em           timestamptz not null default now(),
  telefone_id  bigint references operacao.telefone(id),
  tipo         text not null,               -- ligacao_ativa, ligacao_receptiva, mensagem_manual, email, outro
  resultado    text not null,               -- contato_titular, contato_terceiro, nao_atende, caixa_postal, numero_invalido, promessa, recusa, retornar
  observacao   varchar(500),
  retorno_em   date,                        -- retorno solicitado
  proximo_passo text
);
create index on operacao.acionamento (documento, em desc);

-- ---------------------------------------------------------------------
-- Movimentações entre cargas (geradas na reconciliação)
-- ---------------------------------------------------------------------
create table canonico.movimentacao (
  id                bigserial primary key,
  lote_anterior     bigint not null references canonico.lote_importacao(id),
  lote_atual        bigint not null references canonico.lote_importacao(id),
  contrato_original text not null,
  tipo              text not null check (tipo in ('entrada','saida','ausente_analise','transferencia_eps','passou_coincidente','deixou_coincidente','reclassificacao_grupo','alteracao_saldo')),
  eps_origem        char(4),
  eps_destino       char(4),
  grupo_de          text,
  grupo_para        text,
  saldo_anterior    numeric(14,2),
  saldo_atual       numeric(14,2),
  motivo            text,                   -- motivo_retirada, quando houver
  arquivo_id        bigint references canonico.arquivo(id),
  linha_origem      integer
);
create index on canonico.movimentacao (lote_atual, tipo);
create index on canonico.movimentacao (contrato_original);

-- ---------------------------------------------------------------------
-- Dicionários de domínio: instituição e produto (classificações separadas)
-- ---------------------------------------------------------------------
create table canonico.instituicao (
  codigo  text primary key,                 -- BRADESCO, BTG, BV, INTER, ITAU, MERCADO PAGO, NEON, NOVERDE, NUBANK, PAN, PERNAMBUCANAS, PORTOBANK, QUEROQUERO, SANTANDER, SUPER SIM
  nome    text not null,
  observacao text                           -- ex.: PERNAMBUCANAS, origem PEFISA
);

create table canonico.regra_instituicao (
  id           bigserial primary key,
  padrao       text not null,               -- expressão aplicada a nome_estrategia, ex.: '^PEFISA'
  instituicao  text not null references canonico.instituicao(codigo),
  prioridade   smallint not null,
  vigente_de   date not null,
  vigente_ate  date,
  status       text not null check (status in ('proposta','aprovada','rejeitada','revogada')),
  proposto_por bigint references seguranca.usuario(id),
  aprovado_por bigint references seguranca.usuario(id),
  check (aprovado_por is null or aprovado_por <> proposto_por)
);

create table canonico.categoria_produto (
  codigo text primary key,                  -- cartao, credito_pessoal, consignado, financiamento_veiculo, cheque_especial...
  nome   text not null
);

create table canonico.regra_produto (
  id            bigserial primary key,
  produto_legado text not null,             -- código como veio no arquivo
  categoria     text not null references canonico.categoria_produto(codigo),
  origem        text not null,              -- 'sugestao_por_codigo' | 'manual'
  evidencia     text,                       -- ex.: 'CRM atual: BTG Cartão Cancelado (NCARDC)'
  vigente_de    date not null,
  vigente_ate   date,
  status        text not null check (status in ('sugerida','proposta','aprovada','rejeitada','revogada')),
  proposto_por  bigint references seguranca.usuario(id),
  aprovado_por  bigint references seguranca.usuario(id),
  check (aprovado_por is null or aprovado_por <> proposto_por)
);

-- Valores sem regra aprovada, para validação
create view canonico.dominio_nao_mapeado as
select 'instituicao' as dominio, c.nome_estrategia as valor, count(*) as contratos
from canonico.contrato c
where not exists (select 1 from canonico.regra_instituicao r where r.status = 'aprovada' and c.nome_estrategia ~ r.padrao)
group by c.nome_estrategia
union all
select 'produto', c.produto_legado, count(*)
from canonico.contrato c
where not exists (select 1 from canonico.regra_produto r where r.status = 'aprovada' and r.produto_legado = c.produto_legado)
group by c.produto_legado;

-- ---------------------------------------------------------------------
-- Simulação, falhas e reprocessamentos da carga
-- ---------------------------------------------------------------------
create table canonico.simulacao (
  id                 bigserial primary key,
  lote_id            bigint not null references canonico.lote_importacao(id),
  executada_por      bigint not null references seguranca.usuario(id),
  executada_em       timestamptz not null default now(),
  arquivos_esperados smallint not null,
  arquivos_recebidos smallint not null,
  registros_lidos    bigint,
  inseridos          bigint,
  atualizados        bigint,
  rejeitados         bigint,
  impacto            jsonb                  -- contratos e saldo por EPS, instituição e produto
);

create table canonico.etapa_lote (
  lote_id      bigint not null references canonico.lote_importacao(id),
  etapa        text not null check (etapa in ('receber','validar','normalizar','conciliar','simular','revisar','aprovar','publicar')),
  tentativa    smallint not null default 1,
  responsavel  bigint references seguranca.usuario(id),
  inicio       timestamptz not null,
  fim          timestamptz,
  resultado    text,                        -- ok, falha, rejeitado
  detalhe      jsonb,
  primary key (lote_id, etapa, tentativa)
);

-- Carteiras visíveis por usuário (depende de canonico.eps)
create table seguranca.usuario_carteira (
  usuario_id bigint not null references seguranca.usuario(id),
  eps        char(4) not null references canonico.eps(codigo),
  primary key (usuario_id, eps)
);
