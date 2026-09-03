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

from typing import Any, Callable, Collection, Dict, Optional, Set

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


class TabelaNaoEncontradaError(ExecutorError):
    """
    O `from` do plano nomeia uma tabela que não veio no payload.

    ⭐ **Era um `{"error": ...}` de retorno até 2026-08-27, e a diferença
    importa.** Todo o resto deste módulo levanta — `MissingColumnError`,
    `RawRowsBlocked`, `RowLimitExceeded`. Este caso destoava porque, com **uma**
    tabela só, ele nunca acontecia: o `main.py` sobrescrevia `plano["from"]` e o
    nome do plano era irrelevante.

    ⚠️ Com multi-base isso vira o modo de falha mais provável — o planejador
    escrevendo o nome errado da planilha. E um dicionário de retorno com `error`
    dentro chega ao card como **card vazio, em silêncio**, enquanto uma exceção
    nomeada aparece no log e na tela. Ver `20-pendencias.md` T8.
    """


class RawRowsBlocked(ExecutorError):
    """Plano sem agregação: devolveria linha bruta. Viola P1.3."""


class RowLimitExceeded(ExecutorError):
    """A base carregada passou do teto de linhas da organização."""


class CardinalidadeExcedida(ExecutorError):
    """
    O agrupamento devolveria valores literais demais de uma coluna de texto.

    Mesma família do `RawRowsBlocked`, e existe porque o P1.3 tinha um furo de
    forma: ele verifica que **existe** agregação, não que o resultado agrega.
    `group_by [cliente] + count` passa pelo P1.3 e devolve a carteira inteira,
    um nome por linha — que é exatamente a linha bruta que o P1.3 recusa,
    entregue por outra porta.
    """


# ─────────────────────────────────────────────────────────────────────────────
# Redutora × seletora — classificação por comportamento
# ─────────────────────────────────────────────────────────────────────────────
#
# ⚠️ Não é whitelist (`contexto/30-decisoes.md`, V6 decisão 4). O `agg` continua
# indo direto para o pandas; esta tabela só diz o que cada função FAZ com os
# valores, para o motor saber quando um resultado carrega literal da base.
#
#   Redutora   devolve um número novo, calculado. Nenhum valor da base sai.
#   Seletora   devolve um valor que EXISTE numa linha. Sobre coluna de texto,
#              isso é um literal da base (nome de cliente, CPF, endereço).
#
# ⚠️ Hoje, no caminho agrupado, `min`/`max` sobre texto NÃO devolvem o literal:
# `_coerce_numeric_for_agg` converte a coluna e o resultado sai `0`. Isso não é
# proteção, é resposta errada em silêncio — está registrado como pendência
# separada, e consertar aquilo sem esta tabela existir só aumentaria o
# vazamento. A classificação é escrita para o comportamento correto, não para o
# atual.
AGREGACOES_REDUTORAS: frozenset = frozenset(
    {"sum", "avg", "mean", "count", "std", "median", "var", "quantile"}
)

# ⚠️ Exigem numero de verdade. As NOVAS (B09) recusam coluna de texto em vez de
# coagir — media de zeros forjados ja e ruim, mediana de zeros forjados e ruido
# puro. As antigas (`sum`, `avg`, `min`, `max`) continuam coagindo via
# `_coerce_numeric_for_agg`: mudar aquilo agora alteraria o resultado de cards
# que existem, e a divida irma esta registrada como C10 em 20-pendencias.
AGREGACOES_QUE_EXIGEM_NUMERO: frozenset = frozenset(
    {"std", "median", "var", "quantile"}
)


AGREGACOES_SELETORAS: frozenset = frozenset(
    {"min", "max", "first", "last", "nunique"}
)

# Tudo que o executor sabe fazer. `_scalar_agg` levanta para o que estiver fora.
AGREGACOES_CONHECIDAS: frozenset = AGREGACOES_REDUTORAS | AGREGACOES_SELETORAS

# ⭐ Um teto, dois consumidores. É o mesmo número que o pedido `vocabulario`
# (B04) usa como limite de cardinalidade: acima disto a coluna é identificador,
# não categoria, e listá-la é entregar a base. Mudar aqui muda os dois de uma
# vez, que é o ponto.
TETO_DE_CARDINALIDADE = 200

# ⚠️ O `limit` do plano nunca teve teto: o código era `plan.get("limit", 200)`
# seguido de `head(limit)`, e a gramática documentada (`1..500`) não era
# aplicada em lugar nenhum. `limit: 50000` sobre um `group_by` de texto entrega
# a base inteira sem violar regra nenhuma.
LIMIT_PADRAO = 200
LIMIT_MAXIMO = 500

# Prefixo estável dos avisos do modo observação, para dar `grep` no CloudWatch.
_AVISO = "[adhoc-observacao]"


def _roles(column_roles: Optional[Dict[str, str]]) -> Dict[str, str]:
    return {k: str(v).lower() for k, v in (column_roles or {}).items()}


def classificar_agregacao(func: str) -> str:
    """`'redutora'`, `'seletora'` ou `'desconhecida'`."""
    f = str(func).lower()
    if f in AGREGACOES_REDUTORAS:
        return "redutora"
    if f in AGREGACOES_SELETORAS:
        return "seletora"
    return "desconhecida"


