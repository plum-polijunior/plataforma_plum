# Plano de implementação do remake — V2

**Substitui a V1.** Base: V6 (decisões) + V7 (spec do `ad_hoc`) + `about_implementation1`.
**O que mudou da V1:** o plano passa a separar **quem faz o quê** (a implementação será codada pelo
Claude Code), define os **documentos que o Claude Code produz**, e corrige a §0.4.
**Ambiente:** Supabase novo + Lambda novo + front em localhost. Produção intocada.
**Convenções:** 🤖 Claude Code · 👤 Bernardo · `⚠️` armadilha · `⭐` central · `❓` decisão pendente

---

## Sumário das etapas

| Etapa | O quê | Esforço | Termina quando |
|---|---|---|---|
| **0** | Ambiente novo: Supabase limpo, Lambda de dev, front em localhost, base de teste | 3–5 dias | uma pergunta do chat **atual** roda ponta a ponta no ambiente novo |
| **1** | ⭐ **O remake:** agentes, executor, gramática de query, log. Dashboard intocado | 5–7 semanas | 20 perguntas reais respondidas com presunções visíveis, e os cards batem número a número |
| **2** | Estreia em produção atrás de flag por organização, com medição A/B | 1–2 semanas | uma organização real usando o `ad_hoc`, com taxa de correção medida |
| **3** | Multi-planilha (o `from` deixa de ser sobrescrito) | 2–3 semanas | conectar 3 abas e perguntar sem escolher base |
| **4** | ⭐ **Morte do Tarsila:** card vira "salvar esta resposta" | 2 semanas | `dashboard-agent` deletado, um planejador só |
| **5** | Dicionário camadas 3 e 4 + memória do Plum | 3–4 semanas | cenário e "se A muda, B" passam a existir |
| **6** | Ideias futuras, por gatilho | — | §6 |

**Só a Etapa 1 é detalhada.** O resto é esboço de propósito — a Etapa 1 vai mudar o que sabemos.

---

# §0 · COMO ESTE PLANO É EXECUTADO

## 0.1. A divisão

⭐ **A regra que decide tudo: o Claude Code não sai do repositório.**

| 🤖 Claude Code | 👤 Bernardo |
|---|---|
| Todo código em `src/`, `supabase/functions/`, `query_engine/` | Painel do Supabase: criar projeto, **colar migrations**, ativar o hook, criar secrets |
| Escrever o SQL das migrations novas | AWS: subir o Lambda de dev, IAM, SSM |
| Testes (`vitest`, `pytest`) e rodá-los | Google: service account de dev, compartilhar planilhas |
| Os 4 prompts, em arquivos próprios | `npx supabase functions deploy` (ver ⚠️ abaixo) |
| Atualizar `contexto/` via skill `contexto-plum` | ⭐ A **base de teste** e o **conjunto de perguntas** (§0.4, §2.4) |
| Os 4 documentos da §0.2 | Ler o `PENDENTE-DECISAO.md` e responder |

⚠️ **Migrations continuam manuais por decisão** (D-005). O Claude Code escreve o `.sql` com bloco de
verificação; você cola no SQL Editor e lê o resultado. Não automatize isso agora — o ambiente novo é
justamente onde se descobre se a ordem funciona.

⚠️ **Deploy de Edge Function começa com você.** O I-03 registra que o deploy deste projeto é
confiável apenas quando feito à mão e conferido por `ezbr_sha256`. Depois que o ambiente de dev
provar estabilidade, pode migrar para o 🤖 — mas não no começo, e nunca em produção.

## 0.2. Os documentos que o 🤖 produz

Quatro, e **por bloco, não por etapa** — um resumo escrito depois de 7 semanas é escrito de memória.

```
zz_remake_implementation/
  execucao/
    B01-log/
      DIARIO.md              ← o que mudou no código e por quê
      MANUAL.md              ← 👤 o que fazer, ANTES e DEPOIS
    B02-redutora-seletora/
      DIARIO.md  MANUAL.md
    …
  CONTEXTO-alteracoes.md     ← ponteiros, um por linha (acumula)
  PENDENTE-DECISAO.md        ← ⭐ o mais importante (acumula)
```

### `DIARIO.md` — por bloco

