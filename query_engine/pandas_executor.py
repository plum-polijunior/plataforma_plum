"""
Executor de cálculos do Agente A
"""

from __future__ import annotations

from typing import Any, Dict

import re
import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)


# Colunas que são percentuais — nunca somar, apenas avg/min/max
_PCT_COLS = {
    #definir
}

# Colunas que são apenas para leitura direta (strings)
_STRING_COLS = {
#
}


def execute_plan(
    plan: Dict[str, Any], tables: Dict[str, pd.DataFrame]
) -> Dict[str, Any]:
    table_name = plan.get("from", "producao")
    if table_name not in tables:
        return {
            "columns": [], "rows": [], "row_count": 0,
            "error": f"Tabela '{table_name}' nao encontrada.",
        }

    df = tables[table_name].copy()

    # ── WHERE ────────────────────────────────────────────────────────────────
    where = plan.get("where")
    if where is not None:
        try:
            mask = _eval_where(df, where)
            df = df[mask]
        except Exception as exc:
            return {
                "columns": [], "rows": [], "row_count": 0,
                "error": f"Erro no filtro where: {exc}",
            }

    if df.empty:
        return {"columns": [], "rows": [], "row_count": 0}

    # ── SELECT parsing ───────────────────────────────────────────────────────
    select_items = plan.get("select", [])
    group_by_raw = plan.get("group_by", [])

    if not select_items:
        df_out = _serialize_df(df.head(50).copy())
        return {
            "columns": list(df_out.columns),
            "rows": df_out.to_dict(orient="records"),
            "row_count": len(df),
        }

    direct_cols: list = []   # (alias, raw_col)
    aggs: list = []          # (alias, func, raw_col)

    for item in select_items:
        expr = item.get("expr")
        alias = item.get("as")
        if isinstance(expr, dict):
            func = str(expr.get("agg", "sum")).lower()
            col = _strip_table(str(expr.get("col", "")))
            # Protege percentuais de serem somados
            if func == "sum" and col in _PCT_COLS:
                func = "avg"
            alias = alias or f"{func}_{col}"
            aggs.append((alias, func, col))
        else:
            col = _strip_table(str(expr))
            alias = alias or col
            direct_cols.append((alias, col))

    gb_cols = [_strip_table(c) for c in group_by_raw if c]

    # ── COM AGRUPAMENTO ──────────────────────────────────────────────────────
    if gb_cols:
        valid_gb = [c for c in gb_cols if c in df.columns]
        if not valid_gb:
            logger.warning("Colunas de group_by não encontradas na planilha: %s. Ignorando agrupamento.", gb_cols)
            gb_cols = []
        else:
            gb_cols = valid_gb

    if gb_cols:
        # Converte colunas string para numérico antes do groupby (evita concatenação)
        for _, func, col in aggs:
            if col in df.columns and not pd.api.types.is_numeric_dtype(df[col]) and func in ("sum", "avg", "mean", "min", "max"):
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

        g = df.groupby(gb_cols, dropna=False)

        agg_dict: Dict[str, tuple] = {}
        for alias, func, col in aggs:
            if col not in df.columns:
                continue
            pandas_func = "mean" if func == "avg" else func
            agg_dict[alias] = (col, pandas_func)

        if agg_dict:
            df_out = g.agg(**agg_dict).reset_index()
        else:
            df_out = g.size().reset_index(name="count")

        rename_map = {
            col: alias
            for alias, col in direct_cols
            if alias != col and col in df_out.columns
        }
        if rename_map:
            df_out = df_out.rename(columns=rename_map)

        ordered = []
        for alias, col in direct_cols:
            eff = alias if alias in df_out.columns else col
            if eff in df_out.columns and eff not in ordered:
                ordered.append(eff)
        for alias, _, _ in aggs:
            if alias in df_out.columns and alias not in ordered:
                ordered.append(alias)
        df_out = df_out[[c for c in ordered if c in df_out.columns]]

    # ── SEM AGRUPAMENTO com colunas diretas → group_by implícito ──────────
    elif aggs and direct_cols:
        implicit_gb = [col for _, col in direct_cols if col in df.columns]
        if implicit_gb:
            # Converte colunas string para numérico antes do groupby (evita concatenação)
            for _, func, col in aggs:
                if col in df.columns and not pd.api.types.is_numeric_dtype(df[col]) and func in ("sum", "avg", "mean", "min", "max"):
                    df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

            g = df.groupby(implicit_gb, dropna=False)
            agg_dict: Dict[str, tuple] = {}
            for alias, func, col in aggs:
                if col not in df.columns:
                    continue
                pandas_func = "mean" if func == "avg" else func
                agg_dict[alias] = (col, pandas_func)
            if agg_dict:
                df_out = g.agg(**agg_dict).reset_index()
            else:
                df_out = g.size().reset_index(name="count")
            rename_map = {col: alias for alias, col in direct_cols if alias != col and col in df_out.columns}
            if rename_map:
                df_out = df_out.rename(columns=rename_map)
            ordered = []
            for alias, col in direct_cols:
                eff = alias if alias in df_out.columns else col
                if eff in df_out.columns and eff not in ordered:
                    ordered.append(eff)
            for alias, _, _ in aggs:
                if alias in df_out.columns and alias not in ordered:
                    ordered.append(alias)
            df_out = df_out[[c for c in ordered if c in df_out.columns]]
        else:
            row: Dict[str, Any] = {}
            for alias, func, col in aggs:
                if col not in df.columns:
                    row[alias] = None
                    continue
                s = df[col].dropna()
                if func == "sum" and (s.dtype == object or col in _STRING_COLS):
                    s = pd.to_numeric(s, errors="coerce").fillna(0)
                row[alias] = float(s.sum()) if func == "sum" else (
                    float(s.mean()) if func in ("avg", "mean") else (
                    _to_python(s.min()) if func == "min" else (
                    _to_python(s.max()) if func == "max" else int(s.count()))))
            df_out = pd.DataFrame([row])

    # ── SEM AGRUPAMENTO puro ──────────────────────────────────────────────
    elif aggs:
        row: Dict[str, Any] = {}
        for alias, func, col in aggs:
            if col not in df.columns:
                row[alias] = None
                continue
            s = df[col].dropna()
            if len(s) == 0:
                row[alias] = None
                continue
            if func == "sum":
                if s.dtype == object or col in _STRING_COLS:
                    s = pd.to_numeric(s, errors="coerce").fillna(0)
                row[alias] = float(s.sum())
            elif func in ("avg", "mean"):
                row[alias] = float(s.mean())
            elif func == "min":
                row[alias] = _to_python(s.min())
            elif func == "max":
                row[alias] = _to_python(s.max())
            elif func == "count":
                row[alias] = int(s.count())
            else:
                row[alias] = None
        df_out = pd.DataFrame([row])

    else:
        cols = [col for _, col in direct_cols if col in df.columns]
        df_out = df[cols].copy()
        rename_map = {
            col: alias for alias, col in direct_cols
            if alias != col and col in df_out.columns
        }
        if rename_map:
            df_out = df_out.rename(columns=rename_map)

    # ── ORDER BY ─────────────────────────────────────────────────────────────
    for order in plan.get("order_by", []):
        col = _strip_table(str(order.get("col", "")))
        asc = str(order.get("dir", "asc")).lower() == "asc"
        if col in df_out.columns:
            df_out = df_out.sort_values(by=col, ascending=asc, na_position="last")

    # ── LIMIT ────────────────────────────────────────────────────────────────
    limit = plan.get("limit", 200)
    df_out = df_out.head(limit)

    # ── SERIALIZAÇÃO ─────────────────────────────────────────────────────────
    df_out = _serialize_df(df_out)

    return {
        "columns": list(df_out.columns),
        "rows": df_out.to_dict(orient="records"),
        "row_count": int(len(df_out)),
    }


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

