# Subir o executor do PLUM na AWS

> **Este arquivo é para quem tem acesso de admin à conta AWS.**
> Se você é o Ricardo, o seu roteiro é o `PASSO-A-PASSO-RICARDO.md`, ao lado.
>
> | | Você, que está lendo isto | Ricardo |
> |---|---|---|
> | Máquina | a sua | a dele |
> | Precisa de AWS admin | sim | não |
> | Precisa de Docker | sim | não |
> | Terminal | **bash** (no Windows, Git Bash) | o do VS Code dele |
> | Escopo | passos 1 a 8 deste arquivo | tudo que vem depois |
>
> Sua parte termina no passo 8, entregando 5 valores. Nada além disso.
> No Windows, **use o Git Bash**, não o PowerShell: os scripts são `.sh`.

Roteiro literal, do terminal vazio até o serviço respondendo. Uns 30 minutos.

Tudo que é para digitar está em bloco de código. Depois de cada comando tem
**o que precisa aparecer**. Se aparecer outra coisa, veja "Se der errado" no
fim do arquivo.

O que existe aqui é um script idempotente: pode rodar quantas vezes quiser,
ele confere cada recurso antes de criar. Ele só mexe em coisas com nome
`plum-*`, então não encosta em nada que já esteja na conta.

---

## Passo 1 — Pegar o código

```bash
git clone https://github.com/plum-polijunior/plataforma_plum.git
cd plataforma_plum
git checkout plataforma
```

Se você já tem o repositório:

```bash
cd plataforma_plum
git checkout plataforma
git pull
```

**Confira que o script existe:**

```bash
ls -la infra/aws/
```

Precisa listar `provision.sh`, `smoke-test.sh` e este arquivo.

---

## Passo 2 — Conferir as três ferramentas

```bash
aws --version
docker ps
jq --version
```

O que precisa aparecer:

| Comando | Esperado |
|---|---|
| `aws --version` | começa com `aws-cli/2.` (se for `aws-cli/1.`, atualize) |
| `docker ps` | um cabeçalho de tabela, mesmo sem nenhum container |
| `jq --version` | `jq-1.6` ou mais novo |

Se `docker ps` der `Cannot connect to the Docker daemon`, abra o Docker
Desktop e espere ficar verde.

---

## Passo 3 — Conferir que está na conta AWS certa

```bash
aws sts get-caller-identity
```

Precisa aparecer algo assim:

```json
{
    "UserId": "AIDA...",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/seu-usuario"
}
```

**Confira que o número em `Account` é o da conta do PLUM.** Se estiver na
conta errada, rode `aws configure` e troque as credenciais.

O usuário precisa de permissão de administrador, porque o script cria roles
de IAM. Se não tiver, o script vai parar dizendo `AccessDenied` e o nome da
ação que faltou.

---

## Passo 4 — Baixar a chave da service account do Google

O executor lê as planilhas dos clientes com uma identidade do Google chamada
`reader@plum-ai.iam.gserviceaccount.com`. Ele precisa da chave dela.

1. Abra <https://console.cloud.google.com>
2. No seletor de projeto, no topo, escolha **plum-ai**
3. Menu ☰ → **IAM e administrador** → **Contas de serviço**
4. Clique em `reader@plum-ai.iam.gserviceaccount.com`
5. Aba **Chaves**
6. **Adicionar chave** → **Criar nova chave**
7. Escolha **JSON** → **Criar**

O arquivo baixa sozinho, com um nome tipo `plum-ai-4f2a91b3c8d7.json`.

Criar uma chave nova **não invalida as antigas** e não quebra nada que já
esteja rodando.

**Anote o caminho completo do arquivo.** No Linux ou Mac costuma ser
`~/Downloads/plum-ai-4f2a91b3c8d7.json`.

---

## Passo 5 — Rodar o script

Troque o caminho abaixo pelo do arquivo que você baixou:

