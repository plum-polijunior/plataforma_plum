"""
Executor de cálculos do Agente A.

Motorista Cego: não recebe a pergunta do usuário e não conhece a intenção de
negócio. Lê apenas o Query Plan JSON e os dados das colunas que o plano pede.

Invariante de privacidade que este módulo garante (design doc, premissa P1.3):

  P1.3  Só sai daqui vetor agregado. Um plano sem agregação devolveria linhas
        brutas, e é recusado sempre.

A supressão por k-anonimato (grupo com poucas linhas de origem) existiu aqui
até 2026-08-08 (P3 do design doc) e foi removida por decisão de produto: pra
90% das planilhas reais (bases pequenas, poucas dezenas/centenas de linhas) o
limiar padrão suprimia respostas legítimas com frequência maior do que
qualquer ganho de privacidade que gerava — o custo em confiabilidade do chat
superava o benefício. `suppressed_groups` continua no retorno por
compatibilidade com quem consome a resposta (Agente C, cards), mas é sempre 0.

Os papéis das colunas (percentual, texto, data) chegam por parâmetro, derivados
do schema_metadata do tenant. Não existe constante global de coluna aqui: cada
cliente nomeia as colunas do jeito dele.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional, Set

import re
import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)


class ExecutorError(Exception):
    """Base de tudo que este módulo recusa a executar."""


class MissingColumnError(ExecutorError):
    """
    Coluna referenciada pelo plano não existe nos dados carregados.

    Falha alto de propósito. Ignorar um filtro ausente devolve a conta sobre a
    tabela inteira com o rótulo do recorte pedido, que é um número errado com
    etiqueta convincente. Card quebrado se conserta em minutos; card mentindo
    dura meses.
    """


class RawRowsBlocked(ExecutorError):
    """Plano sem agregação: devolveria linha bruta. Viola P1.3."""


class RowLimitExceeded(ExecutorError):
    """A base carregada passou do teto de linhas da organização."""


def _roles(column_roles: Optional[Dict[str, str]]) -> Dict[str, str]:
    return {k: str(v).lower() for k, v in (column_roles or {}).items()}


def _is_percent(col: str, roles: Dict[str, str]) -> bool:
    return roles.get(col) == "percent"


def _is_text(col: str, roles: Dict[str, str]) -> bool:
    return roles.get(col) == "text"


def execute_plan(
    plan: Dict[str, Any],
    tables: Dict[str, pd.DataFrame],
    *,
    column_roles: Optional[Dict[str, str]] = None,
    max_rows: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Executa um Query Plan e devolve um vetor agregado.

    column_roles: {coluna: 'percent'|'text'|'date'|'number'}, derivado do
        schema_metadata do tenant. Substitui as antigas constantes globais.
    max_rows: teto de linhas da base carregada. Verificado ANTES de qualquer
        processamento, porque o `limit` do plano corta a saída e não a entrada.
    """
    roles = _roles(column_roles)

    table_name = plan.get("from", "producao")
    if table_name not in tables:
        return {
            "columns": [], "rows": [], "row_count": 0,
            "error": f"Tabela '{table_name}' nao encontrada.",
        }

    df = tables[table_name].copy()

    # ── TETO DE ENTRADA ──────────────────────────────────────────────────────
    # O `limit` do plano roda depois da agregação, então não protege memória.
    if max_rows is not None and len(df) > max_rows:
        raise RowLimitExceeded(
            f"A base '{table_name}' tem {len(df):,} linhas e o limite desta "
            f"organizacao e de {max_rows:,}."
        )

    # ── WHERE ────────────────────────────────────────────────────────────────
    where = plan.get("where")
    if where is not None:
        # MissingColumnError sobe: filtro ausente nao pode virar "sem filtro".
        mask = _eval_where(df, where, roles)
        df = df[mask]

    if df.empty:
        return {"columns": [], "rows": [], "row_count": 0, "suppressed_groups": 0}

    # ── SELECT parsing ───────────────────────────────────────────────────────
    select_items = plan.get("select", [])
    group_by_raw = plan.get("group_by", [])

    if not select_items:
        raise RawRowsBlocked(
            "Plano sem 'select' devolveria linhas brutas da base."
        )

    direct_cols: list = []   # (alias, raw_col)
    aggs: list = []          # (alias, func, raw_col)

    for item in select_items:
        # Duas formas válidas de item, ambas documentadas no prompt do Agente A
        # ("cada item pode ser uma string (coluna direta) ou objeto") e ambas já
        # tratadas por `extractColumns` (_shared/query_plan.ts):
        #   "faturamento"                                  ← coluna direta
        #   {"expr": ..., "as": ...}                       ← expressão nomeada
        # A string crua caía num `item.get("expr")` e virava AttributeError, que
        # não é ExecutorError: escapava do `except` do main.py e virava 500, e a
        # pergunta do usuário morria com "Nao consegui calcular isso agora".
        # Um interpretador que aceita a forma e outro que não é a divergência
        # que o query_plan.ts existe para evitar.
        if isinstance(item, str):
            expr, alias = item, None
        elif isinstance(item, dict):
            expr = item.get("expr")
            alias = item.get("as")
        else:
            raise ExecutorError(
                f"Item de 'select' invalido: esperava string ou objeto, "
                f"veio {type(item).__name__}."
            )

        if expr is None:
            raise ExecutorError(
                "Item de 'select' sem 'expr': nao da para saber que coluna "
                "ou agregacao ele pede."
            )

        if isinstance(expr, dict):
            func = str(expr.get("agg", "sum")).lower()
            col = _strip_table(str(expr.get("col", "")))
            # Somar percentual nao significa nada: 10% + 20% nao e 30% de nada.
            if func == "sum" and _is_percent(col, roles):
                logger.info(
                    "Coluna '%s' e percentual: trocando sum por avg.", col
                )
                func = "avg"
            alias = alias or f"{func}_{col}"
            aggs.append((alias, func, col))
        else:
            col = _strip_table(str(expr))
            alias = alias or col
            direct_cols.append((alias, col))

    # ── P1.3: sem agregacao, sairiam linhas brutas ───────────────────────────
    if not aggs:
        raise RawRowsBlocked(
            "Plano sem agregacao devolveria linhas brutas. Todo card precisa "
            "de pelo menos uma funcao de agregacao (sum, avg, min, max, count)."
        )

    gb_cols = [_strip_table(c) for c in group_by_raw if c]

    # ── COM AGRUPAMENTO ──────────────────────────────────────────────────────
    # Nada de descartar coluna de group_by ausente em silêncio: agrupar por
    # [regiao, fantasma] e devolver só por regiao é um resultado diferente do
    # que foi pedido, com o rótulo do que foi pedido. _grouped_agg levanta
    # MissingColumnError e o card mostra erro, que é honesto.

    # As duas formas de agrupamento (explícito por group_by, implícito por
    # colunas diretas ao lado de agregações) usavam o mesmo bloco duplicado.
    # Agora é um caminho só: _grouped_agg.
    implicit_gb = [col for _, col in direct_cols if col in df.columns]
    agregado_unico = False

    if gb_cols:
        df_out = _grouped_agg(df, gb_cols, aggs, direct_cols, roles)
    elif direct_cols and implicit_gb:
        df_out = _grouped_agg(df, implicit_gb, aggs, direct_cols, roles)
    else:
        # ── AGREGADO ÚNICO sobre a base filtrada ──────────────────────────
        # Um número só, sobre a base inteira depois do where.
        agregado_unico = True
        row: Dict[str, Any] = {}
        for alias, func, col in aggs:
            row[alias] = _scalar_agg(df, func, col, roles)
        df_out = pd.DataFrame([row])

    # ── ORDER BY ─────────────────────────────────────────────────────────────
    # `df_out` já é o resultado agregado, então as colunas dele são os aliases —
    # não necessariamente os nomes de origem. Um order_by que cita a coluna de
    # origem de algo renomeado no select ainda é ordenável; é o que o mapa
    # resolve, em vez de tratar como ausente.
    saida_de: Dict[str, str] = {}
    for alias, raw in direct_cols:
        saida_de.setdefault(raw, alias)
    for alias, _func, raw in aggs:
        saida_de.setdefault(raw, alias)

    for order in plan.get("order_by", []):
        # A forma string ("order_by": ["total"]) é aceita pelo `extractColumns`
        # (_shared/query_plan.ts:112-114, o `else addCol(cols, o)`), mesmo o
        # prompt do Agente A documentando só a forma objeto. Era outro
        # `.get()` sobre string: AttributeError, 500 mudo, a mesma causa que o
        # `select` teve — uma linha ao lado.
        if isinstance(order, str):
            col, asc = _strip_table(order), True
        elif isinstance(order, dict):
            col = _strip_table(str(order.get("col", "")))
            asc = str(order.get("dir", "asc")).lower() == "asc"
        else:
            raise ExecutorError(
                f"Item de 'order_by' invalido: esperava string ou objeto, "
                f"veio {type(order).__name__}."
            )

        if not col:
            raise ExecutorError(
                "Item de 'order_by' sem 'col': nao da para saber por que "
                "coluna ordenar."
            )

        alvo = col if col in df_out.columns else saida_de.get(col)

        if alvo is None:
            if agregado_unico:
                # Uma linha só: ordenar não quer dizer nada. Recusar o plano
                # por causa de um order_by inócuo seria pior do que ignorá-lo.
                logger.info(
                    "order_by por '%s' ignorado: o resultado tem uma linha so.",
                    col,
                )
                continue
            # Ignorar em silêncio era o furo: o usuário pede "os 5 maiores",
            # a ordenação é descartada, o limit corta 5 quaisquer e a resposta
            # volta errada com cara de certa. É o mesmo motivo pelo qual o
            # where levanta MissingColumnError em vez de virar "sem filtro".
            raise MissingColumnError(
                f"Coluna '{col}' pedida em order_by nao esta no resultado. "
                f"Disponiveis: {', '.join(map(str, df_out.columns))}."
            )

        df_out = df_out.sort_values(by=alvo, ascending=asc, na_position="last")

    # ── LIMIT ────────────────────────────────────────────────────────────────
    limit = plan.get("limit", 200)
    df_out = df_out.head(limit)

    # ── SERIALIZAÇÃO ─────────────────────────────────────────────────────────
    df_out = _serialize_df(df_out)

    return {
        "columns": list(df_out.columns),
        "rows": df_out.to_dict(orient="records"),
        "row_count": int(len(df_out)),
        # Sempre 0: supressao por k-anonimato foi removida (ver docstring do
        # modulo). O campo fica no retorno por compatibilidade com quem
        # consome a resposta (Agente C, cards do dashboard).
        "suppressed_groups": 0,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Agregação
# ─────────────────────────────────────────────────────────────────────────────

def _coerce_numeric_for_agg(
    df: pd.DataFrame, aggs: list, roles: Dict[str, str]
) -> None:
    """Converte in-place colunas de texto usadas em agregação numérica."""
    for _, func, col in aggs:
        if (
            col in df.columns
            and not pd.api.types.is_numeric_dtype(df[col])
            and func in ("sum", "avg", "mean", "min", "max")
        ):
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)