O que mudou, arquivo a arquivo, **e por quê**. Inclui o que foi tentado e descartado — é o que
alimenta `30-decisoes.md` depois. Formato: prosa curta, não changelog gerado.

### `MANUAL.md` — por bloco

⭐ **Separado em ANTES e DEPOIS**, porque a ordem importa:

```markdown
## Antes de rodar este bloco
1. Colar `supabase/migrations/20260901000000_plum_logs.sql` no SQL Editor
2. Conferir que o bloco de verificação devolveu OK em todas as linhas

## Depois
3. Publicar `ai-plum-chat` e conferir que o `ezbr_sha256` mudou
4. Rodar uma pergunta e verificar 4 linhas em `plum_logs`
```

⚠️ Sem o "antes", o 🤖 entrega código que não roda e ninguém sabe por quê.

### `CONTEXTO-alteracoes.md` — ponteiros, não resumo

⚠️ **Não pode ser um resumo do que mudou no `contexto/`** — isso criaria um segundo dono para o
mesmo fato, exatamente o que a regra 1 de `contexto/CLAUDE.md` proíbe. É uma lista de ponteiros:

```
B03 · criou D-051 (metadados expõe distintos) · atualizou 12-visao §3.1 · 03-erros: linha do `from`
B04 · criou D-052 (vocabulario compila para plano) · 04-glossario: verbete "vocabulário"
```

Uma linha por mudança. Quem quer o conteúdo vai no arquivo de destino.

### ⭐ `PENDENTE-DECISAO.md` — o que eu acrescento à sua lista

Não estava nos seus três, e eu acho o mais importante. **Numa implementação longa e majoritariamente
autônoma, o modo de falha é o agente decidir sozinho algo de produto e enterrar a decisão no código.**

```markdown
## P-004 · bloco 07 · 2026-09-14 · AGUARDANDO
**Situação:** o A3 recebeu "vendas de agosto" numa base com `receita_bruta` e `receita_liquida`.
**O que fiz para não travar:** escolhi `receita_liquida` e registrei em `presuncoes`.
**Por que não decidi sozinho de verdade:** a escolha certa depende do cliente.
**O que preciso de você:** isso vira regra padrão, ou o A3 deve perguntar?
```

Regras: o 🤖 **nunca trava** esperando resposta — escolhe, registra a escolha e segue. Toda entrada
tem `AGUARDANDO` ou `RESOLVIDO: <decisão>`. ⭐ Entrada resolvida vira candidata a `30-decisoes.md`.

❓ Se você preferir outra organização, o que eu não abriria mão: **manual separado por antes/depois**,
e **um lugar único para decisões pendentes**.

## 0.3. Como cada bloco fecha

1. 🤖 implementa, escreve `DIARIO.md` e `MANUAL.md`, roda `npm test` e `npm run test:py`
2. 👤 executa o "antes", se houver
3. 🤖 roda o bloco no ambiente de dev
4. 👤 executa o "depois" e confere o critério de pronto
5. 🤖 roda a skill `contexto-plum` e acrescenta a linha em `CONTEXTO-alteracoes.md`

---

# ETAPA 0 — o ambiente

**Objetivo:** ter onde quebrar coisas. Nada de remake ainda.

## 0.1. Supabase novo — 👤 com SQL escrito pelo 🤖

1. 👤 Projeto novo. Anote o `project-ref`.
2. 👤 ⭐ **Rode as migrations em ordem, do zero.** Use `ls supabase/migrations/`, **não** o §6 do
   `CLAUDE.md` — conferido em 2026-08-17, **seis arquivos do disco não aparecem lá** (os dois
   `20260714…` de `Leads` e quatro de `GRANT`/backfill).
3. 👤 Leia o bloco de verificação de cada uma. `FALTANDO` interrompe.
4. 🤖 ⭐ **Compare o banco resultante com o dump de `supabase/backup/`** e escreva
   `execucao/B00-ambiente/RELATORIO-migrations.md`. Divergência é **achado**, não erro — hoje ninguém
   sabe se as migrations reproduzem produção, e já há evidência de que não (`join_mode` com
   `'codigo'` no dump × `'share_id'` no SQL; `assistants`/`conversations`/`messages` sem migration).
