# Plano de Implementação — `query_engine` em EC2 (AWS)

Confirmado no código: `query_engine/pandas_executor.py` é uma biblioteca de cálculo pura, sem
wrapper HTTP, sem busca no Google Sheets e sem cache — e `PlumChat.tsx:143-144` hoje usa um
**mock hardcoded** (`mockPythonVetor`) em vez de chamá-la. Também não existe `Dockerfile`/
`requirements.txt` ainda. Este plano fecha essa lacuna de ponta a ponta.

## 0. O que muda no repo existente (resumo)

| Arquivo | Mudança |
|---|---|
| `query_engine/` | + `app.py` (FastAPI), `sheets_client.py`, `cache.py`, `auth.py`, `Dockerfile`, `requirements.txt` |
| `supabase/edge-functions/supabase_edge_functions_ai_plum_chat.ts` | + nova `action: "execute_plan"` que valida tenant e faz proxy assinado para a EC2 |
| `src/pages/PlumChat.tsx` | remove `mockPythonVetor` (linhas 143-144), chama a nova action antes do Agente C |
| Supabase secrets | + `EXECUTOR_URL`, `EXECUTOR_SHARED_SECRET` |
| AWS Secrets Manager | Google Service Account JSON, Supabase `service_role` key |

Isso preserva o padrão do projeto: **o browser nunca fala com a EC2 diretamente** — só com a
Edge Function, que já é o ponto de confiança (R-05).

---

## 1. Desenho do serviço Python (o que vai rodar na EC2)

Novo processo FastAPI (`query_engine/app.py`) expondo `POST /v1/execute-plan`:

1. Autentica a requisição por **assinatura HMAC** (não JWT do usuário — a EC2 não deve
   reimplementar auth de usuário final). Header `X-Plum-Signature: sha256=<hmac(body,
   EXECUTOR_SHARED_SECRET)>` + `X-Plum-Timestamp` com janela de 60s (anti-replay). Segredo só
   existe em dois lugares: Supabase Edge Function secrets e AWS Secrets Manager.
2. Recebe `{ organization_id, dataset_id, google_sheet_id, target_columns, plan,
   formatting_rules }`. **Não recebe a pergunta em linguagem natural** — mantém o "motorista
   cego" do PRD.
3. Confere no cache em memória (dict + TTL 15 min, chave `(dataset_id, tuple(target_columns))`).
   Cache miss → busca no Google Sheets via **Service Account** (Column-Range GET, ex.
   `Sheet1!B:B,E:E`), só `GET`, nunca escreve (R-01).
4. Chama `apply_formatting_rules` → `execute_plan` (já existem em `pandas_executor.py`, sem
   alterar a lógica de cálculo).
5. Retorna o vetor de resultados serializado. Qualquer erro → JSON `{"error": "..."}` com HTTP
   4xx/5xx, nunca 200 com dado inventado.

Arquivos novos:
- `query_engine/sheets_client.py` — autentica com a Service Account (`google-auth` +
  `googleapiclient`), busca só as colunas do `target_columns` do Agente A.
- `query_engine/cache.py` — TTLCache simples (`cachetools.TTLCache(maxsize=..., ttl=900)`),
  thread-safe.
- `query_engine/auth.py` — valida HMAC + timestamp.
- `query_engine/requirements.txt` — `fastapi`, `uvicorn[standard]`, `pandas`, `numpy`,
  `google-auth`, `google-api-python-client`, `cachetools`.

**Importante — quem valida o tenant:** a EC2 confia no `organization_id`/`dataset_id` que a
Edge Function envia, porque é a Edge Function quem já validou contra `profiles`/`datasets`
com o JWT do usuário (passo 2 abaixo). A EC2 é só o motorista cego + acesso à planilha; ela
não tem lógica de RLS.

---

## 2. Mudança na Edge Function `ai-plum-chat`

Adicionar terceiro passo entre `plan_query` e `synthesize_answer`:

```ts
else if (action === 'execute_plan') {
  // 1. Extrai o JWT do usuário do header Authorization (o gateway do Supabase já verificou a assinatura)
  // 2. Usa um client Supabase com SERVICE_ROLE_KEY para buscar o dataset:
  //    SELECT google_sheet_id, organization_id, schema_metadata
  //    FROM datasets WHERE id = :dataset_id AND status = 'active'
  // 3. Confere organization_id === claim do JWT do usuário E is_active_member()
  //    -> senão, 403 (nunca confia no dataset_id "cru" do body sem essa checagem)
  // 4. Monta o payload assinado (HMAC com EXECUTOR_SHARED_SECRET) e faz fetch no EXECUTOR_URL
  // 5. Repassa a resposta (ou erro) para o frontend
}
```

