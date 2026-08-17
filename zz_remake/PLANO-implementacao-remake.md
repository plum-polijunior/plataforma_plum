# Plano de implementação do remake

**Base:** V6 (decisões) + V7 (spec técnica do `ad_hoc`).
**Ambiente:** Supabase novo + Lambda novo + front em localhost. Produção intocada.
**Convenções:** `⚠️` armadilha · `⭐` central · `❓` decisão pendente · `🏗️` plataforma · `🔧` implementação

---

## Sumário das etapas

| Etapa | O quê | Esforço | Termina quando |
|---|---|---|---|
| **0** | Ambiente novo: Supabase limpo, Lambda de dev, front em localhost, base de teste bagunçada | 3–5 dias | uma pergunta do chat atual roda ponta a ponta no ambiente novo |
| **1** | ⭐ **O remake:** agentes, executor, gramática de query, log. Dashboard intocado | 5–7 semanas | 20 perguntas reais respondidas com presunções visíveis, e o dashboard passa nos testes de sempre |
| **2** | Estreia em produção atrás de flag por organização, com medição A/B | 1–2 semanas | uma organização real usando o `ad_hoc`, com taxa de correção medida |
| **3** | Multi-planilha (o `from` deixa de ser sobrescrito) | 2–3 semanas | conectar 3 abas e perguntar sem escolher base |
| **4** | ⭐ **Morte do Tarsila:** card vira "salvar esta resposta" | 2 semanas | `dashboard-agent` deletado, um planejador só |
| **5** | Dicionário camadas 3 e 4 + memória do Plum | 3–4 semanas | cenário e "se A muda, B" passam a existir |
| **6** | Ideias futuras, por gatilho | — | §7 |

**Etapa 1 é a única detalhada.** As outras são esboço de propósito — a Etapa 1 vai mudar o que sabemos.

---

# ETAPA 0 — o ambiente

**Objetivo:** ter onde quebrar coisas. Nada de remake ainda.

## 0.1. Supabase novo

1. Projeto novo. Anote o `project-ref`.
2. ⭐ **Rode as migrations em ordem, do zero.** Use `ls supabase/migrations/`, **não** o §6 do
   `CLAUDE.md` — conferido em 2026-08-17, **seis arquivos do disco não aparecem lá** (os dois
   `20260714…` de `Leads` e quatro de `GRANT`/backfill).
3. Leia o bloco de verificação de cada uma. `FALTANDO` interrompe.
4. ⭐ **Compare o resultado com o dump de `supabase/backup/`.** Divergência aqui é **achado**, não
   erro — hoje ninguém sabe se as migrations reproduzem produção. Já há evidência de que não
   (`join_mode` com `'codigo'` no dump × `'share_id'` no SQL; `assistants`/`conversations`/`messages`
   sem migration nenhuma). Registre o que divergir.
5. ⚠️ **Ative o Custom Access Token Hook à mão** (Authentication → Hooks). Ele não é versionável, e
   sem ele as `current_*` caem no fallback via `profiles` — funciona, mas com uma query a mais por
   checagem de RLS, e o comportamento **difere de produção de forma invisível**.
6. Publique as 5 Edge Functions com o `--project-ref` novo. Recrie os secrets:
   `GEMINI_API_KEY`, o segredo HMAC, credenciais AWS.

**Entregável:** um `RELATORIO-migrations.md` com o que divergiu. É insumo da Etapa 1 e vale por si.

## 0.2. ⚠️ Pagar a dívida do `client.ts` — primeira tarefa de código

`src/integrations/supabase/client.ts` linhas 5–6 têm URL e anon key **hardcoded**
(`rjwidarrsykufuifzunu`). O `.env.example` existe com os nomes certos e **não é usado**.

```ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
```

Sem isso, alternar entre dev e prod é editar arquivo versionado — e a primeira vez que alguém
commitar a chave errada, produção aponta para dev ou vice-versa.

⚠️ Ao mudar: **falhe alto se a variável faltar.** `undefined` no `createClient` dá erro obscuro em
runtime, longe da causa.

## 0.3. Lambda de dev — e por que não reusar o de produção

