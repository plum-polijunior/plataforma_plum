"""
Agrupamento por período (`group_by: [{"col": ..., "trunc": ...}]`).

Fase 5b, PR 2. O PR 1 já fechou a trava de tipo (ver a seção GROUP BY em
`test_formas_de_plano.py`): a forma objeto era `TypeError: unhashable type` →
HTTP 500 do lote inteiro. Aqui ela passa a ser aceita, e o que estes testes
protegem é o que a aceitação NÃO pode quebrar.

Três coisas em jogo, e a terceira é a que mais custa se der errado:

  1. os quatro truncamentos produzem o balde certo;
  2. o rótulo ORDENA como texto — se não ordenar, o gráfico de linha desenha
     na ordem errada sem nenhum erro no caminho;
  3. o caminho antigo (`group_by` com strings) segue idêntico, porque o chat
     usa o mesmo executor.
"""

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from query_engine.pandas_executor import (  # noqa: E402
    ExecutorError,
    MissingColumnError,
    _fmt_data,
    execute_plan,
    execute_plan_with_formatting,
)

ROLES = {"data_da_venda": "date", "valor": "number", "loja": "text"}


def _plano(trunc=None, col="data_da_venda", **extra):
    gb = {"col": col, "trunc": trunc} if trunc else col
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "valor"}, "as": "total"}],
        "group_by": [gb],
    }
    plano.update(extra)
    return plano


@pytest.fixture
def vendas_multiano():
    """Datas escolhidas para cair em baldes distintos nos quatro truncamentos."""
    return {
        "producao": pd.DataFrame(
            {
                "data_da_venda": pd.to_datetime(
                    [
                        "2025-01-15",  # 2025, Q1, jan/2025
                        "2026-01-05",  # 2026, Q1, jan/2026, semana de 05/01 (segunda)
                        "2026-01-08",  # mesma semana da anterior
                        "2026-03-31",  # 2026, Q1, mar/2026
                        "2026-07-02",  # 2026, Q3, jul/2026
                    ]
                ),
                "valor": [10.0, 20.0, 30.0, 40.0, 50.0],
                "loja": ["A", "B", "A", "B", "A"],
            }
        )
    }


# ─────────────────────────────────────────────────────────────────────────────
# Os quatro truncamentos
# ─────────────────────────────────────────────────────────────────────────────


def test_month(vendas_multiano):
    saida = execute_plan(_plano("month"), vendas_multiano, column_roles=ROLES)
    assert {l["data_da_venda"]: l["total"] for l in saida["rows"]} == {
        "2025-01": 10.0,
        "2026-01": 50.0,  # 20 + 30, as duas de janeiro/2026
        "2026-03": 40.0,
        "2026-07": 50.0,
    }


def test_quarter(vendas_multiano):
    saida = execute_plan(_plano("quarter"), vendas_multiano, column_roles=ROLES)
    assert {l["data_da_venda"]: l["total"] for l in saida["rows"]} == {
        "2025Q1": 10.0,
        "2026Q1": 90.0,  # 20 + 30 + 40
        "2026Q3": 50.0,
    }


def test_year(vendas_multiano):
    saida = execute_plan(_plano("year"), vendas_multiano, column_roles=ROLES)
    assert {l["data_da_venda"]: l["total"] for l in saida["rows"]} == {
        "2025": 10.0,
        "2026": 140.0,
    }


def test_week_rotula_pela_segunda_que_abre_a_semana(vendas_multiano):
    """
    05/01/2026 é segunda e 08/01/2026 é quinta: mesma semana, mesmo balde.

    O rótulo é a data de INÍCIO, e não `ano-Snn`, porque a numeração mente na
    virada do ano — ver `test_week_nao_mente_na_virada_do_ano`.
    """
    saida = execute_plan(_plano("week"), vendas_multiano, column_roles=ROLES)
    por_rotulo = {l["data_da_venda"]: l["total"] for l in saida["rows"]}
    assert por_rotulo["2026-01-05"] == 50.0  # 20 + 30
    # 15/01/2025 é quarta; a semana dela abre na segunda, 13/01/2025.
    assert por_rotulo["2025-01-13"] == 10.0


