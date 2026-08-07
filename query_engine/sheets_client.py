"""
Cliente de leitura do Google Sheets via Service Account — o único ponto do sistema que fala
com a planilha do cliente. Segue os invariantes do produto (query_engine/prd.md):

- R-01: somente leitura — os escopos abaixo são `.readonly`, nunca escrevem na planilha.
- Column-Range GET: lê só as colunas de `target_columns` do plano do Agente A, nunca a
  planilha inteira (ex.: `Sheet1!B:B,E:E`, não `Sheet1!A1:Z100000`).

Autenticação via `GOOGLE_CLOUD_CREDENTIALS` (caminho do JSON da Service Account do projeto
"Plataforma Plum" — ver query_engine/prd.md §8). Cada organização compartilha sua planilha
com o e-mail dessa Service Account como Leitor.
"""

from __future__ import annotations

import os
from typing import Iterable

import pandas as pd
from google.oauth2 import service_account
from googleapiclient.discovery import build

import cache

_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

_credentials = None
_service = None


class SheetAccessError(Exception):
    """Erro ao ler a planilha do cliente — nunca inventar dado, sempre propagar como erro."""


def _load_credentials():
    global _credentials
    if _credentials is None:
        creds_path = os.environ.get("GOOGLE_CLOUD_CREDENTIALS")
        if not creds_path:
            raise RuntimeError("GOOGLE_CLOUD_CREDENTIALS não configurado no ambiente.")
        _credentials = service_account.Credentials.from_service_account_file(
            creds_path, scopes=_SCOPES
        )
    return _credentials


def _get_service():
    global _service
    if _service is None:
        _service = build("sheets", "v4", credentials=_load_credentials(), cache_discovery=False)
    return _service


def _column_letter(index: int) -> str:
    """Índice 0-based -> letra de coluna estilo planilha (0 -> 'A', 26 -> 'AA')."""
    letters = ""
    index += 1
    while index > 0:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def _quoted_sheet(sheet_name: str) -> str:
    return f"'{sheet_name}'" if any(c in sheet_name for c in " '") else sheet_name


def _fetch_header_uncached(google_sheet_id: str, sheet_name: str) -> list[str]:
    service = _get_service()
    try:
        response = (
            service.spreadsheets()
            .values()
            .get(spreadsheetId=google_sheet_id, range=f"{_quoted_sheet(sheet_name)}!1:1")
            .execute()
        )
    except Exception as exc:
        raise SheetAccessError(f"Falha ao ler o cabeçalho da planilha: {exc}") from exc

    rows = response.get("values", [])
    return rows[0] if rows else []


def _get_header(google_sheet_id: str, sheet_name: str) -> list[str]:
    key = cache.make_cache_key(f"header:{google_sheet_id}:{sheet_name}", [])
    return cache.get_or_fetch(key, lambda: _fetch_header_uncached(google_sheet_id, sheet_name))


def fetch_columns(google_sheet_id: str, sheet_name: str, target_columns: Iterable[str]) -> pd.DataFrame:
    """Column-Range GET: busca só as colunas pedidas, sem cache (ver fetch_table para cache)."""
    columns = list(target_columns)
    header = _get_header(google_sheet_id, sheet_name)
    name_to_index = {name: idx for idx, name in enumerate(header)}

    missing = [c for c in columns if c not in name_to_index]
    if missing:
        raise SheetAccessError(f"Colunas não encontradas na planilha: {missing}")

    quoted = _quoted_sheet(sheet_name)
    ranges = [
        f"{quoted}!{_column_letter(name_to_index[col])}2:{_column_letter(name_to_index[col])}"
        for col in columns
    ]

    service = _get_service()
    try:
        response = (
            service.spreadsheets()
            .values()
            .batchGet(spreadsheetId=google_sheet_id, ranges=ranges)
            .execute()
        )
    except Exception as exc:
        raise SheetAccessError(f"Falha ao ler colunas da planilha: {exc}") from exc

    data: dict[str, list[object]] = {}
    for col, value_range in zip(columns, response.get("valueRanges", [])):
        values = value_range.get("values", [])
        data[col] = [row[0] if row else None for row in values]

    max_len = max((len(v) for v in data.values()), default=0)
    for values in data.values():
        if len(values) < max_len:
            values.extend([None] * (max_len - len(values)))

    return pd.DataFrame(data)


def fetch_table(
    google_sheet_id: str,
    sheet_name: str,
    target_columns: Iterable[str],
    dataset_id: str,
) -> pd.DataFrame:
    """Column-Range GET com cache TTL de 15 min, isolado por dataset_id (tenant)."""
    columns = list(target_columns)
    key = cache.make_cache_key(dataset_id, columns)
    return cache.get_or_fetch(key, lambda: fetch_columns(google_sheet_id, sheet_name, columns))