def _parametros_da_agregacao(func: str, expr: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extrai e VALIDA os parametros da agregacao. Hoje so o `p` do `quantile`.

    ⭐ `quantile` sem `p` e ERRO, nunca 0.5. O `.agg("quantile")` do pandas
    devolve a MEDIANA em silencio: "percentil 90" viraria "percentil 50" e nada
    avisaria. Assumir um default aqui seria reintroduzir esse comportamento com
    a nossa assinatura, que e pior que nao ter a funcao.
    """
    if func != "quantile":
        return {}

    bruto = expr.get("p")
    try:
        p = float(bruto)
    except (TypeError, ValueError):
        raise ExecutorError(
            "'quantile' exige o parametro 'p' entre 0 e 1 — por exemplo "
            "{\"agg\": \"quantile\", \"p\": 0.9, \"col\": \"receita\"} para o "
            f"percentil 90. Recebido: {bruto!r}."
        ) from None

    if not (0 < p < 1):
        raise ExecutorError(
            f"'quantile' com p={p} nao faz sentido: p tem de estar entre 0 e 1 "
            f"(exclusive). Para o percentil 90 use p=0.9."
        )
    return {"p": p}


def _seletoras_de_texto(aggs: list, roles: Dict[str, str]) -> list:
    """Aliases cuja agregação é seletora sobre coluna de papel `text`."""
    return sorted(
        alias
        for alias, func, col, _params in aggs
        if classificar_agregacao(func) == "seletora" and _is_text(col, roles)
    )


def _conferir_cardinalidade(
    df_out: pd.DataFrame,
    colunas_grupo: list,
    roles: Dict[str, str],
    *,
    aplicar: bool,
) -> Dict[str, int]:
    """
    Conta os literais de texto que o agrupamento entregaria, e decide.

    `colunas_grupo` são pares `(nome_na_saida, nome_de_origem)`: o papel vem do
    nome de origem, a contagem vem da coluna que de fato saiu — `_grouped_agg`
    renomeia coluna direta que tenha alias, e olhar só um dos dois nomes deixa
    metade dos casos passar.

    ⚠️ **A conta é feita ANTES do `limit`.** Cortar em 500 não é proteção: 500
    nomes de cliente continuam sendo 500 nomes de cliente. O que interessa é
    quantos valores distintos o recorte alcança, não quantos couberam.

    ⭐ **O teto é por coluna, não sobre `len(df_out)`.** Agrupar cidade (150) por
    mês (12) dá 1.800 linhas e ainda assim expõe 150 literais — o volume é
    problema do `limit`, a exposição é problema deste teto. Misturar os dois
    recusaria consulta legítima e deixaria o vazamento de pé.

    Devolve `{coluna: distintos}` das colunas de texto agrupadas: é o que o
    orçamento do B10 vai debitar. Só levanta quando `aplicar`; no caminho legado
    apenas registra — ver o modo observação no `DIARIO.md` do B02.
    """
    de_texto = {
        saida: int(df_out[saida].nunique())
        for saida, origem in colunas_grupo
        if saida in df_out.columns and _is_text(origem, roles)
    }
    if not de_texto:
        return {}

    estourou = [c for c, n in de_texto.items() if n > TETO_DE_CARDINALIDADE]
    if not estourou:
        return de_texto

    detalhe = ", ".join(f"'{c}' ({de_texto[c]} valores)" for c in estourou)

    if not aplicar:
        logger.warning(
            "%s agrupamento por %s seria recusado no caminho ad_hoc.",
            _AVISO, detalhe,
        )
        return de_texto

    raise CardinalidadeExcedida(
        f"Agrupar por {detalhe} devolveria os valores da coluna um a um, que e "
        f"a linha bruta que o executor nao entrega. O teto e "
        f"{TETO_DE_CARDINALIDADE} valores distintos por coluna de texto — "
        f"acima disso a coluna e identificador, nao categoria."
    )


def _limite_de_saida(plan: Dict[str, Any]) -> int:
    """
    O `limit` do plano, preso entre 1 e `LIMIT_MAXIMO`.

    Vale para os dois caminhos, e é o único item do B02 que vale: `limit` acima
    de 500 não é comportamento de card nenhum que exista, e a gramática já
    documentava `1..500` sem que nada aplicasse.
    """
    try:
        pedido = int(plan.get("limit", LIMIT_PADRAO))
    except (TypeError, ValueError):
        logger.warning(
            "limit '%r' nao e inteiro; usando %d.",
            plan.get("limit"), LIMIT_PADRAO,
        )
        return LIMIT_PADRAO

    preso = max(1, min(pedido, LIMIT_MAXIMO))
    if preso != pedido:
        logger.warning("limit %d fora de 1..%d; usando %d.",
                       pedido, LIMIT_MAXIMO, preso)
    return preso


def _is_percent(col: str, roles: Dict[str, str]) -> bool:
    return roles.get(col) == "percent"


def _is_text(col: str, roles: Dict[str, str]) -> bool:
    return roles.get(col) == "text"


def _is_ano(col: str, roles: Dict[str, str]) -> bool:
    return roles.get(col) == "ano"


# ─────────────────────────────────────────────────────────────────────────────
# Expressão aritmética derivada (linha a linha, antes da agregação)
# ─────────────────────────────────────────────────────────────────────────────

# Fechado de propósito: sem `eval`, sem operador que o Agente A possa inventar.
_OPS_ARITMETICOS = ("mul", "add", "sub", "div")

# Operadores que exigem exatamente dois operandos. `mul`/`add` são associativos,
# então aceitam N; `sub`/`div` não são — `a - b - c` depende da ordem e um plano
# com três operandos aqui é ambíguo o bastante para recusar.
_OPS_BINARIOS = ("sub", "div")

# Prefixo da coluna materializada. Não pode colidir com coluna de planilha:
# `normalizar_coluna` (sheets.py) termina em `.strip("_")`, então nenhum
# cabeçalho, por mais estranho que seja, produz um nome começando com "_".
_PREFIXO_DERIVADA = "__expr_"


def _eh_no_aritmetico(no: object) -> bool:
    return isinstance(no, dict) and str(no.get("op", "")).lower() in _OPS_ARITMETICOS


def _colunas_da_expressao(no: object, _profundidade: int = 0) -> list:
    """
    Nomes de coluna citados por uma expressão, em ordem, sem repetir.

    Espelha `walkArithmetic` (`_shared/query_plan.ts`). O que este lado recolhe
    tem que ser subconjunto do que aquele lado autorizou — se aqui aparecesse
    uma coluna que lá não apareceu, ela simplesmente não teria sido carregada e
    viraria MissingColumnError, que é o comportamento correto e barulhento.
    """
    if _profundidade > 32 or not isinstance(no, dict):
        return []
    fora: list = []
    for arg in no.get("args") or []:
        if isinstance(arg, dict):
            achadas = _colunas_da_expressao(arg, _profundidade + 1)
        elif isinstance(arg, str):
            achadas = [_strip_table(arg.strip())] if arg.strip() else []
        else:
            achadas = []  # literal numérico: não é coluna
        for c in achadas:
            if c not in fora:
                fora.append(c)
    return fora


def _como_numero(s: pd.Series) -> pd.Series:
    """
    Uma série como número, para entrar numa conta. ⭐ **O único conversor.**

    No caminho normal a coluna já chega tipada: `apply_formatting_rules` roda
    antes do executor e converte pelo `type` do Agente 3. O fallback com
    `_parse_ptbr_number` cobre a coluna que ficou em `type: "nenhuma"` e chegou
    como texto — sem ele, "R$ 57,50" viraria NaN e a receita daria zero.

    ── ⛔ NaN NÃO VIRA 0, E ISSO VALE PARA TODAS AS AGREGAÇÕES ────────────────

    Numa **soma** o pandas já ignora NaN, que dá no mesmo que somar zero — é o
    único caso em que `fillna(0)` seria inofensivo. Nos outros ele mente:

    | agregação | com `fillna(0)` |
    |---|---|
    | `avg` | ⛔ o zero entra no DENOMINADOR e puxa a média para baixo |
    | `min` | ⛔ vira `0` — *"a menor venda foi R$ 0,00"* |
    | `max` | ⛔ vira `0` quando todos os valores são negativos |

    ⚠️ **Esta regra estava escrita aqui e desobedecida a dois arquivos de
    distância.** Até 2026-08-31 só o caminho das expressões aritméticas a
    seguia; `_scalar_agg` e `_coerce_numeric_for_agg` faziam
    `pd.to_numeric(...).fillna(0)` por conta própria — e com o parser fraco, que
    transforma "R$ 57,50" em NaN e depois em zero. A mesma coluna dava resultados
    diferentes conforme a pergunta pedisse `sum(qtd*preco)` ou `sum(receita)`.

    ⚠️ **Data não é número.** `datetime64` não é `is_numeric_dtype`, então sem a
    guarda abaixo uma coluna de data cairia no parser de texto e viraria lixo —
    e `min(data_venda)` devolveria um inteiro de nanossegundos ou zero.
    """
    if pd.api.types.is_numeric_dtype(s):
        return s.astype("float64")
    if pd.api.types.is_datetime64_any_dtype(s):
        return s
    return _parse_ptbr_number(s)


def _serie_numerica(df: pd.DataFrame, col: str) -> pd.Series:
    """A coluna como número. Ver `_como_numero`, que é onde mora a regra."""
    return _como_numero(df[col])


def _avaliar_expressao(
    no: object, df: pd.DataFrame, roles: Dict[str, str], _profundidade: int = 0
) -> pd.Series:
    """
    Calcula a expressão linha a linha e devolve a série resultante.

    É este passo que faltava para responder "quanto de dinheiro entrou": receita
    é `soma(quantidade × preço)`, e o `×` acontece POR LINHA, antes da soma.
    `soma(quantidade) × média(preço)` só coincide com isso quando todos os preços
    são iguais — em qualquer planilha real, não são.
    """
    if _profundidade > 32:
        raise ExecutorError("Expressao aritmetica aninhada demais.")
    if not isinstance(no, dict):
        raise ExecutorError(
            f"Expressao aritmetica invalida: esperava objeto, veio {type(no).__name__}."
        )

    op = str(no.get("op", "")).lower()
    if op not in _OPS_ARITMETICOS:
        raise ExecutorError(
            f"Operador aritmetico nao suportado: '{op}'. "
            f"Aceitos: {', '.join(_OPS_ARITMETICOS)}."
        )

    args = no.get("args") or []
    if not isinstance(args, list) or len(args) < 2:
        raise ExecutorError(
            f"Operador '{op}' precisa de pelo menos dois operandos."
        )
    if op in _OPS_BINARIOS and len(args) != 2:
        raise ExecutorError(
            f"Operador '{op}' aceita exatamente dois operandos, veio {len(args)}. "
            f"A ordem de '{op}' muda o resultado, entao encadear e ambiguo."
        )

    series: list = []
    for arg in args:
        if isinstance(arg, dict):
            series.append(_avaliar_expressao(arg, df, roles, _profundidade + 1))
        elif isinstance(arg, (int, float)) and not isinstance(arg, bool):
            # Literal: mesma constante em toda linha (ex.: preco * 0.9).
            series.append(pd.Series(float(arg), index=df.index))
        elif isinstance(arg, str):
            col = _strip_table(arg.strip())
            if not col:
                raise ExecutorError(f"Operando vazio em '{op}'.")
            if col not in df.columns:
                raise MissingColumnError(
                    f"Coluna '{col}' usada em calculo nao existe nos dados."
                )
            # Ano é dimensão, não medida — pelo mesmo motivo que sum/avg sobre
            # ano é recusado logo abaixo. Multiplicar por 2026 produz um número
            # que o pandas calcula sem reclamar e que não significa nada.
            if _is_ano(col, roles):
                raise ExecutorError(
                    f"A coluna de ano '{col}' nao pode entrar num calculo: "
                    f"ano serve para agrupar ou filtrar, nao para multiplicar."
                )
            if _is_text(col, roles):
                raise ExecutorError(
                    f"A coluna '{col}' e de texto e nao pode entrar num calculo."
                )
            series.append(_serie_numerica(df, col))
        else:
            raise ExecutorError(
                f"Operando invalido em '{op}': {type(arg).__name__}. "
                f"Esperava nome de coluna, numero ou outra expressao."
            )

    acc = series[0]
    for outra in series[1:]:
        if op == "mul":
            acc = acc * outra
        elif op == "add":
            acc = acc + outra
        elif op == "sub":
            acc = acc - outra
        else:  # div
            # Divisão por zero em pandas devolve ±inf, e `inf` não é JSON
            # válido: viraria `Infinity` no corpo da resposta e quebraria o
            # parse do outro lado. Vira NaN, que as agregações já ignoram.
            acc = acc / outra.replace(0, np.nan)

    return acc.replace([np.inf, -np.inf], np.nan)


# ─────────────────────────────────────────────────────────────────────────────
# Agrupamento: validação de tipo do `group_by` e truncamento por período
# ─────────────────────────────────────────────────────────────────────────────

# Os quatro truncamentos aceitos (decisão D2 da Fase 5b). Fechado de propósito,
# como `_OPS_ARITMETICOS`: nada que o agente possa inventar entra aqui.
#
# `day` NÃO está na lista, e a ausência é deliberada: agrupar pela coluna de data
# crua já agrupa por dia, e os dois rótulos DIVERGIRIAM — `_serialize_df` render-
# iza datetime como `%d/%m/%Y` ("05/01/2026") e um período `day` sairia
# "2026-01-05". Duas formas de pedir a mesma coisa com duas respostas na tela.
_TRUNC_PARA_PERIODO = {
    "week": "W",
    "month": "M",
    "quarter": "Q",
    "year": "Y",
}

# Rótulo das linhas cuja data não pôde ser lida (decisão D6).
#
# `groupby(dropna=False)` MANTÉM o grupo nulo, e é isso que queremos: descartar
# essas linhas faria o total do gráfico não fechar com o total da base, em
# silêncio — o mesmo erro que `_grouped_agg` se recusa a cometer com coluna
# ausente. O que não pode é o rótulo vazar como "NaT"/"nan", que é representação
# interna do pandas chegando ao usuário final.
_SEM_DATA = "Sem data"


def _colunas_de_group_by(group_by_raw: object) -> list:
    """
    Os pares `(coluna, trunc)` de `group_by`, validando o TIPO de cada item.

    `trunc` é `None` na forma antiga (item string) e um dos `_TRUNC_PARA_PERIODO`
    na forma objeto. Duas formas aceitas:

        "data_da_venda"                              -> ("data_da_venda", None)
        {"col": "data_da_venda", "trunc": "month"}   -> ("data_da_venda", "month")
        {"col": "regiao"}                            -> ("regiao", None)

    A validação de tipo existe porque item de tipo inesperado não estourava aqui
    — ele ATRAVESSAVA. `_strip_table({...})` devolve o dict intacto, porque
    `"." in dict` testa as *chaves* do dict e dá False. O erro só aparecia lá
    embaixo, em `_grouped_agg`, no `c not in df.columns` →
    `pandas.Index.__contains__` → `hash(dict)` → `TypeError: unhashable type`.

    E `TypeError` não é `ExecutorError`. Ele escapava do `except` do `main.py` —
    e não só do `except`: escapava do LAÇO `for pedido in aprovados`. Ou seja,
    não derrubava um card, derrubava a resposta do lote inteiro, e o
    `dashboard-execute` (`if (!resp.ok) throw`) degradava TODOS os cards do
    dataset para `stale`. Isso contradiz a promessa do docstring do `main.py`:
    "Um card ruim não pode derrubar o dashboard inteiro."

    É a quarta ocorrência do mesmo padrão que `select`, `order_by` e `where` já
    tratam neste arquivo, e a de maior alcance das quatro. A trava entrou no PR 1
    da Fase 5b, um PR antes de a forma objeto passar a ser aceita — fechadura
    antes de abrir a porta.
    """
    if group_by_raw is None:
        return []

    # O container também precisa de trava: `group_by: "regiao"` iterava os
    # CARACTERES ('r', 'e', 'g', ...) e virava MissingColumnError sobre um nome
    # sem sentido; `group_by: 123` não é iterável e virava outro TypeError → 500.
    if not isinstance(group_by_raw, (list, tuple)):
        raise ExecutorError(
            f"'group_by' precisa ser uma lista de nomes de coluna, veio "
            f"{type(group_by_raw).__name__}. Iterar isso agruparia por pedaços "
            f"do valor em vez de por coluna."
        )

    pares: list = []
    for item in group_by_raw:
        # Item vazio/nulo continua sendo ignorado, como sempre foi: sobra de
        # lista do LLM não é motivo para perder a pergunta inteira.
        if not item:
            continue

        if isinstance(item, dict):
            bruto = item.get("col")
            if not isinstance(bruto, str) or not bruto.strip():
                raise ExecutorError(
                    f"Item de 'group_by' em forma de objeto precisa de 'col' com "
                    f"o nome da coluna em texto (chaves recebidas: "
                    f"{', '.join(sorted(map(str, item))) or 'nenhuma'})."
                )

            trunc_bruto = item.get("trunc")
            if trunc_bruto is None:
                trunc = None
            elif not isinstance(trunc_bruto, str):
                raise ExecutorError(
                    f"'trunc' de 'group_by' precisa ser texto, veio "
                    f"{type(trunc_bruto).__name__}."
                )
            else:
                trunc = trunc_bruto.strip().lower()
                if trunc not in _TRUNC_PARA_PERIODO:
                    raise ExecutorError(
                        f"Truncamento de periodo '{trunc_bruto}' nao e suportado. "
                        f"Aceitos: {', '.join(_TRUNC_PARA_PERIODO)}."
                    )

            col = _strip_table(bruto.strip())
            if col:
                pares.append((col, trunc))
            continue

        if not isinstance(item, str):
            raise ExecutorError(
                f"Item de 'group_by' invalido: esperava nome de coluna em texto "
                f"ou objeto {{col, trunc}}, veio {type(item).__name__}."
            )

        col = _strip_table(item.strip())
        if col:
            pares.append((col, None))

    return pares


def _rotulo_de_periodo(
    df: pd.DataFrame, col: str, trunc: str, roles: Dict[str, str]
) -> pd.Series:
    """
    A coluna de data virada em rótulo de período, como TEXTO ordenável.

    ── Por que texto, e por que ISO (decisão D3) ────────────────────────────
    `Period` do pandas não é serializável em JSON ("Object of type Period is not
    JSON serializable") e `_serialize_df` só trata datetime/float/int — um dtype
    `period` passaria incólume e estouraria no FastAPI. Materializar como string
    aqui evita isso e, mais importante, deixa `order_by`, `rename_map` e a
    ordenação de colunas de `_grouped_agg` sem UMA linha alterada.

    O formato é ISO porque **o rótulo tem que ordenar como texto**. O `order_by`
    ordena a coluna de saída e o gráfico de linha desenha na ordem das linhas; um
    rótulo "jan/2026" ordenaria alfabeticamente (abr, ago, dez, fev...) e a linha
    sairia embaralhada sem nenhum erro no caminho. A tradução para português é
    responsabilidade do front (`src/components/dashboard/formato.ts`), onde as
    outras traduções já moram.

        month    -> "2026-01"
        quarter  -> "2026Q1"
        year     -> "2026"
        week     -> "2026-01-05"   (a SEGUNDA-feira que abre a semana)

    ── Por que a semana é rotulada pela data de início ──────────────────────
    O rótulo óbvio, `f"{p.year}-S{p.week}"`, MENTE na virada do ano: para
    2027-01-03 o pandas dá `p.year=2027, p.week=53`, ou seja "2027-S53" — semana
    53 de um ano que acabou de começar (a ISO diz 2026-W53). E "2027-S53"
    ordenaria no extremo direito de 2027, desenhando a primeira semana do ano no
    fim dele. A data de início não mente e ordena certo.

    Nota medida, para ninguém "consertar" depois: `to_period("W")` do pandas é
    `period[W-SUN]`, que significa semana que TERMINA no domingo, isto é, que
    COMEÇA na segunda. É já a convenção brasileira, e também a ISO 8601. Não há
    nada a configurar aqui.

    ── Fuso horário (decisão D5) ────────────────────────────────────────────
    Nenhuma conversão de fuso, em lugar nenhum. As datas chegam `naive` e o
    agrupamento usa o dia como ele está na planilha, que é o comportamento certo
    para dado de negócio brasileiro. Converter faria a venda de 1º de março às
    23h "aparecer em fevereiro".
    """
    if col not in df.columns:
        # `df[col]` numa coluna ausente é KeyError, que não é ExecutorError:
        # escaparia do laço por card e viraria 500 do lote, a mesma falha que o
        # PR 1 fechou uma função acima.
        raise MissingColumnError(
            f"Coluna '{col}' pedida em group_by nao existe nos dados."
        )

    s = df[col]

    # Papel `ano` é Int64, não datetime — `.dt` levanta AttributeError, que é
    # outro 500. E o pedido é redundante: agrupar por essa coluna como string
    # simples JÁ devolve baldes de ano. É o caso da base `tabela-de-estudos`,
    # cuja coluna de conclusão mistura "2005" com "01/12/2005".
    if _is_ano(col, roles):
        raise ExecutorError(
            f"A coluna '{col}' e de ano, e agrupar por periodo nao se aplica a "
            f"ela: agrupe por '{col}' direto, sem 'trunc', que o resultado ja "
            f"sai por ano."
        )

    if not pd.api.types.is_datetime64_any_dtype(s):
        # Nunca converter em silêncio. Uma coluna de texto que "parece data" só
        # parece: `pd.to_datetime` acertaria algumas linhas, erraria outras e o
        # gráfico sairia com meses inventados e cara de certo.
        raise ExecutorError(
            f"Nao da para agrupar '{col}' por periodo: a coluna nao e de data "
            f"(tipo atual: {s.dtype}). Para virar periodo ela precisa estar "
            f"tipada como 'data' no dicionario da base."
        )

    periodo = s.dt.to_period(_TRUNC_PARA_PERIODO[trunc])

    if trunc == "week":
        rotulo = periodo.dt.start_time.dt.strftime("%Y-%m-%d")
    else:
        rotulo = periodo.astype(str)

    # Linha sem data vira rótulo explícito, nunca "NaT"/"nan" (D6).
    return rotulo.where(s.notna(), _SEM_DATA)


# ─────────────────────────────────────────────────────────────────────────────
# Qual tabela o plano quer
# ─────────────────────────────────────────────────────────────────────────────

# ⭐ O nome que o caminho de UMA tabela sempre usou. Todo card salvo no
# dashboard hoje tem `"from": "producao"`, porque o `main.py` sobrescrevia o
# `from` antes de executar. Ele não é mais imposto, mas continua sendo o default
# e o apelido de compatibilidade — ver `_resolver_tabela`.
TABELA_PADRAO = "producao"


def resolver_nome_da_tabela(plan: Dict[str, Any], nomes: Collection[str]) -> str:
    """
    O nome da tabela a usar, ou `TabelaNaoEncontradaError`.

    ⚠️⚠️ **A regra de compatibilidade é o ponto desta função, não um detalhe.**
    Até 2026-08-27 o `main.py` fazia `plano["from"] = "producao"` antes de
    chamar, então **todo card salvo em produção carrega `"from": "producao"`** —
    inclusive os dos quatro clientes pagantes. Passar a respeitar o `from` sem
    esta ponte apagaria o dashboard de todo mundo no minuto da publicação.

    A ponte: com **exatamente uma** tabela no payload, um `from` ausente ou igual
    a `"producao"` cai nela, qualquer que seja o nome real dela. É o caso legado
    inteiro, e ele continua idêntico.

    ⛔ **A ponte NÃO vale com duas ou mais tabelas.** Ali "producao" não é
    apelido de nada: se o plano pede um nome que não veio, adivinhar qual das N
    ele queria devolveria o número de uma base com o rótulo de outra — a falha
    que este módulo recusa em toda parte (ver `MissingColumnError`).

    ⭐⭐ **Recebe `nomes`, não `tables`, porque o `main.py` chama isto ANTES de
    ler o Google.** A barreira 4 precisa saber contra qual `allowed_columns`
    autorizar o pedido, e essa decisão tem de ser **a mesma** que a execução vai
    tomar depois. Duas implementações da regra divergiriam em silêncio, e a
    divergência seria de autorização: um pedido autorizado contra a base A e
    executado sobre a base B. É a classe do D-017, e aqui ela não é "coluna não
    encontrada" — é vazamento.
    """
    pedida = plan.get("from")
    nomes = set(nomes)

    if pedida in nomes:
        return pedida

    # ── A ponte do legado, e só ela ──────────────────────────────────────────
    if len(nomes) == 1 and (pedida is None or pedida == TABELA_PADRAO):
        return next(iter(nomes))

    disponiveis = ", ".join(sorted(nomes)) or "(nenhuma)"
    raise TabelaNaoEncontradaError(
        f"O plano pede a tabela '{pedida}', que nao veio no payload. "
        f"Disponiveis: {disponiveis}."
    )


def execute_plan(
    plan: Dict[str, Any],
    tables: Dict[str, pd.DataFrame],
    *,
    column_roles: Optional[Dict[str, str]] = None,
    max_rows: Optional[int] = None,
    aplicar_regras_adhoc: bool = False,
) -> Dict[str, Any]:
    """
    Executa um Query Plan e devolve um vetor agregado.

    column_roles: {coluna: 'percent'|'text'|'date'|'number'}, derivado do
        schema_metadata do tenant. Substitui as antigas constantes globais.
    max_rows: teto de linhas da base carregada. Verificado ANTES de qualquer
        processamento, porque o `limit` do plano corta a saída e não a entrada.
    aplicar_regras_adhoc: liga o teto de cardinalidade (B02). Falso por padrão
        — o dashboard e o chat legado continuam exatamente como estavam, e a
        regra só registra o que teria recusado. Ver `_conferir_cardinalidade`.
    """
    roles = _roles(column_roles)

    table_name = resolver_nome_da_tabela(plan, tables)
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
    aggs: list = []          # (alias, func, raw_col, params)
    derivadas: list = []     # colunas sintéticas materializadas neste plano
    df_copiado = False       # `df` aqui é a fatia do where; escrever exige cópia

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

            # ── Expressão aritmética derivada ────────────────────────────────
            # Duas formas aceitas, porque as duas são plausíveis na saída do
            # Agente A e divergir do `_shared/query_plan.ts` custou caro antes:
            #   {"agg":"sum","col":{"op":"mul","args":["qtd","preco"]}}
            #   {"agg":"sum","op":"mul","args":["qtd","preco"]}
            # `col` sendo objeto só pode ser expressão — validar o operador é
            # trabalho do `_avaliar_expressao`, que sabe dizer qual é o problema.
            # Exigir aqui um `op` conhecido mandava `{"op":"pow",...}` para o
            # caminho de coluna normal, onde o dict inteiro virava nome de
            # coluna e o erro saía como "coluna '{'op': 'pow', ...}' nao existe".
            params = _parametros_da_agregacao(func, expr)

            no = expr.get("col")
            if not isinstance(no, dict):
                no = expr if _eh_no_aritmetico(expr) else None

            if no is not None:
                # Materializa como coluna de verdade e segue o caminho normal.
                # Assim `_grouped_agg`/`_scalar_agg` não precisam saber que
                # expressão derivada existe: para eles é só mais uma coluna.
                if not df_copiado:
                    df = df.copy()
                    df_copiado = True
                col = f"{_PREFIXO_DERIVADA}{len(derivadas)}"
                df[col] = _avaliar_expressao(no, df, roles)
                derivadas.append(col)
                if alias is None:
                    partes = _colunas_da_expressao(no)[:2]
                    alias = f"{func}_" + ("_".join(partes) if partes else "calculado")
                aggs.append((alias, func, col, params))
                continue

            col = _strip_table(str(expr.get("col", "")))
            # Somar percentual nao significa nada: 10% + 20% nao e 30% de nada.
            if func == "sum" and _is_percent(col, roles):
                logger.info(
                    "Coluna '%s' e percentual: trocando sum por avg.", col
                )
                func = "avg"
            # Ano e dimensao, nao medida. Aqui NAO da pra trocar por avg como no
            # percentual: a media dos anos e justamente o numero sem sentido do
            # problema (avg de uma coluna 2000..2015 devolve 2004.42, que parece
            # uma resposta). min/max/count continuam valendo — "ano mais antigo"
            # e "quantos por ano" sao perguntas legitimas.
            if func in ("sum", "avg", "mean") and _is_ano(col, roles):
                raise ExecutorError(
                    f"'{func}' sobre a coluna de ano '{col}' nao produz um "
                    f"numero com significado. Ano serve para agrupar, filtrar "
                    f"ou pegar o menor/maior — para contar registros use "
                    f"count sobre outra coluna."
                )
            # ⚠️ As agregacoes do B09 recusam coluna de texto em vez de coagir.
            # Media de zeros forjados ja e ruim; mediana e desvio padrao de zeros
            # forjados sao ruido puro, com cara de numero. As antigas continuam
            # coagindo (`_coerce_numeric_for_agg`) — ver o comentario da
            # constante e a divida C10.
            if func in AGREGACOES_QUE_EXIGEM_NUMERO and _is_text(col, roles):
                raise ExecutorError(
                    f"'{func}' precisa de uma coluna numerica, e '{col}' e de "
                    f"texto. Se ela guarda numero, corrija o tipo dela na tela "
                    f"de base de dados — converter aqui produziria uma "
                    f"estatistica sobre zeros inventados."
                )

            alias = alias or f"{func}_{col}"
            aggs.append((alias, func, col, params))
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

    # Trava de tipo antes de qualquer uso: ver `_colunas_de_group_by`. Item que
    # não é nome de coluna vira ExecutorError aqui, e não TypeError trinta linhas
    # adiante — que escapava do laço por card e derrubava o lote inteiro.
    gb_pares = _colunas_de_group_by(group_by_raw)
    gb_cols = [col for col, _ in gb_pares]

    # ── TRUNCAMENTO POR PERÍODO ──────────────────────────────────────────────
    # O rótulo é materializado NA PRÓPRIA COLUNA, mantendo o nome original, e
    # depois do `where` (que já filtrou por data crua, como deve).
    #
    # Escrever na mesma coluna, em vez de criar uma sintética como
    # `_PREFIXO_DERIVADA` faz para expressão aritmética, é o que mantém tudo a
    # jusante intocado: `_grouped_agg`, `rename_map`, a ordenação de colunas,
    # `order_by` e `_serialize_df` continuam vendo "uma coluna de texto chamada
    # data_da_venda" e não precisam saber que período existe.
    for col, trunc in gb_pares:
        if trunc is None:
            continue
        if not df_copiado:
            # `df` aqui costuma ser a fatia `df[mask]` do where, não um frame
            # próprio: escrever sem copiar cai em SettingWithCopyWarning.
            df = df.copy()
            df_copiado = True
        df[col] = _rotulo_de_periodo(df, col, trunc, roles)

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
    # Pares (nome na saída, nome de origem) — ver `_conferir_cardinalidade`.
    colunas_grupo: list = []

    if gb_cols:
        colunas_grupo = [(c, c) for c in gb_cols]
        df_out = _grouped_agg(df, gb_cols, aggs, direct_cols, roles)
    elif direct_cols and implicit_gb:
        # ⚠️ Coluna solta no `select` vira group_by implícito, e é por esta
        # porta que `select: ["cliente", count(...)]` entrega a carteira toda
        # sem nunca escrever `group_by`. Precisa da mesma conferência.
        colunas_grupo = [
            (alias, col) for alias, col in direct_cols if col in df.columns
        ]
        df_out = _grouped_agg(df, implicit_gb, aggs, direct_cols, roles)
    else:
        # ── AGREGADO ÚNICO sobre a base filtrada ──────────────────────────
        # Um número só, sobre a base inteira depois do where.
        agregado_unico = True
        row: Dict[str, Any] = {}
        for alias, func, col, params in aggs:
            row[alias] = _scalar_agg(df, func, col, roles, params)
        df_out = pd.DataFrame([row])

    # ── B02: quantos literais de texto este resultado carrega ────────────────
    # Feito aqui, antes de order_by e limit, porque o que interessa é o alcance
    # do recorte e não quantas linhas sobraram depois do corte.
    grupos_de_texto = _conferir_cardinalidade(
        df_out, colunas_grupo, roles, aplicar=aplicar_regras_adhoc
    )
    seletoras = _seletoras_de_texto(aggs, roles)
    if seletoras:
        # Reportado, não recusado: seletora sobre texto devolve UM literal por
        # grupo, e a decisão de cobrá-la do orçamento é do autorizador, no B10.
        # O executor é Motorista Cego — ele conta, quem decide é a Edge Function.
        logger.info("Selecao literal de texto em: %s", ", ".join(seletoras))

    # ── ORDER BY ─────────────────────────────────────────────────────────────
    # `df_out` já é o resultado agregado, então as colunas dele são os aliases —
    # não necessariamente os nomes de origem. Um order_by que cita a coluna de
    # origem de algo renomeado no select ainda é ordenável; é o que o mapa
    # resolve, em vez de tratar como ausente.
    saida_de: Dict[str, str] = {}
    for alias, raw in direct_cols:
        saida_de.setdefault(raw, alias)
    for alias, _func, raw, _params in aggs:
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
    df_out = df_out.head(_limite_de_saida(plan))

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
        # B02 — o que este resultado carrega de literal da base. Quem lê é o
        # orçamento do B10; até lá é só medição. Aditivo: nenhum consumidor
        # atual olha para estas chaves.
        "grupos_de_texto": grupos_de_texto,
        "selecoes_literais": seletoras,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Agregação
# ─────────────────────────────────────────────────────────────────────────────

def _coerce_numeric_for_agg(
    df: pd.DataFrame, aggs: list, roles: Dict[str, str]
) -> None:
    """Converte in-place colunas de texto usadas em agregação numérica."""
    for _alias, func, col, _params in aggs:
        if (
            col in df.columns
            and not pd.api.types.is_numeric_dtype(df[col])
            and func in ("sum", "avg", "mean", "min", "max")
        ):
            # ⛔ **Coluna declaradamente de TEXTO fica como estava — é a C10, e o
            # motivo dela é PRIVACIDADE, não compatibilidade.** Destravar a
            # coerção aqui faria `min`/`max` devolverem o LITERAL: o primeiro
            # nome de cliente por região, saindo por dentro de um agregado. É o
            # mesmo vazamento que o `metadados` fecha ao recusar `min`/`max`
            # sobre texto (B03). O `0` de hoje é feio e é resposta errada, mas
            # não entrega dado — e trocá-lo exige a decisão que a C10 registra.
            if _is_text(col, roles):
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
            else:
                df[col] = _como_numero(df[col])


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
    for alias, func, col, params in aggs:
        if col not in df.columns:
            raise MissingColumnError(
                f"Coluna '{col}' referenciada em select nao existe nos dados."
            )
        if func == "quantile":
            # ⚠️ `.agg("quantile")` sem parametro devolve a MEDIANA em silencio.
            # O `p` ja foi validado no parsing; aqui ele so precisa chegar ao
            # pandas, e a unica forma e um callable.
            pp = params["p"]
            agg_dict[alias] = (col, lambda x, _p=pp: x.quantile(_p))
        else:
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
    for alias, _f, _c, _p in aggs:
        if alias in df_out.columns and alias not in ordered:
            ordered.append(alias)

    return df_out[[c for c in ordered if c in df_out.columns]]


def _scalar_agg(
    df: pd.DataFrame,
    func: str,
    col: str,
    roles: Dict[str, str],
    params: Optional[Dict[str, Any]] = None,
):
    """
    Uma agregação sobre a base inteira. Sem agrupamento.

    ⚠️ **Este caminho ficava para trás do agrupado, e falhava calado.** Até o B09
    ele tratava `sum|avg|mean|min|max|count` e fazia `return None` para o resto —
    enquanto `_grouped_agg` passa o `func` direto para o pandas e aceita `std`,
    `median`, `var`, `nunique`. Resultado: *"qual o desvio padrao do
    faturamento?"* com `group_by` funcionava e sem `group_by` devolvia `null`.

    ⭐ E o conserto nao foi so somar `if`s. O `None` final era o valor de "funcao
    desconhecida" — e `None` ja significa outra coisa legitima tres linhas acima
    (coluna vazia depois do `dropna`). Agora sao distinguiveis: desconhecida
    LEVANTA nomeando qual, vazia continua `None`.
    """
    params = params or {}
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
        if _is_text(col, roles):
            # ⛔ C10 — coluna declaradamente de texto. Intocada de propósito; ver
            # a guarda gêmea em `_coerce_numeric_for_agg`.
            s = pd.to_numeric(s, errors="coerce").fillna(0)
        else:
            # ⭐ `_como_numero`, não `pd.to_numeric` cru: o parser de lá entende
            # "R$ 57,50", que o `to_numeric` transformava em NaN — e o
            # `.fillna(0)` que vinha depois transformava em zero. Ver a tabela no
            # docstring dele.
            s = _como_numero(s).dropna()
            # ⚠️ Coluna que deveria ser número e não tem UM valor utilizável não
            # tem resultado. `None` é o que este caminho já usa para coluna
            # vazia. Com `.fillna(0)` isto era invisível: soma 0 e média 0, que
            # se leem como fatos sobre a base.
            if len(s) == 0:
                return None
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

    # ── B09 ──────────────────────────────────────────────────────────────────
    if func == "nunique":
        return int(s.nunique())
    if func == "first":
        return _to_python(s.iloc[0])
    if func == "last":
        return _to_python(s.iloc[-1])

    # As numericas: se o dtype nao colabora, dizer isso vale mais que devolver
    # um numero calculado sobre coisa nenhuma.
    if func in AGREGACOES_QUE_EXIGEM_NUMERO:
        if not pd.api.types.is_numeric_dtype(s):
            raise ExecutorError(
                f"'{func}' precisa de uma coluna numerica, e '{col}' nao esta "
                f"tipada como numero nos dados."
            )
        if func == "median":
            return float(s.median())
        if func == "std":
            return float(s.std())
        if func == "var":
            return float(s.var())
        if func == "quantile":
            return float(s.quantile(params["p"]))

    raise ExecutorError(
        f"Agregacao '{func}' nao e conhecida pelo executor. Conhecidas: "
        f"{', '.join(sorted(AGREGACOES_CONHECIDAS))}."
    )


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
    # `node.get` num tipo que nao e dict vira AttributeError, que nao e
    # ExecutorError: escaparia do except do main.py e viraria 500 mudo — a
    # mesma falha que a string crua em `select` causava (test_formas_de_plano).
    if not isinstance(node, dict):
        raise ExecutorError(
            f"Filtro 'where' invalido: esperado objeto, veio {type(node).__name__}."
        )
    op = str(node.get("op", "")).lower()

    if op in ("and", "or"):
        args = node.get("args")
        # Um `and`/`or` sem operando NAO pode virar tudo-verdadeiro: isso desliga
        # o filtro inteiro e devolve a conta sobre a tabela toda com o rotulo do
        # recorte que o usuario pediu — o mesmo numero-errado-com-etiqueta-
        # convincente que `_eval_single` recusa logo abaixo, e que o `order_by`
        # descartado calado produzia antes de c47b742. O `where` e justamente a
        # parte do plano deixada fora do `response_schema` do Gemini
        # (`ai-plum-chat/index.ts`), entao a chave errada ou ausente e uma saida
        # que o LLM alcanca sozinho; `authorizePlan` tambem nao barra, porque um
        # no sem operando nao tem coluna nenhuma pra extrair.
        if not isinstance(args, list) or not args:
            logger.error(
                "Filtro '%s' sem operandos utilizaveis em 'args' (recebido: %r). "
                "No completo: %r", op, args, node,
            )
            raise ExecutorError(
                f"Filtro '{op}' veio sem condicoes em 'args'. Um filtro vazio "
                f"devolveria a base inteira com o rotulo do recorte pedido."
            )
        for a in args:
            if not isinstance(a, dict):
                raise ExecutorError(
                    f"Condicao invalida dentro de '{op}': esperado objeto, "
                    f"veio {type(a).__name__}."
                )
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

def _eh_numero(v: object) -> bool:
    """Número de verdade (não texto, não booleano)."""
    return isinstance(v, (int, float, np.number)) and not isinstance(v, bool)


def _limpar_texto_ptbr(s: pd.Series, *, strip_percent: bool) -> pd.Series:
    """A limpeza textual: 'R$ 1.234,56' -> 1234.56."""
    text = s.astype(str)
    text = text.str.replace("R$", "", regex=False)
    if strip_percent:
        text = text.str.replace("%", "", regex=False)
    text = text.str.replace(r"\s", "", regex=True)
    text = text.str.replace(".", "", regex=False)
    text = text.str.replace(",", ".", regex=False)
    return pd.to_numeric(text, errors="coerce")


def _parse_ptbr_number(s: pd.Series, *, strip_percent: bool = False) -> pd.Series:
    """
    Limpa um número em formato PT-BR: remove 'R$', espaços, opcionalmente '%',
    o ponto de milhar, e troca a vírgula decimal por ponto.

    ⚠️ Valor que JÁ É NÚMERO não passa pela limpeza textual, e isto não é
    otimização — é correção. `sheets.load_columns` lê com
    `valueRenderOption=UNFORMATTED_VALUE`, então célula numérica chega como
    número Python de verdade, e a limpeza tratava o ponto DECIMAL dele como
    separador de milhar:

        2.5   -> astype(str) -> "2.5"   -> tira "." -> "25"    (x10)
        90.0  -> "90.0"                 ->           "900"     (x10)
        0.155 -> "0.155"                ->           "0155"    (x1000)

    Ou seja: toda coluna de dinheiro nativa da planilha vinha multiplicada por
    10^(casas decimais). Os testes nunca pegaram porque todos alimentam string
    ("R$ 1.234,56"), que é justamente o caminho que funciona.

    A decisão é por TIPO e não por "dá pra converter": em pt-BR a string
    "1.234" significa mil duzentos e trinta e quatro, enquanto o número 1.234
    significa um vírgula dois três quatro. Só o tipo distingue os dois, e
    tentar `pd.to_numeric` primeiro leria a string errado.

    A mesma coluna pode misturar os dois casos linha a linha (célula digitada
    como texto ao lado de célula formatada como número), então a escolha é por
    linha — mesmo padrão que `_fmt_data` já usa para serial vs texto.
    """
    if pd.api.types.is_numeric_dtype(s):
        return pd.to_numeric(s, errors="coerce")

    eh_num = s.map(_eh_numero).fillna(False).astype(bool)
    if not eh_num.any():
        return _limpar_texto_ptbr(s, strip_percent=strip_percent)

    via_numero = pd.to_numeric(s.where(eh_num), errors="coerce")
    via_texto = _limpar_texto_ptbr(s.where(~eh_num), strip_percent=strip_percent)
    return via_numero.where(eh_num, via_texto)


def _fmt_moeda_brl(s: pd.Series, params: Dict[str, Any]) -> pd.Series:
    return _parse_ptbr_number(s)


def _fmt_numero_decimal(s: pd.Series, params: Dict[str, Any]) -> pd.Series:
    return _parse_ptbr_number(s)


def _fmt_numero_inteiro(s: pd.Series, params: Dict[str, Any]) -> pd.Series:
    """
    O `.round()` antes do cast não é preciosismo: `astype("Int64")` sobre um
    valor fracionário levanta `TypeError` ("cannot safely cast non-equivalent
    float64 to int64"), que NÃO é `ExecutorError` — escaparia do `except` do
    `main.py` e viraria 500 mudo, com a pergunta do usuário morrendo em
    "Nao consegui calcular isso agora".

    Era inalcançável enquanto a limpeza textual comia o ponto decimal (0.15
    virava 15, inteiro por acidente). Com o número nativo preservado, deixou de
    ser: `demo_riosulense` tem `percent_peso_nao_conformes` tipado como
    `numero_inteiro`, e percentual nativo do Sheets chega como 0.15.

    Arredondar em silêncio seria a outra metade do erro, então a perda fica
    registrada: o `type` veio de um LLM olhando 5 linhas de amostra, e coluna
    com decimal real tipada como inteiro é sinal de que ele errou.
    """
    numeros = _parse_ptbr_number(s)
    # `notna()` importa: `NaN % 1` é `NaN`, e `NaN != 0` é True — sem isso toda
    # célula vazia era contada como decimal e o aviso disparava à toa.
    fracionarios = int((((numeros % 1) != 0) & numeros.notna()).sum())
    if fracionarios:
        logger.warning(
            "Coluna tipada como numero_inteiro tem %d valor(es) com casa "
            "decimal; arredondando. O 'type' do Agente 3 provavelmente "
            "deveria ser numero_decimal.", fracionarios,
        )
    return numeros.round().astype("Int64")


def _fmt_percentual(s: pd.Series, params: Dict[str, Any]) -> pd.Series:
    return _parse_ptbr_number(s, strip_percent=True)


# Serial do Sheets/Excel, contado de 1899-12-30, para o ULTIMO instante que o
# `datetime64[ns]` representa: 2262-04-11.
#
# ⚠️ Nao e 9999-12-31. O primeiro corte que escrevi usava 2.958.465 (o limite do
# Excel) e um teste de regressao o derrubou na hora: `datetime64[ns]` conta
# nanossegundos num int64 desde 1970, e isso acaba em 2262. Serial acima disto
# nao vira data — vira NaT — entao deixa-lo passar so alimenta a multiplicacao
# que este corte existe para evitar.
_SERIAL_MAX = 132_320


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

    # ⚠️⚠️ SO OS VALORES DE VERDADE ENTRAM NO `to_datetime`. NaN NAO ENTRA.
    #
    # Nao e otimizacao: e contorno de um bug do pandas 2.2.x que derrubou o CI em
    # 2026-08-21 com `FloatingPointError: overflow encountered in multiply`, num
    # teste que passava na maquina de quem o escreveu.
    #
    # ⭐ O `cast_from_unit_vectorized` aloca o vetor de fracoes com `np.empty` e
    # chama `np.round(..., 13)` sobre ele INTEIRO — inclusive nas posicoes que
    # correspondem a NaN, onde ha LIXO DE MEMORIA e nao zero. O traceback do CI
    # mostrava valores como `-1.77e+307` e `1.40e-321` num vetor que deveria ser
    # todo NaN; `np.round` multiplica por 10^13 e `-1.77e+307 x 1e13` estoura.
    #
    # ⚠️ Como depende de lixo de memoria, o teste era FLAKY, nao dependente de
    # plataforma: mesma pandas 2.2.3 e mesma numpy 2.2.1 dos dois lados. Passava
    # aqui e falhava la por SORTE, e voltaria a falhar em qualquer lugar.
    #
    # Passar so o subconjunto valido nunca alimenta a funcao com NaN, entao a
    # fatia nao inicializada deixa de existir.
    #
    # ⭐ O corte de faixa e independente e vale por si: serial util vive entre 1
    # (1899-12-31) e 132.320 (2262-04-11, o teto do `datetime64[ns]`). Fora
    # disso o valor nao e data serializada, e sim um numero que caiu numa coluna
    # de data — e o `errors="coerce"` trata o RESULTADO, nao a multiplicacao que
    # vem antes dele.
    serial = numerico.where((numerico > 0) & (numerico <= _SERIAL_MAX))
    via_serial = pd.Series(pd.NaT, index=s.index, dtype="datetime64[ns]")
    convertivel = serial.notna()
    if convertivel.any():
        via_serial.loc[convertivel] = pd.to_datetime(
            serial[convertivel], unit="D", origin="1899-12-30", errors="coerce"
        )
    via_texto = pd.to_datetime(s, dayfirst=bool(params.get("dayfirst", True)), errors="coerce")
    return via_serial.where(numerico.notna(), via_texto)


# Faixa que conta como "ano ja escrito por extenso". O serial do Sheets para
# qualquer data moderna e muito maior (2005-12-01 = 38687), entao ele cai no
# ramo de baixo e e resolvido como data — que e exatamente o que queremos.
# Colisao residual conhecida: serial 1000..9999 e uma data entre 1902 e 1927,
# que seria lida como ano. Numa coluna que o Agente 3 classificou como `ano`
# isso e improvavel, e o erro seria visivel (um "ano" de 1902), nao silencioso.
_ANO_MIN, _ANO_MAX = 1000, 9999


def _fmt_ano(s: pd.Series, params: Dict[str, Any]) -> pd.Series:
    """
    Coluna de ano: devolve sempre o inteiro do ano, venha ele como ano puro
    ("2005", 2005) ou como data completa ("01/12/2005", ou o serial do Sheets).

    Existe porque `numero_inteiro` e `data` erram esta coluna de jeitos opostos,
    e nenhum dos dois avisa (visto na base `tabela-de-estudos`, 38 celulas com
    `2005` e uma com `01/12/2005`):

      - `numero_inteiro` manda a data completa para `NaN`: o registro some de
        todo filtro e de todo agrupamento por ano. Em `tabela-de-estudos` isso
        inverte a resposta de "qual o ano com mais estudos" (2005 perde 1 e
        empata com 2001, e o `limit 1` responde 2001).
      - `data` faz o contrario: o ano puro `2005` e numerico, entao
        `_fmt_data` o le como serial do Sheets e devolve 1905-06-27. A coluna
        inteira vira 1905 e toda ordenacao por tempo passa a mentir.

    A decisao aqui e por linha, como em `_fmt_data`, e pela mesma razao: a
    mesma coluna tem as duas coisas.
    """
    numerico = pd.to_numeric(s, errors="coerce")
    ano = numerico.where(numerico.between(_ANO_MIN, _ANO_MAX))

    faltando = ano.isna()
    if faltando.any():
        # Sobrou o que nao e ano puro: data em texto ou serial do Sheets.
        # `_fmt_data` ja decide entre os dois por linha — reusar evita ter
        # duas regras de leitura de data divergindo com o tempo.
        via_data = _fmt_data(s.where(faltando), params)
        ano = ano.fillna(via_data.dt.year)

    return ano.astype("Int64")


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


# Enum fechado de `type` de formatação (contexto/20-pendencias.md). Expandir só
# com decisão explícita — nunca em silêncio.
_FORMATTERS: Dict[str, Callable[[pd.Series, Dict[str, Any]], pd.Series]] = {
    "moeda_brl": _fmt_moeda_brl,
    "numero_decimal": _fmt_numero_decimal,
    "numero_inteiro": _fmt_numero_inteiro,
    "percentual": _fmt_percentual,
    "data": _fmt_data,
    "ano": _fmt_ano,
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
    # `ano` tem papel proprio, e nao "number", porque ano e DIMENSAO e nao
    # medida: somar ou tirar media de anos produz um numero que o executor
    # calcula de bom grado e que nao significa nada (ver `_is_ano`).
    "ano": "ano",
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
    sumir em silêncio (era o problema central da dívida de keyword-match,
    hoje em `contexto/20-pendencias.md`).
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
    aplicar_regras_adhoc: bool = False,
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
            plan, tables, column_roles=roles, max_rows=max_rows,
            aplicar_regras_adhoc=aplicar_regras_adhoc,
        )

    formatted_tables: Dict[str, pd.DataFrame] = {}
    for table_name, df in tables.items():
        formatted_tables[table_name] = apply_formatting_rules(df, formatting_rules)

    return execute_plan(
        plan, formatted_tables, column_roles=roles, max_rows=max_rows,
        aplicar_regras_adhoc=aplicar_regras_adhoc,
    )

