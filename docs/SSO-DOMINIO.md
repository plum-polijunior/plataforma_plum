# SSO por domínio — guia de operação

Como funciona o vínculo automático entre um e-mail corporativo e uma organização
no Plum, e o que um administrador precisa fazer.

---

## Em uma frase

Quando alguém entra com Google ou Microsoft, o servidor extrai o domínio do
e-mail já verificado pelo provedor, procura esse domínio em
`organization_domains` com `verified = true` e cria o vínculo com a organização
correspondente — sempre com status `pendente`.

**Entrar na organização não dá acesso aos dados.** A liberação é um ato
explícito do administrador.

---

## Fluxo para o administrador

### 1. Criar a organização

Tela de acesso → **Nova Organização**. Informe nome, um ID de 4 caracteres e
os dados da sua conta de admin. Você nasce como `ativo` e com o cargo `Admin`.

O domínio do seu próprio e-mail é cadastrado automaticamente em
`organization_domains`, mas **não verificado** — ninguém é roteado por ele
até você verificar (passo 2).

### 2. Cadastrar e verificar o domínio

No MVP a verificação é administrativa (decisão D-02): não há checagem de DNS.
Rode no SQL Editor do Supabase:

```sql
insert into public.organization_domains
  (organization_id, domain, verified, verification_method, verified_at, verified_by)
values
  ('<uuid-da-organizacao>', 'empresa.com', true, 'admin', now(), '<uuid-do-admin>')
on conflict (domain) do update
  set verified = true,
      verification_method = 'admin',
      verified_at = now();
```

> ⚠️ **Verifique um domínio apenas se a empresa realmente o controla.** Um
> domínio verificado roteia automaticamente todo mundo que tiver e-mail nele.

O campo `verification_method` já aceita `dns_txt`, reservado para a verificação
por DNS no futuro — adicioná-la não exigirá migration nem mudança no trigger.

**Microsoft Entra ID:** se quiser usar o tenant id como sinal primário (mais
forte que o parsing do e-mail), preencha também:

```sql
update public.organization_domains
   set ms_tenant_id = '<tenant-id-do-entra>'
 where domain = 'empresa.com';
```

### 3. Liberar os membros

Quem entra fica `pendente` e vê a tela "Aguardando liberação". Para liberar:

```sql
update public.profiles
   set status = 'ativo', role_id = '<uuid-do-cargo>'
 where id = '<uuid-do-usuario>';
```

Status possíveis: `pendente`, `ativo`, `rejeitado`, `desativado`.

---

## Configuração no painel do Supabase (não codável)

### Provedores OAuth

**Authentication → Providers → Google**
1. Crie um OAuth Client no Google Cloud Console (tipo *Web application*).
2. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Cole Client ID e Client Secret no painel e habilite.

**Authentication → Providers → Azure (Microsoft)**
1. Registre um app no Entra ID (Azure Portal → App registrations).
2. Redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Cole Application (client) ID e um Client Secret no painel.
4. Em *Azure Tenant URL*, use `https://login.microsoftonline.com/common` para
   aceitar múltiplos tenants (necessário para SaaS multi-cliente).

> SAML está **fora de escopo** (decisão D-03).

### Custom Access Token Hook

**Authentication → Hooks → Customize Access Token (JWT) Claims**

- Tipo: **Postgres**
- Schema: `public`
- Função: `custom_access_token_hook`

Sem esse passo o JWT não carrega `organization_id` / `profile_status`. O
sistema continua funcionando (as funções `current_org_id()` e
`current_profile_status()` caem para consulta direta em `profiles`), mas com
uma query a mais por verificação de RLS.

---

## Claims injetadas no JWT

| Claim | Conteúdo |
|---|---|
| `organization_id` | uuid da org, ou `null` |
| `profile_status` | `pendente` \| `ativo` \| `rejeitado` \| `desativado` \| `sem_org` |
| `role_id` | uuid do cargo, ou `null` |
| `role_name` | nome do cargo (ex.: `Admin`), ou `null` |

---

## Estados no front

| Estado | Quando | O que o usuário vê |
|---|---|---|
| `sem-org` | domínio público, não mapeado ou não verificado | "Nenhuma organização vinculada" |
| `pendente` | vinculado, sem aprovação | "Aguardando liberação" |
| `ativo` | aprovado pelo admin | dashboard da organização |
| `bloqueado` | `rejeitado` / `desativado` | "Acesso indisponível" |

Implementado em [`use-org-access.ts`](../src/hooks/use-org-access.ts) e
[`AccessPending.tsx`](../src/pages/AccessPending.tsx); o guard está em
[`DashboardLayout.tsx`](../src/layouts/DashboardLayout.tsx).

---

## Auditoria

Toda tentativa de vínculo é gravada em `domain_binding_audit`:

```sql
select created_at, email_domain, signal, result, organization_id
  from public.domain_binding_audit
 order by created_at desc
 limit 50;
```

`signal`: `ms_tid` | `google_hd` | `email_domain` | `share_id` | `admin_setup`
`result`: `bound` | `denylisted` | `no_match` | `unverified_domain` | `no_email` | `org_created`

---

## Denylist de provedores públicos

`public_email_domains` — consultada **antes** de qualquer lookup. Domínios
nessa lista nunca viram domínio de organização. Para adicionar:

```sql
insert into public.public_email_domains (domain) values ('novoprovedor.com')
on conflict do nothing;
```

---

## Testes

```bash
psql "$DATABASE_URL" -f supabase/tests/sso_dominio_test.sql
```

Roda em transação com `ROLLBACK` — não persiste nada. Cobre: domínio
verificado, denylist, domínio não mapeado, `verified = false`, membro
`pendente` sem leitura, isolamento entre orgs, tentativa de forjar
`status` via metadata, precedência da claim `hd`, **fail-closed na
ausência de claim** e **guard anti-drift** entre as chaves emitidas pelo
hook e as lidas pelas policies.

> O guard anti-drift existe porque renomear uma claim de um lado só faz o
> RLS parar de casar silenciosamente. O teste (i) confirma que o modo de
> falha é negar acesso; o teste (j) quebra o build se as chaves divergirem.
