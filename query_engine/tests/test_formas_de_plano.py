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


# ─────────────────────────────────────────────────────────────────────────────
# WHERE — o mesmo tudo-verdadeiro, no ramo vizinho de `_eval_where`
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.invariante
@pytest.mark.parametrize(
    "no_de_filtro",
    [
        {"op": "and", "args": []},                     # lista vazia
        {"op": "and"},                                 # sem a chave
        {"op": "and", "args": None},                   # null
        {"op": "or", "args": []},                      # vale pros dois
        # chave errada — o `where` é a parte do plano deixada FORA do
        # response_schema do Gemini (ai-plum-chat/index.ts), então é
        # exatamente onde o LLM inventa nome de campo sozinho.
        {"op": "and", "conditions": [{"left": "regiao", "op": "=", "right": "Sul"}]},
    ],
    ids=["args_vazio", "sem_args", "args_null", "or_vazio", "chave_errada"],
)
def test_and_or_sem_operando_nao_pode_desligar_o_filtro(vendas, no_de_filtro):
    """
    Um `and`/`or` sem operando devolvia Series([True]*len(df)) — o filtro sumia
    e a conta rodava sobre a tabela inteira, devolvendo o total da base com o
    rótulo do recorte que o usuário pediu. "Quantas vendas no Sul?" → 12.

    É a mesma falha que `_eval_single` recusa vinte linhas abaixo (coluna
    ausente) e que o `order_by` descartado calado produzia antes de c47b742.
    Número errado com etiqueta convincente é pior que erro na tela.
    """
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "count", "col": "regiao"}, "as": "total"}],
        "where": no_de_filtro,
    }
    with pytest.raises(ExecutorError) as erro:
        execute_plan(plano, vendas)
    # a mensagem tem que dizer o que fazer, não só que falhou
    assert "args" in str(erro.value)


def test_and_com_operandos_de_verdade_continua_filtrando(vendas):
    """A recusa acima não pode ter pegado o caminho legítimo junto."""
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "count", "col": "regiao"}, "as": "total"}],
        "where": {
            "op": "and",
            "args": [
                {"left": "regiao", "op": "=", "right": "Sul"},
                {"left": "faturamento", "op": ">", "right": 50},
            ],
        },
    }
    assert execute_plan(plano, vendas)["rows"] == [{"total": 6}]


def test_condicao_nao_objeto_dentro_de_and_falha_como_erro_do_executor(vendas):
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "count", "col": "regiao"}, "as": "total"}],
        "where": {"op": "and", "args": ["regiao = Sul"]},
    }
    with pytest.raises(ExecutorError):
        execute_plan(plano, vendas)


def test_where_que_nao_e_objeto_falha_como_erro_do_executor(vendas):
    """`node.get` numa string é AttributeError → 500 mudo, não ExecutorError."""
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "count", "col": "regiao"}, "as": "total"}],
        "where": "regiao = 'Sul'",
    }
    with pytest.raises(ExecutorError):
        execute_plan(plano, vendas)


# ─────────────────────────────────────────────────────────────────────────────
# ANO — dimensão, não medida
# ─────────────────────────────────────────────────────────────────────────────


@pytest.fixture
def acervo():
    """8 registros em 4 anos — 2005 aparece 3 vezes, é o pico."""
    return {
        "producao": pd.DataFrame(
            {
                "ano": pd.array([2000, 2001, 2001, 2005, 2005, 2005, 2015, 2015],
                                dtype="Int64"),
                "estudo": [f"e{i}" for i in range(8)],
            }
        )
    }


ROLES_ANO = {"ano": "ano", "estudo": "text"}


@pytest.mark.parametrize("func", ["sum", "avg", "mean"])
def test_sum_e_avg_sobre_ano_sao_recusados(acervo, func):
    """
    A média de uma coluna de anos (2004.42, no caso real) é um número que o
    pandas calcula de bom grado e que não significa nada — e chega ao Agente C
    indistinguível de um resultado legítimo. Diferente do percentual, aqui não
    dá pra trocar por avg: avg É o problema.
    """
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": func, "col": "ano"}, "as": "x"}],
    }
    with pytest.raises(ExecutorError) as erro:
        execute_plan(plano, acervo, column_roles=ROLES_ANO)
    assert "ano" in str(erro.value)


