"""Dicionário de colunas dos arquivos do banco (fonte única).

Usado pelo gerador de fixtures, pela leitura dos cabeçalhos e, a partir da Fase 2, pela
validação de estrutura e pelo seed de ``canonico.dicionario_coluna``.

Cobertura: o pacote de diagnóstico não trouxe a lista completa de cabeçalhos (a REMESSA tem
82 colunas, a GARANTIAS 58). Aqui estão as colunas que os scripts de diagnóstico e a proposta
efetivamente usam. ``confirmada=False`` marca colunas cujo nome exato ainda não foi conferido
no arquivo real. Para completar: rodar ``docs/diagnostico/scripts/cabecalhos.py`` sobre
``dados/AAAAMMDD/`` e atualizar este módulo (ver docs/DECISOES.md, D-004).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import StrEnum


class FormatoData(StrEnum):
    """Formato declarado por coluna. Nunca inferir pelo valor (ex.: 11122026 é ambíguo)."""

    MMDDAAAA = "MMDDAAAA"
    DDMMAAAA = "DDMMAAAA"
    DD_MM_AAAA = "DD/MM/AAAA"


@dataclass(frozen=True)
class Coluna:
    nome: str
    """Nome canônico (minúsculo, sem espaços)."""
    apelidos: tuple[str, ...] = ()
    """Grafias alternativas aceitas no cabeçalho, como chegam do banco."""
    formato_data: FormatoData | None = None
    obrigatoria: bool = False
    """Ausência rejeita o arquivo (Fase 2, validação de estrutura)."""
    confirmada: bool = True
    """False: nome exato ainda não conferido no arquivo real."""


@dataclass(frozen=True)
class TipoArquivo:
    codigo: str
    chave: tuple[str, ...]
    colunas: tuple[Coluna, ...] = field(default_factory=tuple)
    global_entre_eps: bool = False
    """O mesmo conteúdo chega nas 3 EPS (ex.: TELEFONES_BLOQUEADOS, com contrato '*')."""

    def coluna(self, nome: str) -> Coluna:
        for c in self.colunas:
            if c.nome == nome:
                return c
        raise KeyError(f"{self.codigo}: coluna {nome!r} não está no dicionário")


EPS: tuple[str, ...] = ("0140", "0144", "0900")
NOME_EPS: dict[str, str] = {"0140": "CLEAN", "0144": "CAÍDOS", "0900": "DESAFIANTE"}


def rotulo_eps(codigo: str) -> str:
    """Rótulo obrigatório nas telas: ``0140 · CLEAN``."""
    return f"{codigo} · {NOME_EPS[codigo]}"


C = Coluna
MMDD = FormatoData.MMDDAAAA

TIPOS: dict[str, TipoArquivo] = {
    t.codigo: t
    for t in (
        TipoArquivo(
            "REMESSA_ARC4U",
            chave=("contrato_original",),
            colunas=(
                C("contrato_original", obrigatoria=True),
                C("contrato", obrigatoria=True),
                C("documento", obrigatoria=True),
                C("tipo_cliente"),
                C("nome", confirmada=False),
                C("data_nascimento", formato_data=MMDD, confirmada=False),
                C("nome_estrategia", obrigatoria=True),
                C("produto_legado", obrigatoria=True),
                C("area_de_negocio"),
                C("codigo_eps", obrigatoria=True),
                C("marcacao_ativa_atual"),
                C("grupo_arc4u", obrigatoria=True),
                C("grupo_anterior_arc4u"),
                C("cluster_eps"),
                C("segmento_npl"),
                C("risco_devedor"),
                C("valor_principal", obrigatoria=True),
                C("valor_curva", obrigatoria=True),
                C("dias_atraso", obrigatoria=True),
                C("menor_data_atraso", formato_data=MMDD),
                C("numero_parcelas_atraso", apelidos=("numero_parcelas _atraso",)),
                C("acordo_ativo"),  # vem N em 100%: derivar de ACORDO_ATUAL
                C("inibicao_cobranca"),
                C("ajuizado"),
                C("tipo_de_pagamento"),
                C("processo_ativo"),
                C("protesto"),
                C("esta_demitido"),
                C("elegivel_entrega_amigavel"),
                C("segmentacao_do_contrato"),  # vem ERROR_LEVEL_… em 100%: ignorar
                # Arquivo exato do cabeçalho "CamecDate | data_camec" a confirmar; formato idem.
                C("data_camec", apelidos=("CamecDate | data_camec", "CamecDate"), confirmada=False),
            ),
        ),
        TipoArquivo(
            "PARCELAS",
            chave=("contrato_original", "numero_parcela"),
            colunas=(
                C("contrato_original", obrigatoria=True),
                C("numero_parcela", obrigatoria=True),
                C("vencimento_parcela", formato_data=MMDD, obrigatoria=True),
                C("status_parcela", obrigatoria=True),  # 'PA': significado a confirmar com o banco
                C("curva_parcela", obrigatoria=True),
                C("escriturado"),
            ),
        ),
        TipoArquivo(
            "TELEFONE",
            chave=("contrato_original", "ddd_telefone", "numero_telefone"),
            colunas=(
                C("contrato_original", obrigatoria=True),
                C("ddd_telefone", obrigatoria=True),
                C("numero_telefone", obrigatoria=True),
                C("origem_telefone"),
                C("data_source_telefone"),
                C("prioridade_telefone"),
            ),
        ),
        TipoArquivo(
            "TELEFONES_BLOQUEADOS",
            chave=("ddd_telefone_inibido", "numero_telefone_inibido"),
            global_entre_eps=True,
            colunas=(
                C("contrato_original", obrigatoria=True),  # sempre '*'
                C("ddd_telefone_inibido", obrigatoria=True),
                C("numero_telefone_inibido", obrigatoria=True),
            ),
        ),
        TipoArquivo(
            "ACORDO_ATUAL",
            chave=("contrato_original",),
            colunas=(
                C("contrato_original", obrigatoria=True),
                C("contrato_atual", obrigatoria=True),
                C("id_acordo_atual", obrigatoria=True),
                C("status_acordo_atual"),
                C("tipo_status_acordo_atual", obrigatoria=True),
                C("tipo_acordo_atual"),
                C("eps_acordo_atual"),
                C("codigo_eps_atual"),
                C("acordo_atual_em_atraso"),
                C("valor_parcela_atual"),
                C("vencimento_parcela_atual", formato_data=FormatoData.DD_MM_AAAA),
            ),
        ),
        TipoArquivo(
            "PAGAMENTO",
            chave=("contrato_original", "data_pagamento", "parcela_paga"),
            colunas=(
                C("contrato_original", obrigatoria=True),
                C("data_pagamento", formato_data=FormatoData.DDMMAAAA, obrigatoria=True),
                C("parcela_paga", confirmada=False),
                C("valor_pago", obrigatoria=True),
            ),
        ),
        TipoArquivo(
            "RETIRADA",
            chave=("contrato_original",),
            colunas=(
                C("contrato_original", obrigatoria=True),
                C("data_baixa", formato_data=MMDD, obrigatoria=True),
                C("motivo_retirada", obrigatoria=True),  # 1 e 2: significado a confirmar
            ),
        ),
        TipoArquivo(
            "GARANTIAS",
            chave=("contrato_original", "id_garantia"),
            colunas=(
                C("contrato_original", obrigatoria=True),
                C("id_garantia", obrigatoria=True),
                C("tipo_garantia"),
                C("data_compra_garantia", formato_data=MMDD, confirmada=False),
            ),
        ),
        TipoArquivo(
            "AVALISTAS",
            chave=("contrato_original",),
            # Chega só com cabeçalho; demais colunas a levantar quando vier conteúdo.
            colunas=(C("contrato_original", obrigatoria=True),),
        ),
    )
}

_RE_NOME = re.compile(
    r"^(?P<data>\d{8})_(?P<tipo>"
    + "|".join(sorted(map(re.escape, TIPOS), key=len, reverse=True))
    + r")_(?P<eps>"
    + "|".join(EPS)
    + r")_OUT\.zip$"
)


@dataclass(frozen=True)
class Identificacao:
    nome: str
    data: str | None = None
    """AAAAMMDD, como no nome do arquivo."""
    tipo: str | None = None
    eps: str | None = None
    motivo: str | None = None
    """Preenchido quando o nome está fora do padrão (o arquivo é ignorado com este motivo)."""

    @property
    def valido(self) -> bool:
        return self.motivo is None


def identificar(nome: str) -> Identificacao:
    """Identifica tipo, EPS e data pelo nome ``AAAAMMDD_TIPO_EPS_OUT.zip``."""
    m = _RE_NOME.match(nome)
    if not m:
        return Identificacao(nome, motivo="nome fora do padrão AAAAMMDD_TIPO_EPS_OUT.zip")
    data = m["data"]
    mes, dia = int(data[4:6]), int(data[6:8])
    if not (1 <= mes <= 12 and 1 <= dia <= 31):
        return Identificacao(nome, motivo=f"data inválida no nome: {data}")
    return Identificacao(nome, data=data, tipo=m["tipo"], eps=m["eps"])


def nome_arquivo(data: str, tipo: str, eps: str) -> str:
    return f"{data}_{tipo}_{eps}_OUT.zip"


def normalizar_cabecalho(bruto: str) -> str:
    """Remove BOM e espaços das pontas. Não corrige espaços internos: isso é papel dos apelidos."""
    return bruto.replace("﻿", "").strip()


@dataclass(frozen=True)
class MapaCabecalho:
    indices: dict[str, int]
    """nome canônico -> posição no arquivo."""
    desconhecidas: tuple[str, ...]
    """Colunas fora do dicionário: aviso, não erro."""
    ausentes_obrigatorias: tuple[str, ...]
    """Rejeitam o arquivo."""
    ausentes_opcionais: tuple[str, ...]


def mapear_cabecalho(tipo: str, cabecalho: list[str]) -> MapaCabecalho:
    """Mapeia o cabeçalho recebido para os nomes canônicos usando nome e apelidos."""
    t = TIPOS[tipo]
    procura: dict[str, str] = {}
    for c in t.colunas:
        for grafia in (c.nome, *c.apelidos):
            procura[normalizar_cabecalho(grafia)] = c.nome
    indices: dict[str, int] = {}
    desconhecidas: list[str] = []
    for i, bruto in enumerate(cabecalho):
        h = normalizar_cabecalho(bruto)
        canonico = procura.get(h)
        if canonico is None or canonico in indices:
            desconhecidas.append(h)
        else:
            indices[canonico] = i
    faltando = [c for c in t.colunas if c.nome not in indices]
    return MapaCabecalho(
        indices=indices,
        desconhecidas=tuple(desconhecidas),
        ausentes_obrigatorias=tuple(c.nome for c in faltando if c.obrigatoria),
        ausentes_opcionais=tuple(c.nome for c in faltando if not c.obrigatoria),
    )
