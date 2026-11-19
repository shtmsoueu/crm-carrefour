"""F0.2 — a API responde GET /health."""

import os

import pytest
from fastapi.testclient import TestClient

from arc4_api.config import Config
from arc4_api.main import criar_app


def test_health_sem_banco_responde_503_sem_vazar_detalhes():
    # Porta 1: conexão recusada de imediato.
    app = criar_app(Config(database_url="postgresql://ninguem:segredo@127.0.0.1:1/x", timeout_banco_s=1))
    r = TestClient(app).get("/health")
    assert r.status_code == 503
    assert r.json() == {"status": "degradado", "versao": "0.1.0", "banco": "indisponivel", "migracao": None}
    assert "segredo" not in r.text


def test_health_tambem_em_api_health():
    app = criar_app(Config(database_url="postgresql://x:y@127.0.0.1:1/x", timeout_banco_s=1))
    assert TestClient(app).get("/api/health").status_code == 503


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL não definido")
def test_health_com_banco():
    app = criar_app(Config(database_url=os.environ["TEST_DATABASE_URL"]))
    r = TestClient(app).get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok" and r.json()["banco"] == "ok"
