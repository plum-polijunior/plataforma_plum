"""
Cliente do Google Sheets.

Duas coisas que este módulo faz e que o PRD do chat pedia mas ninguém tinha
implementado:

  1. **Uma chamada por dataset, não uma por card** (decisão 11A). Seis cards do
     mesmo dataset viram um `batchGet` com a união das colunas. A cota do
     Sheets é de 60 requisições por minuto: dez pessoas da mesma empresa
     abrindo o dashboard às 8h estouravam com uma chamada por card.

  2. **Teto de linhas verificado ANTES do parse** (decisão 10A). O `limit` do
     plano corta a saída depois da agregação, então nunca protegeu a memória.
     Aqui a contagem de linhas vem dos metadados da planilha, que é uma
     resposta minúscula, e a leitura é abortada antes de qualquer MB entrar.

O PLUM só lê. Nenhum método deste arquivo escreve na planilha do cliente.
"""

from __future__ import annotations

import logging
import time
from typing import Dict, List, Optional, Sequence, Set, Tuple

import pandas as pd

logger = logging.getLogger(__name__)

_SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

# Cache de cabeçalho e tamanho por planilha, vivo enquanto o container vive.
# Guarda só nome de coluna e contagem de linhas: nenhum dado de cliente.
_META_TTL_SECONDS = 900
_meta_cache: Dict[str, Tuple[float, "SheetMeta"]] = {}


class SheetError(Exception):
    """Falha ao ler a planilha, já traduzida para linguagem de gente."""


class SheetTooLarge(SheetError):
    pass


class SheetMeta:
    __slots__ = ("headers", "row_count")

    def __init__(self, headers: List[str], row_count: int):
        self.headers = headers
        self.row_count = row_count


def _col_letter(index_zero_based: int) -> str:
    """0 -> A, 25 -> Z, 26 -> AA. A API do Sheets fala A1, não índice."""
    n = index_zero_based + 1
    out = ""
    while n:
        n, rem = divmod(n - 1, 26)
        out = chr(65 + rem) + out
    return out


def _quoted_sheet(tab: str) -> str:
    """
    Nome de aba com espaço ou apóstrofo precisa de aspas na notação A1.

    Sem isto, uma aba chamada "Vendas 2026" gera a faixa `Vendas 2026!A2:A`,
    que a API do Google recusa. Crédito para `query_engine/cache.py` e o
    `sheets_client.py` do bmchad, que tratavam este caso e o meu não.
    """
    if any(c in tab for c in " '"):
        return "'" + tab.replace("'", "''") + "'"
    return tab


def build_service(service_account_info: dict):
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    creds = service_account.Credentials.from_service_account_info(
        service_account_info, scopes=_SCOPES
    )
    # cache_discovery=False: o cache em disco do client nao funciona em Lambda
    # (filesystem read-only fora de /tmp) e polui o log com aviso.
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def _translate(exc: Exception, sheet_id: str) -> SheetError:
    """
    Erro do Google vira frase que o usuário final entende.

    O card mostra o motivo e a ação, nunca o código HTTP.
    """
    status = getattr(getattr(exc, "resp", None), "status", None)
    if status == 404:
        return SheetError(
            "Nao encontrei essa planilha. Confira se ela nao foi apagada ou movida."
        )
    if status == 403:
        return SheetError(
            "Sem acesso a planilha. Compartilhe com reader@plum-ai.iam."
            "gserviceaccount.com como Leitor."
        )
    if status == 429:
        return SheetError(
            "O Google recusou por excesso de leituras neste minuto. "
            "Tente de novo em instantes."
        )
    logger.exception("Falha inesperada lendo a planilha %s", sheet_id)
    return SheetError("Nao consegui ler a planilha agora.")


