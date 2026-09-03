# CLAUDE.md — Plataforma Plum

Contexto operacional para agentes de código. Leia isto antes de qualquer alteração.

> ⭐ **Este arquivo é a verdade sobre o que ESTÁ NO AR** — comandos, schema real, armadilhas.
> Para entender **o produto, o negócio e para onde vamos**, comece por
> **`contexto/00-LEIA-PRIMEIRO.md`**. E antes de mexer em qualquer pasta, leia o `CLAUDE.md`
> **dela** (`src/`, `query_engine/`, `supabase/functions/`, `supabase/migrations/`).
>
> ⚠️ Existem **duas** coisas chamadas "Plum": a **plataforma** (multi-tenant, plug-and-play, uma
> demo) e a **implementação** (vertical, por cliente — é o que se vende). Confundir as duas é o erro
> mais caro do projeto: `contexto/02-plataforma-vs-implementacao.md`.
>
> ⚠️ **`docs/` e `contexto/90-arquivo/` foram APAGADOS em 2026-08-14.** O que sobrou daquele
> material está em `contexto/30-decisoes.md` (o porquê de cada escolha) e
> `contexto/31-incidentes-e-licoes.md` (o que deu errado e virou regra). Referência a arquivo de
> `docs/` neste repositório é resquício — se encontrar alguma, corrija.

**O que é:** plataforma multitenant de *Natural Language Query* sobre planilhas.
O usuário conecta um Google Sheets, a IA gera um dicionário semântico da base, e depois
conversa com os dados em português. **A IA nunca calcula: ela planeja, o Python executa.**

Stack: React 18 + Vite 5 + TypeScript + Tailwind + shadcn/ui · Supabase (Postgres + RLS +
Edge Functions Deno) · Google Gemini (`gemini-3.7-flash` e `gemini-3.1-pro-preview`) · Pandas (executor determinístico,
hoje rodando como **AWS Lambda** — ver §5). Projeto Supabase: `rjwidarrsykufuifzunu`.
Deploy do front: Vercel (SPA rewrite em `vercel.json`). Deploy do executor: GitHub Actions →
ECR → Lambda, via OIDC (`infra/aws/`).

---

## 1. Comandos

```sh
npm install
npm run dev          # Vite em http://localhost:8080 (host "::")
npm run build        # ⚠️ SÓ BUILD, sem typecheck — ver abaixo
npm run lint         # eslint
```

⚠️⚠️ **NÃO EXISTE TYPECHECK NO CAMINHO PADRÃO, e as duas linhas que este arquivo tinha aqui eram
falsas** (corrigido em 2026-08-25, depois de um `ReferenceError` chegar à tela do usuário):

| comando | o que ele NÃO faz |
|---|---|
| `npm run build` | é `vite build`. **esbuild só REMOVE tipos**, não os checa. Passa com identificador inexistente |
| `npx tsc --noEmit` | checa **ZERO arquivos**: o `tsconfig.json` da raiz tem `"files": []` e só *references*. Silêncio dele é lista vazia, não aprovação |

⭐ **Os comandos que enxergam de verdade:**

```sh
npx tsc -p tsconfig.app.json --noEmit    # o front (src/)
npx --yes deno check supabase/functions/<nome>/index.ts   # uma Edge Function
```

⚠️ O `deno check` precisa de `nodeModulesDir: "auto"` num `deno.json` (o `_shared/llm/claude.ts`
importa o SDK da Anthropic de `npm:`). Nenhum dos dois está no CI —
`contexto/20-pendencias.md` tem o item, e `31-incidentes-e-licoes.md` I-11 tem a história.

⛔ **"O build passou" não é evidência de nada neste repositório.** Antes de escrever essa frase,
rode um dos dois comandos acima.

Testes automatizados, em três frentes:

```sh
npm test                              # vitest — RBAC de coluna (_shared/query_plan.ts),
                                      # normalização de nome de coluna (src/lib/colunas.ts)
                                      # e extração de id/gid da URL (src/lib/google-sheets.ts)
npm run test:py                       # pytest do query_engine (bloqueio de linha bruta, assinatura, etc.)
psql "$DATABASE_URL" -f supabase/tests/endurecimento_rls_test.sql   # RLS/SSO
psql "$DATABASE_URL" -f supabase/tests/sso_dominio_test.sql
```

O CI (`.github/workflows/query-engine.yml`) roda `npm test` + `pytest` a cada push/PR que
toque `query_engine/`, `supabase/functions/` ou `src/lib/`, e só publica no Lambda se os dois
passarem — são as barreiras de privacidade/segurança (bloqueio de linha bruta, extração de
coluna do RBAC) que não podem regredir em silêncio. (k-anonimato foi removido em 2026-08-08
por decisão de produto — ver `contexto/30-decisoes.md` D-012.)

**Migrations não são aplicadas por CLI.** `supabase/config.toml` só contém `project_id`;
o fluxo real é copiar o SQL no **SQL Editor do painel Supabase** e rodar, na ordem do §6, lendo o
bloco de verificação no fim de cada uma (ver `supabase/migrations/CLAUDE.md`). Edge Functions vivem
em `supabase/functions/<nome>/index.ts` (padrão CLI, ver `supabase/functions/README.md`).

⚠️ **Deploy de Edge Function NÃO é automático — verificado em 2026-08-10.** Esta seção dizia
que a integração nativa GitHub↔Supabase publicava sozinha a cada push em `plataforma`. Não
publica: as 5 funções em produção têm `updated_at` idêntico em `2026-08-08T23:03:17Z` e não
se moveram depois de **três** merges que mudaram `supabase/functions/**`. O check
"Supabase Preview" que aparece no commit roda em 5 segundos, sem output, e reporta `success`
sem publicar nada. O que subiu em 08/08 foi quase certamente um `supabase functions deploy`
manual.

**Consequência prática, e é grave:** o código da Edge Function no repositório **não é** o que
está rodando. Antes de depurar qualquer comportamento de `ai-plum-chat`/`ai-agents`, confirme
a versão implantada (`mcp__supabase__get_edge_function`, ou o painel) — senão você analisa
linhas que produção nunca executou. Para publicar:
`npx supabase functions deploy <nome> --project-ref rjwidarrsykufuifzunu`.

⚠️ **Correção de 2026-08-12: o check "Supabase Preview" PUBLICA, mas não publica tudo.** O
parágrafo acima dizia que ele reportava `success` sem publicar nada. Está errado, e foi medido:
no push de `e203320` o check rodou `18:38:17Z → 18:38:22Z` e `dashboard-execute` e
`dashboard-agent` ficaram com `updated_at` **exatamente `18:38:22Z`** — o mesmo segundo. Já a
`ai-plum-chat`, cujo `index.ts` era o único que aquele push mudava, **não foi tocada**: ela
continuou na versão de 6 horas antes e só subiu no `functions deploy` manual, 49 min depois.

Não sabemos o critério de seleção dele, e é isso que importa: **o check é um publicador de
cobertura desconhecida.** Continue publicando à mão a função que você mexeu, e continue
conferindo o `ezbr_sha256`. A diferença é que agora também vale o inverso — uma função que você
**não** mexeu pode ter sido republicada pelo push de outra pessoa, então divergência entre
`_shared/*` empacotado em consumidores diferentes pode aparecer sem ninguém ter feito deploy.

⚠️⚠️ **Correção de 2026-08-31 — NÃO EXISTE MAIS REPOSITÓRIO CONECTADO. Nada publica sozinho.**

Confirmado no painel (nenhum repositório na integração) e **medido do jeito que esta seção sempre
mediu**: três commits tocando `supabase/functions/**` entraram em `plataforma` — `735fba5`,
`26ead69` e `75a3b21` — e `ai-plum-chat` **não se moveu**, presa na versão 74 de
`2026-08-26 23:12Z`. O publicador de cobertura desconhecida acabou.

⭐ **A regra fica mais simples, e melhor:** publicar Edge Function é **sempre** manual, e o inverso
some — uma função que você não mexeu não é mais republicada pelo push de outra pessoa. A
divergência de `_shared/*` que podia aparecer sem ninguém ter feito deploy deixou de ser possível.

⛔ **E fica mais perigosa numa coisa só, que já custou uma queda:** a Vercel publica o front **no
push**, a Edge Function **não**. Toda mudança de contrato entre os dois é par indivisível com deploy
assimétrico — o front chega antes, sempre. Ver `contexto/31-incidentes-e-licoes.md` I-14, e a regra
que nasceu dele: **ponte de compatibilidade, nunca janela.**

Como conferir os três consumidores de `_shared/query_plan.ts` sem Docker (o `functions download`
exige Docker) e sem despejar o arquivo no contexto — o corpo vem como ESZIP com as fontes em
texto:

