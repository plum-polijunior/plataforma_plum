"""
A coerção de coluna suja — `_como_numero` e as duas guardas do C10.

⭐ **O caso que dá nome ao arquivo:** uma coluna que DEVERIA ser número mas ficou
em `type: "nenhuma"` no cadastro, e por isso chega ao executor como texto. Até
2026-08-31 os dois caminhos de agregação faziam
`pd.to_numeric(...).fillna(0)` — parser fraco (que não entende "R$ 57,50") e
`fillna(0)` (que trata "não consegui converter" como "vale zero").

Consequências, todas silenciosas: a média puxada para baixo por zeros que não são
vendas, o mínimo virando R$ 0,00, e a mesma coluna dando resultados diferentes
conforme a pergunta pedisse `sum(qtd*preco)` (que já fazia certo) ou
`sum(receita)`.

⛔ **O que estes testes NÃO mudam é tão importante quanto o que mudam.** Coluna
declaradamente de texto (`role: "text"`) continua coagindo com `fillna(0)` — é a
C10, e o motivo dela é privacidade: destravar faria `min`/`max` devolverem o
literal, o primeiro nome de cliente saindo por dentro de um agregado.
"""

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from query_engine.pandas_executor import execute_plan  # noqa: E402


def _select(agg, col="valor", **extra):
    return {
        "from": "producao",
        "select": [{"expr": {"agg": agg, "col": col, **extra}, "as": "r"}],
    }


def _agrupado(agg, col="valor"):
    return {
        "from": "producao",
        "select": [{"expr": {"agg": agg, "col": col}, "as": "r"}],
        "group_by": ["grupo"],
    }


@pytest.fixture
def suja():
    """
    Uma coluna que deveria ser número e veio como texto do Sheets.

    ⚠️ É a base real: o dicionário da `plum_base_suja` avisa que
    `receita_liquida` contém strings formatadas como "R$ 2.239,06". Aqui:
    dois valores em pt-BR, dois numéricos, e uma célula de lixo.
    """
    return {
        "producao": pd.DataFrame({
            "valor": ["R$ 100,00", "R$ 300,00", "200", "400", "sem informacao"],
            "grupo": ["a", "a", "b", "b", "b"],
        })
    }


# ── O parser: "R$ 57,50" deixa de virar zero ────────────────────────────────

def test_soma_entende_moeda_ptbr_em_coluna_nao_tipada(suja):
    """
    ⭐ Antes: `pd.to_numeric("R$ 100,00")` dava NaN, o `fillna(0)` dava 0, e a
    soma saía **600** (só os dois numéricos). O caminho das expressões já
    acertava isto — a mesma coluna dava dois resultados.
    """
    r = execute_plan(_select("sum"), suja)
    assert r["rows"][0]["r"] == 1000.0


def test_media_ignora_o_ilegivel_em_vez_de_conta_lo_como_zero(suja):
    """
    ⛔ O bug mais caro da família. Com `fillna(0)` a célula de lixo entrava no
    DENOMINADOR: 1000 / 5 = 200. O certo é 1000 / 4 = 250 — quatro vendas.
    """
    r = execute_plan(_select("avg"), suja)
    assert r["rows"][0]["r"] == 250.0


def test_minimo_nao_vira_zero(suja):
    """⛔ Com `fillna(0)`: "a menor venda foi R$ 0,00", sobre uma base sem R$ 0."""
    r = execute_plan(_agrupado("min"), suja)
    por_grupo = {linha["grupo"]: linha["r"] for linha in r["rows"]}
    assert por_grupo["b"] == 200.0


def test_maximo_nao_vira_zero_com_valores_negativos(suja):
    """
    ⚠️ O `max` parecia inofensivo — zero nunca é o máximo. **É, quando tudo é
    negativo**: desconto, prejuízo, variação. Aqui o máximo real é -100.
    """
    negativos = {
        "producao": pd.DataFrame({
            "valor": ["-R$ 100,00", "-R$ 500,00", "lixo"],
            "grupo": ["a", "a", "a"],
        })
    }
    r = execute_plan(_agrupado("max"), negativos)
    assert r["rows"][0]["r"] == -100.0


