"""Configuração por variáveis de ambiente (nenhum segredo versionado)."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    database_url: str
    timeout_banco_s: float = 2.0

    @classmethod
    def do_ambiente(cls) -> Config:
        return cls(
            database_url=os.environ.get("DATABASE_URL", "postgresql://arc4:arc4@localhost:5432/arc4"),
            timeout_banco_s=float(os.environ.get("HEALTH_DB_TIMEOUT_S", "2")),
        )
