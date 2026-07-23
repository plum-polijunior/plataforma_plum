# Mudanças no front — endurecimento do control plane

> Acompanham a migration `20260722130000_endurecimento_rls.sql`.
> **As duas coisas precisam ir juntas.** Aplicar a migration com o front antigo
> quebra a tela de acesso; subir o front novo sem a migration quebra também.

---

## ⚠️ Por que é um par indivisível

| Se você aplicar | Sem | O que acontece |
|---|---|---|
| a migration | o front novo | `Auth.tsx` chama `.from('organizations').select(...)` como `anon`. A policy de leitura pública não existe mais → **busca de organização sempre vazia**, ninguém consegue se cadastrar |
| o front novo | a migration | O front chama `resolver_codigo_organizacao` e `criar_organizacao`, que ainda não existem → **erro de função inexistente** |

---

## O que mudou, arquivo por arquivo

### `src/pages/Auth.tsx`

**1. Busca de organização — não lê mais a tabela (achado S-02)**

```diff
- const { data } = await supabase
-   .from('organizations').select('id, name').eq('share_id', shareId).maybeSingle();
+ const { data } = await supabase
+   .rpc('resolver_codigo_organizacao', { p_codigo: shareId });
```

A tabela `organizations` deixou de ser legível publicamente — ela expunha a
lista inteira de clientes a qualquer portador da chave `anon`, que é pública
por design. A função `SECURITY DEFINER` devolve **apenas** `{org_id, org_name}`
da organização correspondente ao código.

**2. Campo do código — de 4 para 12 caracteres**

O rótulo passou de *"ID da Organização (4 caracteres)"* para *"Código da
Organização"*, e o `maxLength` de `4` para `12`.

O `share_id` antigo **continua funcionando**: a função aceita os dois formatos,
para não quebrar as organizações que já existem.

**3. Cadastro de membro — envia o código, não o `organization_id`**

```diff
- data: { organization_id: foundOrg.id }
+ data: { join_code: orgId.toUpperCase() }
```

O código de convite é um **segredo portador** digitado pelo usuário — legítimo
vir do cliente. Um `organization_id` seria uma declaração de identidade, e é
justamente o que gerou o incidente original.

**4. Criação de organização — virou RPC autenticada (achado S-10)**

Antes: `signUp` com `is_admin_setup: 'true'`, `org_name` e `org_share_id` no
metadata; o trigger criava a organização a partir disso.

Agora, dois passos:

```
1. signUp (sem metadata algum)  → conta criada SEM organização
2. rpc('criar_organizacao')     → cria org + cargo Admin, já autenticado
```

**O campo "ID Compartilhável" sumiu do formulário.** O código passou a ser
gerado pelo servidor com 12 caracteres aleatórios criptográficos — o antigo,
de 4, era enumerável em poucas horas.

**5. Caminho novo quando a confirmação de e-mail está ligada**

Se `signUp` não devolve sessão (confirmação de e-mail ativa), não dá para
chamar a RPC na hora. O usuário recebe a instrução de confirmar e entrar — e
conclui a criação pela tela de "sem organização".

### `src/pages/AccessPending.tsx`

Ganhou um formulário **"Criar uma organização"**, visível **apenas** no estado
`sem-org`.

Sem isso, quem confirmasse o e-mail e entrasse ficaria num beco sem saída: sem
organização, sem código de convite e sem nenhuma ação disponível.

### `src/integrations/supabase/types.ts`

- `organizations`: novas colunas `join_code` e `join_mode`
- `profiles`: nova coluna `updated_at`
- Nova tabela `profile_changes_audit` (`Insert` e `Update` tipados como
  `never` — a tabela é append-only, só o trigger escreve)
- Bloco `Functions` com as assinaturas de `resolver_codigo_organizacao` e
  `criar_organizacao`

---

## Onde encontrar o código de convite

Ele **não** é mais escolhido por quem cria a organização — é gerado pelo
servidor. O admin o recupera em **Dashboard → Minha Organização**, no cartão
do cabeçalho, com botão de copiar ao lado.

O cartão se adapta ao `join_mode` da organização:

| `join_mode` | O que o cartão mostra |
|---|---|
| `share_id` | **Código de Convite** + botão de copiar |
| `dominio` | **Entrada: por domínio verificado** — sem código, porque nesse modo ele não funciona |

Mostrar o código numa organização em modo `dominio` seria enganoso: o
`handle_new_user` recusa códigos de organizações nesse modo.

Se preferir consultar direto no banco:

```sql
select name, join_code, join_mode from public.organizations order by name;
```

> O botão de copiar usa `navigator.clipboard`, que exige contexto seguro
> (HTTPS ou localhost). Fora disso o toast mostra o código para cópia manual.

---

## Fluxos para testar depois de aplicar

| Fluxo | Como | Esperado |
|---|---|---|
| Entrar com código | `/auth` → Entrar → digitar `join_code` | Acha a organização pelo nome |
| Entrar com `share_id` antigo | idem, com o código de 4 letras | Continua funcionando |
| Código inexistente | digitar 12 caracteres aleatórios | "Organização não encontrada" |
| Criar organização | `/auth` → Nova Organização | Conta criada, vira Admin ativo |
| Criar sem sessão | com confirmação de e-mail ligada | Instrução de confirmar; cria depois pela tela sem-org |
| Cadastro de membro | Entrar → Cadastrar | Nasce `pendente`, vê "Aguardando liberação" |

---

## O que **não** mudou

- Login por e-mail e senha
- Botões de SSO (Google / Microsoft)
- Landing page
- Dashboard e a página de base de dados
- Formulário de contato e a tabela `Leads` (decisão D-13 — intocada)