def test_week_nao_mente_na_virada_do_ano():
    """
    ⚠️ A armadilha que o rótulo ingênuo teria criado. Para 03/01/2027 o pandas
    devolve `p.year=2027, p.week=53`, então `f"{p.year}-S{p.week}"` daria
    "2027-S53" — semana 53 de um ano que acabou de começar (a ISO diz 2026-W53).
    Pior: "2027-S53" ordenaria no extremo DIREITO de 2027, desenhando a primeira
    semana do ano no fim dele.

    A data de início não tem esse problema: 28/12/2026.
    """
    tabelas = {
        "producao": pd.DataFrame(
            {
                "data_da_venda": pd.to_datetime(["2026-12-28", "2027-01-03"]),
                "valor": [1.0, 2.0],
            }
        )
    }
    saida = execute_plan(_plano("week"), tabelas, column_roles=ROLES)
    # As duas datas são a MESMA semana (28/12 é segunda, 03/01 é domingo).
    assert saida["rows"] == [{"data_da_venda": "2026-12-28", "total": 3.0}]


def test_semana_comeca_na_segunda_nao_no_domingo():
    """
    Domingo 04/01/2026 e segunda 05/01/2026 são semanas DIFERENTES.

    `to_period("W")` é `period[W-SUN]`, que significa semana que TERMINA no
    domingo — logo começa na segunda, a convenção brasileira e a ISO 8601. Este
    teste existe para travar isso: se algum dia alguém "corrigir" o anchor para
    W-MON achando que está arrumando, o balde do domingo muda de lugar e o
    número de "vendas da semana" muda de significado em silêncio.
    """
    tabelas = {
        "producao": pd.DataFrame(
            {
                "data_da_venda": pd.to_datetime(["2026-01-04", "2026-01-05"]),
                "valor": [7.0, 9.0],
            }
        )
    }
    saida = execute_plan(_plano("week"), tabelas, column_roles=ROLES)
    por_rotulo = {l["data_da_venda"]: l["total"] for l in saida["rows"]}
    assert por_rotulo == {"2025-12-29": 7.0, "2026-01-05": 9.0}


# ─────────────────────────────────────────────────────────────────────────────
# O rótulo tem que ORDENAR como texto
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "trunc", ["week", "month", "quarter", "year"], ids=lambda t: t
)
def test_rotulo_ordena_cronologicamente_como_texto(vendas_multiano, trunc):
    """
    ⚠️ É a razão de o rótulo ser ISO e não "jan/2026".

    O `order_by` ordena a coluna de saída como texto e o gráfico de linha desenha
    na ordem das linhas. Um rótulo em português ordenaria alfabeticamente — abr,
    ago, dez, fev... — e a linha sairia embaralhada sem nenhum erro no caminho.
    A tradução para português é do front, depois da ordenação.
    """
    plano = _plano(trunc, order_by=[{"col": "data_da_venda", "dir": "asc"}])
    saida = execute_plan(plano, vendas_multiano, column_roles=ROLES)
    rotulos = [l["data_da_venda"] for l in saida["rows"]]

    assert rotulos == sorted(rotulos), "ordenacao textual != ordem cronologica"
    # E a ordem textual tem que ser a cronológica de verdade: a primeira venda
    # da base é de 2025 e a última de julho/2026.
    assert rotulos[0].startswith("2025")
    assert rotulos[-1].startswith("2026")


# ─────────────────────────────────────────────────────────────────────────────
# Recusas nomeadas — nunca conversão silenciosa, nunca 500
# ─────────────────────────────────────────────────────────────────────────────


def test_trunc_sobre_coluna_de_texto_e_recusado(vendas_multiano):
    """
    Converter "parece data" em data acertaria algumas linhas e erraria outras, e
    o gráfico sairia com meses inventados e cara de certo.
    """
    with pytest.raises(ExecutorError) as erro:
        execute_plan(_plano("month", col="loja"), vendas_multiano, column_roles=ROLES)
    assert "loja" in str(erro.value)


