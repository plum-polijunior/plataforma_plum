"""
Testes do pedido `metadados` — a descrição de base que o A2 recebe.

Dois grupos, e o primeiro é de privacidade:

  1. `min`/`max` de coluna de TEXTO nunca saem. São valores literais da base —
     o mesmo vazamento que o teto de cardinalidade fechou no B02, entregue por
     uma função que se apresenta como "descrição".
  2. Os números descrevem a base **suja** corretamente: coluna preenchida só a
     partir de certo mês tem de aparecer como vazia em parte, e o grão tem de
     sair de `n_linhas ÷ distintos`.

Se o grupo 1 ficar vermelho, `metadados` virou uma porta lateral para valor de
texto. Não conserte o teste; conserte o módulo.
"""

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from query_engine.metadados import descrever  # noqa: E402


@pytest.fixture
def base_suja():
    """
    12 linhas com os defeitos que a base de teste do remake deve ter:
    nome escrito de jeitos diferentes, coluna preenchida só na segunda metade,
    e várias linhas por data.
    """
    return pd.DataFrame(
        {
            "cliente": [
                "JOAO DA SILVA", "João Silva", "joao silva",
                "MARIA SOUZA", "Maria Souza",
                "ACME LTDA", "ACME LTDA", "ACME LTDA",
                "BETA SA", "BETA SA", "BETA SA", "BETA SA",
            ],
            "faturamento": [100.0, 200.0, 300.0, 400.0, 500.0, 600.0,
                            700.0, 800.0, 900.0, 1000.0, 1100.0, 1200.0],
            # Só a segunda metade preenchida — e em branco como "", que é o que
            # o Sheets entrega, não como nulo.
            "margem": ["", "", "", "", "", "", 10.0, 11.0, 12.0, 13.0, 14.0, 15.0],
            "data_venda": pd.to_datetime(
                ["2026-06-01"] * 4 + ["2026-06-02"] * 4 + ["2026-06-03"] * 4
            ),
        }
    )


PAPEIS = {
    "cliente": "text",
    "faturamento": "number",
    "margem": "percent",
    "data_venda": "date",
}

TODAS = list(PAPEIS)


# ─────────────────────────────────────────────────────────────────────────────
# Privacidade — a razão de o módulo existir separado
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.invariante
def test_min_max_de_texto_nunca_saem(base_suja):
    r = descrever(base_suja, TODAS, PAPEIS)
    assert r["colunas"]["cliente"]["min"] is None
    assert r["colunas"]["cliente"]["max"] is None


@pytest.mark.invariante
def test_papel_desconhecido_e_tratado_como_texto(base_suja):
    """
    ⚠️ `TYPE_TO_ROLE` manda tudo que o Agente 3 não classificou para `text`, mas
    uma coluna pode nem chegar no mapa de papéis. Sem papel, o conservador é não
    expor extremo — custa dois números e fecha a porta.
    """
    r = descrever(base_suja, ["cliente"], roles={})
    assert r["colunas"]["cliente"]["papel"] == "text"
    assert r["colunas"]["cliente"]["min"] is None


@pytest.mark.invariante
def test_nenhuma_linha_da_base_aparece_no_retorno(base_suja):
    """
    O retorno inteiro não pode conter nenhum valor de texto da base. É a versão
    abrangente do primeiro teste: pega também campo novo que alguém acrescente
    depois sem pensar nisto.
    """
    r = descrever(base_suja, TODAS, PAPEIS)
    texto = repr(r)
    for valor in base_suja["cliente"].unique():
        assert valor not in texto


def test_extremos_saem_para_numero_e_data(base_suja):
    """O contraponto: sem isto, o módulo passaria devolvendo None em tudo."""
    r = descrever(base_suja, TODAS, PAPEIS)

    assert r["colunas"]["faturamento"]["min"] == 100.0
    assert r["colunas"]["faturamento"]["max"] == 1200.0
    # Mesma grafia de data do `_serialize_df` do executor — quem lê é o mesmo
    # agente, e duas grafias no mesmo prompt é ruído.
    assert r["colunas"]["data_venda"]["min"] == "01/06/2026"
    assert r["colunas"]["data_venda"]["max"] == "03/06/2026"


def test_papel_numerico_com_coluna_nao_tipada_nao_inventa_extremo():
    """
    Papel diz `number`, dtype diz texto: a coluna não foi tipada. Coerção aqui
    produziria um mínimo a partir das linhas que por acaso pareciam número — uma
    descrição errada, que é pior que uma incompleta.
    """
    df = pd.DataFrame({"valor": ["10", "vinte", "30"]})
    r = descrever(df, ["valor"], {"valor": "number"})
    assert r["colunas"]["valor"]["min"] is None


# ─────────────────────────────────────────────────────────────────────────────
# Os números que o A2 usa para escolher coluna
# ─────────────────────────────────────────────────────────────────────────────

