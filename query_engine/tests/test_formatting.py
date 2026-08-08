"""
Dispatcher de formatação estruturada (Agente 3/3.1 → pandas_executor).

`query_engine/urgent.md` documentou que `apply_formatting_rules` decidia por
keyword-match em texto livre, e que qualquer regra fora do vocabulário
hardcoded passava sem transformação, em silêncio. Estes testes cobrem o
substituto: `type` de um enum fechado, com warning explícito quando a coluna
não pôde ser transformada — nunca mais um "sem aviso".
"""

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from query_engine.pandas_executor import (  # noqa: E402
    TYPE_TO_ROLE,
    apply_formatting_rules,
    roles_from_formatting_rules,
)


def _regra(tipo: str, **params) -> dict:
    return {"type": tipo, "params": params}


# ─────────────────────────────────────────────────────────────────────────────
# Cada `type` do enum
# ─────────────────────────────────────────────────────────────────────────────

def test_moeda_brl_limpa_simbolo_separador_de_milhar_e_virgula():
    df = pd.DataFrame({"faturamento": ["R$ 1.234,56", "R$ 10,00", "R$ 0,50"]})
    out = apply_formatting_rules(df, {"faturamento": _regra("moeda_brl")})
    assert out["faturamento"].tolist() == pytest.approx([1234.56, 10.00, 0.50])


def test_numero_decimal_troca_virgula_por_ponto():
    df = pd.DataFrame({"nota": ["8,5", "10,0", "7,25"]})
    out = apply_formatting_rules(df, {"nota": _regra("numero_decimal")})
    assert out["nota"].tolist() == pytest.approx([8.5, 10.0, 7.25])


def test_numero_inteiro_vira_int64_anulavel():
    df = pd.DataFrame({"qtd": ["1.000", "2", ""]})
    out = apply_formatting_rules(df, {"qtd": _regra("numero_inteiro")})
    assert out["qtd"].tolist() == [1000, 2, pd.NA]
    assert str(out["qtd"].dtype) == "Int64"


def test_percentual_remove_smbolo_e_mantem_escala_0_a_100():
    df = pd.DataFrame({"desconto": ["15%", "7,5%", "100%"]})
    out = apply_formatting_rules(df, {"desconto": _regra("percentual")})
    assert out["desconto"].tolist() == pytest.approx([15.0, 7.5, 100.0])


def test_data_converte_dayfirst_por_padrao():
    df = pd.DataFrame({"data_venda": ["05/03/2026", "31/12/2025"]})
    out = apply_formatting_rules(df, {"data_venda": _regra("data")})
    assert out["data_venda"].tolist() == [
        pd.Timestamp("2026-03-05"),
        pd.Timestamp("2025-12-31"),
    ]


def test_data_respeita_dayfirst_false_via_params():
    df = pd.DataFrame({"data_venda": ["03/05/2026"]})
    out = apply_formatting_rules(
        df, {"data_venda": _regra("data", dayfirst=False)}
    )
    assert out["data_venda"].tolist() == [pd.Timestamp("2026-03-05")]


def test_data_converte_numero_de_serie_do_sheets_excel():
    # UNFORMATTED_VALUE devolve o serial (dias desde 1899-12-30) para celulas
    # formatadas como Data no Sheets — 46063 = 2026-02-10.
    df = pd.DataFrame({"data_apontamento": [46063, 46064]})
    out = apply_formatting_rules(df, {"data_apontamento": _regra("data")})
    assert out["data_apontamento"].tolist() == [
        pd.Timestamp("2026-02-10"),
        pd.Timestamp("2026-02-11"),
    ]


def test_texto_trim_maiusculas():
    df = pd.DataFrame({"cliente": ["  joão  ", "maria"]})
    out = apply_formatting_rules(
        df, {"cliente": _regra("texto_trim_maiusculas")}
    )
    assert out["cliente"].tolist() == ["JOÃO", "MARIA"]


def test_texto_trim_minusculas():
    df = pd.DataFrame({"cliente": ["  JOÃO  ", "Maria"]})
    out = apply_formatting_rules(
        df, {"cliente": _regra("texto_trim_minusculas")}
    )
    assert out["cliente"].tolist() == ["joão", "maria"]


def test_documento_cpf_cnpj_mantem_so_digitos():
    df = pd.DataFrame({"cpf": ["123.456.789-00", "12.345.678/0001-99"]})
    out = apply_formatting_rules(
        df, {"cpf": _regra("documento_cpf_cnpj")}
    )
    assert out["cpf"].tolist() == ["12345678900", "12345678000199"]


def test_booleano_sim_nao_mapeia_variantes_comuns():
    df = pd.DataFrame({"ativo": ["Sim", "Não", "VERDADEIRO", "0", "?"]})
    out = apply_formatting_rules(
        df, {"ativo": _regra("booleano_sim_nao")}
    )
    assert out["ativo"].tolist()[:4] == [True, False, True, False]
    assert pd.isna(out["ativo"].tolist()[4])


def test_nenhuma_e_no_op():
    df = pd.DataFrame({"observacoes": ["texto livre qualquer"]})
    out = apply_formatting_rules(df, {"observacoes": _regra("nenhuma")})
    assert out["observacoes"].tolist() == ["texto livre qualquer"]


# ─────────────────────────────────────────────────────────────────────────────
# Falha visível, nunca silenciosa (o problema central do urgent.md)
# ─────────────────────────────────────────────────────────────────────────────

def test_type_desconhecido_nao_transforma_mas_loga_warning(caplog):
    df = pd.DataFrame({"col_estranha": ["valor bruto"]})
    with caplog.at_level("WARNING"):
        out = apply_formatting_rules(
            df, {"col_estranha": {"type": "tipo_que_nao_existe", "params": {}}}
        )
    assert out["col_estranha"].tolist() == ["valor bruto"]
    assert "col_estranha" in caplog.text
    assert "tipo_que_nao_existe" in caplog.text


def test_nenhuma_tambem_loga_warning(caplog):
    df = pd.DataFrame({"observacoes": ["texto livre"]})
    with caplog.at_level("WARNING"):
        apply_formatting_rules(df, {"observacoes": _regra("nenhuma")})
    assert "observacoes" in caplog.text


def test_coluna_ausente_no_dataframe_e_ignorada_sem_erro():
    df = pd.DataFrame({"faturamento": ["R$ 10,00"]})
    out = apply_formatting_rules(
        df, {"coluna_que_nao_existe": _regra("moeda_brl")}
    )
    assert list(out.columns) == ["faturamento"]


# ─────────────────────────────────────────────────────────────────────────────
# Papéis (percent/date/number/text) via TYPE_TO_ROLE — lookup, não regex
# ─────────────────────────────────────────────────────────────────────────────

def test_todos_os_types_do_enum_tem_papel_mapeado():
    for tipo in (
        "moeda_brl", "numero_decimal", "numero_inteiro", "percentual", "data",
        "texto_trim_maiusculas", "texto_trim_minusculas",
        "documento_cpf_cnpj", "booleano_sim_nao", "nenhuma",
    ):
        assert tipo in TYPE_TO_ROLE


def test_type_desconhecido_cai_em_role_text():
    roles = roles_from_formatting_rules(
        {"col": {"type": "tipo_que_nao_existe", "params": {}}}
    )
    assert roles["col"] == "text"
