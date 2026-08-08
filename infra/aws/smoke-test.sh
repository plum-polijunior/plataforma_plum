#!/usr/bin/env bash
# =============================================================================
# Teste de fumaça do executor, contra a AWS de verdade
# =============================================================================
# Rode logo depois de provision.sh. Ele responde a três perguntas, nessa ordem:
#
#   1. O endpoint está mesmo fechado? (precisa dar 403 sem credencial)
#   2. A função sobe e responde? (health)
#   3. Ela lê uma planilha real e devolve um número certo? (opcional)
#
# A pergunta 3 é a que importa: é o primeiro momento em que o PLUM calcula um
# número verdadeiro. Para rodá-la, informe uma planilha e uma coluna:
#
#   SHEET_ID=1AbC... COLUNA=faturamento bash infra/aws/smoke-test.sh
#
# A planilha precisa estar compartilhada com plum-polijunior@plataforma-plum.iam.gserviceaccount.com
# como Leitor, e ter cabeçalho na primeira linha.
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
FUNCAO="${PLUM_LAMBDA_NAME:-plum-query-engine}"
PARAM_HMAC="/plum/prod/hmac-secret"

SHEET_ID="${SHEET_ID:-}"
COLUNA="${COLUNA:-}"
ABA="${ABA:-Sheet1}"

ok()   { printf '  \033[0;32m✓\033[0m %s\n' "$*"; }
bad()  { printf '  \033[0;31m✗\033[0m %s\n' "$*"; }
log()  { printf '\n\033[1;35m▸ %s\033[0m\n' "$*"; }

URL="$(aws lambda get-function-url-config --function-name "$FUNCAO" \
        --region "$REGIAO" --query FunctionUrl --output text)"
URL="${URL%/}"

# ── 1. O endpoint está fechado? ──────────────────────────────────────────────
log "1/3 O endpoint recusa quem não tem credencial da AWS?"
# O `|| echo` NAO pode ficar dentro da substituicao: se o curl escreve "403" na
# saida e ainda assim retorna codigo diferente de zero, as duas saidas sao
# concatenadas e o valor vira "403000". Tratar a falha FORA da substituicao.
CODIGO="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${URL}/health" 2>/dev/null)" \
  || CODIGO="${CODIGO:-000}"
CODIGO="${CODIGO//[^0-9]/}"   # tira qualquer sujeira de terminal
if [ "$CODIGO" = "403" ]; then
  ok "403 sem assinatura. O endpoint NÃO é público."
else
  bad "esperava 403 e recebi ${CODIGO}."
  bad "Confira: aws lambda get-function-url-config --function-name ${FUNCAO} --region ${REGIAO}"
  bad "O campo AuthType TEM que ser AWS_IAM. Se estiver NONE, qualquer pessoa"
  bad "que descobrir esta URL lê a planilha de todos os clientes."
  exit 1
fi

# ── 2. A função responde? ────────────────────────────────────────────────────
log "2/3 A função sobe e responde?"

# Caminho RELATIVO de proposito. Com MSYS_NO_PATHCONV ligado (necessario para o
# SSM), um `/tmp/arquivo.json` chega literal para o aws.exe do Windows, que nao
# tem /tmp e falha. Caminho relativo funciona no Windows, no Mac e no Linux.
SAIDA="plum-health-$$.json"
trap 'rm -f "$SAIDA"' EXIT

aws lambda invoke --function-name "$FUNCAO" --region "$REGIAO" \
  --payload '{"version":"2.0","routeKey":"$default","rawPath":"/health","rawQueryString":"","headers":{"host":"smoke.local"},"requestContext":{"accountId":"anonymous","apiId":"smoke","domainName":"smoke.local","domainPrefix":"smoke","http":{"method":"GET","path":"/health","protocol":"HTTP/1.1","sourceIp":"127.0.0.1","userAgent":"plum-smoke-test"},"requestId":"smoke","routeKey":"$default","stage":"$default","time":"01/Jan/2026:00:00:00 +0000","timeEpoch":1767225600},"isBase64Encoded":false}' \
  --cli-binary-format raw-in-base64-out "$SAIDA" >/dev/null

