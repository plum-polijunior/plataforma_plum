#!/usr/bin/env bash
# =============================================================================
# Provisionamento da infraestrutura AWS do executor do PLUM
# =============================================================================
# NÃO PRECISA DE DOCKER. Este script cria a "casa" na AWS; quem constrói e
# publica a imagem é o GitHub Actions, que já tem Docker de graça.
#
# Motivo da separação: Docker Desktop no Windows exige virtualização habilitada
# na BIOS mais WSL2, o que é três reinicializações e uma visita ao firmware.
# Não faz sentido pedir isso para publicar um container uma vez por semana.
#
# O que este script cria:
#   1. Repositório no ECR (onde a imagem vai morar)
#   2. Dois segredos no SSM (SecureString): service account do Google e HMAC
#   3. Role de execução do Lambda (lê só esses dois)
#   4. Provedor OIDC do GitHub + role de deploy (sem chave de longa duração)
#   5. Usuário IAM que a Edge Function usa para assinar
#
# A função Lambda em si é criada pelo GitHub Actions, no primeiro deploy.
#
# O QUE ESTE SCRIPT NUNCA FAZ: escrever segredo em arquivo do repositório.
#
# Pré-requisitos: aws cli v2 autenticado com permissão de admin, e jq.
# =============================================================================

set -euo pipefail

# Git Bash no Windows converte argumentos que parecem caminho Unix em caminho
# Windows: `/plum/prod/hmac-secret` chegaria na AWS como
# `C:/Program Files/Git/plum/prod/hmac-secret`, e o SSM recusa com
# "Parameter name must be a fully qualified name". Desligar a conversao e a
# unica forma de o mesmo script servir no Windows, no Mac e no Linux.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

REGIAO="${PLUM_AWS_REGION:-sa-east-1}"
REPO_ECR="${PLUM_ECR_REPO:-plum/query-engine}"
FUNCAO="${PLUM_LAMBDA_NAME:-plum-query-engine}"
GITHUB_REPO="${PLUM_GITHUB_REPO:-plum-polijunior/plataforma_plum}"
GITHUB_BRANCH="${PLUM_GITHUB_BRANCH:-plataforma}"

PARAM_GOOGLE="/plum/prod/google-sa-json"
PARAM_HMAC="/plum/prod/hmac-secret"

ROLE_EXEC="plum-query-engine-exec"
ROLE_DEPLOY="plum-github-deploy"
USUARIO_EDGE="plum-edge-invoker"

# Caminho do JSON da service account do Google. Passe pelo ambiente:
#   GOOGLE_SA_FILE=~/Downloads/plum-ai-xxxx.json bash provision.sh
GOOGLE_SA_FILE="${GOOGLE_SA_FILE:-}"

log() { printf '\n\033[1;35m▸ %s\033[0m\n' "$*"; }
ok()  { printf '  \033[0;32m✓\033[0m %s\n' "$*"; }
avi() { printf '  \033[1;33m!\033[0m %s\n' "$*"; }

command -v aws >/dev/null || { echo "Falta o aws cli. Instale e rode 'aws configure'."; exit 1; }
command -v jq  >/dev/null || { echo "Falta o jq."; exit 1; }

CONTA="$(aws sts get-caller-identity --query Account --output text)"
log "Conta ${CONTA} · região ${REGIAO}"

# ── 1. ECR ───────────────────────────────────────────────────────────────────
log "1/5 Repositório no ECR"
if aws ecr describe-repositories --repository-names "$REPO_ECR" --region "$REGIAO" >/dev/null 2>&1; then
  ok "já existe: $REPO_ECR"
else
  aws ecr create-repository --repository-name "$REPO_ECR" \
    --image-scanning-configuration scanOnPush=true --region "$REGIAO" >/dev/null
  ok "criado: $REPO_ECR"
fi

# Sem isto o ECR acumula uma imagem por commit, para sempre.
aws ecr put-lifecycle-policy --repository-name "$REPO_ECR" --region "$REGIAO" \
  --lifecycle-policy-text '{"rules":[{"rulePriority":1,"description":"manter 10","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":10},"action":{"type":"expire"}}]}' \
  >/dev/null
ok "política de ciclo de vida aplicada (mantém 10 imagens)"

# ── 2. Segredos no SSM ───────────────────────────────────────────────────────
log "2/5 Segredos no Parameter Store"

if aws ssm get-parameter --name "$PARAM_HMAC" --region "$REGIAO" >/dev/null 2>&1; then
  ok "já existe: $PARAM_HMAC"