| Compartilhado | Consequência |
|---|---|
| Rate limit do Google Sheets (60 req/min) | é **por service account** → dev pesado derruba produção |
| Cache de 15 min | é por processo → dev e prod dividem |
| Service account | dev teria acesso de leitura às planilhas reais dos 4 clientes |

**Suba um segundo Lambda** (`infra/aws/PASSO-A-PASSO.md`, é serverless, custo desprezível) **e uma
segunda service account**. As planilhas de teste são compartilhadas só com a nova.

## 0.4. ⭐ A base de teste vai decidir se a Etapa 1 vale alguma coisa

`test_data/demo_riosulense.xlsx` não basta. Os problemas que o `ad_hoc` existe para resolver **só
aparecem em base bagunçada**: nome escrito de três jeitos, coluna preenchida só a partir de certo
mês, `status` com `"CANC"` e `"cancelado"` convivendo, várias linhas por data, data em formato misto.

**Duas fontes, nesta ordem de preferência:**

1. ⭐ **Cópia anonimizada da base de um dos 4 clientes.** É a conversa mais barata que existe
   ("queremos testar melhorias antes de te entregar") e é o insumo mais valioso da Etapa 1.
2. Uma base sintética **deliberadamente suja**, com os cinco defeitos acima plantados de propósito.

⚠️ Sem isso você vai calibrar o prompt do A3 contra um mundo que não existe, e a validação da
Etapa 1 não significa nada.

## 0.5. Critério de pronto da Etapa 0

Uma pergunta no chat **atual** (Z→A→C) roda ponta a ponta no ambiente novo, com a base de teste,
sem tocar em produção. Nenhuma linha de remake escrita ainda.

---

# ETAPA 1 — o remake

**Escopo:** `ai-plum-chat`, `_shared/query_plan.ts`, `query_engine/`, tabela de log.
⛔ **Fora de escopo:** `dashboard-agent`, `dashboard-execute`, `/inicio`, os cards, `ai-agents`.

⭐ **A regra que governa a etapa:** o dashboard tem de continuar funcionando **sem nenhuma alteração
nele**. Se uma mudança exigir mexer no `dashboard-agent`, ela está fora de escopo ou está errada.

## 1.0. Arquitetura de arquivos

```
supabase/functions/
  _shared/
    query_plan.ts          ← EXISTE (414 linhas). Ganha: pedidos[], agg redutora×seletora
    query_plan.test.ts     ← EXISTE (647 linhas). Ganha os casos novos
    llm.ts                 ← NOVO · chamar({papel, prompt, schema}) → adaptadores
    llm/gemini.ts          ← NOVO · move o que hoje está inline em 3 funções
    llm/claude.ts          ← NOVO
    log.ts                 ← NOVO · uma função, escreve em plum_logs
  ai-plum-chat/
    index.ts               ← EXISTE (521 linhas). Ganha action "ad_hoc" ao lado de "plan_query"
    adhoc/
      porteiro.ts          ← NOVO · A1
      reconhecedor.ts      ← NOVO · A2 (+ cache)
      planejador.ts        ← NOVO · A3
      interprete.ts        ← NOVO · A4
      entidade.ts          ← NOVO · resolvedor, CÓDIGO, sem LLM
      orcamento.ts         ← NOVO · contador de linhas por sessão
      prompts/             ← NOVO · os 4 prompts, um arquivo cada
  dashboard-agent/         ← ⛔ NÃO TOCAR
  dashboard-execute/       ← ⛔ NÃO TOCAR
  ai-agents/               ← ⛔ NÃO TOCAR nesta etapa

query_engine/
  pandas_executor.py       ← EXISTE (1324 linhas). Ganha: amostra/registro, agg com parâmetro
  main.py                  ← EXISTE (219). Ganha: tipos de pedido novos
  metadados.py             ← NOVO · distintos, nulos_pct, min/max por coluna
```

⚠️ **`prompts/` em arquivo separado, não string no `index.ts`.** Os prompts vão ser reescritos
dezenas de vezes; diff de prompt dentro de um arquivo de 500 linhas é ilegível, e o prompt do A3 é
o artefato mais importante da etapa.

## 1.1. Ordem, com dependências

