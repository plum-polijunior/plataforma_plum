"""
Descrição de base para o Reconhecedor (A2) — o pedido `metadados`.

O A2 precisa responder *"que colunas importam para esta pergunta?"* sem que
nenhuma linha da base saia. Este módulo é o que ele recebe: por coluna, o papel,
quantos valores distintos existem, quanto está vazio e — só onde é seguro — o
mínimo e o máximo.

⭐ **`n_linhas ÷ distintos` responde o grão sem olhar dado nenhum.** É a razão de
`distintos` valer mais que uma amostra aqui: amostra aleatória pode, por azar,
não repetir data nenhuma e sugerir "uma linha por dia" numa base que tem
cinquenta; a razão nunca erra.

── ⚠️ POR QUE `min`/`max` NÃO SAEM PARA COLUNA DE TEXTO ────────────────────

Mínimo e máximo de uma coluna de texto **são valores literais da base** — o
primeiro e o último nome de cliente em ordem alfabética. É exatamente o
vazamento que o teto de cardinalidade fechou no B02, entregue por outra porta, e
por uma função que se apresenta como "descrição".

A única porta para valor de texto é o pedido `vocabulario` (B04), que tem teto de
cardinalidade e uma flag própria (`vocabulario_exposto`). Aqui, coluna de texto
recebe `None` — e continua útil, porque `distintos` e `nulos_pct` respondem quase
tudo que o A2 precisa saber sobre ela.

⭐ **Coluna sem papel declarado cai no dtype, não em `text`.** O papel vem do
`formatting_rule`, que é um conceito de *exibição*: `TYPE_TO_ROLE` manda tudo que
o Agente 3 não classificou para `text`, inclusive coluna de número. Aplicar isso
aqui esconderia o mínimo e o máximo justamente das colunas numéricas da **base
suja** — que é onde o A2 mais precisa deles.

⚠️ **Mas papel declarado sempre vence.** `documento_cpf_cnpj` é `text` mesmo
guardado como número na planilha; se o dtype decidisse por cima da declaração, o
mínimo e o máximo de uma coluna de CPF sairiam daqui. O dtype só é consultado
quando **não há** classificação nenhuma.

── ⚠️ "ZERO LINHAS EXPOSTAS" É QUASE VERDADE, NÃO VERDADE ──────────────────

O `min`/`max` de uma coluna numérica ou de data **são valores reais da base**,
um por coluna. É o que uma descrição de base é, e o V7 conta com isso para o A2
saber o período coberto. Mas está escrito aqui para ninguém repetir a frase
"metadados não expõe nada" achando que é literal.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, Optional

import pandas as pd


# Papéis em que `min`/`max` são medida, não identidade. Ver o cabeçalho.
_PAPEIS_COM_EXTREMOS = frozenset({"number", "percent", "date", "ano"})


def _papel_por_dtype(serie: pd.Series) -> str:
    """
    Papel deduzido do dado, para coluna que ninguém classificou.

    Conservador por construção: só `datetime` e numérico saem de `text`, e é
    `text` que fecha a porta dos extremos.
    """
    if pd.api.types.is_datetime64_any_dtype(serie):
        return "date"
    if pd.api.types.is_numeric_dtype(serie):
        return "number"
    return "text"


def _extremos(serie: pd.Series, papel: str) -> tuple:
    """`(min, max)` já serializados, ou `(None, None)` quando não é seguro."""
    if papel not in _PAPEIS_COM_EXTREMOS:
        return None, None

    limpa = serie.dropna()
    if limpa.empty:
        return None, None

    if pd.api.types.is_datetime64_any_dtype(limpa):
        # Mesmo formato do `_serialize_df` do executor: quem lê os dois é o
        # mesmo agente, e duas grafias de data no mesmo prompt é ruído.
        return limpa.min().strftime("%d/%m/%Y"), limpa.max().strftime("%d/%m/%Y")

    if not pd.api.types.is_numeric_dtype(limpa):
        # Papel diz número, dtype diz outra coisa — a coluna não foi tipada. Sem
        # coerção aqui: `to_numeric(errors="coerce")` inventaria um mínimo a
        # partir das linhas que por acaso pareciam número, e uma descrição de
        # base errada é pior que uma incompleta.
        return None, None

    return float(limpa.min()), float(limpa.max())


def _vazios_pct(serie: pd.Series) -> float:
    """
    Percentual de células sem informação — `NaN` **e** string vazia.

    ⚠️ Contar só `isna()` erraria justamente o caso que o A2 precisa enxergar:
    o Google Sheets entrega célula em branco como `""`, não como nulo, então uma
    coluna preenchida só a partir de certo mês apareceria com 0% de vazio.
    """
    if len(serie) == 0:
        return 0.0

    vazios = serie.isna()
    if serie.dtype == object:
        vazios = vazios | serie.astype(str).str.strip().eq("")

    return round(float(vazios.mean()) * 100, 1)


def descrever(
    df: pd.DataFrame,
    colunas: Iterable[str],
    roles: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    Descreve as colunas pedidas. Não recebe Query Plan — não há o que planejar.

    `colunas` são as `resolved_columns` do pedido, já conferidas contra o
    `allowed_columns` pelo `main.py`. Coluna pedida que não existe na planilha
    entra com `existe: false` em vez de sumir: o A2 precisa saber que perguntou
    por algo que não está lá, senão presume ausência de dado onde há erro de nome.
    """
    roles = {k: str(v).lower() for k, v in (roles or {}).items()}
    n_linhas = int(len(df))

    out: Dict[str, Any] = {}
    for col in sorted(set(colunas)):
        if col not in df.columns:
            out[col] = {"existe": False}
            continue

        serie = df[col]
        # Declarado vence; sem declaração, o dtype. Ver o cabeçalho.
        papel = roles.get(col) or _papel_por_dtype(serie)
        distintos = int(serie.nunique(dropna=True))
        minimo, maximo = _extremos(serie, papel)

        out[col] = {
            "existe": True,
            "papel": papel,
            "distintos": distintos,
            "vazios_pct": _vazios_pct(serie),
            "min": minimo,
            "max": maximo,
            # ⭐ O grão. `None` quando não há valor distinto nenhum (base vazia
            # ou coluna toda nula) — dividir por zero aqui devolveria `inf`, que
            # o JSON não representa e o agente leria como número.
            "linhas_por_valor": round(n_linhas / distintos, 2) if distintos else None,
        }

    return {"n_linhas": n_linhas, "colunas": out}
