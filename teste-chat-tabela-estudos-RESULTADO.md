# Resultado — roteiro `tabela-de-estudos.csv` · metade do executor

Execução de 2026-08-10 contra `execute_plan_with_formatting` real, com as
`formatting_rules` **de produção** (dataset `9e8319aa-2a36-4913-ae5b-6e9292d3ea78`,
org Babygoat) e a ingestão do `sheets.py` reproduzida (`majorDimension=COLUMNS`:
cauda vazia truncada por coluna, depois padding com `None`).

Cobre o **executor**, que é determinístico. A metade dos agentes Z/A/C (o plano que o
Agente A escolhe, a honestidade do Agente C) continua pendente e só se testa no chat real.

---

## Artefatos de ingestão (§6 pede guardar)

**`formattingRules` do Agente 3** — o achado que §4 pedia:

| Coluna | `type` | Papel derivado |
|---|---|---|
| `nome_do_estudo`, `bacia`, `empresa`, `natureza_da_aquisicao`, `titularidade` | `texto_trim_maiusculas` | `text` |
| `estudo` | **`nenhuma`** | `text` |
| `data_conclusao` | **`numero_inteiro`** | `number` |

**Linhas carregadas: 41** (CSV tem 43 registros; as 2 linhas totalmente vazias do fim
foram truncadas pelo `sheets.py`, as 2 linhas fragmento **não**).

O Agente 3 escolheu o cenário **do meio** da tabela de §4. Consequências:

- **Sem catástrofe de 1905.** `_fmt_data` não rodou; nenhuma data virou serial do Sheets.
- **Duas previsões do roteiro caíram por terra**, e é importante corrigi-las:
  - **A4 e o sinal nº 6 não se confirmam.** Com papel `number`, `min`/`max` são
    numéricos, não lexicográficos: `min = 2000`, `max = 2015`, ambos **corretos**.
    O `01/12/2005` vira `NaN` e simplesmente não participa.
  - **O sinal nº 7 (`Insight` com 3 ou 5) não se confirma.** `texto_trim_maiusculas`
    faz `strip()` **antes** do `group_by`, então filtro e agrupamento normalizam
    igual. `INSIGHT` aparece uma vez só, com 4. A assimetria que C7 testava não existe
    nesta ingestão.
- `estudo` ficou com `type: "nenhuma"` — a coluna não é normalizada e o executor
  loga `warning` a cada execução. Não causou erro aqui (os valores já eram limpos),
  mas é a única coluna categórica sem tipagem.

---

## Registro

Legenda: ✅ bate com o gabarito · ⚠️ diverge · ❌ erro que inverte ou distorce o sentido.

| ID | Gabarito | Executor | |
|---|---|---|---|
| A1 quantos estudos | 39 | **41** | ⚠️ |
| A2 tipos de estudo | 4 grupos | **5 grupos** (4 + `""`) | ⚠️ |
| A4 mais antigo | 2000 | 2000 | ✅ |
| A4 mais recente | 2015 | 2015 | ✅ |
| B1 por tipo | Geológico 27 · Geoquímico 10 · Misto 1 · Geofísico 1 | idem **+ `""` 2** | ⚠️ |
| B2 empresas | GSI 8 · Insight 4 · HRT 3 · Robertson 3 | idem (`INSIGHT`) **+ `""` 2** | ⚠️ |
| B3 natureza | NÃO EXCL 23 · FOMENTO 15 · EXCLUSIVO 1 | idem **+ `""` 2** | ⚠️ |
| B4 por ano | 12 grupos, soma 39 | 12 grupos, **soma 41**, bucket `None` = 3 | ⚠️ |
| B5 ano de pico | **2005, com 8** | **empate 2001=7 / 2005=7** → `limit 1` responde **2001** | ❌ |
| B6 tipo × natureza | 7 grupos, soma 39 | idem **+ `""`/`""` 2**, soma 41 | ⚠️ |
| C1 exclusivos (`=`) | 1 | 1 | ✅ |
| C1 exclusivos (`contains`) | 24 — armadilha | **24** | ❌ confirmada |
| C2 públicos | 39 | 39 | ✅ |
| C3 confidenciais | vazio | `[]` | ✅ |
| C4 geoquímicos da GSI | 7 | 7 | ✅ |
| C5 depois de 2010 | 2 | 2 | ✅ |
| C7 Insight | 4 | 4 | ✅ |
| C8 Core Laboratories | 2 via `contains` | 2 | ✅ |
| D1 por bacia | 28 grupos-combinação | **29** grupos; topo `CAMPOS 4`, `SANTOS 4` | ❌ confirmada |
| D2 Campos | 12 | 12 | ✅ |
| D3 Santos | 12 (11 real) | 12 | ✅ |
| D5 Recôncavo | 4 | 4 | ✅ |
| D6 Foz do Amazonas | 3 | 3 | ✅ |
| E1 listar estudos | `RawRowsBlocked` | `RawRowsBlocked` | ✅ |
| E5 soma das bacias | 0 silencioso | **`0.0`, sem erro** | ❌ confirmada |
| E3 `avg(data_conclusao)` | número sem sentido | **2004.42** | ❌ confirmada |