def _eval_where(df: pd.DataFrame, node: Dict[str, Any]) -> pd.Series:
    op = str(node.get("op", "")).lower()

    if op in ("and", "or"):
        args = node.get("args", [])
        if not args:
            return pd.Series([True] * len(df), index=df.index)
        masks = [_eval_where(df, a) for a in args]
        result = masks[0]
        for m in masks[1:]:
            result = (result & m) if op == "and" else (result | m)
        return result.fillna(False)

    return _eval_single(df, node)


def _eval_single(df: pd.DataFrame, node: Dict[str, Any]) -> pd.Series:
    op = str(node.get("op", "")).lower()
    col = _strip_table(str(node.get("left", "")))
    right = node.get("right")

    if col not in df.columns:
        print(f"[executor] Aviso: coluna '{col}' nao encontrada no DataFrame.")
        return pd.Series([True] * len(df), index=df.index)

    s = df[col]
    is_str_col = s.dtype == object or col in _STRING_COLS
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

def apply_formatting_rules(df: pd.DataFrame, formatting_rules: Dict[str, str]) -> pd.DataFrame:
    """
    Aplica as regras de formatação (formattingRules) especificadas pelo Agente 3/3.1
    sobre as colunas do DataFrame Pandas.
    """
    df = df.copy()
    for col, rule in formatting_rules.items():
        if col not in df.columns:
            continue

        rule_lower = str(rule).lower()

        # Se a regra menciona limpar moeda / R$ ou converter para número/float/int
        if any(keyword in rule_lower for keyword in ["r$", "moeda", "float", "int", "número", "numero", "decimal"]):
            s = df[col].astype(str)
            s = s.str.replace(r"[R$\s]", "", regex=True)
            s = s.str.replace(r"\.", "", regex=True)  # Remove ponto de milhar se houver
            s = s.str.replace(",", ".", regex=False)   # Troca vírgula por ponto decimal
            df[col] = pd.to_numeric(s, errors="coerce")

        # Se a regra menciona converter para data
        elif "data" in rule_lower or "date" in rule_lower:
            df[col] = pd.to_datetime(df[col], dayfirst=True, errors="coerce")

    return df


def execute_plan_with_formatting(
    plan: Dict[str, Any],
    tables: Dict[str, pd.DataFrame],
    formatting_rules: Dict[str, str] | None = None
) -> Dict[str, Any]:
    """
    Pré-processa as tabelas aplicando as regras de formatação (formattingRules)
    e executa o plano de consulta determinístico gerado pelo Agente A.
    """
    if not formatting_rules:
        return execute_plan(plan, tables)

    formatted_tables: Dict[str, pd.DataFrame] = {}
    for table_name, df in tables.items():
        formatted_tables[table_name] = apply_formatting_rules(df, formatting_rules)

    return execute_plan(plan, formatted_tables)

