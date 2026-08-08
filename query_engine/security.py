"""
Camada de segurança do executor.

O serviço é um **executor burro** (decisão 2A). Ele não decide nada: obedece um
payload assinado pela Edge Function, que é o único lugar onde o JWT do usuário
e o RLS do Postgres existem.

As quatro barreiras, em ordem:

  1. SigV4 da AWS, no Function URL com auth AWS_IAM. Resolvida pela
     infraestrutura, antes do código rodar. Sem credencial IAM, a requisição
     nem chega aqui.
  2. HMAC-SHA256 sobre o corpo cru, com um segredo DIFERENTE da credencial
     IAM. Quem tiver a chave da AWS ainda não consegue forjar payload.
  3. Expiração curta, para que um payload capturado não sirva depois.
  4. `resolved_columns ⊆ allowed_columns`, comparação de CONJUNTO.

Sobre a barreira 4: este módulo **não interpreta o Query Plan**. A extração
recursiva de colunas acontece uma vez só, na Edge Function (decisão 8A). Dois
parsers em duas linguagens divergiriam em algum aninhamento, e quando duas
travas discordam quem passa é a mais frouxa.

E existe uma quinta barreira que sai de graça: o serviço carrega da planilha
**apenas** as colunas de `resolved_columns`. Se o plano tocar qualquer outra,
o executor levanta `MissingColumnError`, porque desde a correção do filtro
silencioso ele não ignora mais coluna ausente. Ou seja, a checagem de conjunto
é confirmada pela própria execução, sem ninguém reimplementar o parser.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any, Dict, List, Optional, Set

from pydantic import BaseModel, Field, field_validator


class SecurityError(Exception):
    """Base das recusas desta camada."""


class BadSignature(SecurityError):
    """Assinatura ausente, malformada ou que não confere."""


class PayloadExpired(SecurityError):
    """Payload assinado fora da janela de validade."""


class ColumnNotAllowed(SecurityError):
    """O plano referencia coluna fora do que o cargo pode ver."""


# ─────────────────────────────────────────────────────────────────────────────
# Formato do payload
# ─────────────────────────────────────────────────────────────────────────────

class PlanRequest(BaseModel):
    card_id: str
    plan: Dict[str, Any]
    # Colunas já extraídas pela Edge Function. Único parser do sistema.
    resolved_columns: List[str] = Field(default_factory=list)


class ExecutionPayload(BaseModel):
    """
    O que a Edge Function assina. `sheet_id` entra aqui de propósito: assim ele
    não é escolhível por quem chama. Trocar a planilha alvo exige o segredo do
    HMAC, não apenas alcançar o endpoint.
    """

    sheet_id: str
    tab: str = "Sheet1"
    plans: List[PlanRequest]
    allowed_columns: List[str]
    # {coluna: {"type": <enum fechado>, "params": {...}}} — vem do Agente 3/3.1
    # via schema_metadata. O executor deriva column_roles disto mesmo
    # (roles_from_formatting_rules), não recebe role prontos da Edge Function.
    formatting_rules: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    max_rows: Optional[int] = None
    # Segundos desde a época. A Edge Function carimba na hora de assinar.
    issued_at: int

    @field_validator("plans")
    @classmethod
    def _pelo_menos_um(cls, v: List[PlanRequest]) -> List[PlanRequest]:
        if not v:
            raise ValueError("payload sem nenhum plano")
        return v


# ─────────────────────────────────────────────────────────────────────────────
# Barreiras
# ─────────────────────────────────────────────────────────────────────────────

def sign(raw_body: bytes, secret: str) -> str:
    """Assina como a Edge Function assina. Existe para os testes espelharem."""
    return hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()


def verify_signature(raw_body: bytes, provided: Optional[str], secret: str) -> None:
    if not provided:
        raise BadSignature("assinatura ausente")
    expected = sign(raw_body, secret)
    # compare_digest: comparação em tempo constante. Um `==` comum vaza o
    # prefixo correto pelo tempo de resposta.
    if not hmac.compare_digest(expected, provided.strip()):
        raise BadSignature("assinatura nao confere")


def verify_freshness(issued_at: int, max_age_seconds: int, now: Optional[int] = None) -> None:
    now = int(time.time()) if now is None else now
    idade = now - int(issued_at)
    # A janela cobre os dois lados: relógio adiantado na Edge Function não pode
    # virar payload eternamente válido.
    if idade > max_age_seconds:
        raise PayloadExpired(f"payload assinado ha {idade}s, limite {max_age_seconds}s")
    if idade < -max_age_seconds:
        raise PayloadExpired("payload assinado no futuro")


def assert_columns_allowed(
    resolved_columns: List[str], allowed_columns: List[str]
) -> Set[str]:
    """
    Comparação de conjunto e nada mais. Devolve o conjunto a carregar.

    Recusa em vez de filtrar em silêncio: tirar uma coluna do `where` muda o
    significado do resultado e devolve um número errado com cara de certo.
    """
    pedidas: Set[str] = {c for c in resolved_columns if c}
    permitidas: Set[str] = {c for c in allowed_columns if c}
    proibidas = pedidas - permitidas
    if proibidas:
        raise ColumnNotAllowed(
            "coluna(s) fora da permissao do cargo: " + ", ".join(sorted(proibidas))
        )
    return pedidas
