"""
`registro` e `amostra` — os ÚNICOS pedidos que devolvem linha sem agregação.

⚠️⚠️ **Este arquivo é a exceção ao P1.3, e existe separado por isso.**

O invariante do executor é *"só sai daqui vetor agregado"*, e ele vale sem
exceção em `pandas_executor.py`. Aqui não vale — de propósito, e é o desenho do
V7 §3: concentrar a violação num arquivo só faz com que **toda a discussão de
privacidade caiba num diff**, e a revisão de PR passe a ter resposta binária
("mexeu em `linhas.py`?") em vez de exigir leitura de tudo.

⭐ Se algum dia alguém precisar devolver linha bruta de outro jeito, o certo é
trazer para cá, não abrir uma segunda porta.

── AS TRÊS TRAVAS, E NENHUMA É OPCIONAL ─────────────────────────────────────

1. **Teto por pedido: 5 linhas.** Aplicado aqui.
2. **Orçamento por janela: 200 linhas.** Aplicado na Edge Function, ANTES de
   chegar aqui — só ela sabe quanto o usuário já gastou.
   ⚠️ O teto por pedido sozinho não protege nada: 200 pedidos de 5 linhas é a
   base inteira sem violar teto nenhum. É o erro fácil, e o orçamento existe
   exatamente para ele.
3. **Colunas: as do `allowed_columns`.** A barreira 4 do `main.py` já conferiu
   antes de a planilha ser lida; aqui a lista que chega já está filtrada.

── POR QUE `registro` EXIGE FILTRO ──────────────────────────────────────────

Sem `where`, "me dá 5 registros" é **amostra**, e amostra tem outro nome e outra
semântica. A diferença não é burocracia: `registro` é o usuário dizendo *"quero
ver ESTA linha"*, com um critério que ele consegue justificar; `amostra` é *"me
mostra como a base é"*. Deixar `registro` sem filtro apagaria a distinção e daria
um jeito educado de paginar a base.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

import pandas as pd

from query_engine.pandas_executor import ExecutorError, _eval_where, _serialize_df

# ⚠️ Cinco. O número vem do V7 §3 e não é negociável por pedido — o que se
# negocia é o orçamento da janela, que é onde a conta realmente fecha.
TETO_POR_PEDIDO = 5


def _saida(df: pd.DataFrame, colunas: Sequence[str], tipo: str) -> Dict[str, Any]:
    """Recorta, corta no teto e serializa. Caminho único para os dois tipos."""
    presentes = [c for c in colunas if c in df.columns]
    recorte = _serialize_df(df[presentes].head(TETO_POR_PEDIDO).copy())

    return {
        "tipo": tipo,
        "columns": list(recorte.columns),
        "rows": recorte.to_dict(orient="records"),
        # ⭐ O que o orçamento debita. Sai daqui e não do `len(rows)` do
        # chamador, porque é este arquivo que sabe o que foi entregue de fato.
        "linhas_brutas_entregues": int(len(recorte)),
    }


def registro(
    df: pd.DataFrame,
    colunas: Sequence[str],
    where: Optional[Dict[str, Any]],
    roles: Dict[str, str],
) -> Dict[str, Any]:
    """
    Linhas identificadas por um filtro explícito. Máximo 5.

    ⚠️ `where` é obrigatório — ver o cabeçalho. Sem ele isto vira paginação da
    base com outro nome.
    """
    if not where or not isinstance(where, dict):
        raise ExecutorError(
            "'registro' exige um filtro que identifique as linhas pedidas. Sem "
            "filtro, o que voce quer e uma amostra — peca 'amostra'."
        )

    mascara = _eval_where(df, where, roles)
    return _saida(df[mascara], colunas, "registro")


def amostra(
    df: pd.DataFrame,
    colunas: Sequence[str],
    semente: int,
) -> Dict[str, Any]:
    """
    Até 5 linhas quaisquer, para entender a FORMA da base.

    ⭐ **Semente determinística, nunca aleatório puro.** A mesma base tem de
    produzir a mesma amostra, senão o mesmo par (pergunta, base) gera planos
    diferentes em execuções diferentes — e reprodutibilidade é metade da razão
    de o planejador existir. "Por que hoje deu outro número?" precisa ter
    resposta.

    ⚠️ A semente vem do chamador e inclui o tamanho da base: base que mudou
    devolve amostra nova, que é o comportamento desejado — uma amostra congelada
    de uma base que cresceu descreveria o passado.
    """
    if df.empty:
        return _saida(df, colunas, "amostra")

    quantas = min(TETO_POR_PEDIDO, len(df))
    # `random_state` aceita int; o chamador já reduziu a semente a um inteiro
    # estável. `sample` sem reposição preserva as linhas como estão.
    sorteadas = df.sample(n=quantas, random_state=semente % (2**32))
    return _saida(sorteadas, colunas, "amostra")


def semente_de(dataset_id: str, linhas: int) -> int:
    """
    Semente estável para `amostra`, a partir da base e do tamanho dela.

    ⚠️ **Não usa `hash()` do Python.** Ele é aleatorizado por processo desde o
    3.3 (`PYTHONHASHSEED`), então a "semente determinística" mudaria a cada cold
    start do Lambda — determinismo que só vale dentro de uma invocação não é
    determinismo. Soma de bytes é feia e é estável.
    """
    return (sum(dataset_id.encode()) * 31 + linhas) % (2**31)


def tipos_que_consomem_orcamento() -> List[str]:
    """
    ⭐ A lista canônica, e o motivo de ela ser função em vez de constante solta:
    o orçamento do B10 e o executor precisam concordar, e um `if tipo ==` espalhado
    é como divergem.

    `agregado`, `serie`, `metadados` e `vocabulario` NÃO consomem — nenhum deles
    devolve linha, e cobrar por eles empurraria o planejador a agregar menos.
    """
    return ["registro", "amostra"]
