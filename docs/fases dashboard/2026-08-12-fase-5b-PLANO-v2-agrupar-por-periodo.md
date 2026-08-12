# PLANO v2 — Fase 5b: agrupar por período e gráfico de linha

> **Documento de planejamento, não de execução.** Substitui
> `2026-08-11-fase-5b-PLANO-agrupar-por-periodo.md`, que fica no repositório como
> registro do raciocínio original. **Não apague o v1:** a §2 dele contém uma
> afirmação errada que este documento corrige, e a correção só se entende ao lado
> do que ela corrige.

**Data:** 2026-08-12
**Branch:** `feat/fase-5b-agrupar-por-periodo`
**Depende de:** Fase 4 (Página Inicial) e Fase 5a (tabela, parte-do-todo, alternador) — concluídas.
**Estado:** ✅ **as seis decisões da §4 foram tomadas em 2026-08-12** (todas na opção
recomendada). Ambiente local verde e baseline registrado (Etapa 0). Nenhuma linha de
código de produção escrita ainda — a implementação começa na Etapa 1.

---

## 0. A frase que resume

Hoje o executor não sabe derivar mês, semana ou trimestre de uma coluna de data.
Sem isso **"faturamento por mês" é impossível** e o gráfico de linha não tem o que
desenhar. Esta fase ensina o executor a agrupar por período — e é a primeira que
altera peças compartilhadas com o chat.

---

## 1. O que está bloqueado, e a evidência (reconferida em 2026-08-12)

`group_by` opera sobre coluna que existe no DataFrame:

```python
gb_cols = [_strip_table(c) for c in group_by_raw if c]   # pandas_executor.py:381
```

E não existe extração de parte de data em lugar nenhum — verificado por busca de
`.dt.month`, `to_period`, `resample` e `trunc` em `pandas_executor.py`. Logo:

| Plano | Resultado real hoje (medido) |
|---|---|
| `group_by: ["mes"]` | `MissingColumnError` — a coluna não existe na planilha |
| `group_by: ["data_da_venda"]` | Agrupa **por dia**: ~250 linhas num ano |
| `group_by: [{"col":"data_da_venda","trunc":"month"}]` | **`TypeError` → HTTP 500 do lote inteiro** — ver §2 |

O `line` já existe no `CHECK` de `dashboard_cards.viz`, mas desenhar uma linha por
dia com 250 pontos não é um gráfico de evolução, é ruído. **Por isso as duas
coisas são uma fase só, e não duas.**

O agente do dashboard já recusa explicitamente esse pedido hoje (regra 3 do
`INSTRUCAO_CARD` em `dashboard-agent/index.ts:272`). Esta fase remove essa recusa.

⚠️ **O Agente A do chat NÃO tem a regra equivalente.** `ai-plum-chat/index.ts:352`
diz apenas `"group_by": (opcional) array de colunas para agrupamento`. Então
"quanto vendemos por mês" **no chat, hoje**, já produz agrupamento por dia truncado
no `limit` 200 — uma resposta ruim que ninguém registrou. Não é regressão desta
fase, e a D4 decide se ela é resolvida aqui ou registrada no `TODOS.md`.

---

## 2. O modelo de risco — a v1 errou duas vezes, e a segunda importa

A v1 corrigiu uma superestimação (dizer que uma implementação pela metade em
`_shared/query_plan.ts` seria "bypass de RBAC") e acertou nisso. Mas ao rebaixar o
risco, **rebaixou demais**, e por uma razão factual: ela afirma que a forma objeto
produz hoje `MissingColumnError` — "falha fechada, com péssima mensagem". Foi
medido, na versão de pandas que o Lambda executa (2.2.3), e não é isso.

### O que continua verdade: não há risco de vazamento

Quando `extractColumns` deixa de extrair uma coluna:

1. Ela não entra em `veredito.required`.
2. `required` vira `resolved_columns` no payload assinado.
3. O executor carrega **apenas** `resolved_columns` (`main.py:130`,
   `colunas_a_carregar |= colunas`).
4. O plano referencia coluna fora do DataFrame → erro.

**Não é vazamento.** É a segunda barreira funcionando como projetada: o Lambda
nunca confia no plano para decidir o que ler. Isolamento entre organizações **não
está em jogo nesta fase.** Essa parte da v1 se sustenta inteira.

### O que é falso: "card quebrado, mensagem confusa"

Medido com `pandas==2.2.3`, `python 3.12`:

```
group_by: [{"col":"data_da_venda","trunc":"month"}]
  -> TypeError: unhashable type: 'dict'      ExecutorError? False
group_by: [{"trunc":"month"}]                (objeto sem col)
  -> TypeError: unhashable type: 'dict'      ExecutorError? False
```

A cadeia, passo a passo:

1. `_strip_table(dict)` **devolve o dict intacto** — `"." in dict` testa *chaves*,
   dá `False`, e a função retorna o argumento sem tocar. Não estoura aqui.