def test_trunc_sobre_coluna_de_papel_ano_e_recusado():
    """
    ⚠️ O caso da base `tabela-de-estudos`, cuja coluna de conclusão mistura
    "2005" com "01/12/2005" e por isso tem papel `ano` (Int64).

    `Int64.dt` levanta `AttributeError: Can only use .dt accessor with
    datetimelike values` — que não é ExecutorError e viraria 500 do lote. E o
    pedido é redundante: agrupar por essa coluna como string já sai por ano.
    """
    tabelas = {
        "producao": pd.DataFrame(
            {
                "ano_conclusao": pd.array([2005, 2006], dtype="Int64"),
                "valor": [1.0, 2.0],
            }
        )
    }
    with pytest.raises(ExecutorError) as erro:
        execute_plan(
            _plano("year", col="ano_conclusao"),
            tabelas,
            column_roles={"ano_conclusao": "ano", "valor": "number"},
        )
    assert "ano_conclusao" in str(erro.value)


@pytest.mark.parametrize(
    "trunc_invalido", ["day", "semana", "MONTHLY", "hour", ""]
)
def test_trunc_fora_do_enum_e_recusado(vendas_multiano, trunc_invalido):
    """
    Enum fechado, como `_OPS_ARITMETICOS`. `day` está aqui de propósito (D2):
    agrupar pela coluna crua já agrupa por dia, e os dois rótulos divergiriam
    (`05/01/2026` do `_serialize_df` vs `2026-01-05` do período).
    """
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "valor"}, "as": "total"}],
        "group_by": [{"col": "data_da_venda", "trunc": trunc_invalido}],
    }
    with pytest.raises(ExecutorError):
        execute_plan(plano, vendas_multiano, column_roles=ROLES)


def test_trunc_que_nao_e_texto_e_recusado(vendas_multiano):
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "valor"}, "as": "total"}],
        "group_by": [{"col": "data_da_venda", "trunc": 3}],
    }
    with pytest.raises(ExecutorError) as erro:
        execute_plan(plano, vendas_multiano, column_roles=ROLES)
    assert "trunc" in str(erro.value)


def test_objeto_sem_col_continua_recusado(vendas_multiano):
    """A trava do PR 1 não pode ter afrouxado ao ganhar a forma objeto."""
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "valor"}, "as": "total"}],
        "group_by": [{"trunc": "month"}],
    }
    with pytest.raises(ExecutorError) as erro:
        execute_plan(plano, vendas_multiano, column_roles=ROLES)
    assert "col" in str(erro.value)


def test_trunc_sobre_coluna_ausente_e_missing_column(vendas_multiano):
    """
    `df[col]` numa coluna ausente é KeyError, que não é ExecutorError e viraria
    500 do lote — a mesma falha que o PR 1 fechou.
    """
    with pytest.raises(MissingColumnError) as erro:
        execute_plan(
            _plano("month", col="data_fantasma"), vendas_multiano, column_roles=ROLES
        )
    assert "data_fantasma" in str(erro.value)


# ─────────────────────────────────────────────────────────────────────────────
# Linha sem data (D6) e o caminho antigo
# ─────────────────────────────────────────────────────────────────────────────


def test_linha_sem_data_vira_rotulo_explicito():
    """
    D6: descartar faria o total do gráfico não fechar com o total da base, em
    silêncio. E o rótulo não pode vazar como "NaT"/"nan", que é representação
    interna do pandas chegando ao usuário final.
    """
    tabelas = {
        "producao": pd.DataFrame(
            {
                "data_da_venda": pd.to_datetime(
                    ["2026-01-05", None, "2026-01-06"]
                ),
                "valor": [10.0, 99.0, 20.0],
            }
        )
    }
    saida = execute_plan(_plano("month"), tabelas, column_roles=ROLES)
    por_rotulo = {l["data_da_venda"]: l["total"] for l in saida["rows"]}

    assert por_rotulo == {"2026-01": 30.0, "Sem data": 99.0}
    # O total fecha com a base inteira: nada foi descartado em silêncio.
    assert sum(por_rotulo.values()) == 129.0
    assert "NaT" not in por_rotulo and "nan" not in por_rotulo


def test_group_by_string_na_coluna_de_data_continua_por_dia(vendas_multiano):
    """
    ⚠️ A rede do chat. Sem `trunc`, o comportamento é o de sempre: um grupo por
    dia, com a data formatada por `_serialize_df` (`%d/%m/%Y`). Se isto mudar, o
    chat mudou de resposta sem ninguém pedir.
    """
    saida = execute_plan(_plano(), vendas_multiano, column_roles=ROLES)
    assert saida["row_count"] == 5  # cinco datas distintas, um grupo cada
    assert "15/01/2025" in {l["data_da_venda"] for l in saida["rows"]}


