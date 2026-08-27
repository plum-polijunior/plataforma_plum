# Plano de implementação do remake — V3

**Substitui a V2.** Base: V6 (decisões) + V7 (spec do `ad_hoc`), inalteradas — o remake em si não
mudou.
**O que mudou da V2:** o time decidiu fazer o remake **direto nesta plataforma**, sem ambiente
paralelo. Cai a Etapa 0 da V2 inteira (Supabase novo, Lambda de dev, service account nova).
**Convenções:** 🤖 Claude Code · 👤 Bernardo · `⚠️` armadilha · `⭐` central · `❓` decisão pendente

> ⚠️ **Correção de 2026-08-18, e ela é a mais importante deste cabeçalho.** A primeira redação da V3
> foi escrita sobre a premissa de que *"os 4 clientes seguem usando a plataforma enquanto o remake
> acontece"*. **Falso.** Os clientes usam a **implementação** — um deploy **totalmente separado**
> (Supabase próprio, Lambda próprio, service account própria), já pronta e entregue. Nada feito aqui
> os alcança.
>
> É exatamente o erro que o `contexto/00-LEIA-PRIMEIRO.md` frase 4 chama de "o mais comum e mais
> caro": confundir 🏗️ Plataforma com 🔧 Implementação. Metade da V3 original era proteção contra um
> dano impossível. Esta redação corrige.

---

## ⭐ O ambiente, agora dito direito

| | Quem usa | O que o remake faz com ela |
|---|---|---|
| 🏗️ **Plataforma** (este repositório) | os **devs**, e prospects numa demonstração | é o que o remake muda |
| 🔧 **Implementação** (deploy separado) | os **4 clientes** | ⛔ intocada — e não é destino deste trabalho |

**Para que serve o remake, então:** melhorar a plataforma para **clientes futuros**, e gerar
**motivo de renovação** para os atuais. Ele não é portado para a implementação; o valor dele chega
ao cliente pela conversa comercial, não por deploy.

⭐ **A frase que organiza a V3:** *não há quem proteger — há o que não quebrar.*

O que não pode quebrar é a **demonstração**. A plataforma é "como o cliente experimenta"
(`contexto/02`), então derrubá-la não tira ninguém do ar, mas pode custar uma venda se acontecer na
semana de uma demo. É um risco menor que o da V2, e de outra natureza — e está escrito assim de
propósito, em vez de inflado.

---

## Sumário das etapas

| Etapa | O quê | Esforço | Termina quando |
|---|---|---|---|
| **0** | A bancada: `plum_logs`, chave de desenvolvimento, base de teste suja | 2 dias | uma pergunta roda Z→A→C nos dois caminhos, e o log registra os dois |
| **1** | ⭐ **O remake:** agentes, executor, gramática de query. Dashboard intocado | 5–7 semanas | as 25–30 perguntas de avaliação passam, e os cards batem número a número |
| **2** | ⭐ **Provar sem usuário real** — o problema novo da V3 | 1–2 semanas | existe roteiro de demo sobre base suja e lista escrita do que virou argumento de renovação |
| **3** | Multi-planilha (o `from` deixa de ser sobrescrito) | 2–3 semanas | conectar 3 abas e perguntar sem escolher base |
| **4** | ⭐ **Morte do Tarsila:** card vira "salvar esta resposta" | 2 semanas | `dashboard-agent` deletado, um planejador só |
| **5** | Dicionário camadas 3 e 4 + memória do Plum | 3–4 semanas | cenário e "se A muda, B" passam a existir |
| **6** | Ideias futuras, por gatilho | — | §6 |

**Só as Etapas 0, 1 e 2 são detalhadas.** O resto é esboço de propósito.

---

# §0 · COMO ESTE PLANO É EXECUTADO

## 0.1. A divisão

⭐ **A regra que decide tudo: o Claude Code não sai do repositório.**

| 🤖 Claude Code | 👤 Bernardo |
|---|---|
| Todo código em `src/`, `supabase/functions/`, `query_engine/` | Painel do Supabase: **colar migrations**, criar secrets |
| Escrever o SQL das migrations novas, com bloco de verificação | `npx supabase functions deploy` (ver ⚠️ abaixo) |
| Testes (`vitest`, `pytest`) e rodá-los | ⭐ **O conjunto de 25–30 perguntas** — ver §2 e §6, virou o item crítico |
| Os 4 prompts, em arquivos próprios | Ler o `PENDENTE-DECISAO.md` e responder |
| Atualizar `contexto/` via skill `contexto-plum` | A base de teste (§0.3) |
| Os 4 documentos da §0.2 | |

