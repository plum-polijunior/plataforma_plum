"""
Teste de ponta a ponta do endpoint, com o Google Sheets dublado.

Prova a cadeia inteira sem rede e sem credencial: assinatura → frescor →
conjunto de colunas → leitura → resposta por card.

O dublê do Sheets é intencional: o que precisa ser provado aqui é o
comportamento do PLUM, não o da API do Google.
"""

import json
import sys
import time
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

# `pytest.importorskip` NÃO serve aqui: quando falta o httpx, o
# `fastapi.testclient` levanta RuntimeError, não ImportError, e o importorskip
# só captura o segundo. O resultado é erro de COLETA, que derruba a suíte
# inteira com exit code 2 em vez de pular estes nove testes.
#
# O httpx está declarado em requirements-dev.txt. Este bloco existe para o caso
# de alguém rodar a suíte sem instalar as dependências de teste: aí é melhor
# pular com uma mensagem clara do que quebrar tudo sem explicar.
try:
    from fastapi.testclient import TestClient
except Exception as exc:  # noqa: BLE001
    pytest.skip(
        f"TestClient indisponivel ({type(exc).__name__}). "
        "Instale as dependencias de teste: "
        "pip install -r query_engine/requirements-dev.txt",
        allow_module_level=True,
    )

from query_engine import config, main, sheets  # noqa: E402
from query_engine.security import sign  # noqa: E402

SEGREDO = "segredo-de-teste"


@pytest.fixture(autouse=True)
def ambiente(monkeypatch):
    # Segredo de teste pelo caminho documentado de teste local.
    monkeypatch.setenv("HMAC_SECRET_PARAM_VALUE", SEGREDO)
    config.get_secret.cache_clear()

    base = pd.DataFrame(
        {
            "regiao": ["Sul"] * 6 + ["Norte"] * 5 + ["Ilha"] * 2,
            "faturamento": [100.0] * 13,
            "margem_lucro": [7.0] * 13,
        }
    )

    chamadas = {"n": 0, "colunas": None, "tab": None, "tab_gid": None}

    def fake_load(service, sheet_id, tab, columns, max_rows=None, tab_gid=None):
        chamadas["n"] += 1
        chamadas["colunas"] = set(columns)
        # Guardados para que um teste possa afirmar QUAL aba foi pedida — a
        # resolução por gid vive em sheets.resolver_aba (test_sheets.py), mas
        # quem repassa o tab_gid do payload é o main.py, e isso se verifica aqui.
        chamadas["tab"] = tab
        chamadas["tab_gid"] = tab_gid
        # Devolve SÓ as colunas pedidas. É isso que faz a quinta barreira
        # funcionar: o que não foi autorizado nem existe no DataFrame.
        return base[[c for c in base.columns if c in columns]].copy()

    monkeypatch.setattr(sheets, "load_columns", fake_load)
    monkeypatch.setattr(main, "_google_service", lambda: object())
    yield chamadas
    config.get_secret.cache_clear()


@pytest.fixture
def client():
    return TestClient(main.app)


def _corpo(**over):
    base = {
        "sheet_id": "planilha-do-cliente-A",
        "tab": "Sheet1",
        "plans": [
            {
                "card_id": "card-faturamento",
                "plan": {
                    "select": [
                        {"expr": {"agg": "sum", "col": "faturamento"}, "as": "total"}
                    ],
                    "group_by": ["regiao"],
                },
                "resolved_columns": ["faturamento", "regiao"],
            }
        ],
        "allowed_columns": ["faturamento", "regiao"],
        "formatting_rules": {},
        "issued_at": int(time.time()),
    }
    base.update(over)
    return json.dumps(base).encode()


def _post(client, corpo, assinar_com=SEGREDO):
    return client.post(
        "/execute",
        content=corpo,
        headers={
            "X-Plum-Signature": sign(corpo, assinar_com),
            "Content-Type": "application/json",
        },
    )


