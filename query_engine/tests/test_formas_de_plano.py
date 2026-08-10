"""
Formas de Query Plan que o Agente A realmente emite.

O prompt do Agente A (`supabase/functions/ai-plum-chat/index.ts`) diz que cada
item de `select` "pode ser uma string (coluna direta) ou objeto", e o
`extractColumns` (`supabase/functions/_shared/query_plan.ts`) aceita as duas
formas desde sempre. O executor aceitava só o objeto: a string crua caía num
`item.get("expr")` e virava `AttributeError` — que não é `ExecutorError`,
escapava do `except` do `main.py` e virava 500. O usuário via
"Nao consegui calcular isso agora" e o log não dizia o motivo.

Estes testes fixam o contrato nas duas pontas. Duas coisas precisam valer
juntas, e a segunda é a que importa:

  1. a forma string funciona;
  2. aceitar a forma string NÃO abre um caminho para linha bruta sair — P1.3
     continua valendo igual, e é `test_privacidade.py` quem manda nisso.
"""

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from query_engine.pandas_executor import (  # noqa: E402
    ExecutorError,
    RawRowsBlocked,
    execute_plan,
)


@pytest.fixture
def vendas():
    """6 'Sul', 4 'Norte', 2 'Centro' — grupos de tamanhos distinguíveis."""
    return {
        "producao": pd.DataFrame(
            {
                "regiao": ["Sul"] * 6 + ["Norte"] * 4 + ["Centro"] * 2,
                "vendedor": [f"pessoa_{i}" for i in range(12)],
                "faturamento": [100.0] * 12,
            }
        )
    }


def test_select_aceita_string_crua_ao_lado_de_agregacao(vendas):
    """
    O plano exato que quebrou em 2026-08-10, com a coluna direta como string
    em vez de {"expr": "..."}.
    """
    plano = {
        "from": "producao",
        "target_columns": ["regiao"],
        "select": ["regiao", {"expr": {"agg": "count", "col": "regiao"}, "as": "total"}],
        "group_by": ["regiao"],
        "order_by": [{"col": "regiao", "dir": "asc"}],
        "limit": 200,
    }
    saida = execute_plan(plano, vendas)

    assert saida["row_count"] == 3
    assert saida["columns"] == ["regiao", "total"]
    assert {l["regiao"]: l["total"] for l in saida["rows"]} == {
        "Centro": 2, "Norte": 4, "Sul": 6,
    }


def test_string_e_objeto_produzem_o_mesmo_resultado(vendas):
    """As duas grafias da mesma coluna direta não podem divergir."""
    agregacao = {"expr": {"agg": "sum", "col": "faturamento"}, "as": "total"}
    base = {"from": "producao", "group_by": ["regiao"]}

    como_string = execute_plan({**base, "select": ["regiao", agregacao]}, vendas)
    como_objeto = execute_plan({**base, "select": [{"expr": "regiao"}, agregacao]}, vendas)

    assert como_string == como_objeto


def test_count_da_propria_coluna_de_agrupamento(vendas):
    """
    "Quantos por X" agrega a mesma coluna que agrupa — é o plano que o Agente A
    gera para "quais são os estudos?". O pandas 2.2.3 aceita isso na named
    aggregation, mas o comportamento não é óbvio (a documentação fala em
    excluir as colunas de agrupamento do frame agregável) e uma mudança dele
    quebraria a pergunta mais comum do chat sem nenhum aviso. Fica fixado aqui.
    """
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "count", "col": "regiao"}, "as": "quantos"}],
        "group_by": ["regiao"],
    }
    saida = execute_plan(plano, vendas)
    assert {l["regiao"]: l["quantos"] for l in saida["rows"]} == {
        "Centro": 2, "Norte": 4, "Sul": 6,
    }


@pytest.mark.invariante
def test_string_crua_nao_vira_atalho_para_linha_bruta(vendas):
    """
    P1.3 não pode depender da grafia do item. Sem agregação nenhuma, a forma
    string tem que ser recusada igual à forma objeto.
    """
    plano = {"from": "producao", "select": ["regiao", "vendedor"]}
    with pytest.raises(RawRowsBlocked):
        execute_plan(plano, vendas)


def test_item_de_select_invalido_falha_como_erro_do_executor(vendas):
    """
    Um item que não é string nem objeto precisa morrer como ExecutorError, que
    o main.py converte em mensagem, e não como TypeError/AttributeError, que
    vira 500 sem explicação.
    """
    with pytest.raises(ExecutorError):
        execute_plan({"from": "producao", "select": [123]}, vendas)


def test_item_de_select_sem_expr_falha_como_erro_do_executor(vendas):
    with pytest.raises(ExecutorError):
        execute_plan({"from": "producao", "select": [{"as": "total"}]}, vendas)