⚠️ **Migrations continuam manuais** (D-005). Sem ambiente de ensaio, o bloco de verificação
autoexecutável é a única rede — ler linha a linha deixou de ser zelo. Em compensação, o dado sobre o
qual elas rodam é de teste, então o custo de errar é refazer, não avisar cliente.

⚠️ **Deploy de Edge Function é 👤.** O I-03 registra que o deploy deste projeto só é confiável à mão,
conferido por `ezbr_sha256` — e isso vale independentemente de quem é afetado, porque o problema é a
confiabilidade do deploy, não o público dele.

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
⭐ **Separado em ANTES e DEPOIS**, porque a ordem importa:

```markdown
## Antes de rodar este bloco
1. Colar `supabase/migrations/2026…_plum_logs.sql` no SQL Editor
2. Conferir que o bloco de verificação devolveu OK em todas as linhas

## Depois
3. Publicar `ai-plum-chat` e conferir que o `ezbr_sha256` mudou
4. Rodar uma pergunta e verificar 4 linhas em `plum_logs`

## Se der errado
5. O comando exato do rollback, escrito ANTES de publicar
```

⚠️ Sem o "antes", o 🤖 entrega código que não roda e ninguém sabe por quê.

### `CONTEXTO-alteracoes.md` — ponteiros, não resumo
⚠️ Não pode ser um resumo do que mudou no `contexto/` — criaria um segundo dono para o mesmo fato, o
que a regra 1 de `contexto/CLAUDE.md` proíbe. Uma linha por mudança:

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
3. 🤖 se o bloco tocar `query_plan.ts` ou o executor: rodar os cards de teste e comparar número a
   número (§1.2)
4. 👤 publica e executa o "depois"
5. 🤖 roda a skill `contexto-plum` e acrescenta a linha em `CONTEXTO-alteracoes.md`

---

# §0-bis · ⚠️ O QUE TRABALHAR SEM AMBIENTE PARALELO REALMENTE CUSTA

A V2 tinha uma tabela de risco baseada em "isso chega aos 4 clientes". Com a implementação separada,
**nenhuma linha daquela tabela vale como estava.** Esta é a versão honesta — os fatos técnicos são os
mesmos, a consequência é outra.

| Fato técnico | Consequência real |
|---|---|
| **O executor vai direto para o ar.** `query-engine.yml` usa `update-function-code` **sem `--publish` e sem alias**: todo push em `plataforma` tocando `query_engine/**` substitui o executor no mesmo minuto | **Baixa.** Quem consome é a demo e os devs. ⭐ Mas a regra que vem daí continua valendo por outro motivo: mudança no executor é **só aditiva**, e o teste que a cobre entra **no mesmo commit** — porque `pytest`/`vitest` são o único sinal de que algo quebrou, já que não há usuário para reclamar |
| **Não existe ensaio de migration** | **Baixa.** O dado é de teste; errar custa refazer. O bloco de verificação continua obrigatório, mas como higiene, não como rede de contenção |
| **Sheets: 60 req/min por service account** | **Nula.** A implementação usa service account própria. Teste pesado aqui não alcança cliente nenhum |
| **A integração GitHub↔Supabase publica Edge Function sozinha**, com cobertura desconhecida (I-03, medido). Ela observa o branch `plataforma` + diretório `supabase` — e é em `plataforma` que trabalhamos | ⭐ **Média, e é a única que sobra com dente.** Ver §0.4: o remake passa 7 semanas commitando estado intermediário de `ai-plum-chat`, e um push com import quebrado pode ser publicado sem ninguém pedir. ⚠️ **A chave não protege disso** — ela gateia um caminho *dentro* da função; função que não sobe devolve 500 para `plan_query` também, e o chat morre inteiro |
| **B02, B09 e B10 alcançam o dashboard** | **Baixa.** São cards de teste. O portão do §1.2 encolhe de "levantar cards de produção" para "rodar os cards que existem" |
| ⚠️ **A plataforma é a demo de vendas** | ⭐ **É o risco que substitui todos os acima.** Quebrá-la não tira ninguém do ar, mas custa uma venda se coincidir com uma demonstração. Mitigação barata: antes de publicar algo compartilhado, saber se há demo marcada na semana |

