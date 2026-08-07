#!/usr/bin/env bash
# =============================================================================
# Imprime os comandos prontos para configurar os segredos do Supabase
# =============================================================================
# Rode DEPOIS que o GitHub Actions terminar em verde.
#
# Ele junta os cinco valores que a Edge Function precisa e monta o comando
# `supabase secrets set` já preenchido, para você copiar e colar.
#
# ATENÇÃO: a saída contém segredos. Não cole num chat, não tire print, não
# mande por WhatsApp. É só copiar, colar no terminal, e limpar a tela.
# =============================================================================

set -euo pipefail

REGIAO="${PLUM_AWS_REGION:-sa-east-1}"
FUNCAO="${PLUM_LAMBDA_NAME:-plum-query-engine}"
USUARIO_EDGE="plum-edge-invoker"
PARAM_HMAC="/plum/prod/hmac-secret"
PROJETO_SUPABASE="${PLUM_SUPABASE_REF:-rjwidarrsykufuifzunu}"

vermelho() { printf '\033[0;31m%s\033[0m\n' "$*"; }
ok()       { printf '  \033[0;32m✓\033[0m %s\n' "$*"; }

# ── A função existe? ─────────────────────────────────────────────────────────
if ! aws lambda get-function --function-name "$FUNCAO" --region "$REGIAO" >/dev/null 2>&1; then
  vermelho "A função ${FUNCAO} ainda não existe."
  echo
  echo "Isso quer dizer que o GitHub Actions ainda não rodou, ou falhou."
  echo "Abra as execuções e veja:"
  echo "  https://github.com/plum-polijunior/plataforma_plum/actions"
  exit 1
fi
ok "função ${FUNCAO} existe"

# ── O endpoint está fechado? ─────────────────────────────────────────────────
AUTH="$(aws lambda get-function-url-config --function-name "$FUNCAO" --region "$REGIAO" \
        --query AuthType --output text 2>/dev/null || echo 'SEM_URL')"

if [ "$AUTH" = "SEM_URL" ]; then
  vermelho "A função existe mas não tem Function URL. Rode o workflow de novo."
  exit 1
fi

if [ "$AUTH" != "AWS_IAM" ]; then
  vermelho "PERIGO: o endpoint está com AuthType=${AUTH}, ou seja, PÚBLICO."
  echo
  echo "Qualquer pessoa que descubra a URL lê a planilha de todos os clientes."
  echo "Corrija AGORA:"
  echo
  echo "  aws lambda update-function-url-config --function-name ${FUNCAO} \\"
  echo "    --auth-type AWS_IAM --region ${REGIAO}"
  exit 1
fi
ok "endpoint fechado por IAM (AuthType=AWS_IAM)"

URL="$(aws lambda get-function-url-config --function-name "$FUNCAO" --region "$REGIAO" \
       --query FunctionUrl --output text)"
URL="${URL%/}"

# ── Chave da Edge Function ───────────────────────────────────────────────────
# Se já existe uma chave, o AWS não deixa recuperar o segredo dela. Nesse caso
# apagamos e criamos outra: é seguro, porque a chave antiga só serve para este
# mesmo fim e vai ser substituída no Supabase agora.
EXISTENTES="$(aws iam list-access-keys --user-name "$USUARIO_EDGE" \
              --query 'AccessKeyMetadata[].AccessKeyId' --output text 2>/dev/null || echo '')"

if [ -n "$EXISTENTES" ]; then
  for k in $EXISTENTES; do
    aws iam delete-access-key --user-name "$USUARIO_EDGE" --access-key-id "$k" >/dev/null
  done
  ok "chave anterior removida (o segredo dela não era recuperável)"
fi

NOVA="$(aws iam create-access-key --user-name "$USUARIO_EDGE")"
KEY_ID="$(echo "$NOVA"    | jq -r .AccessKey.AccessKeyId)"
KEY_SECRET="$(echo "$NOVA" | jq -r .AccessKey.SecretAccessKey)"
ok "chave nova gerada para ${USUARIO_EDGE}"

HMAC="$(aws ssm get-parameter --name "$PARAM_HMAC" --with-decryption \
        --region "$REGIAO" --query Parameter.Value --output text)"
ok "segredo do HMAC lido do SSM"

# ── Saída ────────────────────────────────────────────────────────────────────
cat <<FIM

═══════════════════════════════════════════════════════════════════════════
  COPIE E COLE ISTO NO TERMINAL DO VS CODE
═══════════════════════════════════════════════════════════════════════════

npx supabase secrets set PLUM_EXECUTOR_URL="${URL}"
npx supabase secrets set PLUM_AWS_REGION="${REGIAO}"
npx supabase secrets set PLUM_AWS_ACCESS_KEY_ID="${KEY_ID}"
npx supabase secrets set PLUM_AWS_SECRET_ACCESS_KEY="${KEY_SECRET}"
npx supabase secrets set PLUM_EXECUTOR_HMAC_SECRET="${HMAC}"

═══════════════════════════════════════════════════════════════════════════

  Depois disso:

      npx supabase functions deploy dashboard-execute

  E limpe a tela, porque o que está acima é segredo:

      clear

═══════════════════════════════════════════════════════════════════════════
FIM