2. Em `_grouped_agg` (`pandas_executor.py:507`), `c not in df.columns` chama
   `pandas.Index.__contains__`, que executa `hash(key)` **fora** do `try/except`.
3. `hash({})` → `TypeError: unhashable type: 'dict'`.

`TypeError` **não é `ExecutorError`**. O `except ExecutorError` de `main.py:213` não
o pega, ele escapa do laço por card, escapa de `execute()`, e o FastAPI devolve
**HTTP 500 para o lote inteiro**. Em seguida, `dashboard-execute/index.ts:278` faz
`if (!resp.ok) throw` — e o `catch` degrada **todos os cards do dataset** para
`stale`, ou para `error` naqueles que ainda não têm snapshot.

### Por que isso muda o plano

Um card malformado derruba o dashboard inteiro. Isso contradiz frontalmente a
promessa que o próprio `main.py` faz no docstring:

> "Resposta é **por card**, nunca por lote: um card com coluna proibida devolve
> `forbidden` e os outros cinco continuam funcionando. Um card ruim não pode
> derrubar o dashboard inteiro."

É a **quarta ocorrência** do mesmo padrão neste arquivo, e as três anteriores estão
documentadas em comentário: string crua em `select`, string em `order_by`, `where`
não-dict. Todas eram "tipo inesperado → exceção que não é `ExecutorError` → 500
mudo". Esta fase introduz a quarta porta de entrada desse padrão, e por isso a
trava de tipo não é polimento: é a contenção principal.

**O risco real desta fase, então:** não é isolamento entre empresas (não está em
jogo), não é "card quebrado" (é otimista demais). É **raio de alcance**: um plano
malformado tira o dashboard do ar, e no chat mata a pergunta com erro genérico.
Corretude, clareza de erro e blast radius — nessa ordem.

---

## 3. As sete peças (a v1 listava quatro)

| # | Arquivo | Mudança | Compartilhado com o chat? |
|---|---|---|---|
| 1 | `query_engine/pandas_executor.py` | `group_by` aceita `{col, trunc}`; **trava de tipo** em item de `group_by`; papel `ano` recusado com erro nomeado | **Sim** |
| 2 | `query_engine/pandas_executor.py` (`_serialize_df`) | não precisa mudar **se** o rótulo for materializado como string — ver §5, Etapa 1 | **Sim** |
| 3 | `supabase/functions/_shared/query_plan.ts` | `extractColumns` extrai a coluna da forma objeto em `group_by` | **Sim** |
| 4 | `src/components/dashboard/tipos.ts` + `src/hooks/use-dashboard-cards.ts` | `CardNaTela` ganha "este card é de período?" | Não |
| 5 | `src/components/dashboard/VizLinha.tsx` (novo) + `formas.ts` + `CardDashboard.tsx` + `NovoCardDialog.tsx` + `EditarCardDialog.tsx` | o componente **e os quatro lugares que enumeram `viz`** | Não |
| 6 | `supabase/functions/dashboard-agent/index.ts` | prompt aprende a forma nova; sai a recusa da regra 3 | Não |
| 7 | Deploy | `_shared/query_plan.ts` é empacotado **por função**: publicar **três** | — |

### Por que a peça 2 provavelmente não existe

`Period` do pandas **não é serializável em JSON** (medido:
`TypeError: Object of type Period is not JSON serializable`), e `_serialize_df` só
trata `datetime`/`float`/`int` — um dtype `period` passaria incólume e estouraria
no FastAPI. Mas há um jeito de nunca criar essa coluna: **materializar o rótulo
como string, na própria coluna de origem, depois do `where`.**

```
df = df.copy()
df[col] = <rótulo string do período>     # a coluna mantém o NOME original
gb_cols = [col]                           # e daí em diante nada mais sabe que houve trunc
```

Isso reaproveita a lógica que o arquivo já usa e já testou para expressão
aritmética (`_PREFIXO_DERIVADA`, `df_copiado`), e mantém `_serialize_df`,
`order_by`, `rename_map` e a ordenação de colunas **sem uma linha alterada**. É a
razão pela qual a Etapa 1 é `M` e não `G`: a superfície nova fica contida numa
função de tradução, e nada a jusante precisa saber que período existe.

### Por que as quatro whitelists da peça 5 importam

Se a peça 6 (prompt) entrar antes da peça 5, a consequência é concreta e publicável:

1. Tarsila emite `viz: "line"`.
2. `NovoCardDialog.tsx:165` — TRAVA 2 — reescreve para `"kpi"`, porque
   `line ∉ VIZ_PERMITIDOS`. **O card é gravado no banco assim.**
3. `CardDashboard.tsx` não tem ramo `line` e cai no `VizKpi`.
4. `VizKpi` lê `colunas[0]` / `linhas[0]`. Num resultado agrupado, `colunas[0]` é a
   coluna do **rótulo**.

Um card intitulado "Faturamento por mês" renderiza um **`2026-01` gigante**. Não é
número errado — é pior de explicar e igualmente publicado.

