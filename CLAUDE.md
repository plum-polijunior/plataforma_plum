# CLAUDE.md — Plataforma Plum

Contexto operacional para agentes de código. Leia isto antes de qualquer alteração.

**O que é:** plataforma multitenant de *Natural Language Query* sobre planilhas.
O usuário conecta um Google Sheets, a IA gera um dicionário semântico da base, e depois
conversa com os dados em português. **A IA nunca calcula: ela planeja, o Python executa.**

Stack: React 18 + Vite 5 + TypeScript + Tailwind + shadcn/ui · Supabase (Postgres + RLS +
Edge Functions Deno) · Google Gemini (`gemini-3.5-flash`) · Pandas (executor determinístico,
hoje rodando como **AWS Lambda** — ver §5). Projeto Supabase: `rjwidarrsykufuifzunu`.
Deploy do front: Vercel (SPA rewrite em `vercel.json`). Deploy do executor: GitHub Actions →
ECR → Lambda, via OIDC (`infra/aws/`).

---

## 1. Comandos

```sh
npm install
npm run dev          # Vite em http://localhost:8080 (host "::")
npm run build        # typecheck + build de produção — use como verificação
npm run lint         # eslint
npx tsc --noEmit     # só tipagem
```

Testes automatizados, em três frentes:

```sh
npm test                              # vitest — RBAC de coluna (_shared/query_plan.ts)
npm run test:py                       # pytest do query_engine (bloqueio de linha bruta, assinatura, etc.)
psql "$DATABASE_URL" -f supabase/tests/endurecimento_rls_test.sql   # RLS/SSO
psql "$DATABASE_URL" -f supabase/tests/sso_dominio_test.sql
```

O CI (`.github/workflows/query-engine.yml`) roda `npm test` + `pytest` a cada push/PR que
toque `query_engine/`, `supabase/functions/` ou `src/lib/`, e só publica no Lambda se os dois
passarem — são as barreiras de privacidade/segurança (bloqueio de linha bruta, extração de
coluna do RBAC) que não podem regredir em silêncio. (k-anonimato foi removido em 2026-08-08
por decisão de produto — ver `k-anonimato-removido.md` na raiz do repo.)