```sh
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/rjwidarrsykufuifzunu/functions/<nome>/body" \
  | grep -a -c "walkArithmetic"
```

Em 2026-08-12 os três (`ai-plum-chat`, `dashboard-execute`, `dashboard-agent`) deram contagens
idênticas — sem divergência no interpretador de RBAC.

Migrations continuam manuais, de propósito.

---

## 2. Mapa do repositório

`ls` mostra a árvore. Aqui só o que ela **não** mostra — o que cada arquivo esconde, e as
armadilhas. Se um arquivo não está listado, faz o que o nome diz.

> ⚠️ **Sobreposição conhecida, a resolver:** desde 2026-08-14 existe um `CLAUDE.md` por pasta de
> código (`src/`, `query_engine/`, `supabase/functions/`, `supabase/migrations/`) com as armadilhas
> **daquela** pasta. Parte do conteúdo de §2 e §7 aqui está repetida lá. **O dono da armadilha
> específica de uma pasta é o `CLAUDE.md` dela**; este arquivo deve ficar só com o que é global.
> Enxugar §2/§7 é a próxima limpeza — até então, se os dois discordarem, vale o da pasta.

| Arquivo | O que o nome não conta |
|---|---|
| `src/hooks/use-org-access.ts` | ⭐ estado de acesso derivado das **claims do JWT**, não do banco |
| `src/integrations/supabase/types.ts` | ⚠️ atualizar **SEMPRE** junto com migrations (§4.12) |
| `src/integrations/supabase/client.ts` | gerado; URL e anon key hardcoded (dívida, §8) |
| `src/pages/Cfgdatabase.tsx` | datasets + edição de esquema. ⚠️ **Não tem a matriz de permissões** (nem `?tab=permissoes`): ela vive em `Dashboard.tsx`, e mover é a pendência P9. Desde o B22, é aqui que fica o **Reler a planilha**, que reconcilia o dicionário com o cabeçalho de hoje preservando o `id` da base |
| `src/pages/Auth.tsx` | entrar / primeiro acesso / criar organização. Login pousa em **`/inicio`**, não em `/dashboard` (§7); "Entrar com Email" só **existe** quando e-mail e senha passam na validação local. Desde 2026-08-12, sem painel lateral decorativo — só o formulário, centralizado |
| `src/pages/Index.tsx` (landing) | rota `/`. Desde 2026-08-12 roda no `:root` claro (sem `.dark`) — ver §7. Seções em `src/components/sections/`; `plum-chat`/`DataPlaygroundSection` ("Simule o Plum") foram removidos, não confundir com `ai-plum-chat` |
| `src/components/DatabasePipeline.tsx` | pipeline de importação em **4** etapas (eram 5 até o B13; não há mais upload de arquivo); a tabela antes-vs-depois do passo 2 nasceu em 2026-08-25 e é a revisão do R-06; rascunhos em `datasets.sketch` |
| `src/components/ui/` | shadcn — preferir compor a editar |
| `query_engine/security.py` | 4 barreiras: SigV4 (infra) + HMAC + frescor + RBAC de coluna |
| `query_engine/sheets.py` | 1 `batchGet` por dataset; teto de linhas checado **antes** do parse; resolve `gid → nome da aba`; **normaliza o cabeçalho** (contraparte de `src/lib/colunas.ts`) |
| `src/lib/colunas.ts` | ⭐ metade de um contrato entre duas linguagens — normaliza nome de coluna, e o Python espelha. Tabela de casos replicada nos testes dos dois lados |
| `src/lib/google-sheets.ts` | extrai `id` **e `gid`** da URL colada (`extrairSheetRef`); `extrairSheetId` é wrapper |
| `query_engine/config.py` | segredos via SSM Parameter Store — nunca `.env` com valor |
| `query_engine/cache.py` | TTL de 15 min, **ligado** desde 2026-08-07 (`contexto/30-decisoes.md` D-011) |
| `contexto/12-visao-tecnologica.md` | ⭐ arquitetura do chat + query engine (§9 lá: chat ≠ dashboard) |
| `infra/aws/PASSO-A-PASSO.md` | histórico do plano de EC2 **abandonado** — aponta pra `infra/aws/` |
| `supabase/migrations/` | aplicar **em ordem** (§6), e à mão pelo SQL Editor |
| `supabase/functions/ai-plum-chat/` | chat: Agente Z/A/C + `execute_plan` (executor real) |
| `supabase/functions/dashboard-agent/` | ⚠️ criar card a partir de pergunta (`gerar_card`) + `executar_previa`. **Dois** agentes dentro de `gerar_card`: Z-dash (escopo) e Tarsila do Amaral (planejador) — §5. Prompt de planejamento **próprio**, separado do Agente A do chat (decisão D1) — mexeu na gramática do plano? mexeu aqui também. Ficou **em produção sem existir em commit nenhum** até 2026-08-11 |
| `supabase/functions/ai-agents/` | pipeline de importação (agentes 0/1/2/3/3.1) |
| `supabase/functions/_shared/query_plan.ts` | ⭐ **único** interpretador de Query Plan (extrai colunas p/ RBAC) |
| `supabase/functions/_shared/dicionario.ts` | ⭐ **único** leitor do `schema_metadata`. Tolera v1 e v2 para sempre, nunca lança. `paraPrompt` é o que o A3 recebe |
| `supabase/functions/_shared/perfil.ts` | ⭐ as regras determinísticas de `papel_analitico`/`vocabulario_util`. **Dois** consumidores (`ai-agents` e `ai-plum-chat`) precisam concordar — divergir faz o dicionário afirmar o que ninguém conferiu |
| `supabase/functions/_shared/llm_core.ts` | ⭐ a tabela papel→modelo. **Todo ID de modelo mora aqui**, e só aqui |
| `supabase/functions/ai-agents/prompts/` | um arquivo por agente do cadastro, desde o B14 |
| `testes/avaliacao/` | a suíte que chama modelo de verdade. `npm run avaliacao`, **fora** do `npm test` |
| `infra/aws/PASSO-A-PASSO.md` | ⭐ fonte única de verdade do executor — **não duplicar** |
| `testes/chat/` | roteiros de validação **manual** — não roda no CI (ver README lá) |
| o PRD antigo (apagado em 2026-08-14) | visão/roadmap — **NÃO** é o schema real (§3) |
| `contexto/31-incidentes-e-licoes.md` I-01 | ⭐ pós-mortem do escalonamento de privilégio (origem do §4) |

---

## 3. Modelo de dados (schema real)

> A verdade é `supabase/migrations/` (inclusive o `login_supabase.sql` que está lá dentro). O o PRD antigo (apagado em 2026-08-14)
> descreve um modelo aspiracional (`tenants`, `tenant_users`, `data_dictionary`, …) que
> **não existe no banco**. Não codifique contra o PRD.

| Tabela | Papel | Colunas notáveis |
|---|---|---|
| `organizations` | tenant | `join_code` (12 chars cripto, UNIQUE), `share_id` (4 chars, legado), `join_mode` ∈ `share_id`\|`dominio`, `dashboard_max_rows` (padrão 200000). `dashboard_k_min` ainda existe na coluna mas está **vestigial**: não é mais lido por nenhum código desde a remoção do k-anonimato (2026-08-08) |
| `profiles` | usuário (estende `auth.users`) | `organization_id` (nullable!), `role_id`, `status` enum `profile_status`, `updated_at`, `tema` ∈ `claro`\|`escuro`\|`NULL` (preferência de tema do produto; escrita só via RPC `definir_tema()`, nunca `UPDATE` direto — §7) |
| `roles` | cargo por org | `name` — Admin é **por nome**, não por flag |
| `role_permissions` | permissão granular | `(role_id, dataset_id)` UNIQUE, `allowed_columns TEXT[]` default `'{}'` |
| `datasets` | base conectada | `google_sheet_id` (fonte da verdade p/ o executor), `google_sheet_url` (só exibição), `google_sheet_gid` ⭐ (**qual aba**, e tem precedência sobre o nome — ver abaixo), `google_sheet_tab` (nome da aba, default `Sheet1`, usado só quando o `gid` é nulo), `schema_metadata jsonb` ⭐, `sketch jsonb`, `status` |
| `dashboard_cards` | card do dashboard = Query Plan salvo | `query_plan jsonb`, `viz` (sem `donut`, ver `DESIGN.md`), `refresh_interval_minutes` |
| `dashboard_card_snapshots` | histórico de execuções de card | chave por `permissions_fingerprint` (hash de `allowed_columns`), **não** por `role_id` — revogar coluna invalida o cache sozinho |
| `organization_domains` | SSO | `domain` UNIQUE + lowercase, `verified`, `verification_method` ∈ `admin`\|`dns_txt`, `ms_tenant_id` |
| `public_email_domains` | denylist | 15 domínios públicos seed (gmail, outlook, …) |
| `domain_binding_audit` | auditoria de vínculo | `signal`, `result` |
| `profile_changes_audit` | auditoria append-only | `field`, `old_value`, `new_value` — só o trigger escreve |
| `plum_chat` | histórico do chat | `role` ∈ `user`\|`assistant`, `content`, `plan_query jsonb` ⭐ (o Query Plan, guardado para reuso), `dataset_id`. `assunto` é **vestigial** desde 2026-08-12: não é escrita nem lida |
| `Leads` | landing page | dívida conhecida (§5, D-13) |