Isso é o ponto que hoje **não existe** — a função atual não faz nenhuma checagem de tenant,
ela só repassa para o Gemini. Essa é a peça que fecha R-05 para esta rota.

Novos secrets na Edge Function (painel Supabase → Edge Functions → Secrets):
- `EXECUTOR_URL` (`https://query-engine.<seu-dominio>/v1/execute-plan`)
- `EXECUTOR_SHARED_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY` (se ainda não estiver disponível no runtime da função)

---

## 3. Mudança no `PlumChat.tsx`

Substituir linhas 143-144:

```ts
// 4. Executa Python Pandas (MOCK)
const mockPythonVetor = { rows: [{ valor: "Simulado" }], msg: "Execução do Pandas pendente da API Python." };
```

por uma chamada real à Edge Function (não à EC2 direto):

```ts
const execRes = await supabase.functions.invoke('ai-plum-chat', {
  body: { action: 'execute_plan', datasetId: selectedDatasetId, plan }
});
if (execRes.error) throw execRes.error;
const executorResult = execRes.data.result;
```
E usar `executorResult` (em vez de `mockPythonVetor`) na chamada de `synthesize_answer`.

---

## 4. Infraestrutura AWS (EC2 Ubuntu)

### 4.1 Rede e segurança
- VPC nova ou default, 1 subnet pública pequena (não há necessidade de ALB/ASG no volume
  descrito em `prd.md` — "dezenas de usuários da mesma empresa").
- Instância `t3.small` (2 vCPU/2GB — pandas em memória com poucas colunas por vez, cache TTL
  15min) Ubuntu 22.04 LTS.
- **Sem porta 22 aberta.** Acesso via **AWS Systems Manager Session Manager** (IAM role com
  `AmazonSSMManagedInstanceCore`), zero chave SSH exposta.
- Security Group: entrada só 443/tcp de `0.0.0.0/0` (a Edge Function não tem IP fixo — Deno
  Deploy é multi-região); toda a proteção real é a assinatura HMAC na camada de aplicação.
  Saída: 443 para `sheets.googleapis.com` e para o host do Postgres do Supabase (se a EC2
  precisar checar algo direto — no desenho acima ela não precisa, só a Edge Function fala com
  o Postgres).

  > **Atualizado na §7:** ao usar Cloudflare Tunnel (recomendado), essa regra de entrada some
  > por completo — o Security Group fica sem NENHUMA porta de entrada aberta.
- Elastic IP fixo + registro DNS (`query-engine.seudominio.com.br`) na Route 53 ou onde o
  domínio já estiver. (Também não é necessário com Cloudflare Tunnel — ver §7.)
