#!/usr/bin/env bash
# =============================================================================
# Provisionamento da infraestrutura AWS do executor do PLUM
# =============================================================================
# Idempotente: rode quantas vezes quiser. Cada passo verifica se o recurso já
# existe antes de criar.
#
# O que este script cria:
#   1. Repositório no ECR para a imagem do executor
#   2. Dois parâmetros no SSM (SecureString): service account do Google e
#      segredo do HMAC
#   3. Role de execução do Lambda (com permissão mínima de ler esses dois)
#   4. A função Lambda a partir da imagem
#   5. Function URL com auth AWS_IAM (o endpoint NÃO fica público)
#   6. Provedor OIDC do GitHub + role de deploy (sem chave de longa duração)
#   7. Usuário IAM que a Edge Function usa para assinar SigV4
#
# O QUE ESTE SCRIPT NUNCA FAZ: escrever segredo em arquivo do repositório.
# O JSON da service account é lido de um caminho que você informa, enviado
# direto para o SSM, e o script não o copia para lugar nenhum.
#
# Pré-requisitos: aws cli v2 autenticado com permissão de admin, docker, jq.
# =============================================================================

set -euo pipefail

# ── Parâmetros ───────────────────────────────────────────────────────────────
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
#   GOOGLE_SA_FILE=~/Downloads/plum-ai-xxxx.json ./provision.sh
GOOGLE_SA_FILE="${GOOGLE_SA_FILE:-}"

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

log() { printf '\n\033[1;35m▸ %s\033[0m\n' "$*"; }
ok()  { printf '  \033[0;32m✓\033[0m %s\n' "$*"; }

CONTA="$(aws sts get-caller-identity --query Account --output text)"
ECR_HOST="${CONTA}.dkr.ecr.${REGIAO}.amazonaws.com"

log "Conta ${CONTA} · região ${REGIAO}"

# ── 1. ECR ───────────────────────────────────────────────────────────────────
log "1/7 Repositório no ECR"
if aws ecr describe-repositories --repository-names "$REPO_ECR" --region "$REGIAO" >/dev/null 2>&1; then
  ok "já existe: $REPO_ECR"
else
  aws ecr create-repository \
    --repository-name "$REPO_ECR" \
    --image-scanning-configuration scanOnPush=true \
    --region "$REGIAO" >/dev/null
  ok "criado: $REPO_ECR"
fi

# Mantém só as 10 imagens mais recentes: sem isso o ECR acumula custo para
# sempre, uma imagem por commit.
aws ecr put-lifecycle-policy --repository-name "$REPO_ECR" --region "$REGIAO" \
  --lifecycle-policy-text '{"rules":[{"rulePriority":1,"description":"manter 10","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":10},"action":{"type":"expire"}}]}' \
  >/dev/null
ok "política de ciclo de vida aplicada (mantém 10 imagens)"

# ── 2. Segredos no SSM ───────────────────────────────────────────────────────
log "2/7 Segredos no Parameter Store"

if aws ssm get-parameter --name "$PARAM_HMAC" --region "$REGIAO" >/dev/null 2>&1; then
  ok "já existe: $PARAM_HMAC"
else
  # Gerado aqui e nunca impresso na tela nem gravado em arquivo.
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
  printf '  \033[1;33m!\033[0m Apague %s agora. Ele já está no SSM.\n' "$GOOGLE_SA_FILE"
else
  printf '  \033[1;33m!\033[0m %s NÃO criado. Rode de novo com:\n' "$PARAM_GOOGLE"
  printf '      GOOGLE_SA_FILE=/caminho/para/service-account.json %s\n' "$0"
fi

# ── 3. Role de execução do Lambda ────────────────────────────────────────────
log "3/7 Role de execução do Lambda"
if aws iam get-role --role-name "$ROLE_EXEC" >/dev/null 2>&1; then
  ok "já existe: $ROLE_EXEC"
else
  aws iam create-role --role-name "$ROLE_EXEC" --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]
  }' >/dev/null
  ok "criada: $ROLE_EXEC"
fi

aws iam attach-role-policy --role-name "$ROLE_EXEC" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null
ok "log no CloudWatch liberado"

# Permissão mínima: ler EXATAMENTE os dois parâmetros, nada mais. Se esta role
# vazar, ela não abre o resto da conta.
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