`profile_status = ('pendente','ativo','rejeitado')` (docs também mencionam `desativado`).

**`schema_metadata` é o cérebro do produto.** Guarda, por coluna: a definição semântica
(para o LLM entender o conceito de negócio) e as `formattingRules` (limpeza/tipagem).
Toda inteligência do chat depende dele.

### Qual aba da planilha é lida

`google_sheet_gid` manda; `google_sheet_tab` é fallback. A API do Google exige o **nome** da
aba no range (`'Vendas 2026'!A2:A`), mas nome é apelido mutável — guardar o nome funciona até
alguém renomear a aba, e então a base quebra sem ninguém ter mexido nela. O `gid` é atribuído
pelo Google na criação da aba e **não muda com rename**, então é ele que o banco guarda; o
executor traduz `gid → nome` na leitura (`sheets.resolver_aba`), com cache próprio de 15 min.

`gid` que não existe mais na planilha é **erro**, nunca fallback silencioso para o nome: ler
uma aba que ninguém escolheu devolveria número de outro recorte (R-08).

⚠️ **`gid = 0` é a primeira aba, um valor legítimo.** `if (!gid)` / `if not gid` manda a
primeira aba de toda planilha para o caminho errado — compare sempre com `null`/`None`.

### Nome de coluna é um contrato entre duas linguagens

As chaves de `schema_metadata`, os valores de `role_permissions.allowed_columns` e as colunas
dos Query Plans estão todos em `snake_case` sem acento — saída de `normalizarNomeDeColuna`
(`src/lib/colunas.ts`), aplicada na importação.

A planilha continua com o cabeçalho **original** (`NATUREZA DA AQUISIÇÃO`), porque o Plum
nunca escreve nela (R-01). Por isso o executor aplica a **mesma** normalização ao cabeçalho
lido (`normalizar_coluna`, `query_engine/sheets.py`): é assim que os dois lados se encontram.
Ver a dívida das duas implementações em §8.

Coluna da planilha **sem cabeçalho** não é endereçável — não existe nome pelo qual pedir, e
inventar um seria adivinhar qual coluna é qual. O erro diz isso explicitamente.

### Hierarquia de acesso

`anon` < autenticado sem org (`sem_org`) < membro `pendente` (**não lê dados**) <
membro `ativo` < `Admin` da org < `service_role`.

Permissão default é **nada**: `allowed_columns` começa vazio; liberação é explícita por
par `(cargo, dataset)`.

---

## 4. Segurança — regras invioláveis

Em 2026-07-22 o projeto sofreu um escalonamento de privilégio (OWASP A01): o trigger de
cadastro lia `organization_id` e `status` de `raw_user_meta_data`, campo controlado pelo
cliente. Qualquer pessoa entrava em qualquer organização já como membro ativo.
As regras abaixo são o resultado. **Violá-las é regressão de segurança.**

### Banco

1. **Nunca decidir nada a partir de `raw_user_meta_data`.** Aceite do cliente apenas um
   *segredo portador digitado* (`join_code`), nunca uma *declaração de identidade*
   (`organization_id`, `status`, `role_id`). Todo identificador vindo do cliente é
   **candidato** e precisa ser validado contra o banco.
2. `status` é sempre decisão do servidor: `'pendente'` em todo cadastro. `'ativo'` só para
   quem cria a própria organização, via RPC `criar_organizacao()`.
3. Escopo de tenant sempre por **`organization_id = public.current_org_id()`**. Nunca
   subquery direta em `profiles` dentro de policy (causa recursão de RLS).
4. **Toda policy de leitura de dados checa status**, não só organização:
   `+ public.is_active_member()`. Escrita/gestão exige `public.is_org_admin()` em
   `USING` **e** `WITH CHECK`.
5. **Nenhuma policy de UPDATE em `profiles` pode alcançar o próprio registro** — a policy
   ativa exige `id <> auth.uid()`. Sem isso o usuário se auto-promove.
6. Toda função `SECURITY DEFINER` precisa de `SET search_path = ..., pg_temp` com
   **`pg_temp` obrigatoriamente por último** (senão dá sequestro via `pg_temp.profiles`).
7. **Nunca expor `organizations` em SELECT público** (vazava a lista de clientes).
   Use a RPC `resolver_codigo_organizacao`, que devolve só `{org_id, org_name}`.
8. **Fail-closed:** claim ausente deve *negar* acesso. Renomear uma claim de um lado só
   faz o RLS parar de casar em silêncio — é o que o cenário (j) do teste de SSO protege.
9. Migrations são **idempotentes** (`IF NOT EXISTS`, `CREATE OR REPLACE`,
   `DROP POLICY IF EXISTS` antes de `CREATE POLICY`) e **não destrutivas**, e terminam com
   um bloco `SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END` autoverificável.
   Mantenha esse padrão.

### Frontend

10. **Nunca ler tabela sensível direto como `anon`.** Use RPC:
    `rpc('resolver_codigo_organizacao', { p_codigo })` e `rpc('criar_organizacao', { p_nome })`.
11. `signUp` sem metadata no fluxo de criação de org (dois passos: `signUp` → RPC).
    No cadastro de membro envia **apenas** `data: { join_code: codigo.toUpperCase() }`.
12. **Front e migration são par indivisível.** Aplicar migration com front antigo quebra a
    busca de organização; subir front sem a migration dá erro de função inexistente.
    Atualize `src/integrations/supabase/types.ts` na mesma alteração.

### Funções/RPCs disponíveis

`current_org_id()` · `current_profile_status()` · `is_active_member()` · `is_org_admin()` ·
`resolve_org_from_identity(email, google_hd, ms_tid)` · `gerar_join_code()` ·
`resolver_codigo_organizacao(p_codigo)` · `criar_organizacao(p_nome)` ·
`custom_access_token_hook(event)` · `handle_new_user()` [trigger `on_auth_user_created`] ·
`tocar_updated_at()` · `auditar_mudanca_perfil()`.

### ⚠️ Os TRÊS lugares do SSO — e é sempre o segundo que quebra

O front está em `https://plum-polijunior.com.br` (Vercel) desde 2026-08-27. Trocar de domínio, abrir
um ambiente novo ou criar um preview mexe em **três** lugares, e eles não se avisam:

| # | onde | o quê | sintoma quando falta |
|---|---|---|---|
| 1 | **Vercel** | o domínio aponta para o projeto | o site não abre |
| 2 | ⭐ **Supabase → Authentication → URL Configuration** | **dois** campos: `Site URL` (o fallback) e `Redirect URLs` (a allow-list, com sufixo `/**`) | ⚠️ o login **funciona** e aterrissa na URL errada, com a sessão no fragmento `#access_token=` |
| 3 | **Google Cloud → cliente OAuth** | o domínio nas *Authorized JavaScript origins*. O *redirect URI* aponta para `…supabase.co/auth/v1/callback` e **não** muda | erro do Google antes de sair da página |

⛔ **O sintoma do 2 engana**: aterrissar em `localhost:3000` parece build com URL de dev embutida, e
manda quem investiga caçar variável de ambiente no front. Não há nenhuma — `Auth.tsx:141` usa
`${window.location.origin}`, calculado em runtime. O Supabase é que rejeita o origin desconhecido e
cai no `Site URL`. Aconteceu em 2026-08-27, na virada para o domínio próprio.

⭐ **`Redirect URLs` precisa do `/**`.** Sem o sufixo só a raiz é autorizada, e como o código pede
`/inicio`, o pedido cai no fallback do mesmo jeito — com um sintoma mais sutil, porque a URL final
até é a certa, só que sem a rota.

⚠️ Preview da Vercel tem URL por deploy: sem uma entrada curinga (`https://*.vercel.app/**`), todo
preview reproduz isto e parece intermitente.

### JWT e SSO por domínio

