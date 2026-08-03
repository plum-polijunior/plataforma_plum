# Chat da Plataforma — Estado, Decisões e Runbook

> Registro operacional do que foi construído no chat pós-login (branch
> `feat/chat-plataforma`), as decisões tomadas e como fazer deploy/teste.
> O desenho/plano detalhado está em [PLANO-CHAT-PLATAFORMA.md](PLANO-CHAT-PLATAFORMA.md).
> Última atualização: 2026-08-03.

---

## 1. O que foi construído (resumo)

Chat autenticado dentro da área de cada empresa, pessoal por usuário, escopado
às bases da organização e respeitando os cargos (RBAC por coluna). Já nasce
**channel-agnostic** (WhatsApp pluga depois sem reescrita).

| Fase | Entrega | Arquivos |
|---|---|---|
| 0 — Store | Tabelas `conversations`, `messages`, `assistants` + enums, RLS dono-only, Realtime | `supabase/migrations/20260803120000_chat_core.sql` |
| 1 — Núcleo | Edge function `chat-core` + módulos compartilhados; RBAC server-side | `supabase/functions/chat-core/index.ts`, `supabase/functions/_shared/{cors,rbac,brain,chatCore}.ts` |
| 2 — Dados | Conector de dados (Google Sheets CSV), cérebro calcula sobre linhas | `supabase/functions/_shared/connectors.ts` |
| 3 — UI | Página de chat + rota `/dashboard/chat` + menu + Realtime + tipos | `src/pages/Chat.tsx`, `src/App.tsx`, `src/layouts/DashboardLayout.tsx`, `src/integrations/supabase/types.ts` |
| Testes | Teste de isolamento RLS (6 cenários) | `supabase/tests/chat_core_isolation_test.sql` |
| Rollback | Desfaz a migration do chat | `supabase/rollback/20260803120000_chat_core_down.sql` |

**Fluxo de uma mensagem:** UI → `supabase.functions.invoke('chat-core')` →
autentica pelo JWT → deriva org/cargo/status do `profiles` → resolve
`allowedSchema` (RBAC por `role_permissions.allowed_columns`) → busca linhas
(conector) → cérebro (Gemini) responde só com o permitido → persiste
entrada/saída → UI recebe pela subscrição Realtime.

---

## 2. Registro de decisões

**D-01 — Núcleo channel-agnostic.** Toda a lógica vive em
`_shared/chatCore.ts` (`handle()`), não no componente React. A casca web e o
futuro webhook do WhatsApp chamam o mesmo `handle()`. *Motivo: integrar o
WhatsApp depois vira um adaptador, não uma reescrita.*

**D-02 — RBAC aplicado no servidor.** O cérebro só recebe as colunas que o
cargo libera (`role_permissions.allowed_columns`); Admin vê tudo da org. Nunca
se confia em org/cargo vindos do cliente — tudo é derivado do `profiles` via
`auth.uid()`. *Motivo: segurança; o LLM não pode nem "ver" o que é proibido.*

**D-03 — Store como fonte da verdade, single-writer.** `conversations`/
`messages` só são escritos pela edge function (`service_role`); o cliente
apenas lê (RLS dono-only). `messages` tem `canal` (`web`/`whatsapp`/`email`)
desde o dia 1. *Motivo: base para o histórico unificado multicanal.*

**D-04 — Migration sem `DROP`.** As policies/trigger usam guarda
`IF NOT EXISTS` (via `pg_policies`/`pg_trigger`) em vez de `DROP ... IF EXISTS`.
*Motivo: o linter do Supabase marcava os `DROP` como "operação destrutiva",
assustando o apply. Comportamento idêntico, 100% aditivo.*

**D-05 — Script de rollback dedicado.** `supabase/rollback/...down.sql` dropa
só o que o chat criou. *Motivo: desfazer o chat sem restaurar backup inteiro.*

**D-06 — Interfaces plugáveis (cérebro e dados).** `Brain` (hoje `GeminiBrain`,
amanhã `DslBrain`) e `DataConnector` (hoje Google Sheets CSV, amanhã SQL/
service-account/DSL). *Motivo: trocar implementação sem tocar o resto.*

**D-07 — Dados via Google Sheets, com degradação segura.** O conector lê o CSV
exportado da planilha (requer planilha acessível por link). Se for privada
(HTML de login) ou indisponível, degrada para resposta "só-estrutura" e avisa —
nunca inventa número nem alimenta HTML como dado. *Motivo: os dados reais vivem
no Sheets; sem acesso, honestidade > chute.*

**D-08 — Limite honesto: LLM sobre linhas cruas é ponte.** Há teto de linhas e
aviso de "amostra" quando trunca. O caminho determinístico/escalável continua
sendo o **motor DSL** (R-02 do PRD), que está no outro repo. *Motivo: mandar
muitas linhas ao LLM não escala nem é o antídoto anti-alucinação.*