# ── 4. Imagem e função ───────────────────────────────────────────────────────
log "4/7 Build, push e função Lambda"
aws ecr get-login-password --region "$REGIAO" | docker login --username AWS --password-stdin "$ECR_HOST" >/dev/null
IMAGEM="${ECR_HOST}/${REPO_ECR}:bootstrap"
# --platform explícito: o Lambda roda x86_64 por padrão. Sem isto, quem buildar
# num Mac com chip Apple publica uma imagem arm64 e a função sobe e morre com
# "exec format error", que não diz nada sobre o que aconteceu.
docker build --platform linux/amd64 -t "$IMAGEM" "${RAIZ}/query_engine"
docker push "$IMAGEM" >/dev/null
ok "imagem publicada"

ROLE_EXEC_ARN="$(aws iam get-role --role-name "$ROLE_EXEC" --query Role.Arn --output text)"

if aws lambda get-function --function-name "$FUNCAO" --region "$REGIAO" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FUNCAO" \
    --image-uri "$IMAGEM" --region "$REGIAO" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCAO" --region "$REGIAO"
  ok "função atualizada"
else
  # A role recém-criada leva alguns segundos para propagar no IAM.
  sleep 10
  aws lambda create-function --function-name "$FUNCAO" \
    --package-type Image --code "ImageUri=${IMAGEM}" \
    --role "$ROLE_EXEC_ARN" \
    --timeout 30 --memory-size 1024 \
    --region "$REGIAO" >/dev/null
  aws lambda wait function-active --function-name "$FUNCAO" --region "$REGIAO"
  ok "função criada (30s de timeout, 1024 MB)"
fi

# As variáveis guardam o CAMINHO do parâmetro, nunca o valor.
aws lambda update-function-configuration --function-name "$FUNCAO" --region "$REGIAO" \
  --environment "Variables={GOOGLE_SA_PARAM=${PARAM_GOOGLE},HMAC_SECRET_PARAM=${PARAM_HMAC},PLUM_K_MIN=5,PLUM_MAX_ROWS=200000,LOG_LEVEL=INFO}" \
  >/dev/null
aws lambda wait function-updated --function-name "$FUNCAO" --region "$REGIAO"
ok "variáveis de ambiente definidas (caminhos, não valores)"

# ── 5. Function URL com IAM ──────────────────────────────────────────────────
log "5/7 Function URL"
if aws lambda get-function-url-config --function-name "$FUNCAO" --region "$REGIAO" >/dev/null 2>&1; then
  aws lambda update-function-url-config --function-name "$FUNCAO" \
    --auth-type AWS_IAM --region "$REGIAO" >/dev/null
  ok "já existia, auth reafirmada como AWS_IAM"
else
  aws lambda create-function-url-config --function-name "$FUNCAO" \
    --auth-type AWS_IAM --region "$REGIAO" >/dev/null
  ok "criada com auth AWS_IAM"
fi
URL_FUNCAO="$(aws lambda get-function-url-config --function-name "$FUNCAO" --region "$REGIAO" --query FunctionUrl --output text)"

# ── 6. OIDC do GitHub ────────────────────────────────────────────────────────
log "6/7 Deploy pelo GitHub sem chave de longa duração"
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

# A política de confiança aceita SÓ este repositório e SÓ esta branch. Sem o
# `sub`, qualquer repositório do GitHub poderia assumir a role.
aws iam create-role --role-name "$ROLE_DEPLOY" --assume-role-policy-document "{
  \"Version\":\"2012-10-17\",
  \"Statement\":[{
    \"Effect\":\"Allow\",
    \"Principal\":{\"Federated\":\"${OIDC_ARN}\"},
    \"Action\":\"sts:AssumeRoleWithWebIdentity\",
    \"Condition\":{
      \"StringEquals\":{\"token.actions.githubusercontent.com:aud\":\"sts.amazonaws.com\"},
      \"StringLike\":{\"token.actions.githubusercontent.com:sub\":\"repo:${GITHUB_REPO}:ref:refs/heads/${GITHUB_BRANCH}\"}
    }}]}" >/dev/null 2>&1 || ok "role de deploy já existia"