5. 👤 ⚠️ **Ative o Custom Access Token Hook à mão** (Authentication → Hooks). Não é versionável, e sem
   ele as `current_*` caem no fallback via `profiles` — funciona, com uma query a mais por checagem de
   RLS, e **difere de produção de forma invisível**.
6. 👤 Publique as 5 Edge Functions com o `--project-ref` novo. Recrie os secrets: `GEMINI_API_KEY`,
   segredo HMAC, credenciais AWS.

## 0.2. 🤖 Pagar a dívida do `client.ts` — primeira tarefa de código

`src/integrations/supabase/client.ts` linhas 5–6 têm URL e anon key **hardcoded**
(`rjwidarrsykufuifzunu`). O `.env.example` existe com os nomes certos e **não é usado**.

```ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
```

⚠️ **Falhe alto se a variável faltar.** `undefined` no `createClient` dá erro obscuro longe da causa.

## 0.3. 👤 Lambda de dev — e por que não reusar o de produção

| Compartilhado | Consequência |
|---|---|
| Rate limit do Google Sheets (60 req/min) | é **por service account** → dev pesado derruba produção |
| Cache de 15 min | é por processo → dev e prod dividem |
| Service account | dev teria acesso de leitura às planilhas reais dos 4 clientes |

**Segundo Lambda** (`infra/aws/PASSO-A-PASSO.md`, serverless, custo desprezível) **e segunda service
account**. As planilhas de teste são compartilhadas só com a nova.

## 0.4. 👤 ⭐ A base de teste — corrigido

**Correção do que a V1 dizia.** Você apontou que a etapa 1 do onboarding barra nomes fora de
snake_case. Fui conferir: **não barra mais.** `DatabasePipeline.tsx:70` diz literalmente
*"Validação removida. O Plum agora formata as colunas automaticamente para snake_case (Etapa 1
Invisível)"* — hoje ele **normaliza**, via `normalizarNomeDeColuna`.

⭐ **Consequência para a base de teste: sujeira de cabeçalho não serve como teste** — o pipeline
resolve. O que precisa estar sujo é **o valor**, não o nome da coluna:

| Defeito a plantar | Por que importa |
|---|---|
| Mesmo nome escrito de 3 jeitos (`JOAO DA SILVA`, `João Silva`, `joao silva`) | é o que o `vocabulario` existe para resolver |
| `status` com `"CANC"` e `"cancelado"` convivendo | achado de qualidade que aparece de graça |
| Coluna preenchida só a partir de certo mês | `nulos_pct` + período têm de denunciar |
| **Várias linhas por data** | o grão — `n_linhas ÷ distintos` tem de revelar |
| Data em formato misto | formatação, e é o único caso em que `amostra` é insubstituível |
| ⚠️ **Dois cabeçalhos que colidem ao normalizar** (`Data Venda` e `DATA_VENDA` → `data_venda`) | ver abaixo |

⚠️ **Achado novo, e ele é um bug real do produto atual:** `DatabasePipeline.tsx` monta
`normMap[h] = normalizeString(h)` num objeto simples e depois `obj[normMap[h]] = row[i]`. **Dois
cabeçalhos que normalizam para o mesmo nome se sobrescrevem em silêncio** — uma coluna some sem erro.
Vale plantar esse caso na base de teste e abrir como pendência independente do remake.

**Fonte preferida:** ⭐ cópia anonimizada da base de um dos 4 clientes. É a conversa mais barata que
existe ("queremos testar melhorias antes de te entregar") e o insumo mais valioso da Etapa 1.
Alternativa: base sintética com os seis defeitos plantados.

## 0.5. Critério de pronto

Uma pergunta no chat **atual** (Z→A→C) roda ponta a ponta no ambiente novo, com a base de teste, sem
tocar em produção. Nenhuma linha de remake escrita ainda.

---

# ETAPA 1 — o remake

**Escopo:** `ai-plum-chat`, `_shared/query_plan.ts`, `query_engine/`, tabela de log.
⛔ **Fora de escopo:** `dashboard-agent`, `dashboard-execute`, `/inicio`, os cards, `ai-agents`.

⭐ **A regra que governa a etapa:** o dashboard continua funcionando **sem nenhuma alteração nele**.
Se uma mudança exigir mexer no `dashboard-agent`, ela está fora de escopo ou está errada.

## 1.0. 🤖 Arquitetura de arquivos