def _grouped_agg(
    df: pd.DataFrame,
    gb_cols: list,
    aggs: list,
    direct_cols: list,
    roles: Dict[str, str],
):
    """Agrupa e agrega. Devolve df_out."""
    missing = [c for c in gb_cols if c not in df.columns]
    if missing:
        raise MissingColumnError(
            f"Coluna(s) de agrupamento nao encontrada(s): {', '.join(missing)}."
        )

    # A cópia é o que permite `_coerce_numeric_for_agg` escrever coluna sem
    # cair em SettingWithCopy: `df` aqui costuma ser a fatia `df[mask]` que o
    # where produziu, não um frame próprio.
    df = df.copy()
    _coerce_numeric_for_agg(df, aggs, roles)
    g = df.groupby(gb_cols, dropna=False)

    agg_dict: Dict[str, tuple] = {}
    for alias, func, col in aggs:
        if col not in df.columns:
            raise MissingColumnError(
                f"Coluna '{col}' referenciada em select nao existe nos dados."
            )
        agg_dict[alias] = (col, "mean" if func == "avg" else func)

    df_out = g.agg(**agg_dict).reset_index()

    rename_map = {
        col: alias
        for alias, col in direct_cols
        if alias != col and col in df_out.columns
    }
    if rename_map:
        df_out = df_out.rename(columns=rename_map)

    ordered: list = []
    for alias, col in direct_cols:
        eff = alias if alias in df_out.columns else col
        if eff in df_out.columns and eff not in ordered:
            ordered.append(eff)
    for c in gb_cols:
        if c in df_out.columns and c not in ordered:
            ordered.append(c)
    for alias, _, _ in aggs:
        if alias in df_out.columns and alias not in ordered:
            ordered.append(alias)

    return df_out[[c for c in ordered if c in df_out.columns]]