O **Custom Access Token Hook** injeta 4 claims: `organization_id`, `profile_status`,
`role_id`, `role_name` (sem perfil → `profile_status: "sem_org"`). Ele é ativado
**manualmente** no painel (Authentication → Hooks) — não é versionável.
As funções `current_*` têm fallback para `profiles`, então o sistema funciona sem o hook,
mas com uma query extra por checagem de RLS.

⚠️ **Claims só são reemitidas no login.** Mudar `status` no banco não reflete até o
usuário sair e entrar.

`handle_new_user()` (v3, vigente) tem duas portas mutuamente exclusivas:

- **Porta 1 — código:** `join_code`/`share_id` do metadata, exige `join_mode = 'share_id'`.
- **Porta 2 — domínio:** `resolve_org_from_identity()`, exige `join_mode = 'dominio'`.
  Precedência: **denylist antes de qualquer lookup** → `ms_tenant_id` (claim `tid` do Entra)
  → `domain` com `verified = true`. Domínio candidato: `hd` do Google > sufixo do e-mail.

Ambas as portas produzem `status = 'pendente'`. `organization_id` pode ficar `NULL`.
Roteamento por domínio só acontece **na criação da conta**. Verificação de domínio é ato
administrativo consciente (sem checagem de DNS no MVP).

No `use-org-access.ts` há uma armadilha registrada: durante o callback do SSO, se
`window.location.hash` contém `access_token=` ou `error=`, **não setar `anonimo`** — o
roteador destruiria a URL antes de a sessão ser salva.

---

## 5. Arquitetura de IA

`ai-agents`, `ai-plum-chat` e `dashboard-agent` são roteadores por `action`, todos usando
Gemini com `response_mime_type: application/json` quando a saída é estruturada. A
`temperature` varia por papel, não por função: **0.0 em quem emite Query Plan** (Agente A,
Tarsila do Amaral — plano é gramática, não criatividade) e 0.1–0.2 em classificadores e
sintetizadores. A `GEMINI_API_KEY` vive no ambiente da Edge Function — **nunca no front**.
Uma quarta peça, `dashboard-execute`, não fala com o Gemini — ela só autoriza e chama o
executor Python (ver abaixo).

### `ai-agents` — pipeline de importação (`DatabasePipeline.tsx`, `Cfgdatabase.tsx`)

| `action` | Agente | Função |
|---|---|---|
| `guard` | 0 — Guardião | `PERMITIDO` / `BLOQUEADO`; barra prompt injection e off-topic |
| `predict_semantics` | 1 | ⭐ **o dicionário v2 inteiro**: definição semântica, `papel_analitico` e `vocabulario_util` por coluna, mais `grao` e `observacoes` da base. Recebe perfil + 20 linhas + vocabulário. **Absorveu o A2 do chat** (D-049) |
| `refine_semantics` | 2 | melhora as definições editadas pelo usuário para consumo por LLM |
| `format_data` | 3 | gera `formattingRules` + `formattedSamples` (as **10** primeiras linhas transformadas, `LINHAS_NO_ANTES_DEPOIS`) |
| `refine_format` | 3.1 | altera **apenas** a regra pedida, preserva as outras, re-aplica às amostras |
| `column_support` | suporte | ⭐ **explicativo, sem ação executiva.** O box "Faltou alguma coluna?" do passo 1: explica que o Plum lê **uma aba** e **só a primeira linha** como cabeçalho, e o formato que a planilha precisa ter. Recebe **só a pergunta** — não vê a base, não diagnostica coluna específica (o passo 1 já mostra colisões e colunas sem título na tela). Resposta em **texto corrido**: é o único agente fora de `isJsonResponse`, porque ela cai num parágrafo simples. ⚠️ Até 2026-08-25 o prompt era **cópia do Agente 3** ("o usuário discordou da formatação... retorne `formattedSamples`") |

⚠️ **Todos os seis rodam no `MODELOS.RACIOCINIO`** (`gemini-3.1-pro-preview`) desde
2026-08-25, não no Flash — o que eles escrevem entra no `schema_metadata` e vale para toda
pergunta futura sobre a base, e o custo é por base, não por pergunta (D-047). Papéis:
`guardiao`, `formatador`, `semantico`, `suporte`.

⭐ **Desde o B14 os prompts vivem em `ai-agents/prompts/`, um por agente, e toda chamada passa por
`_shared/llm.ts`** — o `ai-agents` era a última função de produção fora da abstração de provedor
(item C2; sobra o `dashboard-agent`, fora de escopo). Antes o modelo era o literal
`gemini-3.5-flash` cravado na URL, invisível para a tabela que existe para ser o único lugar de
subir versão — e por isso ficou duas versões atrás sem ninguém notar.

**Pipeline de 4 etapas** (⚠️ eram 5, e o upload sumiu no B13 — não há mais `FileReader`,
`<input type="file">` nem parser de planilha no front): (0) **conectar** — cola-se a URL, e a
Edge Function lê **só o cabeçalho** (`cabecalhos_da_planilha` → `sheets.get_meta`, `ranges=
['Aba'!1:1]`); (1) revisão de colunas, normalização para `snake_case`, com as colisões
barrando o avanço; (2) formatação (agentes 3 / 3.1), e é na entrada dela que as **20 linhas**
de `amostra_do_cadastro` são lidas — a única leitura de dado do cadastro; (3) semântica
(agentes 1 / 2), reusando aquelas mesmas 20 linhas. A persistência do `schema_metadata`
acontece no fim de (3), não numa etapa própria. Rascunhos intermediários vivem em
`datasets.sketch` e viram `NULL` na finalização.

⭐ **A tabela antes-vs-depois do passo 2 passou a existir em 2026-08-25.** Esta seção dizia
"(antes vs depois)" desde sempre, mas nenhuma versão do `DatabasePipeline.tsx` jamais
renderizou `formattedDataSamples` — conferido em todo o histórico, do `3219def` em diante. O
estado era escrito e salvo no `sketch` sem consumidor, e aprovar a formatação era acreditar na
frase que a IA escreveu sobre o próprio trabalho. Hoje a tabela mostra as 10 linhas, com o
valor antigo riscado **só nas células que mudaram**.

### `ai-plum-chat` — chat conversacional (`PlumChat.tsx`)

Três invocações sequenciais, todas recebendo `schemaMetadata`:

1. `guard` — **Agente Z** (Guardião de Contexto e Viabilidade). Retorna
   `{status: PERMITIDO|BLOQUEADO|INVIAVEL, message}`. `INVIAVEL` = a pergunta é
   sobre dados mas as colunas necessárias não existem (ex.: pedir lucro sem coluna de custo).
   Roda **sempre**, inclusive quando o plano vem do cache — é ele que barra pergunta fora de
   escopo. O campo `assunto` saiu em 2026-08-12: era `STRING` livre com lista aberta de
   exemplos no prompt, saía inconsistente para a mesma pergunta, e nada o consumia.
2. `plan_query` — **Agente A** (Planejador Semântico). Vê só o `schema_metadata`, **nunca as
   linhas de dados**. Emite um Query Plan JSON: `from`, `target_columns`, `select`, `where`,
   `group_by`, `order_by`, `limit`.
   ⭐ **Pode ser PULADO desde 2026-08-12**: se a mesma pessoa já fez exatamente aquela
   pergunta, na mesma base, e o plano saiu idêntico `REPETICOES_PARA_REUSAR` vezes, o plano
   guardado em `plum_chat.plan_query` é reusado. Ver `src/lib/plano-cache.ts`.
   ⚠️ **Reusa-se o PLANO, nunca o RESULTADO.** O plano reusado continua entrando por
   `execute_plan` e passando por `authorizePlan` com o `allowed_columns` de quem pergunta
   agora — mesmo modelo dos `dashboard_cards`. Cachear o número pularia o RBAC por definição
   e exigiria `permissions_fingerprint` na chave, como `dashboard_card_snapshots` faz.
   ⚠️ **Plano com data absoluta nunca é guardado** (`planoTemData`): "quanto faturei hoje"
   vira `["2026-08-12", ...]`, e reusar amanhã devolveria o dia errado em silêncio. Estender
   o cache a datas relativas foi avaliado e **recusado** — ver
   `contexto/30-decisoes.md` D-024.
3. `synthesize_answer` — **Agente C** (Sintetizador). Vê a pergunta + o vetor de resultados
   do executor, **nunca a base**. Não inventa número que não esteja no resultado.

