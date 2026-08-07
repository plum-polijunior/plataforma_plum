"""
As quatro barreiras da camada de segurança do executor.

Cada teste corresponde a uma forma concreta de alguém ler a planilha de outra
empresa. A service account `plum-polijunior@plataforma-plum.iam.gserviceaccount.com` tem leitura
em TODA planilha de TODO tenant: se estas barreiras caem, cai o isolamento
entre clientes inteiro, porque este caminho nunca toca o Postgres e portanto
nunca é protegido pelo RLS.
"""

import json
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from query_engine.security import (  # noqa: E402
    BadSignature,
    ColumnNotAllowed,
    ExecutionPayload,
    PayloadExpired,
    assert_columns_allowed,
    sign,
    verify_freshness,
    verify_signature,
)

SEGREDO = "segredo-de-teste-nao-usar-em-producao"


def _payload(**over):
    base = {
        "sheet_id": "1AbCdEf",
        "tab": "Sheet1",
        "plans": [
            {
                "card_id": "card-1",
                "plan": {
                    "select": [
                        {"expr": {"agg": "sum", "col": "faturamento"}, "as": "t"}
                    ],
                    "group_by": ["regiao"],
                },
                "resolved_columns": ["faturamento", "regiao"],
            }
        ],
        "allowed_columns": ["faturamento", "regiao", "data_venda"],
        "formatting_rules": {},
        "k_min": 5,
        "issued_at": int(time.time()),
    }
    base.update(over)
    return base


# ─────────────────────────────────────────────────────────────────────────────
# Barreira 2 — HMAC
# ─────────────────────────────────────────────────────────────────────────────

def test_assinatura_valida_passa():
    corpo = json.dumps(_payload()).encode()
    verify_signature(corpo, sign(corpo, SEGREDO), SEGREDO)


def test_assinatura_ausente_e_recusada():
    corpo = json.dumps(_payload()).encode()
    with pytest.raises(BadSignature):
        verify_signature(corpo, None, SEGREDO)


def test_assinatura_forjada_e_recusada():
    corpo = json.dumps(_payload()).encode()
    with pytest.raises(BadSignature):
        verify_signature(corpo, "deadbeef" * 8, SEGREDO)


def test_assinatura_com_outro_segredo_e_recusada():
    """Ter a credencial IAM da AWS nao basta para forjar payload."""
    corpo = json.dumps(_payload()).encode()
    with pytest.raises(BadSignature):
        verify_signature(corpo, sign(corpo, "outro-segredo"), SEGREDO)


def test_corpo_alterado_invalida_a_assinatura():
    """
    O sheet_id vive DENTRO do payload assinado. Trocar a planilha alvo exige o
    segredo do HMAC, nao apenas alcancar o endpoint.
    """
    original = json.dumps(_payload()).encode()
    assinatura = sign(original, SEGREDO)
    adulterado = json.dumps(_payload(sheet_id="planilha-de-outra-empresa")).encode()
    with pytest.raises(BadSignature):
        verify_signature(adulterado, assinatura, SEGREDO)


# ─────────────────────────────────────────────────────────────────────────────
# Barreira 3 — frescor
# ─────────────────────────────────────────────────────────────────────────────

def test_payload_recente_passa():
    verify_freshness(int(time.time()), 120)


def test_payload_velho_e_recusado():
    with pytest.raises(PayloadExpired):
        verify_freshness(int(time.time()) - 600, 120)


def test_payload_do_futuro_e_recusado():
    """Relogio adiantado na Edge Function nao vira payload eternamente valido."""
    with pytest.raises(PayloadExpired):
        verify_freshness(int(time.time()) + 600, 120)


# ─────────────────────────────────────────────────────────────────────────────
# Barreira 4 — conjunto de colunas
# ─────────────────────────────────────────────────────────────────────────────

def test_subconjunto_passa_e_devolve_o_que_carregar():
    carregar = assert_columns_allowed(["a", "b"], ["a", "b", "c"])
    assert carregar == {"a", "b"}


def test_coluna_fora_da_permissao_e_recusada():
    with pytest.raises(ColumnNotAllowed) as exc:
        assert_columns_allowed(["a", "margem_lucro"], ["a", "b"])
    # A mensagem precisa nomear a coluna, senao ninguem depura.
    assert "margem_lucro" in str(exc.value)


def test_recusa_em_vez_de_filtrar_em_silencio():
    """
    Tirar uma coluna do where muda o significado do resultado e devolve um
    numero errado com cara de certo. Recusar e a unica opcao honesta.
    """
    with pytest.raises(ColumnNotAllowed):
        assert_columns_allowed(["data_venda"], ["faturamento"])


def test_cargo_sem_nenhuma_coluna_nao_recebe_nada():
    with pytest.raises(ColumnNotAllowed):
        assert_columns_allowed(["faturamento"], [])


# ─────────────────────────────────────────────────────────────────────────────
# Formato do payload
# ─────────────────────────────────────────────────────────────────────────────

def test_payload_valido_e_aceito():
    p = ExecutionPayload.model_validate(_payload())
    assert p.sheet_id == "1AbCdEf"
    assert len(p.plans) == 1


def test_payload_sem_plano_e_recusado():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ExecutionPayload.model_validate(_payload(plans=[]))


def test_k_min_padrao_do_payload_e_cinco():
    p = ExecutionPayload.model_validate(
        {k: v for k, v in _payload().items() if k != "k_min"}
    )
    assert p.k_min == 5