def test_vazio_conta_string_em_branco_e_nao_so_nulo(base_suja):
    """
    ⭐ O caso que motivou a regra. O Sheets entrega célula em branco como `""`.
    Contando só `isna()`, `margem` sairia com 0% de vazio e o A2 escolheria uma
    coluna que só existe na metade da base.
    """
    r = descrever(base_suja, TODAS, PAPEIS)
    assert r["colunas"]["margem"]["vazios_pct"] == 50.0
    assert r["colunas"]["faturamento"]["vazios_pct"] == 0.0


def test_grao_sai_de_linhas_dividido_por_distintos(base_suja):
    """
    ⭐ 12 linhas, 3 datas → 4 linhas por data. Uma amostra de 5 linhas poderia,
    por azar, não repetir data nenhuma e sugerir grão diário; a razão não erra.
    """
    r = descrever(base_suja, TODAS, PAPEIS)
    assert r["n_linhas"] == 12
    assert r["colunas"]["data_venda"]["distintos"] == 3
    assert r["colunas"]["data_venda"]["linhas_por_valor"] == 4.0


def test_distintos_denuncia_o_nome_escrito_de_tres_jeitos(base_suja):
    """
    4 clientes reais (João, Maria, ACME, Beta), **7 grafias** — João aparece de
    três jeitos e Maria de dois. É esse número inflado que faz o A2 pedir
    `vocabulario`, e é o motivo de o `vocabulario` existir.
    """
    assert descrever(base_suja, ["cliente"], PAPEIS)["colunas"]["cliente"]["distintos"] == 7


def test_coluna_pedida_que_nao_existe_e_reportada_nao_omitida(base_suja):
    """
    Sumir em silêncio faria o A2 presumir ausência de dado onde há erro de nome
    — a mesma razão pela qual o executor levanta `MissingColumnError` em vez de
    ignorar filtro.
    """
    r = descrever(base_suja, ["cliente", "fantasma"], PAPEIS)
    assert r["colunas"]["fantasma"] == {"existe": False}
    assert r["colunas"]["cliente"]["existe"] is True


def test_base_vazia_nao_estoura():
    """`linhas_por_valor` seria divisão por zero — tem de sair None, não inf."""
    df = pd.DataFrame({"cliente": pd.Series([], dtype=object)})
    r = descrever(df, ["cliente"], {"cliente": "text"})

    assert r["n_linhas"] == 0
    assert r["colunas"]["cliente"]["distintos"] == 0
    assert r["colunas"]["cliente"]["linhas_por_valor"] is None


def test_saida_e_serializavel_em_json(base_suja):
    """
    O retorno vai para a Edge Function e de lá para o prompt do A2. Timestamp do
    pandas ou float64 do numpy quebrariam a serialização longe daqui.
    """
    import json

    json.dumps(descrever(base_suja, TODAS, PAPEIS))


# ─────────────────────────────────────────────────────────────────────────────
# Papel declarado × dtype — quem decide os extremos
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.invariante
def test_papel_text_declarado_vence_o_dtype_numerico():
    """
    ⭐ O caso que impede o atalho fácil. `documento_cpf_cnpj` vira papel `text`,
    mas a planilha guarda CPF como número. Se o dtype decidisse por cima da
    declaração, o menor e o maior CPF da base sairiam daqui.
    """
    df = pd.DataFrame({"cpf": [11122233344, 55566677788, 99900011122]})
    r = descrever(df, ["cpf"], {"cpf": "text"})

    assert r["colunas"]["cpf"]["papel"] == "text"
    assert r["colunas"]["cpf"]["min"] is None
    assert r["colunas"]["cpf"]["distintos"] == 3  # contar continua valendo


def test_coluna_numerica_sem_classificacao_ganha_extremos():
    """
    ⚠️ O contraponto, e o motivo de a regra existir. `formatting_rule` é conceito
    de exibição: `TYPE_TO_ROLE` manda tudo que o Agente 3 não classificou para
    `text`. Herdar isso aqui esconderia min/max das colunas numéricas da base
    suja — que é onde o A2 mais precisa deles.
    """
    df = pd.DataFrame({"valor": [10.0, 20.0, 30.0]})
    r = descrever(df, ["valor"], roles={})

    assert r["colunas"]["valor"]["papel"] == "number"
    assert (r["colunas"]["valor"]["min"], r["colunas"]["valor"]["max"]) == (10.0, 30.0)


def test_coluna_de_texto_sem_classificacao_continua_fechada():
    """A fallback pelo dtype não pode abrir o que a regra fecha."""
    df = pd.DataFrame({"nome": ["ana", "bruno", "carla"]})
    r = descrever(df, ["nome"], roles={})

    assert r["colunas"]["nome"]["papel"] == "text"
    assert r["colunas"]["nome"]["min"] is None