def test_health_nao_exige_assinatura(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_caminho_feliz_devolve_todos_os_grupos(client):
    r = _post(client, _corpo())
    assert r.status_code == 200
    card = r.json()["results"][0]
    assert card["status"] == "ok"
    regioes = {linha["regiao"] for linha in card["rows"]}
    assert regioes == {"Sul", "Norte", "Ilha"}, "k-anonimato foi removido: Ilha (2) nao suprime mais"
    assert card["suppressed_groups"] == 0


def test_tab_gid_do_payload_chega_no_load_columns(client, ambiente):
    # O `tab_gid` é assinado junto com o resto do payload, então trocar a aba
    # alvo exige o segredo do HMAC — mesma razão pela qual `sheet_id` vive
    # dentro do payload e não nos parâmetros da requisição.
    r = _post(client, _corpo(tab_gid=991333939))
    assert r.status_code == 200
    assert ambiente["tab_gid"] == 991333939


def test_tab_gid_zero_atravessa_como_zero_e_nao_como_ausente(client, ambiente):
    # A regressão mais provável desta mudança: gid 0 (primeira aba) virar None
    # em qualquer ponto do caminho Edge Function -> payload -> main -> sheets.
    r = _post(client, _corpo(tab_gid=0))
    assert r.status_code == 200
    assert ambiente["tab_gid"] == 0
    assert ambiente["tab_gid"] is not None


def test_payload_sem_tab_gid_continua_valido(client, ambiente):
    # Compatibilidade: Edge Function antiga (ou base sem gid) não manda o campo,
    # e o executor precisa seguir usando o nome da aba.
    r = _post(client, _corpo())
    assert r.status_code == 200
    assert ambiente["tab_gid"] is None
    assert ambiente["tab"] == "Sheet1"


def test_sem_assinatura_devolve_401(client):
    r = client.post("/execute", content=_corpo())
    assert r.status_code == 401


def test_assinatura_de_outro_segredo_devolve_401(client):
    r = _post(client, _corpo(), assinar_com="chave-vazada-da-aws")
    assert r.status_code == 401


def test_payload_velho_devolve_401(client):
    r = _post(client, _corpo(issued_at=int(time.time()) - 3600))
    assert r.status_code == 401


def test_card_com_coluna_proibida_nao_gera_leitura(client, ambiente):
    """
    Um card barrado nao pode nem tocar no Google. A checagem de conjunto roda
    antes da leitura de propósito.
    """
    corpo = _corpo(
        plans=[
            {
                "card_id": "card-margem",
                "plan": {
                    "select": [
                        {"expr": {"agg": "sum", "col": "margem_lucro"}, "as": "m"}
                    ]
                },
                "resolved_columns": ["margem_lucro"],
            }
        ],
        allowed_columns=["faturamento", "regiao"],
    )
    r = _post(client, corpo)
    card = r.json()["results"][0]
    assert card["status"] == "forbidden"
    assert ambiente["n"] == 0, "nenhuma leitura deveria ter acontecido"


def test_um_card_barrado_nao_derruba_os_outros(client):
    """Status e por card. Um card ruim nao pode apagar o dashboard inteiro."""
    corpo = _corpo(
        plans=[
            {
                "card_id": "bom",
                "plan": {
                    "select": [
                        {"expr": {"agg": "sum", "col": "faturamento"}, "as": "t"}
                    ],
                    "group_by": ["regiao"],
                },
                "resolved_columns": ["faturamento", "regiao"],
            },
            {
                "card_id": "barrado",
                "plan": {
                    "select": [
                        {"expr": {"agg": "sum", "col": "margem_lucro"}, "as": "m"}
                    ]
                },
                "resolved_columns": ["margem_lucro"],
            },
        ]
    )
    r = _post(client, corpo)
    por_id = {c["card_id"]: c["status"] for c in r.json()["results"]}
    assert por_id == {"bom": "ok", "barrado": "forbidden"}


def test_card_com_group_by_malformado_nao_derruba_o_lote(client):
    """
    ⚠️ É a afirmação central do PR 1 da Fase 5b, e é o único teste que a prova
    de ponta a ponta.

    Antes da trava de tipo, um `group_by` em forma de objeto levantava
    `TypeError: unhashable type: 'dict'` dentro do pandas. `TypeError` não é
    `ExecutorError`, então ele não escapava só do `except` — escapava do LAÇO
    `for pedido in aprovados`, subia por `execute()` e o FastAPI devolvia
    **HTTP 500 para o lote inteiro**. O `dashboard-execute` faz
    `if (!resp.ok) throw`, e o resultado era TODOS os cards do dataset caindo
    para `stale` (ou `error`, nos sem snapshot) por causa de um card só.

    O teste irmão `test_um_card_barrado_nao_derruba_os_outros` já garante isso
    para o caso `forbidden`. Este garante para o caso malformado, que era o furo.
    """
    corpo = _corpo(
        plans=[
            {
                "card_id": "bom",
                "plan": {
                    "select": [
                        {"expr": {"agg": "sum", "col": "faturamento"}, "as": "t"}
                    ],
                    "group_by": ["regiao"],
                },
                "resolved_columns": ["faturamento", "regiao"],
            },
            {
                "card_id": "malformado",
                "plan": {
                    "select": [
                        {"expr": {"agg": "sum", "col": "faturamento"}, "as": "t"}
                    ],
                    # A forma que a Fase 5b vai introduzir, chegando ANTES de o
                    # executor saber interpretá-la.
                    "group_by": [{"col": "regiao", "trunc": "month"}],
                },
                "resolved_columns": ["faturamento", "regiao"],
            },
        ]
    )
    r = _post(client, corpo)

    # O lote inteiro tem que responder 200. Era 500 antes da trava.
    assert r.status_code == 200, "o lote caiu por causa de um card malformado"

    por_id = {c["card_id"]: c["status"] for c in r.json()["results"]}
    assert por_id == {"bom": "ok", "malformado": "error"}

    # E o card bom tem que ter o número de verdade, não um resultado degradado.
    bom = next(c for c in r.json()["results"] if c["card_id"] == "bom")
    assert {l["regiao"] for l in bom["rows"]} == {"Sul", "Norte", "Ilha"}


def test_seis_cards_do_mesmo_dataset_fazem_uma_leitura(client, ambiente):
    """Decisao 11A: seis cards, uma viagem ao Google, nao seis."""
    planos = [
        {
            "card_id": f"card-{i}",
            "plan": {
                "select": [{"expr": {"agg": "sum", "col": "faturamento"}, "as": "t"}],
                "group_by": ["regiao"],
            },
            "resolved_columns": ["faturamento", "regiao"],
        }
        for i in range(6)
    ]
    r = _post(client, _corpo(plans=planos))
    assert len(r.json()["results"]) == 6
    assert ambiente["n"] == 1


def test_quinta_barreira_plano_que_escapa_do_conjunto_falha(client):
    """
    O plano declara `resolved_columns` limpo mas referencia margem_lucro por
    dentro. A checagem de conjunto passa, porque ela confia no que a Edge
    Function extraiu. Mas so as colunas assinadas sao carregadas, entao o
    executor levanta MissingColumnError e o card vira erro em vez de vazar.

    Esta e a barreira que sai de graca da correcao do filtro silencioso.
    """
    corpo = _corpo(
        plans=[
            {
                "card_id": "card-malicioso",
                "plan": {
                    "select": [
                        {"expr": {"agg": "sum", "col": "margem_lucro"}, "as": "m"}
                    ]
                },
                "resolved_columns": ["faturamento"],  # mente sobre o que usa
            }
        ]
    )
    r = _post(client, corpo)
    card = r.json()["results"][0]
    assert card["status"] == "error"
    assert "margem" not in json.dumps(card), "nenhum dado da coluna pode vazar"


# ─────────────────────────────────────────────────────────────────────────────
# B03 — o pedido `metadados`
# ─────────────────────────────────────────────────────────────────────────────
#
# O que precisa ser provado aqui, e não em test_metadados.py: que o tipo novo
# atravessa as MESMAS barreiras que um plano normal. O modulo em si nao sabe
# nada de permissao — quem gateia e o main.py, e e isso que se verifica.


def _pedido_metadados(colunas, permitidas=None):
    return _corpo(
        plans=[
            {
                "card_id": "desc",
                "tipo": "metadados",
                # Sem Query Plan: nao ha o que planejar.
                "plan": {},
                "resolved_columns": colunas,
            }
        ],
        allowed_columns=permitidas if permitidas is not None else colunas,
    )


def test_metadados_descreve_sem_devolver_linha(client):
    r = _post(client, _pedido_metadados(["faturamento", "regiao"]))
    assert r.status_code == 200

    card = r.json()["results"][0]
    assert card["status"] == "ok" and card["tipo"] == "metadados"
    assert card["n_linhas"] == 13
    # ⭐ A resposta nao tem `rows`. Um plano sem `select` cairia em
    # RawRowsBlocked; este caminho nem chega no executor.
    assert "rows" not in card

    assert card["colunas"]["regiao"]["distintos"] == 3
    assert card["colunas"]["faturamento"]["max"] == 100.0


@pytest.mark.invariante
def test_metadados_nao_expoe_valor_de_coluna_de_texto(client):
    """`regiao` e texto: distintos sim, os nomes das regioes nao."""
    r = _post(client, _pedido_metadados(["regiao"]))
    card = r.json()["results"][0]

    assert card["colunas"]["regiao"]["min"] is None
    for regiao in ("Sul", "Norte", "Ilha"):
        assert regiao not in json.dumps(card)


@pytest.mark.invariante
def test_metadados_respeita_o_cargo(client):
    """
    ⭐ A barreira 4 nao pode ter buraco por tipo de pedido. Descrever uma coluna
    proibida ja e informacao sobre ela — quantos valores distintos, que faixa.
    """
    corpo = _pedido_metadados(["faturamento", "margem_lucro"], permitidas=["faturamento"])
    card = _post(client, corpo).json()["results"][0]

    assert card["status"] == "forbidden"


def test_metadados_convive_com_plano_normal_no_mesmo_lote(client, ambiente):
    """
    O A2 pede a descricao e o A3 pede o agregado; o lote e um so. Se o tipo novo
    tivesse quebrado o laco, o segundo card nao voltaria.
    """
    corpo = _corpo(
        plans=[
            {
                "card_id": "desc",
                "tipo": "metadados",
                "plan": {},
                "resolved_columns": ["regiao"],
            },
            {
                "card_id": "soma",
                "plan": {
                    "select": [{"expr": {"agg": "sum", "col": "faturamento"}, "as": "t"}],
                    "group_by": ["regiao"],
                },
                "resolved_columns": ["faturamento", "regiao"],
            },
        ],
        allowed_columns=["faturamento", "regiao"],
    )
    r = _post(client, corpo)
    cards = {c["card_id"]: c for c in r.json()["results"]}

    assert cards["desc"]["tipo"] == "metadados"
    assert cards["soma"]["row_count"] == 3
    # Uma leitura para o lote inteiro — a razao de o formato ser em lote.
    assert ambiente["n"] == 1


def test_pedido_sem_tipo_continua_sendo_plano_normal(client):
    """
    ⚠️ O campo nasceu com default porque o Lambda sobe a todo push e a Edge
    Function e publicada a mao: por algumas horas o executor novo recebe payload
    da funcao velha, que nao manda `tipo`.
    """
    card = _post(client, _corpo()).json()["results"][0]
    assert card["status"] == "ok" and card["row_count"] == 3