```
supabase/functions/
  _shared/
    query_plan.ts          ← EXISTE (414 linhas). Ganha: pedidos[], redutora×seletora
    query_plan.test.ts     ← EXISTE (647). Ganha os casos novos
    llm.ts                 ← NOVO · chamar({papel, prompt, schema}) → adaptadores
    llm/gemini.ts          ← NOVO · move o que hoje está inline em 3 funções
    llm/claude.ts          ← NOVO
    log.ts                 ← NOVO · escreve em plum_logs
  ai-plum-chat/
    index.ts               ← EXISTE (521). Ganha action "ad_hoc" ao lado de "plan_query"
    adhoc/
      porteiro.ts  reconhecedor.ts  planejador.ts  interprete.ts
      entidade.ts          ← CÓDIGO, sem LLM
      orcamento.ts         ← contador de linhas por sessão
      prompts/             ← ⭐ um arquivo por prompt
  dashboard-agent/         ← ⛔ NÃO TOCAR
  dashboard-execute/       ← ⛔ NÃO TOCAR
  ai-agents/               ← ⛔ NÃO TOCAR nesta etapa

query_engine/
  pandas_executor.py       ← EXISTE (1324). Ganha: amostra/registro, agg com parâmetro
  main.py                  ← EXISTE (219). Ganha: tipos de pedido novos
  metadados.py             ← NOVO · distintos, nulos_pct, min/max por coluna
```

⚠️ **`prompts/` em arquivo separado, nunca string dentro do `index.ts`.** O prompt do A3 vai ser
reescrito dezenas de vezes; diff de prompt enterrado num arquivo de 500 linhas é ilegível.

## 1.1. Os blocos

| # | Bloco | Depende | Sem | Quem |
|---|---|---|---|---|
| 1 | `plum_logs` + `_shared/log.ts` | — | 0,5 | 🤖 código · 👤 migration |
| 2 | ⚠️ **redutora × seletora** | 1 | 0,5 | 🤖 |
| 3 | `metadados` (Python + tipo de pedido) | — | 0,5 | 🤖 |
| 4 | `vocabulario` + resolvedor de entidade | 3 | 1 | 🤖 |
| 5 | `_shared/llm.ts` + adaptadores | — | 0,5 | 🤖 · 👤 secrets |
| 6 | A1 + A2 + cache de A2 | 3, 5 | 1 | 🤖 |
| 7 | A3 + A4 + presunções | 4, 6 | 1,5 | 🤖 código · ⭐ 👤 perguntas |
| 8 | Negação parcial por pedido | 2, 7 | 0,5 | 🤖 |
| 9 | `agg` ampliado (`std`, `median`, `var`, `quantile` com `p`) | 2 | 0,5 | 🤖 |
| 10 | `registro` + `amostra` + orçamento | 2, 8 | 1 | 🤖 |

**~7 semanas.** Blocos 1–5 paralelizáveis.

### Bloco 1 — log · ⭐ faça primeiro

```sql
create table plum_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, user_id uuid not null,
  dataset_id uuid, sessao_id uuid not null, turno_id uuid not null,
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

⚠️ **A pergunta crua NÃO entra** (D-022) — registra-se a forma, nunca o texto.
RLS: a organização lê o próprio log; `service_role` lê tudo.

### Bloco 2 — ⚠️ a única parte que conserta produção

`RawRowsBlocked` verifica que **existe** agregação, não que ela **agrega**. `min`/`max` sobre coluna
de **texto** devolvem valor literal — 500 nomes de clientes, um por grupo, sem consumir nada.

```
Redutora  sum avg count std median var quantile   → livre
Seletora  min max first last nunique
            └ coluna numérica → livre
            └ coluna de TEXTO → consome orçamento + respeita sensibilidade
