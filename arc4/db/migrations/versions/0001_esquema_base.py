"""Esquema base: bruto, canonico, operacao, seguranca, analitico.

Revision ID: 0001
Revises:
Create Date: 2026-11-19
"""

from pathlib import Path

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

SQL = Path(__file__).resolve().parent.parent / "sql" / "0001_esquema_base.sql"
ESQUEMAS = ("analitico", "operacao", "canonico", "seguranca", "bruto")


def upgrade() -> None:
    # Executa pelo psycopg sem parâmetros: o texto vai como está (sem tratar ":" ou "%" como
    # marcadores) e na mesma transação da migration.
    op.get_bind().connection.driver_connection.execute(SQL.read_text(encoding="utf-8"))


def downgrade() -> None:
    for esquema in ESQUEMAS:
        op.execute(f"drop schema if exists {esquema} cascade")