| # | Bloco | Depende de | Semanas |
|---|---|---|---|
| 1 | `plum_logs` + `_shared/log.ts` | — | 0,5 |
| 2 | ⚠️ **redutora × seletora** em `query_plan.ts` | 1 | 0,5 |
| 3 | `metadados` (Python + tipo de pedido) | — | 0,5 |
| 4 | `vocabulario` + resolvedor de entidade | 3 | 1 |
| 5 | `_shared/llm.ts` + adaptadores | — | 0,5 |
| 6 | A1 + A2 + cache de A2 | 3, 5 | 1 |
| 7 | A3 + A4 + presunções | 4, 6 | 1,5 |
| 8 | Negação parcial por pedido | 2, 7 | 0,5 |
| 9 | `agg` ampliado (`std`, `median`, `var`, `quantile` com `p`) | 2 | 0,5 |
| 10 | `registro` + `amostra` + orçamento | 2, 8 | 1 |

**Total ~7 semanas** de uma pessoa. Blocos 1–5 são paralelizáveis entre duas.

### Bloco 1 — log

```sql
create table plum_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  dataset_id uuid,
  sessao_id uuid not null,
  turno_id uuid not null,
  etapa text not null,        -- porteiro|reconhecedor|planejador|resolvedor
                              -- |autorizador|executor|interprete
  modelo text, provedor text,
  tokens_entrada int, tokens_saida int, latencia_ms int,
  status text not null,       -- ok|bloqueado|negado|inviavel|desambiguacao|erro
  codigo_erro text,
  pedidos_qtd int, tipos_pedido text[],
  linhas_origem int, linhas_brutas_entregues int,
  presuncoes_qtd int, rodada_extra bool, cache_hit_a2 bool,
  criado_em timestamptz not null default now()
);
```

⚠️ **A pergunta crua NÃO entra** (D-022). Registra-se a forma, nunca o texto.
RLS: a organização lê o próprio log; `service_role` lê tudo.

⭐ **Faça primeiro.** Sem ele, tudo o que vem depois é opinião.

### Bloco 2 — ⚠️ a única parte que conserta produção

`RawRowsBlocked` verifica que **existe** agregação, não que ela **agrega**. `min`/`max` sobre coluna
de **texto** devolvem valor literal — 500 nomes de clientes, um por grupo, sem consumir nada.

```
Redutora  sum avg count std median var quantile   → livre
Seletora  min max first last nunique
            └ coluna numérica → livre
            └ coluna de TEXTO → consome orçamento + respeita sensibilidade
```

O `column_roles` já distingue `text` de `number`; a informação está no payload.

⚠️ **Isto não é whitelist** (V6 decisão 4) — é classificação por comportamento. E fecha um furo do
produto **atual**, então é o único bloco que vale portar para produção antes do resto.

### Bloco 3 — `metadados`

Por coluna: `tipo`, `distintos`, `nulos_pct`, `min`, `max`. Zero linhas expostas.

⭐ **`n_linhas ÷ distintos` responde o grão sem olhar dado nenhum.** Se `distintos(data) = n_linhas`,
uma linha por data; se der 3,0, três linhas por data. Amostra aleatória pode, por azar, não repetir
data nenhuma — a razão nunca erra.

### Bloco 4 — `vocabulario` + entidade

⭐ **Zero mudança no executor.** Vocabulário é `group_by [col] + count + order desc + limit 200` — um
Query Plan comum. O `tipo: "vocabulario"` é açúcar na Edge Function.

O casamento difuso é **código** (normalização + distância de edição sobre ≤200 valores), não LLM.
Dois candidatos plausíveis → **pergunta ao usuário**, não escolhe.

⚠️ Travas: coluna em `allowed_columns`, teto de cardinalidade (>200 = identificador, recusa), flag
`vocabulario_exposto` default `false`.

### Bloco 5 — abstração de provedor

Hoje a URL do Gemini está em **4 lugares** em 3 funções, e o helper compartilhado se chama
`_shared/gemini_parsing.ts`. Papel → modelo em **tabela de configuração**, não no código:
`porteiro`/`reconhecedor`/`vocabulario` → Flash; `planejador`/`interprete` → Claude.