```

⚠️ **Não é whitelist** (V6 decisão 4) — é classificação por comportamento, e o `column_roles` já
distingue `text` de `number`. ⭐ **É o único bloco que vale portar para produção antes do resto.**

### Bloco 3 — `metadados`

Por coluna: `tipo`, `distintos`, `nulos_pct`, `min`, `max`. Zero linhas expostas.

⭐ **`n_linhas ÷ distintos` responde o grão sem olhar dado nenhum.** Amostra aleatória pode, por azar,
não repetir data nenhuma; a razão nunca erra.

### Bloco 4 — `vocabulario` + entidade

⭐ **Zero mudança no executor** — é `group_by [col] + count + order desc + limit 200`, um Query Plan
comum. O casamento difuso é **código** (normalização + distância de edição), não LLM. Dois candidatos
plausíveis → **pergunta**, não escolhe.

⚠️ Travas: coluna em `allowed_columns`, teto de cardinalidade (>200 = identificador, recusa), flag
`vocabulario_exposto` default `false`.

### Bloco 5 — abstração de provedor

Hoje a URL do Gemini está em **4 lugares** em 3 funções. Papel → modelo em tabela de configuração:
`porteiro`/`reconhecedor` → Flash; `planejador`/`interprete` → Claude.

⚠️ **Não abstraia demais.** Prompt, saída estruturada, temperatura, contagem de token. Unificar cache
de prompt, tool use e streaming fica mais complexo que dois clientes separados.

### Blocos 6–7 — os agentes

Prompts na V7 §5 — **ponto de partida, não entrega**.

`amostra` **aleatória com semente determinística**:
`df.sample(5, random_state=hash((dataset_id, len(df))))`. Mesma base → mesma amostra → mesmo plano.
Aleatório puro quebraria reprodutibilidade, que é metade da razão do arquiteto existir.

### Bloco 10 — `registro`, `amostra`, orçamento

Teto **5 linhas** por pedido. Orçamento por sessão (usuário × dataset × janela): **200 linhas
brutas**. `agregado`/`serie`/`metadados`/`vocabulario` não consomem.

⭐ **Teto por pedido é o erro fácil:** 200 pedidos × 5 linhas é a base inteira sem violar teto nenhum.

## 1.2. ⛔ O portão que protege o dashboard

Três mudanças são **compartilhadas** e chegam ao dashboard sem flag:

| Mudança | Efeito no dashboard |
|---|---|
| redutora × seletora (B02) | ✅ fecha o mesmo furo lá |
| `agg` ampliado (B09) | aditivo — nenhum card muda |
| `registro`/`amostra` (B10) | caminho novo; nenhum card usa |

**Obrigatório antes de cada publicação:**

1. 🤖 `npm test` + `npm run test:py`
2. 🤖 rodar os cards do ambiente de dev e comparar **número a número** com antes
3. 👤 publicar **os três** consumidores de `query_plan.ts`, conferindo `ezbr_sha256` — `version` sobe
   em mudança de secret e **não serve de prova**
4. ⭐ **Resolver a exceção D-028 no começo.** `ai-plum-chat` está em produção com cópia antiga de
   `query_plan.ts`, de propósito. No ambiente novo isso não existe — registre o `ezbr_sha256` dos
   três como marco zero

## 1.3. Critério de pronto

| # | Verificação | Quem |
|---|---|---|
| 1 | 20 perguntas reais respondidas, cada uma com coluna→conceito, nº de linhas e presunções | 👤 |
| 2 | Pergunta com nome torto **desambigua** em vez de devolver zero | 🤖 teste |
| 3 | Cargo sem `margem` recebe resposta parcial honesta | 🤖 teste |
| 4 | Orçamento de 200 linhas barra na 201ª, com log | 🤖 teste |
| 5 | `min` sobre coluna de texto consome orçamento | 🤖 teste |
| 6 | ⭐ Cards do dashboard batem número a número | 👤 |
| 7 | `plum_logs` permite calcular custo por pergunta e taxa de correção | 🤖 |

⚠️ **O item 7 precisa de um gesto no front** ("não é isso") para `presuncao_corrigida` existir. É 🤖,
mas ninguém tinha listado — sem ele a métrica que valida a Etapa 2 não é capturável.

---

# ETAPAS POSTERIORES (esboço)

## Etapa 2 — estreia em produção · 1–2 semanas

`plan_query` e `ad_hoc` convivem no `ai-plum-chat`; flag por organização decide. Uma organização
primeiro, rollback instantâneo. Mede: custo/pergunta, latência, `presuncao_corrigida`, `inviavel`.
❓ O limiar de correção é decisão de produto e vira o critério que libera a Etapa 3.

## Etapa 3 — multi-planilha · 2–3 semanas

⭐ **O trabalho não é no executor** — `execute_plan(plan, tables: Dict[str, DataFrame])` **sempre**
aceitou várias tabelas. É `main.py:164-169`, que monta `{"producao": df}` e **sobrescreve**
`plano["from"] = "producao"`.

⚠️ (a) esse caminho **nunca executou em produção**; (b) `execute_plan` devolve `{"error": …}` para
tabela inexistente em vez de **levantar** — alinhar com `MissingColumnError`, senão `from` errado vira
card vazio em silêncio; (c) cruzamento acontece **depois** da agregação e exige grão declarado.

## Etapa 4 — ⭐ a morte do Tarsila · 2 semanas

Criar card deixa de ser "descreva o que você quer" e vira **"salvar esta resposta como card"** — o
card nasce de uma resposta que o usuário **já conferiu**. `dashboard-agent` é deletado.

**Ganhos:** um planejador em vez de dois (mata a D-021) · some o Z-dash e sua cota ·
`query_plan.ts` passa a ter dois consumidores.
⚠️ **Só depois da Etapa 2 validada** — se o `ad_hoc` não se provar, o produto fica sem criar cards.

## Etapa 5 — dicionário camadas 3 e 4 + memória · 3–4 semanas

Relações e grão (3), fórmulas/sinais/proibições/calendário (4), com editor em "minha base de dados".
A **memória do Plum** é a camada 4 em self-service.

⚠️ Regra escrita pelo usuário não é validada. `margem = receita − custo` sem a glosa dá número errado
**estável**, e estável é pior que inconsistente. **Toda regra usada entra nas presunções.**
**Destrava:** cenário (`overrides`) e "se A muda, como fica B".

## Etapa 6 — ideias futuras, por gatilho

| Ideia | Gatilho |
|---|---|
| **Cenário (`overrides`)** | Etapa 5 entregue |
| **Cruzamento por grão comum** | Etapa 3 + grão declarado |
| **Composição / mix** | ⭐ pergunta sobre percentual — responde "por que a margem **%** caiu", que a decomposição não trata |
| **Decomposição de variação** | o único padrão do catálogo. Entra quando o `ad_hoc` não der conta de "por que caiu?" |
| **Outlier** | `std`/`quantile` já entram no B09 — vira `ad_hoc`, não padrão |
| **Tendência** | ⚠️ regressão **não é agregação**. E com 6 meses não se separa tendência de ruído |
| **Concentração (Pareto)** | soma cumulativa no executor + métrica só positiva |
| **Etapa 2 do produto** (Maisa, Plum Externo, prospecção) | `contexto/22-planos-futuros.md` |

---

# §6 · O QUE ESTÁ BLOQUEADO × O QUE SÓ NÃO FOI ATRIBUÍDO

A V1 juntava as duas coisas numa seção chamada "sem dono", o que fazia tarefa normal parecer risco.

## Bloqueado — não anda por decisão interna

| # | O quê | Depende de |
|---|---|---|
| 1 | ⭐ **Cópia anonimizada da base de um cliente** (§0.4) | conversa comercial com um dos 4 |

## Não atribuído — anda assim que alguém pegar

| # | O quê | Natureza |
|---|---|---|
| 2 | ⭐ **O conjunto de 25–30 perguntas de avaliação** | ver abaixo |
| 3 | Gesto de "não é isso" no front | 🤖, tarefa normal |
| 4 | `p` do `quantile` na gramática + executor | 🤖, tarefa normal |

### ⭐ Sobre o item 2 — por que ele não é "escrever o prompt do A3"

Prompt não tem "pronto"; ele é **sintonizado contra um conjunto de perguntas**. Sem esse conjunto,
mexer no prompt não tem critério de parada e vira alguém ajustando texto até parecer bom.

**O entregável é:** 25–30 perguntas reais e, para cada uma, (a) qual seria a resposta certa,
(b) quais presunções são aceitáveis, (c) o que caracteriza falha — recusou quando devia responder?
respondeu quando devia perguntar?

Antes do log existir, vêm das 4 vendas. Depois, do log.

⚠️ **Não é tarefa de uma semana, é papel pelas 7** — o prompt será reescrito a cada bloco novo
(quando o `vocabulario` entrar, quando o orçamento entrar, quando o `agg` ampliar). É 👤, e é o único
item do plano em que o 🤖 não consegue julgar o próprio trabalho.