def test_coluna_inteira_ilegivel_devolve_nulo_e_nao_zero(suja):
    """
    ⚠️ `None` é o que este caminho já usa para "coluna vazia". Com `fillna(0)`
    uma coluna inteira de lixo devolvia soma 0 e média 0 — que se leem como
    fatos sobre a base, não como ausência de dado.
    """
    lixo = {"producao": pd.DataFrame({"valor": ["a", "b"], "grupo": ["x", "y"]})}
    assert execute_plan(_select("sum"), lixo)["rows"][0]["r"] is None
    assert execute_plan(_select("avg"), lixo)["rows"][0]["r"] is None


# ── ⛔ A guarda do C10: coluna de TEXTO fica exatamente como estava ──────────

PAPEIS_COM_TEXTO = {"valor": "number", "grupo": "text"}


def test_C10_intocada_no_caminho_escalar(suja):
    """
    ⛔ `sum` sobre coluna declarada `text` continua devolvendo `0.0`.

    Não é descuido: o motivo da C10 é **privacidade**. Destravar a coerção faz
    `min`/`max` devolverem o LITERAL — o primeiro nome de cliente por região,
    saindo por dentro de um agregado. É o vazamento que o `metadados` fecha ao
    recusar `min`/`max` sobre texto (B03). O `0` é resposta errada e não entrega
    dado; trocá-lo exige a decisão que a C10 registra.
    """
    r = execute_plan(_select("sum", col="grupo"), suja, column_roles=PAPEIS_COM_TEXTO)
    assert r["rows"][0]["r"] == 0.0


def test_C10_intocada_no_caminho_agrupado(suja):
    """A guarda gêmea, em `_coerce_numeric_for_agg`."""
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "min", "col": "grupo"}, "as": "r"}],
        "group_by": ["grupo"],
    }
    r = execute_plan(plano, suja, column_roles=PAPEIS_COM_TEXTO)
    assert all(linha["r"] == 0 for linha in r["rows"])


# ── Data não é número ───────────────────────────────────────────────────────

def test_coluna_de_data_nao_cai_no_parser_de_texto():
    """
    ⚠️ `datetime64` não é `is_numeric_dtype`, então sem a guarda de data uma
    coluna de data cairia no parser de texto e viraria lixo — e `min(data)`
    devolveria um inteiro de nanossegundos ou zero, em vez da data.
    """
    datas = {
        "producao": pd.DataFrame({
            "valor": pd.to_datetime(["2026-01-08", "2026-01-06", "2026-01-07"]),
            "grupo": ["a", "a", "a"],
        })
    }
    r = execute_plan(_agrupado("min"), datas)
    # ⭐ Sai no formato brasileiro, que é o que o `_serialize_df` faz com data —
    # o ponto aqui é que saiu uma DATA, e não um inteiro de nanossegundos.
    assert r["rows"][0]["r"] == "06/01/2026"


# ── O caminho escalar e o agrupado concordam ────────────────────────────────

@pytest.mark.parametrize("agg,esperado", [("sum", 1000.0), ("avg", 250.0)])
def test_escalar_e_agrupado_dao_o_mesmo_numero(suja, agg, esperado):
    """
    ⭐ A divergência entre os dois caminhos é a classe de bug que a docstring do
    `_scalar_agg` diz ter consertado no B09 — e que sobrevivia aqui, porque cada
    um coagia de um jeito. Agrupando por uma constante, os dois têm de bater.
    """
    uma_so = {"producao": suja["producao"].assign(grupo="tudo")}

    escalar = execute_plan(_select(agg), uma_so)["rows"][0]["r"]
    agrupado = execute_plan(_agrupado(agg), uma_so)["rows"][0]["r"]

    assert escalar == esperado
    assert agrupado == pytest.approx(esperado)
