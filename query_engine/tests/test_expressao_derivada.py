"""
Expressão aritmética derivada: `soma(quantidade × preço)`.

Existe por um número errado em produção, em 2026-08-11. Numa base de doceria com
`vendas_mes` (quantidade) e `preco_unitario`, e nenhuma coluna de receita, a
pergunta "quanto de dinheiro foi ganho vendendo chocolate?" não tinha resposta
possível dentro da gramática do plano: `select` só agregava UMA coluna por vez.
O Agente A pediu o que dava — `sum(vendas_mes)` e `avg(preco_unitario)` — e o
Agente C multiplicou os dois no texto da resposta:

    1.480 unidades × R$ 57,50 = R$ 85.100,00

Duas coisas erradas de uma vez. O número saiu do LLM, e não do Python (R-02); e
`soma(qtd) × média(preço)` não é receita — só coincide quando todo produto custa
o mesmo. A classe de teste abaixo fixa a alternativa: o `×` acontece por LINHA,
antes da soma, dentro do executor.

O teste que mais importa é o `@pytest.mark.invariante`: ganhar aritmética não
pode virar atalho para linha bruta sair. P1.3 continua valendo igual.
"""

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from query_engine.pandas_executor import (  # noqa: E402
    ExecutorError,
    MissingColumnError,
    RawRowsBlocked,
    execute_plan,
)


@pytest.fixture
def doceria():
    """
    Preços deliberadamente desiguais dentro da mesma categoria.

    É o que separa o certo do errado: com preços uniformes,
    `soma(qtd) × média(preço)` acertaria por acidente e o teste não provaria
    nada. Aqui, chocolate:
        brigadeiro   100 × 2,50 =   250,00
        trufa         50 × 8,00 =   400,00
        bolo          10 × 90,00 =  900,00
        ----------------------------------
        receita real             = 1.550,00
        soma(qtd) × media(preco) = 160 × 33,50 = 5.360,00  ← o erro
    """
    return {
        "producao": pd.DataFrame(
            {
                "produto": ["brigadeiro", "trufa", "bolo", "pao_de_mel"],
                "categoria": ["chocolate", "chocolate", "chocolate", "mel"],
                "vendas_mes": [100, 50, 10, 20],
                "preco_unitario": [2.50, 8.00, 90.00, 5.00],
            }
        )
    }


def _plano_receita(where=None, group_by=None):
    plano = {
        "from": "producao",
        "target_columns": ["vendas_mes", "preco_unitario"],
        "select": [
            {
                "expr": {
                    "agg": "sum",
                    "col": {"op": "mul", "args": ["vendas_mes", "preco_unitario"]},
                },
                "as": "receita_total",
            }
        ],
    }
    if where is not None:
        plano["where"] = where
    if group_by is not None:
        plano["group_by"] = group_by
        plano["target_columns"] = plano["target_columns"] + group_by
    return plano


# ─────────────────────────────────────────────────────────────────────────────
# O caso que originou o teste
# ─────────────────────────────────────────────────────────────────────────────

def test_receita_de_chocolate_e_soma_do_produto_linha_a_linha(doceria):
    """1.550,00 — e explicitamente NÃO os 5.360,00 de soma(qtd) × média(preço)."""
    plano = _plano_receita(
        where={"left": "categoria", "op": "=", "right": "chocolate"}
    )
    plano["target_columns"].append("categoria")

    saida = execute_plan(plano, doceria)

    assert saida["row_count"] == 1
    assert saida["rows"][0]["receita_total"] == pytest.approx(1550.00)
    assert saida["rows"][0]["receita_total"] != pytest.approx(5360.00)


def test_a_conta_errada_continua_dando_o_numero_errado(doceria):
    """
    Guarda o contraste vivo: o plano ANTIGO, com as duas agregações separadas,
    ainda roda e ainda devolve 160 e 33,50. Ele nunca esteve errado — errado era
    multiplicar os dois depois. Se algum dia alguém "consertar" o executor para
    fazer essa multiplicação sozinho, este teste quebra, e deve mesmo.
    """
    plano = {
        "from": "producao",
        "target_columns": ["vendas_mes", "preco_unitario", "categoria"],
        "select": [
            {"expr": {"agg": "sum", "col": "vendas_mes"}, "as": "unidades"},
            {"expr": {"agg": "avg", "col": "preco_unitario"}, "as": "preco_medio"},
        ],
        "where": {"left": "categoria", "op": "=", "right": "chocolate"},
    }

    linha = execute_plan(plano, doceria)["rows"][0]

    assert linha["unidades"] == pytest.approx(160)
    assert linha["preco_medio"] == pytest.approx(33.50)
    assert linha["unidades"] * linha["preco_medio"] == pytest.approx(5360.00)


