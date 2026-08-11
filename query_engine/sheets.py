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

CACHE DE DADOS (TTL 15 min): decisão tomada em 2026-08-07 (ver `TODOS.md` #1) — as
linhas lidas do Google ficam até 15 minutos na memória do processo, via
`query_engine/cache.py`, chaveadas por planilha+aba+conjunto exato de colunas.
Isto estende a vida do dado bruto do cliente de "uma requisição" para "até 15
minutos na memória", o que é a mudança de postura de privacidade que o TODOS
pedia para ser consciente. Não persiste em disco em nenhum momento. Diferente do
`_meta_cache` abaixo, que só guarda cabeçalho e contagem de linhas (nunca dado
de cliente) e por isso não precisou dessa decisão.
"""

from __future__ import annotations

import logging
import time
from typing import Dict, List, Optional, Sequence, Set, Tuple

import pandas as pd

from query_engine import cache

logger = logging.getLogger(__name__)

_SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

# A identidade que o cliente autoriza como Leitor na planilha dele. Precisa ser
# EXATAMENTE a mesma que aparece na tela de conexão de base
# (src/components/DatabasePipeline.tsx). Se as duas divergirem, o serviço
# autentica no Google normalmente e mesmo assim toda planilha responde "sem
# acesso", porque foi compartilhada com outro endereço. Parece falha de rede e
# é falha de identidade.
SERVICE_ACCOUNT_EMAIL = "plum-polijunior@plataforma-plum.iam.gserviceaccount.com"

# Cache de cabeçalho e tamanho por planilha, vivo enquanto o container vive.
# Guarda só nome de coluna e contagem de linhas: nenhum dado de cliente.
_META_TTL_SECONDS = 900
_meta_cache: Dict[str, Tuple[float, "SheetMeta"]] = {}

# Mapa {gid: titulo} por planilha. Também não guarda dado de cliente — só nome
# de aba. Existe para que a tradução gid → nome custe uma requisição por
# planilha a cada 15 min, e não uma por pergunta.
_abas_cache: Dict[str, Tuple[float, Dict[int, str]]] = {}


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


def _titulos_das_abas(service, sheet_id: str) -> List[str]:
    """
    Os nomes das abas da planilha, para o erro poder dizer o que existe.

    Best-effort de propósito: roda só no caminho de erro, e se ela mesma falhar
    a mensagem continua melhor do que era antes. Nunca levanta.
    """
    try:
        resp = (
            service.spreadsheets()
            .get(spreadsheetId=sheet_id, fields="sheets.properties.title")
            .execute()
        )
    except Exception:  # noqa: BLE001
        logger.warning("Nao consegui listar as abas de %s", sheet_id[:8])
        return []

    titulos = []
    for s in resp.get("sheets") or []:
        t = (s.get("properties") or {}).get("title")
        if t:
            titulos.append(str(t))
    return titulos


def _translate(
    exc: Exception,
    sheet_id: str,
    *,
    service=None,
    tab: Optional[str] = None,
) -> SheetError:
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
        # Mantido numa linha so de proposito: quebrado em duas, o endereco
        # escapa de qualquer busca por texto e fica desatualizado sem ninguem
        # perceber. Foi o que aconteceu quando a conta de servico mudou.
        return SheetError(
            "Sem acesso a planilha. Compartilhe com "
            f"{SERVICE_ACCOUNT_EMAIL} como Leitor."
        )
    if status == 429:
        return SheetError(
            "O Google recusou por excesso de leituras neste minuto. "
            "Tente de novo em instantes."
        )
    if status == 400:
        # Nome de aba errado é 400 ("Unable to parse range"), não 404. Sem este
        # branch caía na frase genérica de erro inesperado, e em 2026-08-10 isso
        # custou uma investigação inteira: `datasets.google_sheet_tab` estava no
        # default 'Sheet1' (nenhum código do front escreve esse campo) numa
        # planilha cuja aba tem outro nome, e a única pista era "nao consegui ler
        # a planilha agora".
        #
        # A checagem de `sheets` vazio em `get_meta` já tinha a frase certa, mas
        # é inalcançável: o Google recusa o range antes de responder 200.
        logger.warning(
            "Sheets recusou a requisicao (400) na planilha %s, aba %r: %s",
            sheet_id[:8], tab, exc,
        )
        alvo = f"A aba '{tab}' nao existe nessa planilha." if tab else (
            "A planilha recusou a faixa pedida."
        )
        abas = _titulos_das_abas(service, sheet_id) if service is not None else []
        if abas:
            return SheetError(f"{alvo} Abas disponiveis: {', '.join(abas)}.")
        return SheetError(f"{alvo} Confira o nome da aba na configuracao da base.")
    logger.exception("Falha inesperada lendo a planilha %s", sheet_id)
    return SheetError("Nao consegui ler a planilha agora.")


def mapa_de_abas(service, sheet_id: str) -> Dict[int, str]:
    """
    `{gid: titulo}` de todas as abas da planilha.

    Resposta minúscula: `fields` limita a `sheetId` e `title`, e
    `includeGridData` fica de fora, então nenhuma célula é transferida.
    """
    hit = _abas_cache.get(sheet_id)
    if hit and (time.time() - hit[0]) < _META_TTL_SECONDS:
        return hit[1]

    try:
        resp = (
            service.spreadsheets()
            .get(spreadsheetId=sheet_id, fields="sheets.properties(sheetId,title)")
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        # Sem `tab` aqui de propósito: a falha é da planilha inteira (não
        # compartilhada, apagada), não de uma aba específica.
        raise _translate(exc, sheet_id, service=service) from exc

    mapa: Dict[int, str] = {}
    for s in resp.get("sheets") or []:
        props = s.get("properties") or {}
        gid, titulo = props.get("sheetId"), props.get("title")
        if gid is not None and titulo:
            mapa[int(gid)] = str(titulo)

    _abas_cache[sheet_id] = (time.time(), mapa)
    return mapa


def resolver_aba(service, sheet_id: str, tab: str, tab_gid: Optional[int]) -> str:
    """
    Qual nome de aba usar na notação A1 — a partir do `gid` quando ele existe.

    A API do Sheets só aceita NOME de aba em range (`'Vendas 2026'!A2:A`); não
    existe leitura por gid. Mas nome é apelido mutável: guardar o nome no banco
    funciona até alguém renomear a aba, e então a base quebra sem ninguém ter
    mexido nela. Por isso o banco guarda o `gid`, que o Google atribui na
    criação da aba e não muda com rename, e a tradução acontece aqui.

    Precedência do `gid` sobre `tab` não é correção silenciosa: o `gid` é a aba
    que a pessoa tinha aberta quando copiou a URL, enquanto `tab` por muito
    tempo foi só o DEFAULT da coluna ('Sheet1'), que nenhum código escrevia. O
    `gid` é a escolha explícita; o nome é o palpite. Quando os dois discordam,
    isso vai para o log — alerta, não silêncio.

    `tab_gid is None` (e nunca `if not tab_gid`): gid 0 é a primeira aba.
    """
    if tab_gid is None:
        return tab

    mapa = mapa_de_abas(service, sheet_id)
    titulo = mapa.get(tab_gid)

    if titulo is None:
        # A aba foi apagada, ou a URL gravada aponta para outra planilha. Cair
        # no `tab` aqui seria ler uma aba que ninguém escolheu e devolver
        # número de outro recorte — o modo de falha caro deste produto. Ver R-08
        # em CLAUDE.md: validação alerta, nunca corrige.
        disponiveis = ", ".join(f"{t} (gid={g})" for g, t in sorted(mapa.items()))
        raise SheetError(
            f"A aba configurada nesta base (gid={tab_gid}) nao existe mais nessa "
            f"planilha. Abas disponiveis: {disponiveis or 'nenhuma'}. Reconecte a "
            f"base colando a URL com a aba certa aberta."
        )

    if titulo != tab:
        logger.info(
            "Aba resolvida por gid: planilha %s gid=%s -> %r (o banco dizia %r)",
            sheet_id[:8], tab_gid, titulo, tab,
        )

    return titulo


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
        raise _translate(exc, sheet_id, service=service, tab=tab) from exc

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


def _fetch_columns_uncached(
    service, sheet_id: str, tab: str, columns: Set[str], headers: List[str]
) -> pd.DataFrame:
    """A leitura de rede em si — só roda em cache miss. Ver `load_columns`."""
    ranges, nomes = _ranges_for(headers, columns, tab)

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
        raise _translate(exc, sheet_id, service=service, tab=tab) from exc

    logger.info(
        "Sheets: 1 batchGet para %d coluna(s) da planilha %s (cache miss)",
        len(ranges), sheet_id[:8],
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


def load_columns(
    service,
    sheet_id: str,
    tab: str,
    columns: Set[str],
    max_rows: Optional[int] = None,
    tab_gid: Optional[int] = None,
) -> pd.DataFrame:
    """
    Carrega só as colunas pedidas, numa requisição (ou do cache, ver abaixo).

    `columns` vem da checagem de conjunto de `security.assert_columns_allowed`,
    então por construção nunca contém coluna fora da permissão do cargo. E como
    nada além disso é carregado, um plano que referencie outra coluna falha no
    executor com `MissingColumnError`, em vez de silenciosamente funcionar.

    Cache de dados: chave por planilha + aba + conjunto exato de colunas, TTL
    15 min (`query_engine/cache.py`). Um pedido com um conjunto de colunas
    diferente (mesmo que seja um subconjunto do que já foi cacheado) é cache
    miss — a granularidade é o conjunto pedido, não a coluna individual.
    """
    if not columns:
        raise SheetError("Nenhuma coluna a carregar para este card.")

    # Uma resolução só, no topo, e todo o resto do caminho usa o nome resolvido
    # — inclusive a chave do cache, que assim aponta para a mesma entrada quer o
    # pedido tenha vindo pelo gid ou pelo nome legado.
    tab = resolver_aba(service, sheet_id, tab, tab_gid)

    meta = get_meta(service, sheet_id, tab)

    # ── Teto ANTES de qualquer dado entrar em memória ────────────────────────
    # Roda sempre, mesmo em cache hit: é uma verificação sobre o tamanho da
    # planilha (via _meta_cache, que não guarda dado de cliente), não sobre o
    # resultado cacheado.
    linhas_de_dados = max(meta.row_count - 1, 0)
    if max_rows is not None and linhas_de_dados > max_rows:
        raise SheetTooLarge(
            f"Essa planilha tem cerca de {linhas_de_dados:,} linhas e o limite "
            f"desta organizacao e de {max_rows:,}. Reduza a base ou fale com "
            f"quem administra a conta.".replace(",", ".")
        )

    chave = cache.make_cache_key(f"{sheet_id}::{tab}", list(columns))
    return cache.get_or_fetch(
        chave, lambda: _fetch_columns_uncached(service, sheet_id, tab, columns, meta.headers)
    )
