# Passo a passo — aplicar e testar o SSO por domínio

Guia completo, do zero. Não é preciso conhecer SQL nem Supabase.
Siga na ordem. Cada passo diz exatamente onde clicar e o que esperar.

**Tempo estimado:** 25 a 40 minutos (sem o SSO do Google/Microsoft, que é opcional).

---

## Antes de começar

Você vai precisar de:

- Acesso ao painel do Supabase do projeto (`rjwidarrsykufuifzunu`)
- O projeto rodando no seu computador (`npm run dev`)

---

## PASSO 1 — Abrir o painel

1. Vá em **https://supabase.com/dashboard**
2. Faça login.
3. Clique no projeto **`rjwidarrsykufuifzunu`**.

Você vai cair numa tela com um menu vertical à esquerda. Todos os passos
seguintes usam esse menu.

---

## PASSO 2 — Fazer backup (não pule)

1. No menu da esquerda, clique em **Database**.
2. Dentro de Database, clique em **Backups**.
3. Se houver um botão **Create backup** (ou *Backup now*), clique nele e
   aguarde terminar.

> **Se o seu plano for o gratuito**, esse botão pode não existir — o plano
> free só tem backup automático diário. Nesse caso, faça o seguinte no lugar:
> vá em **SQL Editor**, cole a linha abaixo, clique em **Run**, e salve o
> resultado num arquivo de texto no seu computador. É uma foto do estado atual.
>
> ```sql
> select table_name, column_name, data_type, is_nullable
> from information_schema.columns
> where table_schema = 'public'
> order by table_name, ordinal_position;
> ```

---

## PASSO 3 — Levantamento de segurança (fazer ANTES de aplicar)

Isso responde "alguém já explorou a falha?". Precisa ser feito **antes**,
enquanto o banco ainda está no estado original.

1. No menu da esquerda, clique em **SQL Editor**.
2. Clique em **+ New query** (canto superior).
3. Abra no seu computador o arquivo:
   `supabase/forensics/2026-07-22_levantamento_escalonamento.sql`
4. Selecione **tudo** (Ctrl+A), copie (Ctrl+C).
5. Cole na caixa do SQL Editor (Ctrl+V).
6. Clique em **Run** (ou aperte Ctrl+Enter).

**O que você vai ver:** o Supabase mostra o resultado da *última* consulta.
Para ver as outras, selecione com o mouse **apenas o bloco que te interessa**
e clique em Run de novo — ele roda só o trecho selecionado.

**O que fazer com o resultado:**

- Se a **Consulta 1** voltar vazia → ótimo, ninguém passou. Anote isso.
- Se voltar linhas → olhe a coluna **`triagem`**:
  - `ESPERADO — ...` → normal, é o funcionamento do sistema.
  - `>>> INVESTIGAR` → **confira uma a uma**, não descarte em bloco.

7. Abra o arquivo `docs/INCIDENTE-2026-07-22-escalonamento.md` e preencha a
   tabela da seção **"Resultado do levantamento"**. Preencha **mesmo que o
   resultado seja "nada encontrado"** — o registro é a prova de que foi
   verificado.

---

## PASSO 4 — Aplicar as correções

Este é o passo principal.

1. Ainda no **SQL Editor**, clique em **+ New query**.
2. Abra o arquivo: `supabase/aplicar/APLICAR_TUDO.sql`
3. Selecione tudo (Ctrl+A), copie (Ctrl+C), cole no editor (Ctrl+V).
4. Clique em **Run**.

**Vai demorar alguns segundos.** É normal.

**O que deve aparecer:** uma tabela com duas colunas, `item` e `situacao`.
**Todas as 22 linhas** devem dizer **OK**. Elas vêm numeradas pela parte que
as criou:

```
1. Policy insegura de INSERT em organizations REMOVIDA    OK
1. Policy insegura de UPDATE em profiles REMOVIDA         OK
1. Trigger on_auth_user_created ativo                     OK
2. Denylist preenchida (15 dominios)                      OK
2. Funcao custom_access_token_hook criada                 OK
...
3. Coluna organizations.join_code                         OK
3. Funcao criar_organizacao criada (S-10)                 OK
3. Leitura publica de organizations REMOVIDA (S-02)       OK
3. Tabela profile_changes_audit                           OK
D-13. Leads NAO foi alterada (esperado)                   OK
```