def test_receita_por_categoria(doceria):
    plano = _plano_receita(group_by=["categoria"])
    linhas = {r["categoria"]: r["receita_total"] for r in execute_plan(plano, doceria)["rows"]}

    assert linhas["chocolate"] == pytest.approx(1550.00)
    assert linhas["mel"] == pytest.approx(100.00)


# ─────────────────────────────────────────────────────────────────────────────
# Formas e operadores
# ─────────────────────────────────────────────────────────────────────────────

def test_forma_alternativa_com_agg_ao_lado_do_operador(doceria):
    """`{"agg":"sum","op":"mul","args":[...]}` — sem o `col` envolvendo."""
    plano = {
        "from": "producao",
        "target_columns": ["vendas_mes", "preco_unitario"],
        "select": [
            {
                "expr": {"agg": "sum", "op": "mul", "args": ["vendas_mes", "preco_unitario"]},
                "as": "receita_total",
            }
        ],
    }
    assert execute_plan(plano, doceria)["rows"][0]["receita_total"] == pytest.approx(1650.00)


def test_literal_numerico_como_operando(doceria):
    """`preco * 0.9` — desconto de 10%. Literal não é coluna e não precisa ser."""
    plano = {
        "from": "producao",
        "target_columns": ["preco_unitario"],
        "select": [
            {
                "expr": {"agg": "sum", "col": {"op": "mul", "args": ["preco_unitario", 0.9]}},
                "as": "com_desconto",
            }
        ],
    }
    esperado = (2.50 + 8.00 + 90.00 + 5.00) * 0.9
    assert execute_plan(plano, doceria)["rows"][0]["com_desconto"] == pytest.approx(esperado)


def test_expressao_aninhada(doceria):
    """`(preco - 1) * qtd` — o nó dentro do nó."""
    plano = {
        "from": "producao",
        "target_columns": ["vendas_mes", "preco_unitario"],
        "select": [
            {
                "expr": {
                    "agg": "sum",
                    "col": {
                        "op": "mul",
                        "args": [
                            {"op": "sub", "args": ["preco_unitario", 1]},
                            "vendas_mes",
                        ],
                    },
                },
                "as": "margem",
            }
        ],
    }
    esperado = (1.5 * 100) + (7.0 * 50) + (89.0 * 10) + (4.0 * 20)
    assert execute_plan(plano, doceria)["rows"][0]["margem"] == pytest.approx(esperado)


def test_alias_padrao_sai_dos_nomes_das_colunas(doceria):
    """Sem `as`, o nome de saída ainda diz de onde o número veio."""
    plano = {
        "from": "producao",
        "target_columns": ["vendas_mes", "preco_unitario"],
        "select": [
            {"expr": {"agg": "sum", "col": {"op": "mul", "args": ["vendas_mes", "preco_unitario"]}}}
        ],
    }
    assert execute_plan(plano, doceria)["columns"] == ["sum_vendas_mes_preco_unitario"]


def test_duas_expressoes_derivadas_no_mesmo_plano(doceria):
    """As colunas sintéticas não podem colidir entre si."""
    plano = {
        "from": "producao",
        "target_columns": ["vendas_mes", "preco_unitario"],
        "select": [
            {
                "expr": {"agg": "sum", "col": {"op": "mul", "args": ["vendas_mes", "preco_unitario"]}},
                "as": "receita",
            },
            {
                "expr": {"agg": "avg", "col": {"op": "mul", "args": ["vendas_mes", "preco_unitario"]}},
                "as": "receita_media",
            },
        ],
    }
    linha = execute_plan(plano, doceria)["rows"][0]
    assert linha["receita"] == pytest.approx(1650.00)
    assert linha["receita_media"] == pytest.approx(1650.00 / 4)


def test_coluna_sintetica_nao_vaza_para_a_saida(doceria):
    """O `__expr_0` é detalhe interno: ninguém do lado de fora pode vê-lo."""
    saida = execute_plan(_plano_receita(group_by=["categoria"]), doceria)
    assert not any(str(c).startswith("__expr_") for c in saida["columns"])
    for linha in saida["rows"]:
        assert not any(str(k).startswith("__expr_") for k in linha)


