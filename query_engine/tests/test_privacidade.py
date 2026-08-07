"""
Invariantes de privacidade do executor.

Estes testes não provam que o dashboard funciona. Eles provam que ele não
vaza. Cada um cita a premissa do design doc que sustenta.

Se algum destes ficar vermelho, o PLUM não pode ser vendido com a garantia de
privacidade que está no material comercial. Não conserte o teste; conserte o
executor.
"""

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from query_engine.pandas_executor import (  # noqa: E402
    DEFAULT_K_MIN,
    MissingColumnError,
    RawRowsBlocked,
    RowLimitExceeded,
    execute_plan,
    roles_from_formatting_rules,
)


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def vendas():
    """
    12 linhas. 'Sul' tem 6 (passa em k=5), 'Norte' tem 4 e 'Centro' tem 2
    (os dois abaixo do limiar).
    """
    return {
        "producao": pd.DataFrame(
            {
                "regiao": ["Sul"] * 6 + ["Norte"] * 4 + ["Centro"] * 2,
                "vendedor": [f"pessoa_{i}" for i in range(12)],
                "faturamento": [100.0] * 12,
                "margem_percentual": [10.0] * 12,
                "data_venda": pd.to_datetime(["2026-06-15"] * 12),
            }
        )
    }


def _plano_por_regiao():
    return {
        "from": "producao",
        "select": [
            {"expr": {"agg": "sum", "col": "faturamento"}, "as": "total"},
        ],
        "group_by": ["regiao"],
    }


# ─────────────────────────────────────────────────────────────────────────────
# P3 — agregado não é sinônimo de anônimo
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.invariante
def test_p3_grupo_abaixo_do_limiar_e_suprimido(vendas):
    r = execute_plan(_plano_por_regiao(), vendas, k_min=5)

    regioes = {row["regiao"] for row in r["rows"]}
    assert regioes == {"Sul"}, "Norte (4) e Centro (2) deveriam sumir"
    assert r["suppressed_groups"] == 2


@pytest.mark.invariante
def test_p3_supressao_e_reportada_para_a_interface(vendas):
    """A interface precisa do número para poder explicar o buraco na tela."""
    r = execute_plan(_plano_por_regiao(), vendas, k_min=5)
    assert r["suppressed_groups"] == 2


@pytest.mark.invariante
def test_p3_todos_os_grupos_abaixo_do_limiar_devolve_vazio_explicado(vendas):
    r = execute_plan(_plano_por_regiao(), vendas, k_min=50)
    assert r["rows"] == []
    assert r["suppressed_groups"] == 3


@pytest.mark.invariante
def test_p3_agregado_unico_sobre_base_pequena_e_suprimido():
    """
    Sem group_by o "grupo" é a base inteira depois do where. Um filtro que
    isola 2 linhas e soma o salário delas é tão identificável quanto a linha.
    """
    tabelas = {
        "producao": pd.DataFrame(
            {"salario": [8000.0, 9000.0], "cargo": ["diretor", "diretor"]}
        )
    }
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "salario"}, "as": "folha"}],
    }
    r = execute_plan(plano, tabelas, k_min=5)
    assert r["rows"] == []
    assert r["suppressed_groups"] == 1


@pytest.mark.invariante
def test_p3_o_limiar_padrao_e_cinco():
    assert DEFAULT_K_MIN == 5


# ─────────────────────────────────────────────────────────────────────────────
# P1.3 — só vetor agregado atravessa a fronteira
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.invariante
def test_p13_plano_sem_agregacao_e_recusado(vendas):
    plano = {
        "from": "producao",
        "select": [{"expr": "vendedor"}, {"expr": "faturamento"}],
    }
    with pytest.raises(RawRowsBlocked):
        execute_plan(plano, vendas, k_min=5)


@pytest.mark.invariante
def test_p13_plano_sem_select_e_recusado(vendas):
    with pytest.raises(RawRowsBlocked):
        execute_plan({"from": "producao"}, vendas, k_min=5)


@pytest.mark.invariante
def test_p13_nenhuma_linha_bruta_no_retorno(vendas):
    """
    Nenhum valor da coluna identificadora pode aparecer no vetor de saída.
    Este é o teste que a auditoria vai querer ver.
    """
    r = execute_plan(_plano_por_regiao(), vendas, k_min=5)
    saida = str(r["rows"])
    for pessoa in vendas["producao"]["vendedor"]:
        assert pessoa not in saida


