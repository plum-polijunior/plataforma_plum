<<<<<<< HEAD
# gstack

Use the /browse skill from gstack for all web browsing. NEVER use mcp__claude-in-chrome__* tools.

Available skills:
/office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /design-consultation, /design-shotgun, /design-html, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /connect-chrome, /qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /setup-gbrain, /retro, /investigate, /document-release, /document-generate, /codex, /cso, /autoplan, /plan-devex-review, /devex-review, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade, /learn
=======
# CLAUDE.md — Plataforma Plum

Contexto operacional para agentes de código. Leia isto antes de qualquer alteração.

**O que é:** plataforma multitenant de *Natural Language Query* sobre planilhas.
O usuário conecta um Google Sheets, a IA gera um dicionário semântico da base, e depois
conversa com os dados em português. **A IA nunca calcula: ela planeja, o Python executa.**

Stack: React 18 + Vite 5 + TypeScript + Tailwind + shadcn/ui · Supabase (Postgres + RLS +
Edge Functions Deno) · Google Gemini (`gemini-3.5-flash`) · Pandas (executor determinístico).
Projeto Supabase: `rjwidarrsykufuifzunu`. Deploy: Vercel (SPA rewrite em `vercel.json`).

---

## 1. Comandos

```sh
npm install
npm run dev          # Vite em http://localhost:8080 (host "::")
npm run build        # typecheck + build de produção — use como verificação
npm run lint         # eslint
npx tsc --noEmit     # só tipagem
```

Não há suite de testes JS. Os testes do projeto são **SQL**:

```sh
psql "$DATABASE_URL" -f supabase/tests/endurecimento_rls_test.sql
psql "$DATABASE_URL" -f supabase/tests/sso_dominio_test.sql
```

**Migrations não são aplicadas por CLI.** `supabase/config.toml` só contém `project_id`;
o fluxo real é copiar o SQL no **SQL Editor do painel Supabase** e rodar
(ver `docs/PASSO-A-PASSO-APLICAR.md`). Edge Functions também são deployadas manualmente
pelo painel.

---

## 2. Mapa do repositório

```
src/
  App.tsx                    rotas; /dashboard, /cfgdatabase, /plum dentro de DashboardLayout
  layouts/DashboardLayout.tsx guard de acesso + sidebar
  hooks/use-org-access.ts    ⭐ estado de acesso derivado das claims do JWT
  integrations/supabase/
    client.ts                cliente único (gerado; URL e anon key hardcoded)
    types.ts                 ⚠️ atualizar SEMPRE junto com migrations
  pages/
    Index.tsx                landing pública
    Auth.tsx                 login/cadastro/SSO
    AccessPending.tsx        estados sem-org / pendente / bloqueado
    Dashboard.tsx            (1007 l.) org, membros, cargos, aprovações
    Cfgdatabase.tsx          datasets, matriz de permissões (?tab=permissoes), edição de schema
    PlumChat.tsx             chat conversacional
  components/
    DatabasePipeline.tsx     (738 l.) pipeline de importação em 5 etapas
    PlumThinkingBar.tsx      barra de progresso do chat
    ui/                      shadcn — não editar sem motivo
query_engine/
  pandas_executor.py         execute_plan(plan, tables) — o "motorista cego"
  prd.md                     ⭐ arquitetura do chat + query engine
supabase/
  migrations/                aplicar em ordem (§6)
  tests/                     cenários de RLS/SSO
  edge-functions/            fonte das Edge Functions (deploy manual)
docs/
  PRD-PLUM2.0.md             visão/roadmap — NÃO é o schema real
  SSO-DOMINIO.md             especificação do SSO por domínio
  INCIDENTE-2026-07-22-*.md  ⭐ pós-mortem do escalonamento de privilégio
  MUDANCAS-FRONT-ENDURECIMENTO.md
  PASSO-A-PASSO-APLICAR.md   runbook de aplicação
  slides_plum_didatico.gs    Apps Script que gera os slides didáticos (30 slides)
```

---

## 3. Modelo de dados (schema real)

> A verdade é `supabase/migrations/` + `login_supabase.sql`. O `docs/PRD-PLUM2.0.md`
> descreve um modelo aspiracional (`tenants`, `tenant_users`, `data_dictionary`, …) que
> **não existe no banco**. Não codifique contra o PRD.

