from pathlib import Path

import pytest

from arc4_importador.fixtures import gerar_carga


@pytest.fixture(scope="session")
def carga_sintetica(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, dict]:
    """Os 27 ZIPs sintéticos de 19/11/2026. Nenhum teste lê os arquivos reais de dados/."""
    destino = tmp_path_factory.mktemp("carga") / "20261119"
    manifesto = gerar_carga(destino)
    return destino, manifesto
