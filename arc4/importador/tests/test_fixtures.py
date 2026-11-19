"""F0.4 — as fixtures sintéticas cobrem o layout e os casos de borda da carga real.

Os testes conferem o conteúdo lendo os ZIPs de volta pelo leitor do importador, sem confiar
apenas no que o gerador declara no manifesto.
"""

import re
import zipfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from arc4_importador.fixtures import gerar_carga
from arc4_importador.layout import EPS, TIPOS, identificar, nome_arquivo
from arc4_importador.leitura import abrir, contar_registros, registros, sha256_arquivo


def _zip(destino: Path, tipo: str, eps: str) -> Path:
    return destino / nome_arquivo("20261119", tipo, eps)


def test_gera_27_arquivos_com_nome_valido(carga_sintetica):
    destino, manifesto = carga_sintetica
    zips = sorted(p.name for p in destino.glob("*.zip"))
    assert len(zips) == 27 == len(manifesto["arquivos"])
    assert {(identificar(n).tipo, identificar(n).eps) for n in zips} == {(t, e) for t in TIPOS for e in EPS}


def test_manifesto_bate_com_os_arquivos(carga_sintetica):
    destino, manifesto = carga_sintetica
    for nome, info in manifesto["arquivos"].items():
        p = destino / nome
        assert sha256_arquivo(p) == info["sha256"]
        assert p.stat().st_size == info["tamanho_bytes"]
        assert contar_registros(p) == info["registros"], nome


def test_cabecalhos_completos_e_sem_colunas_desconhecidas(carga_sintetica):
    destino, _ = carga_sintetica
    for p in destino.glob("*.zip"):
        with abrir(p) as arq:
            assert arq.mapa.ausentes_obrigatorias == (), p.name
            assert arq.mapa.ausentes_opcionais == (), p.name
            assert arq.mapa.desconhecidas == (), p.name


def test_cabecalhos_irregulares_como_o_banco_envia(carga_sintetica):
    destino, _ = carga_sintetica
    with abrir(_zip(destino, "REMESSA_ARC4U", "0140")) as arq:
        assert "numero_parcelas _atraso" in arq.cabecalho
        assert "CamecDate | data_camec" in arq.cabecalho


def test_latin1_com_acentos(carga_sintetica):
    destino, _ = carga_sintetica
    nomes = [r["nome"] for e in EPS for r in registros(_zip(destino, "REMESSA_ARC4U", e))]
    assert any(re.search(r"[ÃÉÊÍÓÔÚÇ]", n) for n in nomes)


def _data_unica(valores: list[str], formato: str) -> None:
    """Todos os valores parseiam no formato declarado e pelo menos um tem dia > 12."""
    dias = [datetime.strptime(v, formato).day for v in valores]
    assert max(dias) > 12, "sem dia > 12 a troca de formato passaria despercebida"


def test_datas_no_formato_declarado_por_coluna(carga_sintetica):
    destino, _ = carga_sintetica
    por_formato = {"MMDDAAAA": "%m%d%Y", "DDMMAAAA": "%d%m%Y", "DD/MM/AAAA": "%d/%m/%Y"}
    for tipo, t in TIPOS.items():
        for c in t.colunas:
            if not c.formato_data:
                continue
            valores = [r[c.nome] for e in EPS for r in registros(_zip(destino, tipo, e)) if r[c.nome]]
            if valores:
                _data_unica(valores, por_formato[c.formato_data.value])


def test_pagamento_ddmmaaaa_nao_parseia_como_mmddaaaa(carga_sintetica):
    destino, _ = carga_sintetica
    datas = [r["data_pagamento"] for e in EPS for r in registros(_zip(destino, "PAGAMENTO", e))]
    assert "13112026" in datas
    ambiguas_invalidas = 0
    for d in datas:
        try:
            datetime.strptime(d, "%m%d%Y")
        except ValueError:
            ambiguas_invalidas += 1
    assert ambiguas_invalidas > 0


def test_pagamento_acumulado_desde_2021(carga_sintetica):
    destino, _ = carga_sintetica
    anos = {r["data_pagamento"][-4:] for e in EPS for r in registros(_zip(destino, "PAGAMENTO", e))}
    assert "2021" in anos and "2026" in anos


def _contratos(destino: Path, eps: str) -> set[str]:
    return {r["contrato_original"] for r in registros(_zip(destino, "REMESSA_ARC4U", eps))}


def test_contrato_em_duas_eps(carga_sintetica):
    destino, manifesto = carga_sintetica
    c = {e: _contratos(destino, e) for e in EPS}
    assert len(c["0140"] & c["0900"]) == 3 == len(manifesto["casos"]["coincidentes"]["0140+0900"])
    assert len(c["0144"] & c["0900"]) == 1
    assert not c["0140"] & c["0144"]


def test_contrato_unico_por_eps_no_arquivo(carga_sintetica):
    destino, _ = carga_sintetica
    for e in EPS:
        cont = Counter(r["contrato_original"] for r in registros(_zip(destino, "REMESSA_ARC4U", e)))
        assert max(cont.values()) == 1


def test_renegociado_muda_contrato_e_mantem_original(carga_sintetica):
    destino, _ = carga_sintetica
    ren = [
        r
        for e in EPS
        for r in registros(_zip(destino, "REMESSA_ARC4U", e))
        if r["contrato"] != r["contrato_original"]
    ]
    assert ren and all(r["contrato"] == r["contrato_original"] + "-REN01" for r in ren)