def _scalar_agg(df: pd.DataFrame, func: str, col: str, roles: Dict[str, str]):
    """Uma agregação sobre a base inteira. Sem agrupamento."""
    if col not in df.columns:
        raise MissingColumnError(
            f"Coluna '{col}' referenciada em select nao existe nos dados."
        )
    s = df[col].dropna()
    if len(s) == 0:
        return None
    if func in ("sum", "avg", "mean") and (
        s.dtype == object or _is_text(col, roles)
    ):
        s = pd.to_numeric(s, errors="coerce").fillna(0)
    if func == "sum":
        return float(s.sum())
    if func in ("avg", "mean"):
        return float(s.mean())
    if func == "min":
        return _to_python(s.min())
    if func == "max":
        return _to_python(s.max())
    if func == "count":
        return int(s.count())
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _strip_table(col: str) -> str:
    return col.split(".", 1)[1] if "." in col else col


def _strip_accents(value) -> str:
    """Remove acentos e normaliza para comparação de texto (upper, sem acento)."""
    import unicodedata
    s = str(value).strip().upper()
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


def _norm_series(s: pd.Series) -> pd.Series:
    """Versão vetorizada de _strip_accents para uma Series de texto."""
    import unicodedata
    return s.astype(str).map(
        lambda v: "".join(
            c for c in unicodedata.normalize("NFD", str(v).strip().upper())
            if unicodedata.category(c) != "Mn"
        )
    )