```bash
GOOGLE_SA_FILE=~/Downloads/plum-ai-4f2a91b3c8d7.json bash infra/aws/provision.sh
```

Ele demora uns 5 a 10 minutos, quase tudo no build e no envio da imagem
Docker. Vai imprimindo cada etapa:

```
▸ 1/7 Repositório no ECR
  ✓ criado: plum/query-engine
  ✓ política de ciclo de vida aplicada (mantém 10 imagens)

▸ 2/7 Segredos no Parameter Store
  ✓ criado: /plum/prod/hmac-secret (32 bytes aleatórios)
  ✓ criado: /plum/prod/google-sa-json
  ! Apague ~/Downloads/plum-ai-4f2a91b3c8d7.json agora. Ele já está no SSM.
...
```

No fim aparece um bloco com **Function URL** e **Role deploy**. Não feche o
terminal ainda.

**Apague o JSON que você baixou.** Ele já está no SSM, criptografado:

```bash
rm ~/Downloads/plum-ai-4f2a91b3c8d7.json
```

---

## Passo 6 — Conferir que funcionou

```bash
bash infra/aws/smoke-test.sh
```

Precisa aparecer:

```
▸ 1/3 O endpoint recusa quem não tem credencial da AWS?
  ✓ 403 sem assinatura. O endpoint NÃO é público.

▸ 2/3 A função sobe e responde?
  ✓ health respondeu ok

▸ 3/3 Pulado
```

**A primeira checagem é a que mais importa.** Se ela falhar dizendo que
recebeu 200 em vez de 403, o endpoint ficou aberto na internet e a service
account que lê a planilha de **todos** os clientes está exposta. Nesse caso,
pare e corrija antes de qualquer outra coisa:

```bash
aws lambda update-function-url-config \
  --function-name plum-query-engine --auth-type AWS_IAM --region sa-east-1
```

---

## Passo 7 — Produzir os cinco valores

Rode um de cada vez.

**7.1 — A URL do serviço** (não é segredo)

```bash
aws lambda get-function-url-config --function-name plum-query-engine \
  --region sa-east-1 --query FunctionUrl --output text
```

Sai algo como `https://abc123xyz.lambda-url.sa-east-1.on.aws/`.
**Tire a barra do fim** ao usar.

**7.2 — O ARN da role de deploy** (não é segredo)

```bash
aws iam get-role --role-name plum-github-deploy --query Role.Arn --output text
```

**7.3 — A chave da Edge Function** (SEGREDO, aparece uma vez só)

```bash
aws iam create-access-key --user-name plum-edge-invoker
```

Sai um JSON com `AccessKeyId` e `SecretAccessKey`. O `SecretAccessKey` **não
pode ser recuperado depois**. Se perder, apague a chave e crie outra.

**7.4 — O segredo do HMAC** (SEGREDO)

```bash
aws ssm get-parameter --name /plum/prod/hmac-secret --with-decryption \
  --region sa-east-1 --query Parameter.Value --output text
```

---

## Passo 8 — Entregar

Existem dois caminhos. O primeiro é melhor, porque nenhum segredo passa por
aplicativo de mensagem.

### Caminho A — você mesmo configura o Supabase (preferido)

Precisa de acesso ao projeto `rjwidarrsykufuifzunu`.

```bash
npx supabase login
npx supabase link --project-ref rjwidarrsykufuifzunu

npx supabase secrets set \
  PLUM_EXECUTOR_URL=https://abc123xyz.lambda-url.sa-east-1.on.aws \
  PLUM_AWS_REGION=sa-east-1 \
  PLUM_AWS_ACCESS_KEY_ID=<AccessKeyId do passo 7.3> \
  PLUM_AWS_SECRET_ACCESS_KEY=<SecretAccessKey do passo 7.3> \
  PLUM_EXECUTOR_HMAC_SECRET=<valor do passo 7.4>
```

