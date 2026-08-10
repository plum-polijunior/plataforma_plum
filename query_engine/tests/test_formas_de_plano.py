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
    MissingColumnError,
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


# ─────────────────────────────────────────────────────────────────────────────
# ORDER BY — a mesma assimetria do `select`, uma linha ao lado
# ─────────────────────────────────────────────────────────────────────────────


@pytest.fixture
def estudos():
    """Contagens distintas e desempatadas: se a ordenação for descartada, a
    ordem de saída não bate por acidente."""
    return {
        "producao": pd.DataFrame(
            {
                "estudo": ["Alpha"] * 5 + ["Beta"] * 2 + ["Gama"] * 9,
                "responsavel": [f"pessoa_{i}" for i in range(16)],
                "horas": [1.0] * 16,
            }
        )
    }


def test_order_by_pelo_alias_da_agregacao(estudos):
    """
    O plano que produção emitiu em 2026-08-10: ordena por "quantidade", que é o
    alias da contagem, não uma coluna da base.
    """
    plano = {
        "from": "producao",
        "target_columns": ["estudo"],
        "select": [
            "estudo",
            {"expr": {"agg": "count", "col": "estudo"}, "as": "quantidade"},
        ],
        "group_by": ["estudo"],
        "order_by": [{"col": "quantidade", "dir": "desc"}],
        "limit": 200,
    }
    saida = execute_plan(plano, estudos)
    assert [l["estudo"] for l in saida["rows"]] == ["Gama", "Alpha", "Beta"]


def test_order_by_pela_coluna_de_origem_de_algo_renomeado(estudos):
    """
    `select` renomeia `estudo` para `nome`, e o order_by cita `estudo`. A coluna
    não existe na saída, mas o pedido é resolvível — ordenar pelo alias é o que
    a pessoa quis dizer. Recusar aqui seria rigor sem ganho.
    """
    plano = {
        "from": "producao",
        "select": [
            {"expr": "estudo", "as": "nome"},
            {"expr": {"agg": "count", "col": "estudo"}, "as": "quantidade"},
        ],
        "group_by": ["estudo"],
        "order_by": [{"col": "estudo", "dir": "desc"}],
    }
    saida = execute_plan(plano, estudos)
    assert [l["nome"] for l in saida["rows"]] == ["Gama", "Beta", "Alpha"]


@pytest.mark.invariante
def test_order_by_por_coluna_ausente_nao_pode_ser_ignorado(estudos):
    """
    ⚠️ É a razão de existir desta correção. `order_by` por uma coluna que não
    está no resultado era descartado em silêncio (`if col in df_out.columns`
    sem `else`): a pessoa pedia "os 3 que mais consumiram horas", a ordenação
    ia pro lixo, o `limit` cortava 3 quaisquer e a resposta voltava errada com
    cara de certa — sem nada no log.

    Mesmo raciocínio do MissingColumnError no where: filtro ausente não pode
    virar "sem filtro", ordenação ausente não pode virar "sem ordem".
    """
    plano = {
        "from": "producao",
        "select": ["estudo", {"expr": {"agg": "count", "col": "estudo"}, "as": "quantidade"}],
        "group_by": ["estudo"],
        "order_by": [{"col": "horas", "dir": "desc"}],  # não está na saída
        "limit": 3,
    }
    with pytest.raises(MissingColumnError) as erro:
        execute_plan(plano, estudos)
    # A mensagem tem que dizer o que existe, senão o diagnóstico volta a ser
    # ler o código.
    assert "horas" in str(erro.value)
    assert "quantidade" in str(erro.value)


def test_order_by_aceita_forma_string(estudos):
    """
    `extractColumns` (_shared/query_plan.ts:112-114) aceita a forma string; o
    executor não. Era o mesmo AttributeError → 500 do `select`.
    """
    plano = {
        "from": "producao",
        "select": ["estudo", {"expr": {"agg": "count", "col": "estudo"}, "as": "quantidade"}],
        "group_by": ["estudo"],
        "order_by": ["estudo"],  # sem dir: ascendente, como no SQL
    }
    saida = execute_plan(plano, estudos)
    assert [l["estudo"] for l in saida["rows"]] == ["Alpha", "Beta", "Gama"]


def test_order_by_invalido_falha_como_erro_do_executor(estudos):
    base = {
        "from": "producao",
        "select": [{"expr": {"agg": "count", "col": "estudo"}, "as": "quantidade"}],
        "group_by": ["estudo"],
    }
    with pytest.raises(ExecutorError):
        execute_plan({**base, "order_by": [123]}, estudos)
    with pytest.raises(ExecutorError):
        execute_plan({**base, "order_by": [{"dir": "desc"}]}, estudos)


def test_order_by_inocuo_no_agregado_unico_e_ignorado(estudos):
    """
    Sem group_by o resultado é uma linha só; ordenar não quer dizer nada.
    Levantar erro aqui transformaria um plano inofensivo em pergunta perdida —
    é o único caso em que ignorar é a resposta certa, e ele vai pro log.
    """
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "count", "col": "estudo"}, "as": "total"}],
        "order_by": [{"col": "estudo", "dir": "desc"}],
    }
    saida = execute_plan(plano, estudos)
    assert saida["rows"] == [{"total": 16}]
