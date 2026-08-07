"""
Cache TTL em memória para os dados lidos do Google Sheets (query_engine/prd.md §6) — evita
bater no limite de 60 req/min da API do Google Sheets quando várias pessoas da mesma empresa
perguntam ao mesmo tempo.

Só vale dentro deste processo: se a EC2 um dia rodar mais de uma réplica, cada uma terá seu
próprio cache (trocar por Redis/ElastiCache seria o próximo passo, não necessário no volume
descrito no PRD — "dezenas de usuários da mesma empresa").
"""

from __future__ import annotations

import threading
from typing import Any, Callable, Hashable

from cachetools import TTLCache

DEFAULT_TTL_SECONDS = 15 * 60
DEFAULT_MAX_ENTRIES = 256

_lock = threading.Lock()
_cache: TTLCache = TTLCache(maxsize=DEFAULT_MAX_ENTRIES, ttl=DEFAULT_TTL_SECONDS)


def make_cache_key(namespace: str, columns: list[str]) -> Hashable:
    """Chave por tenant/planilha + conjunto de colunas — isola o cache de um dataset do outro."""
    return (namespace, tuple(sorted(columns)))


def get_or_fetch(key: Hashable, fetch_fn: Callable[[], Any]) -> Any:
    """
    Simplificação aceita para o volume atual: o fetch roda fora do lock, então duas
    requisições concorrentes para a mesma chave em cache miss podem disparar dois fetches em
    vez de um (thundering herd). Não justifica lock por chave dado o volume do PRD.
    """
    with _lock:
        if key in _cache:
            return _cache[key]

    value = fetch_fn()

    with _lock:
        _cache[key] = value
    return value


def invalidate(key: Hashable) -> None:
    with _lock:
        _cache.pop(key, None)
