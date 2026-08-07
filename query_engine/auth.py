"""
Validação de autenticidade das requisições — confirma que vieram da Edge Function
`ai-plum-chat`, e não de qualquer outra origem na internet. Esta camada NÃO valida usuário
final nem tenant — isso já foi feito pela Edge Function antes de montar a requisição
(query_engine/prd.md, CLAUDE.md R-05). Aqui só se garante que quem chamou conhece o segredo
compartilhado.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time

SIGNATURE_HEADER = "x-plum-signature"
TIMESTAMP_HEADER = "x-plum-timestamp"
MAX_CLOCK_SKEW_SECONDS = 60


class InvalidSignatureError(Exception):
    pass


def _get_shared_secret() -> str:
    secret = os.environ.get("EXECUTOR_SHARED_SECRET")
    if not secret:
        raise RuntimeError("EXECUTOR_SHARED_SECRET não configurado no ambiente.")
    return secret


def compute_signature(raw_body: bytes, timestamp: str, secret: str) -> str:
    """
    Assina timestamp + corpo juntos. Se só o corpo fosse assinado, um atacante que
    capturasse um par (corpo, assinatura) válido poderia reenviá-lo indefinidamente trocando
    apenas o header de timestamp para "agora" — a checagem de janela abaixo nunca pegaria
    esse replay, porque o timestamp não faria parte do que foi assinado.
    """
    message = timestamp.encode("utf-8") + b"." + raw_body
    digest = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def verify_request(raw_body: bytes, timestamp: str | None, signature: str | None) -> None:
    if not timestamp or not signature:
        raise InvalidSignatureError("Timestamp ou assinatura ausente.")

    try:
        ts = int(timestamp)
    except ValueError as exc:
        raise InvalidSignatureError("Timestamp inválido.") from exc

    now = int(time.time())
    if abs(now - ts) > MAX_CLOCK_SKEW_SECONDS:
        raise InvalidSignatureError("Timestamp fora da janela permitida (possível replay).")

    secret = _get_shared_secret()
    expected = compute_signature(raw_body, timestamp, secret)

    if not hmac.compare_digest(expected, signature):
        raise InvalidSignatureError("Assinatura HMAC inválida.")
