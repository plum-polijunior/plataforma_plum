"""
Invariantes de privacidade do executor.

Estes testes não provam que o dashboard funciona. Eles provam que ele não
vaza linha bruta. Cada um cita a premissa do design doc que sustenta.

A supressão por k-anonimato (P3, grupo com poucas linhas de origem) existiu
aqui e foi removida em 2026-08-08 por decisão de produto — ver
`contexto/30-decisoes.md` D-012 para o raciocínio completo. P1.3
(nenhuma linha bruta atravessa a fronteira, sempre) continua de pé e sem
excecão: é isso que este arquivo protege agora.

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
    CardinalidadeExcedida,
    MissingColumnError,
    RawRowsBlocked,
    RowLimitExceeded,
    classificar_agregacao,
    execute_plan,
    roles_from_formatting_rules,
)


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def vendas():
    """
    12 linhas. 'Sul' tem 6, 'Norte' tem 4 e 'Centro' tem 2 — grupos de
    tamanhos diferentes, do tempo em que k-anonimato suprimia os pequenos.
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
# Regressão: k-anonimato foi removido de propósito, não pode voltar sozinho
# ─────────────────────────────────────────────────────────────────────────────

def test_grupo_pequeno_nao_e_mais_suprimido(vendas):
    """Norte (4) e Centro (2) apareciam suprimidos antes de 2026-08-08."""
    r = execute_plan(_plano_por_regiao(), vendas)

    regioes = {row["regiao"] for row in r["rows"]}
    assert regioes == {"Sul", "Norte", "Centro"}
    assert r["suppressed_groups"] == 0