**Entre (2) e (3) roda o executor real, desde 2026-08-07 (Fase 2)** —
uma quarta ação, `execute_plan`, no mesmo `ai-plum-chat`: resolve `allowed_columns` do cargo
do usuário para o dataset, autoriza o plano do Agente A com `authorizePlan`
(`_shared/query_plan.ts` — o mesmo interpretador que `dashboard-execute` usa, não uma segunda
implementação), assina (HMAC + SigV4) e chama o mesmo Lambda do dashboard. Sem card salvo nem
cache de snapshot — cada pergunta do chat é ad-hoc; falha do executor vira mensagem de erro,
não degradação para resultado antigo (não existe "resultado antigo" de uma pergunta nova).

### `dashboard-agent` — criar card por pergunta (`NovoCardDialog.tsx`)

Dois agentes, ambos dentro da ação `gerar_card`, nesta ordem:

1. **Agente Z-dash** (`verificarEscopo`) — guardião de escopo, desde 2026-08-11. Devolve
   `{status: PERMITIDO|BLOQUEADO, motivo}` com `response_schema` travado. Existe pelo mesmo
   motivo do Agente Z do chat, mas é **mais estreito de propósito**: não tem `INVIAVEL`, e
   por isso **não recebe `schemaMetadata`** — viabilidade já é checada duas vezes depois
   (regra 1 do prompt do Tarsila, e a TRAVA 1 no cliente). Escopo não depende de quais
   colunas a base tem, e mandar o schema aqui apagaria a economia que justifica a etapa.
2. **Agente Tarsila do Amaral** (`INSTRUCAO_CARD`) — planejador de cards. Recebe pergunta +
   `schemaMetadata` e emite `{title, viz, higher_is_better, query_plan}`, ou `{erro}` quando
   a pergunta é inviável. É o prompt caro (~1.400 tokens antes do schema).

⚠️ **O Z-dash é fail-open, e isso é deliberado.** Ele é economia de custo, não controle de
segurança — quem protege dado é o RBAC em `executar_previa`. Rede, timeout, cota, JSON
inválido, enum desconhecido: tudo deixa a pergunta passar. Fechar aqui transformaria um
soluço do Gemini em "o produto não cria mais cards", e mascararia a mensagem específica de
cota que o Tarsila já sabe produzir. Um 400 recusando o `response_schema` repete **uma** vez
sem ele, pela mesma razão do chat: o endurecimento não pode ser o que derruba o porteiro.

⚠️ **Custo:** o guardião é uma requisição Gemini a mais em **toda** geração de card. Como a
cota do Gemini é por requisição, a quantidade de cards por dia cai pela metade — troca aceita
conscientemente para impedir o pior caso, que não era erro: um card estruturalmente válido
sobre uma coluna real qualquer, com título fora de contexto, **publicável** no dashboard da
organização. Registrado como risco R17 na época.

Logs, no padrão do chat (uma linha com a resposta inteira do agente):
`[gerar_card/z-dash]` e `[gerar_card/tarsila]`. **A pergunta crua nunca vai para o log**, nos
dois — é texto livre digitado sem pensar, e a D4 já decidiu não guardar isso nem no banco
(`origin_question` fica `NULL`); reintroduzi-la pelo log seria contornar a mesma decisão.

### O executor real: `query_engine/` em AWS Lambda

O motorista cego (`query_engine/main.py`, `security.py`, `sheets.py`, `pandas_executor.py`)
roda como **imagem de container em AWS Lambda**, atrás de uma Function URL com
`AuthType=AWS_IAM` (não é endpoint público). Deploy via GitHub Actions + OIDC, sem chave AWS
de longa duração. Fonte de verdade de como subir/operar: `infra/aws/PASSO-A-PASSO.md`.

Dois consumidores chamam o mesmo Lambda hoje: o **dashboard**
(`supabase/functions/dashboard-execute/index.ts`, para `dashboard_cards`) e o **chat**
(`supabase/functions/ai-plum-chat/index.ts`, ação `execute_plan`). Os dois seguem a mesma
estrutura padrão do Supabase CLI e importam o mesmo `supabase/functions/_shared/query_plan.ts`
(testado por `vitest`) em vez de reimplementar a extração de colunas cada um do seu jeito.
Toda a decisão de autorização vive **só** na Edge Function que chamou (JWT + RLS + RBAC de
coluna); o Lambda nunca consulta o Supabase, só compara o conjunto de colunas já resolvido
contra `allowed_columns` de novo, como segunda barreira.

Duas camadas de segurança **independentes** protegem a chamada Edge Function → Lambda:
SigV4 (`AuthType=AWS_IAM`, resolvido pela infraestrutura, antes do código Python rodar) e um
HMAC-SHA256 sobre o corpo, com um segredo **diferente** da credencial AWS. Vazar uma não
basta para forjar a outra.

Proteções no `pandas_executor.py`: bloqueio de linhas brutas (`RawRowsBlocked` — todo plano
precisa de agregação, sempre, sem exceção), teto de linhas verificado **antes** do parse
(`RowLimitExceeded`), e coluna referenciada mas não carregada é erro (`MissingColumnError`),
nunca um filtro silenciosamente ignorado. `column_roles` (percent/date/number/text) substitui
a antiga constante global `_PCT_COLS`/`_STRING_COLS` — mas continua derivado por **keyword-
match em texto livre** sobre a `cleaning_rule` do Agente 3, a mesma dívida do
`contexto/20-pendencias.md` P7. Havia também **k-anonimato** aqui (grupo com menos de `k_min`
linhas de origem era suprimido, contado em `suppressed_groups`) — removido em 2026-08-08 por
decisão de produto, ver `contexto/30-decisoes.md` D-012. `suppressed_groups`
continua no retorno por compatibilidade com quem consome a resposta, sempre `0`.

### Invariantes de produto

- **R-01 Read-only absoluto.** O Plum nunca escreve na planilha do cliente. Só HTTP `GET`,
  escopo `spreadsheets.readonly` (não usa Drive API).
- **R-02 A IA planeja, o código executa.** Nenhum número sai de texto livre do LLM.
- **R-05 Isolamento de tenant** é invariante, não feature. Aplicado nos dois caminhos que
  chamam o executor (dashboard e chat, ver §5): JWT + RLS + RBAC de coluna resolvidos **antes**
  de qualquer chamada ao Lambda; o Lambda em si não confia em `organization_id`/`dataset_id`
  de ninguém, só em `allowed_columns` já resolvido no payload assinado.
- **R-06** O dicionário semântico é revisado por humano. **R-08** Validação alerta, nunca corrige.
  ⚠️ **Uma exceção desde 2026-09-03, e só ela:** em "Editar Esquema" (base **já ativa**) os agentes
  2 e 3.1 gravam sem revisão prévia — a tela não tem botão de salvar, grava sozinha, e a correção é
  posterior. O R-06 continua inteiro no **chat** (nenhuma IA escreve) e no **cadastro** (o
  dicionário só vale no "Finalizar e Salvar"). Ver `contexto/30-decisoes.md` D-058 e o I-15.
- **R-11 Limites do plano:** colunas ∈ `allowed_cols`, agg ∈ {sum,avg,min,max,count},
  `limit` 1..500, **joins bloqueados**. Desde 2026-08-11 o `col` de uma agregação também
  aceita uma **expressão aritmética** — `{"agg":"sum","col":{"op":"mul","args":["qtd","preco"]}}`
  — calculada linha a linha antes de agregar. Operadores: `mul`/`add` (N operandos),
  `sub`/`div` (2). Operandos: coluna, número literal, ou outro nó. Sem `eval`, enum fechado.
  **Toda coluna dentro da expressão passa pelo RBAC** (`walkArithmetic` em `_shared/query_plan.ts`):
  `addCol` descarta o que não é string, então um nó aqui não contribuía com coluna nenhuma
  e o plano era autorizado sem ninguém olhar os operandos.
- **R-13 Só o Python multiplica.** Corolário do R-02, escrito depois de ser violado em
  2026-08-11: o Agente C recebeu `{unidades: 1.480, preco_medio: 57,50}` e respondeu
  "faturamento de R$ 85.100,00" — multiplicou os dois no texto. `soma(qtd) × média(preço)`
  não é receita: só coincide quando todo item custa o mesmo (na doceria real iam de R$ 2,50 a
  R$ 90,00). Nenhum agente sintetizador faz conta, nem quando os dois números estão no
  resultado e a conta parece óbvia. Se falta um número, a resposta diz que falta.
- **R-12 k-Anonimato — removido em 2026-08-08.** Existia aqui até então: nenhum vetor de
  resultado saía sem agregação (isso **continua** valendo, ver R-02) e todo grupo precisava de
  no mínimo `k_min` linhas de origem, configurável por organização. A parte de "mínimo de
  linhas por grupo" foi removida por decisão de produto — ver `contexto/30-decisoes.md` D-012 na
  raiz do repo pelo raciocínio completo. Mantido aqui como registro histórico do número, não
  reintroduzir sem decisão de produto equivalente.