@pytest.mark.parametrize(
    "func,esperado", [("min", 2000), ("max", 2015), ("count", 8)]
)
def test_min_max_count_sobre_ano_continuam_valendo(acervo, func, esperado):
    """"Estudo mais antigo" e "mais recente" são perguntas legítimas."""
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": func, "col": "ano"}, "as": "x"}],
    }
    saida = execute_plan(plano, acervo, column_roles=ROLES_ANO)
    assert saida["rows"] == [{"x": esperado}]


def test_agrupar_por_ano_continua_valendo(acervo):
    """"Quantos por ano" é o uso principal da coluna."""
    plano = {
        "from": "producao",
        "select": ["ano", {"expr": {"agg": "count", "col": "estudo"}, "as": "n"}],
        "group_by": ["ano"],
        "order_by": [{"col": "n", "dir": "desc"}],
        "limit": 1,
    }
    saida = execute_plan(plano, acervo, column_roles=ROLES_ANO)
    assert saida["rows"] == [{"ano": 2005, "n": 3}]


def test_filtrar_por_ano_continua_numerico(acervo):
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "count", "col": "estudo"}, "as": "n"}],
        "where": {"left": "ano", "op": ">", "right": 2010},
    }
    saida = execute_plan(plano, acervo, column_roles=ROLES_ANO)
    assert saida["rows"] == [{"n": 2}]


# ─────────────────────────────────────────────────────────────────────────────
# GROUP BY — o quarto membro da mesma família, e o pior deles
# ─────────────────────────────────────────────────────────────────────────────
#
# `select`, `order_by` e `where` já estão cobertos acima: item de tipo
# inesperado levantava AttributeError/TypeError, que NÃO é ExecutorError,
# escapava do `except` do `main.py` e virava 500 mudo.
#
# `group_by` tem o mesmo furo, e com alcance maior. A cadeia:
#
#   1. `_strip_table(dict)` DEVOLVE O DICT INTACTO — `"." in dict` testa as
#      *chaves* do dict, dá False, e a função retorna o argumento sem tocar.
#      Não estoura aqui, e é por isso que o furo passa desapercebido.
#   2. `_grouped_agg` faz `c not in df.columns`, que chama
#      `pandas.Index.__contains__`, que executa `hash(key)` FORA do try/except.
#   3. `hash({})` -> TypeError: unhashable type: 'dict'.
#
# Por que o alcance é maior que nos outros três: o TypeError escapa do laço
# `for pedido in aprovados` do `main.py`, então ele não derruba UM card — ele
# derruba a resposta do lote inteiro. `dashboard-execute` recebe 500, faz
# `if (!resp.ok) throw`, e TODOS os cards do dataset caem para `stale` (ou para
# `error`, nos que ainda não têm snapshot). Isso contradiz a promessa explícita
# do docstring do `main.py`: "Um card ruim não pode derrubar o dashboard
# inteiro."


@pytest.mark.parametrize(
    "item_de_group_by",
    [
        {"col": "regiao", "trunc": "month"},  # a forma que a Fase 5b vai introduzir
        {"trunc": "month"},                   # objeto sem `col`
        {"col": 123},                         # `col` que não é string
        ["regiao"],                           # lista aninhada
    ],
    ids=["objeto_col_trunc", "objeto_sem_col", "col_nao_string", "lista"],
)
def test_group_by_nao_string_falha_como_erro_do_executor(vendas, item_de_group_by):
    """
    Item de `group_by` que não é string precisa morrer como ExecutorError — que
    o `main.py` converte em mensagem por card — e não como TypeError, que vira
    500 do lote inteiro.

    ⚠️ Este teste é a razão de existir do PR 1 da Fase 5b. Antes da trava, os
    quatro casos abaixo levantavam `TypeError: unhashable type: 'dict'` (ou
    `'list'`), medido em `pandas==2.2.3`.

    O primeiro caso é o que mais importa: é exatamente a forma que a Fase 5b vai
    passar a aceitar (`{"col": ..., "trunc": "month"}`). Fechar o tipo ANTES de
    introduzir a forma é o que impede a fase de abrir uma porta nova para um 500.
    """
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "count", "col": "regiao"}, "as": "total"}],
        "group_by": [item_de_group_by],
    }
    with pytest.raises(ExecutorError) as erro:
        execute_plan(plano, vendas)
    # A mensagem tem que dizer o que veio, senão o diagnóstico volta a ser ler o
    # código — mesma exigência dos testes de `order_by` e de `and`/`or` acima.
    assert "group_by" in str(erro.value)