Os quatro lugares:

- `NovoCardDialog.tsx:58` — `VIZ_PERMITIDOS` (a TRAVA 2)
- `EditarCardDialog.tsx:48` — `VIZ` (o que fica gravado, com o comentário que
  explica por que `line` estava de fora — **atualizar o comentário também**)
- `formas.ts:27` — `formasCompativeis` (o alternador "Ver como")
- `CardDashboard.tsx:201` — o dispatch

### Por que a peça 4 existe

O D.O.D. de linha exige "oferecer linha só quando o `group_by` é de período" —
linha sobre categoria não ordenada não significa nada. Mas `CardNaTela`
(`tipos.ts:39`) não carrega o `query_plan`, então `formasCompativeis` não tem como
saber.

Barato: `use-dashboard-cards.ts:88` **já seleciona** `query_plan` e já deriva
`colunaOrigem`/`agregacao` dele em `primeiraAgregacao`. É um campo a mais no mesmo
lugar. Mas é mudança em `tipos.ts` + hook, e não "só `VizLinha.tsx`".

---

## 4. As seis decisões — ✅ TOMADAS em 2026-08-12

Todas as seis foram decididas na opção recomendada. O texto de cada uma fica
inteiro, com as opções recusadas: quem vier depois precisa saber o que foi
considerado e descartado, não só o que ficou.

| | Decisão | Escolha |
|---|---|---|
| D1 | Forma no Query Plan | **(a)** `group_by: [{col, trunc}]` |
| D2 | Truncamentos | **Quatro**: `week`, `month`, `quarter`, `year` (sem `day`) |
| D3 | Rótulo do período | **(a)** ISO ordenável no executor + formatação BR no front |
| D4 | Chat agora? | **(a)** Dashboard primeiro, chat depois + 2 registros no `TODOS.md` |
| D5 | Fuso horário | **Não converter**, e escrever isso no comentário |
| D6 | Linha sem data | **(a)** Rotular "Sem data" |

### D1 — Forma do período no Query Plan → ✅ **(a)**

| Opção | |
|---|---|
| **(a) `group_by: [{"col":"data_da_venda","trunc":"month"}]`** | Estende o campo existente, mantém um conceito só: "agrupe por isto". **ESCOLHIDA** — inalterada em relação à v1 |
| (b) Campo novo `period_by` | `extractColumns` precisaria aprender o campo novo do mesmo jeito: não reduz trabalho nem risco, só cria segunda forma de dizer a mesma coisa |
| (c) String convencionada `"month(data_da_venda)"` | Mini-linguagem dentro de string, com regex nos dois lados. É a dívida do keyword-match em outra roupa |

### D2 — Quais truncamentos → ✅ **quatro: `week`, `month`, `quarter`, `year`**

A v1 recomendava cinco, incluindo `day`. **Decidido tirar o `day`**, por
consistência com o argumento que ela própria usa contra a opção (c) da D1:
agrupar pela coluna crua já agrupa por dia, e os dois rótulos **divergem** —
`_serialize_df` renderiza data como `%d/%m/%Y` (`05/01/2026`), e um período `day`
sairia `2026-01-05`. Duas formas de pedir a mesma coisa, com duas respostas
diferentes na tela.

**A preocupação da D2 da v1 com a semana era um alarme falso, e está resolvida por
medição:**

> v1: "semana começa na segunda no Brasil e no domingo no padrão ISO usado pelo
> pandas por omissão."

```
to_period('W')  ->  dtype = period[W-SUN]
2026-01-05      ->  2026-01-05/2026-01-11     (segunda -> domingo)
```

`W-SUN` significa semana que **termina** no domingo, isto é, **começa na segunda**.
O padrão do pandas já é a convenção brasileira — que também é a ISO 8601, que
começa na segunda. **Não há o que decidir nem o que configurar.** Fica escrito aqui
para ninguém "consertar" depois.

### D3 — O rótulo do período → ✅ **(a)** ⚠️ decisão nova, e tem uma armadilha

A v1 pedia rótulo legível (`2026-01`, `2026-S03`) sem dizer qual, e o rótulo óbvio
para semana **mente**. Medido:

```
2027-01-03  ->  período 2026-12-28/2027-01-03
                p.year=2027  p.week=53   ->  "2027-S53"
                ISO real = 2026-W53              <-- DIVERGE
```

`f"{p.year}-S{p.week:02d}"` produz `2027-S53`: semana 53 de um ano que acabou de
começar. E `2027-S53` ordena no extremo **direito** de 2027, então a linha
desenharia a primeira semana do ano no fim dele.

**E há uma restrição que decide a questão: o rótulo tem que ser ordenável como
texto.** O `order_by` do executor ordena a coluna de saída, e o gráfico de linha
desenha na ordem das linhas. Um rótulo `jan/2026` ordenaria alfabeticamente —
`abr`, `ago`, `dez`, `fev`… — e a linha sairia embaralhada, sem nenhum erro visível
no caminho.