**As barreiras de segurança e privacidade passaram todas.** `RawRowsBlocked` bloqueou
E1; `EXCLUSIVO` com 1 linha apareceu em B3 (sem regressão de k-anonimato); vetor vazio
em C3 devolveu `[]` e não erro; `contains` normalizou acento e caixa em D2/D5.

---

## Os quatro achados

### 1. As 2 linhas fragmento viram um grupo fantasma em **todo** `group_by` — NOVO

O roteiro previu isso só como erro de contagem (sinal nº 1, "39 → 41"). É pior: as
duas linhas de sobra do título multi-linha do UFRJ/COPPE têm `nome_do_estudo`
preenchido e **todas as outras colunas vazias**. `texto_trim_maiusculas` faz
`astype(str)` sobre `""`, que continua `""` — não é nulo, então sobrevive a tudo.

Resultado: um grupo de rótulo `""` com n=2 aparece em A2, B1, B2, B3, B6 e D1. Em
`bacia` são 29 grupos, não 28. Não é só um total errado: é **uma fatia sem nome em todo
gráfico** que o dashboard vier a desenhar sobre esta base.

`dropna()` não pega, porque `""` não é `NaN`.

### 2. B5 responde o ano errado — **CORRIGIDO** (type `ano` novo)

`01/12/2005` → `numero_inteiro` → `NaN`. O bucket `None` de B4 tem **3** linhas: esse
estudo + as 2 fragmento. Sem ele, 2005 fica com 7 e **empata com 2001**. Com
`order_by desc, limit 1` o executor devolve **2001**.

O gabarito é **2005 com 8**. A pergunta mais informativa do roteiro erra — e erra em
silêncio, com um número plausível.

**Correção:** type `ano` novo no enum de formatação, exatamente a recomendação de §4
do roteiro. Lê o ano tanto do ano puro quanto da data completa (e do serial do Sheets,
reusando `_fmt_data` para decidir por linha). Existe porque os dois types disponíveis
erram esta coluna de jeitos **opostos**, e nenhum avisa:

| type | `2005` | `01/12/2005` |
|---|---|---|
| `numero_inteiro` | 2005 ✓ | **`NA`** — registro some das contagens por ano |
| `data` | **1905-06-27** — lido como serial do Sheets | 2005-12-01 ✓ |
| **`ano`** | 2005 ✓ | 2005 ✓ |

`ano` tem papel próprio (`TYPE_TO_ROLE["ano"] = "ano"`, não `"number"`), e é isso que
permite **recusar `sum`/`avg` sobre ele** — ano é dimensão, não medida. Aqui não dava
para trocar por `avg` como o executor faz com percentual, porque `avg` **é** o problema
(achado nº 3). `min`/`max`/`count`/`group_by`/filtro continuam valendo.

Medido na base real, trocando só o type da coluna:

```
ANTES  (numero_inteiro)   B4: … 2005=7 … None=3      B5: 2001 com 7   E3 avg: 2004.42
DEPOIS (ano)              B4: … 2005=8 … None=2      B5: 2005 com 8   E3 avg: recusado
```

O bucket `None` cai de 3 para 2 — as 2 que sobram são as linhas fragmento do achado
nº 1, que genuinamente não têm ano.

