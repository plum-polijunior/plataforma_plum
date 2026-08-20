# Etapa 1 — plano de implementação

## Contexto

A Etapa 0 fechou e está validada em produção: `plum_logs` grava, os tokens vêm preenchidos, a saída
dos agentes é guardada e o teste que prova que o log não derruba a pergunta roda no `npm test`.
**Isso já é o B01 da tabela do V3** (`plum_logs` + `_shared/log.ts`) — a Etapa 1 começa no B02, com
nove blocos e ~6,5 semanas.

Este documento é o nível de **implementação**: o V3 é plano de etapa e o V7 é especificação do
`ad_hoc`, e ao conferir os dois contra o código apareceram seis coisas que não fecham — três delas
mudam o desenho de um bloco. A §A registra os achados, a §B resolve o que atravessa blocos, e a §C
detalha os nove.

**Decisões já tomadas** (perguntadas antes deste plano):

- **B02** classifica `group_by` também, **só no caminho `ad_hoc`**. Zero risco para os cards atuais.
- **B05** entrega a abstração agora; o adaptador Claude nasce escrito e inerte, e vira ativo quando
  existir `ANTHROPIC_API_KEY`.
- Plano cobre a **Etapa 1 inteira** em nível de implementação.

⛔ **Fora de escopo, sem exceção:** `dashboard-agent`, `dashboard-execute`, `ai-agents`, `/inicio`,
os cards. A regra do V3 continua: se uma mudança exigir mexer no `dashboard-agent`, ela está fora de
escopo ou está errada.

---

## §A · O que não fecha entre V3/V7 e o código

### A1 ⭐ A premissa do B02 está errada

O V3 e o V7 dizem: *"`min`/`max` sobre coluna de texto devolvem valor literal — 500 nomes de
clientes, um por grupo, sem consumir nada"*. **No caminho agrupado isso não acontece.**