- TLS: Nginx como reverse proxy na porta 443 + Certbot (Let's Encrypt), renovação automática
  via `certbot.timer`. (Substituído por Cloudflare Tunnel na §7 — mais simples e sem porta
  de entrada nenhuma.)

### 4.1.a Checklist prático do wizard "Launch an instance" (console AWS)

Respostas diretas às três decisões que o wizard pede na tela **Network settings** e
**Advanced details**, já considerando que o desenho final usa Cloudflare Tunnel (§7):

1. **Criar grupo de segurança? Sim — crie um novo, mas deixe sem regra de entrada nenhuma.**
   O wizard sugere "Create security group" com a caixa "Allow SSH traffic" já marcada,
   pedindo um IP de origem. **Desmarque essa caixa.** Não é necessário liberar porta 22: o
   acesso ao terminal é via **AWS Systems Manager Session Manager** (não usa a rede da VPC
   para entrar, é uma conexão iniciada pelo próprio SSM Agent para fora). Resultado esperado:
   grupo de segurança criado com **0 regras de entrada** e a regra padrão de saída (`All
   traffic` para `0.0.0.0/0`), que é suficiente para: `apt`, Docker Hub/GHCR, AWS Secrets
   Manager, Google Sheets API e a conexão outbound do `cloudflared`.

2. **Habilitar HTTP? Não. HTTPS também não.** Essas duas caixas ("Allow HTTP traffic", "Allow
   HTTPS traffic") abririam as portas 80/443 do **Security Group** para `0.0.0.0/0` — é
   exatamente o padrão do plano antigo (Nginx+Certbot), que a §7 substitui. Com Cloudflare
   Tunnel o tráfego HTTPS público é terminado na borda da Cloudflare; a instância só faz uma
   conexão **de saída** para o túnel. Deixe as duas desmarcadas.

3. **Mexer em "Advanced details"? Sim, só um campo: "IAM instance profile".** Selecione ali o
   role criado em **§4.2** (o que tem `secretsmanager:GetSecretValue` restrito aos dois ARNs
   e a policy `AmazonSSMManagedInstanceCore`). Sem isso, nem o SSM Session Manager conecta,
   nem o `aws secretsmanager get-secret-value` do passo 7.4 funciona. O resto de "Advanced
   details" pode ficar no padrão (não precisa de "User data" — os passos manuais da §7 cobrem
   o setup; não precisa de tenancy dedicada, nem shutdown behavior customizado).

   Fora do "Advanced details", ainda na mesma tela de lançamento: em **"Key pair (login)"**
   selecione **"Proceed without a key pair"** — coerente com não haver SSH; todo acesso é via
   SSM.

### 4.2 IAM
- Instance Profile com política mínima: `secretsmanager:GetSecretValue` restrita ao ARN dos 2
  secrets (Service Account JSON, shared secret), `ssm:*ManagedInstance*` para o Session
  Manager. Nada de chave de acesso IAM de longa duração na máquina.

**Política customizada — `PlumQueryEngineSecretsAccess`** (substitua `<region>` e
`<account-id>`; o `-*` no final do ARN cobre o sufixo aleatório de 6 caracteres que o Secrets
Manager sempre acrescenta ao nome do segredo):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PlumQueryEngineReadSecrets",
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": [
        "arn:aws:secretsmanager:<region>:<account-id>:secret:plum/query-engine/google-service-account-*",
        "arn:aws:secretsmanager:<region>:<account-id>:secret:plum/query-engine/shared-secret-*"
      ]
    }
  ]
}
```

Essa é a **única** policy customizada necessária. O acesso ao SSM Session Manager não precisa
de JSON próprio — vem da policy gerenciada da AWS `AmazonSSMManagedInstanceCore`, anexada ao
mesmo role.

**Trust policy do role** (quem pode assumi-lo — só o serviço EC2):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ec2.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

**Criação via AWS CLI** (roda na sua máquina local, antes de lançar a instância — é esse role
que você seleciona em "IAM instance profile" no passo 3 da §4.1.a):

```bash
# trust-policy.json e secrets-policy.json = os dois blocos JSON acima, salvos em arquivo

aws iam create-role \
  --role-name plum-query-engine-ec2-role \
  --assume-role-policy-document file://trust-policy.json

aws iam put-role-policy \
  --role-name plum-query-engine-ec2-role \
  --policy-name PlumQueryEngineSecretsAccess \
  --policy-document file://secrets-policy.json

aws iam attach-role-policy \
  --role-name plum-query-engine-ec2-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

aws iam create-instance-profile \
  --instance-profile-name plum-query-engine-instance-profile

aws iam add-role-to-instance-profile \
  --instance-profile-name plum-query-engine-instance-profile \
  --role-name plum-query-engine-ec2-role