⭐ **A regra que resume a seção:** *antes de publicar, saber o que muda e qual é o comando que
desfaz.* Continua valendo — só que agora por disciplina, não por medo.

---

# §0-ter · ⭐ O PROBLEMA QUE A V3 HERDA E NÃO PODE RESOLVER SOZINHA

**O remake perdeu o sinal de qualidade que a V2 contava ter.**

A V2 e a primeira V3 planejavam medir `presuncao_corrigida`, custo por pergunta e taxa de `inviavel`
**no uso real**, e usar isso como critério de que o `ad_hoc` ficou bom. Sem usuário real nesta
plataforma, esse sinal **não existe** — e não vai existir por deploy nenhum.

Consequência direta, e ela reordena as prioridades do plano:

⭐ **O conjunto de 25–30 perguntas de avaliação deixa de ser insumo e vira o único critério de
parada que o remake tem.** Ele estava em "§6 · não atribuído — anda assim que alguém pegar". Sobe
para **bloqueante**: sem ele, ajustar o prompt do A3 por sete semanas é ajustar texto até parecer
bom, e ninguém sabe dizer quando parar.

Pelo mesmo motivo, a **cópia anonimizada da base de um cliente** (§6) sobe de valor: sem usuário
real, dado realista é o único substituto de realidade que resta.

⚠️ **Não confundir com "o log virou inútil".** O `plum_logs` continua na Etapa 0 e continua valendo —
ele mede custo, latência e o formato das falhas dos **devs** usando a plataforma. O que ele não mede
é satisfação, porque não há quem se satisfaça.

---

# ETAPA 0 — a bancada

**Objetivo:** ter como medir e como voltar atrás. **Esforço:** 2 dias.

## 0.1. `plum_logs`

Era o B01 da V2. Continua primeiro: é como se sabe o custo por pergunta e onde o caminho novo falha.

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

⭐ **Registrar a linha de base do caminho atual antes de mexer em qualquer outra coisa.** Sem ela,
"o `ad_hoc` custa X" não tem com o que ser comparado.

## 0.2. A chave de desenvolvimento

```sql
alter table organizations
  add column if not exists remake_habilitado boolean not null default false;
```

⚠️ **Rebaixada em relação à primeira V3.** Lá ela era a espinha do plano — a fronteira que protegia
os clientes. Sem clientes aqui, ela deixa de ser proteção e vira o que permite construir o `ad_hoc`
pela metade **sem quebrar o caminho de demonstração**. Continua valendo porque é barata (uma coluna)
e porque alternar sem republicar é útil numa demo.

Resolvida no servidor, a partir do `organization_id` do JWT — não porque um cliente possa abusar
dela, mas porque decisão de servidor lida do cliente é o padrão que a §4 regra 1 proíbe, e abrir
exceção "porque aqui não importa" é como a regra morre.

## 0.3. A base de teste

Vai para uma organização de teste desta plataforma (Machado Lmtd, Babygoat ou uma nova — tanto faz,
todas são nossas). Compartilhada com a service account desta plataforma.

O que precisa estar sujo é **o valor**, não o nome da coluna, porque o pipeline já normaliza
cabeçalho (`DatabasePipeline.tsx:70`):

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
cabeçalhos que normalizam para o mesmo nome se sobrescrevem em silêncio** — uma coluna some sem erro.
Abrir como pendência independente do remake.

## 0.4. 👤 O que fazer com a integração GitHub↔Supabase

⚠️ **Não é obrigatório, e a primeira redação da V3 dizia que era.** É uma escolha entre três, e vale
entender o mecanismo antes de escolher.

**O que pode dar errado:** a integração observa `plataforma` + `supabase/`, e o remake passa sete
semanas commitando estados intermediários de `ai-plum-chat` — um `adhoc/` pela metade, um import
quebrado, um refactor do `index.ts` no meio. A integração publica **sem ninguém pedir**.

⚠️ **E a chave `remake_habilitado` não cobre isso.** Ela gateia um caminho de código *dentro* da
função. Uma função que quebra no import não chega a olhar a chave: devolve 500 para **todas** as
ações, `plan_query` inclusive. O chat morre inteiro — e chat morto é demo morta, que é a única coisa
que esta V3 pede para não quebrar (§0 do topo).