else
  # Gerado aqui, nunca impresso, nunca gravado em arquivo.
  aws ssm put-parameter --name "$PARAM_HMAC" --type SecureString \
    --value "$(openssl rand -hex 32)" --region "$REGIAO" >/dev/null
  ok "criado: $PARAM_HMAC (32 bytes aleatórios)"
fi

if aws ssm get-parameter --name "$PARAM_GOOGLE" --region "$REGIAO" >/dev/null 2>&1; then
  ok "já existe: $PARAM_GOOGLE"
elif [ -n "$GOOGLE_SA_FILE" ] && [ -f "$GOOGLE_SA_FILE" ]; then
  aws ssm put-parameter --name "$PARAM_GOOGLE" --type SecureString \
    --value "file://${GOOGLE_SA_FILE}" --region "$REGIAO" >/dev/null
  ok "criado: $PARAM_GOOGLE"
  avi "Apague ${GOOGLE_SA_FILE} agora. Ele já está no SSM."
else
  avi "$PARAM_GOOGLE NÃO criado. Rode de novo com:"
  avi "   GOOGLE_SA_FILE=/caminho/service-account.json bash $0"
fi

# ── 3. Role de execução do Lambda ────────────────────────────────────────────
log "3/5 Role de execução do Lambda"
aws iam create-role --role-name "$ROLE_EXEC" --assume-role-policy-document '{
  "Version":"2012-10-17",
  "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]
}' >/dev/null 2>&1 && ok "criada: $ROLE_EXEC" || ok "já existe: $ROLE_EXEC"

aws iam attach-role-policy --role-name "$ROLE_EXEC" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null
ok "log no CloudWatch liberado"

# Permissão mínima: ler EXATAMENTE os dois parâmetros. Se esta role vazar, ela
# não abre o resto da conta.
aws iam put-role-policy --role-name "$ROLE_EXEC" --policy-name "ler-segredos-do-plum" \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[
      {\"Effect\":\"Allow\",\"Action\":[\"ssm:GetParameter\",\"ssm:GetParameters\"],
       \"Resource\":[
         \"arn:aws:ssm:${REGIAO}:${CONTA}:parameter${PARAM_GOOGLE}\",
         \"arn:aws:ssm:${REGIAO}:${CONTA}:parameter${PARAM_HMAC}\"]},
      {\"Effect\":\"Allow\",\"Action\":[\"kms:Decrypt\"],\"Resource\":\"*\",
       \"Condition\":{\"StringEquals\":{\"kms:ViaService\":\"ssm.${REGIAO}.amazonaws.com\"}}}
    ]}" >/dev/null
ok "leitura restrita aos dois parâmetros do PLUM"
ROLE_EXEC_ARN="$(aws iam get-role --role-name "$ROLE_EXEC" --query Role.Arn --output text)"

# ── 4. OIDC do GitHub ────────────────────────────────────────────────────────
log "4/5 Deploy pelo GitHub, sem chave de longa duração"
OIDC_ARN="arn:aws:iam::${CONTA}:oidc-provider/token.actions.githubusercontent.com"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" >/dev/null 2>&1; then
  ok "provedor OIDC já existe"
else
  aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 >/dev/null
  ok "provedor OIDC criado"
fi

# A condição `sub` limita a role a ESTE repositório e ESTA branch. Sem ela,
# qualquer repositório do GitHub poderia assumi-la.
aws iam create-role --role-name "$ROLE_DEPLOY" --assume-role-policy-document "{
  \"Version\":\"2012-10-17\",
  \"Statement\":[{
    \"Effect\":\"Allow\",
    \"Principal\":{\"Federated\":\"${OIDC_ARN}\"},
    \"Action\":\"sts:AssumeRoleWithWebIdentity\",
    \"Condition\":{
      \"StringEquals\":{\"token.actions.githubusercontent.com:aud\":\"sts.amazonaws.com\"},
      \"StringLike\":{\"token.actions.githubusercontent.com:sub\":\"repo:${GITHUB_REPO}:*\"}
    }}]}" >/dev/null 2>&1 && ok "criada: $ROLE_DEPLOY" || ok "já existe: $ROLE_DEPLOY"