```

No wizard, o campo "IAM instance profile" vai listar `plum-query-engine-instance-profile`.

### 4.3 Segredos
- **AWS Secrets Manager**: `plum/query-engine/google-service-account` (JSON da Service Account
  que já tem acesso Leitor às planilhas dos clientes) e `plum/query-engine/shared-secret`.
- Boot script (`user-data` ou `ExecStartPre`) busca os secrets via CLI/SDK e escreve em
  `/etc/plum/` com permissão `600`, nunca versionados no repo.

### 4.4 Deploy do processo
- Containerizado com Docker (passo a passo completo na §7).
- Deploy manual (consistente com o padrão do projeto — migrations e Edge Functions também são
  manuais): `git pull` em `/opt/plum` + rebuild da imagem + restart do container. Documentar
  isso em `docs/PASSO-A-PASSO-APLICAR.md` como já é feito para o resto.

### 4.5 Observabilidade
- CloudWatch Agent para logs do container/host e métricas de CPU/memória.
- Alarme simples: CPU > 80% por 5min, ou taxa de erro 5xx acima de N/min (via logs do
  `cloudflared` ou do próprio FastAPI).

---

## 5. Fluxo E2E resultante

```
PlumChat.tsx
  → ai-plum-chat (guard)         [Gemini]
  → ai-plum-chat (plan_query)    [Gemini]
  → ai-plum-chat (execute_plan)  [valida tenant no Postgres, assina HMAC]
       → EC2 Ubuntu (Cloudflare Tunnel → container Docker → FastAPI)
            → cache TTL 15min (hit/miss)
            → Google Sheets API (Service Account, column-range GET)
            → pandas_executor.execute_plan()
       ← vetor de resultados
  → ai-plum-chat (synthesize_answer) [Gemini, recebe o vetor real]
