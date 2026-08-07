# Passo a passo — sua parte

São **duas pessoas** nisso. Este arquivo é só o que **você** faz.
O que o seu parceiro faz está em `LEIA-ME-PRIMEIRO.md`.

## Quem faz o quê

| | Você | Seu parceiro |
|---|---|---|
| Máquina | a sua | a dele |
| Precisa de AWS | **não** | sim, com admin |
| Precisa de Docker | **não** | sim |
| Precisa de Git Bash | **não** | sim |
| Terminal | o do VS Code | o dele |
| Arquivo que segue | **este** | `LEIA-ME-PRIMEIRO.md` |

Você não roda nenhum script `.sh`. Sua parte são comandos `npx`, todos no
mesmo lugar.

## Onde é "o terminal", no seu caso

Sempre o mesmo lugar, o tempo todo:

1. Abra o **VS Code** na pasta do projeto (`plataforma_plum`)
2. Menu **Terminal** → **Novo Terminal** (ou `Ctrl + '`)
3. Ele abre já dentro da pasta certa

Para conferir que está no lugar certo, digite:

```
ls
```

Precisa listar `package.json`, `src`, `supabase`, `query_engine`. Se não
listar, você está na pasta errada.

**Todos** os comandos deste arquivo vão nesse terminal. Nenhum outro.

---

# ETAPA 1 — Agora (sua vez)

## 1.1 Mandar o código para o GitHub

Seu parceiro precisa clonar o repositório para achar o roteiro dele. Hoje
tudo que foi escrito está só na sua máquina.

Peça para eu preparar o commit, ou faça você mesmo:

```
git add .
git commit -m "feat(dashboard): executor, edge function, migration e infra"
git push
```

**Confira que subiu:** abra
<https://github.com/plum-polijunior/plataforma_plum/tree/plataforma/infra/aws>
no navegador. Precisa aparecer os quatro arquivos: `provision.sh`,
`smoke-test.sh`, `LEIA-ME-PRIMEIRO.md` e este aqui.

Se não aparecer, o push não foi.

## 1.2 Mandar a mensagem para o parceiro

```
Oi! Preciso de uma mão para subir o serviço do PLUM na AWS.
Tem roteiro pronto no repositório, é só seguir linha por linha. Uns 30 min.

  git clone https://github.com/plum-polijunior/plataforma_plum.git
  cd plataforma_plum
  git checkout plataforma

Abre o arquivo infra/aws/LEIA-ME-PRIMEIRO.md e segue do passo 1 ao 8.

Você vai precisar de:
  - acesso de admin na conta AWS do PLUM
  - Docker rodando na sua máquina
  - acesso ao projeto plum-ai no Google Cloud (o passo 4 diz onde clicar)

No fim ele gera 5 valores. O passo 8 diz o que fazer com cada um.
Qualquer erro, tem uma tabela no fim do arquivo.
```

---

# ETAPA 2 — Enquanto ele não responde (sua vez)

Isto não depende dele. Pode fazer agora.

## 2.1 Entrar no Supabase

No terminal do VS Code:

```
npx supabase login
```

Vai abrir o navegador pedindo para autorizar. Autorize e volte.
O `npx` baixa o Supabase sozinho na primeira vez, pode demorar um minuto.

**Deu certo se aparecer:** `Finished supabase login.`

## 2.2 Conectar ao projeto

```
npx supabase link --project-ref rjwidarrsykufuifzunu
```

Ele pede a senha do banco. Se você não souber, está no painel do Supabase em
**Project Settings** → **Database** → **Database password**. Se ninguém
souber, dá para gerar uma nova ali mesmo.

**Deu certo se aparecer:** `Finished supabase link.`

## 2.3 Criar as tabelas do dashboard

```
npx supabase db push
```

Ele lista as migrations que vai aplicar e pede confirmação. Digite `Y`.

**Deu certo se aparecer:** `Finished supabase db push.`

Pode aparecer um aviso amarelo dizendo que N datasets ativos estão sem
`google_sheet_id`. Isso é esperado e não é erro: quer dizer que essas bases
precisam ser reconectadas na tela de bases depois. Anote quantos são.

## 2.4 Atualizar os tipos do TypeScript

```
npx supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

Não imprime nada. Isso é normal.

Confira que funcionou:

```
npm run build
```

**Deu certo se terminar com:** `✓ built in Xs`

Se der erro de TypeScript aqui, me mande o erro. Provavelmente é um campo que
mudou de nome e é ajuste de dois minutos.

---

# ETAPA 3 — Quando ele responder (sua vez)

Ele vai te mandar **dois valores**, os dois públicos:

- uma **URL**, tipo `https://abc123.lambda-url.sa-east-1.on.aws`
- um **ARN**, tipo `arn:aws:iam::123456789012:role/plum-github-deploy`

## 3.1 Guardar o ARN no GitHub

Isto é no navegador, não no terminal:

1. Abra <https://github.com/plum-polijunior/plataforma_plum/settings/secrets/actions>
2. Botão **New repository secret**
3. **Name:** `AWS_DEPLOY_ROLE_ARN`
4. **Secret:** cole o ARN que ele mandou
5. **Add secret**

## 3.2 Conferir se ele já configurou os segredos do Supabase

No terminal:

```
npx supabase secrets list
```

Precisa listar cinco nomes:

