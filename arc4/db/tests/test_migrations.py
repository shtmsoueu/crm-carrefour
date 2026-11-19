"""F0.3 — `make migrate` cria todos os esquemas num banco vazio e é reaplicável sem erro."""

import psycopg
import pytest
from alembic import command

ESQUEMAS = {"bruto", "canonico", "operacao", "seguranca", "analitico"}
TABELAS_CHAVE = {
    "canonico.lote_importacao",
    "canonico.arquivo",
    "canonico.contrato_posicao",
    "canonico.movimentacao",
    "canonico.simulacao",
    "canonico.etapa_lote",
    "operacao.acionamento",
    "seguranca.usuario",
    "seguranca.evento",
    "seguranca.usuario_carteira",
}


def _esquemas(url: str) -> set[str]:
    with psycopg.connect(url) as c:
        return {r[0] for r in c.execute("select nspname from pg_namespace")}


def _tabelas(url: str) -> set[str]:
    with psycopg.connect(url) as c:
        return {
            f"{s}.{t}"
            for s, t in c.execute(
                "select table_schema, table_name from information_schema.tables where table_schema = any(%s)",
                (list(ESQUEMAS),),
            )
        }


def test_cria_todos_os_esquemas_e_reaplica(alembic_cfg, banco_vazio):
    command.upgrade(alembic_cfg, "head")
    assert ESQUEMAS <= _esquemas(banco_vazio)
    assert TABELAS_CHAVE <= _tabelas(banco_vazio)
    antes = _tabelas(banco_vazio)
    command.upgrade(alembic_cfg, "head")  # reaplicar: sem erro e sem efeito
    assert _tabelas(banco_vazio) == antes


def test_downgrade_e_upgrade_de_novo(alembic_cfg, banco_vazio):
    command.upgrade(alembic_cfg, "head")
    command.downgrade(alembic_cfg, "base")
    assert not ESQUEMAS & _esquemas(banco_vazio)
    command.upgrade(alembic_cfg, "head")
    assert ESQUEMAS <= _esquemas(banco_vazio)


def test_eps_com_rotulos_oficiais(alembic_cfg, banco_vazio):
    command.upgrade(alembic_cfg, "head")
    with psycopg.connect(banco_vazio) as c:
        eps = c.execute("select codigo || ' · ' || nome from canonico.eps order by codigo").fetchall()
    assert [r[0] for r in eps] == ["0140 · CLEAN", "0144 · CAÍDOS", "0900 · DESAFIANTE"]


def _usuario(c: psycopg.Connection, login: str) -> int:
    return c.execute(
        "insert into seguranca.usuario (nome, login, email) values (%s, %s, %s) returning id",
        (login, login, f"{login}@exemplo.invalid"),
    ).fetchone()[0]


def test_banco_impede_quem_enviou_de_aprovar(alembic_cfg, banco_vazio):
    """Regra 8: a garantia existe no banco, não só na tela (base para F2.6)."""
    command.upgrade(alembic_cfg, "head")
    with psycopg.connect(banco_vazio) as c:
        u1, u2 = _usuario(c, "importador"), _usuario(c, "aprovador")
        c.execute(
            "insert into canonico.lote_importacao (data_carga, status, enviado_por, aprovado_por) "
            "values ('2026-11-19', 'publicado', %s, %s)",
            (u1, u2),
        )
        with pytest.raises(psycopg.errors.CheckViolation):
            c.execute(
                "insert into canonico.lote_importacao (data_carga, status, enviado_por, aprovado_por) "
                "values ('2026-11-18', 'publicado', %s, %s)",
                (u1, u1),
            )


def test_so_uma_carga_vigente(alembic_cfg, banco_vazio):
    command.upgrade(alembic_cfg, "head")
    with psycopg.connect(banco_vazio) as c:
        c.execute(
            "insert into canonico.lote_importacao (data_carga, status, vigente) "
            "values ('2026-11-18', 'publicado', true)"
        )
        with pytest.raises(psycopg.errors.UniqueViolation):
            c.execute(
                "insert into canonico.lote_importacao (data_carga, status, vigente) "
                "values ('2026-11-19', 'publicado', true)"
            )


def test_regra_de_dominio_nao_e_aprovada_por_quem_propos(alembic_cfg, banco_vazio):
    command.upgrade(alembic_cfg, "head")
    with psycopg.connect(banco_vazio) as c:
        u = _usuario(c, "mis")
        c.execute("insert into canonico.categoria_produto values ('cartao', 'Cartão')")
        with pytest.raises(psycopg.errors.CheckViolation):
            c.execute(
                "insert into canonico.regra_produto (produto_legado, categoria, origem, vigente_de, "
                "status, proposto_por, aprovado_por) "
                "values ('NCARDC', 'cartao', 'manual', '2026-11-19', 'aprovada', %s, %s)",
                (u, u),
            )