← resposta final salva em plum_chat
```

---

## 6. Ordem de execução recomendada

1. Escrever `app.py` + `sheets_client.py` + `cache.py` + `auth.py`, testar localmente com uma
   planilha de teste.
2. Provisionar EC2 + Secrets Manager + IAM role + Security Group (ver §7).
3. Subir o serviço com Docker, testar `curl` direto com HMAC manual.
4. Implementar `action: 'execute_plan'` na Edge Function, deploy manual pelo painel.
5. Atualizar `PlumChat.tsx`, remover o mock.
6. Rodar `supabase/tests/*.sql` de novo (não deveria haver impacto de RLS, mas o passo 9 do
   `CLAUDE.md` exige checar sempre que se toca em RLS/policy — aqui a Edge Function passa a
   fazer uma query nova).
7. Teste manual E2E no chat com um dataset real, cobrindo: pergunta válida, pergunta bloqueada
   pelo Agente Z, pergunta inviável (coluna inexistente), e tentativa de `dataset_id` de outra
   organização (deve voltar 403 antes de chegar na EC2).

---

## 7. Passo a passo — provisionamento (Ubuntu + Docker + Cloudflare Tunnel)

Todos os comandos abaixo são para o terminal Linux (bash), rodados **dentro da instância
EC2** salvo indicação contrária. Conecte-se via SSM (sem SSH exposto):

```bash
# rodado na SUA máquina local, com AWS CLI configurado
aws ssm start-session --target i-xxxxxxxxxxxxxxxxx
```

### 7.1 Atualizar o sistema e endurecer o básico

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install ufw fail2ban unattended-upgrades ca-certificates curl gnupg

# Com Cloudflare Tunnel não há NENHUMA porta de entrada necessária.
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw --force enable
sudo ufw status verbose
```

### 7.2 Criar usuário e diretórios de serviço

```bash
sudo adduser --system --group --home /opt/plum plum
sudo mkdir -p /opt/plum/app /etc/plum
sudo chown -R plum:plum /opt/plum
```

### 7.3 Instalar Docker Engine

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker plum
sudo systemctl enable --now docker
```

### 7.4 Buscar os segredos do AWS Secrets Manager (via IAM role da instância, sem chave estática)

```bash
sudo aws secretsmanager get-secret-value \
  --secret-id plum/query-engine/google-service-account \
  --query SecretString --output text | sudo tee /etc/plum/google-credentials.json > /dev/null

sudo aws secretsmanager get-secret-value \
  --secret-id plum/query-engine/shared-secret \
  --query SecretString --output text | sudo tee /etc/plum/shared-secret.txt > /dev/null

sudo chmod 600 /etc/plum/google-credentials.json /etc/plum/shared-secret.txt
sudo chown plum:plum /etc/plum/google-credentials.json /etc/plum/shared-secret.txt
```

Criar o arquivo de ambiente que o container vai consumir:

```bash
sudo tee /etc/plum/query-engine.env > /dev/null <<EOF
GOOGLE_CLOUD_CREDENTIALS=/etc/plum/google-credentials.json
EXECUTOR_SHARED_SECRET=$(cat /etc/plum/shared-secret.txt)
PORT=8000
EOF
sudo chmod 600 /etc/plum/query-engine.env
```

### 7.5 Trazer o código para a instância

```bash
sudo -u plum git clone https://github.com/<sua-org>/<seu-repo>.git /opt/plum/app
cd /opt/plum/app/query_engine
```

### 7.6 `Dockerfile` (criar em `query_engine/Dockerfile`)

```dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

RUN useradd -m appuser
USER appuser

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

### 7.7 `docker-compose.yml` (query engine + Cloudflare Tunnel juntos)

Crie em `/opt/plum/app/query_engine/docker-compose.yml`. Os dois serviços ficam na mesma
rede interna do Docker — o container do `query-engine` **não expõe porta nenhuma no host**,
só é alcançável pelo `cloudflared` via DNS interno do Docker (`http://query-engine:8000`):

```yaml
services:
  query-engine:
    build: .
    container_name: plum-query-engine
    restart: unless-stopped
    env_file: /etc/plum/query-engine.env
    volumes:
      - /etc/plum/google-credentials.json:/etc/plum/google-credentials.json:ro
    expose:
      - "8000"

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: plum-cloudflared
    restart: unless-stopped
    command: tunnel run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - query-engine
```

```bash
sudo tee /opt/plum/app/query_engine/.env > /dev/null <<'EOF'
CLOUDFLARE_TUNNEL_TOKEN=coloque_aqui_o_token_do_tunnel
EOF
sudo chmod 600 /opt/plum/app/query_engine/.env
```

### 7.8 Criar o túnel no Cloudflare (Zero Trust → Networks → Tunnels)

Pode ser feito pela CLI (`cloudflared`) direto no terminal da instância, sem passar pelo
dashboard:

```bash
# instala o cloudflared no host (só para autenticar/criar o túnel; a operação em produção
# roda dentro do container, via docker-compose acima)
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo gpg --yes --dearmor -o /usr/share/keyrings/cloudflare-main.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | \
  sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt -y install cloudflared

# autentica com a conta Cloudflare (abre um link — copie e acesse de outro navegador se a
# instância não tiver GUI)
cloudflared tunnel login

# cria o túnel nomeado
cloudflared tunnel create plum-query-engine

# aponta o subdomínio para o túnel (precisa da zona do domínio já estar no Cloudflare)
cloudflared tunnel route dns plum-query-engine query-engine.seudominio.com.br

# pega o token do túnel para usar no container (equivalente ao criado pelo dashboard)
cloudflared tunnel token plum-query-engine
```

Cole o token retornado no `.env` do passo 7.7 (`CLOUDFLARE_TUNNEL_TOKEN`).

Depois, na aba **Public Hostname** do túnel (dashboard Cloudflare, `Networks → Tunnels →
plum-query-engine → Configure`), ou via API, configure:
- **Hostname:** `query-engine.seudominio.com.br`
- **Service:** `http://query-engine:8000`

(O nome `query-engine` resolve porque `cloudflared` está no mesmo `docker-compose`/rede que o
serviço.)

### 7.9 Subir tudo

```bash
cd /opt/plum/app/query_engine
sudo docker compose up -d --build
sudo docker compose ps
sudo docker compose logs -f query-engine
sudo docker compose logs -f cloudflared
```

### 7.10 Testar o endpoint de fora

```bash
BODY='{"organization_id":"00000000-0000-0000-0000-000000000000","dataset_id":"...", "plan":{}}'
TS=$(date +%s)
SECRET=$(cat /etc/plum/shared-secret.txt)
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -X POST "https://query-engine.seudominio.com.br/v1/execute-plan" \
  -H "Content-Type: application/json" \
  -H "X-Plum-Timestamp: ${TS}" \
  -H "X-Plum-Signature: sha256=${SIG}" \
  -d "${BODY}"
```

### 7.11 Deploy de atualizações futuras

```bash
cd /opt/plum/app
sudo -u plum git pull
cd query_engine
sudo docker compose up -d --build
```

### 7.12 Checklist final de segurança da instância

```bash
# confirma que NENHUMA porta está aberta para a internet
sudo ufw status verbose
sudo ss -tlnp   # só deve mostrar processos escutando em 127.0.0.1 ou dentro da rede docker

# confirma que os segredos não estão com permissão aberta
ls -l /etc/plum/
```

Com isso, o Security Group da instância pode ficar **sem nenhuma regra de entrada**: todo o
tráfego chega via túnel outbound do `cloudflared` para a borda da Cloudflare, e o TLS público
é terminado pela Cloudflare, não pela EC2.
