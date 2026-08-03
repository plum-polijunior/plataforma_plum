# Plano de Implementação — Chat da Plataforma (pós-login, por empresa, RBAC por cargo)

> Projeto: PLUM 2.0 · Objetivo: chat autenticado dentro da subárea de cada empresa,
> pessoal por usuário, escopado às bases da organização e respeitando a subdivisão de
> cargos (o usuário só consulta tabelas/colunas que seu cargo pode ver). Já nasce
> **channel-agnostic** para o WhatsApp plugar depois sem reescrita.
>
> Referências no PRD: R-03 (RBAC de coluna), R-05 (isolamento por tenant),
> R-09 (identidade única multicanal), §11.6 (conversas unificadas), Fluxo B.

## Princípio-guia

Toda a lógica de conversa vive numa **função de backend única e compartilhada**
(`_shared/chatCore.ts`). O front web e o futuro webhook do WhatsApp são cascas finas
que chamam esse mesmo núcleo. A autorização (quais tabelas/colunas o cargo vê) é
**resolvida e aplicada no servidor** — o cérebro (LLM) só recebe fisicamente as
colunas permitidas.

> ⚠️ **Anti-padrão a evitar:** repetir o `WhatsAppChat.tsx` (lógica no componente
> React, respostas hardcoded). Isso torna o WhatsApp depois uma reescrita.

## Como o RBAC se resolve (cadeia com o schema real do repo)

```
JWT (auth.uid) ─► profiles(organization_id, role_id, status='ativo')
                     └─► role_permissions[role_id] ─► { dataset_id, allowed_columns[] }
                            └─► datasets[dataset_id].schema_metadata.columns
                                   └─► filtra p/ allowed_columns
                                          └─► allowedSchema  ◄── único contexto do cérebro
```

- `schema_metadata` = `{ columns: { <col_snake>: { semantic_definition, cleaning_rule } } }`
- `role_permissions.allowed_columns` = `text[]` de nomes de coluna (snake_case)
- O filtro é uma interseção direta de nomes de coluna.

> A RLS existente de `datasets` é **por organização, não por cargo**. Logo, o filtro
> cargo→coluna **não** é RLS — é lógica da edge function (Fase 1). A RLS garante o
> isolamento entre empresas e a propriedade da conversa; o recorte por cargo é
> aplicado no servidor antes de montar o contexto do cérebro.

---

## Fase 0 — Modelo de dados  ·  status: CÓDIGO PRONTO (aplicar no Supabase)

Migration: `supabase/migrations/20260803120000_chat_core.sql`
Pré-requisito: `20260722120000_sso_dominio_control_plane.sql` já aplicada
(fornece `current_org_id()`, `is_active_member()`, `is_org_admin()`).

- `assistants` — persona/bot por organização (doceria vs. tech; permite múltiplos bots).
- `conversations` — o "chat pessoal de cada um" (dono = `profile_id`), com `assistant_id`.
- `messages` — fonte da verdade, já com `canal` (`web`/`whatsapp`/`email`) e `direcao`.
- Enums `chat_canal`, `chat_direcao`.
- RLS dono-only dentro da org ativa (reusa `current_org_id()` / `is_active_member()`).
- `messages` publicada no Realtime (front recebe mensagens ao vivo — e, no futuro, as do WhatsApp aparecem sozinhas).
- Escrita de `messages`/`conversations` só via `service_role` (edge function). Cliente só faz `SELECT`.

## Fase 1 — Núcleo `chat-core` (edge function) + módulo compartilhado  ·  status: CÓDIGO PRONTO (deploy no Supabase)

Arquivos entregues:
- `supabase/functions/_shared/cors.ts` — CORS + helper `json()`.
- `supabase/functions/_shared/rbac.ts` — `resolveAllowedSchema(admin, principal)` (Admin vê tudo da org; demais, só `role_permissions.allowed_columns`).
- `supabase/functions/_shared/brain.ts` — interface `Brain` + `GeminiBrain`.
- `supabase/functions/_shared/chatCore.ts` — `handle()` channel-agnostic.
- `supabase/functions/chat-core/index.ts` — casca web (JWT → Principal → handle).

Deploy: `supabase functions deploy chat-core` (requer secrets `GEMINI_API_KEY`;
`SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` já são injetados).

