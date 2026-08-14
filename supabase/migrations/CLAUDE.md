# supabase/migrations/ — o que esta pasta esconde

⭐ **Esta pasta é a ÚNICA fonte de verdade do schema** — inclusive o `login_supabase.sql`, que é a
base e mora aqui dentro (documentação antiga dizia que ele ficava fora; não fica). Qualquer documento
que descreva o banco de outra forma está errado — houve um PRD, apagado em 2026-08-14, que descrevia
`tenants`/`tenant_users`/`data_dictionary`, tabelas que **nunca existiram**.

## 1. ⚠️ Migrations NÃO são aplicadas por CLI

`supabase/config.toml` só tem `project_id`. O fluxo real é **colar o SQL no SQL Editor do painel** e
rodar. É decisão consciente, para manter um humano no meio do passo destrutivo — ver
`contexto/30-decisoes.md` D-005.

**O procedimento** (o `docs/PASSO-A-PASSO-APLICAR.md` que descrevia isso foi apagado em 2026-08-14):

1. Painel Supabase do projeto `rjwidarrsykufuifzunu` → **SQL Editor** → nova query.
2. Cole o conteúdo **inteiro** de **uma** migration. Uma por vez, na ordem do §2.
3. Rode e **leia o bloco de verificação** no fim (`SELECT item, CASE WHEN ok THEN 'OK' ELSE
   'FALTANDO' END`). Todo `FALTANDO` é falha — não siga para a próxima.
4. Atualize `src/integrations/supabase/types.ts` no mesmo PR (§4).
5. ⚠️ Se a migration mexe em claim ou em `status`, **saia e entre** na aplicação antes de testar:
   claims de JWT só são reemitidas no login.

## 2. A ordem importa

A ordem completa está no `CLAUDE.md` da raiz, §6. Dependências que quebram se invertidas:

- `20260722110000_hotfix_escalonamento_privilegio.sql` vem **antes** do SSO;
- `20260722130000_endurecimento_rls.sql` requer as duas anteriores e precisa de `pgcrypto`;
- `create_role_permissions_table.sql` dropa `roles.permissions`
  (⚠️ `add_role_permissions.sql` é histórico, **não aplicar**);
- `create_plum_chat_table.sql` não tem prefixo de timestamp — fora da convenção do CLI.

⚠️ **A lista do `CLAUDE.md` §6 está incompleta — conferido em 2026-08-14.** Seis arquivos desta pasta
não aparecem lá: os dois `20260714…` (tabela `Leads`) e quatro de `GRANT`/backfill
(`20260807190000_backfill_permissao_admin_bases_existentes`,
`20260807200000_grant_plum_chat_authenticated`, `20260807210000_plum_chat_grant_update`,
`20260811120000_grant_snapshots_service_role`). São aditivos e sem dependência entre si, o que explica
a omissão — mas **`ls` é a lista real**, não o §6.

## 3. Padrão obrigatório de toda migration

- **Idempotente:** `IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` antes de
  `CREATE POLICY`.
- **Não destrutiva.** Coluna que deixou de ser usada é **aposentada, não dropada** — há dois
  precedentes vivos (`organizations.dashboard_k_min`, `plum_chat.assunto`).
- **Termina com bloco autoverificável:**
  `SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END`.

## 4. ⚠️ Migration e front são par indivisível

Aplicar migration com front antigo quebra; subir front sem a migration dá erro de função
inexistente. **Atualize `src/integrations/supabase/types.ts` na mesma alteração.**

## 5. As regras de segurança que nasceram de incidente

Todas vêm do escalonamento de privilégio de 2026-07-22
(`contexto/31-incidentes-e-licoes.md` I-01). Violá-las é regressão, não estilo:

- escopo de tenant **sempre** por `public.current_org_id()` — nunca subquery direta em `profiles`
  dentro de policy (recursão de RLS);
- **toda policy de leitura de dados checa status**, não só organização (`is_active_member()`);
  escrita exige `is_org_admin()` em `USING` **e** `WITH CHECK`;
- ⚠️ **nenhuma policy de UPDATE em `profiles` alcança o próprio registro** (`id <> auth.uid()`);
- toda função `SECURITY DEFINER` tem `SET search_path = …, pg_temp`, com **`pg_temp` por último**
  (senão dá sequestro via `pg_temp.profiles`);
- `organizations` nunca em SELECT público.

## 6. Testes

```sh
psql "$DATABASE_URL" -f supabase/tests/endurecimento_rls_test.sql
psql "$DATABASE_URL" -f supabase/tests/sso_dominio_test.sql
```

⚠️ **Claims de JWT só são reemitidas no login.** Mudar `status` no banco não reflete até o usuário
sair e entrar — vale para testar, e vale para explicar ao cliente.

## 7. ⚠️ O banco real divergiu do SQL versionado em pelo menos um ponto

`join_mode`: o SQL diz `'share_id'`, o dump de produção diz `DEFAULT 'codigo'` com
`CHECK IN ('codigo','dominio')`. **Confirme o estado real antes de mexer em entrada de organização**,
e no front importe as constantes de `src/lib/organizacao.ts`. Outros objetos existem no banco sem
migration (`assistants`, `conversations`, `messages`, `get_user_org_id()`, `rls_auto_enable()`).