**Migrations não são aplicadas por CLI.** `supabase/config.toml` só contém `project_id`;
o fluxo real é copiar o SQL no **SQL Editor do painel Supabase** e rodar
(ver `docs/PASSO-A-PASSO-APLICAR.md`). Edge Functions vivem em `supabase/functions/<nome>/index.ts`
(padrão CLI, ver `supabase/functions/README.md`) e são publicadas **automaticamente**, desde
2026-08-07, pela integração nativa GitHub↔Supabase (branch `plataforma`) — push que muda
`supabase/functions/**` já deploya sozinho, sem passar pelo painel nem por comando manual.
Migrations continuam manuais, de propósito — essa integração não cobre migrations aqui.

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
  main.py                    FastAPI — POST /execute, roda em Lambda via lambda_handler.py
  security.py                4 barreiras: SigV4 (infra) + HMAC + frescor + RBAC de coluna
  sheets.py                  Google Sheets: 1 batchGet por dataset, teto de linhas antes do parse
  config.py                  segredos via SSM Parameter Store (nunca .env com valor)
  pandas_executor.py         execute_plan(plan, tables, column_roles, max_rows)
  cache.py                   TTLCache pronto mas **não conectado** (ver TODOS.md #1)
  prd.md                     ⭐ arquitetura do chat + query engine (ver §9 lá: chat != dashboard)
  implementation.md          histórico do plano de EC2 abandonado; aponta pra infra/aws/
  urgent.md                  ⚠️ formattingRules por keyword-match — dívida ativa, ver §8
supabase/
  migrations/                aplicar em ordem (§6)
  tests/                     cenários de RLS/SSO
  functions/                 TODAS as Edge Functions — uma pasta por função, index.ts (padrão CLI)
    ai-agents/               pipeline de importação (agentes 0/1/2/3/3.1)
    ai-plum-chat/            chat: Agente Z/A/C + execute_plan (executor real)
    dashboard-execute/       RBAC de coluna + executor real para os cards
    plum-chat/               demo da landing page — NÃO confundir com ai-plum-chat
    send-auth-email/         e-mails transacionais (Resend)
    _shared/query_plan.ts    ⭐ único interpretador de Query Plan do sistema (extrai colunas p/ RBAC)
    README.md                deploy, segredos, o que cada função faz
infra/aws/
  PASSO-A-PASSO.md           ⭐ como subir/operar o executor — fonte única de verdade, não duplicar
  provision.sh               cria ECR, SSM, IAM roles, OIDC do GitHub (idempotente)
src/lib/
  google-sheets.ts           utilidades de URL/ID de planilha, com teste (vitest)
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
| `organizations` | tenant | `join_code` (12 chars cripto, UNIQUE), `share_id` (4 chars, legado), `join_mode` ∈ `share_id`\|`dominio`, `dashboard_max_rows` (padrão 200000). `dashboard_k_min` ainda existe na coluna mas está **vestigial**: não é mais lido por nenhum código desde a remoção do k-anonimato (2026-08-08) |
| `profiles` | usuário (estende `auth.users`) | `organization_id` (nullable!), `role_id`, `status` enum `profile_status`, `updated_at` |
| `roles` | cargo por org | `name` — Admin é **por nome**, não por flag |
| `role_permissions` | permissão granular | `(role_id, dataset_id)` UNIQUE, `allowed_columns TEXT[]` default `'{}'` |
| `datasets` | base conectada | `google_sheet_id` (fonte da verdade p/ o executor), `google_sheet_url` (só exibição), `google_sheet_tab` (default `Sheet1`), `schema_metadata jsonb` ⭐, `sketch jsonb`, `status` |
| `dashboard_cards` | card do dashboard = Query Plan salvo | `query_plan jsonb`, `viz` (sem `donut`, ver `DESIGN.md`), `refresh_interval_minutes` |
| `dashboard_card_snapshots` | histórico de execuções de card | chave por `permissions_fingerprint` (hash de `allowed_columns`), **não** por `role_id` — revogar coluna invalida o cache sozinho |
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

`ai-agents` e `ai-plum-chat` são roteadores por `action`, ambos usando Gemini com
`temperature: 0.2` e `response_mime_type: application/json` quando a saída é estruturada.
A `GEMINI_API_KEY` vive no ambiente da Edge Function — **nunca no front**. Uma terceira peça,
`dashboard-execute`, não fala com o Gemini — ela só autoriza e chama o executor Python (ver
abaixo).

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

### `ai-plum-chat` — chat conversacional (`PlumChat.tsx`)

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

**Entre (2) e (3) roda o executor real, desde 2026-08-07 (Fase 2 de `organizar_tudo.md`)** —
uma quarta ação, `execute_plan`, no mesmo `ai-plum-chat`: resolve `allowed_columns` do cargo
do usuário para o dataset, autoriza o plano do Agente A com `authorizePlan`
(`_shared/query_plan.ts` — o mesmo interpretador que `dashboard-execute` usa, não uma segunda
implementação), assina (HMAC + SigV4) e chama o mesmo Lambda do dashboard. Sem card salvo nem
cache de snapshot — cada pergunta do chat é ad-hoc; falha do executor vira mensagem de erro,
não degradação para resultado antigo (não existe "resultado antigo" de uma pergunta nova).

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
`query_engine/urgent.md`. Havia também **k-anonimato** aqui (grupo com menos de `k_min`
linhas de origem era suprimido, contado em `suppressed_groups`) — removido em 2026-08-08 por
decisão de produto, ver `k-anonimato-removido.md` na raiz do repo. `suppressed_groups`
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
- **R-11 Limites do plano:** colunas ∈ `allowed_cols`, agg ∈ {sum,avg,min,max,count},
  `limit` 1..500, **joins bloqueados**.
- **R-12 k-Anonimato — removido em 2026-08-08.** Existia aqui até então: nenhum vetor de
  resultado saía sem agregação (isso **continua** valendo, ver R-02) e todo grupo precisava de
  no mínimo `k_min` linhas de origem, configurável por organização. A parte de "mínimo de
  linhas por grupo" foi removida por decisão de produto — ver `k-anonimato-removido.md` na
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
  decisão registrada em `TODOS.md` #1, aceitando conscientemente que a linha bruta do cliente
  fica até 15 min na memória do processo). Cabeçalho e contagem de linhas têm cache próprio,
  separado, também 15 min.
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
9. `20260806230000_dashboard_cards.sql` — `dashboard_cards`, `dashboard_card_snapshots`,
   `organizations.dashboard_k_min`/`dashboard_max_rows`, `datasets.google_sheet_id` como
   fonte da verdade (com backfill a partir da URL antiga)

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
- `apply_formatting_rules`/`roles_from_formatting_rules` em `pandas_executor.py`, e
  `columnRolesFromSchema` em `_shared/query_plan.ts` (a versão TypeScript, usada tanto por
  `dashboard-execute` quanto por `ai-plum-chat`), continuam decidindo o tipo de cada coluna por
  keyword-match em texto livre (a `cleaning_rule` que o Agente 3 escreve). Não existe mais
  constante global vazia (`_PCT_COLS` foi substituído por `column_roles`), mas o mecanismo de
  origem é o mesmo e tem a mesma fragilidade. Ver `query_engine/urgent.md`.