- `supabase/functions/_shared/chatCore.ts` — `handle({ principal, message, channel, conversationId? })`:
  1. Auth via JWT → `auth.uid()`; nunca confia em org/role do cliente.
  2. Carrega `profile` (service role); exige `status='ativo'` (senão 403).
  3. Cria/recupera `conversation` do `profile_id`.
  4. Persiste entrada (`canal`, `direcao='in'`).
  5. RBAC: `role_permissions[role_id]` → monta `allowedSchema` (só datasets/colunas liberados).
  6. Histórico: últimas N mensagens.
  7. Chama `brain.answer({ allowedSchema, message, history, persona })`.
  8. Guard de saída: recusa se a resposta citar coluna fora do `allowedSchema`.
  9. Persiste saída (`direcao='out'`, `meta`).
  10. Retorna `{ conversation_id, answer }`.
- `supabase/functions/chat-core/index.ts` — casca web (recebe JWT, chama `chatCore.handle`).

## Fase 2 — Interface do cérebro

- `supabase/functions/_shared/brain.ts` — `interface Brain { answer(i): Promise<{text, meta?}> }`.
  - Agora: `GeminiBrain` (reaproveita padrão anti-alucinação do `plum-chat`, recebendo só `allowedSchema`).
  - Depois: `DslBrain` (motor DSL / FastAPI, outro repo) — troca por trás.
- Dependência externa: para responder sobre **dados reais** (não só schema), ler as linhas
  (hoje em Google Sheets via `datasets.google_sheet_id`), filtradas às `allowed_columns`.

## Fase 3 — Frontend  ·  status: CÓDIGO PRONTO (build OK; testar após aplicar Fases 0/1)

Entregue: `src/pages/Chat.tsx` (thread + input + Realtime), rota `/dashboard/chat`
em `src/App.tsx`, item "Chat" no `DashboardLayout.tsx`, tipos das tabelas novas
em `src/integrations/supabase/types.ts`. `npm run build` verde.

- Rota protegida `/dashboard/chat` (`src/App.tsx`) + item no menu (`DashboardLayout.tsx`).
- `src/pages/Chat.tsx`: thread + input; `supabase.functions.invoke('chat-core')`;
  assina Realtime em `messages` da conversa. Reaproveita o visual de bolhas do `WhatsAppChat.tsx`.
- Regenerar `src/integrations/supabase/types.ts` para as tabelas novas.

## Fase 4 — Prontidão para WhatsApp (não construir agora)

Já pronto: store com `canal`, núcleo compartilhado, RBAC server-side, Realtime.
Net-new no futuro: `whatsapp-webhook` (resolve telefone→profile) + vínculo verificado
de telefone (R-09). **Nenhuma mudança de schema.**

## Segurança (checklist de aceite)

- [ ] Org/role/colunas derivados do JWT no servidor — cliente nunca dita.
- [ ] Cérebro recebe só `allowed_columns`; guard de saída ativo.
- [ ] RLS dono-only em `conversations`/`messages` (user A não lê chat do user B).
- [ ] Isolamento entre orgs (org X não vê dado de org Y).
- [ ] Pergunta sobre tabela fora do cargo → recusa limpa, sem vazar existência.

## Estimativa

| Fase | Esforço |
|---|---|
| 0 — migration store/RLS | ~1–1,5 dia |
| 1 — chat-core + shared | ~2–3 dias |
| 2 — brain (Gemini c/ allowedSchema; seam DSL) | ~1–2 dias (+ leitura de Sheets p/ dado real) |
| 3 — rota + UI + Realtime | ~2 dias |
| **MVP total** | **~1 a 1,5 semana** |

## Arquivos criados/tocados

- `supabase/migrations/20260803120000_chat_core.sql` *(novo — Fase 0)*
- `supabase/functions/_shared/chatCore.ts`, `brain.ts` *(novos — Fase 1/2)*
- `supabase/functions/chat-core/index.ts` *(novo — Fase 1)*
- `src/pages/Chat.tsx` *(novo — Fase 3)*
- `src/App.tsx`, `src/layouts/DashboardLayout.tsx` *(editar — rota + nav)*
- `src/integrations/supabase/types.ts` *(regenerar)*