| Opção | |
|---|---|
| **(a) ISO ordenável no executor + formatação brasileira no front** | Executor emite `2026-01` / `2026-01-05` / `2026Q1` / `2026`; `VizLinha`/`VizTabela` exibem "jan/2026", "1º tri/2026". Ordena sempre certo, e a tradução mora onde as outras traduções já moram (`formato.ts`). **ESCOLHIDA** |
| (b) ISO cru na tela | Zero trabalho no front, mas `2026Q1` num dashboard brasileiro é vazamento de formato técnico, do mesmo tipo que o Agente C foi instruído a não fazer com nome de coluna |
| (c) Rótulo brasileiro no executor | **Não fazer.** Quebra a ordenação em silêncio |

Semana, dentro da (a): rotular pela **data de início do período** (`2026-01-05`).
Não mente, ordena certo, e dispensa código de calendário próprio.

### D4 — O chat também ganha isso agora? → ✅ **(a)**

| Opção | |
|---|---|
| **(a) Dashboard primeiro, chat depois** | O executor passa a suportar; só o `dashboard-agent` aprende a gerar. Zero risco de regressão no caminho mais exercitado do produto. **ESCOLHIDA** |
| (b) Os dois na mesma fase | "Quanto vendemos por mês" é pergunta óbvia no chat e a capacidade estaria lá — mas mexe no prompt do Agente A |

Decidida a (a), portanto: registrar no `TODOS.md` **duas** coisas, não uma. A v1 lembrou da primeira:
o executor terá capacidade que o chat não usa, e ligar é só prompt. A segunda é a
descoberta da §1: **o Agente A do chat não recusa agrupar por data**, então "por
mês" no chat hoje já devolve ruído por dia truncado no `limit` 200.

### D5 — Fuso horário → ✅ **não converter, e escrever isso**

As datas chegam sem fuso (`naive`) e o agrupamento usa o dia como está na planilha.
É o comportamento certo para dado de negócio brasileiro, mas precisa estar no
comentário — senão a primeira venda de 1º de março às 23h que "aparece em
fevereiro" vira investigação. Inalterada em relação à v1.

### D6 — Linha sem data → ✅ **(a)** ⚠️ decisão nova

`to_period` sobre `NaT` devolve `NaT`, e `groupby(dropna=False)` — que é o que o
executor usa — **mantém o grupo**. Convertido para string, o rótulo sai
literalmente **`nan`**.

| Opção | |
|---|---|
| **(a) Rotular "Sem data"** | Honesto e visível. Coerente com a filosofia do arquivo: coluna ausente levanta erro em vez de sumir, filtro vazio é recusado em vez de virar tudo-verdadeiro. **ESCOLHIDA** |
| (b) Descartar as linhas sem data | O total do gráfico deixa de fechar com o total da base, em silêncio. É exatamente o erro que o `_grouped_agg` se recusa a cometer com coluna ausente |
| (c) Deixar `nan` | Vaza representação interna para o usuário final |

---

## 5. Etapas

Cada etapa tem D.O.D. verificável. Nenhuma começa antes de a anterior estar verde.
**A ordem mudou em relação à v1** — ver §7.

### ⭐ Decidido em 2026-08-12: a fase sai em DOIS PRs

| PR | Etapas | Toca | Publica Edge Function? |
|---|---|---|---|
| **PR 1 — endurecimento** | 0, 1, 2 | só `query_engine/pandas_executor.py` + testes | **Não. Nenhuma.** |
| **PR 2 — a feature** | 3, 4, 5, 6 | executor, `_shared/`, front, prompt | Sim (ver §8) |

**Por que dividir.** O PR 1 não adiciona feature: ele conserta um bug que já existe
hoje (o 500 do lote da §2), e o conserta **antes** de a fase introduzir a forma que
o dispara. É a Etapa 2 do §7, agora com fronteira de PR em volta. Três consequências
que valem a cerimônia:

1. **O PR 1 não publica Edge Function nenhuma** — nem a do chat, nem as do dashboard.
   A decisão sobre republicar `ai-plum-chat` (§8) **não precisa ser tomada no PR 1**;
   ela é inteira do PR 2.
2. Se algo quebrar, o raio é ~20 linhas num arquivo, com 227 testes de baseline
   apontando o antes e o depois.
3. Se a fase parar depois do PR 1, o produto sai **melhor** do que entrou, e nada
   pela metade fica em produção.

⚠️ **O PR 1 ainda publica o Lambda** (o CI publica ao entrar na branch principal), e
o Lambda é compartilhado com o chat. Não existe jeito de evitar isso — é um Lambda
só. A contenção é que a mudança é aditiva e os 227 passam sem edição. Ver §6, R1.

### Etapa 0 — Ambiente local e baseline · ✅ FEITA em 2026-08-12

