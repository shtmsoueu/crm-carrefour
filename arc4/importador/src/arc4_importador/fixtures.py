"""Gerador de fixtures sintéticas: 27 ZIPs pequenos no layout do banco.

Nenhum dado real é usado. Documentos, nomes e telefones são gerados a partir de uma semente
fixa (mesma semente => mesmos bytes => mesmo SHA-256). Os casos de borda confirmados na carga
de 19/11/2026 estão presentes de propósito e descritos em ``manifesto.json``:

- cabeçalho ``numero_parcelas _atraso`` (com espaço) e ``CamecDate | data_camec``;
- datas MMDDAAAA (remessa, parcelas, retirada, garantias, nascimento), DDMMAAAA (pagamento)
  e DD/MM/AAAA (vencimento do acordo), sempre com dia > 12 em pelo menos uma linha, para que
  uma leitura no formato errado falhe em vez de inverter dia e mês em silêncio;
- contrato em duas EPS (0140+0900 e 0144+0900);
- TELEFONES_BLOQUEADOS idêntico nas 3 EPS, com ``*`` no contrato, e telefones da remessa
  que constam na lista;
- telefone duplicado (mesmo contrato + DDD + número) e DDD com zero à esquerda;
- ``acordo_ativo = N`` em 100% da remessa, mesmo com ACORDO_ATUAL preenchido;
- ``segmentacao_do_contrato = ERROR_LEVEL_…`` em 100%;
- contrato renegociado (``contrato`` com sufixo ``-REN01``; ``contrato_original`` estável);
- curva divergente (> R$ 1) entre a remessa e a soma das parcelas;
- PAGAMENTO acumulado desde 2021; RETIRADA só com contratos fora da remessa do dia;
- AVALISTAS (3 EPS) e GARANTIAS 0900 só com cabeçalho;
- nomes acentuados, para exercitar a codificação Latin-1.

Uso: ``python -m arc4_importador.fixtures --destino tests/fixtures/20261119``.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import random
import zipfile
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

from .layout import EPS, TIPOS, FormatoData, nome_arquivo

SEMENTE_PADRAO = 20261119
DATA_PADRAO = "20261119"

# Cabeçalho como o banco envia (grafias irregulares incluídas). Ordem = ordem das colunas.
_GRAFIA_ARQUIVO = {
    ("REMESSA_ARC4U", "numero_parcelas_atraso"): "numero_parcelas _atraso",
    ("REMESSA_ARC4U", "data_camec"): "CamecDate | data_camec",
}

_ESTRATEGIAS = [
    # (nome_estrategia, produto_legado) — nomes no formato real; "NPL Consumer" e
    # "EMPACOTAMENTO DESENROLA 2.0 ARC" ficam sem regra de instituição (não mapeados).
    ("ITAU CONSUMER 11/2025", "NCARDC"),
    ("PAN CONSIGNADO 08/2025", "PANCONS"),
    ("PEFISA CARTOES 03/2024", "PEFCARD"),
    ("NEON CREDITO PESSOAL 01/2026", "NEONCPES"),
    ("SANTANDER VEICULOS 05/2025", "SANVEIL"),
    ("NPL Consumer", "NCPPES"),
    ("EMPACOTAMENTO DESENROLA 2.0 ARC", "DESCPES"),
]
_GRUPOS = ["G1", "G2", "G3", "G4", "C1", "C2", "C3", "M", "A1"]
_PRENOMES = ["JOÃO", "MARIA", "JOSÉ", "ANA", "CONCEIÇÃO", "ANTÔNIO", "LÚCIA", "PAULO", "INÊS", "CAIO"]
_SOBRENOMES = ["SINTÉTICO", "FICTÍCIO", "DE TESTE", "EXEMPLO", "MODELO"]
_CANAIS_ACORDO = ["serasa_limpa_nome", "acordo_certo", "renegocie_arc4u", "quero_quitar"]


def formatar_data(d: date, formato: FormatoData) -> str:
    match formato:
        case FormatoData.MMDDAAAA:
            return d.strftime("%m%d%Y")
        case FormatoData.DDMMAAAA:
            return d.strftime("%d%m%Y")
        case FormatoData.DD_MM_AAAA:
            return d.strftime("%d/%m/%Y")
    raise ValueError(formato)


def _cpf(rng: random.Random) -> str:
    """CPF sintético com dígitos verificadores válidos."""
    base = [rng.randint(0, 9) for _ in range(9)]
    for peso_ini in (10, 11):
        soma = sum(d * p for d, p in zip(base, range(peso_ini, 1, -1), strict=False))
        resto = (soma * 10) % 11
        base.append(0 if resto == 10 else resto)
    return "".join(map(str, base))


def _dinheiro(v: float) -> str:
    return f"{v:.2f}"


@dataclass
class _Contrato:
    original: str
    atual: str
    documento: str
    nome: str
    estrategia: str
    produto: str
    grupo: str
    dias_atraso: int
    parcelas: list[float] = field(default_factory=list)
    divergencia: float = 0.0
    telefones: list[tuple[str, str]] = field(default_factory=list)
    acordo: bool = False

    @property
    def curva(self) -> float:
        return round(sum(self.parcelas) + self.divergencia, 2)


@dataclass
class _Cenario:
    data: date
    por_eps: dict[str, list[_Contrato]]
    bloqueados: list[tuple[str, str]]
    retirados: dict[str, list[str]]
    casos: dict


def _montar_cenario(rng: random.Random, data_carga: date, contratos_por_eps: dict[str, int]) -> _Cenario:
    devedores: list[tuple[str, str]] = []

    def novo_devedor() -> tuple[str, str]:
        d = (_cpf(rng), f"{rng.choice(_PRENOMES)} {rng.choice(_SOBRENOMES)}")
        devedores.append(d)
        return d

    def novo_contrato(eps: str, i: int) -> _Contrato:
        # 1 em 5 contratos é de um devedor que já tem outro contrato (devedor é a entidade central).
        doc, nome = rng.choice(devedores) if devedores and rng.random() < 0.2 else novo_devedor()
        est, prod = rng.choice(_ESTRATEGIAS)
        original = f"CP-{eps}{i:05d}S"
        c = _Contrato(
            original=original,
            atual=original,
            documento=doc,
            nome=nome,
            estrategia=est,
            produto=prod,
            grupo=rng.choice(_GRUPOS),
            dias_atraso=rng.randint(1, 2500),
            parcelas=[round(rng.uniform(50, 2500), 2) for _ in range(rng.randint(1, 4))],
        )
        c.telefones = [
            (f"{rng.randint(11, 99)}", f"9{rng.randint(10_000_000, 99_999_999)}")
            for _ in range(rng.randint(1, 3))
        ]
        return c

    por_eps = {e: [novo_contrato(e, i) for i in range(1, contratos_por_eps[e] + 1)] for e in EPS}

    # Contrato em duas EPS: 3 em 0140+0900 e 1 em 0144+0900 (mesmo contrato_original).
    coincidentes = {"0140+0900": [], "0144+0900": []}
    for origem, n in (("0140", 3), ("0144", 1)):
        for c in por_eps[origem][:n]:
            copia = _Contrato(**{**c.__dict__, "parcelas": list(c.parcelas), "telefones": list(c.telefones)})
            copia.grupo = rng.choice(_GRUPOS)  # cada EPS traz seu próprio ranking
            por_eps["0900"].append(copia)
            coincidentes[f"{origem}+0900"].append(c.original)

    # Renegociado: contrato muda (-REN01), contrato_original não.
    renegociados = {}
    for e in EPS:
        c = por_eps[e][-1]
        c.atual = f"{c.original}-REN01"
        renegociados[e] = c.original

    # Curva divergente acima de R$ 1 (aviso, não bloqueia).
    divergentes = {}
    for e in EPS:
        c = por_eps[e][-2]
        c.divergencia = 5.37
        divergentes[e] = c.original

    # Lista global de bloqueio + telefones da remessa que constam nela.
    bloqueados = [(f"{rng.randint(11, 99)}", f"9{rng.randint(10_000_000, 99_999_999)}") for _ in range(6)]
    bloqueados_enviados = {"0140": 2, "0144": 1, "0900": 0}
    k = 0
    for e, n in bloqueados_enviados.items():
        for c in por_eps[e][5 : 5 + n]:
            c.telefones.append(bloqueados[k])
            k += 1

    # Telefone duplicado (mesmo contrato + DDD + número) e DDD com zero à esquerda.
    duplicados = {}
    for e in EPS:
        c = por_eps[e][6]
        c.telefones.append(c.telefones[0])
        duplicados[e] = 1
    ddd_zero = {}
    for e in EPS:
        c = por_eps[e][7]
        ddd, num = c.telefones[0]
        c.telefones[0] = (f"0{ddd}", num)
        ddd_zero[e] = c.original

    # Acordos: ~1 em 4 contratos; a remessa continua com acordo_ativo = N.
    acordos = {}
    for e in EPS:
        for c in por_eps[e]:
            c.acordo = rng.random() < 0.25
        por_eps[e][0].acordo = True
        acordos[e] = sum(c.acordo for c in por_eps[e])

    # Retiradas: contratos que não estão na remessa do dia.
    retirados = {
        e: [f"CP-{e}R{i:04d}S" for i in range(1, {"0140": 4, "0144": 2, "0900": 1}[e] + 1)] for e in EPS
    }

    casos = {
        "coincidentes": coincidentes,
        "renegociados": renegociados,
        "curva_divergente": divergentes,
        "telefones_bloqueados_enviados": bloqueados_enviados,
        "telefones_duplicados": duplicados,
        "ddd_com_zero": ddd_zero,
        "acordos": acordos,
        "acordo_ativo_remessa": "N",
        "segmentacao_do_contrato": "ERROR_LEVEL_",
        "somente_cabecalho": [
            *(nome_arquivo(data_carga.strftime("%Y%m%d"), "AVALISTAS", e) for e in EPS),
            nome_arquivo(data_carga.strftime("%Y%m%d"), "GARANTIAS", "0900"),
        ],
        "pagamento_data_mais_antiga": "2021-05-10",
    }
    return _Cenario(data_carga, por_eps, bloqueados, retirados, casos)


def _linhas(cen: _Cenario, tipo: str, eps: str, rng: random.Random) -> list[dict[str, str]]:
    d = cen.data
    fmt_d = formatar_data
    MMDD, DDMM, BARRA = FormatoData.MMDDAAAA, FormatoData.DDMMAAAA, FormatoData.DD_MM_AAAA
    contratos = cen.por_eps[eps]
    out: list[dict[str, str]] = []
    match tipo:
        case "REMESSA_ARC4U":
            for c in contratos:
                venc_antigo = d - timedelta(days=c.dias_atraso)
                out.append(
                    {
                        "contrato_original": c.original,
                        "contrato": c.atual,
                        "documento": c.documento,
                        "tipo_cliente": "F",
                        "nome": c.nome,
                        "data_nascimento": fmt_d(
                            date(1960 + rng.randint(0, 40), 12, rng.randint(13, 28)), MMDD
                        ),
                        "nome_estrategia": c.estrategia,
                        "produto_legado": c.produto,
                        "area_de_negocio": "VAREJO",
                        "codigo_eps": eps,
                        "marcacao_ativa_atual": eps,
                        "grupo_arc4u": c.grupo,
                        "grupo_anterior_arc4u": rng.choice("ABCD"),
                        "cluster_eps": f"CL{rng.randint(1, 5)}",
                        "segmento_npl": "NPL",
                        "risco_devedor": "S/I",
                        "valor_principal": _dinheiro(c.curva * 0.7),
                        "valor_curva": _dinheiro(c.curva),
                        "dias_atraso": str(c.dias_atraso),
                        "menor_data_atraso": fmt_d(
                            venc_antigo.replace(day=max(13, min(venc_antigo.day, 28))), MMDD
                        ),
                        "numero_parcelas_atraso": str(len(c.parcelas)),
                        "acordo_ativo": "N",
                        "inibicao_cobranca": "N",
                        "ajuizado": "N",
                        "tipo_de_pagamento": "BOLETO",
                        "processo_ativo": "N",
                        "protesto": "N",
                        "esta_demitido": "N",
                        "elegivel_entrega_amigavel": "N",
                        "segmentacao_do_contrato": "ERROR_LEVEL_3",
                        "data_camec": fmt_d(d - timedelta(days=1), MMDD),
                    }
                )
        case "PARCELAS":
            for c in contratos:
                for n, v in enumerate(c.parcelas, start=1):
                    venc = (d - timedelta(days=30 * (len(c.parcelas) - n) + c.dias_atraso)).replace(day=15)
                    out.append(
                        {
                            "contrato_original": c.original,
                            "numero_parcela": str(n),
                            "vencimento_parcela": fmt_d(venc, MMDD),
                            "status_parcela": "PA",
                            "curva_parcela": _dinheiro(v),
                            "escriturado": "S",
                        }
                    )
        case "TELEFONE":
            for c in contratos:
                for p, (ddd, num) in enumerate(c.telefones, start=1):
                    out.append(
                        {
                            "contrato_original": c.original,
                            "ddd_telefone": ddd,
                            "numero_telefone": num,
                            "origem_telefone": rng.choice(["BULK_IMPORT", "LESS", "DATA_LAKE"]),
                            "data_source_telefone": rng.choice(["CEDENTE", "Enriquecimento - 16/11/2026"]),
                            "prioridade_telefone": str(p),
                        }
                    )
        case "TELEFONES_BLOQUEADOS":
            out = [
                {"contrato_original": "*", "ddd_telefone_inibido": ddd, "numero_telefone_inibido": num}
                for ddd, num in cen.bloqueados
            ]
        case "ACORDO_ATUAL":
            for i, c in enumerate(c for c in contratos if c.acordo):
                tipo_status = ["ACTIVE", "PROMISE", "OVERDUE"][i % 3]
                out.append(
                    {
                        "contrato_original": c.original,
                        "contrato_atual": c.atual,
                        "id_acordo_atual": str(_uuid(rng)),
                        "status_acordo_atual": {"ACTIVE": "PROCESSED", "PROMISE": "VALIDATED"}.get(
                            tipo_status, "OVERDUE"
                        ),
                        "tipo_status_acordo_atual": tipo_status,
                        "tipo_acordo_atual": rng.choice(["TOTAL", "INSTALLMENT"]),
                        "eps_acordo_atual": rng.choice(_CANAIS_ACORDO),
                        "codigo_eps_atual": eps,
                        "acordo_atual_em_atraso": "Y" if tipo_status == "OVERDUE" else "N",
                        "valor_parcela_atual": _dinheiro(round(c.curva / 6, 2)),
                        "vencimento_parcela_atual": fmt_d(date(d.year, 12, 20), BARRA),
                    }
                )
        case "PAGAMENTO":
            # Acumulado desde 2021; inclui 13/11 para que MMDDAAAA seja impossível.
            datas = [date(2021, 5, 10), date(2024, 2, 29), date(d.year, 11, 13), d - timedelta(days=1)]
            for i, c in enumerate(contratos[:8]):
                out.append(
                    {
                        "contrato_original": c.original,
                        "data_pagamento": fmt_d(datas[i % len(datas)], DDMM),
                        "parcela_paga": str(1 + i % 3),
                        "valor_pago": _dinheiro(round(c.parcelas[0] / 2, 2)),
                    }
                )
        case "RETIRADA":
            out = [
                {
                    "contrato_original": co,
                    "data_baixa": fmt_d(d - timedelta(days=1), MMDD),
                    "motivo_retirada": str(1 + i % 2),
                }
                for i, co in enumerate(cen.retirados[eps])
            ]
        case "GARANTIAS":
            if eps != "0900":
                for i, c in enumerate(contratos[:3]):
                    out.append(
                        {
                            "contrato_original": c.original,
                            "id_garantia": f"GAR-{eps}-{i + 1:03d}",
                            "tipo_garantia": "AliFidVeiculo" if i % 2 == 0 else "FGO",
                            "data_compra_garantia": fmt_d(date(2022, 3, 17), MMDD),
                        }
                    )
        case "AVALISTAS":
            out = []
    return out


def _uuid(rng: random.Random) -> str:
    h = f"{rng.getrandbits(128):032x}"
    return f"{h[:8]}-{h[8:12]}-4{h[13:16]}-a{h[17:20]}-{h[20:32]}"


def _zip_bytes(nome_csv: str, cabecalho: list[str], linhas: list[list[str]]) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";", lineterminator="\r\n")
    w.writerow(cabecalho)
    w.writerows(linhas)
    conteudo = buf.getvalue().encode("latin-1")
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as z:
        info = zipfile.ZipInfo(nome_csv, date_time=(2026, 1, 1, 0, 0, 0))  # fixo: SHA-256 estável
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, conteudo)
    return out.getvalue()


def gerar_carga(
    destino: Path,
    data: str = DATA_PADRAO,
    semente: int = SEMENTE_PADRAO,
    contratos_por_eps: dict[str, int] | None = None,
) -> dict:
    """Gera os 27 ZIPs em ``destino`` e devolve o manifesto (também gravado em manifesto.json)."""
    contratos_por_eps = contratos_por_eps or {"0140": 40, "0144": 15, "0900": 20}
    rng = random.Random(semente)  # noqa: S311 — fixtures determinísticas, não criptografia
    data_carga = date(int(data[:4]), int(data[4:6]), int(data[6:]))
    cen = _montar_cenario(rng, data_carga, contratos_por_eps)
    destino.mkdir(parents=True, exist_ok=True)

    arquivos: dict[str, dict] = {}
    for tipo, t in TIPOS.items():
        cab = [_GRAFIA_ARQUIVO.get((tipo, c.nome), c.nome) for c in t.colunas]
        for eps in EPS:
            nome = nome_arquivo(data, tipo, eps)
            regs = _linhas(cen, tipo, eps, rng)
            n = len(regs)
            # Como no banco: o CSV de TELEFONES_BLOQUEADOS é idêntico nas 3 EPS, mas o nome interno
            # muda por EPS, então cada ZIP tem SHA-256 próprio (canonico.arquivo.sha256 é único).
            conteudo = _zip_bytes(
                nome.removesuffix(".zip") + ".csv", cab, [[r[c.nome] for c in t.colunas] for r in regs]
            )
            (destino / nome).write_bytes(conteudo)
            arquivos[nome] = {
                "sha256": hashlib.sha256(conteudo).hexdigest(),
                "tamanho_bytes": len(conteudo),
                "registros": n,
            }

    manifesto = {
        "sintetico": True,
        "carga": data_carga.isoformat(),
        "semente": semente,
        "arquivos": arquivos,
        "contratos_por_eps": {e: len(cen.por_eps[e]) for e in EPS},
        "casos": cen.casos,
    }
    (destino / "manifesto.json").write_text(json.dumps(manifesto, ensure_ascii=False, indent=1), "utf-8")
    return manifesto


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description="Gera os 27 ZIPs sintéticos de uma carga ARC4.")
    p.add_argument("--destino", type=Path, required=True)
    p.add_argument("--data", default=DATA_PADRAO, help="AAAAMMDD (padrão: %(default)s)")
    p.add_argument("--semente", type=int, default=SEMENTE_PADRAO)
    a = p.parse_args(argv)
    m = gerar_carga(a.destino, a.data, a.semente)
    print(f"{len(m['arquivos'])} arquivos sintéticos em {a.destino}")


if __name__ == "__main__":
    main()