- **O Plum não cria planilhas.** O usuário cola a URL da própria planilha e compartilha com
  a service account (`plum-polijunior@plataforma-plum.iam.gserviceaccount.com`) como
  **Leitor**. A governança de acesso continua do cliente.
- **Um `batchGet` por dataset, não por pergunta/card** (não por Column-Range isolado):
  evita o limite de 60 req/min da API do Google Sheets agrupando a união das colunas de todos
  os cards/perguntas de uma vez. O teto de linhas é checado **antes** do parse, pelos
  metadados da planilha. **Cache de dados (linhas) com TTL de 15 min ligado desde
  2026-08-07** (`query_engine/cache.py`, chave por planilha+aba+conjunto exato de colunas —
  decisão registrada em `contexto/30-decisoes.md` D-011, aceitando conscientemente que a linha bruta do cliente
  fica até 15 min na memória do processo). Cabeçalho e contagem de linhas têm cache próprio,
  separado, também 15 min.
- **Chat é 100% privado por usuário.** RLS de `plum_chat` é `auth.uid() = user_id`.
  Nem gestor nem colega lê. Tornar algo visível para a org exige aprovação explícita.

---

## 6. Ordem das migrations

1. `supabase/migrations/login_supabase.sql` — base
2. `create_role_permissions_table.sql` — dropa `roles.permissions`, cria `role_permissions`
   (`add_role_permissions.sql` é histórico, **não aplicar**)
3. `20260714224747_*.sql` e `20260714225052_*.sql` — `Leads`
4. `20260722110000_hotfix_escalonamento_privilegio.sql` — **antes** do SSO
5. `20260722120000_sso_dominio_control_plane.sql`
6. `20260722130000_endurecimento_rls.sql` — requer 110000 e 120000; precisa de `pgcrypto`
7. `20260722140000_integracao_sketch_e_admin_case.sql`
8. `create_plum_chat_table.sql` — ⚠️ sem prefixo de timestamp, fora da convenção do CLI
9. `20260806230000_dashboard_cards.sql` — `dashboard_cards`, `dashboard_card_snapshots`,
   `organizations.dashboard_k_min`/`dashboard_max_rows`, `datasets.google_sheet_id` como
   fonte da verdade (com backfill a partir da URL antiga)
10. `20260808120000_sso_dominio_bernardo.sql` — vínculo de domínio da `Machado Lmtd`
    (o nome no arquivo diz `bernardo`; a organização é outra — ver `CONTINUAR-AQUI.md`)
11. `20260811000000_google_sheet_gid.sql` — `datasets.google_sheet_gid`, com backfill por
    regex a partir de `google_sheet_url` (aceita `?gid=` e `#gid=`). **Aplicada em produção em
    2026-08-11**, as 3 bases existentes ficaram com `gid` preenchido. É par indivisível com o
    front e com as duas Edge Functions (§4.12): sem a coluna, salvar base falha e todo
    `execute_plan` erra
12. `20260812120000_dominios_guard.sql` — trigger `guardar_dominio_da_org` em
    `organization_domains`: recusa provedor público **na escrita** (antes só o login
    consultava a denylist), normaliza domínio para minúsculas, força
    `verified_by`/`verified_at` no servidor. **Aplicada em produção em 2026-08-12**
13. `20260812140000_plum_chat_plan_query.sql` — `plum_chat.plan_query`/`dataset_id`
    (reuso de Query Plan pelo chat); `assunto` vira vestigial. **Aplicada em produção em
    2026-08-12**
14. `20260812150000_tema_do_usuario.sql` — `profiles.tema` + RPC `definir_tema()` (persistência
    server-side da preferência de tema, §7)

---

## 7. Convenções

- **Idioma:** código e domínio em português (`criar_organizacao`, `tocar_updated_at`,
  `carregando`, `pendente`). Comentários e commits em português. Mantenha.
- Colunas de dados do usuário são normalizadas para `snake_case` por
  `normalizarNomeDeColuna` (`src/lib/colunas.ts`) — **nunca à mão, nunca reimplementada num
  componente**. O Python espelha a mesma função; ver §3 e a dívida em §8.
- Alias `@/` → `src/`. Componentes shadcn em `src/components/ui/` — preferir compor a editar.
- Cores só via CSS variables do tema (`hsl(var(--primary))`), nunca hex solto.
- ⭐ **Duas superfícies, UM tema — e `.dark` hoje não tem consumidor.** Desde 2026-08-12
  (Direção A) `:root` é o tema **claro**, com a marca `#7A2F56`. Naquele momento a landing
  ficou no escuro via `className="dark"` em `Index.tsx`/`NotFound.tsx`; no merge do novo
  design da landing (mesma data) as duas
  saíram do `.dark`, porque o design novo **já usava o mesmo `#7A2F56`** — o que separava as
  superfícies era só aquela classe. Hoje **nada** opta por `.dark`; o bloco fica como saída
  de emergência, não como código morto por descuido.
  Não inverta o mecanismo: o Radix renderiza `Dialog`/`Select`/`Popover` em portal no `body`,
  fora da árvore do layout, então um wrapper claro no app daria a todo diálogo do produto o
  tema errado. ⚠️ Se `.dark` voltar a ser usado, os tokens `--glow-*`, `--glass-*` e
  `--gradient-*` precisam ser redefinidos lá dentro: eles foram retunados de roxo para vinho
  e só existem em `:root`. Ver `contexto/30-decisoes.md` D-029.
- ⭐ **O produto logado TEM tema escuro — é um terceiro mecanismo, `.tema-escuro`, não `.dark`.**
  Acrescentado depois do merge da landing (leva `feat/fase-5b-periodo-linha-e-tema`), então não
  estava documentado aqui até agora. `src/hooks/use-tema.ts` (usado uma única vez, em
  `DashboardLayout`) guarda a escolha em `localStorage["plum-tema"]` **e**, desde 2026-08-12,
  em `profiles.tema` via a RPC `definir_tema()` — o `localStorage` só evita flash no primeiro
  paint, a fonte de verdade é o servidor. Aplica a classe `tema-escuro` em
  `document.documentElement`, pelo mesmo motivo do `.dark`/portal do Radix acima, mas com
  paleta **on-brand** (matiz 329, `src/index.css:228+`), não o roxo antigo. `use-tema-ativo.ts`
  é o observador (via `MutationObserver`) para quem precisa **calcular** cor em JS — hoje só
  `cores.ts`, as séries do gráfico.
  ⚠️ **Bug real, corrigido em 2026-08-12:** o `useEffect` que aplicava a classe não tinha
  limpeza, então ela sobrevivia ao logout (`document.documentElement` é o `<html>`, único nó
  para a SPA inteira) e vazava para a landing/`/auth`/404 — nenhuma delas tem opinião própria
  sobre tema, então herdavam a paleta escura por cascata. Corrigido com `return () =>
  classList.remove(...)` no efeito (fecha o caso normal, porque o hook só desmonta saindo do
  produto) **e** um efeito defensivo idêntico em `Index.tsx`/`Auth.tsx`/`NotFound.tsx` (fecha
  o resto). Ver `contexto/31-incidentes-e-licoes.md` I-06.
  ⚠️ **Escrita de `profiles.tema` é só via RPC**, nunca `UPDATE` direto: a única policy de
  UPDATE em `profiles` exige `id <> auth.uid()` (regra 5 abaixo) — abrir self-UPDATE
  reabriria a autopromoção que a migration de 2026-07-22 fechou. `definir_tema()` é
  `SECURITY DEFINER`, só sabe escrever essa uma coluna, e não passa perto de
  `role_id`/`status`/`organization_id`.
- **Landing e produto ainda não compartilham a marca visual — parcialmente.** A landing usa
  `plum-mascot-transparent.png`; `DashboardLayout`, `Auth` e `AccessPending` seguem com
  `plum-logo.png`. Não é descuido — trocar a marca das telas de produto não estava no escopo
  do merge da landing. Decisão pendente. Uma exceção pontual desde 2026-08-12: o avatar do
  assistente em `PlumChat.tsx` (era um quadrado sólido com a letra "P") passou a ser o
  `MascoteAnimado` — não é a mesma decisão de "unificar a marca do produto", é só o chat
  ganhando um rosto em vez de uma inicial.