def test_objeto_sem_trunc_equivale_a_string(vendas_multiano):
    """
    `{"col": "loja"}` sem `trunc` é só outra grafia de `"loja"` — forma plausível
    de um LLM, e aceitá-la custa nada. Os dois resultados têm que ser idênticos.
    """
    como_string = execute_plan(_plano(col="loja"), vendas_multiano, column_roles=ROLES)
    plano_objeto = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "valor"}, "as": "total"}],
        "group_by": [{"col": "loja"}],
    }
    como_objeto = execute_plan(plano_objeto, vendas_multiano, column_roles=ROLES)
    assert como_string == como_objeto


def test_periodo_com_where_e_order_by_e_limit(vendas_multiano):
    """
    O truncamento é materializado DEPOIS do `where`, então o filtro continua
    operando sobre a data crua — é o que permite "faturamento por mês em 2026".
    """
    plano = _plano(
        "month",
        where={
            "left": "data_da_venda",
            "op": "between",
            "right": ["2026-01-01", "2026-12-31"],
        },
        order_by=[{"col": "total", "dir": "desc"}],
        limit=2,
    )
    saida = execute_plan(plano, vendas_multiano, column_roles=ROLES)
    assert [l["data_da_venda"] for l in saida["rows"]] == ["2026-01", "2026-07"]
    assert [l["total"] for l in saida["rows"]] == [50.0, 50.0]


def test_periodo_junto_com_expressao_aritmetica():
    """
    Receita por mês é o caso real: `soma(qtd × preco)` agrupado por mês. As duas
    materializações (coluna derivada e rótulo de período) escrevem no mesmo `df`
    e não podem atropelar uma à outra.
    """
    tabelas = {
        "producao": pd.DataFrame(
            {
                "data_da_venda": pd.to_datetime(
                    ["2026-01-05", "2026-01-20", "2026-02-03"]
                ),
                "qtd": [2, 3, 4],
                "preco": [10.0, 10.0, 5.0],
            }
        )
    }
    plano = {
        "from": "producao",
        "select": [
            {
                "expr": {"agg": "sum", "col": {"op": "mul", "args": ["qtd", "preco"]}},
                "as": "receita",
            }
        ],
        "group_by": [{"col": "data_da_venda", "trunc": "month"}],
        "order_by": [{"col": "data_da_venda", "dir": "asc"}],
    }
    saida = execute_plan(
        plano,
        tabelas,
        column_roles={"data_da_venda": "date", "qtd": "number", "preco": "number"},
    )
    assert saida["rows"] == [
        {"data_da_venda": "2026-01", "receita": 50.0},  # 2*10 + 3*10
        {"data_da_venda": "2026-02", "receita": 20.0},  # 4*5
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Gabarito real — a base de vendas, conferida à mão
# ─────────────────────────────────────────────────────────────────────────────

# `testes/chat/teste-chat-vendas-roupas.md` §2 traz os quatro totais semanais
# conferidos à mão contra a planilha. É o único gabarito humano disponível para
# esta fase: a base é toda de janeiro/2026, então `month` ali devolveria UM
# ponto, que não prova nada sobre um gráfico de linha. Semana devolve quatro.
GABARITO_SEMANAL = {
    "2026-01-05": 2227.91,
    "2026-01-12": 2387.92,
    "2026-01-19": 2274.55,
    "2026-01-26": 2338.89,
}


def test_gabarito_semanal_da_base_de_vendas():
    """
    Reproduz o gabarito humano com o caminho REAL do executor, incluindo
    `apply_formatting_rules` — a base guarda o valor como texto pt-BR
    ("R$ 1.234,56"), então passar por `execute_plan` puro não provaria a cadeia.

    Quatro semanas de 10 pedidos cada, R$ 9.229,27 no total.
    """
    dias = (
        [f"2026-01-{d:02d}" for d in (5, 6, 7, 8, 9)] * 2
        + [f"2026-01-{d:02d}" for d in (12, 13, 14, 15, 16)] * 2
        + [f"2026-01-{d:02d}" for d in (19, 20, 21, 22, 23)] * 2
        + [f"2026-01-{d:02d}" for d in (26, 27, 28, 29, 30)] * 2
    )
    # Valores distribuídos para somar exatamente o gabarito por semana.
    valores = (
        ["R$ 222,79"] * 9 + ["R$ 222,80"]
        + ["R$ 238,79"] * 9 + ["R$ 238,81"]
        + ["R$ 227,45"] * 9 + ["R$ 227,50"]
        + ["R$ 233,88"] * 9 + ["R$ 233,97"]
    )
    tabelas = {
        "producao": pd.DataFrame({"data_da_venda": dias, "valor_total": valores})
    }
    regras = {
        "data_da_venda": {"type": "data", "params": {"dayfirst": False}},
        "valor_total": {"type": "moeda_brl", "params": {}},
    }
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "valor_total"}, "as": "total"}],
        "group_by": [{"col": "data_da_venda", "trunc": "week"}],
        "order_by": [{"col": "data_da_venda", "dir": "asc"}],
    }
    saida = execute_plan_with_formatting(plano, tabelas, regras)

    obtido = {l["data_da_venda"]: round(l["total"], 2) for l in saida["rows"]}
    assert obtido == GABARITO_SEMANAL
    assert round(sum(obtido.values()), 2) == 9229.27
    # Quatro pontos, em ordem — é o que um gráfico de linha precisa.
    assert list(obtido) == sorted(obtido)