O agravante é a cobertura desconhecida do I-03: não há aviso, não se sabe quais funções se moveram,
e o campo `version` não serve de prova. Você descobre quando alguém abre o chat.

| Opção | Custo | O que resolve |
|---|---|---|
| ⭐ **Desconectar** (recomendada) | um clique | elimina a classe inteira. O publicado passa a ser sempre ato deliberado — que é o que o I-03 já manda fazer, e que a integração torna inaplicável |
| **Manter e conferir `ezbr_sha256`** a cada push que toque `supabase/functions/**` | recorrente, por 7 semanas | detecta **depois**, não previne. Se escolher esta, a conferência entra no fecho de bloco (§0.3) |
| **Não commitar estado intermediário** de Edge Function | disciplina | frágil ao longo de sete semanas, e falha justo quando alguém está com pressa |

O deploy volta a ser manual de qualquer forma (§0.1): a integração nunca foi confiável o bastante
para substituir o `functions deploy` conferido.

## 0.5. Critério de pronto

⚠️ **Corrigido em 2026-08-18, na execução.** A primeira redação pedia *"uma pergunta roda com a
chave ligada e com a desligada, e o log mostra por qual caminho cada uma passou"* — **impossível na
Etapa 0**: com uma cadeia só, toda pergunta é `legado`, com a chave ligada ou não. O critério
pressupunha o `ad_hoc`, que é a Etapa 1.

O que a Etapa 0 realmente prova:

1. Uma pergunta gera **4 linhas em `plum_logs` com o mesmo `turno_id`** (3 quando o plano vem do
   cache de reuso — comportamento certo, não falha).
2. `tokens_entrada`/`tokens_saida` **não são nulos**. Se forem, "custo por pergunta" não existe, e
   ela é a métrica principal (§0-ter).
3. Uma pergunta fora de escopo grava `status = 'bloqueado'`, não `'ok'`.
4. ⭐ **Revogar o INSERT do log não derruba o chat.** É o único teste que prova a regra "o log nunca
   derruba a pergunta"; o passo está no `MANUAL.md` do B00.

O critério dos dois caminhos migra para o **primeiro bloco que introduzir o `ad_hoc`**.

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

## 1.1. Os blocos

| # | Bloco | Depende | Sem | Onde aparece | Rollback |
|---|---|---|---|---|---|
| 1 | `plum_logs` + `_shared/log.ts` | — | 0,5 | aditivo — tabela nova | parar de escrever |
| 2 | ⚠️ **redutora × seletora** | 1 | 0,5 | ⭐ caminho antigo **e** novo | republicar os 3 consumidores |
| 3 | `metadados` (Python + tipo de pedido) | — | 0,5 | aditivo — tipo de pedido novo | republicar Lambda |
| 4 | `vocabulario` + resolvedor de entidade | 3 | 1 | atrás da chave | desligar a chave |
| 5 | `_shared/llm.ts` + adaptadores | — | 0,5 | atrás da chave | desligar a chave |
| 6 | A1 + A2 + cache de A2 | 3, 5 | 1 | atrás da chave | desligar a chave |
| 7 | A3 + A4 + presunções | 4, 6 | 1,5 | atrás da chave | desligar a chave |
| 8 | Negação parcial por pedido | 2, 7 | 0,5 | atrás da chave | desligar a chave |
| 9 | `agg` ampliado (`std`, `median`, `var`, `quantile`) | 2 | 0,5 | aditivo — nenhum card usa | republicar Lambda |
| 10 | `registro` + `amostra` + orçamento | 2, 8 | 1 | atrás da chave | desligar a chave |

**~7 semanas.** Blocos 1, 3 e 5 paralelizáveis.

## 1.2. O B02 e o caminho antigo

O B02 conserta um furo real: `RawRowsBlocked` verifica que **existe** agregação, não que ela
**agrega**. `min`/`max` sobre coluna de **texto** devolvem valor literal — 500 nomes de clientes, um
por grupo, sem consumir nada.

```
Redutora  sum avg count std median var quantile   → livre
Seletora  min max first last nunique
            └ coluna numérica → livre
            └ coluna de TEXTO → consome orçamento + respeita sensibilidade
```