- A matriz de permissões (quais colunas cada cargo vê) ainda mora só em `Dashboard.tsx`,
  duplicada em intenção com um plano nunca aplicado (`reorganizacao_cargos_e_permissoes`, na
  raiz do repo) que queria movê-la para `Cfgdatabase.tsx`. Ver `organizar_tudo.md` §2.1 — o
  plano continua válido, só não é prioridade no momento.
- Pelo menos uma base em produção tem `datasets.google_sheet_id` guardando a **URL completa**
  da planilha (`https://docs.google.com/spreadsheets/d/.../edit?gid=...`), não só o ID extraído
  — apesar de este campo ser documentado como "fonte da verdade" (§3) e de
  `src/lib/google-sheets.ts` existir exatamente para extrair o ID na escrita
  (`DatabasePipeline.tsx:handleFinalizeAndSave`). Não confirmado ainda se isso quebra a leitura
  no `query_engine` (que espera um ID puro) ou se é sintoma do bug em investigação no
  `TODOS.md` #8. Confira antes de assumir que `google_sheet_id` é sempre só o ID.
- Chat real (`execute_plan`): o 403 `"base nao encontrada"` original não reproduz mais na
  investigação mais recente — ver `TODOS.md` #8. Nessa investigação apareceu um 403
  **diferente**, mais adiante no fluxo (`aws4fetch` → Function URL do Lambda), já corrigido:
  a Function URL com `AuthType=AWS_IAM` exige tanto `lambda:InvokeFunctionUrl` quanto
  `lambda:InvokeFunction` na policy de identidade de `plum-edge-invoker`, **e** uma
  resource-based policy no próprio Lambda (`aws lambda add-permission`) — nenhuma das duas
  era provisionada antes. `infra/aws/provision.sh` e `infra/aws/valores-supabase.sh` já
  incluem os dois passos. Item continua aberto até confirmar em produção que `execute_plan`
  completa sem 403 em nenhuma camada.

---

## 9. Antes de terminar qualquer alteração

- [ ] `npm run build` passa (typecheck incluído).
- [ ] Mexeu no schema? Migration idempotente + `types.ts` atualizado + bloco de verificação.
- [ ] Mexeu em RLS/policy? Checou `organization_id = current_org_id()` **e** status;
      rodou `supabase/tests/*.sql`.
- [ ] Nenhuma decisão de autorização depende de dado enviado pelo cliente.
- [ ] Explique brevemente cada alteração feita (convenção deste projeto).

---

## 10. gstack

Use a skill `/browse` do gstack para qualquer navegação web. NUNCA use ferramentas
`mcp__claude-in-chrome__*`.

Skills disponíveis: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`,
`/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`,
`/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`,
`/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`,
`/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`,
`/document-generate`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`,
`/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`,
`/learn`.

### Documentos que complementam este

| Arquivo | O que traz |
|---|---|
| `DESIGN.md` | Sistema de design: as duas superfícies, paleta validada, os cinco estados do card |
| `TODOS.md` | Trabalho conscientemente adiado, com o raciocínio junto |
| `docs/fases dashboard/` | Um arquivo por fase, com resumo estruturado por task |
| `infra/aws/PASSO-A-PASSO.md` | Como subir o executor |