⚠️ **Não é retroativo.** O `schema_metadata` do dataset em produção continua com
`numero_inteiro` gravado. Só passa a valer depois de a coluna ser reprocessada pelo
Agente 3 (nova importação) ou ajustada pelo Agente 3.1.

### 3. `sum`/`avg` sobre texto continuam devolvendo número sem erro

`sum(bacia)` → **`0.0`**. `avg(data_conclusao)` → **`2004.42`**. Os dois confirmam o
sinal nº 4. Nesta base **nenhuma** coluna é medida, então qualquer `sum`/`avg` que o
Agente A emitir é bug — e o executor colabora, porque `_coerce_numeric_for_agg` faz
`fillna(0)`. Se o Agente A escorregar, o número chega ao Agente C indistinguível de um
resultado legítimo.

### 4. `where` com nó `and`/`or` sem `args` desligava o filtro em silêncio — NOVO, fora do roteiro · **CORRIGIDO**

Descoberto por acidente (escrevi `conditions` em vez de `args` no harness). Confirmado
de três formas, todas devolvendo a base inteira em vez de erro:

```
where {"op":"and","args":[]}                          -> 41   (base inteira)
where {"op":"and"}                                    -> 41
where {"op":"and","conditions":[{... empresa=GSI}]}   -> 41
where {"left":"empresa","op":"=","right":"GSI"}       ->  8   (correto)
```

`_eval_where` (`query_engine/pandas_executor.py:438-441`) devolve
`Series([True]*len(df))` quando `args` vem vazio. Vinte linhas abaixo, `_eval_single`
faz o **oposto** para coluna ausente, com o comentário que explica exatamente por quê:

> *"NAO devolver tudo-verdadeiro. Isso desligava o filtro e fazia a conta rodar sobre a
> tabela inteira, devolvendo o total historico com o rotulo do recorte pedido. Numero
> errado com etiqueta convincente e pior que erro na tela."*

É a mesma classe do bug corrigido em `c47b742` (`order_by` por coluna ausente descartado
calado), no ramo vizinho da mesma função.

**É alcançável em produção.** O `where` é deliberadamente o único trecho do Query Plan
**fora** do `response_schema` — o comentário em `ai-plum-chat/index.ts:327` explica que
prendê-lo distorceria o plano. Ou seja, é justamente a parte que o LLM escreve livre.
`authorizePlan` também não barra: ele extrai colunas do `where`, e um nó sem `args` não
tem coluna nenhuma para extrair, então passa pelo RBAC sem tocar em nada.

Sintoma para o usuário: pergunta "quantos estudos geoquímicos a GSI fez?" e recebe
**41** — o total da base — apresentado como se fosse a resposta do recorte.

**Correção aplicada** em `_eval_where`: `and`/`or` sem `args` utilizável levanta
`ExecutorError` (que o `main.py` converte em mensagem, não em 500), e uma condição que
não seja objeto também. Fechado junto o buraco vizinho: um `where` de topo que não seja
objeto caía em `node.get` → `AttributeError` → **500 mudo**, a mesma falha que a string
crua em `select` causava antes do PR #2.

Depois da correção, sobre a base real:

```
where {"op":"and","args":[]}                          -> ExecutorError
where {"op":"and"}                                    -> ExecutorError
where {"op":"and","conditions":[{... empresa=GSI}]}   -> ExecutorError
where "empresa = 'GSI'"                               -> ExecutorError (era 500)
where {"left":"empresa","op":"=","right":"GSI"}       ->  8   (inalterado)
where and[empresa=GSI, estudo=Geoquimico]             ->  7   (inalterado)
```

8 testes novos em `query_engine/tests/test_formas_de_plano.py`, na seção `WHERE`, um
deles marcado `@pytest.mark.invariante`. Suíte: **87 pytest ✓ · 39 vitest ✓**.

---

## Pendente

A metade dos agentes. O executor está certo em quase tudo; o que decide a qualidade
das respostas agora é **qual plano o Agente A escolhe** (C1 com `=` ou `contains`?
D2 com `contains` ou `=`? E5 vira `sum` ou `INVIAVEL`?) e **o quanto o Agente C
admite os limites** (D1, D7, E1). Nada disso dá para testar sem o chat real.
