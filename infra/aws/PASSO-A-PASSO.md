# Subir o executor do PLUM — passo a passo

Uma pessoa, uma máquina. **Não precisa de Docker.** A imagem é construída pelo
GitHub Actions, que já tem Docker de graça no servidor dele.

## Os dois terminais

Você vai usar dois tipos de terminal. É a única coisa que confunde, então
vale fixar agora:

| Terminal | Como abrir | Para quê |
|---|---|---|
| **VS Code** | abra o projeto no VS Code, `Ctrl + '` | comandos `npx supabase` |
| **Git Bash** | menu Iniciar → digite "Git Bash" | scripts `.sh` da AWS |

Regra simples: **se o comando começa com `bash`, é no Git Bash. Se começa com
`npx`, é no VS Code.**

No Git Bash você precisa entrar na pasta do projeto primeiro:

```bash
cd /c/Users/kakam/OneDrive/Documentos/PROJETOS/plataforma-plum/plataforma_plum
```

Para conferir que está no lugar certo, digite `ls`. Precisa listar
`package.json`, `src`, `supabase`, `query_engine`.

---

# ETAPA 1 — Credencial da AWS

**Git Bash.**

Você precisa de uma chave de acesso da conta AWS do PLUM, com permissão de
administrador (o script cria roles de IAM).

Se ainda não tem: console da AWS → canto superior direito, seu nome →
**Security credentials** → **Access keys** → **Create access key** → escolha
**Command Line Interface (CLI)** → marque a confirmação → **Create**.

Ele mostra duas linhas. A segunda (`Secret access key`) **aparece uma vez só**.

```bash
aws configure
```

Ele pergunta quatro coisas:

```
AWS Access Key ID     : cole a primeira linha
AWS Secret Access Key : cole a segunda linha
Default region name   : sa-east-1
Default output format : json
```

**Confira que funcionou:**

```bash
aws sts get-caller-identity
```

Precisa aparecer um JSON com `Account`, `Arn` e `UserId`. Confira que o número
em `Account` é o da conta do PLUM.

---

# ETAPA 2 — Chave da service account do Google

**No navegador.**

O executor lê as planilhas com a identidade `plum-polijunior@plataforma-plum.iam.gserviceaccount.com`.
Ele precisa da chave dela.

1. Abra <https://console.cloud.google.com>
2. No seletor de projeto, no topo, escolha **plataforma-plum**
3. Menu ☰ → **IAM e administrador** → **Contas de serviço**
4. Clique em `plum-polijunior@plataforma-plum.iam.gserviceaccount.com`
5. Aba **Chaves**
6. **Adicionar chave** → **Criar nova chave** → **JSON** → **Criar**

Baixa um arquivo tipo `plataforma-plum-066f1e5ced6e.json`, normalmente em Downloads.

Criar uma chave nova **não invalida as antigas** e não quebra nada que já
esteja rodando.

---

# ETAPA 3 — Criar a casa na AWS

**Git Bash**, na pasta do projeto. Troque o nome do arquivo pelo que você
baixou:

```bash
GOOGLE_SA_FILE=C:/Users/kakam/Downloads/plataforma-plum-066f1e5ced6e.json \
  bash infra/aws/provision.sh
```

Leva menos de um minuto. Ele imprime cada etapa e termina com um bloco
mostrando o **ARN da role de deploy** e os dois próximos cliques.

Depois que terminar, apague o JSON. Ele já está guardado e criptografado na
AWS:

```bash
rm /c/Users/kakam/Downloads/plataforma-plum-066f1e5ced6e.json
```

---

# ETAPA 4 — Dois cliques no GitHub

**No navegador.**

## 4.1 Guardar o ARN

1. Abra <https://github.com/plum-polijunior/plataforma_plum/settings/secrets/actions>
2. **New repository secret**
3. **Name:** `AWS_DEPLOY_ROLE_ARN`
4. **Secret:** cole o ARN que o script imprimiu
5. **Add secret**

Isso não é uma senha. É o endereço de uma permissão que só funciona para este
repositório.

## 4.2 Mandar construir

1. Abra <https://github.com/plum-polijunior/plataforma_plum/actions/workflows/query-engine.yml>
2. Botão **Run workflow**, à direita
3. Branch: **plataforma**
4. **Run workflow**