> A última linha confirma que `Leads` **não** foi tocada — é o
> comportamento correto, decidido explicitamente. Ela aparecer como `OK`
> significa "continua como estava".

### Se der erro

O Supabase mostra a mensagem em vermelho e **desfaz tudo automaticamente** —
o banco continua como estava. Nada quebrou. Copie a mensagem de erro inteira
e leve para quem estiver acompanhando. Não tente "consertar na mão".

---

## PASSO 5 — Ligar o hook do token

Sem isso o sistema funciona, mas fica mais lento. Leva 30 segundos.

1. Menu da esquerda → **Authentication**.
2. Dentro de Authentication, procure **Hooks** (em alguns painéis fica dentro
   de *Auth Hooks* ou dentro de **Settings**).
3. Encontre **Customize Access Token (JWT) Claims** e clique em habilitar.
4. Preencha:
   - **Type / Tipo:** `Postgres`
   - **Schema:** `public`
   - **Function / Função:** `custom_access_token_hook`
5. Salve.

---

## PASSO 6 — Rodar os testes automáticos

Confirma que tudo funciona antes de você testar na mão.

São **duas** suítes. Rode as duas, uma de cada vez.

1. **SQL Editor** → **+ New query**.
2. Abra `supabase/tests/sso_dominio_test.sql`, copie tudo, cole, **Run**.
3. **+ New query** de novo.
4. Abra `supabase/tests/endurecimento_rls_test.sql`, copie tudo, cole, **Run**.

A segunda deve terminar com:

```
TODOS OS 10 CENARIOS DE ENDURECIMENTO PASSARAM
```

**O que esperar:** uma tabela com uma linha só:

```
resultado                        cenarios              observacao
TODOS OS 10 CENARIOS PASSARAM    a,b,c,d,e,f,g,h,i,j   Nenhum dado foi gravado (ROLLBACK)
```

O script **não salva nada** — ele testa e desfaz tudo.

**Se aparecer erro em vermelho**, ele nomeia o cenário que falhou
(ex.: `(e) FALHOU: membro pendente leu 1 dataset(s)`). **Pare aqui** e leve
a mensagem para revisão. Seu banco não foi alterado.

> Se você rodar uma versão antiga deste arquivo e vir apenas
> **"Success. No rows returned"**, também está aprovado: toda falha aborta
> com erro visível, então terminar sem erro significa que tudo passou.

---

## PASSO 7 — Criar dados de teste

> ⚠️ **Só faça isso se este for um ambiente de teste.** Se for o banco de
> produção da empresa, pule para o Passo 9 e teste com um domínio real.

1. **SQL Editor** → **+ New query**.
2. Abra `supabase/seed/dev_seed_dominios.sql`, copie tudo, cole, **Run**.

Isso cria duas empresas fictícias:

| Empresa | Domínio | Situação |
|---|---|---|
| Empresa Teste A | `empresa-teste-a.com` | verificado — **deve** funcionar |
| Empresa Teste B | `empresa-teste-b.com` | não verificado — **não deve** funcionar |

---

## PASSO 8 — Desligar a confirmação de e-mail (só em teste)

Senão você precisa confirmar cada e-mail de teste na caixa de entrada.

1. **Authentication** → **Providers** (ou *Sign In / Providers*).
2. Clique em **Email**.
3. Desmarque **Confirm email**.
4. Salve.

> Em produção, **mantenha ligado**.

---

## PASSO 9 — Testar de verdade

Agora sim. No seu computador:

```bash
npm run dev
```

Abra **http://localhost:8080/auth** no navegador.

Clique em **Entrar** → digite `TSTA` → **Buscar Organização** → aba
**Cadastrar**. Faça quatro cadastros, um de cada vez, com senha qualquer
(ex.: `Teste12345`):

| E-mail que você digita | O que **deve** acontecer |
|---|---|
| `joao@empresa-teste-a.com` | Vai para **"Aguardando liberação"**, mostrando *Empresa Teste A* |
| `maria@empresa-teste-b.com` | Vai para **"Nenhuma organização vinculada"** (domínio não verificado) |
| `carlos@gmail.com` | Vai para **"Nenhuma organização vinculada"** (provedor público) |
| `ana@outraempresa.com` | Vai para **"Nenhuma organização vinculada"** (não cadastrado) |