# ─────────────────────────────────────────────────────────────────────────────
# REGRESSÃO CRÍTICA — filtro com coluna ausente
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.regressao
def test_regressao_coluna_ausente_no_where_levanta_excecao(vendas):
    """
    Antes: `_eval_single` devolvia pd.Series([True] * len(df)) e o filtro
    sumia. Um card rotulado "Faturamento de julho" mostrava o total histórico.
    Número errado com etiqueta convincente é pior que erro na tela.
    """
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "faturamento"}, "as": "total"}],
        "where": {"left": "coluna_que_nao_existe", "op": "=", "right": "x"},
    }
    with pytest.raises(MissingColumnError):
        execute_plan(plano, vendas, k_min=0)


@pytest.mark.regressao
def test_regressao_coluna_ausente_dentro_de_and_aninhado(vendas):
    """O where é recursivo; a checagem precisa alcançar as folhas."""
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "faturamento"}, "as": "total"}],
        "where": {
            "op": "and",
            "args": [
                {"left": "regiao", "op": "=", "right": "Sul"},
                {
                    "op": "or",
                    "args": [
                        {"left": "regiao", "op": "=", "right": "Norte"},
                        {"left": "fantasma", "op": ">", "right": 1},
                    ],
                },
            ],
        },
    }
    with pytest.raises(MissingColumnError):
        execute_plan(plano, vendas, k_min=0)


@pytest.mark.regressao
def test_regressao_coluna_ausente_em_group_by(vendas):
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "faturamento"}, "as": "total"}],
        "group_by": ["fantasma"],
    }
    with pytest.raises(MissingColumnError):
        execute_plan(plano, vendas, k_min=0)


@pytest.mark.regressao
def test_regressao_coluna_ausente_em_select(vendas):
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "fantasma"}, "as": "total"}],
    }
    with pytest.raises(MissingColumnError):
        execute_plan(plano, vendas, k_min=0)


# ─────────────────────────────────────────────────────────────────────────────
# Papéis de coluna (multitenant, sem constante global)
# ─────────────────────────────────────────────────────────────────────────────

def test_soma_de_percentual_vira_media(vendas):
    plano = {
        "from": "producao",
        "select": [
            {"expr": {"agg": "sum", "col": "margem_percentual"}, "as": "margem"}
        ],
    }
    r = execute_plan(
        plano, vendas, column_roles={"margem_percentual": "percent"}, k_min=5
    )
    # 12 linhas de 10.0: somar daria 120, a média dá 10.
    assert r["rows"][0]["margem"] == pytest.approx(10.0)


def test_sem_papel_declarado_a_soma_continua_soma(vendas):
    """O executor não adivinha. Sem papel, ele obedece o plano."""
    plano = {
        "from": "producao",
        "select": [
            {"expr": {"agg": "sum", "col": "margem_percentual"}, "as": "margem"}
        ],
    }
    r = execute_plan(plano, vendas, k_min=5)
    assert r["rows"][0]["margem"] == pytest.approx(120.0)


def test_papeis_derivados_das_regras_de_formatacao():
    roles = roles_from_formatting_rules(
        {
            "margem": "Converter para percentual com 2 casas",
            "data_venda": "Converter para data no formato dd/mm/aaaa",
            "faturamento": "Retirar o R$ e converter para float",
            "cliente": "Manter como texto",
        }
    )
    assert roles["margem"] == "percent"
    assert roles["data_venda"] == "date"
    assert roles["faturamento"] == "number"
    assert roles["cliente"] == "text"


# ─────────────────────────────────────────────────────────────────────────────
# Teto de entrada
# ─────────────────────────────────────────────────────────────────────────────

def test_teto_de_linhas_recusa_antes_de_processar():
    """
    O `limit` do plano corta a saída, não a entrada. Sem este teto, uma
    planilha grande mata o container antes de chegar no limit.
    """
    tabelas = {"producao": pd.DataFrame({"v": range(1000)})}
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "v"}, "as": "t"}],
        "limit": 1,
    }
    with pytest.raises(RowLimitExceeded) as exc:
        execute_plan(plano, tabelas, k_min=0, max_rows=500)
    # A mensagem precisa nomear o tamanho e o limite, senao o log nao ajuda.
    assert "1,000" in str(exc.value) and "500" in str(exc.value)


def test_dentro_do_teto_executa_normal():
    tabelas = {"producao": pd.DataFrame({"v": range(100)})}
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "v"}, "as": "t"}],
    }
    r = execute_plan(plano, tabelas, k_min=0, max_rows=500)
    assert r["rows"][0]["t"] == pytest.approx(4950.0)