⚠️ **Não é whitelist** (V6 decisão 4) — é classificação por comportamento, e o `column_roles` já
distingue `text` de `number`.

É o único bloco que **aperta** comportamento em vez de só somar, então é o único que pode mudar o
resultado de um card que já existe. Com os cards sendo de teste, o portão é barato — mas continua
existindo, porque um card que muda sem ninguém notar é um card que mente na próxima demo:

1. 🤖 `npm test` + `npm run test:py`
2. 🤖 rodar os cards de teste antes e depois, comparando número a número
3. 👤 publicar **os três** consumidores de `query_plan.ts`, conferindo `ezbr_sha256` — `version` sobe
   em mudança de secret e **não serve de prova**

✅ **A exceção D-028 já não existe** — atualizado em 2026-08-20. `ai-plum-chat` rodava com cópia
antiga de `query_plan.ts` desde a Fase 5b; o deploy da Etapa 0 a republicou, e a medição pela
Management API mostra os três consumidores na mesma versão. O B02 não herda essa dívida.

⭐ **O que fica da história:** divergência de `_shared/` é **invisível** até alguém emitir a forma
nova — nada quebra, nenhum teste pega, porque os dois lados ficam internamente coerentes. Oito dias
assim, sem sintoma. É por isso que a regra é publicar os três juntos.

## 1.3. Os demais blocos, em uma linha cada

**B03 `metadados`** — por coluna: `tipo`, `distintos`, `nulos_pct`, `min`, `max`. Zero linhas
expostas. ⭐ `n_linhas ÷ distintos` responde o grão sem olhar dado nenhum; amostra aleatória pode, por
azar, não repetir data nenhuma, a razão nunca erra.

**B04 `vocabulario` + entidade** — ⭐ zero mudança no executor: é `group_by [col] + count + order desc
+ limit 200`, um Query Plan comum. O casamento difuso é **código** (normalização + distância de
edição), não LLM. Dois candidatos plausíveis → **pergunta**, não escolhe. ⚠️ Travas: coluna em
`allowed_columns`, teto de cardinalidade (>200 = identificador, recusa), flag `vocabulario_exposto`
default `false`.

**B05 abstração de provedor** — hoje a URL do Gemini está em **4 lugares** em 3 funções. Papel →
modelo em tabela de configuração: `porteiro`/`reconhecedor` → Flash; `planejador`/`interprete` →
Claude. ⚠️ **Não abstraia demais** — prompt, saída estruturada, temperatura, contagem de token.
Unificar cache de prompt, tool use e streaming fica mais complexo que dois clientes separados.

**B06–B07 os agentes** — prompts na V7 §5, **ponto de partida, não entrega**. `amostra` aleatória com
**semente determinística**: `df.sample(5, random_state=hash((dataset_id, len(df))))`. Mesma base →
mesma amostra → mesmo plano. Aleatório puro quebraria reprodutibilidade, que é metade da razão de o
arquiteto existir.

**B09 `agg` ampliado** — aditivo. ⚠️ `quantile` precisa do parâmetro `p` na gramática **e** no
executor; sem ele o enum aceita um agg que o Python não sabe executar.

**B10 `registro`, `amostra`, orçamento** — teto **5 linhas** por pedido; orçamento por sessão
(usuário × dataset × janela) de **200 linhas brutas**. `agregado`/`serie`/`metadados`/`vocabulario`
não consomem. ⭐ **Teto por pedido é o erro fácil:** 200 pedidos × 5 linhas é a base inteira sem
violar teto nenhum.

## 1.4. Critério de pronto

| # | Verificação | Quem |
|---|---|---|
| 1 | ⭐ As **25–30 perguntas de avaliação** passam, cada uma com coluna→conceito, nº de linhas e presunções | 👤 + 🤖 |
| 2 | Pergunta com nome torto **desambigua** em vez de devolver zero | 🤖 teste |
| 3 | Cargo sem `margem` recebe resposta parcial honesta | 🤖 teste |
| 4 | Orçamento de 200 linhas barra na 201ª, com log | 🤖 teste |
| 5 | `min` sobre coluna de texto consome orçamento | 🤖 teste |
| 6 | Cards de teste batem número a número | 🤖 |
| 7 | `plum_logs` permite calcular custo por pergunta | 🤖 |