def test_agregado_unico_sobre_base_pequena_nao_e_suprimido():
    """
    Sem group_by o "grupo" é a base inteira depois do where. Antes de
    2026-08-08 isolar 2 linhas e somar o salário delas era suprimido; hoje o
    executor devolve o agregado normalmente.
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
    r = execute_plan(plano, tabelas)
    assert r["rows"][0]["folha"] == pytest.approx(17000.0)
    assert r["suppressed_groups"] == 0


# ─────────────────────────────────────────────────────────────────────────────
# P1.3 — só vetor agregado atravessa a fronteira, sempre, sem excecão
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.invariante
def test_p13_plano_sem_agregacao_e_recusado(vendas):
    plano = {
        "from": "producao",
        "select": [{"expr": "vendedor"}, {"expr": "faturamento"}],
    }
    with pytest.raises(RawRowsBlocked):
        execute_plan(plano, vendas)


@pytest.mark.invariante
def test_p13_plano_sem_select_e_recusado(vendas):
    with pytest.raises(RawRowsBlocked):
        execute_plan({"from": "producao"}, vendas)


@pytest.mark.invariante
def test_p13_nenhuma_linha_bruta_no_retorno(vendas):
    """
    Nenhum valor da coluna identificadora pode aparecer no vetor de saída.
    Este é o teste que a auditoria vai querer ver.
    """
    r = execute_plan(_plano_por_regiao(), vendas)
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
        execute_plan(plano, vendas)


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
        execute_plan(plano, vendas)


@pytest.mark.regressao
def test_regressao_coluna_ausente_em_group_by(vendas):
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "faturamento"}, "as": "total"}],
        "group_by": ["fantasma"],
    }
    with pytest.raises(MissingColumnError):
        execute_plan(plano, vendas)


@pytest.mark.regressao
def test_regressao_coluna_ausente_em_select(vendas):
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "fantasma"}, "as": "total"}],
    }
    with pytest.raises(MissingColumnError):
        execute_plan(plano, vendas)


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
        plano, vendas, column_roles={"margem_percentual": "percent"}
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
    r = execute_plan(plano, vendas)
    assert r["rows"][0]["margem"] == pytest.approx(120.0)


def test_papeis_derivados_das_regras_de_formatacao():
    roles = roles_from_formatting_rules(
        {
            "margem": {"type": "percentual", "params": {}},
            "data_venda": {"type": "data", "params": {"dayfirst": True}},
            "faturamento": {"type": "moeda_brl", "params": {}},
            "cliente": {"type": "texto_trim_maiusculas", "params": {}},
            "observacoes": {"type": "nenhuma", "params": {}},
        }
    )
    assert roles["margem"] == "percent"
    assert roles["data_venda"] == "date"
    assert roles["faturamento"] == "number"
    assert roles["cliente"] == "text"
    assert roles["observacoes"] == "text"


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
        execute_plan(plano, tabelas, max_rows=500)
    # A mensagem precisa nomear o tamanho e o limite, senao o log nao ajuda.
    assert "1,000" in str(exc.value) and "500" in str(exc.value)


def test_dentro_do_teto_executa_normal():
    tabelas = {"producao": pd.DataFrame({"v": range(100)})}
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "v"}, "as": "t"}],
    }
    r = execute_plan(plano, tabelas, max_rows=500)
    assert r["rows"][0]["t"] == pytest.approx(4950.0)


# ─────────────────────────────────────────────────────────────────────────────
# B02 — o furo de FORMA do P1.3: agregação que não agrega
# ─────────────────────────────────────────────────────────────────────────────
#
# O P1.3 verifica que EXISTE agregação, não que o resultado agrega. Um
# `group_by [cliente] + count` passa por ele e devolve a carteira inteira, um
# nome por linha — a mesma linha bruta que o P1.3 recusa, entregue por outra
# porta.
#
# ⚠️ A regra recusa **só no caminho `ad_hoc`** (`aplicar_regras_adhoc=True`). No
# legado ela mede e registra: o dashboard e o chat atual não podem mudar de
# resultado por causa de um bloco que ainda não tem consumidor.


@pytest.fixture
def carteira():
    """300 clientes distintos — acima do teto de 200."""
    return {
        "producao": pd.DataFrame(
            {
                "cliente": [f"CLIENTE {i:03d}" for i in range(300)],
                "regiao": ["Sul", "Norte", "Centro"] * 100,
                "faturamento": [100.0] * 300,
            }
        )
    }


PAPEIS = {"cliente": "text", "regiao": "text", "faturamento": "number"}


@pytest.mark.invariante
def test_group_by_de_texto_acima_do_teto_e_recusado_no_adhoc(carteira):
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "count", "col": "faturamento"}, "as": "n"}],
        "group_by": ["cliente"],
    }
    with pytest.raises(CardinalidadeExcedida) as exc:
        execute_plan(
            plano, carteira, column_roles=PAPEIS, aplicar_regras_adhoc=True
        )
    # A mensagem vai crua para o A3, que precisa saber o que reformular.
    assert "cliente" in str(exc.value) and "300" in str(exc.value)


@pytest.mark.invariante
def test_coluna_solta_no_select_tambem_e_conferida(carteira):
    """
    `select: ["cliente", count(...)]` nunca escreve `group_by` e mesmo assim
    agrupa — `direct_cols` vira agrupamento implícito. Era a porta larga.
    """
    plano = {
        "from": "producao",
        "select": [
            {"expr": "cliente"},
            {"expr": {"agg": "count", "col": "faturamento"}, "as": "n"},
        ],
    }
    with pytest.raises(CardinalidadeExcedida):
        execute_plan(
            plano, carteira, column_roles=PAPEIS, aplicar_regras_adhoc=True
        )


@pytest.mark.invariante
def test_alias_na_coluna_solta_nao_escapa_da_conferencia(carteira):
    """
    Com `as`, a coluna sai renomeada e o nome de origem some do resultado.
    Conferir só um dos dois nomes deixaria este caso passar.
    """
    plano = {
        "from": "producao",
        "select": [
            {"expr": "cliente", "as": "quem"},
            {"expr": {"agg": "count", "col": "faturamento"}, "as": "n"},
        ],
    }
    with pytest.raises(CardinalidadeExcedida):
        execute_plan(
            plano, carteira, column_roles=PAPEIS, aplicar_regras_adhoc=True
        )


def test_limit_alto_nao_salva_o_plano(carteira):
    """
    Cortar em 500 não é proteção: 500 nomes continuam sendo 500 nomes. A conta
    é feita antes do limit, sobre o alcance do recorte.
    """
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "count", "col": "faturamento"}, "as": "n"}],
        "group_by": ["cliente"],
        "limit": 10,
    }
    with pytest.raises(CardinalidadeExcedida):
        execute_plan(
            plano, carteira, column_roles=PAPEIS, aplicar_regras_adhoc=True
        )


def test_group_by_dentro_do_teto_passa(carteira):
    """Três regiões. A regra não pode atrapalhar pergunta legítima."""
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "faturamento"}, "as": "t"}],
        "group_by": ["regiao"],
    }
    r = execute_plan(
        plano, carteira, column_roles=PAPEIS, aplicar_regras_adhoc=True
    )
    assert len(r["rows"]) == 3
    assert r["grupos_de_texto"] == {"regiao": 3}


def test_caminho_legado_mede_mas_nao_recusa(carteira, caplog):
    """
    ⭐ O modo observação. O dashboard não pode mudar de comportamento por causa
    de um bloco cujo consumidor só nasce no B06 — mas queremos o dado antes de
    decidir se a regra pode valer lá.
    """
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "count", "col": "faturamento"}, "as": "n"}],
        "group_by": ["cliente"],
    }
    with caplog.at_level("WARNING"):
        r = execute_plan(plano, carteira, column_roles=PAPEIS)

    assert r["row_count"] == 200  # limit padrão, comportamento de sempre
    assert r["grupos_de_texto"] == {"cliente": 300}
    assert "[adhoc-observacao]" in caplog.text


def test_coluna_numerica_nao_dispara_a_regra():
    """
    ⚠️ `TYPE_TO_ROLE` manda tudo que não foi classificado para `text`, então a
    regra precisa olhar o papel e não só o dtype. Aqui o papel é `number`: 300
    valores distintos não são 300 literais de identidade.
    """
    tabelas = {
        "producao": pd.DataFrame(
            {"pedido_id": range(300), "valor": [1.0] * 300}
        )
    }
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "valor"}, "as": "t"}],
        "group_by": ["pedido_id"],
    }
    r = execute_plan(
        plano, tabelas,
        column_roles={"pedido_id": "number", "valor": "number"},
        aplicar_regras_adhoc=True,
    )
    assert r["grupos_de_texto"] == {}


def test_data_agrupada_nao_dispara_a_regra():
    """Série temporal longa é pergunta legítima, e `date` não é `text`."""
    tabelas = {
        "producao": pd.DataFrame(
            {
                "dia": pd.date_range("2020-01-01", periods=300, freq="D"),
                "valor": [1.0] * 300,
            }
        )
    }
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "valor"}, "as": "t"}],
        "group_by": ["dia"],
    }
    r = execute_plan(
        plano, tabelas,
        column_roles={"dia": "date", "valor": "number"},
        aplicar_regras_adhoc=True,
    )
    assert r["grupos_de_texto"] == {}


# ─────────────────────────────────────────────────────────────────────────────
# B02 — redutora × seletora
# ─────────────────────────────────────────────────────────────────────────────

def test_classificacao_por_comportamento():
    assert classificar_agregacao("sum") == "redutora"
    assert classificar_agregacao("MEDIAN") == "redutora"
    assert classificar_agregacao("min") == "seletora"
    assert classificar_agregacao("nunique") == "seletora"
    # ⚠️ Não é whitelist (V6 decisão 4): o que não está na tabela continua indo
    # para o pandas, e é reportado como desconhecido em vez de recusado.
    assert classificar_agregacao("skew") == "desconhecida"


def test_selecao_literal_e_reportada_nao_recusada(carteira):
    """
    Seletora sobre texto devolve UM literal por grupo. Quem decide se isso
    custa orçamento é o autorizador (B10) — o executor é Motorista Cego: conta
    e devolve a contagem.
    """
    plano = {
        "from": "producao",
        "select": [
            {"expr": {"agg": "min", "col": "cliente"}, "as": "primeiro"},
            {"expr": {"agg": "sum", "col": "faturamento"}, "as": "t"},
        ],
        "group_by": ["regiao"],
    }
    r = execute_plan(
        plano, carteira, column_roles=PAPEIS, aplicar_regras_adhoc=True
    )
    assert r["selecoes_literais"] == ["primeiro"]


def test_redutora_sobre_texto_nao_e_selecao_literal(carteira):
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "count", "col": "cliente"}, "as": "n"}],
        "group_by": ["regiao"],
    }
    r = execute_plan(
        plano, carteira, column_roles=PAPEIS, aplicar_regras_adhoc=True
    )
    assert r["selecoes_literais"] == []


# ─────────────────────────────────────────────────────────────────────────────
# B02 — o `limit` passa a ter teto
# ─────────────────────────────────────────────────────────────────────────────
#
# A gramática documentava `1..500` e nada aplicava: era `plan.get("limit", 200)`
# seguido de `head(limit)`. Combinado com a isenção de orçamento que `agregado`
# tem, `limit: 50000` entregava a base inteira sem violar regra nenhuma.


@pytest.mark.parametrize(
    "pedido,esperado",
    [(50000, 500), (0, 1), (-3, 1), (None, 200), ("abc", 200), (37, 37)],
)
def test_limit_e_preso_entre_1_e_500(pedido, esperado):
    tabelas = {
        "producao": pd.DataFrame(
            {"g": [f"g{i}" for i in range(600)], "v": [1.0] * 600}
        )
    }
    plano = {
        "from": "producao",
        "select": [{"expr": {"agg": "sum", "col": "v"}, "as": "t"}],
        "group_by": ["g"],
    }
    if pedido is not None:
        plano["limit"] = pedido
    # Papel `number` no grupo: aqui o alvo é o limit, não a cardinalidade.
    r = execute_plan(plano, tabelas, column_roles={"g": "number", "v": "number"})
    assert r["row_count"] == esperado


# ─────────────────────────────────────────────────────────────────────────────
# B04 — o pedido `vocabulario` atravessa o executor sem mudança nenhuma
# ─────────────────────────────────────────────────────────────────────────────
#
# ⭐ É o que prova a afirmação central do bloco: `vocabulario` não é um caminho
# de execução novo, é um Query Plan comum. Se estes testes exigirem uma linha de
# código no executor, o desenho está errado — um segundo caminho é um segundo
# lugar onde uma coluna pode escapar do RBAC.
#
# ⚠️ O plano abaixo é REPLICADO de `planoDeVocabulario` em
# `supabase/functions/_shared/vocabulario.ts`. Mudou lá, mude aqui.


def _plano_de_vocabulario(coluna: str, limite: int = 200):
    return {
        "from": "producao",
        "select": [{"expr": {"agg": "count", "col": coluna}, "as": "linhas"}],
        "group_by": [coluna],
        "order_by": [{"col": "linhas", "dir": "desc"}],
        "limit": limite,
    }


def test_vocabulario_devolve_valores_com_contagem(carteira):
    """O caminho feliz: 3 regiões, com quantas linhas cada uma tem."""
    r = execute_plan(
        _plano_de_vocabulario("regiao"), carteira,
        column_roles=PAPEIS, aplicar_regras_adhoc=True,
    )

    assert {linha["regiao"] for linha in r["rows"]} == {"Sul", "Norte", "Centro"}
    assert all(linha["linhas"] == 100 for linha in r["rows"])


def test_vocabulario_vem_ordenado_pelos_mais_frequentes():
    """Se o teto cortar, o que sobra tem de ser o que mais aparece na base."""
    tabelas = {
        "producao": pd.DataFrame(
            {"marca": ["A"] * 50 + ["B"] * 10 + ["C"] * 3, "v": [1.0] * 63}
        )
    }
    r = execute_plan(
        _plano_de_vocabulario("marca"), tabelas,
        column_roles={"marca": "text", "v": "number"}, aplicar_regras_adhoc=True,
    )

    assert [linha["marca"] for linha in r["rows"]] == ["A", "B", "C"]


@pytest.mark.invariante
def test_vocabulario_de_coluna_identificadora_e_recusado(carteira):
    """
    ⭐ A terceira trava do `vocabulario`, e a única que o executor pode aplicar:
    acima de 200 valores distintos a coluna é IDENTIFICADOR, não categoria, e
    listá-la é entregar a base.

    Não é uma falha a contornar — é a resposta certa. E é o mesmo teto do B02,
    exercido por outra porta: uma constante, dois consumidores.
    """
    with pytest.raises(CardinalidadeExcedida):
        execute_plan(
            _plano_de_vocabulario("cliente"), carteira,
            column_roles=PAPEIS, aplicar_regras_adhoc=True,
        )


def test_o_limite_do_plano_nao_substitui_o_teto(carteira):
    """
    ⚠️ Cortar em 200 não protege: 200 nomes de cliente continuam sendo 200 nomes.
    O teto olha o ALCANCE do recorte, não quantas linhas sobraram — então um
    plano de vocabulário com limite baixo sobre coluna identificadora continua
    sendo recusado.
    """
    with pytest.raises(CardinalidadeExcedida):
        execute_plan(
            _plano_de_vocabulario("cliente", limite=5), carteira,
            column_roles=PAPEIS, aplicar_regras_adhoc=True,
        )


def test_vocabulario_no_caminho_legado_apenas_registra(carteira, caplog):
    """
    O modo observação também vale aqui. Nada emite este plano no legado hoje,
    mas a regra é do caminho, não do tipo de pedido.
    """
    with caplog.at_level("WARNING"):
        r = execute_plan(
            _plano_de_vocabulario("cliente"), carteira, column_roles=PAPEIS
        )

    assert r["row_count"] == 200
    assert "[adhoc-observacao]" in caplog.text


def test_o_literal_devolvido_casa_com_o_where_depois(carteira):
    """
    ⭐ O laço que fecha o bloco: o resolvedor escolhe um literal desta lista, e o
    executor depois filtra por ele. Este teste prova a ida e a volta no mesmo
    lugar — se a normalização do `where` divergisse da lista, aqui daria zero.
    """
    lista = execute_plan(
        _plano_de_vocabulario("regiao"), carteira,
        column_roles=PAPEIS, aplicar_regras_adhoc=True,
    )
    literal = lista["rows"][0]["regiao"]

    filtrado = execute_plan(
        {
            "from": "producao",
            "select": [{"expr": {"agg": "count", "col": "faturamento"}, "as": "n"}],
            "where": {"left": "regiao", "op": "=", "right": literal},
        },
        carteira, column_roles=PAPEIS, aplicar_regras_adhoc=True,
    )

    assert filtrado["rows"][0]["n"] == 100


def test_o_where_casa_o_literal_escrito_de_outro_jeito(carteira):
    """
    A contrapartida: o executor normaliza os dois lados de `=`, então o
    resolvedor NÃO precisa acertar caixa nem acento. É o que permite a ele se
    ocupar só da distância de edição.
    """
    r = execute_plan(
        {
            "from": "producao",
            "select": [{"expr": {"agg": "count", "col": "faturamento"}, "as": "n"}],
            "where": {"left": "regiao", "op": "=", "right": "  sul  "},
        },
        carteira, column_roles=PAPEIS, aplicar_regras_adhoc=True,
    )

    assert r["rows"][0]["n"] == 100
