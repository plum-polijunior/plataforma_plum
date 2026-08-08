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

    chamadas = {"n": 0, "colunas": None}

    def fake_load(service, sheet_id, tab, columns, max_rows=None):
        chamadas["n"] += 1
        chamadas["colunas"] = set(columns)
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