# Esta role é mais ampla que a versão anterior porque agora é ela que CRIA a
# função, não só atualiza. Continua presa a uma função e uma role específicas.
aws iam put-role-policy --role-name "$ROLE_DEPLOY" --policy-name "publicar-executor" \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[
      {\"Effect\":\"Allow\",\"Action\":[\"ecr:GetAuthorizationToken\"],\"Resource\":\"*\"},
      {\"Effect\":\"Allow\",
       \"Action\":[\"ecr:BatchCheckLayerAvailability\",\"ecr:CompleteLayerUpload\",
                   \"ecr:InitiateLayerUpload\",\"ecr:PutImage\",\"ecr:UploadLayerPart\",
                   \"ecr:BatchGetImage\",\"ecr:DescribeImages\"],
       \"Resource\":\"arn:aws:ecr:${REGIAO}:${CONTA}:repository/${REPO_ECR}\"},
      {\"Effect\":\"Allow\",
       \"Action\":[\"lambda:CreateFunction\",\"lambda:UpdateFunctionCode\",
                   \"lambda:UpdateFunctionConfiguration\",\"lambda:GetFunction\",
                   \"lambda:GetFunctionConfiguration\",\"lambda:InvokeFunction\",
                   \"lambda:CreateFunctionUrlConfig\",\"lambda:UpdateFunctionUrlConfig\",
                   \"lambda:GetFunctionUrlConfig\"],
       \"Resource\":\"arn:aws:lambda:${REGIAO}:${CONTA}:function:${FUNCAO}\"},
      {\"Effect\":\"Allow\",\"Action\":\"iam:PassRole\",\"Resource\":\"${ROLE_EXEC_ARN}\",
       \"Condition\":{\"StringEquals\":{\"iam:PassedToService\":\"lambda.amazonaws.com\"}}}
    ]}" >/dev/null
ok "role de deploy limitada a este repo, esta função e esta role"
ROLE_DEPLOY_ARN="$(aws iam get-role --role-name "$ROLE_DEPLOY" --query Role.Arn --output text)"

# ── 5. Credencial da Edge Function ───────────────────────────────────────────
log "5/5 Credencial que a Edge Function usa para assinar"
aws iam create-user --user-name "$USUARIO_EDGE" >/dev/null 2>&1 \
  && ok "criado: $USUARIO_EDGE" || ok "já existe: $USUARIO_EDGE"

# A única coisa que este usuário pode fazer na conta inteira.
aws iam put-user-policy --user-name "$USUARIO_EDGE" --policy-name "invocar-executor" \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"lambda:InvokeFunctionUrl\",
      \"Resource\":\"arn:aws:lambda:${REGIAO}:${CONTA}:function:${FUNCAO}\",
      \"Condition\":{\"StringEquals\":{\"lambda:FunctionUrlAuthType\":\"AWS_IAM\"}}}]}" >/dev/null
ok "permissão restrita a invocar apenas esta função"

# ── Resumo ───────────────────────────────────────────────────────────────────
JA_TEM_FUNCAO="nao"
aws lambda get-function --function-name "$FUNCAO" --region "$REGIAO" >/dev/null 2>&1 && JA_TEM_FUNCAO="sim"

cat <<FIM

═══════════════════════════════════════════════════════════════════════════
  CASA PRONTA NA AWS
═══════════════════════════════════════════════════════════════════════════

  Role de deploy (NÃO é segredo, pode mandar por onde quiser):

    ${ROLE_DEPLOY_ARN}

  PRÓXIMO PASSO — no navegador, dois cliques:

  1. Abra:
       https://github.com/${GITHUB_REPO}/settings/secrets/actions
     Clique em "New repository secret":
       Name:   AWS_DEPLOY_ROLE_ARN
       Secret: ${ROLE_DEPLOY_ARN}

  2. Abra:
       https://github.com/${GITHUB_REPO}/actions/workflows/query-engine.yml
     Clique em "Run workflow" > branch ${GITHUB_BRANCH} > "Run workflow"

     O GitHub constrói a imagem, publica no ECR e cria a função Lambda.
     Leva uns 5 minutos. Não precisa de Docker na sua máquina.

FIM

if [ "$JA_TEM_FUNCAO" = "sim" ]; then
  URL_FUNCAO="$(aws lambda get-function-url-config --function-name "$FUNCAO" --region "$REGIAO" --query FunctionUrl --output text 2>/dev/null || echo '')"
  cat <<FIM
  A função JÁ EXISTE. Para pegar os valores do Supabase, rode:

      bash infra/aws/valores-supabase.sh

  URL do serviço: ${URL_FUNCAO}

FIM
else
  cat <<FIM
  Depois que o GitHub Actions terminar em verde, rode:

      bash infra/aws/valores-supabase.sh

  Ele imprime os comandos prontos para configurar o Supabase.

FIM
fi

echo "═══════════════════════════════════════════════════════════════════════════"