- ⭐ **Um mascote e um fundo, cada um em UM arquivo, desde 2026-08-14.**
  `MascoteAnimado` (`src/components/sections/MascoteAnimado.tsx`) serve as **sete** superfícies
  — logo da landing, hero, FAQ, "Vamos conversar?", `/auth`, cabeçalho do produto e avatar do
  chat. `FundoAnimado` (mesmo diretório) serve o fundo do hero **e** o do contato. Antes disso
  eram dois vídeos de mascote, um PNG de arte diferente e o `<video>` de fundo escrito à mão só
  no hero. O componente **não recebe mais prop de `src`**: superfície nova usa o mesmo arquivo,
  e trocar o mascote é trocar um arquivo em `public/`.
  ⚠️ **O WebM tem canal alfa e é gerado por chroma key na ORIGEM** — o navegador não faz chroma
  key sozinho, e MP4/H.264 não carrega alfa. Comando e medições no cabeçalho do componente.
  ⚠️ **O PNG de fallback sai do próprio vídeo, e regenerá-lo é obrigatório ao trocar o vídeo.**
  Até 2026-08-14 o fallback era de uma arte anterior, e o mascote mudou de desenho **e de cor**
  (era roxo, virou azul) — fallback de arte diferente não é degradação elegante, é mostrar outro
  personagem.
  ⚠️ **Não há mais vai-e-volta.** O vídeo de 2026-08-12 era um movimento curto que não fechava
  sozinho, e a ida+volta era concatenada no arquivo (`playbackRate` negativo não existe em
  navegador nenhum). O vídeo atual fecha sozinho: repetição nativa basta. A técnica está no
  commit `10a1add` se voltar a fazer falta — mas ela dobra o número de quadros do arquivo.
- ⚠️ **Hairline é `border-border`, sem opacidade.** `border-border/20` era o padrão no tema
  escuro e **desaparece no claro** (`--border` já é `#EBE3E7`, L 91%). Para o hover mais forte
  existe `border-line-hover`. 57 ocorrências foram varridas em 2026-08-12; não reintroduza.
- **Paleta de série do dashboard: medida, não escolhida.** `cores.ts` tem uma faixa de
  luminosidade **por matiz** (não global) porque no claro os tetos vão de 32% a 65% — o verde
  carrega o coeficiente 0,7152 da luminância WCAG. O sinal do desvio de matiz aponta para o
  vizinho **menos** luminoso, o oposto do que valia no escuro: no claro ele reforça o
  escurecimento em vez de cancelar a rampa. `i = 0` é o maior valor e recebe o tom **escuro**.
  `src/lib/contraste-serie.test.ts` trava contraste, ΔE e sentido da rampa — mexeu em constante,
  rode `npm test`.
- Toasts via `sonner` / `use-toast`. Dados remotos via `@tanstack/react-query` quando houver
  cache a compartilhar; `useEffect` + `supabase` direto no resto do código atual.
- `is_org_admin()` é case-insensitive desde a migration 140000 — no front, comparar cargo
  sempre com `.toLowerCase()`.
- Cartão "Minha Organização" se adapta ao `join_mode`: código de convite mostra o código;
  `dominio` mostra "Entrada: por domínio verificado" **sem código** (seria enganoso). O card é
  só leitura — quem gerencia é a aba **"Entrada & Domínios"** na mesma tela (desde 2026-08-12).
- ⚠️ **O literal de `join_mode` vive em `src/lib/organizacao.ts`, e só lá.** O SQL versionado
  diz `'share_id'`, o dump de produção diz `'codigo'` (§8) — ler é inofensivo porque todo o
  código compara contra `MODO_DOMINIO`, mas **escrever** com o valor errado dá `23514`. Nunca
  colocar o literal inline; importar as constantes.
- **Domínio de SSO tem trava no servidor** desde a migration `20260812120000`: o trigger
  `guardar_dominio_da_org` recusa provedor público, normaliza para minúsculas e força
  `verified_by = auth.uid()`. Antes disso a policy `FOR ALL` deixava um admin reivindicar
  `gmail.com` por `curl` e capturar todo cadastro novo com aquele e-mail.
- **Todo login pousa em `/inicio`** (Página Inicial, o mural de cards) — os três caminhos de
  entrada em `Auth.tsx` (senha, SSO e criação de organização) apontam para lá desde
  2026-08-11. Antes caíam em `/dashboard`, que é "Minha Organização", uma tela de
  administração que a maioria dos usuários não precisa ver toda vez. Mexeu em um dos três?
  Mexa nos três — eles não compartilham constante.
- **Frequência decide hierarquia visual.** Criar organização acontece uma vez na vida da
  empresa; entrar acontece milhares de vezes. Por isso `Auth.tsx` centraliza "Entrar" e
  rebaixa "criar organização" a link secundário, em vez de oferecer os dois como cartões
  irmãos. Mesma lógica dentro do fluxo de entrar: o formulário aparece direto, e "Primeiro
  acesso" fica abaixo dele.
- **A resposta do chat é Markdown restrito, e é um par de duas metades.** O Agente C emite
  frase-resposta com o valor principal em `**negrito**` (só ele), tópicos com `- ` quando o
  resultado tem mais de uma linha, e nada além de parágrafo/lista/negrito — sem título, tabela,
  link ou emoji. Quem renderiza é `src/components/RespostaMarkdown.tsx`, e **só** a bolha do
  assistente: a do usuário é texto literal, porque interpretar Markdown na pergunta reescreveria
  o que ele digitou. Mexeu no contrato de um lado, mexa no outro — prompt novo com front antigo
  entrega `- ` literal ao usuário. Ver `contexto/30-decisoes.md` D-027.
- ⚠️ **O extrator de classes do Tailwind é regex sobre o arquivo e não pula comentário.** Citar
  o nome de uma classe dentro de um comentário faz o CSS dela ser gerado — utilitário morto no
  bundle (custou 2,08 kB em 2026-08-11, só por explicar o que havia antes). Descreva a classe
  em vez de escrever o nome dela.

---

## 8. Dívidas e divergências conhecidas (não "conserte" sem combinar)

- **`Leads`** tem policy `ALL / true` para qualquer autenticado — decisão D-13 aceita
  conscientemente. **Fechar antes do primeiro usuário de cliente real.**
- Divergências entre o banco real (dump em `supabase/backup/`) e as migrations:
  `share_id` não aparece no dump; `join_mode` tem `DEFAULT 'codigo'`/`CHECK IN ('codigo','dominio')`
  no dump vs `'share_id'` no SQL versionado (todo o SQL compara com `'share_id'`).
  Confirme o estado real antes de mexer em entrada de organização.
- Objetos no banco sem migration: `assistants`, `conversations`, `messages`, enums
  `chat_canal`/`chat_direcao`, funções `get_user_org_id()`, `rls_auto_enable()`,
  `touch_updated_at()`.
- Arquivos que documentação antiga citava e que **nunca existiram** no repo:
  `supabase/aplicar/APLICAR_TUDO.sql`, `supabase/forensics/*`, `supabase/seed/*`. Se alguém pedir
  por eles, não procure — não há.
- `src/integrations/supabase/client.ts` tem URL e anon key hardcoded, apesar de existir
  `.env.example` com `VITE_SUPABASE_*`. Chave `anon` é pública por design (protegida por
  RLS), mas a inconsistência é real.
- ~~`apply_formatting_rules`/`columnRolesFromSchema` decidem o tipo por keyword-match em texto
  livre~~ — **RESOLVIDO, este item estava desatualizado (conferido em 2026-08-10).** Hoje o
  `type` vem de um **enum fechado** e o papel sai de um lookup direto (`TYPE_TO_ROLE` em
  `pandas_executor.py`), não de heurística. `type` fora do enum não é ignorado em silêncio:
  loga warning no Python e o `sanitizeFormattingRules` (`ai-agents`) o reescreve para
  `'nenhuma'` com a tentativa registrada na explicação. A versão TypeScript
  (`_shared/query_plan.ts`) **não decide papel nenhum** — só repassa `type`/`params`, de
  propósito, para não ter a mesma heurística em duas linguagens. O que sobra de dívida real é
  menor: quem escolhe o `type` continua sendo um LLM (Agente 3) olhando 5 linhas de amostra.
- A matriz de permissões (quais colunas cada cargo vê) ainda mora só em `Dashboard.tsx`,
  duplicada em intenção com um plano nunca aplicado (`contexto/20-pendencias.md` P9, na
  raiz do repo) que queria movê-la para `Cfgdatabase.tsx`. Ver `contexto/20-pendencias.md` P9 — o
  plano continua válido, só não é prioridade no momento.
- ~~Pelo menos uma base em produção tem `datasets.google_sheet_id` guardando a URL completa~~
  — **não se confirmou (conferido em 2026-08-11).** As 3 bases em produção têm ID puro, 44
  chars. O que existia de verdade nesse campo era outra coisa, e pior: ver o item do `gid`
  abaixo.