⚠️ O item 1 é o único que não é automatizável e o único sem o qual os outros não significam nada —
ver §0-ter.

---

# ETAPA 2 — ⭐ provar sem usuário real

**1–2 semanas.** A etapa que a V2 chamava de "estreia em produção" e a primeira V3 chamava de "ligar
a flag para o primeiro cliente". As duas supunham usuário real. **Não há.**

O que substitui, e é o que de fato converte o remake em valor:

1. **A suíte de avaliação roda como suíte.** As 25–30 perguntas deixam de ser um documento e viram
   execução repetível, com o resultado de cada uma registrado. É o que permite dizer "mexi no prompt
   e melhorou" em vez de "achei que melhorou".
2. **Um roteiro de demonstração sobre a base suja.** ⭐ O valor do remake é mais fácil de **mostrar**
   que de descrever: a mesma pergunta que hoje devolve zero por causa de um nome escrito torto passa
   a desambiguar; a resposta passa a dizer de qual coluna saiu e o que presumiu. Isso é a demo.
3. **A lista escrita do que virou argumento de renovação.** Uma linha por capacidade nova, em
   linguagem de cliente, não de arquitetura. É o entregável que a área comercial usa — e sem ele o
   remake fica sendo uma melhoria que só os devs enxergam.

❓ **Decisão em aberto:** quem escreve o item 3, e para quando. É comercial, não técnico, e não
depende do fim da Etapa 1 — dá para começar assim que os blocos 6–7 estiverem de pé.

---

# ETAPAS POSTERIORES (esboço)

## Etapa 3 — multi-planilha · 2–3 semanas

⭐ **O trabalho não é no executor** — `execute_plan(plan, tables: Dict[str, DataFrame])` **sempre**
aceitou várias tabelas. É `main.py:164-169`, que monta `{"producao": df}` e **sobrescreve**
`plano["from"] = "producao"`.

⚠️ (a) esse caminho **nunca executou em produção**; (b) `execute_plan` devolve `{"error": …}` para
tabela inexistente em vez de **levantar** — alinhar com `MissingColumnError`, senão `from` errado
vira card vazio em silêncio; (c) cruzamento acontece **depois** da agregação e exige grão declarado.

adições à etapa 3:
o usuário poderá colocar "observações" em minha base de dados como contexto adicional para o gemini (Ex: considere apenas vendas faturadas para a receita)

ao clicar em refinar semântica, na etapa 4, ele refina a semântica de TODOS os itens, até mesmo os que já estavam certos. mudar pra refinar a semântica somente dos que sofreram alterações do usuário. ou seja, o agente 3.1 só refina a semântica dos contextos que o usuário editou do agente 3

cenário: cadastro uma planilha (concluo as 4 etaps) e ela aparece em "minha base de dados". Agora, clico em "conectar planilha", cadastro a MESMA planilha, e o banco de dados segue como se nada tivesse acontecido. deveria aparecer "planilha já cadastrada" ou "já existe um rascunho dessa planilha". para isso, como os links dos sheets podem ser diferentes, faça um método de análise para bloquear o cadastro de planilhas já cadastradas, ou com rascunho, analisando se elas possuem as mesmas colunas, por exemplo

ao cadastrar uma planilha (concluir as 4 etaps), clicar em "conectar nova planilha" e recadastrá-la, o banco de dados não armazena os dados da nova planilha. deveria aparecer "planilha já cadastrada" ou "já existe um rascunho dessa planilha"

ao cadastrar uma planilha, e mudar uma coluna dela ou adicionar uma coluna no google sheets, tem que recadastrá-la. por isso, permita que em "editar esquema" em minha base de dados, edite o nome da coluna a adicionar uma coluna manualmente (sem ia para essa etapa)

## Etapa 4 — ⭐ a morte do Tarsila · 2 semanas

Criar card deixa de ser "descreva o que você quer" e vira **"salvar esta resposta como card"** — o
card nasce de uma resposta que o usuário **já conferiu**. `dashboard-agent` é deletado.

**Ganhos:** um planejador em vez de dois (mata a D-021) · some o Z-dash e sua cota · `query_plan.ts`
passa a ter dois consumidores.
⚠️ **Só depois da Etapa 2** — se o `ad_hoc` não se provar na avaliação, o produto fica sem criar
cards.

adições à etapa 4:

