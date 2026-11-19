"""Ambiente do Alembic: migrations em SQL puro, sem modelos ORM."""

from __future__ import annotations

import os

from alembic import context
from sqlalchemy import create_engine, pool

URL_PADRAO = "postgresql://arc4:arc4@localhost:5432/arc4"


def url_sqlalchemy(url: str) -> str:
    """Aceita postgres:// ou postgresql:// e usa o driver psycopg 3."""
    for prefixo in ("postgres://", "postgresql://"):
        if url.startswith(prefixo):
            return "postgresql+psycopg://" + url[len(prefixo) :]
    return url


def _url() -> str:
    return url_sqlalchemy(
        context.config.attributes.get("database_url") or os.environ.get("DATABASE_URL") or URL_PADRAO
    )


def run_migrations_offline() -> None:
    context.configure(url=_url(), literal_binds=True, transaction_per_migration=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_url(), poolclass=pool.NullPool)
    with engine.connect() as conn:
        # Cada migration roda numa transação: falha no meio não deixa o esquema pela metade.
        context.configure(connection=conn, transaction_per_migration=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
