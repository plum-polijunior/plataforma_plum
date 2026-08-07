"""
Executor de cálculos do Agente A.

Motorista Cego: não recebe a pergunta do usuário e não conhece a intenção de
negócio. Lê apenas o Query Plan JSON e os dados das colunas que o plano pede.

Invariantes de privacidade que este módulo garante (design doc, premissas P1/P3):

  P1.3  Só sai daqui vetor agregado. Um plano sem agregação devolveria linhas
        brutas, então ele é recusado quando k_min > 0.
  P3    Todo grupo do resultado tem no mínimo k_min linhas de origem. Grupos
        abaixo do limiar são suprimidos ANTES de o vetor sair, e a contagem de
        suprimidos volta no retorno para a interface poder explicar o buraco.

Os papéis das colunas (percentual, texto, data) chegam por parâmetro, derivados
do schema_metadata do tenant. Não existe constante global de coluna aqui: cada
cliente nomeia as colunas do jeito dele.
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Set

import re
import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)


# Mínimo de linhas por grupo para o resultado poder sair. Ver P3.
DEFAULT_K_MIN = 5


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
    k_min: int = DEFAULT_K_MIN,
    max_rows: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Executa um Query Plan e devolve um vetor agregado.

    column_roles: {coluna: 'percent'|'text'|'date'|'number'}, derivado do
        schema_metadata do tenant. Substitui as antigas constantes globais.
    k_min: mínimo de linhas por grupo. 0 desliga a proteção (só para uso
        interno em teste; o caminho de produção nunca passa 0).
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
        if k_min > 0:
            raise RawRowsBlocked(
                "Plano sem 'select' devolveria linhas brutas da base."
            )
        df_out = _serialize_df(df.head(50).copy())
        return {
            "columns": list(df_out.columns),
            "rows": df_out.to_dict(orient="records"),
            "row_count": len(df),
            "suppressed_groups": 0,
        }

    direct_cols: list = []   # (alias, raw_col)
    aggs: list = []          # (alias, func, raw_col)

    for item in select_items:
        expr = item.get("expr")
        alias = item.get("as")
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
    if not aggs and k_min > 0:
        raise RawRowsBlocked(
            "Plano sem agregacao devolveria linhas brutas. Todo card precisa "
            "de pelo menos uma funcao de agregacao (sum, avg, min, max, count)."
        )

    suppressed_groups = 0
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

    if gb_cols:
        df_out, suppressed_groups = _grouped_agg(
            df, gb_cols, aggs, direct_cols, roles, k_min
        )
    elif direct_cols and implicit_gb:
        df_out, suppressed_groups = _grouped_agg(
            df, implicit_gb, aggs, direct_cols, roles, k_min
        )
    else:
        # ── AGREGADO ÚNICO sobre a base filtrada ──────────────────────────
        # Um número só. O "grupo" aqui é a base inteira depois do where, então
        # o teste de k é sobre len(df).
        if k_min > 0 and len(df) < k_min:
            logger.info(
                "Agregado unico suprimido: %d linhas, minimo e %d.", len(df), k_min
            )
            return {
                "columns": [], "rows": [], "row_count": 0,
                "suppressed_groups": 1,
            }
        row: Dict[str, Any] = {}
        for alias, func, col in aggs:
            row[alias] = _scalar_agg(df, func, col, roles)
        df_out = pd.DataFrame([row])

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
        "suppressed_groups": int(suppressed_groups),
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
    k_min: int,
):
    """
    Agrupa, agrega e aplica k-anonimato.

    Devolve (df_out, suppressed_groups). Grupos com menos de k_min linhas de
    origem são removidos ANTES de o vetor sair. Ver P3: `SUM(salario) GROUP BY
    funcionario` numa base com uma linha por pessoa é a folha de pagamento
    vestida de agregado.
    """
    missing = [c for c in gb_cols if c not in df.columns]
    if missing:
        raise MissingColumnError(
            f"Coluna(s) de agrupamento nao encontrada(s): {', '.join(missing)}."
        )

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

    # ── k-anonimato ──────────────────────────────────────────────────────────
    suppressed = 0
    if k_min > 0:
        sizes = g.size().reset_index(name="__k")
        before = len(df_out)
        df_out = df_out.merge(sizes, on=gb_cols, how="left")
        df_out = df_out[df_out["__k"] >= k_min].drop(columns="__k")
        suppressed = before - len(df_out)
        if suppressed:
            logger.info(
                "k-anonimato: %d de %d grupos suprimidos (minimo %d linhas).",
                suppressed, before, k_min,
            )

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

    return df_out[[c for c in ordered if c in df_out.columns]], suppressed


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


def roles_from_formatting_rules(formatting_rules: Dict[str, str]) -> Dict[str, str]:
    """
    Deriva o papel de cada coluna a partir da `cleaning_rule` que o Agente 3
    escreveu no onboarding e que já vive em `schema_metadata`.

    É daqui que sai o `column_roles` do executor. A alternativa antiga era uma
    constante global no módulo, que não funciona em multitenant: a coluna de
    percentual da Poli Júnior tem um nome e a do laticínio tem outro.
    """
    roles: Dict[str, str] = {}
    for col, rule in (formatting_rules or {}).items():
        r = str(rule).lower()
        if any(k in r for k in ("percent", "porcent", "%", "taxa")):
            roles[col] = "percent"
        elif "data" in r or "date" in r:
            roles[col] = "date"
        elif any(k in r for k in ("r$", "moeda", "float", "int", "numero",
                                  "número", "decimal")):
            roles[col] = "number"
        else:
            roles[col] = "text"
    return roles


def execute_plan_with_formatting(
    plan: Dict[str, Any],
    tables: Dict[str, pd.DataFrame],
    formatting_rules: Dict[str, str] | None = None,
    *,
    column_roles: Optional[Dict[str, str]] = None,
    k_min: int = DEFAULT_K_MIN,
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
            plan, tables, column_roles=roles, k_min=k_min, max_rows=max_rows
        )

    formatted_tables: Dict[str, pd.DataFrame] = {}
    for table_name, df in tables.items():
        formatted_tables[table_name] = apply_formatting_rules(df, formatting_rules)

    return execute_plan(
        plan, formatted_tables, column_roles=roles, k_min=k_min, max_rows=max_rows
    )