- **Duas implementações da normalização de nome de coluna**, uma em TypeScript
  (`src/lib/colunas.ts`) e uma em Python (`query_engine/sheets.py`). É a dívida que
  `_shared/query_plan.ts` existe para evitar, e aqui é inevitável: não há como compartilhar
  código entre o browser e o Lambda. A defesa é uma tabela de 26 casos **replicada** em
  `src/lib/colunas.test.ts` e `query_engine/tests/test_sheets.py` — mudar um lado sem o outro
  deixa um dos dois vermelho. Diferente do Query Plan, divergência aqui **não vira bypass**:
  vira "coluna não encontrada", porque o RBAC já foi aplicado antes, sobre os nomes
  normalizados. Ao mexer em qualquer passo, mexa nos dois lugares e nas duas tabelas.
- ~~**O pipeline de importação nunca lê a planilha.**~~ — **RESOLVIDO pelo B12/B13**, e este
  item ficou descrevendo o mundo anterior. Não há mais arquivo no navegador: a planilha é a
  fonte desde o passo 0, e os quatro sintomas que o item previa (aba errada, planilha não
  compartilhada, cabeçalho divergente, coluna sem título) aparecem agora **na hora de
  conectar**, com a pessoa olhando a tela — é o que `cabecalhos_da_planilha` devolve em
  `colisoes` e `colunas_sem_titulo`, e o que faz o passo 1 travar em vez de deixar a base
  nascer com uma coluna a menos.
- **O caminho de escrita descartava informação que o de leitura precisava** — duas vezes, pelo
  mesmo padrão. O `gid` da aba era jogado fora por `extrairSheetId` (corrigido em 2026-08-11,
  PR #6), e o mapa `cabeçalho original → nome normalizado` é jogado fora na finalização, porque
  vive em `datasets.sketch` e `sketch` vira `NULL` quando a base fica ativa. O segundo continua
  assim: por isso a normalização precisa ser recalculada no executor em vez de consultada. Se
  algum dia o `schema_metadata` passar a guardar o cabeçalho original por coluna, a normalização
  em Python deixa de ser necessária — e é a saída preferível, porque elimina a duplicação
  acima. Não é retroativo: o original das bases atuais já foi perdido.
- Chat real (`execute_plan`) — RESOLVIDO em 2026-08-08, ver `contexto/31-incidentes-e-licoes.md` I-07. O 403
  `"base nao encontrada"` original não reproduzia mais, e o 403 diferente que apareceu depois
  (`aws4fetch` → Function URL do Lambda) já tinha sido corrigido: a Function URL com
  `AuthType=AWS_IAM` exige tanto `lambda:InvokeFunctionUrl` quanto `lambda:InvokeFunction` na
  policy de identidade de `plum-edge-invoker`, **e** uma resource-based policy no próprio
  Lambda (`aws lambda add-permission`) — `infra/aws/provision.sh` e
  `infra/aws/valores-supabase.sh` já incluem os dois passos. Confirmado em produção que
  `execute_plan` completa de ponta a ponta sem 403 em nenhuma camada; usuário confirmou o chat
  funcionando.

---

## 9. Antes de terminar qualquer alteração

- [ ] ⚠️ **Typecheck de verdade**, porque `npm run build` NÃO faz (§1):
      `npx tsc -p tsconfig.app.json --noEmit` (front) e
      `npx --yes deno check supabase/functions/<mexida>/index.ts` (Edge Function).
      `npm run build` e `npm test` também, mas nenhum dos dois pega identificador inexistente.
- [ ] Mexeu no schema? Migration idempotente + `types.ts` atualizado + bloco de verificação.
- [ ] Mexeu em RLS/policy? Checou `organization_id = current_org_id()` **e** status;
      rodou `supabase/tests/*.sql`.
- [ ] Nenhuma decisão de autorização depende de dado enviado pelo cliente.
- [ ] Mexeu em `supabase/functions/_shared/*`? Ele é empacotado **por função**, não
      compartilhado em runtime: publique **todos** os consumidores (`query_plan.ts` →
      `ai-plum-chat` + `dashboard-execute` + **`dashboard-agent`**; `gemini_parsing.ts` →
      `ai-plum-chat` + `ai-agents` + `dashboard-agent`).
      Publicar um só deixa cópias divergentes do interpretador de RBAC em produção.
      Confira a lista real com `mcp__supabase__list_edge_functions` antes de assumir —
      em 2026-08-11 o `dashboard-agent` estava no ar sem estar em commit nenhum, e teria
      ficado para trás com a versão antiga do `query_plan.ts` empacotada.

      ⭐ **Divergência não avisa.** Ela é invisível até alguém emitir a forma nova: nada
      quebra, nenhum teste pega, porque os dois lados estão internamente coerentes. Foi
      assim que `ai-plum-chat` passou oito dias com uma cópia antiga de `query_plan.ts`
      sem nenhum sintoma — a exceção deliberada da Fase 5b, encerrada em 2026-08-20
      (D-028). É o motivo de a regra ser "publique todos", e não "publique quem mudou".
- [ ] Mexeu na gramática do Query Plan? São **dois** prompts que a emitem, com textos
      independentes: o Agente A (`ai-plum-chat`, ação `plan_query`) e o Agente Tarsila do
      Amaral (`dashboard-agent`, `INSTRUCAO_CARD`). E **três** lugares que a interpretam:
      `_shared/query_plan.ts` (RBAC), `query_engine/pandas_executor.py` (execução) e as duas
      tabelas de teste. Mudar um sozinho é como a dívida da normalização de coluna, só que
      aqui divergir **pode** virar bypass.
- [ ] Mexeu na normalização de nome de coluna? Mudou **nos dois lados** (`src/lib/colunas.ts` e
      `query_engine/sheets.py`) **e nas duas tabelas de casos**? Ver §8.
- [ ] Publicou Edge Function? Confirme que subiu de verdade: `ezbr_sha256` tem que mudar
      (`mcp__supabase__list_edge_functions`). `version` sobe sozinho em mudança de secret, sem
      código novo — não serve de prova. Ver §1.
- [ ] Explique brevemente cada alteração feita (convenção deste projeto).
- [ ] ⭐ **Mudou algum FATO sobre o produto** (não só código) — uma decisão, uma pendência, um
      comportamento, uma crença que se revelou falsa? **Rode a skill `contexto-plum`.** Ela roteia a
      mudança para o arquivo certo de `contexto/` e impede que o mesmo fato ganhe dois donos. Sem
      esse passo, `contexto/` apodrece como `docs/` apodreceu.

---

## 10. gstack

Se o gstack estiver instalado, use a skill `/browse` dele para navegação web. **NUNCA** use
ferramentas `mcp__claude-in-chrome__*`.

A lista das ~34 skills do gstack que ficava aqui foi removida em 2026-08-10: estava
desatualizada (nenhuma delas aparecia na listagem da sessão) e duplicava algo que o agente já
recebe pronto a cada sessão. Para saber o que existe agora, veja a listagem de skills da
própria sessão ou digite `/`.

### Documentos que complementam este

| Arquivo | O que traz |
|---|---|
| Arquivo | O que traz |
|---|---|
| ⭐ `contexto/00-LEIA-PRIMEIRO.md` | O roteador. Se você é novo aqui, comece por ele |
| ⭐ `contexto/03-erros-comuns.md` | As crenças falsas que este repo produz, com a verdade ao lado. 60 linhas |
| ⭐ `contexto/30-decisoes.md` | **O porquê de cada escolha**, com o que foi rejeitado junto. É o que o código não conta |
| `contexto/31-incidentes-e-licoes.md` | O que já deu errado e qual regra nasceu disso |
| `contexto/20-pendencias.md` | Trabalho adiado, por dificuldade, com o raciocínio junto |
| `contexto/02-plataforma-vs-implementacao.md` | O teste que toda proposta de feature tem de passar |
| `contexto/12-visao-tecnologica.md` | Arquitetura-alvo do remake (⚠️ proposta, não é o que está no ar) |
| `DESIGN.md` | Sistema de design: as duas superfícies, paleta validada, os cinco estados do card |
| `infra/aws/PASSO-A-PASSO.md` | Como subir o executor — fonte única |
| `supabase/migrations/CLAUDE.md` | Como aplicar migration, e as regras de segurança do banco |

⚠️ **O histórico narrativo foi apagado em 2026-08-14** (`docs/`, incluindo `fases dashboard/`, os
logs de PR e os documentos de fase). O que sobreviveu daquilo é o **fato** e o **porquê**, em
`contexto/30-decisoes.md` e `contexto/31-incidentes-e-licoes.md`. Medições e prompts literais que
só existiam nos documentos de fase **não** foram preservados — se precisar deles, `git log`.
