# Plano de implementação do remake — V3

**Substitui a V2.** Base: V6 (decisões) + V7 (spec do `ad_hoc`), inalteradas — o remake em si não
mudou.
**O que mudou da V2, e é só isto:** o time decidiu fazer o remake **direto em produção**. Cai o
ambiente paralelo; entra a flag por organização como fronteira de isolamento.
**Ambiente:** produção. Supabase `rjwidarrsykufuifzunu`, Lambda `plum-query-engine`, branch
`plataforma`. Os 4 clientes seguem usando enquanto o remake acontece.
**Convenções:** 🤖 Claude Code · 👤 Bernardo · `⚠️` armadilha · `⭐` central · `❓` decisão pendente

---

## ⭐ A frase que organiza a V3

**A V2 isolava por ambiente. A V3 isola por organização.**

A ferramenta não é nova — a própria V2 já a usava, na Etapa 2 (*"flag por organização decide, uma
organização primeiro, rollback instantâneo"*). O que a V3 faz é **subir a flag para a Etapa 0** e
torná-la a espinha: nenhum caminho novo nasce ligado para ninguém.

⚠️ **E a flag protege metade do sistema, não o sistema.** Ela vive na Edge Function, então cobre a
camada de agentes. Ela **não** cobre `_shared/query_plan.ts` nem `query_engine/`, que são código
compartilhado e chegam aos 4 clientes no minuto em que publicam.

Essa assimetria é o fato central da V3. É ela que separa os blocos em duas classes (§1.1) e que faz
o B02 trocar de papel (§1.2).

---

## Sumário das etapas

| Etapa | O quê | Esforço | Termina quando |
|---|---|---|---|
| **0** | ⭐ A rede de proteção: flag por organização, `plum_logs`, base de teste na Machado Lmtd | 2–3 dias | uma pergunta roda com a flag ligada, e a de um cliente roda igual com ela desligada |
| **1** | ⭐ **O remake:** agentes, executor, gramática de query. Dashboard intocado | 5–7 semanas | 20 perguntas reais respondidas com presunções visíveis, e os cards batem número a número |
| **2** | Ligar a flag para o primeiro cliente real, com medição | 1–2 semanas | uma organização cliente usando o `ad_hoc`, com taxa de correção medida |
| **3** | Multi-planilha (o `from` deixa de ser sobrescrito) | 2–3 semanas | conectar 3 abas e perguntar sem escolher base |
| **4** | ⭐ **Morte do Tarsila:** card vira "salvar esta resposta" | 2 semanas | `dashboard-agent` deletado, um planejador só |
| **5** | Dicionário camadas 3 e 4 + memória do Plum | 3–4 semanas | cenário e "se A muda, B" passam a existir |
| **6** | Ideias futuras, por gatilho | — | §6 |

**Só as Etapas 0 e 1 são detalhadas.** O resto é esboço de propósito.

---

# §0 · COMO ESTE PLANO É EXECUTADO

*(Inalterado em relação à V2, exceto onde marcado.)*

## 0.1. A divisão

⭐ **A regra que decide tudo: o Claude Code não sai do repositório.**

| 🤖 Claude Code | 👤 Bernardo |
|---|---|
| Todo código em `src/`, `supabase/functions/`, `query_engine/` | Painel do Supabase: **colar migrations**, criar secrets, ligar/desligar a flag |
| Escrever o SQL das migrations novas, com bloco de verificação | `npx supabase functions deploy` (ver ⚠️ abaixo) |
| Testes (`vitest`, `pytest`) e rodá-los | ⭐ A **base de teste** e o **conjunto de perguntas** (§0.4, §6) |
| Os 4 prompts, em arquivos próprios | Ler o `PENDENTE-DECISAO.md` e responder |
| Atualizar `contexto/` via skill `contexto-plum` | ⭐ **Comparar os cards reais antes de cada publicação compartilhada** (novo na V3) |
| Os 4 documentos da §0.2 | |

⚠️ **Migrations continuam manuais** (D-005). Na V2 isso era conveniência; na V3 é a **única rede**,
porque não existe mais ensaio em ambiente limpo. Ler o bloco de verificação linha a linha deixou de
ser zelo e virou obrigação.

⚠️ **Deploy de Edge Function é 👤, e agora com mais razão.** O I-03 registra que o deploy deste
projeto só é confiável à mão, conferido por `ezbr_sha256`. Em produção não há segunda chance.

## 0.2. Os documentos que o 🤖 produz

Quatro, **por bloco, não por etapa** — um resumo escrito depois de 7 semanas é escrito de memória.

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
alimenta `30-decisoes.md` depois. Prosa curta, não changelog gerado.

### `MANUAL.md` — por bloco
⭐ **Separado em ANTES e DEPOIS.** Na V3 ele ganha uma terceira seção obrigatória:

```markdown
## Antes de rodar este bloco
1. Colar `supabase/migrations/2026…_plum_logs.sql` no SQL Editor
2. Conferir que o bloco de verificação devolveu OK em todas as linhas

## Depois
3. Publicar `ai-plum-chat` e conferir que o `ezbr_sha256` mudou
4. Rodar uma pergunta e verificar 4 linhas em `plum_logs`

## ⭐ Se der errado (novo na V3)
5. O comando exato do rollback, escrito ANTES de publicar
```

⚠️ Sem o "antes", o 🤖 entrega código que não roda e ninguém sabe por quê. **Sem o "se der errado",
o rollback é improvisado com cliente na linha** — que é o pior momento para pensar nele.

### `CONTEXTO-alteracoes.md` — ponteiros, não resumo
⚠️ Não pode ser um resumo do que mudou no `contexto/` — criaria um segundo dono para o mesmo fato,
o que a regra 1 de `contexto/CLAUDE.md` proíbe. Uma linha por mudança:

```
B03 · criou D-051 (metadados expõe distintos) · atualizou 12-visao §3.1 · 03-erros: linha do `from`
```

### ⭐ `PENDENTE-DECISAO.md`
**Numa implementação longa e majoritariamente autônoma, o modo de falha é o agente decidir sozinho
algo de produto e enterrar a decisão no código.**

```markdown
## P-004 · bloco 07 · 2026-09-14 · AGUARDANDO
**Situação:** o A3 recebeu "vendas de agosto" numa base com `receita_bruta` e `receita_liquida`.
**O que fiz para não travar:** escolhi `receita_liquida` e registrei em `presuncoes`.
**Por que não decidi sozinho de verdade:** a escolha certa depende do cliente.
**O que preciso de você:** isso vira regra padrão, ou o A3 deve perguntar?
```

O 🤖 **nunca trava** esperando resposta — escolhe, registra e segue. Toda entrada tem `AGUARDANDO`
ou `RESOLVIDO: <decisão>`. ⭐ Entrada resolvida vira candidata a `30-decisoes.md`.

## 0.3. Como cada bloco fecha

1. 🤖 implementa, escreve `DIARIO.md` e `MANUAL.md` (com o rollback), roda `npm test` e
   `npm run test:py`
2. 👤 executa o "antes", se houver
3. ⭐ **Se o bloco for compartilhado:** 🤖 compara os cards afetados número a número (§1.2)
4. 👤 publica e executa o "depois"
5. 🤖 roda a skill `contexto-plum` e acrescenta a linha em `CONTEXTO-alteracoes.md`

---

# §0-bis · ⚠️ O QUE MUDA POR TRABALHAR EM PRODUÇÃO

A seção que a V2 não precisava ter. O custo da decisão, escrito — em vez de descoberto no meio.

| Risco | Estado |
|---|---|
| ⭐ **O executor vai direto para o ar.** `query-engine.yml` usa `update-function-code` **sem `--publish` e sem alias**: todo push em `plataforma` tocando `query_engine/**` passa a servir os 4 clientes no mesmo minuto. Não há estágio intermediário | **ACEITO** (decisão do time). Trava = `pytest` + `vitest`, que o CI exige antes do `publicar`. ⭐ **Consequência que vira regra:** mudança no executor é **só aditiva**, e o teste que a cobre entra **no mesmo commit** — sem isso a trava não existe |
| **Sheets: 60 req/min é por service account**, e agora ela é a mesma dos clientes | **MITIGADO, não eliminado.** Cache de 15 min, base de teste pequena, carga pesada fora do horário comercial. Se um cliente reclamar de lentidão durante a Etapa 1, esta é a primeira hipótese |
| **Migration roda sobre dado real, sem ensaio** — o Supabase novo foi abandonado | O bloco de verificação autoexecutável deixa de ser boa prática e passa a ser a **única** rede. Não destrutiva, sempre (§4.9). ⭐ Nenhuma migration da Etapa 1 apaga ou renomeia coluna |
| **A integração GitHub↔Supabase publica Edge Function com cobertura desconhecida** (`CLAUDE.md` §1, medido). Estamos *na* `plataforma`, então ela dispara | **👤 AÇÃO: desconectar** — Supabase → projeto → Integrations → GitHub. Deploy volta a ser deliberado, como o I-03 pede. Enquanto não desconectar, um push pode publicar função sem ninguém mandar |
| **B02, B09 e B10 chegam ao dashboard sem passar pela flag** | Já era o §1.2 da V2. A diferença é que o dashboard agora é o **dos clientes** — ver §1.2 |
| ⚠️ **O botão "Run workflow"** (`workflow_dispatch`) publica no Lambda ignorando qualquer condição | Não usar durante a Etapa 1, exceto para republicar uma versão anterior num rollback |

⭐ **A regra que resume a seção:** *antes de publicar qualquer coisa, saber responder duas perguntas
— o que muda para o cliente agora, e qual é o comando que desfaz.* Se alguma das duas não tem
resposta escrita, o bloco não está pronto.

---

# ETAPA 0 — a rede de proteção

**Objetivo:** poder errar sem que os 4 clientes vejam. Nada de remake ainda.
**Esforço:** 2–3 dias.

## 0.1. ⭐ A flag por organização

Migration não destrutiva:

```sql
alter table organizations
  add column if not exists remake_habilitado boolean not null default false;
```

`default false` é o ponto inteiro: o caminho novo nasce desligado para **todo mundo**, inclusive
para quem for criado depois.

⚠️ **Resolvida no servidor, a partir do `organization_id` do JWT — nunca vinda do cliente.** É a
regra 1 do `CLAUDE.md` §4, e vale mesmo aqui, onde a flag não decide permissão: um cliente que
consiga ligar o caminho novo passa a usar código não validado sem ninguém saber.

**Rollback:** `update organizations set remake_habilitado = false where id = …`. Um comando, efeito
imediato, sem deploy.

## 0.2. `plum_logs` — primeiro, e por um motivo diferente

Era o B01 da V2. Sobe para a Etapa 0 porque em produção ele muda de função: deixa de ser
instrumentação e vira **o jeito de saber se o caminho novo piorou alguma coisa** antes de o cliente
contar.

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

⭐ **Registrar a linha de base antes de mexer em qualquer outra coisa.** Uma semana de log do
caminho atual é o que torna possível dizer, depois, se o `ad_hoc` ficou melhor ou pior. Sem isso a
comparação vira impressão.

## 0.3. A base de teste — na Machado Lmtd

A organização cobaia é a **Machado Lmtd**: é nossa, já tem domínio SSO e base conectada, e não é
cliente pagante. A multitenancy que já existe é a fronteira de dados.

⚠️ **Compartilhar a planilha de teste com a service account de PRODUÇÃO**
(`plum-polijunior@plataforma-plum.iam.gserviceaccount.com`). A service account nova
(`newplum@new-new-plum…`) foi abandonada junto com o Supabase novo — o Lambda de produção lê o
segredo de `/plum/prod/google-sa-json`, e trocar isso afetaria os 4 clientes.

Os seis defeitos a plantar seguem os da V2 §0.4 — o que precisa estar sujo é **o valor**, não o nome
da coluna, porque o pipeline já normaliza cabeçalho (`DatabasePipeline.tsx:70`):

| Defeito | Por que importa |
|---|---|
| Mesmo nome escrito de 3 jeitos (`JOAO DA SILVA`, `João Silva`, `joao silva`) | é o que o `vocabulario` existe para resolver |
| `status` com `"CANC"` e `"cancelado"` convivendo | achado de qualidade que aparece de graça |
| Coluna preenchida só a partir de certo mês | `nulos_pct` + período têm de denunciar |
| **Várias linhas por data** | o grão — `n_linhas ÷ distintos` tem de revelar |
| Data em formato misto | é o único caso em que `amostra` é insubstituível |
| ⚠️ **Dois cabeçalhos que colidem ao normalizar** (`Data Venda` e `DATA_VENDA`) | ver abaixo |

⚠️ **Bug real do produto atual, e vale plantar:** `DatabasePipeline.tsx` monta
`normMap[h] = normalizeString(h)` num objeto simples e depois `obj[normMap[h]] = row[i]`. **Dois
cabeçalhos que normalizam para o mesmo nome se sobrescrevem em silêncio** — uma coluna some sem
erro. Abrir como pendência independente do remake.

## 0.4. 👤 Desconectar a integração GitHub↔Supabase

Ver §0-bis. É a única ação de painel obrigatória da Etapa 0.

## 0.5. Critério de pronto

⭐ **Os dois lados, não um:**

1. Uma pergunta roda Z→A→C na **Machado Lmtd** com `remake_habilitado = true`.
2. Uma pergunta de um **cliente real** roda Z→A→C igual, com a flag desligada, e o `plum_logs`
   mostra que ela passou pelo caminho antigo.

O item 2 é o que prova que a flag isola. Sem ele, "funciona" só quer dizer "não quebrou ainda".

---

# ETAPA 1 — o remake

**Escopo:** `ai-plum-chat`, `_shared/query_plan.ts`, `query_engine/`, `plum_logs`.
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

## 1.1. ⭐ Os blocos, e quem cada um alcança

A coluna nova é a que importa na V3.

| # | Bloco | Depende | Sem | Alcança quem | Rollback |
|---|---|---|---|---|---|
| 1 | `plum_logs` + `_shared/log.ts` | — | 0,5 | **aditivo** — tabela nova, ninguém lê | dropar nada; parar de escrever |
| 2 | ⚠️ **redutora × seletora** | 1 | 0,5 | ⭐ **TODOS** — aperta comportamento | republicar os 3 consumidores |
| 3 | `metadados` (Python + tipo de pedido) | — | 0,5 | **aditivo** — tipo de pedido novo | republicar Lambda |
| 4 | `vocabulario` + resolvedor de entidade | 3 | 1 | atrás da flag | desligar a flag |
| 5 | `_shared/llm.ts` + adaptadores | — | 0,5 | atrás da flag | desligar a flag |
| 6 | A1 + A2 + cache de A2 | 3, 5 | 1 | atrás da flag | desligar a flag |
| 7 | A3 + A4 + presunções | 4, 6 | 1,5 | atrás da flag | desligar a flag |
| 8 | Negação parcial por pedido | 2, 7 | 0,5 | atrás da flag | desligar a flag |
| 9 | `agg` ampliado (`std`, `median`, `var`, `quantile`) | 2 | 0,5 | **aditivo** — nenhum card usa | republicar Lambda |
| 10 | `registro` + `amostra` + orçamento | 2, 8 | 1 | atrás da flag (caminho novo) | desligar a flag |

**~7 semanas.** Blocos 1, 3 e 5 paralelizáveis.

⭐ **Seis dos dez blocos morrem com um `UPDATE`.** Três são aditivos. Sobra **um** que muda o que o
cliente já vê — e é o próximo parágrafo.

## 1.2. ⚠️ O B02 troca de papel

Na V2, o B02 era *"o único bloco que vale portar para produção antes do resto"* — porque conserta um
furo real: `RawRowsBlocked` verifica que **existe** agregação, não que ela **agrega**. `min`/`max`
sobre coluna de **texto** devolvem valor literal — 500 nomes de clientes, um por grupo, sem consumir
nada.

```
Redutora  sum avg count std median var quantile   → livre
Seletora  min max first last nunique
            └ coluna numérica → livre
            └ coluna de TEXTO → consome orçamento + respeita sensibilidade
```

Na V3 ele vira **o bloco de maior cuidado**, e a razão é a mesma que o tornava atraente: ele é o
único que **aperta** comportamento em vez de só somar. Um card publicado que use `min`/`max` sobre
coluna de texto **muda de resultado** no minuto da publicação — e é um card de cliente.

**Portão obrigatório antes de publicar o B02:**

1. 🤖 `npm test` + `npm run test:py`
2. 🤖 **levantar todos os cards de produção que usam `min`/`max`/`first`/`last`/`nunique` sobre
   coluna de texto** — é uma consulta em `dashboard_cards.query_plan`, não uma inspeção manual
3. 🤖 rodar cada um antes e depois, comparando **número a número**
4. 👤 se algum mudar: decidir caso a caso **antes** de publicar. Mudança correta ainda é mudança, e
   o cliente merece saber
5. 👤 publicar **os três** consumidores de `query_plan.ts`, conferindo `ezbr_sha256` — `version`
   sobe em mudança de secret e **não serve de prova**

⚠️ **Resolver a exceção D-028 antes do B02.** `ai-plum-chat` está em produção com cópia **antiga**
de `query_plan.ts`, de propósito (a Fase 5b não a publicou). Publicar o B02 nos três de uma vez
fecha essa divergência e é a hora certa — mas registre o `ezbr_sha256` dos três **antes**, como
marco zero.

## 1.3. Os demais blocos, em uma linha cada

**B03 `metadados`** — por coluna: `tipo`, `distintos`, `nulos_pct`, `min`, `max`. Zero linhas
expostas. ⭐ `n_linhas ÷ distintos` responde o grão sem olhar dado nenhum; amostra aleatória pode,
por azar, não repetir data nenhuma, a razão nunca erra.

**B04 `vocabulario` + entidade** — ⭐ zero mudança no executor: é `group_by [col] + count + order
desc + limit 200`, um Query Plan comum. O casamento difuso é **código** (normalização + distância de
edição), não LLM. Dois candidatos plausíveis → **pergunta**, não escolhe. ⚠️ Travas: coluna em
`allowed_columns`, teto de cardinalidade (>200 = identificador, recusa), flag `vocabulario_exposto`
default `false`.

**B05 abstração de provedor** — hoje a URL do Gemini está em **4 lugares** em 3 funções. Papel →
modelo em tabela de configuração: `porteiro`/`reconhecedor` → Flash; `planejador`/`interprete` →
Claude. ⚠️ **Não abstraia demais** — prompt, saída estruturada, temperatura, contagem de token.
Unificar cache de prompt, tool use e streaming fica mais complexo que dois clientes separados.

**B06–B07 os agentes** — prompts na V7 §5, **ponto de partida, não entrega**. `amostra` aleatória
com **semente determinística**: `df.sample(5, random_state=hash((dataset_id, len(df))))`. Mesma base
→ mesma amostra → mesmo plano. Aleatório puro quebraria reprodutibilidade, que é metade da razão de
o arquiteto existir.

**B09 `agg` ampliado** — aditivo. ⚠️ `quantile` precisa do parâmetro `p` na gramática **e** no
executor; sem ele o enum aceita um agg que o Python não sabe executar.

**B10 `registro`, `amostra`, orçamento** — teto **5 linhas** por pedido; orçamento por sessão
(usuário × dataset × janela) de **200 linhas brutas**. `agregado`/`serie`/`metadados`/`vocabulario`
não consomem. ⭐ **Teto por pedido é o erro fácil:** 200 pedidos × 5 linhas é a base inteira sem
violar teto nenhum.

## 1.4. Critério de pronto

| # | Verificação | Quem |
|---|---|---|
| 1 | 20 perguntas reais respondidas, cada uma com coluna→conceito, nº de linhas e presunções | 👤 |
| 2 | Pergunta com nome torto **desambigua** em vez de devolver zero | 🤖 teste |
| 3 | Cargo sem `margem` recebe resposta parcial honesta | 🤖 teste |
| 4 | Orçamento de 200 linhas barra na 201ª, com log | 🤖 teste |
| 5 | `min` sobre coluna de texto consome orçamento | 🤖 teste |
| 6 | ⭐ Cards **de produção** batem número a número | 👤 |
| 7 | `plum_logs` permite calcular custo por pergunta e taxa de correção | 🤖 |
| 8 | ⭐ **Nenhum cliente com a flag desligada teve comportamento alterado** — conferido no log, não na intuição | 👤 (novo na V3) |

⚠️ O item 7 precisa de um gesto no front ("não é isso") para `presuncao_corrigida` existir. É 🤖, mas
ninguém tinha listado — sem ele a métrica que valida a Etapa 2 não é capturável.

---

# ETAPA 2 — ligar a flag para o primeiro cliente

**1–2 semanas.** Deixa de ser "estreia em produção" — já estamos nela desde o primeiro dia. Vira o
gesto de **ligar `remake_habilitado` para uma organização cliente**.

`plan_query` e `ad_hoc` convivem no `ai-plum-chat`; a flag decide. Uma organização por vez, rollback
instantâneo. Mede: custo/pergunta, latência, `presuncao_corrigida`, `inviavel` — todos contra a
linha de base registrada na Etapa 0 §0.2.

❓ O limiar de correção é decisão de produto e vira o critério que libera a Etapa 3.

---

# ETAPAS POSTERIORES (esboço)

## Etapa 3 — multi-planilha · 2–3 semanas

⭐ **O trabalho não é no executor** — `execute_plan(plan, tables: Dict[str, DataFrame])` **sempre**
aceitou várias tabelas. É `main.py:164-169`, que monta `{"producao": df}` e **sobrescreve**
`plano["from"] = "producao"`.

⚠️ (a) esse caminho **nunca executou em produção**; (b) `execute_plan` devolve `{"error": …}` para
tabela inexistente em vez de **levantar** — alinhar com `MissingColumnError`, senão `from` errado
vira card vazio em silêncio; (c) cruzamento acontece **depois** da agregação e exige grão declarado.

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

## Bloqueado — não anda por decisão interna

| # | O quê | Depende de |
|---|---|---|
| 1 | ⭐ **Cópia anonimizada da base de um cliente** (§0.3) | conversa comercial com um dos 4 |

⭐ **Na V3 este item ficou mais fácil, não mais difícil.** O argumento comercial melhorou: não é mais
"queremos copiar sua base para um ambiente nosso", é "queremos testar melhorias na sua própria
organização, atrás de uma chave que só nós ligamos".

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

Antes do log existir, vêm das 4 vendas. Depois, do log — que na V3 existe desde a Etapa 0, então o
corpus começa a crescer semanas antes.

⚠️ **Não é tarefa de uma semana, é papel pelas 7** — o prompt será reescrito a cada bloco novo
(quando o `vocabulario` entrar, quando o orçamento entrar, quando o `agg` ampliar). É 👤, e é o único
item sem o qual a Etapa 1 não tem critério de parada.

---

# §7 · O QUE A V3 NÃO RESOLVE

Escrito para não ser descoberto no meio.

1. **Não existe ensaio de migration.** O Supabase novo foi abandonado; o bloco de verificação é a
   única rede. Uma migration errada é corrigida em produção, com clientes conectados.
2. **Não existe estágio no executor.** Aceito pelo time. O dia em que um bug passar pelos testes,
   ele chega aos 4 clientes junto.
3. **A flag não cobre o executor nem o `query_plan.ts`.** Repetido de propósito: é o mal-entendido
   mais provável desta V3. "Está atrás da flag" vale para a camada de agentes, e só.
4. **A `newnew_plum` continua existindo**, parada no commit `1a0b67e`, sem push. Se o remake em
   produção se mostrar insustentável, ela é o ponto de retomada da estratégia de isolamento — e a
   V2 continua no repositório com o passo a passo daquele caminho.
