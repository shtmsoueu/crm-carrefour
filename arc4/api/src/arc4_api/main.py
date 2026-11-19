"""Aplicação FastAPI. Na Fase 0 expõe apenas a verificação de saúde."""

from __future__ import annotations

import logging
from typing import Literal

import psycopg
from fastapi import FastAPI, Response, status
from pydantic import BaseModel

from . import __version__
from .config import Config

log = logging.getLogger("arc4_api")


class Saude(BaseModel):
    status: Literal["ok", "degradado"]
    versao: str
    banco: Literal["ok", "indisponivel"]
    migracao: str | None = None
    """Revisão do Alembic aplicada no banco (None = banco sem migrations)."""


def verificar_banco(cfg: Config) -> tuple[bool, str | None]:
    """Conecta, roda `select 1` e lê a revisão do Alembic. Nunca propaga a mensagem do driver."""
    try:
        with psycopg.connect(cfg.database_url, connect_timeout=max(1, int(cfg.timeout_banco_s))) as c:
            c.execute("select 1")
            existe = c.execute("select to_regclass('public.alembic_version') is not null").fetchone()
            if existe and existe[0]:
                linha = c.execute("select version_num from public.alembic_version").fetchone()
                return True, linha[0] if linha else None
            return True, None
    except psycopg.Error as e:
        # Só o tipo do erro: a mensagem pode conter host e usuário.
        log.warning("banco indisponível: %s", type(e).__name__)
        return False, None


def criar_app(cfg: Config | None = None) -> FastAPI:
    cfg = cfg or Config.do_ambiente()
    app = FastAPI(
        title="CRM de Cobrança ARC4",
        version=__version__,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )

    @app.get("/health", response_model=Saude, tags=["infra"])
    @app.get("/api/health", response_model=Saude, include_in_schema=False)
    def health(response: Response) -> Saude:
        ok, revisao = verificar_banco(cfg)
        if not ok:
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return Saude(
            status="ok" if ok else "degradado",
            versao=__version__,
            banco="ok" if ok else "indisponivel",
            migracao=revisao,
        )

    return app


app = criar_app()