A contenção do R1 é "a suíte atual passar **sem edição**". Não dava para honrar
isso: `python -m pytest query_engine/tests` terminava em
`Interrupted: 2 errors during collection` (`cachetools` ausente derrubando
`test_sheets.py` e `test_endpoint.py`, e com eles a suíte inteira), e o Python da
máquina era 3.14 com pandas 3.0.1 contra os `2.2.3`/`3.12` que o Lambda e o CI
usam. A suíte que mais importa nesta fase era a que não rodava.

Feito: venv em Python 3.12 com as versões fixadas, e `.venv/` no `.gitignore`.

E um segundo problema apareceu na mesma conferência: **`npm run build` falhava**, com
`Rollup failed to resolve import "react-markdown"` em `RespostaMarkdown.tsx`. Não era
a branch quebrada — o pull de hoje trouxe `react-markdown` e `remark-gfm` no
`package.json` e no lock (`5dd06ff`, o par indivisível do Agente C), e o
`node_modules` local estava anterior a isso. `npm install` resolveu. Vale registrar
porque o sintoma acusa o arquivo errado: parece código novo com import inválido, e é
dependência não instalada.

**Baseline registrado — é contra estes números que a regressão se mede:**

| Portão | Resultado | Como rodar |
|---|---|---|
| `pytest` | **227 passaram** (7 módulos, 0 erro de coleta) | `cd query_engine && ../.venv/Scripts/python.exe -m pytest -q` |
| `vitest` | **96 passaram** (4 arquivos; `query_plan.test.ts` = **48**) | `npm test` |
| `build` | **exit 0**, 2462 módulos | `npm install && npm run build` |

⚠️ A v1 falava em "os 54 testes atuais" de `query_plan.test.ts`. São 48.

⚠️ `query_engine/__pycache__/*.pyc` estão **rastreados** no git (dívida
pré-existente, o `.gitignore` diz "commitando a pasta mas não o resto"). Rodar
pytest os modifica. `git restore query_engine/__pycache__/` antes de cada commit,
ou eles entram no PR como ruído binário.

**D.O.D.:** ✅ os três portões verdes, os números acima anotados, `git status` sem
nada além do esperado. Conferido em 2026-08-12 na branch `feat/fase-5b-agrupar-por-periodo`.

### Etapa 1 — Provar o comportamento de hoje · P

Um teste que documenta a verdade medida na §2: forma objeto em `group_by` hoje
**escapa como `TypeError` e viraria 500 do lote**, não `MissingColumnError`.

Este teste é a rede da fase, e a v1 o teria escrito afirmando a coisa errada.

**D.O.D.:** teste em `query_engine/tests/` verde afirmando `TypeError` (não
`ExecutorError`) para item de `group_by` que não é string. Ele será **invertido**
na Etapa 2 — passando a exigir um `ExecutorError` nomeado — e essa inversão é a
prova de que a trava de tipo entrou.

### Etapa 2 — Trava de tipo em `group_by` · P

**Independente do resto da fase, e a única com valor próprio:** fecha a quarta
ocorrência do padrão "tipo inesperado → 500 do lote" *antes* de introduzir a forma
que o dispara. Se a fase parar aqui, o produto fica melhor do que começou.

- Item de `group_by` que não é string nem objeto reconhecido → `ExecutorError`
  nomeado, com mensagem que diz o que veio.
- Objeto sem `col`, ou com `col` não-string → `ExecutorError` nomeado.

**D.O.D.:** o teste da Etapa 1 invertido e verde. Os 227 anteriores **sem edição**.

### Etapa 3 — `pandas_executor.py` aprende `trunc` · M

- `group_by` aceita item string (comportamento atual, **intocado**) ou `{col, trunc}`.
- Rótulo materializado como **string na própria coluna**, depois do `where` (§3).
  `_serialize_df` não muda.
- `trunc` sobre coluna que não é data → `ExecutorError` nomeado, nunca conversão
  silenciosa. **Inclui o papel `ano`** (ver §6, R6): `Int64` não tem `.dt`, e o
  `AttributeError` seria outro 500.
- `trunc` fora do enum de quatro → `ExecutorError` nomeado.
- Linha sem data conforme a D6.

**D.O.D.:** `pytest` verde, incluindo **todos** os casos de erro. O caminho antigo
(`group_by` com strings) continua passando **sem nenhuma alteração nos testes
existentes** — é a prova de que o chat não regrediu.

### Etapa 4 — `_shared/query_plan.ts` extrai da forma objeto · P

`addCol` continua ignorando não-strings (é a proteção contra plano malformado); o
laço de `group_by` é que passa a reconhecer `{col}`.

**D.O.D.:** `npm test` com casos novos em `query_plan.test.ts` — forma string,
forma objeto, objeto sem `col`, objeto com `col` não-string, objeto aninhado. Os
**48** atuais seguem verdes, e os 96 do total também.

### Etapa 5 — `VizLinha.tsx` e as quatro whitelists · M

**Aqui `recharts` finalmente se justifica**, ao contrário de `bar` e `stacked_bar`:
linha tem eixo, escala e domínio temporal de verdade.