| Tabela | Papel | Colunas notáveis |
|---|---|---|
| `organizations` | tenant | `join_code` (12 chars cripto, UNIQUE), `share_id` (4 chars, legado), `join_mode` ∈ `share_id`\|`dominio` |
| `profiles` | usuário (estende `auth.users`) | `organization_id` (nullable!), `role_id`, `status` enum `profile_status`, `updated_at` |
| `roles` | cargo por org | `name` — Admin é **por nome**, não por flag |
| `role_permissions` | permissão granular | `(role_id, dataset_id)` UNIQUE, `allowed_columns TEXT[]` default `'{}'` |
| `datasets` | base conectada | `google_sheet_id`, `schema_metadata jsonb` ⭐, `sketch jsonb` (rascunho do pipeline), `status` |
| `organization_domains` | SSO | `domain` UNIQUE + lowercase, `verified`, `verification_method` ∈ `admin`\|`dns_txt`, `ms_tenant_id` |
| `public_email_domains` | denylist | 15 domínios públicos seed (gmail, outlook, …) |
| `domain_binding_audit` | auditoria de vínculo | `signal`, `result` |
| `profile_changes_audit` | auditoria append-only | `field`, `old_value`, `new_value` — só o trigger escreve |
| `plum_chat` | histórico do chat | `role` ∈ `user`\|`assistant`, `content`, `assunto` |
| `Leads` | landing page | dívida conhecida (§5, D-13) |

`profile_status = ('pendente','ativo','rejeitado')` (docs também mencionam `desativado`).

**`schema_metadata` é o cérebro do produto.** Guarda, por coluna: a definição semântica
(para o LLM entender o conceito de negócio) e as `formattingRules` (limpeza/tipagem).
Toda inteligência do chat depende dele.

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

Dois Edge Functions, ambos roteadores por `action`, ambos usando Gemini com
`temperature: 0.2` e `response_mime_type: application/json` quando a saída é estruturada.
A `GEMINI_API_KEY` vive no ambiente da Edge Function — **nunca no front**.

### `ai-agents` — pipeline de importação (`DatabasePipeline.tsx`, `Cfgdatabase.tsx`)

| `action` | Agente | Função |
|---|---|---|
| `guard` | 0 — Guardião | `PERMITIDO` / `BLOQUEADO`; barra prompt injection e off-topic |
| `predict_semantics` | 1 | gera definição semântica por coluna a partir de cabeçalho + amostras |
| `refine_semantics` | 2 | melhora as definições editadas pelo usuário para consumo por LLM |
| `format_data` | 3 | gera `formattingRules` + `formattedSamples` (antes vs depois) |
| `refine_format` | 3.1 | altera **apenas** a regra pedida, preserva as outras, re-aplica às amostras |
| `column_support` | suporte | tira-dúvidas sobre colunas durante o upload |

**Pipeline de 5 etapas:** (1) upload invisível — o arquivo é lido no navegador via
`FileReader`; só **cabeçalho + 5 linhas** trafegam, nunca a base inteira. (2) revisão de
colunas, normalização para `snake_case`. (3) formatação (agentes 3 / 3.1). (4) semântica
(agentes 1 / 2). (5) persistência do `schema_metadata` + vínculo do Google Sheet.
Rascunhos intermediários vivem em `datasets.sketch` e viram `NULL` na finalização.

### `ai-plum-chat` — chat conversacional (`PlumChat.tsx` + `query_engine/`)

Três invocações sequenciais, todas recebendo `schemaMetadata`:

1. `guard` — **Agente Z** (Guardião de Contexto e Viabilidade). Retorna
   `{status: PERMITIDO|BLOQUEADO|INVIAVEL, message, assunto}`. `INVIAVEL` = a pergunta é
   sobre dados mas as colunas necessárias não existem (ex.: pedir lucro sem coluna de custo).
   O `assunto` é gravado na linha do usuário em background e alimenta busca/dashboards.
2. `plan_query` — **Agente A** (Planejador Semântico). Vê só o `schema_metadata`, **nunca as
   linhas de dados**. Emite um Query Plan JSON: `from`, `target_columns`, `select`, `where`,
   `group_by`, `order_by`, `limit`.
3. `synthesize_answer` — **Agente C** (Sintetizador). Vê a pergunta + o vetor de resultados
   do executor, **nunca a base**. Não inventa número que não esteja no resultado.

Entre (2) e (3) roda o **Pandas Executor** (`query_engine/pandas_executor.py`),
o *motorista cego*: recebe só o plano JSON e os dados, **não vê a pergunta nem a intenção**.
Aplica `where` → `formattingRules` → agregações. Proteção embutida: coluna percentual
(`_PCT_COLS`) nunca é somada — `sum` vira `avg`.

### Invariantes de produto

- **R-01 Read-only absoluto.** O Plum nunca escreve na planilha do cliente. Só HTTP `GET`.
- **R-02 A IA planeja, o código executa.** Nenhum número sai de texto livre do LLM.
- **R-05 Isolamento de tenant** é invariante, não feature: todo acesso valida
  `dataset_id` × `organization_id` antes de tocar o Google Sheets → senão 403.