```
PLUM_EXECUTOR_URL
PLUM_EXECUTOR_HMAC_SECRET
PLUM_AWS_REGION
PLUM_AWS_ACCESS_KEY_ID
PLUM_AWS_SECRET_ACCESS_KEY
```

- **Se aparecerem os cinco:** ele já fez, pule para 3.3.
- **Se faltar algum:** ele precisa te mandar os valores que faltam. Peça por
  gerenciador de senha ou por <https://onetimesecret.com>, **não por
  WhatsApp**: essa chave dá acesso de leitura à planilha de todos os
  clientes. Depois rode:

```
npx supabase secrets set PLUM_EXECUTOR_URL=<a URL, sem barra no fim>
npx supabase secrets set PLUM_AWS_REGION=sa-east-1
npx supabase secrets set PLUM_AWS_ACCESS_KEY_ID=<o que ele mandou>
npx supabase secrets set PLUM_AWS_SECRET_ACCESS_KEY=<o que ele mandou>
npx supabase secrets set PLUM_EXECUTOR_HMAC_SECRET=<o que ele mandou>
```

Um por linha é mais fácil de acertar do que tudo junto.

## 3.3 Publicar a Edge Function

```
npx supabase functions deploy dashboard-execute
```

**Deu certo se aparecer:** `Deployed Function dashboard-execute`

---

# ETAPA 4 — Ver o primeiro número verdadeiro

Este é o momento que interessa. É a primeira vez que o PLUM vai calcular um
número de verdade desde que existe.

## 4.1 Preparar uma planilha de teste

Use uma planilha **sua**, não de cliente.

1. Crie uma planilha no Google Sheets com cabeçalho na primeira linha, por
   exemplo `regiao` e `valor`, e umas 15 linhas de dados inventados
2. Botão **Compartilhar** → cole `reader@plum-ai.iam.gserviceaccount.com`
   → permissão **Leitor** → **Enviar**
3. Copie o link da barra do navegador

## 4.2 Cadastrar a base no PLUM

Pela tela normal do produto: `/dashboard/database`, o fluxo de conexão de
planilha que já existe. Cole o link no passo da planilha.

## 4.3 Criar um card à mão

Ainda não existe tela para criar card (é a próxima fase). Por enquanto, pelo
painel do Supabase:

1. Abra <https://supabase.com/dashboard/project/rjwidarrsykufuifzunu/sql>
2. Cole e rode, trocando o que está entre `<>`:

```sql
insert into public.dashboard_cards
  (organization_id, dataset_id, created_by, title, query_plan, viz)
select
  d.organization_id,
  d.id,
  p.id,
  'Total de valor',
  '{"select":[{"expr":{"agg":"sum","col":"valor"},"as":"total"}],
    "group_by":["regiao"]}'::jsonb,
  'bar'
from public.datasets d
cross join public.profiles p
where d.name = '<nome da base que você cadastrou>'
  and p.email = '<seu email>';
```

**Deu certo se aparecer:** `Success. 1 rows`

3. Confira que o cargo do seu usuário tem as duas colunas liberadas, na tela
   de permissões do PLUM. Sem isso o card volta como `forbidden`, que é o
   sistema funcionando certo.

## 4.4 Executar

Precisa do ID da base. Pegue com:

```sql
select id, name from public.datasets where status = 'active';
```

Depois, no terminal do VS Code:

```
npx supabase functions invoke dashboard-execute --body "{\"dataset_id\":\"<o id>\"}"
```

**Deu certo se voltar algo assim:**

```json
{"results":[{"card_id":"...","status":"ok",
  "columns":["regiao","total"],
  "rows":[{"regiao":"Sul","total":1234.5}],
  "row_count":1,"suppressed_groups":0}]}
```

**Agora abra a planilha e some a coluna `valor` à mão.** Se o número bater,
acabou: o PLUM calculou um número verdadeiro pela primeira vez.

### Se voltar outra coisa

| `status` | O que é | O que fazer |
|---|---|---|
| `forbidden` | seu cargo não tem alguma coluna liberada | libere `regiao` e `valor` na tela de permissões |
| `error` com "Planilha não acessível" | não compartilhou com o bot | passo 4.1, item 2 |
| `error` com "não tem a coluna" | nome diferente do cabeçalho | confira a primeira linha da planilha |
| `error` genérico | o executor não respondeu | me mande o retorno inteiro |
| `stale` | o executor falhou e serviu um valor antigo | é o comportamento correto, mas quer dizer que algo está fora do ar |
| erro 401 | assinatura não bateu | o `PLUM_EXECUTOR_HMAC_SECRET` do Supabase está diferente do que está no SSM da AWS |

Todos os grupos suprimidos com `suppressed_groups` maior que zero? Isso é o
k-anonimato funcionando: grupos com menos de 5 linhas são apagados de
propósito. Ponha mais linhas na planilha de teste.

---

# Resumo de uma tela

```
  VOCÊ, agora          1.1 push        1.2 mandar mensagem
                       2.1 login       2.2 link
                       2.3 db push     2.4 gen types + build
                            │
  ELE                       ├──────►  LEIA-ME-PRIMEIRO.md, passos 1 a 8
                            │         (uns 30 min na máquina dele)
                            ▼
  VOCÊ, depois         3.1 ARN no GitHub
                       3.2 conferir secrets
                       3.3 deploy da função
                       4.x ver o número verdadeiro
```

Travou em qualquer linha? Me manda o comando que você digitou e o que
apareceu na tela. Não precisa entender o erro, só copiar.