# ─────────────────────────────────────────────────────────────────────────────
# Recusas
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.invariante
def test_expressao_derivada_nao_e_atalho_para_linha_bruta(doceria):
    """
    A barreira que não pode cair. Uma expressão derivada SEM agregação
    devolveria uma coluna calculada linha a linha — que é linha bruta com outro
    nome, e ainda por cima derivada de dados que o cargo talvez só possa ver
    agregados. P1.3 vale igual.
    """
    plano = {
        "from": "producao",
        "target_columns": ["vendas_mes", "preco_unitario"],
        "select": [
            {"expr": "produto"},
            {"expr": "vendas_mes"},
        ],
    }
    with pytest.raises(RawRowsBlocked):
        execute_plan(plano, doceria)


def test_operador_desconhecido_e_recusado(doceria):
    plano = _plano_receita()
    plano["select"][0]["expr"]["col"]["op"] = "pow"
    with pytest.raises(ExecutorError, match="nao suportado"):
        execute_plan(plano, doceria)


def test_coluna_inexistente_na_expressao_falha_alto(doceria):
    """Nunca "ignora o operando e calcula com o resto"."""
    plano = _plano_receita()
    plano["select"][0]["expr"]["col"]["args"] = ["vendas_mes", "custo_unitario"]
    with pytest.raises(MissingColumnError):
        execute_plan(plano, doceria)


def test_sub_com_tres_operandos_e_recusado(doceria):
    """`a - b - c` depende da ordem; ambiguidade vira erro, não chute."""
    plano = _plano_receita()
    plano["select"][0]["expr"]["col"] = {
        "op": "sub",
        "args": ["preco_unitario", "vendas_mes", "preco_unitario"],
    }
    with pytest.raises(ExecutorError, match="exatamente dois"):
        execute_plan(plano, doceria)


def test_um_operando_so_e_recusado(doceria):
    plano = _plano_receita()
    plano["select"][0]["expr"]["col"]["args"] = ["vendas_mes"]
    with pytest.raises(ExecutorError, match="dois operandos"):
        execute_plan(plano, doceria)


def test_coluna_de_texto_nao_entra_em_calculo(doceria):
    plano = _plano_receita()
    plano["select"][0]["expr"]["col"]["args"] = ["produto", "vendas_mes"]
    with pytest.raises(ExecutorError, match="texto"):
        execute_plan(plano, doceria, column_roles={"produto": "text"})


def test_coluna_de_ano_nao_entra_em_calculo():
    """
    Mesmo motivo de `sum` sobre ano ser recusado: ano é dimensão. `2026 × qtd`
    é um número que o pandas calcula de bom grado e que não significa nada.
    """
    tabelas = {
        "producao": pd.DataFrame({"ano": [2025, 2026], "vendas_mes": [10, 20]})
    }
    plano = {
        "from": "producao",
        "target_columns": ["ano", "vendas_mes"],
        "select": [
            {"expr": {"agg": "sum", "col": {"op": "mul", "args": ["ano", "vendas_mes"]}}, "as": "x"}
        ],
    }
    with pytest.raises(ExecutorError, match="ano"):
        execute_plan(plano, tabelas, column_roles={"ano": "ano"})


# ─────────────────────────────────────────────────────────────────────────────
# Aritmética de borda
# ─────────────────────────────────────────────────────────────────────────────

def test_divisao_por_zero_nao_vira_infinito():
    """
    `inf` não é JSON válido: viraria `Infinity` no corpo e quebraria o parse do
    outro lado. Vira NaN, que a agregação ignora.
    """
    tabelas = {
        "producao": pd.DataFrame({"total": [10.0, 20.0], "qtd": [0, 4]})
    }
    plano = {
        "from": "producao",
        "target_columns": ["total", "qtd"],
        "select": [
            {"expr": {"agg": "sum", "col": {"op": "div", "args": ["total", "qtd"]}}, "as": "ticket"}
        ],
    }
    valor = execute_plan(plano, tabelas)["rows"][0]["ticket"]
    assert valor == pytest.approx(5.0)  # só a linha válida (20/4)


def test_texto_ptbr_em_coluna_nao_tipada_ainda_calcula():
    """
    Coluna que ficou em `type: "nenhuma"` chega como string. Sem o fallback de
    `_parse_ptbr_number`, "R$ 57,50" viraria NaN e a receita daria zero — um
    zero convincente, que é o pior tipo de número errado.
    """
    tabelas = {
        "producao": pd.DataFrame(
            {"qtd": [2, 3], "preco": ["R$ 1.000,50", "R$ 2,00"]}
        )
    }
    plano = {
        "from": "producao",
        "target_columns": ["qtd", "preco"],
        "select": [
            {"expr": {"agg": "sum", "col": {"op": "mul", "args": ["qtd", "preco"]}}, "as": "receita"}
        ],
    }
    assert execute_plan(plano, tabelas)["rows"][0]["receita"] == pytest.approx(2007.0)