# ─────────────────────────────────────────────────────────────────────────────
# Regressão: o NaN que nunca deve chegar ao `to_datetime`
# ─────────────────────────────────────────────────────────────────────────────
#
# ⭐ Em 2026-08-21 o CI caiu com `FloatingPointError: overflow encountered in
# multiply` DENTRO do `test_gabarito_semanal_da_base_de_vendas` acima — um teste
# que passava na máquina de quem o escreveu, com a MESMA pandas 2.2.3 e a MESMA
# numpy 2.2.1.
#
# A causa não era plataforma, era SORTE. O `cast_from_unit_vectorized` do pandas
# aloca o vetor de frações com `np.empty` e roda `np.round(..., 13)` sobre ele
# inteiro, inclusive nas posições NaN — onde há lixo de memória. O traceback
# mostrava `-1.77e+307` num vetor que deveria ser todo NaN.
#
# `_fmt_data` passou a converter só o subconjunto numérico válido. Os testes
# abaixo travam as duas metades: nenhum NaN entra, e a faixa é respeitada.


@pytest.mark.regressao
def test_coluna_de_data_toda_textual_nao_estoura(recwarn):
    """
    O caso do CI, isolado: coluna tipada como `data` sem NENHUM serial. Antes,
    o vetor de NaN inteiro ia para o `to_datetime` e a fatia não inicializada
    virava roleta.
    """
    import numpy as np

    antigo = np.seterr(all="raise")
    try:
        r = _fmt_data(pd.Series(["2026-01-05", "2026-01-06"]), {"dayfirst": False})
    finally:
        np.seterr(**antigo)

    assert list(r.astype(str)) == ["2026-01-05", "2026-01-06"]


@pytest.mark.regressao
def test_coluna_mista_com_lixo_nao_estoura():
    """
    Serial, texto, número absurdo, negativo e vazio na mesma coluna — que é o
    caso real que motivou a escolha por LINHA em `_fmt_data`.
    """
    import numpy as np

    antigo = np.seterr(all="raise")
    try:
        r = _fmt_data(
            pd.Series(["2026-01-05", 45000, 1e18, -5, "lixo", None]),
            {"dayfirst": False},
        )
    finally:
        np.seterr(**antigo)

    assert list(r.astype(str)) == [
        "2026-01-05", "2023-03-15", "NaT", "NaT", "NaT", "NaT",
    ]


def test_serial_fora_da_faixa_vira_nat():
    """
    ⚠️ O teto NÃO é 9999-12-31, e este teste existe porque a primeira versão do
    corte achou que era. `datetime64[ns]` conta nanossegundos num int64 desde
    1970 e acaba em **2262-04-11** — serial acima disso não vira data, vira
    `NaT`, e deixá-lo passar só alimenta a multiplicação que o corte evita.
    """
    r = _fmt_data(pd.Series([132_320, 132_321, 2_958_465, 0, -1]), {"dayfirst": False})

    assert str(r.iloc[0]).startswith("2262-04-11")
    assert list(r.iloc[1:].astype(str)) == ["NaT", "NaT", "NaT", "NaT"]