def test_bloqueados_identico_nas_tres_eps_e_global(carga_sintetica):
    destino, _ = carga_sintetica
    conteudos = set()
    for e in EPS:
        with zipfile.ZipFile(_zip(destino, "TELEFONES_BLOQUEADOS", e)) as z:
            conteudos.add(z.read(z.namelist()[0]))
    assert len(conteudos) == 1, "o CSV é o mesmo nas 3 EPS"
    # ...mas cada ZIP tem hash próprio, como na carga real (sha256 é único por arquivo).
    assert len({sha256_arquivo(_zip(destino, "TELEFONES_BLOQUEADOS", e)) for e in EPS}) == 3
    assert {r["contrato_original"] for r in registros(_zip(destino, "TELEFONES_BLOQUEADOS", "0140"))} == {"*"}


def test_telefones_enviados_que_estao_na_lista_de_bloqueio(carga_sintetica):
    destino, manifesto = carga_sintetica
    bloq = {
        (r["ddd_telefone_inibido"].lstrip("0"), r["numero_telefone_inibido"])
        for r in registros(_zip(destino, "TELEFONES_BLOQUEADOS", "0140"))
    }
    for e in EPS:
        hit = sum(
            (r["ddd_telefone"].lstrip("0"), r["numero_telefone"]) in bloq
            for r in registros(_zip(destino, "TELEFONE", e))
        )
        assert hit == manifesto["casos"]["telefones_bloqueados_enviados"][e]


def test_telefone_duplicado_e_ddd_com_zero(carga_sintetica):
    destino, _ = carga_sintetica
    for e in EPS:
        regs = list(registros(_zip(destino, "TELEFONE", e)))
        chaves = Counter((r["contrato_original"], r["ddd_telefone"], r["numero_telefone"]) for r in regs)
        assert sum(n - 1 for n in chaves.values()) == 1
        assert any(r["ddd_telefone"].startswith("0") for r in regs)


def test_telefones_e_parcelas_sem_orfaos(carga_sintetica):
    destino, _ = carga_sintetica
    for e in EPS:
        base = _contratos(destino, e)
        for tipo in ("PARCELAS", "TELEFONE", "ACORDO_ATUAL", "PAGAMENTO", "GARANTIAS"):
            orfaos = {r["contrato_original"] for r in registros(_zip(destino, tipo, e))} - base
            assert not orfaos, (tipo, e)


def test_acordo_ativo_n_mesmo_com_acordo(carga_sintetica):
    destino, manifesto = carga_sintetica
    for e in EPS:
        assert {r["acordo_ativo"] for r in registros(_zip(destino, "REMESSA_ARC4U", e))} == {"N"}
        n = sum(1 for _ in registros(_zip(destino, "ACORDO_ATUAL", e)))
        assert n == manifesto["casos"]["acordos"][e] > 0


def test_segmentacao_error_level_em_todas(carga_sintetica):
    destino, _ = carga_sintetica
    seg = {r["segmentacao_do_contrato"] for e in EPS for r in registros(_zip(destino, "REMESSA_ARC4U", e))}
    assert all(s.startswith("ERROR_LEVEL_") for s in seg)


def test_curva_divergente_acima_de_um_real(carga_sintetica):
    destino, manifesto = carga_sintetica
    for e in EPS:
        soma: dict[str, float] = defaultdict(float)
        for r in registros(_zip(destino, "PARCELAS", e)):
            soma[r["contrato_original"]] += float(r["curva_parcela"])
        diverge = {
            r["contrato_original"]
            for r in registros(_zip(destino, "REMESSA_ARC4U", e))
            if abs(float(r["valor_curva"]) - soma[r["contrato_original"]]) > 1
        }
        assert diverge == {manifesto["casos"]["curva_divergente"][e]}


def test_retiradas_fora_da_remessa_do_dia(carga_sintetica):
    destino, _ = carga_sintetica
    for e in EPS:
        ret = {r["contrato_original"] for r in registros(_zip(destino, "RETIRADA", e))}
        assert ret and not ret & _contratos(destino, e)


def test_arquivos_so_com_cabecalho(carga_sintetica):
    destino, manifesto = carga_sintetica
    for nome in manifesto["casos"]["somente_cabecalho"]:
        assert contar_registros(destino / nome) == 0
        with abrir(destino / nome) as arq:
            assert arq.cabecalho, "a estrutura precisa existir mesmo sem dados"


def test_deterministico(tmp_path, carga_sintetica):
    _, manifesto = carga_sintetica
    outra = gerar_carga(tmp_path / "x")
    assert {n: a["sha256"] for n, a in outra["arquivos"].items()} == {
        n: a["sha256"] for n, a in manifesto["arquivos"].items()
    }


def test_manifesto_se_declara_sintetico(carga_sintetica):
    _, manifesto = carga_sintetica
    assert manifesto["sintetico"] is True


def test_hashes_unicos_na_carga(carga_sintetica):
    """canonico.arquivo.sha256 é único: os 27 arquivos de uma carga precisam ter hashes distintos."""
    _, manifesto = carga_sintetica
    assert len({a["sha256"] for a in manifesto["arquivos"].values()}) == 27
