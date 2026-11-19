import pytest

from arc4_importador.layout import (
    EPS,
    TIPOS,
    FormatoData,
    identificar,
    mapear_cabecalho,
    nome_arquivo,
    rotulo_eps,
)


def test_nove_tipos_tres_eps():
    assert len(TIPOS) == 9
    assert EPS == ("0140", "0144", "0900")


def test_rotulo_eps_no_formato_obrigatorio():
    assert [rotulo_eps(e) for e in EPS] == ["0140 · CLEAN", "0144 · CAÍDOS", "0900 · DESAFIANTE"]


@pytest.mark.parametrize("tipo", sorted(TIPOS))
def test_dicionario_consistente(tipo):
    t = TIPOS[tipo]
    nomes = [c.nome for c in t.colunas]
    assert len(nomes) == len(set(nomes)), "coluna repetida"
    assert "contrato_original" in nomes
    assert all(k in nomes for k in t.chave), "chave fora do dicionário"
    grafias = [g for c in t.colunas for g in (c.nome, *c.apelidos)]
    assert len(grafias) == len(set(grafias)), "apelido ambíguo"


def test_formatos_de_data_por_coluna():
    assert TIPOS["PAGAMENTO"].coluna("data_pagamento").formato_data is FormatoData.DDMMAAAA
    assert TIPOS["REMESSA_ARC4U"].coluna("menor_data_atraso").formato_data is FormatoData.MMDDAAAA
    assert TIPOS["PARCELAS"].coluna("vencimento_parcela").formato_data is FormatoData.MMDDAAAA
    assert TIPOS["RETIRADA"].coluna("data_baixa").formato_data is FormatoData.MMDDAAAA
    acordo = TIPOS["ACORDO_ATUAL"].coluna("vencimento_parcela_atual")
    assert acordo.formato_data is FormatoData.DD_MM_AAAA


@pytest.mark.parametrize(
    ("nome", "tipo", "eps"),
    [
        ("20261119_REMESSA_ARC4U_0140_OUT.zip", "REMESSA_ARC4U", "0140"),
        ("20261119_TELEFONE_0144_OUT.zip", "TELEFONE", "0144"),
        ("20261119_TELEFONES_BLOQUEADOS_0900_OUT.zip", "TELEFONES_BLOQUEADOS", "0900"),
        ("20261119_ACORDO_ATUAL_0900_OUT.zip", "ACORDO_ATUAL", "0900"),
    ],
)
def test_identifica_tipo_eps_data(nome, tipo, eps):
    i = identificar(nome)
    assert i.valido and (i.tipo, i.eps, i.data) == (tipo, eps, "20261119")


@pytest.mark.parametrize(
    "nome",
    [
        "20261119_REMESSA_ARC4U_0141_OUT.zip",  # EPS desconhecida
        "20261119_NOVO_TIPO_0140_OUT.zip",  # tipo desconhecido
        "2026111_PARCELAS_0140_OUT.zip",  # data curta
        "20261319_PARCELAS_0140_OUT.zip",  # mês 13
        "20261119_PARCELAS_0140_OUT.csv",
        "remessa.zip",
    ],
)
def test_nome_fora_do_padrao_tem_motivo(nome):
    i = identificar(nome)
    assert not i.valido and i.motivo


def test_nome_arquivo_ida_e_volta():
    for tipo in TIPOS:
        for e in EPS:
            assert identificar(nome_arquivo("20261119", tipo, e)).tipo == tipo


def test_cabecalho_com_apelidos_e_bom():
    cab = ["﻿contrato_original", "numero_parcelas _atraso", "CamecDate | data_camec", "coluna_nova"]
    m = mapear_cabecalho("REMESSA_ARC4U", cab)
    assert m.indices["contrato_original"] == 0
    assert m.indices["numero_parcelas_atraso"] == 1
    assert m.indices["data_camec"] == 2
    assert m.desconhecidas == ("coluna_nova",)
    assert "documento" in m.ausentes_obrigatorias


def test_coluna_obrigatoria_ausente_e_detectada():
    cab = [c.nome for c in TIPOS["PAGAMENTO"].colunas if c.nome != "valor_pago"]
    assert mapear_cabecalho("PAGAMENTO", cab).ausentes_obrigatorias == ("valor_pago",)