Conferido em 2026-08-12, e é boa notícia: **nenhuma dependência nova é necessária.**
`recharts@^2.15.4` já está no `package.json` e instalado, e o wrapper shadcn
`src/components/ui/chart.tsx` já o importa. O `VizBar.tsx` apenas **menciona**
recharts num comentário (não importa nada) para registrar por que optou por CSS —
e esse mesmo comentário já prevê este momento: *"Ele continua certo para `line` e
`stacked_bar`, que têm eixo e escala de verdade."*

Regras herdadas do `DESIGN.md`, com as seções reconferidas em 2026-08-12 (o arquivo
mudou no pull de hoje):

- **§4 "Especificação de marca":** linha de 2px com junção e ponta arredondadas;
  marcador/ponto final ≥8px com anel de 2px na cor da superfície; gridline de 1px
  sólida e recessiva, **nunca tracejada**.
- **§10 item 5:** nunca dois eixos Y no mesmo gráfico (repetido no fim da §3).
- **§10 item 8:** nunca número em cada ponto — daí o rótulo direto seletivo.
- **§8 "Responsivo", regra que a v1 não citou:** abaixo de 640px o eixo X reduz
  para **primeiro/meio/último**.
- **§9 "Acessibilidade":** `table` continua disponível para qualquer resultado —
  `formasCompativeis` já garante, e não pode deixar de garantir para período.

Mais a peça 4 (`CardNaTela` sabe se é período) e os quatro lugares de `viz` da §3.

**D.O.D.:** card com `line` desenha a série; o alternador oferece linha **só** quando
o `group_by` é de período; `npm run build` passa; um card `bar` e um `kpi` existentes
continuam idênticos na tela.

### Etapa 6 — Prompt do `dashboard-agent` · P

**Última, e só depois da 5 estar na tela.** Sai a recusa da regra 3; entra a forma
nova, com instrução de escolher o truncamento pela pergunta ("por mês" → `month`)
e de usar `viz: "line"` quando o `group_by` for de período.

**D.O.D.:** "faturamento por mês" gera plano válido e a prévia mostra o número. Uma
pergunta categórica ("faturamento por loja") continua gerando `bar` — a prova de
que o prompt novo não capturou o caso antigo.

---

## 6. Riscos

| | Risco | Contenção |
|---|---|---|
| **R1** | Regressão no chat: o executor é o mesmo | O caminho antigo não muda. A prova é os **227** passarem **sem edição** — teste alterado junto com o código não prova nada |
| **R2** | Plano malformado derruba o **dashboard inteiro** (§2), não um card | Etapa 2, **antes** de introduzir a forma que dispara |
| **R3** | Semana no dia errado | **Alarme falso, resolvido por medição** (D2). O padrão do pandas já começa na segunda |
| **R4** | Rótulo de semana mente na virada de ano, e a linha desenha fora de ordem | D3(a): ISO ordenável no executor, data de início para semana |
| **R5** | Base sintética não testa mês (é toda de janeiro/2026) | §7 — semana na base de vendas, com gabarito já conferido |
| **R6** | `trunc` sobre coluna de papel `ano` → `AttributeError` → 500 | Etapa 3 recusa com erro nomeado. **A base de estudos é exatamente esse caso** — ver §7 |
| **R7** | Card publicado como `kpi` mostrando `2026-01` gigante | Etapa 6 **depois** da 5, e as quatro whitelists juntas |
| **R8** | `_shared/query_plan.ts` divergente entre os três consumidores | §8: publicar os três e conferir com o grep do `/body` |
| **R9** | **Período apaga o sinal do `TODOS.md` #12** | Ver abaixo — precisa de aceite explícito |

### R9, que a v1 tratava como higiene de teste

O `TODOS.md` #12 é a planilha com **Local** = Estados Unidos, que troca dia com mês
nos dias 1 a 12, em silêncio. Medido em produção em 2026-08-11, **nesta mesma base
de vendas**.

Hoje existe um tell visível: o card agrupado por data mostrou `01/12/2026` onde
devia estar `12/01/2026`, e alguém percebeu. **Com `trunc: month`, uma venda de 5
de janeiro cai em `2026-05` e não sobra data estranha para ninguém notar.** O
gráfico ganha cara de autoridade e está errado.

A v1 registrou isso como lembrete de teste na §7 ("conferir o Local da planilha").
É risco de produto da feature: ela **remove o sintoma** de um bug conhecido e não
corrigido. Não é bloqueante — mas é aceite consciente, e pertence aqui.

---

## 7. Ordem, e por que ela mudou

A v1 dizia "2 → 1, com a 4 em paralelo (é só front)". Duas correções:

**A ordem correta é: Etapa 2 → 3 → 4 → 5 → 6.**

- **A trava de tipo vem primeiro** (Etapa 2), porque é a contenção do R2 e vale por
  si só. Introduzir a forma nova antes dela é abrir a porta antes de instalar a
  fechadura.