Leva uns 5 minutos. Ele roda os 76 testes, constrói a imagem, publica, cria a
função Lambda e confere que o endpoint **não** ficou público.

**Deu certo se a bolinha ficar verde.** Clicando na execução, o resumo mostra
a URL do serviço.

Se ficar vermelha, abra a execução e me mande o nome do passo que falhou.

---

# ETAPA 5 — Ligar o Supabase

## 5.1 Pegar os valores

**Git Bash:**

```bash
bash infra/aws/valores-supabase.sh
```

Ele confere que a função existe, confere que o endpoint está fechado por IAM,
gera a chave de acesso da Edge Function, e imprime cinco comandos prontos.

> A saída contém segredos. Não tire print, não cole em chat.

## 5.2 Entrar no Supabase

**Terminal do VS Code:**

```
npx supabase login
```

Abre o navegador pedindo autorização. Autorize e volte.

> **Não use `supabase link`.** Ele pede a senha do banco e não é necessário:
> todos os comandos abaixo levam `--project-ref`. Menos uma senha para
> caçar. (O `CLAUDE.md` do projeto registra que migrations neste repositório
> são aplicadas pelo painel, não por CLI.)

## 5.3 Criar as tabelas do dashboard

**No navegador**, não no terminal. É o fluxo estabelecido deste projeto.

1. Abra <https://supabase.com/dashboard/project/rjwidarrsykufuifzunu/sql>
2. Abra o arquivo `supabase/migrations/20260806230000_dashboard_cards.sql`
   no VS Code
3. Copie **tudo** e cole no editor de SQL
4. Botão **Run**

**Deu certo se aparecer:** `Success. No rows returned`

Pode aparecer um aviso (`WARNING`) dizendo que N bases ativas estão sem
`google_sheet_id`. Isso é esperado, não é erro: são bases antigas, cadastradas
antes desta mudança, que precisam ser reconectadas na tela de bases. Anote
quantas são.

Se aparecer erro em vermelho, copie e me mande. A migration é idempotente:
pode rodar de novo depois de corrigir, sem quebrar nada.

## 5.4 Atualizar os tipos

**Terminal do VS Code:**

```
npx supabase gen types typescript --project-id rjwidarrsykufuifzunu > src/integrations/supabase/types.ts
npm run build
```

O primeiro não imprime nada, é normal. O segundo precisa terminar com
`✓ built in Xs`.

Se o build reclamar de algum campo, me mande o erro: quer dizer que o banco e
o código discordam em algum nome, e é ajuste de dois minutos.

## 5.5 Colar os cinco segredos

Cole os cinco comandos que o `valores-supabase.sh` imprimiu, um por vez.
Depois limpe a tela com `clear`.

## 5.6 Publicar a Edge Function

```
npx supabase functions deploy dashboard-execute --project-ref rjwidarrsykufuifzunu
```

**Deu certo se aparecer:** `Deployed Function dashboard-execute`

---

# ETAPA 6 — O primeiro número verdadeiro

Este é o momento. É a primeira vez que o PLUM vai calcular um número de
verdade desde que existe.

## 6.1 Planilha de teste

Use uma planilha **sua**, não de cliente.

1. Crie uma no Google Sheets com cabeçalho na primeira linha, por exemplo
   `regiao` e `valor`, e **pelo menos 15 linhas** de dados inventados,
   distribuídas em 2 ou 3 regiões
2. **Compartilhar** → cole `plum-polijunior@plataforma-plum.iam.gserviceaccount.com` →
   permissão **Leitor** → **Enviar**
3. Copie o link da barra do navegador

> Por que 15 linhas: grupos com menos de 5 linhas são apagados de propósito
> pela proteção de privacidade. Com poucas linhas, o card volta vazio e parece
> defeito, mas é o sistema funcionando.

## 6.2 Cadastrar no PLUM

Pela tela normal do produto, em `/dashboard/database`. Cole o link no passo da
planilha.

## 6.3 Criar um card à mão

A tela de criar card ainda não existe, é a próxima fase. Por enquanto, pelo
painel do Supabase:

1. Abra <https://supabase.com/dashboard/project/rjwidarrsykufuifzunu/sql>
2. Cole e rode, trocando o que está entre `<>`:

```sql
insert into public.dashboard_cards
  (organization_id, dataset_id, created_by, title, query_plan, viz)
select
  d.organization_id, d.id, p.id,
  'Total por região',
  '{"select":[{"expr":{"agg":"sum","col":"valor"},"as":"total"}],
    "group_by":["regiao"]}'::jsonb,
  'bar'
from public.datasets d
cross join public.profiles p
where d.name = '<nome da base que você cadastrou>'
  and p.email = '<seu email>';
```

3. Confira na tela de permissões que o seu cargo tem `regiao` e `valor`
   liberadas. Sem isso o card volta como `forbidden`, que é o sistema
   protegendo certo.

## 6.4 Executar

Pegue o ID da base no SQL editor:

```sql
select id, name from public.datasets where status = 'active';
```

**Terminal do VS Code:**

```
npx supabase functions invoke dashboard-execute --project-ref rjwidarrsykufuifzunu \n  --body "{\"dataset_id\":\"<o id>\"}"
```

**Deu certo se voltar algo assim:**

```json
{"results":[{"card_id":"...","status":"ok",
  "columns":["regiao","total"],
  "rows":[{"regiao":"Sul","total":1234.5}],
  "row_count":2,"suppressed_groups":0}]}
```

**Agora abra a planilha e some a coluna à mão.** Se bater, acabou.

---

# Se der errado

| O que apareceu | O que é | O que fazer |
|---|---|---|
| `aws: command not found` | terminal aberto antes da instalação | feche e abra o Git Bash de novo |
| `AccessDenied` na etapa 3 | sua chave AWS não é de admin | use uma chave com permissão de administrador |
| `/plum/prod/google-sa-json NÃO criado` | esqueceu o `GOOGLE_SA_FILE` | rode de novo com a variável; o resto não é refeito |
| Actions vermelho no passo "Assumir a role" | o secret do ARN está errado ou faltando | refaça a etapa 4.1 |
| Actions vermelho nos testes | alguma coisa quebrou no código | me mande o log do passo |
| `valores-supabase.sh` diz que a função não existe | o workflow não terminou ou falhou | espere ficar verde, ou veja o log |
| `valores-supabase.sh` diz PERIGO, AuthType público | o endpoint ficou aberto | rode o comando que ele imprime, **é urgente** |
| `status: forbidden` na etapa 6.4 | cargo sem alguma coluna liberada | libere na tela de permissões |
| `error` com "Planilha não acessível" | não compartilhou com o bot | etapa 6.1, item 2 |
| `error` com "não tem a coluna" | nome diferente do cabeçalho | confira a primeira linha da planilha |
| erro `401` | assinatura não bateu | rode `valores-supabase.sh` de novo e recole os segredos |
| `suppressed_groups` alto e poucas linhas | k-anonimato funcionando | ponha mais linhas na planilha de teste |

Para ver o que o serviço registrou:

```bash
aws logs tail /aws/lambda/plum-query-engine --region sa-east-1 --since 10m
```

Travou em qualquer linha? Copie o comando que você digitou e o que apareceu, e
me mande. Não precisa entender o erro.

---

# O que fica criado, para registro

| Recurso | Nome | Observação |
|---|---|---|
| ECR | `plum/query-engine` | guarda só as 10 imagens mais recentes |
| SSM SecureString | `/plum/prod/google-sa-json` | chave do Google, criptografada com KMS |
| SSM SecureString | `/plum/prod/hmac-secret` | gerado com `openssl rand`, nunca impresso |
| IAM role | `plum-query-engine-exec` | lê **apenas** esses dois parâmetros |
| IAM role | `plum-github-deploy` | só publica nesta função, restrita a este repo |
| IAM user | `plum-edge-invoker` | só pode `InvokeFunctionUrl` nesta função |
| OIDC provider | `token.actions.githubusercontent.com` | GitHub deploya sem chave permanente |
| Lambda | `plum-query-engine` | criado pelo GitHub Actions, 30s, 1024 MB |
| Function URL | — | auth `AWS_IAM`: **não é público** |

Nenhum segredo entra na imagem nem no repositório. O JSON do Google e o
segredo do HMAC ficam no SSM e são lidos em tempo de execução pela role do
Lambda.

Custo esperado no volume atual: centavos por mês. O Lambda escala a zero e o
Parameter Store no tier padrão não cobra por parâmetro.