⚠️ **Não abstraia demais.** Cubra prompt, saída estruturada, temperatura e contagem de token.
Unificar cache de prompt, tool use e streaming fica mais complexo que dois clientes separados.

### Blocos 6–7 — os agentes

Prompts na V7 §5. ⚠️ O texto de lá é **ponto de partida, não entrega** — o do A3 vai ser reescrito
muitas vezes, e é por isso que ele mora em arquivo próprio (§1.0).

**A3 recebe `amostra` aleatória com semente determinística:**

```python
df.sample(5, random_state=hash((dataset_id, len(df))))
```

Mesma base → mesma amostra → mesmo plano. Aleatório puro quebraria reprodutibilidade, que é metade
da razão do arquiteto existir.

### Bloco 10 — `registro`, `amostra`, orçamento

Teto **5 linhas** por pedido (é o que o pipeline de importação já trafega). Orçamento por sessão
(usuário × dataset × janela), sugestão **200 linhas brutas**. `agregado`/`serie`/`metadados`/
`vocabulario` não consomem.

⭐ **Teto por pedido é o erro fácil:** 200 pedidos × 5 linhas é a base inteira sem violar teto nenhum.

## 1.2. ⛔ O que garante que o dashboard não quebra

Três mudanças da Etapa 1 são **compartilhadas** e chegam ao dashboard sem flag:

| Mudança | Efeito no dashboard |
|---|---|
| redutora × seletora (bloco 2) | ✅ fecha o mesmo furo lá |
| `agg` ampliado (bloco 9) | aditivo — nenhum card existente muda |
| `registro`/`amostra` no executor (bloco 10) | caminho novo; nenhum card usa |

**Portão obrigatório antes de cada publicação:**

1. `npm test` (RBAC de coluna, normalização, extração de URL) e `npm run test:py`
2. Rodar os cards do ambiente de dev e comparar número a número com antes
3. ⚠️ Publicar **os três** consumidores de `query_plan.ts` (`ai-plum-chat`, `dashboard-execute`,
   `dashboard-agent`), conferindo `ezbr_sha256` — `version` sobe em mudança de secret e **não serve
   de prova**
4. ⭐ **Resolver a exceção D-028 logo no começo.** `ai-plum-chat` está em produção com cópia antiga
   de `query_plan.ts`, de propósito. No ambiente novo isso não existe — e é aí que o repositório e o
   código implantado finalmente concordam. Registre o `ezbr_sha256` dos três como marco zero

## 1.3. Critério de pronto da Etapa 1

| # | Verificação |
|---|---|
| 1 | 20 perguntas reais respondidas, cada uma com coluna→conceito, nº de linhas e presunções |
| 2 | Pergunta com nome torto **desambigua** em vez de devolver zero |
| 3 | Cargo sem `margem` recebe resposta parcial honesta, não erro |
| 4 | Orçamento de 200 linhas barra na 201ª, com log |
| 5 | `min` sobre coluna de texto consome orçamento |
| 6 | ⭐ Cards do dashboard batem número a número com o antes |
| 7 | `plum_logs` permite calcular custo por pergunta e taxa de correção de presunção |

⚠️ **O item 7 precisa de um gesto na interface** ("não é isso") para `presuncao_corrigida` existir.
Sem ele a métrica de validação da Etapa 2 não é capturável — e isso é um item de front que ninguém
listou ainda.

---

# ETAPAS POSTERIORES (esboço)

## Etapa 2 — estreia em produção · 1–2 semanas

`action: "plan_query"` e `action: "ad_hoc"` convivem no `ai-plum-chat`; flag por organização decide.
Uma organização primeiro, com rollback instantâneo. Mede-se: custo por pergunta, latência, taxa de
`presuncao_corrigida`, taxa de `inviavel`.

**Pronto quando:** uma organização real usando o `ad_hoc` por duas semanas com taxa de correção
estável e abaixo do limiar. ❓ O limiar é decisão de produto, e vira o critério que libera a Etapa 3.

## Etapa 3 — multi-planilha · 2–3 semanas