> Entre um cadastro e outro, clique em **Sair** na própria tela.

### Conferir no banco o que aconteceu

**SQL Editor** → nova query → cole e **Run**:

```sql
select u.email,
       o.name   as organizacao,
       p.status,
       a.signal as sinal_usado,
       a.result as resultado
from auth.users u
left join public.profiles p             on p.id = u.id
left join public.organizations o        on o.id = p.organization_id
left join public.domain_binding_audit a on a.user_id = u.id
order by u.created_at desc
limit 10;
```

Você deve ver `bound` para o primeiro, `unverified_domain` para o segundo,
`denylisted` para o terceiro e `no_match` para o quarto.

---

## PASSO 10 — Liberar um usuário e ver o dashboard abrir

1. **SQL Editor** → cole e **Run** (troque o e-mail se usou outro):

```sql
update public.profiles
   set status = 'ativo'
 where id = (select id from auth.users where email = 'joao@empresa-teste-a.com');
```

2. Volte no navegador, clique em **Sair**, e entre de novo com esse e-mail.

> **Importante:** tem que sair e entrar. O crachá de acesso (token) só é
> reemitido no login — sem isso parece que não funcionou.

Agora o dashboard abre normalmente.

---

## OPCIONAL — Ligar os botões Google e Microsoft

Só faça isso depois que tudo acima estiver funcionando.

### Google

1. Vá em **https://console.cloud.google.com** → **APIs & Services** →
   **Credentials**.
2. **Create Credentials** → **OAuth client ID** → tipo **Web application**.
3. Em *Authorized redirect URIs*, cole exatamente:
   ```
   https://rjwidarrsykufuifzunu.supabase.co/auth/v1/callback
   ```
4. Salve. Copie o **Client ID** e o **Client Secret**.
5. No Supabase: **Authentication** → **Providers** → **Google** → cole os
   dois valores → **Enable** → salvar.

### Microsoft

1. Vá em **https://portal.azure.com** → **App registrations** →
   **New registration**.
2. Em *Redirect URI*, escolha **Web** e cole a mesma URL do passo 3 acima.
3. Registre. Copie o **Application (client) ID**.
4. Em **Certificates & secrets** → **New client secret** → copie o **Value**
   (não o *Secret ID*).
5. No Supabase: **Authentication** → **Providers** → **Azure** → cole os dois
   valores. Em *Azure Tenant URL*, coloque:
   ```
   https://login.microsoftonline.com/common
   ```
6. Salve.

### O passo que quase todo mundo esquece

1. Supabase → **Authentication** → **URL Configuration**.
2. Em **Redirect URLs**, adicione:
   ```
   http://localhost:8080/**
   ```
3. Salve.

Sem isso o login do Google completa e depois trava, sem voltar para o site.

---

## Perguntas frequentes

**"Success. No rows returned" — deu errado?**
Não. Significa que funcionou e aquele comando não tinha nada para mostrar.

**Posso rodar o `APLICAR_TUDO.sql` duas vezes?**
Pode. Ele foi feito para isso — rodar de novo não duplica nem quebra nada.

**Mudei o status de alguém e não mudou nada na tela.**
Falta sair e entrar de novo. As permissões ficam no token, que só é
reemitido no login.

**Um usuário antigo continua na organização errada.**
Esperado. O roteamento por domínio só acontece quando a conta é **criada**.
Contas que já existiam mantêm o vínculo atual — é por isso que o Passo 3
(levantamento) existe.

**Como desfaço os dados de teste?**
No fim do arquivo `supabase/seed/dev_seed_dominios.sql` há um bloco de
limpeza comentado. Copie só aquelas linhas (sem o `/*` e o `*/`) e rode.

---

## Checklist

- [ ] Passo 2 — backup feito
- [ ] Passo 3 — levantamento rodado **e** resultado anotado no doc do incidente
- [ ] Passo 4 — `APLICAR_TUDO.sql` rodado, todas as linhas **OK**
- [ ] Passo 5 — hook configurado
- [ ] Passo 6 — testes passaram
- [ ] Passo 9 — os quatro cadastros se comportaram como esperado
- [ ] Passo 10 — usuário liberado consegue entrar no dashboard