⚠️ **Correção de 2026-08-27 — o `a2_encaminhador` SAIU DAQUI e foi para a Etapa 3.** Este item
estava escrito como adição à Etapa 4, e ele é o **mesmo agente** do §A3 da Etapa 3, não um segundo.
O que os separava era achar que a Etapa 3 tinha um "seletor de planilha" e a Etapa 4 um
"encaminhador" — 👤 definiu que é **um agente com duas escolhas**: quais bases entram, e qual A3
planeja. Ver `PLANO-etapa-3.md` §A3 e bloco B20.

⭐ Dois consertos de nome, porque o texto original os trocava:
- O A3 é o **`a3_planejador`**. `reconhecedor` era o nome do **A2** — o que o cadastro substituiu no
  B15. Escrever "a3_reconhecedor" cola no A3 o nome do agente que morreu.
- **`MODELOS.FLASH` já é `gemini-3.7-flash`.** "O a2 deverá ser gemini-3.7" não é decisão nova: é
  uma linha no `MODELO_POR_PAPEL`, e é a linha certa pela regra do próprio arquivo (classificação
  sobre entrada curta que roda em toda pergunta é Flash).

⛔ E um achado que aposenta o bloco preservado: o `reconhecedor` **não recebe a pergunta**, e é isso
que o torna cacheável. Escolher bases exige a pergunta ⇒ o A2 é escrito do zero, é por pergunta, não
cacheia, e `plum_reconhecimento` não volta. A D-049 dizia o contrário e está corrigida.

(Nada mais sai da Etapa 4 — a morte do Tarsila continua sendo o titular dela.)

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

## ⭐ Bloqueante — a Etapa 1 não fecha sem isto

| # | O quê | Natureza |
|---|---|---|
| 1 | ⭐⭐ **O conjunto de 25–30 perguntas de avaliação** | 👤 — **subiu de "não atribuído" para bloqueante** na V3 revisada. Ver §0-ter: sem usuário real, é o único critério de parada que existe |

**O entregável é:** 25–30 perguntas reais e, para cada uma, (a) qual seria a resposta certa,
(b) quais presunções são aceitáveis, (c) o que caracteriza falha — recusou quando devia responder?
respondeu quando devia perguntar?

⚠️ **Não é tarefa de uma semana, é papel pelas 7** — o prompt será reescrito a cada bloco novo
(quando o `vocabulario` entrar, quando o orçamento entrar, quando o `agg` ampliar).

As perguntas vêm das 4 vendas já feitas. Depois, do `plum_logs` — que existe desde a Etapa 0, então o
corpus começa a crescer semanas antes de fazer falta.

## Depende de conversa comercial

| # | O quê | Depende de |
|---|---|---|
| 2 | **Cópia anonimizada da base de um cliente** | conversa com um dos 4 |

⭐ **Subiu de valor na V3 revisada.** Sem usuário real, dado realista é o único substituto de
realidade. E o argumento comercial ficou mais fácil: não é "queremos sua base para testar em
produção", é "queremos usar sua base, anonimizada, para construir melhorias que entram na sua
renovação".

## Não atribuído — anda assim que alguém pegar

| # | O quê | Natureza |
|---|---|---|
| 3 | Gesto de "não é isso" no front | 🤖, tarefa normal |
| 4 | `p` do `quantile` na gramática + executor | 🤖, tarefa normal |

---

# §7 · O QUE A V3 NÃO RESOLVE

1. ⭐ **Não há como medir satisfação.** O remake será julgado por uma suíte de perguntas escrita por
   nós, não por gente usando. É a limitação estrutural desta V3, e §0-ter existe para que ela não
   seja esquecida no meio do caminho.
2. **Não existe ensaio de migration nem estágio no executor.** Custo baixo aqui, mas os dois viram
   risco de verdade se algum dia esta plataforma passar a ter usuário externo.
3. ⚠️ **O remake não chega à implementação dos clientes.** É deliberado — mas significa que os 4
   clientes atuais só veem valor disto pela conversa de renovação. Se alguém esperar que o remake
   melhore o que eles usam hoje, vai esperar em vão.
4. **A V2 e a branch `newnew_plum`** (parada em `1a0b67e`) continuam existindo como o caminho do
   ambiente paralelo. Com a implementação separada, esse caminho perdeu quase toda a razão de ser —
   mas não custa nada mantê-lo registrado.