⭐ **O trabalho não é no executor** — `execute_plan(plan, tables: Dict[str, DataFrame])` **sempre**
aceitou várias tabelas. É `main.py` linhas 164–169, que monta `{"producao": df}` e **sobrescreve**
`plano["from"] = "producao"`, descartando o que o agente emitiu.

Então: parar de sobrescrever, montar `{nome_da_aba: df}`, e o A2 ganha pré-seleção de tabela.

⚠️ Consequências: (a) esse caminho **nunca executou em produção**, então é código novo na prática;
(b) `execute_plan` devolve `{"error": …}` para tabela inexistente em vez de **levantar** — alinhar com
`MissingColumnError`, senão `from` errado vira card vazio em silêncio; (c) cruzamento entre planilhas
acontece **depois** da agregação, sem join, e exige grão declarado.

## Etapa 4 — ⭐ a morte do Tarsila · 2 semanas

Hoje há **dois** prompts emitindo a mesma gramática de Query Plan: o Agente A (chat) e o Tarsila
(`dashboard-agent`). O `CLAUDE.md` trata isso como dívida a vigiar, e a D-021 registra que a
separação foi deliberada — mas a razão dela (requisitos de saída diferentes) desaparece quando o
`ad_hoc` já produz `title`, `viz` e o plano.

**O movimento:** criar card deixa de ser "descreva o que você quer" e passa a ser **"salvar esta
resposta como card"**. O usuário pergunta no chat, vê a resposta com as presunções, e **só então**
salva. `dashboard-agent` é deletado; `dashboard-execute` fica.

**Ganhos:** um planejador em vez de dois · o card nasce de uma resposta que o usuário **já
conferiu** (hoje ele nasce cego) · some o Z-dash e sua cota · `_shared/query_plan.ts` passa a ter
dois consumidores em vez de três.

⚠️ **Só depois da Etapa 2 validada.** Se o `ad_hoc` não se provar, matar o Tarsila deixa o produto
sem criar cards.

## Etapa 5 — dicionário camadas 3 e 4 + memória · 3–4 semanas

Relações e grão (camada 3), fórmulas/sinais/proibições/calendário (camada 4), com editor em "minha
base de dados". A **memória do Plum** é a camada 4 em self-service — o usuário escreve "meu mês fecha
no dia 5" pelo front.

⭐ Move o *mecanismo* de 🔧 para 🏗️ mantendo o *conteúdo* com o cliente: cada campo que o usuário
preenche é uma hora que a equipe não gasta.

⚠️ Regra escrita pelo usuário não é validada. `margem = receita − custo` sem a glosa dá número errado
**estável**, e estável é pior que inconsistente. **Toda regra usada entra no bloco de presunções.**

**Destrava:** cenário (`overrides`) e "se A muda, como fica B" — que só funcionam com fórmula
declarada.

## Etapa 6 — ideias futuras, por gatilho

| Ideia | Gatilho |
|---|---|
| **Cenário (`overrides`)** | Etapa 5 entregue |
| **Cruzamento por grão comum** | Etapa 3 + grão declarado |
| **Composição / mix** | ⭐ aparecer pergunta sobre percentual — é ele que responde "por que a margem **%** caiu", que a decomposição de variação não trata |
| **Decomposição de variação** | o único padrão do catálogo 🏗️. Entra quando o `ad_hoc` provar que não dá conta de "por que caiu?" |
| **Outlier** | `std`/`quantile` já entram na Etapa 1 — vira `ad_hoc`, não padrão |
| **Tendência** | ⚠️ regressão **não é agregação**. Exige agregação customizada ou padrão que calcula inclinação. E com 6 meses de dado não se separa tendência de ruído |
| **Concentração (Pareto)** | soma cumulativa no executor + métrica só positiva |
| **Etapa 2 do produto** (Maisa, Plum Externo, prospecção) | `22-planos-futuros.md` |

---

## O que ainda não tem dono

1. ⭐ **O prompt do A3** — o artefato mais importante da Etapa 1.
2. **O gesto de "não é isso"** na interface, sem o qual a métrica de validação não existe.
3. **A cópia anonimizada da base de um cliente** (Etapa 0.4) — é conversa comercial, não técnica.
4. **O `p` do `quantile`** — quem estende a gramática e o executor juntos.
