"""Testes de banco: criam um banco temporário a partir de TEST_DATABASE_URL e o apagam ao final.

Sem TEST_DATABASE_URL os testes são pulados (localmente: `make db-test`; no CI há um serviço postgres).
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest
from alembic.config import Config

RAIZ = Path(__file__).resolve().parents[2]


def _url_admin() -> str:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL não definido")
    return url


def _trocar_banco(url: str, banco: str) -> str:
    base, _, _ = url.rpartition("/")
    return f"{base}/{banco}"


@pytest.fixture
def banco_vazio() -> Iterator[str]:
    admin = _url_admin()
    nome = f"arc4_teste_{uuid.uuid4().hex[:10]}"
    with psycopg.connect(admin, autocommit=True) as c:
        c.execute(f'create database "{nome}"')
    try:
        yield _trocar_banco(admin, nome)
    finally:
        with psycopg.connect(admin, autocommit=True) as c:
            c.execute(f'drop database if exists "{nome}" with (force)')


@pytest.fixture
def alembic_cfg(banco_vazio: str) -> Config:
    cfg = Config(str(RAIZ / "db" / "alembic.ini"))
    cfg.attributes["database_url"] = banco_vazio
    return cfg