- **R-06** O dicionário semântico é revisado por humano. **R-08** Validação alerta, nunca corrige.
- **R-11 Limites do plano:** colunas ∈ `allowed_cols`, agg ∈ {sum,avg,min,max,count},
  `limit` 1..500, **joins bloqueados**.
- **O Plum não cria planilhas.** O usuário cola a URL da própria planilha e compartilha com
  o service account como **Leitor**. A governança de acesso continua do cliente.
- **Column-Range GET + cache TTL 15 min:** ler `Sheet1!B:B,E:E` em vez de `A1:Z100000`
  (payload de ~15MB → ~50KB) e evitar o limite de 60 req/min da API do Google Sheets.
- **Chat é 100% privado por usuário.** RLS de `plum_chat` é `auth.uid() = user_id`.
  Nem gestor nem colega lê. Tornar algo visível para a org exige aprovação explícita.

---

## 6. Ordem das migrations

1. `login_supabase.sql` — base (fora de `migrations/`)
2. `create_role_permissions_table.sql` — dropa `roles.permissions`, cria `role_permissions`
   (`add_role_permissions.sql` é histórico, **não aplicar**)
3. `20260714224747_*.sql` e `20260714225052_*.sql` — `Leads`
4. `20260722110000_hotfix_escalonamento_privilegio.sql` — **antes** do SSO
5. `20260722120000_sso_dominio_control_plane.sql`
6. `20260722130000_endurecimento_rls.sql` — requer 110000 e 120000; precisa de `pgcrypto`
7. `20260722140000_integracao_sketch_e_admin_case.sql`
8. `create_plum_chat_table.sql` — ⚠️ sem prefixo de timestamp, fora da convenção do CLI

---

## 7. Convenções

- **Idioma:** código e domínio em português (`criar_organizacao`, `tocar_updated_at`,
  `carregando`, `pendente`). Comentários e commits em português. Mantenha.
- Colunas de dados do usuário são normalizadas para `snake_case`.
- Alias `@/` → `src/`. Componentes shadcn em `src/components/ui/` — preferir compor a editar.
- Cores só via CSS variables do tema (`hsl(var(--primary))`), nunca hex solto.
- Toasts via `sonner` / `use-toast`. Dados remotos via `@tanstack/react-query` quando houver
  cache a compartilhar; `useEffect` + `supabase` direto no resto do código atual.
- `is_org_admin()` é case-insensitive desde a migration 140000 — no front, comparar cargo
  sempre com `.toLowerCase()`.
- Cartão "Minha Organização" se adapta ao `join_mode`: `share_id` mostra o código;
  `dominio` mostra "Entrada: por domínio verificado" **sem código** (seria enganoso).

---

## 8. Dívidas e divergências conhecidas (não "conserte" sem combinar)

- **`Leads`** tem policy `ALL / true` para qualquer autenticado — decisão D-13 aceita
  conscientemente. **Fechar antes do primeiro usuário de cliente real.**
- Edge Functions com fonte solta na raiz (`supabase_edge_function_ai_plum_chat.ts`) fora de
  `supabase/functions/`, deploy manual, sem rastreabilidade.
- Divergências entre o banco real (dump em `supabase/backup/`) e as migrations:
  `share_id` não aparece no dump; `join_mode` tem `DEFAULT 'codigo'`/`CHECK IN ('codigo','dominio')`
  no dump vs `'share_id'` no SQL versionado (todo o SQL compara com `'share_id'`).
  Confirme o estado real antes de mexer em entrada de organização.
- Objetos no banco sem migration: `assistants`, `conversations`, `messages`, enums
  `chat_canal`/`chat_direcao`, funções `get_user_org_id()`, `rls_auto_enable()`,
  `touch_updated_at()`.
- Arquivos citados por `docs/PASSO-A-PASSO-APLICAR.md` que não existem no repo:
  `supabase/aplicar/APLICAR_TUDO.sql`, `supabase/forensics/*`, `supabase/seed/*`.
- `src/integrations/supabase/client.ts` tem URL e anon key hardcoded, apesar de existir
  `.env.example` com `VITE_SUPABASE_*`. Chave `anon` é pública por design (protegida por
  RLS), mas a inconsistência é real.
- `_PCT_COLS` e `_STRING_COLS` em `pandas_executor.py` estão vazios (`#definir`).

---

## 9. Antes de terminar qualquer alteração

- [ ] `npm run build` passa (typecheck incluído).
- [ ] Mexeu no schema? Migration idempotente + `types.ts` atualizado + bloco de verificação.
- [ ] Mexeu em RLS/policy? Checou `organization_id = current_org_id()` **e** status;
      rodou `supabase/tests/*.sql`.
- [ ] Nenhuma decisão de autorização depende de dado enviado pelo cliente.
- [ ] Explique brevemente cada alteração feita (convenção deste projeto).
>>>>>>> a4baeeeadf72cdd52ecb51df121448e199e50314