**D-09 — Modelo Gemini configurável.** `GEMINI_MODEL` (secret) controla o
modelo; default `gemini-2.0-flash`. *Motivo: `gemini-2.5-flash` deu 404 ("não
disponível para usuários novos"); trocar por secret evita mexer no código.*

**D-10 — Chave Gemini dedicada.** `chat-core` usa `GEMINI_API_KEY2` se existir,
senão cai na `GEMINI_API_KEY` compartilhada com o playground `plum-chat`.
*Motivo: a chave compartilhada estava com cota grátis zerada (`limit: 0`);
uma chave própria (em projeto Google novo) dá cota independente.*

**D-11 — Multi-tenant = `organization`.** Cada empresa é uma organização, com
área isolada por RLS (`organization_id`). Um usuário pertence a **uma** org, então
testar "duas empresas" exige **duas orgs + dois logins**. Um "super-admin" da PJ
que troca entre tenants numa tela **não existe ainda** (PRD §8.3). *Motivo:
alinhar expectativa de teste ao modelo real.*

**D-12 — Mock de teste via upload de CSV.** Para testar, usar o próprio fluxo de
upload ("Minha Base de Dados") com CSVs de exemplo, em vez de seed no banco ou
dados embutidos no código. *Motivo: preferência do usuário por testar o caminho
real, sem alterar o código só para teste.* (Uma tentativa de embutir
`sample_rows` no dataset foi feita e **revertida**.)

---

## 3. Runbook de deploy e teste

Pré-requisito: Node instalado; rodar do diretório do projeto.

1. **Migration** (uma vez): `supabase db push` **ou** colar
   `supabase/migrations/20260803120000_chat_core.sql` no SQL Editor.
2. **Teste de isolamento** (recomendado): colar
   `supabase/tests/chat_core_isolation_test.sql` no SQL Editor e rodar
   (transação com ROLLBACK; deve passar os 6 cenários).
3. **Chave do Gemini** (num projeto Google **novo**, para ter cota grátis):
   `npx supabase secrets set GEMINI_API_KEY2=<chave>`.
4. **Deploy da função**: `npx supabase functions deploy chat-core`.
5. **Ativar o usuário**: seu `profiles.status` precisa ser `ativo` (se você
   criou a org, já é Admin ativo).
6. **(Opcional) dados reais**: deixar a Google Sheet do dataset como
   "qualquer pessoa com o link → Leitor". Sem isso, responde só a estrutura.
7. **Testar**: `npm run dev` → login em `localhost:8080` → menu **Chat**.

Diagnóstico rápido:
- Erro `acesso_pendente`/`sem_organizacao` → passo 5 (profile).
- Erro `Gemini 429` → cota; ver `GEMINI_API_KEY2` num projeto novo (passo 3).
- Erro `Gemini 404` → nome de modelo; ajustar `GEMINI_MODEL` (secret) para um
  modelo que sua chave suporta (ex.: `gemini-2.0-flash`, `gemini-flash-latest`).
- Ver logs: painel Supabase → Edge Functions → `chat-core` → Logs (o CLI desta
  versão não tem `functions logs`).

---

## 4. Pendências e limitações conhecidas

- ⏳ **Cota do Gemini não resolvida no ambiente do usuário** (429/404 durante os
  testes). Ação: `GEMINI_API_KEY2` em projeto Google novo, ou billing.
- ⏳ **Respostas com números reais** dependem da planilha acessível por link
  (D-07) ou do motor DSL (D-08).
- ⏳ **Guard de saída** (recusar se a resposta citar coluna proibida) ainda não
  implementado — hoje a proteção é a entrada (o cérebro só recebe o permitido).
- ⏳ **WhatsApp**: falta o `whatsapp-webhook` (resolve telefone→profile) e o
  vínculo verificado de telefone (R-09). Nenhuma mudança de schema — o store já
  tem `canal`.
- ⏳ **Super-admin cross-tenant** (PJ ver várias empresas numa tela) — não existe.

---

## 5. Changelog (commits da branch `feat/chat-plataforma`)

```
828d6cc refactor(chat): renomeia var local para GEMINI_KEY (clareza)
ef10462 fix(chat): default para gemini-2.0-flash (2.5 indisponivel a novos usuarios)
5b58964 feat(chat): chat-core usa GEMINI_API_KEY2 dedicada (fallback p/ a antiga)
23a368d fix(chat): modelo Gemini configuravel + mensagem 429 clara
7261d20 refactor(chat): migration sem DROP para nao disparar aviso de destrutivo
4e8f9a4 chore(chat): script de rollback da migration chat_core
175e8fd feat(chat): Fase 2 - conector de dados + cerebro sobre linhas reais
677a8dd test(chat): teste de isolamento RLS do store + fix grant de assistants
d8e9f8f feat(chat): UI do chat pos-login com Realtime (Fase 3)
c65a49c feat(chat): store de conversas multicanal + nucleo chat-core com RBAC
```