- **A 6 (prompt) é a última, e não pode ser paralela à 5.** A v1 permitia a 4 (front)
  em paralelo, o que permitia o prompt chegar antes do componente — e aí o card
  publica como `kpi` (R7). O prompt é o único gatilho que faz a forma nova existir
  em produção: enquanto ele não subir, nada gera `{col, trunc}`, e todo o resto pode
  ir sendo publicado com segurança.

Corolário útil: **as etapas 2, 3 e 4 são invisíveis em produção.** Elas ampliam o
que o sistema aceita sem que nada passe a gerar. Isso dá uma janela para validar o
executor com prévia manual antes de qualquer usuário poder criar um card de período.

---

## 8. Verificação local, deploy e rollback

### Antes de qualquer commit

```sh
cd query_engine && ../.venv/Scripts/python.exe -m pytest -q   # 227 passaram
cd ..            && npm test                                   # 96 passaram
                    npm run build                              # exit 0 (typecheck incluído)
                    git restore query_engine/__pycache__/      # ver Etapa 0
                    git status --short                          # nada inesperado
```

Regressão é qualquer número **abaixo** desses. Teste editado para passar não conta
como verde.

### Deploy — a peça 7, que a v1 não tinha

**Nada disto vale para o PR 1** — ele não altera `_shared/` e não publica Edge
Function nenhuma. Esta seção é toda do PR 2.

⚠️ **Decisão em aberto, e é do PR 2: republicar `ai-plum-chat`?**

Cada função carrega uma **cópia** de `_shared/query_plan.ts`, tirada no momento em
que ela é publicada — não há compartilhamento em runtime. Mudar o arquivo e publicar
só o dashboard deixa o chat com a cópia antiga.

| | Consequência |
|---|---|
| **Não republicar o chat** | A cópia antiga não sabe ler `{col, trunc}` — mas o chat **nunca emite** essa forma, porque o prompt dele não muda (D4). Comportamento idêntico ao de hoje. Custo: divergência intencional em `_shared/`, contra o checklist do `CLAUDE.md` §9. A armadilha futura precisa ficar escrita: **quem for ligar período no chat tem que publicar o chat primeiro** |
| **Republicar os três** | Sem divergência, segue o checklist. Mas republicar sobe o repositório **por cima do que está rodando**, e o `CLAUDE.md` §1 registra que os dois já divergiram (publicação manual sem commit). É a única das duas opções que pode quebrar o chat **hoje** |

Conferir antes de decidir: se o `ai-plum-chat` implantado bate com o repositório.
Se bater, republicar é seguro e o checklist ganha. Se não bater, reconciliar primeiro
— nunca publicar por cima às cegas.

Quando a decisão for "publicar", são **três**:

```sh
npx supabase functions deploy ai-plum-chat     --project-ref rjwidarrsykufuifzunu
npx supabase functions deploy dashboard-execute --project-ref rjwidarrsykufuifzunu
npx supabase functions deploy dashboard-agent   --project-ref rjwidarrsykufuifzunu
```

Publicar um só deixa **cópias divergentes do interpretador de RBAC em produção**.
E o `CLAUDE.md` §1 registra, desde 2026-08-12, que o check "Supabase Preview"
publica com **cobertura desconhecida** — uma função que você não mexeu pode ter
sido republicada pelo push de outra pessoa. Então conferir não é opcional:

```sh
# ezbr_sha256 tem que MUDAR (version sobe sozinho em troca de secret — não serve de prova)
mcp__supabase__list_edge_functions

# e os três têm que dar a MESMA contagem
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/rjwidarrsykufuifzunu/functions/<nome>/body" \
  | grep -a -c "walkArithmetic"
```

**Ordem de deploy:** o Lambda (`query_engine/`, via CI ao entrar na branch
principal) **antes** das Edge Functions. Se o interpretador aprender a forma nova
antes do executor, um plano autorizado pelo RBAC quebra no Python. Na prática o CI
já força isso: ele só publica no Lambda se `npm test` **e** `pytest` passarem.

### Rollback

Nada nesta fase é destrutivo, e é de propósito:

- **Sem migration.** `line` já está no `CHECK` de `dashboard_cards.viz` desde
  `20260806230000`. Nenhuma coluna criada, nenhuma apagada, nenhum dado alterado.
- **Sem alteração de dado existente.** Cards `kpi`/`bar`/`stacked_bar`/`table` já
  gravados não são tocados. Snapshots antigos continuam válidos: a chave é o
  `permissions_fingerprint`, que não muda.
- **Reversão do prompt basta para estancar.** Republicar o `dashboard-agent`
  anterior faz parar de nascer card de período, e os já publicados continuam
  desenhando (o executor segue aceitando a forma).
- **Reversão completa** = reverter o merge + republicar as três funções + deixar o
  CI republicar o Lambda. Cards de período criados na janela passariam a dar
  `ExecutorError` nomeado (não 500, graças à Etapa 2) e apareceriam como card com
  erro, honestamente.