Depois mande para o Ricardo **só o resultado do passo 7.2** (o ARN) e a URL
do 7.1. Nenhum dos dois é segredo.

### Caminho B — o Ricardo configura

Mande o ARN (7.2) e a URL (7.1) por onde quiser, são públicos.

Os dois segredos (7.3 e 7.4) mandem por **gerenciador de senha** ou por um
link de uso único, tipo <https://onetimesecret.com>. **Não mande por
WhatsApp, Telegram nem e-mail**: essa chave dá acesso de leitura à planilha de
todos os clientes do PLUM.

---

## Opcional — ver o primeiro número verdadeiro

Se você tiver uma planilha de teste no Google Sheets:

1. Compartilhe com `reader@plum-ai.iam.gserviceaccount.com` como **Leitor**
2. Copie o ID dela da URL: `docs.google.com/spreadsheets/d/`**`ESTE_PEDACO`**`/edit`
3. Rode:

```bash
export AWS_ACCESS_KEY_ID=<sua chave AWS>
export AWS_SECRET_ACCESS_KEY=<seu segredo AWS>

SHEET_ID=<o ID da planilha> COLUNA=<nome de uma coluna numérica> \
  bash infra/aws/smoke-test.sh
```

Ele soma a coluna e imprime o valor. Some a mesma coluna à mão na planilha:
se bater, o serviço está calculando de verdade.

---

## Se der errado

| O que apareceu | O que é | O que fazer |
|---|---|---|
| `AccessDenied` no passo 5 | seu usuário AWS não é admin | peça permissão de administrador, ou rode com um perfil que tenha |
| `Cannot connect to the Docker daemon` | Docker não está rodando | abra o Docker Desktop e espere ficar verde |
| `exec format error` no log do Lambda | imagem construída em ARM (Mac M1/M2/M3) | o script já passa `--platform linux/amd64`; confira se está na versão mais nova do repo |
| `/plum/prod/google-sa-json NÃO criado` | esqueceu o `GOOGLE_SA_FILE` | rode de novo com a variável; o resto não é refeito |
| smoke test dando 200 no lugar de 403 | endpoint ficou público | rode o comando de correção do passo 6, **é urgente** |
| `Sem acesso a planilha` no teste opcional | planilha não compartilhada | compartilhe com `reader@plum-ai.iam.gserviceaccount.com` como Leitor |
| `nao tem a(s) coluna(s)` | nome da coluna diferente do cabeçalho | confira a primeira linha da planilha, sem espaço extra |

Para ver o que o serviço registrou:

```bash
aws logs tail /aws/lambda/plum-query-engine --region sa-east-1 --since 10m
```

---

## O que este script cria, para registro

| Recurso | Nome | Observação |
|---|---|---|
| ECR | `plum/query-engine` | guarda só as 10 imagens mais recentes |
| SSM SecureString | `/plum/prod/google-sa-json` | chave do Google, criptografada com KMS |
| SSM SecureString | `/plum/prod/hmac-secret` | gerado com `openssl rand`, nunca impresso |
| IAM role | `plum-query-engine-exec` | lê **apenas** esses dois parâmetros |
| Lambda | `plum-query-engine` | 30s de timeout, 1024 MB, imagem de container |
| Function URL | — | auth `AWS_IAM`, ou seja, **não é público** |
| OIDC provider | `token.actions.githubusercontent.com` | o GitHub deploya sem chave permanente |
| IAM role | `plum-github-deploy` | restrita a este repo e à branch `plataforma` |
| IAM user | `plum-edge-invoker` | só pode `InvokeFunctionUrl` nessa função |

Nenhum segredo entra na imagem Docker nem no repositório. O JSON do Google e
o segredo do HMAC ficam no SSM e são lidos pelo Lambda em tempo de execução,
com a role de execução dele.

Custo esperado: alguns centavos por mês no volume atual. O Lambda escala a
zero e o Parameter Store no tier padrão não cobra por parâmetro.