def get_meta(service, sheet_id: str, tab: str) -> SheetMeta:
    """
    Cabeçalho e número de linhas numa chamada só.

    `spreadsheets.get` com `includeGridData` limitado à primeira linha devolve
    as propriedades da grade (que trazem `rowCount`) junto do cabeçalho. Duas
    informações, uma requisição.
    """
    key = f"{sheet_id}::{tab}"
    hit = _meta_cache.get(key)
    if hit and (time.time() - hit[0]) < _META_TTL_SECONDS:
        return hit[1]

    try:
        resp = (
            service.spreadsheets()
            .get(
                spreadsheetId=sheet_id,
                ranges=[f"{_quoted_sheet(tab)}!1:1"],
                includeGridData=True,
                fields=(
                    "sheets.properties.gridProperties.rowCount,"
                    "sheets.data.rowData.values.formattedValue"
                ),
            )
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        raise _translate(exc, sheet_id) from exc

    sheets = resp.get("sheets") or []
    if not sheets:
        raise SheetError(f"A aba '{tab}' nao existe nessa planilha.")

    props = sheets[0].get("properties", {}).get("gridProperties", {})
    row_count = int(props.get("rowCount", 0))

    headers: List[str] = []
    data = sheets[0].get("data") or []
    if data and data[0].get("rowData"):
        for cell in data[0]["rowData"][0].get("values", []):
            headers.append(str(cell.get("formattedValue", "")).strip())

    meta = SheetMeta(headers, row_count)
    _meta_cache[key] = (time.time(), meta)
    return meta


def _ranges_for(headers: Sequence[str], wanted: Set[str], tab: str):
    """
    Mapeia nome de coluna para faixa A1. Devolve (ranges, nomes_na_ordem).

    A comparação é feita no nome normalizado do cabeçalho, do mesmo jeito que o
    onboarding normaliza ao montar o schema_metadata.
    """
    ranges, nomes, faltando = [], [], set(wanted)
    for idx, h in enumerate(headers):
        if h in faltando:
            letra = _col_letter(idx)
            ranges.append(f"{_quoted_sheet(tab)}!{letra}2:{letra}")
            nomes.append(h)
            faltando.discard(h)
    if faltando:
        raise SheetError(
            "A planilha nao tem a(s) coluna(s): " + ", ".join(sorted(faltando))
            + ". A base pode ter mudado desde que o card foi criado."
        )
    return ranges, nomes


def load_columns(
    service,
    sheet_id: str,
    tab: str,
    columns: Set[str],
    max_rows: Optional[int] = None,
) -> pd.DataFrame:
    """
    Carrega só as colunas pedidas, numa requisição.

    `columns` vem da checagem de conjunto de `security.assert_columns_allowed`,
    então por construção nunca contém coluna fora da permissão do cargo. E como
    nada além disso é carregado, um plano que referencie outra coluna falha no
    executor com `MissingColumnError`, em vez de silenciosamente funcionar.
    """
    if not columns:
        raise SheetError("Nenhuma coluna a carregar para este card.")

    meta = get_meta(service, sheet_id, tab)

    # ── Teto ANTES de qualquer dado entrar em memória ────────────────────────
    linhas_de_dados = max(meta.row_count - 1, 0)
    if max_rows is not None and linhas_de_dados > max_rows:
        raise SheetTooLarge(
            f"Essa planilha tem cerca de {linhas_de_dados:,} linhas e o limite "
            f"desta organizacao e de {max_rows:,}. Reduza a base ou fale com "
            f"quem administra a conta.".replace(",", ".")
        )

    ranges, nomes = _ranges_for(meta.headers, columns, tab)

    try:
        resp = (
            service.spreadsheets()
            .values()
            .batchGet(
                spreadsheetId=sheet_id,
                ranges=ranges,
                majorDimension="COLUMNS",
                valueRenderOption="UNFORMATTED_VALUE",
            )
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        raise _translate(exc, sheet_id) from exc

    logger.info(
        "Sheets: 1 batchGet para %d coluna(s) da planilha %s", len(ranges), sheet_id[:8]
    )

    series: Dict[str, List] = {}
    for nome, bloco in zip(nomes, resp.get("valueRanges", [])):
        valores = (bloco.get("values") or [[]])
        series[nome] = valores[0] if valores else []

    tamanho = max((len(v) for v in series.values()), default=0)
    for nome in series:
        faltam = tamanho - len(series[nome])
        if faltam > 0:
            series[nome] = series[nome] + [None] * faltam

    return pd.DataFrame(series)