if jq -e '.body | fromjson | .status == "ok"' "$SAIDA" >/dev/null 2>&1; then
  ok "health respondeu ok"
else
  bad "health não respondeu como esperado. Resposta crua:"
  cat "$SAIDA" 2>/dev/null || echo "(o arquivo de resposta nem foi criado)"
  echo
  bad "Veja o log: aws logs tail /aws/lambda/${FUNCAO} --region ${REGIAO} --since 5m"
  exit 1
fi

# ── 3. Um número verdadeiro ──────────────────────────────────────────────────
if [ -z "$SHEET_ID" ] || [ -z "$COLUNA" ]; then
  log "3/3 Pulado"
  printf '  Para o teste que importa, rode de novo com:\n'
  printf '    SHEET_ID=<id da planilha> COLUNA=<coluna numerica> bash %s\n' "$0"
  exit 0
fi

log "3/3 Somando '${COLUNA}' da planilha real"

SEGREDO="$(aws ssm get-parameter --name "$PARAM_HMAC" --with-decryption \
            --region "$REGIAO" --query Parameter.Value --output text)"

CORPO="$(jq -nc \
  --arg sheet "$SHEET_ID" --arg aba "$ABA" --arg col "$COLUNA" \
  --argjson ts "$(date +%s)" '
  {
    sheet_id: $sheet,
    tab: $aba,
    plans: [{
      card_id: "smoke-test",
      plan: { select: [ { expr: { agg: "sum", col: $col }, as: "total" } ] },
      resolved_columns: [$col]
    }],
    allowed_columns: [$col],
    column_roles: {},
    issued_at: $ts
  }')"

ASSINATURA="$(printf '%s' "$CORPO" | openssl dgst -sha256 -hmac "$SEGREDO" | awk '{print $NF}')"

RESPOSTA="$(curl -s -X POST "${URL}/execute" \
  --aws-sigv4 "aws:amz:${REGIAO}:lambda" \
  --user "${AWS_ACCESS_KEY_ID:-}:${AWS_SECRET_ACCESS_KEY:-}" \
  -H "Content-Type: application/json" \
  -H "X-Plum-Signature: ${ASSINATURA}" \
  -d "$CORPO")"

echo "$RESPOSTA" | jq . 2>/dev/null || echo "$RESPOSTA"

if echo "$RESPOSTA" | jq -e '.results[0].status == "ok"' >/dev/null 2>&1; then
  VALOR="$(echo "$RESPOSTA" | jq -r '.results[0].rows[0].total')"
  printf '\n'
  ok "O executor devolveu: ${VALOR}"
  printf '\n  \033[1;33mAgora abra a planilha e some a coluna %s à mão.\033[0m\n' "$COLUNA"
  printf '  Se os dois números baterem, o PLUM calculou um número verdadeiro\n'
  printf '  pela primeira vez, e a Fase 0 acabou de verdade.\n\n'
else
  bad "o executor recusou ou falhou. Diagnóstico pela mensagem:"
  printf '    401  → assinatura. Confira se o segredo do SSM é o mesmo dos dois lados.\n'
  printf '    403  → o curl não assinou com SigV4, ou a credencial não tem InvokeFunctionUrl.\n'
  printf '    erro "Sem acesso a planilha" → compartilhe com plum-polijunior@plataforma-plum.iam.gserviceaccount.com\n'
  printf '    erro "nao tem a(s) coluna(s)" → o nome da coluna não bate com o cabeçalho\n\n'
  printf '  Log: aws logs tail /aws/lambda/%s --region %s --since 5m\n\n' "$FUNCAO" "$REGIAO"
  exit 1
fi