aws iam put-role-policy --role-name "$ROLE_DEPLOY" --policy-name "publicar-executor" \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[
      {\"Effect\":\"Allow\",\"Action\":[\"ecr:GetAuthorizationToken\"],\"Resource\":\"*\"},
      {\"Effect\":\"Allow\",\"Action\":[\"ecr:BatchCheckLayerAvailability\",\"ecr:CompleteLayerUpload\",\"ecr:InitiateLayerUpload\",\"ecr:PutImage\",\"ecr:UploadLayerPart\"],
       \"Resource\":\"arn:aws:ecr:${REGIAO}:${CONTA}:repository/${REPO_ECR}\"},
      {\"Effect\":\"Allow\",\"Action\":[\"lambda:UpdateFunctionCode\",\"lambda:GetFunction\",\"lambda:InvokeFunction\"],
       \"Resource\":\"arn:aws:lambda:${REGIAO}:${CONTA}:function:${FUNCAO}\"}
    ]}" >/dev/null
ok "role de deploy limitada a este repositório e a esta função"
ROLE_DEPLOY_ARN="$(aws iam get-role --role-name "$ROLE_DEPLOY" --query Role.Arn --output text)"

# ── 7. Credencial da Edge Function ───────────────────────────────────────────
log "7/7 Credencial que a Edge Function usa para assinar SigV4"
if aws iam get-user --user-name "$USUARIO_EDGE" >/dev/null 2>&1; then
  ok "usuário já existe: $USUARIO_EDGE"
else
  aws iam create-user --user-name "$USUARIO_EDGE" >/dev/null
  ok "usuário criado: $USUARIO_EDGE"
fi

# A ÚNICA coisa que ele pode fazer na conta inteira é invocar esta função.
aws iam put-user-policy --user-name "$USUARIO_EDGE" --policy-name "invocar-executor" \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"lambda:InvokeFunctionUrl\",
      \"Resource\":\"arn:aws:lambda:${REGIAO}:${CONTA}:function:${FUNCAO}\",
      \"Condition\":{\"StringEquals\":{\"lambda:FunctionUrlAuthType\":\"AWS_IAM\"}}}]}" >/dev/null
ok "permissão restrita a invocar apenas esta função"

# ── Resumo ───────────────────────────────────────────────────────────────────
cat <<FIM

═══════════════════════════════════════════════════════════════════════════
  PROVISIONADO
═══════════════════════════════════════════════════════════════════════════

  Function URL : ${URL_FUNCAO}
  Role deploy  : ${ROLE_DEPLOY_ARN}

  FALTAM DOIS PASSOS MANUAIS:

  1. No GitHub, em Settings > Secrets and variables > Actions, crie:
        AWS_DEPLOY_ROLE_ARN = ${ROLE_DEPLOY_ARN}
     Isto é um ARN, não uma credencial. Nada secreto vive no GitHub.

  2. Gere a chave de acesso do usuário da Edge Function e registre no
     Supabase. A chave aparece UMA vez; não a copie para arquivo nenhum:

        aws iam create-access-key --user-name ${USUARIO_EDGE}

        supabase secrets set \\
          PLUM_EXECUTOR_URL=${URL_FUNCAO%/} \\
          PLUM_AWS_REGION=${REGIAO} \\
          PLUM_AWS_ACCESS_KEY_ID=<AccessKeyId da saída acima> \\
          PLUM_AWS_SECRET_ACCESS_KEY=<SecretAccessKey da saída acima> \\
          PLUM_EXECUTOR_HMAC_SECRET=\$(aws ssm get-parameter \\
              --name ${PARAM_HMAC} --with-decryption \\
              --region ${REGIAO} --query Parameter.Value --output text)

  CONFERIR QUE O ENDPOINT NÃO ESTÁ PÚBLICO (deve responder 403):

        curl -s -o /dev/null -w '%{http_code}\\n' ${URL_FUNCAO%/}/health

  CONFERIR QUE ELE RESPONDE COM ASSINATURA (deve devolver status ok):

        aws lambda invoke --function-name ${FUNCAO} --region ${REGIAO} \\
          --payload '{"version":"2.0","rawPath":"/health","requestContext":{"http":{"method":"GET","path":"/health"}},"headers":{}}' \\
          --cli-binary-format raw-in-base64-out /tmp/r.json && cat /tmp/r.json

═══════════════════════════════════════════════════════════════════════════
FIM
