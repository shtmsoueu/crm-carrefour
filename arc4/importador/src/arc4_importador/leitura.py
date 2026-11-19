"""Leitura em streaming dos ZIPs do banco (CSV ';', Latin-1).

Lógica reaproveitada de ``docs/diagnostico/scripts``: abre o primeiro membro do ZIP, decodifica
Latin-1 sem carregar o arquivo inteiro e mapeia o cabeçalho pelo dicionário (com apelidos).
A conversão de tipos (datas por coluna, decimais, documentos) é da Fase 2 (F2.3).
"""

from __future__ import annotations

import csv
import hashlib
import io
import zipfile
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from .layout import Identificacao, MapaCabecalho, identificar, mapear_cabecalho

ENCODING = "latin-1"
SEPARADOR = ";"


@dataclass(frozen=True)
class ArquivoAberto:
    identificacao: Identificacao
    cabecalho: list[str]
    mapa: MapaCabecalho
    linhas: Iterator[list[str]]


def sha256_arquivo(caminho: Path, bloco: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with caminho.open("rb") as f:
        while parte := f.read(bloco):
            h.update(parte)
    return h.hexdigest()


@contextmanager
def abrir(caminho: Path) -> Iterator[ArquivoAberto]:
    """Abre o ZIP e expõe cabeçalho mapeado e um iterador de linhas cruas."""
    ident = identificar(caminho.name)
    if not ident.valido:
        raise ValueError(f"{caminho.name}: {ident.motivo}")
    with zipfile.ZipFile(caminho) as z:
        membros = [n for n in z.namelist() if not n.endswith("/")]
        if len(membros) != 1:
            raise ValueError(f"{caminho.name}: esperado 1 CSV no ZIP, encontrados {len(membros)}")
        with z.open(membros[0]) as bruto:
            texto = io.TextIOWrapper(bruto, encoding=ENCODING, newline="")
            leitor = csv.reader(texto, delimiter=SEPARADOR)
            cabecalho = next(leitor, [])
            assert ident.tipo is not None
            yield ArquivoAberto(ident, cabecalho, mapear_cabecalho(ident.tipo, cabecalho), leitor)


def registros(caminho: Path) -> Iterator[dict[str, str]]:
    """Itera os registros como dicionários com nomes canônicos (valores ainda como texto)."""
    with abrir(caminho) as arq:
        indices = arq.mapa.indices
        for linha in arq.linhas:
            yield {nome: (linha[i] if i < len(linha) else "") for nome, i in indices.items()}


def contar_registros(caminho: Path) -> int:
    with abrir(caminho) as arq:
        return sum(1 for _ in arq.linhas)