def _to_python(val):
    if pd.isna(val):
        return None
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    return val


def _serialize_df(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            df[col] = df[col].dt.strftime("%d/%m/%Y").where(df[col].notna(), None)
        elif pd.api.types.is_float_dtype(df[col]):
            df[col] = df[col].where(pd.notnull(df[col]), None)
        elif pd.api.types.is_integer_dtype(df[col]):
            pass
    return df


# ─────────────────────────────────────────────────────────────────────────────
# Avaliação do WHERE
# ─────────────────────────────────────────────────────────────────────────────

def _eval_where(
    df: pd.DataFrame, node: Dict[str, Any], roles: Optional[Dict[str, str]] = None
) -> pd.Series:
    roles = roles or {}
    op = str(node.get("op", "")).lower()

    if op in ("and", "or"):
        args = node.get("args", [])
        if not args:
            return pd.Series([True] * len(df), index=df.index)
        masks = [_eval_where(df, a, roles) for a in args]
        result = masks[0]
        for m in masks[1:]:
            result = (result & m) if op == "and" else (result | m)
        return result.fillna(False)

    return _eval_single(df, node, roles)


def _eval_single(
    df: pd.DataFrame, node: Dict[str, Any], roles: Optional[Dict[str, str]] = None
) -> pd.Series:
    roles = roles or {}
    op = str(node.get("op", "")).lower()
    col = _strip_table(str(node.get("left", "")))
    right = node.get("right")

    if col not in df.columns:
        # NAO devolver tudo-verdadeiro. Isso desligava o filtro e fazia a conta
        # rodar sobre a tabela inteira, devolvendo o total historico com o
        # rotulo do recorte pedido. Numero errado com etiqueta convincente e
        # pior que erro na tela.
        logger.error(
            "Coluna '%s' do filtro nao existe nos dados carregados. "
            "Colunas disponiveis: %s", col, list(df.columns),
        )
        raise MissingColumnError(
            f"O filtro usa a coluna '{col}', que nao foi carregada."
        )

    s = df[col]
    is_str_col = s.dtype == object or _is_text(col, roles)
    is_dt_col = pd.api.types.is_datetime64_any_dtype(s)

    # ── BETWEEN ──────────────────────────────────────────────────────────────
    if op == "between":
        a, b = right[0], right[1]
        if is_dt_col:
            return ((s >= pd.to_datetime(a)) & (s <= pd.to_datetime(b))).fillna(False)
        # Tenta numérico primeiro (para percent_desconto, avaliação_final)
        try:
            return ((pd.to_numeric(s, errors="coerce") >= float(a)) &
                    (pd.to_numeric(s, errors="coerce") <= float(b))).fillna(False)
        except Exception:
            return ((s >= a) & (s <= b)).fillna(False)

    # ── IGUALDADE (=) ────────────────────────────────────────────────────────
    if op == "=":
        if is_dt_col:
            return (s == pd.to_datetime(right)).fillna(False)
        if is_str_col:
            try:
                # Tenta comparar como número primeiro (ex: "02" == 2 ou "2.0" == "2")
                return (pd.to_numeric(s, errors="raise") == float(right)).fillna(False)
            except Exception:
                # Comparação textual SEM acento e case-insensitive
                return _norm_series(s) == _strip_accents(right)
        try:
            return (pd.to_numeric(s, errors="coerce") == float(right)).fillna(False)
        except Exception:
            return (s == right).fillna(False)

    # ── DESIGUALDADE (!=) ────────────────────────────────────────────────────
    if op == "!=":
        if is_str_col:
            return _norm_series(s) != _strip_accents(right)
        return (s != right).fillna(False)

    # ── COMPARAÇÕES NUMÉRICAS / DATAS ────────────────────────────────────────
    if op in (">", ">=", "<", "<="):
        if is_dt_col:
            right_val = pd.to_datetime(right)
            if op == ">": return (s > right_val).fillna(False)
            if op == ">=": return (s >= right_val).fillna(False)
            if op == "<": return (s < right_val).fillna(False)
            if op == "<=": return (s <= right_val).fillna(False)
            
        right_val = float(right)
        if op == ">":
            return (pd.to_numeric(s, errors="coerce") > right_val).fillna(False)
        if op == ">=":
            return (pd.to_numeric(s, errors="coerce") >= right_val).fillna(False)
        if op == "<":
            return (pd.to_numeric(s, errors="coerce") < right_val).fillna(False)
        if op == "<=":
            return (pd.to_numeric(s, errors="coerce") <= right_val).fillna(False)

    # ── CONTAINS ─────────────────────────────────────────────────────────────
    if op == "contains":
        # Comparação SEM acento e case-insensitive (ex.: "fundicao" casa "Fundição")
        return _norm_series(s).str.contains(
            re.escape(_strip_accents(right)), na=False, regex=True
        )

    # ── IN ───────────────────────────────────────────────────────────────────
    if op == "in":
        if is_str_col:
            vals = [_strip_accents(v) for v in right]
            return _norm_series(s).isin(vals).fillna(False)
        return s.isin(right).fillna(False)

    raise ValueError(f"Operador where nao suportado: '{op}'")


# ─────────────────────────────────────────────────────────────────────────────
# Execução com Regras de Formatação (Agente 3 & 3.1)
# ─────────────────────────────────────────────────────────────────────────────

def _parse_ptbr_number(s: pd.Series, *, strip_percent: bool = False) -> pd.Series:
    """
    Limpa um número em formato PT-BR: remove 'R$', espaços, opcionalmente '%',
    o ponto de milhar, e troca a vírgula decimal por ponto.
    """
    text = s.astype(str)
    text = text.str.replace("R$", "", regex=False)
    if strip_percent:
        text = text.str.replace("%", "", regex=False)
    text = text.str.replace(r"\s", "", regex=True)
    text = text.str.replace(".", "", regex=False)
    text = text.str.replace(",", ".", regex=False)
    return pd.to_numeric(text, errors="coerce")


def _fmt_moeda_brl(s: pd.Series, params: Dict[str, Any]) -> pd.Series:
    return _parse_ptbr_number(s)


def _fmt_numero_decimal(s: pd.Series, params: Dict[str, Any]) -> pd.Series:
    return _parse_ptbr_number(s)


def _fmt_numero_inteiro(s: pd.Series, params: Dict[str, Any]) -> pd.Series:
    return _parse_ptbr_number(s).astype("Int64")


def _fmt_percentual(s: pd.Series, params: Dict[str, Any]) -> pd.Series:
    return _parse_ptbr_number(s, strip_percent=True)


def _fmt_data(s: pd.Series, params: Dict[str, Any]) -> pd.Series:
    # UNFORMATTED_VALUE (sheets.py) devolve numero de serie do Sheets/Excel
    # (dias desde 1899-12-30) para celulas formatadas como Data, e texto puro
    # para celulas digitadas/coladas sem essa formatacao — a MESMA coluna pode
    # ter as duas coisas, linha a linha (visto em produção: `data_apontamento`
    # com serial em algumas linhas e "17/02/2026" em outras). Decidir por
    # maioria da coluna inteira converte a minoria errado sempre — pd.to_datetime
    # de um numero puro, sem `unit`/`origin`, conta nanossegundos desde 1970, nao
    # dias desde 1899. Por isso a escolha e por LINHA: serial onde o valor bruto
    # e numerico, texto (com dayfirst) onde nao e.
    numerico = pd.to_numeric(s, errors="coerce")
    via_serial = pd.to_datetime(numerico, unit="D", origin="1899-12-30", errors="coerce")
    via_texto = pd.to_datetime(s, dayfirst=bool(params.get("dayfirst", True)), errors="coerce")
    return via_serial.where(numerico.notna(), via_texto)


def _fmt_texto_trim_maiusculas(s: pd.Series, params: Dict[str, Any]) -> pd.Series:
    return s.astype(str).str.strip().str.upper()


def _fmt_texto_trim_minusculas(s: pd.Series, params: Dict[str, Any]) -> pd.Series:
    return s.astype(str).str.strip().str.lower()


def _fmt_documento_cpf_cnpj(s: pd.Series, params: Dict[str, Any]) -> pd.Series:
    return s.astype(str).str.replace(r"[^\d]", "", regex=True)


_BOOLEANOS_VERDADEIROS = {"sim", "verdadeiro", "true", "1", "s", "v", "yes"}
_BOOLEANOS_FALSOS = {"nao", "não", "falso", "false", "0", "n", "f", "no"}


def _fmt_booleano_sim_nao(s: pd.Series, params: Dict[str, Any]) -> pd.Series:
    normalizado = s.astype(str).str.strip().str.lower()

    def _mapear(v: str):
        if v in _BOOLEANOS_VERDADEIROS:
            return True
        if v in _BOOLEANOS_FALSOS:
            return False
        return pd.NA

    return normalizado.map(_mapear)


def _fmt_nenhuma(s: pd.Series, params: Dict[str, Any]) -> pd.Series:
    return s


# Enum fechado de `type` de formatação (query_engine/urgent.md). Expandir só
# com decisão explícita — nunca em silêncio.
_FORMATTERS: Dict[str, Callable[[pd.Series, Dict[str, Any]], pd.Series]] = {
    "moeda_brl": _fmt_moeda_brl,
    "numero_decimal": _fmt_numero_decimal,
    "numero_inteiro": _fmt_numero_inteiro,
    "percentual": _fmt_percentual,
    "data": _fmt_data,
    "texto_trim_maiusculas": _fmt_texto_trim_maiusculas,
    "texto_trim_minusculas": _fmt_texto_trim_minusculas,
    "documento_cpf_cnpj": _fmt_documento_cpf_cnpj,
    "booleano_sim_nao": _fmt_booleano_sim_nao,
    "nenhuma": _fmt_nenhuma,
}

# Papel (percent/date/number/text) de cada `type` do enum. Substitui o antigo
# keyword-match em texto livre: agora é lookup direto, sem heurística.
TYPE_TO_ROLE: Dict[str, str] = {
    "moeda_brl": "number",
    "numero_decimal": "number",
    "numero_inteiro": "number",
    "percentual": "percent",
    "data": "date",
    "texto_trim_maiusculas": "text",
    "texto_trim_minusculas": "text",
    "documento_cpf_cnpj": "text",
    "booleano_sim_nao": "text",
    "nenhuma": "text",
}


def apply_formatting_rules(
    df: pd.DataFrame, formatting_rules: Dict[str, Dict[str, Any]]
) -> pd.DataFrame:
    """
    Aplica as regras de formatação estruturadas (Agente 3/3.1) sobre as
    colunas do DataFrame. Cada regra é `{"type": <enum fechado>, "params": {}}`.

    `type` fora do enum ou `"nenhuma"` não transforma a coluna, mas loga um
    warning — a falha de tipagem precisa ficar visível para alguém, nunca
    sumir em silêncio (era o problema central do `query_engine/urgent.md`).
    """
    df = df.copy()
    for col, rule in (formatting_rules or {}).items():
        if col not in df.columns:
            continue

        tipo = str((rule or {}).get("type", "nenhuma"))
        params = (rule or {}).get("params") or {}
        formatter = _FORMATTERS.get(tipo)

        if formatter is None:
            logger.warning(
                "Coluna '%s': type de formatacao '%s' desconhecido. "
                "Coluna nao transformada.", col, tipo,
            )
            continue
        if tipo == "nenhuma":
            logger.warning(
                "Coluna '%s': sem regra de formatacao (type='nenhuma'). "
                "Dados permanecem como vieram da planilha.", col,
            )
            continue

        df[col] = formatter(df[col], params)

    return df


def roles_from_formatting_rules(
    formatting_rules: Dict[str, Dict[str, Any]]
) -> Dict[str, str]:
    """
    Deriva o papel de cada coluna (percent/date/number/text) a partir do
    `type` estruturado que o Agente 3 gravou em `schema_metadata`.

    É daqui que sai o `column_roles` do executor. A alternativa antiga era uma
    constante global no módulo, que não funciona em multitenant: a coluna de
    percentual da Poli Júnior tem um nome e a do laticínio tem outro.
    """
    roles: Dict[str, str] = {}
    for col, rule in (formatting_rules or {}).items():
        tipo = str((rule or {}).get("type", "nenhuma"))
        roles[col] = TYPE_TO_ROLE.get(tipo, "text")
    return roles


def execute_plan_with_formatting(
    plan: Dict[str, Any],
    tables: Dict[str, pd.DataFrame],
    formatting_rules: Dict[str, Dict[str, Any]] | None = None,
    *,
    column_roles: Optional[Dict[str, str]] = None,
    max_rows: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Pré-processa as tabelas aplicando as regras de formatação (formattingRules)
    e executa o plano de consulta determinístico gerado pelo Agente A.

    Quando `column_roles` não é passado, deriva os papéis das próprias regras
    de formatação.
    """
    roles = column_roles
    if roles is None and formatting_rules:
        roles = roles_from_formatting_rules(formatting_rules)

    if not formatting_rules:
        return execute_plan(
            plan, tables, column_roles=roles, max_rows=max_rows
        )

    formatted_tables: Dict[str, pd.DataFrame] = {}
    for table_name, df in tables.items():
        formatted_tables[table_name] = apply_formatting_rules(df, formatting_rules)

    return execute_plan(
        plan, formatted_tables, column_roles=roles, max_rows=max_rows
    )