`_coerce_numeric_for_agg` ([pandas_executor.py:714-724](query_engine/pandas_executor.py#L714-L724))
converte para número qualquer coluna não-numérica usada em `sum|avg|mean|min|max`. `min(cliente)`
agrupado devolve **`0`**, não o nome.

Quem expõe os 500 nomes é o **`group_by`** — que não é agregação nenhuma, e portanto a classificação
redutora×seletora não o alcança. Pior: colunas soltas no `select` viram **group_by implícito**
([pandas_executor.py:620-623](query_engine/pandas_executor.py#L620-L623)), então
`select: ["cliente", {"expr":{"agg":"count","col":"id"}}]` já lista a carteira inteira.

No caminho **escalar** (sem `group_by`) `min`/`max` sobre texto devolvem sim o literal
([pandas_executor.py:795-799](query_engine/pandas_executor.py#L795-L799)) — mas é **um** valor.

⚠️ **Efeito colateral do achado:** `min(coluna_de_texto)` agrupado devolvendo `0` é resposta **errada
em silêncio**, não proteção. Não conserto isso no B02 (consertar aumentaria o vazamento antes de a
regra existir) — vira pendência independente, como o bug do `DatabasePipeline`.

### A2 ⭐ `limit` não tem teto

V7 §4 diz `limit: 1..500`. O código é `plan.get("limit", 200)` + `df_out.head(limit)`
([pandas_executor.py:693-694](query_engine/pandas_executor.py#L693-L694)), **sem clamp**, e o
`query_plan.ts` só tipa o campo. Combinado com a isenção de orçamento que o V7 §3 dá a `agregado` e
`vocabulario`, `group_by [cliente] + count + limit 50000` entrega a base de clientes inteira **sem
consumir orçamento nenhum**. O orçamento do B10 nasce furado se o teto não entrar antes.

### A3 ⚠️ `column_roles` enviesa para `text`

`TYPE_TO_ROLE["nenhuma"] = "text"` e o default do `.get` também é `"text"`
([pandas_executor.py:1218-1233](query_engine/pandas_executor.py#L1218-L1233)). Coluna que o Agente
3 não classificou é `text`. Na **base suja** que a Etapa 0 §0.3 manda criar, isso é a maioria — uma
regra "seletora sobre texto consome orçamento" dispararia em coluna numérica não classificada.
Consequência: a classificação do B02 não pode se apoiar só em `roles`; precisa da **cardinalidade
real**, que só o executor conhece.

### A4 `std`/`median`/`var` já funcionam pela metade — e falham calados

No caminho agrupado o `func` vai direto para o `.agg()` do pandas
([pandas_executor.py:754](query_engine/pandas_executor.py#L754)) e funciona. No escalar,
`_scalar_agg` trata `sum|avg|mean|min|max|count` e **`return None`** para o resto
([pandas_executor.py:781-802](query_engine/pandas_executor.py#L781-L802)). *"Qual o desvio padrão do
faturamento?"* sem `group_by` devolve `null` **hoje**, sem erro. V7 §4 afirma que funcionam.

### A5 O B05 consolida um site, não quatro

As 4 URLs do Gemini estão em 3 funções — mas `ai-agents` e `dashboard-agent` são ⛔ intocáveis nesta
etapa. Só `ai-plum-chat` adota o `_shared/llm.ts`. E `_shared/` é empacotado **por função**, então
adotar nos outros depois exige republicar cada um.

**Não existe nenhuma chave Anthropic no repositório** — nem secret, nem código, nem referência a
`api.anthropic.com`. É pré-requisito 👤 que o V3 não lista.

⭐ **E há um laço com a Etapa 0:** `extrairUsoDeTokens` em
[log_core.ts](supabase/functions/_shared/log_core.ts) lê `usageMetadata`, que é formato **Gemini**.
A Anthropic devolve `usage.input_tokens`/`output_tokens`. Se o B05 não mover a extração de token
para dentro de cada adaptador, "custo por pergunta" — a métrica principal do log — volta a sair nula
no dia em que o planejador virar Claude.

### A6 A orquestração do `ad_hoc` não cabe onde a de hoje mora

Hoje quem orquestra é o **cliente**: `handleSendMessage`
([PlumChat.tsx:161-287](src/pages/PlumChat.tsx#L161-L287)) faz quatro `functions.invoke` em
sequência. O `ad_hoc` tem laço (2ª rodada do A3), coleta determinística que ela própria chama o
executor, e um desvio de desambiguação — não dá para espalhar isso pelo cliente sem expor a máquina
de estados inteira ao front. O V3 §1.0 já coloca `adhoc/` dentro do `ai-plum-chat`, mas não diz o
que isso implica: **o número de invocações muda, e a duração de cada uma muda.** Ver §B1.

---

## §B · Decisões que atravessam blocos

Resolver antes da primeira linha — mudar qualquer uma no meio custa refazer blocos.

### B1 ⭐ O `ad_hoc` roda em **duas** invocações, não uma

Uma invocação só encadearia A1 → A2 → coleta → A3 → resolvedor → autorizador → executor → A4: quatro
chamadas de LLM (duas em modelo caro) mais duas idas ao Lambda, tudo dentro do teto de parede da Edge
Function, com o usuário olhando um spinner sem nenhum sinal por um minuto.

**Decisão — dois `action`:**

| `action` | Faz | Devolve |
|---|---|---|
| `ad_hoc_planejar` | A1 → A2 (cache) → coleta determinística → A3 → resolvedor → autorizador | `{pedidos[], presuncoes[]}` ou `{desambiguacao}` ou `{bloqueado}` |
| `ad_hoc_executar` | executor → [2ª rodada do A3, máx. 1] → A4 | resposta em Markdown + presunções |

Isso mantém o padrão que o front já usa, dá dois pontos de progresso na tela ("entendendo a
base…" / "consultando…"), e preserva a premissa do `log.ts` de que **uma invocação enxerga um
pedaço**. A desambiguação sai cedo, na primeira chamada, sem gastar o modelo caro.

⚠️ **`turno_id` continua sendo um só para as duas chamadas.** É o que costura as ~7 linhas de log de
uma pergunta. `sessao_id` idem.

⚠️ **O cabeçalho do `log_core.ts` precisa ser corrigido no B06** — hoje ele diz "o `PlumChat.tsx`
chama a Edge Function uma vez por ação (`guard`, `plan_query`, `execute_plan`, `synthesize_answer`)",
e isso deixa de ser a lista completa.

### B2 Ordem de deploy: o Lambda vai sozinho, a Edge Function não

`query-engine.yml` publica o executor com `update-function-code` a **todo push** que toque
`query_engine/**`. A Edge Function é manual (I-03). Logo, para todo bloco que mexa nos dois:

⭐ **Toda mudança no executor é aditiva e retrocompatível com o payload atual.** Campo novo em
`PlanRequest` nasce com `default`, nunca obrigatório — senão o push do Python quebra a função que
ainda não subiu. É a mesma regra do V3 §0-bis, dita como restrição de ordem.

### B3 A classificação do B02 mora no **executor**, não no autorizador

Consequência direta de A1 e A3: a decisão depende da **cardinalidade real** da coluna, que só existe
depois de ler a planilha. O autorizador da Edge Function tem `allowed_columns` e `formatting_rules`,
e nenhum dos dois diz quantos valores distintos a coluna tem.

Custo aceito: o pedido é recusado **depois** da leitura do Sheets. A leitura já teria acontecido de
qualquer forma.

### B4 ⭐ O orçamento do B10 se apoia em `plum_logs` — mas com uma exceção

`plum_logs.linhas_brutas_entregues` já existe, a tabela é append-only e tem RLS. `SUM` dessa coluna
por (`user_id`, `dataset_id`, janela) **é** o orçamento — não precisa de tabela nova.

⚠️ **Mas o registrador engole os próprios erros de propósito** (é a regra da Etapa 0). Um orçamento
que se apoia numa escrita best-effort é um orçamento que se contorna fazendo o log falhar. Portanto:
**o débito de `registro`/`amostra` é uma escrita separada e verificada**, que falha o pedido se não
gravar. Todo o resto do log continua best-effort. São duas escritas com duas posturas, e a diferença
precisa estar escrita nos dois lugares.

### B5 O `vocabulario` do B04 e o teto do B02 são a mesma regra

`vocabulario` compila para `group_by [col] + count + order desc + limit 200` — que é exatamente o que
o B02 passa a barrar. Não são regras concorrentes: o teto de cardinalidade do B02 **é** o portão do
`vocabulario`. Uma constante, um lugar, dois consumidores.

---

## §C · Os nove blocos

Ordem mantida do V3. Cada bloco fecha pela §0.3 do V3 e produz `DIARIO.md` + `MANUAL.md` em
`zz_remake_implementation/execucao/B0X-.../`.

| # | Bloco | Depende | Sem | Alcança o legado? |
|---|---|---|---|---|
| 02 | Redutora × seletora + teto de cardinalidade + clamp de `limit` | — | 0,5 | só em modo observação |
| 03 | `metadados` | 02 | 0,5 | não (tipo de pedido novo) |
| 05 | `_shared/llm.ts` + adaptadores | — | 0,5 | sim (`ai-plum-chat` passa a usar) |
| 04 | `vocabulario` + resolvedor de entidade | 02, 03 | 1 | não |
| 06 | A1 + A2 + cache de A2 + **a chave** | 03, 05 | 1 | não |
| 07 | A3 + A4 + presunções | 04, 06 | 1,5 | não |
| 08 | Negação parcial por pedido | 07 | 0,5 | não |
| 09 | `agg` ampliado | 02 | 0,5 | sim (aditivo) |
| 10 | `registro` + `amostra` + orçamento | 02, 08 | 1 | não |

**B02, B03, B05 e B09 são paralelizáveis** entre si (B03 e B09 só dependem do campo que o B02 cria).

---

### B02 · Redutora × seletora, teto de cardinalidade, clamp de `limit`

**Arquivos:** `query_engine/security.py` (`PlanRequest.tipo`) · `query_engine/pandas_executor.py` ·
`query_engine/tests/` · `supabase/functions/_shared/query_plan.ts` (só a constante do teto).

1. **`PlanRequest` ganha `tipo: str = "agregado"`** — aditivo, com default, conforme §B2. É este
   campo que distingue `ad_hoc` de legado dentro do executor, e é ele que B03/B10 reaproveitam.
2. **Classificação por comportamento** (não whitelist — V6 decisão 4), numa tabela extensível:
   - *Redutoras* — `sum avg mean count std median var quantile` → livres.
   - *Seletoras* — `min max first last nunique` → sobre coluna de papel `text`, é valor literal.
3. ⭐ **Teto de cardinalidade sobre o resultado agrupado.** É o item que fecha A1: depois do
   `_grouped_agg`, se o número de grupos passar do teto (**200**, a mesma constante do `vocabulario`
   — §B5) e a coluna de agrupamento for de papel `text`, recusa. Vale para `group_by` explícito **e**
   para o implícito vindo de `direct_cols`.
4. **Clamp de `limit` em 500** (A2), aplicado sempre — este é o único item que vale para os dois
   caminhos, porque um `limit` acima de 500 não é comportamento de card nenhum que exista.
5. ⭐ **Modo observação no legado.** A regra completa roda também para pedidos sem `tipo`, mas em vez
   de recusar emite `logger.warning`. Custo zero, risco zero, e ao chegar no B08 saberemos por dado —
   e não por palpite — se dá para ligar de verdade no dashboard.

⚠️ **Este bloco entrega uma regra que nada exercita ainda** — o `ad_hoc` só nasce no B06. É o mesmo
formato do item adiado da Etapa 0, e por isso a cobertura é `pytest`, não teste manual. O modo
observação existe justamente para o bloco não ficar sem nenhum sinal de realidade por cinco semanas.

⛔ **Não mexer em `_coerce_numeric_for_agg`** (A1). Abrir pendência separada.

---

### B03 · `metadados`

**Arquivos:** `query_engine/metadados.py` (novo) · `main.py` · `pandas_executor.py` (reuso de
`roles_from_formatting_rules`) · testes.

Pedido `tipo: "metadados"`, sem Query Plan; `resolved_columns` traz as colunas pedidas e passa pelo
`assert_columns_allowed` como qualquer outro. Devolve, por coluna: `papel`, `distintos`, `nulos_pct`,
`min`, `max`; e por tabela: `n_linhas`.

⭐ **`n_linhas ÷ distintos` responde o grão sem olhar dado nenhum** — amostra aleatória pode, por
azar, não repetir data nenhuma; a razão nunca erra.

⚠️ **`min`/`max` só para papéis `number`, `date` e `ano`.** Sobre `text` é exatamente o vazamento de
valor literal que o B02 acabou de fechar — devolve `null`, e o `vocabulario` (B04, com teto e flag
própria) passa a ser a única porta para valor de texto. O V3 e o V7 não dizem isto.

⚠️ **E "zero linhas expostas" é quase verdade, não verdade.** `min`/`max` de coluna numérica ou de
data são valores reais da base — um por coluna. É o que uma descrição de base é, mas está escrito
aqui para ninguém repetir a frase achando que é literal.

---

### B05 · `_shared/llm.ts` + adaptadores

**Arquivos:** `supabase/functions/_shared/llm.ts` · `llm/gemini.ts` · `llm/claude.ts` ·
`llm/index.test.ts` · `ai-plum-chat/index.ts` (adoção).

`chamar({papel, sistema, prompt, schema})` → `{texto, json, tokens, modelo, provedor}`. Papel →
modelo em tabela: `porteiro`/`reconhecedor` → Flash; `planejador`/`interprete` → Claude quando houver
chave, Gemini enquanto não houver.

⭐ **A extração de token vira responsabilidade do adaptador** (A5). `extrairUsoDeTokens` sai do
`log_core.ts` e cada adaptador devolve `{entrada, saida}` já normalizado — Gemini lê
`usageMetadata.promptTokenCount`, Anthropic lê `usage.input_tokens`. O teste do `log_core` que hoje
cobre o formato Gemini migra junto.

⚠️ **Não abstrair demais** (V3). Prompt, saída estruturada, temperatura e contagem de token são o
contrato; cache de prompt, tool use e streaming ficam de fora — unificá-los sai mais caro que dois
clientes separados.

⚠️ Só `ai-plum-chat` adota (A5). O `dashboard-agent` e o `ai-agents` seguem com a URL inline, e isso
fica escrito no `DIARIO.md` como dívida conhecida, não como esquecimento.

👤 **Pré-requisito, sem bloquear:** criar `ANTHROPIC_API_KEY` como secret. Sem ela, a tabela
papel→modelo cai para Gemini e o log grava `provedor: "google"` — o caminho continua funcionando e a
troca depois é uma linha.

---

### B04 · `vocabulario` + resolvedor de entidade

**Arquivos:** `supabase/functions/ai-plum-chat/adhoc/entidade.ts` (novo, **sem LLM**) ·
`_shared/texto.ts` (novo) · migration da flag · `query_engine/` (nada — §B5) · testes nos dois lados.

O pedido `vocabulario` compila para um Query Plan comum: `group_by [col] + count + order desc +
limit 200`. **Zero mudança no executor**, com o teto do B02 servindo de portão.

⭐ **A armadilha que decide o bloco: a normalização dos dois lados precisa ser a mesma.** O executor
já normaliza os dois lados de `=`, `!=`, `contains` e `in` com `_strip_accents` — *trim + upper + sem
acento* ([pandas_executor.py:814-822](query_engine/pandas_executor.py#L814-L822),
[957-999](query_engine/pandas_executor.py#L957-L999)). Se o resolvedor em TypeScript normalizar de
outro jeito (minúsculas, NFKD, tirando pontuação, colapsando espaço duplo), ele escolhe um literal
que o `where` depois não casa, e a pergunta volta com zero — que é exatamente o sintoma que o bloco
existe para matar.

**Decorrência boa:** como `=` já ignora caixa e acento, o resolvedor **não precisa acertar a grafia
exata** — só a distância de edição sobre os ≤200 valores, em cima da mesma normalização.

`normalizarNomeDeColuna` ([src/lib/colunas.ts:45](src/lib/colunas.ts#L45)) **não serve**: é para
cabeçalho, e `src/lib/` não é empacotado nas Edge Functions. O `_shared/texto.ts` nasce espelhando o
`_strip_accents` do Python, com um teste que compara os dois em uma lista de casos.

Dois candidatos plausíveis → **pergunta**, não escolhe. Status `desambiguacao` já existe no
`plum_logs`. Travas: coluna em `allowed_columns`, cardinalidade ≤200 (acima disso é identificador,
recusa), flag `vocabulario_exposto` **default `false`** — migration nova, aditiva, com bloco de
verificação.

---

### B06 · A1 + A2 + cache de A2 + a chave

**Arquivos:** `adhoc/porteiro.ts` · `adhoc/reconhecedor.ts` · `adhoc/prompts/{a1,a2}.md` ·
`ai-plum-chat/index.ts` (o `action: "ad_hoc_planejar"`) · migration do cache · `PlumChat.tsx` ·
`log_core.ts` (o cabeçalho, §B1).

⭐ **É aqui que a chave `remake_habilitado` ganha o primeiro consumidor** — o item que a Etapa 0
adiou de propósito por não haver o que gatear. O resolvedor lê a coluna a partir do
`organization_id` do JWT, e o `plum_logs.caminho` passa a valer de verdade.

⭐ **E é aqui que o critério §0.5 do V3 vira exigível:** uma pergunta com a chave ligada e outra com
ela desligada, e o log mostrando `ad_hoc` e `legado`. Foi o critério que a Etapa 0 não pôde cumprir.

**Cache do A2:** chave `(dataset_id, versão do dicionário)`, não a pergunta — o A2 depende só da
base. Tabela própria, pequena, com RLS por organização. O precedente do reuso de plano
([src/lib/plano-cache.ts](src/lib/plano-cache.ts)) resolve outro problema (repetição da mesma
pergunta) e **não** serve de molde aqui. `cache_hit_a2` já existe no `plum_logs`.

⚠️ **A1 e A2 continuam separados** (V7 §1): fundidos, o cache do A2 morre.

---

### B07 · A3 + A4 + presunções

**Arquivos:** `adhoc/planejador.ts` · `adhoc/interprete.ts` · `adhoc/prompts/{a3,a4}.md` ·
`ai-plum-chat/index.ts` (`action: "ad_hoc_executar"`) · `PlumChat.tsx` (as duas chamadas + o bloco de
presunções na tela).

O bloco mais caro, e o prompt do A3 é **o artefato mais importante da etapa** (V7 §9). O texto da V7
§5.3 é ponto de partida, não entrega. Um arquivo por prompt — diff de prompt enterrado num `index.ts`
de 500 linhas é ilegível.

`pedidos[]` vira `plans[]` no payload do executor: a estrutura em lote já existe
([main.py:107-134](query_engine/main.py#L107-L134)) e é exatamente a forma de que o A3 precisa —
`card_id` passa a ser `p0`, `p1`, … em vez do literal `"chat"`.

**Amostra com semente determinística:** `df.sample(5, random_state=hash((dataset_id, len(df))))`.
Mesma base → mesma amostra → mesmo plano. Aleatório puro quebraria reprodutibilidade, que é metade da
razão de o arquiteto existir.

**2ª rodada do A3: no máximo uma**, dentro do `ad_hoc_executar`, contada em `rodada_extra` no log.

⚠️ **O A4 nunca faz conta (R-13).** É a regra escrita depois de um incidente real, e ela vem **antes**
de qualquer instrução de formatação no prompt — a mesma ordem que o Agente C usa hoje.

⚠️ **Toda decisão de produto que o A3 tomar sozinho vira entrada em `PENDENTE-DECISAO.md`** (V3
§0.2): escolhe, registra e segue, nunca trava.

---

### B08 · Negação parcial por pedido

**Arquivos:** `adhoc/autorizador.ts` · `adhoc/prompts/a4.md` · testes.

Barato porque **metade já existe**: o executor já responde por card, e um card proibido devolve
`forbidden` sem derrubar os outros ([main.py:118-131](query_engine/main.py#L118-L131)). O que falta é
o lado da Edge Function: um pedido negado não pode abortar o turno; os `negados[]` vão para o A4, que
responde o que dá e diz honestamente o que não pôde.

Critério: cargo sem `margem` pergunta sobre margem e recebe resposta parcial, não erro.

Aqui também se decide, com o dado do modo observação do B02, se a regra de cardinalidade passa a
valer no legado.

---

### B09 · `agg` ampliado

**Arquivos:** `pandas_executor.py` · `_shared/query_plan.ts` (o `p` do `quantile`) · testes.

1. ⚠️ **`_scalar_agg` precisa das novas** (A4). Hoje devolve `None` calado para `std`, `median`,
   `var`, `nunique`, `first`, `last`. O caminho agrupado já funciona, o escalar não — e a falha é
   silenciosa, que é o pior formato.
2. ⚠️ **`quantile` exige `p` na gramática e no executor.** `.agg("quantile")` devolve a mediana **em
   silêncio**: "percentil 90" viraria "percentil 50" sem erro. `{"agg":"quantile","p":0.9}` nos dois
   lados, no mesmo commit.
3. As novas entram na tabela do B02 como **redutoras** — é o motivo de aquela tabela ter nascido
   extensível.

Aditivo: nenhum card usa. Publicação = push do Python (§B2).

---

### B10 · `registro` + `amostra` + orçamento

**Arquivos:** `pandas_executor.py` · `security.py` · `adhoc/orcamento.ts` (novo) ·
`_shared/log.ts` (a escrita verificada, §B4) · testes.

⚠️ **É o único bloco que mexe no caminho que devolve linha sem agregação** — toda a discussão de
privacidade cabe num diff, que é o desenho do V7 §3 e a razão de ele valer a pena.

- `registro` — linhas identificadas por filtro explícito, **≤5**. `amostra` — primeiras N, **≤5**.
- Orçamento **por (usuário × dataset × janela)**, 200 linhas brutas, resolvido no servidor.
- ⭐ **Não usar `sessao_id`.** Ele é uuid do cliente, renovado a cada F5 — amarrar o orçamento a ele
  dá cota nova a cada recarga. O aviso já está escrito em três lugares desde a Etapa 0; este é o
  bloco onde ele deixa de ser aviso e vira erro se ignorado.
- **Fonte do saldo:** `SUM(plum_logs.linhas_brutas_entregues)` na janela (§B4). Sem tabela nova.
- ⚠️ **O débito é escrita verificada, não best-effort** (§B4) — se não gravar, o pedido falha.
- ⭐ **Teto por pedido é o erro fácil:** 200 pedidos × 5 linhas é a base inteira sem violar teto
  nenhum. O orçamento é da janela, e o contador soma antes de aprovar o lote.

---

## §D · Critério de pronto da etapa

O do V3 §1.4, com dois acréscimos vindos dos achados:

| # | Verificação | Quem |
|---|---|---|
| 1 | ⭐ As **25–30 perguntas de avaliação** passam, cada uma com coluna→conceito, nº de linhas e presunções | 👤 + 🤖 |
| 2 | Pergunta com nome torto **desambigua** em vez de devolver zero | 🤖 |
| 3 | Cargo sem `margem` recebe resposta parcial honesta | 🤖 |
| 4 | Orçamento de 200 linhas barra na 201ª, com log | 🤖 |
| 5 | ⭐ **`group_by` sobre coluna de texto com >200 distintos é recusado no `ad_hoc`** — substitui o "`min` sobre texto consome orçamento" do V3, que descrevia um vazamento que não é o que existe (A1) | 🤖 |
| 6 | Cards de teste batem número a número | 🤖 |
| 7 | `plum_logs` permite calcular custo por pergunta — **inclusive com o planejador em Claude** (A5) | 🤖 |
| 8 | Uma pergunta com a chave ligada e outra desligada aparecem no log como `ad_hoc` e `legado` (§0.5 do V3, adiado da Etapa 0) | 🤖 + 👤 |

⚠️ **O item 1 é o único não automatizável e o único sem o qual os outros não significam nada.** Ele é
👤, está listado como bloqueante em §6 do V3, e é papel pelas sete semanas — o prompt do A3 será
reescrito a cada bloco novo. **Não bloqueia começar o B02.**

---

## §E · Verificação, por bloco

1. `npm test` e `npm run test:py` no mesmo commit da mudança — no executor o teste **entra junto**,
   porque não há usuário para reclamar (V3 §0-bis).
2. Bloco que toque `query_plan.ts` ou o executor: rodar os cards de teste **antes e depois**,
   comparando número a número.
3. ⚠️ Bloco que toque `_shared/query_plan.ts`: publicar **os três** consumidores conferindo
   `ezbr_sha256` — `version` sobe em troca de secret e **não serve de prova** (I-03). **Como ler o
   número está em `supabase/functions/README.md`**, seção Deploy.

   ⭐ **A divergência não avisa:** ela é invisível até alguém emitir a forma nova, porque os dois
   lados ficam internamente coerentes e nenhum teste pega. Foi assim que a D-028 passou oito dias
   despercebida. É o motivo de a regra ser "publique todos", e não "publique quem mudou".

   ✅ **A D-028 foi encerrada em 2026-08-20** — a Etapa 0 republicou o `ai-plum-chat` e os três
   consumidores estão na mesma versão, medido pela API. O B09 **não** herda dívida nenhuma daqui.
4. Migrations continuam manuais, com bloco de verificação autoexecutável (D-005).
5. Antes de publicar algo compartilhado: saber se há demo marcada na semana. É o único risco real
   que a V3 reconhece.

**Ordem de publicação, sempre:** migration → push do Python (Lambda sobe sozinho) → `functions
deploy` conferido. Nunca o inverso (§B2).