@pytest.mark.invariante
def test_group_by_nao_string_nao_pode_escapar_como_typeerror(vendas):
    """
    A trava acima não vale de nada se ela deixar passar um TypeError por baixo:
    `pytest.raises(ExecutorError)` não distingue "levantou ExecutorError" de
    "levantou algo que herda de ExecutorError por acidente".

    Este teste fixa o que o `main.py` precisa: a exceção tem que ser capturável
    pelo `except ExecutorError`, e NÃO pode ser TypeError/AttributeError — as
    duas que escapam do laço por card e derrubam o lote.
    """
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "count", "col": "regiao"}, "as": "total"}],
        "group_by": [{"col": "regiao", "trunc": "month"}],
    }
    try:
        execute_plan(plano, vendas)
    except ExecutorError:
        pass  # o caminho certo: o main.py transforma isto em erro do card
    except (TypeError, AttributeError) as exc:  # pragma: no cover
        pytest.fail(
            f"escapou como {type(exc).__name__}, que o main.py nao captura: "
            f"viraria HTTP 500 do lote inteiro. {exc}"
        )
    else:  # pragma: no cover
        pytest.fail("group_by malformado passou sem erro nenhum")


@pytest.mark.parametrize(
    "group_by_bruto",
    ["regiao", 123, {"col": "regiao"}],
    ids=["string_solta", "numero", "objeto_solto"],
)
def test_group_by_que_nao_e_lista_falha_como_erro_do_executor(vendas, group_by_bruto):
    """
    O CONTAINER também precisa de trava, não só cada item.

    `group_by: "regiao"` (string solta em vez de lista) iterava os CARACTERES e
    virava `MissingColumnError: coluna 'r' nao encontrada` — diagnóstico que
    manda quem investiga para o lugar errado. `group_by: 123` não é iterável e
    virava `TypeError`, de novo escapando como 500 do lote.

    Esquecer o par de colchetes é uma das saídas mais plausíveis de um LLM, e é
    o tipo de erro que tem que dizer o próprio nome.
    """
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "count", "col": "regiao"}, "as": "total"}],
        "group_by": group_by_bruto,
    }
    with pytest.raises(ExecutorError) as erro:
        execute_plan(plano, vendas)
    assert "group_by" in str(erro.value)


@pytest.mark.parametrize(
    "group_by_bruto",
    [[], [None], [""], None],
    ids=["lista_vazia", "so_none", "so_vazio", "chave_null"],
)
def test_group_by_vazio_continua_sendo_agregado_unico(vendas, group_by_bruto):
    """
    Sobra de lista do LLM não pode virar pergunta perdida: `group_by` vazio (ou
    só com item nulo) sempre significou "sem agrupamento", e continua. É o único
    caso em que ignorar é a resposta certa — mesma lógica do `order_by` inócuo
    no agregado único, algumas dezenas de linhas acima.
    """
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "count", "col": "regiao"}, "as": "total"}],
        "group_by": group_by_bruto,
    }
    assert execute_plan(plano, vendas)["rows"] == [{"total": 12}]


def test_group_by_com_strings_continua_intocado(vendas):
    """
    O caminho antigo é o do chat, e ele não pode ter sido afetado pela trava.
    Duas colunas de agrupamento, a forma que produção usa hoje.
    """
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "faturamento"}, "as": "total"}],
        "group_by": ["regiao"],
        "order_by": [{"col": "total", "dir": "desc"}],
    }
    saida = execute_plan(plano, vendas)
    assert [l["regiao"] for l in saida["rows"]] == ["Sul", "Norte", "Centro"]
    assert [l["total"] for l in saida["rows"]] == [600.0, 400.0, 200.0]


def test_group_by_por_coluna_ausente_continua_missing_column(vendas):
    """
    A trava de TIPO não pode ter engolido a checagem de EXISTÊNCIA: string que
    não é coluna da base continua sendo MissingColumnError, não o erro de tipo.
    São dois diagnósticos diferentes e a mensagem precisa distinguir.
    """
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "count", "col": "regiao"}, "as": "total"}],
        "group_by": ["mes"],
    }
    with pytest.raises(MissingColumnError) as erro:
        execute_plan(plano, vendas)
    assert "mes" in str(erro.value)