### PR

Branch `feat/fase-5b-agrupar-por-periodo` → `plataforma`. O CI
(`.github/workflows/query-engine.yml`) roda `npm test` + `pytest` em todo PR que
toque `query_engine/`, `supabase/functions/` ou `src/lib/` — esta fase toca os três.

---

## 9. Gabaritos de verificação

### Semana, na base de vendas — gabarito pronto e **conferido em 2026-08-12**

`testes/chat/bases/vendas_loja_roupas_teste.csv` é toda de janeiro/2026, então
**mês ali devolve um ponto** e não prova nada sobre uma linha. Semana devolve
quatro. Conferi o gabarito de `testes/chat/teste-chat-vendas-roupas.md` §2 contra
`to_period('W')` — **bate exatamente**, inclusive na contagem de pedidos:

| Período do pandas | Soma | n | Gabarito §2 |
|---|---|---|---|
| `2026-01-05/2026-01-11` | 2.227,91 | 10 | 05–09/01 · R$ 2.227,91 ✅ |
| `2026-01-12/2026-01-18` | 2.387,92 | 10 | 12–16/01 · R$ 2.387,92 ✅ |
| `2026-01-19/2026-01-25` | 2.274,55 | 10 | 19–23/01 · R$ 2.274,55 ✅ |
| `2026-01-26/2026-02-01` | 2.338,89 | 10 | 26–30/01 · R$ 2.338,89 ✅ |

Total 9.229,27 em 40 linhas. **Quatro pontos bastam para uma linha, e o gabarito já
existe** — é a melhor verificação disponível nesta fase.

### ⚠️ A segunda base da v1 é uma armadilha — não usar como estava

A v1 recomendava `tabela-de-estudos.csv` para mês e ano, via `data_conclusao`.
Inspecionei a coluna:

```
'DATA CONCLUSÃO': ['2005', '2000', '2001', '2006', '2003', '01/12/2005', '2008', ...]
```

Ela **mistura ano puro com data completa** — é literalmente a coluna para a qual o
papel `ano` e o `_fmt_ano` foram escritos (`pandas_executor.py:905` documenta este
caso, nesta base). Tipada como `ano`, ela vira `Int64`, e:

```
Int64.dt.to_period('Y')
  -> AttributeError: Can only use .dt accessor with datetimelike values
```

Outro `AttributeError`, outro 500 do lote. Duas consequências:

1. É o R6, e a Etapa 3 tem que recusar com erro nomeado.
2. **`trunc: "year"` ali não é só quebrado, é desnecessário:** agrupar por essa
   coluna como string simples já devolve baldes de ano hoje.

### A lacuna de verificação que sobra, dita com precisão

Dos quatro truncamentos da D2, **dois têm gabarito em base real e dois não têm:**

| `trunc` | Base real | Gabarito |
|---|---|---|
| `week` | ✅ vendas (4 grupos) | ✅ conferido à mão, §9 acima |
| `month` | ⚠️ vendas devolve **1 ponto** (base toda de janeiro) | prova o agrupamento, não a linha |
| `quarter` | ❌ nenhuma | — |
| `year` | ❌ nenhuma | — |

`quarter` e `year` precisariam de uma coluna de papel **`date`** cobrindo vários
anos, e **nenhuma base de teste atual tem isso** — a de estudos parece ter, mas é
papel `ano` (`Int64`), que é justamente o caso recusado.

**Decisão assumida:** `quarter` e `year` ficam cobertos **só por teste unitário
sintético** (DataFrame montado no teste, sem planilha). É cobertura honesta do
código — a lógica de `to_period` é a mesma para os quatro — mas não é validação de
ponta a ponta com número conferido por humano. Quem quiser fechar isso monta uma
base pequena de 12 a 20 linhas cruzando 3 anos. É a única lacuna que sobra, está
nomeada, e é pequena.

⚠️ **Lembrete que custou uma investigação inteira:** conferir o **Local** da
planilha de teste antes de qualquer conclusão sobre data (`TODOS.md` #12, e o R9).

---

## 10. Explicitamente fora de escopo

- **`meter`** — precisa de onde guardar uma meta; é migration e decisão de produto
- **Delta e tendência** (`higher_is_better` já existe e ninguém lê) — dependem do
  histórico de snapshots, que só começou a acumular em 2026-08-11
- **Comparar dois períodos no mesmo card** — é outra forma de plano, não outro `trunc`
- **Prompt do Agente A do chat**, se a D4 for (a)
- **Preencher períodos vazios** — um mês sem venda simplesmente não aparece, e numa
  linha isso desenha um salto que parece continuidade. Merece decisão própria
- **Corrigir o `TODOS.md` #12** (R9) — aceite consciente, não conserto
- **Destracking dos `.pyc`** (Etapa 0) — dívida pré-existente, não desta fase
- **`day` como truncamento**, se a D2 for aceita
