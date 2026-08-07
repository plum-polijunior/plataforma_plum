# Plano de Implementação — `query_engine` (histórico) e o que foi feito de fato

> **SUPERADO.** Este documento originalmente planejava subir o `query_engine` numa EC2 Ubuntu
> com Docker + Cloudflare Tunnel. **Isso não foi o que aconteceu.** Uma sessão de
> `/plan-eng-review` produziu um design doc próprio (premissas P1/P3, decisões numeradas
> 2A/8A/9A/10A/11A) e a implementação real seguiu **AWS Lambda + container image**, com um
> conjunto de decisões de segurança mais rigoroso do que o desenhado aqui (SigV4 + HMAC, RBAC
> de coluna, k-anonimato). A evidência de que o plano de EC2 foi abandonado no meio está no
> próprio histórico deste arquivo: em `### 7.3 Instalar Docker Engine`, entre o `gpg --dearmor`
> e o `echo` do repositório apt, havia a linha `#parei aqui, a partir daqui` — quem seguia o
> roteiro parou exatamente aí.
>
> Este arquivo fica como registro do que foi cogitado e por quê foi abandonado, e como mapa de
> "onde procurar o equivalente real" para quem chegar aqui vindo de uma busca antiga. **Para
> subir ou operar o serviço de verdade, use `infra/aws/PASSO-A-PASSO.md`.** Não duplique
> aquele roteiro aqui — é exatamente esse tipo de duplicação (dois documentos de deploy
> competindo) que faz alguém seguir o errado.

---

## 1. O que foi cogitado vs. o que existe

| Este plano cogitava | O que existe de fato | Onde |
|---|---|---|
| EC2 Ubuntu, `t3.small`, sempre ligada | **AWS Lambda**, imagem de container, escala a zero | `infra/aws/`, `query_engine/Dockerfile` |
| Docker instalado à mão na instância (`apt install docker-ce...`) | Docker só no runner do GitHub Actions — **não precisa de Docker na máquina de ninguém** | `.github/workflows/query-engine.yml` |
| Cloudflare Tunnel + domínio próprio (`query-engine.plum-polijunior.com.br`) | **Lambda Function URL nativa**, sem domínio customizado, sem Cloudflare | provisionada pelo workflow |
| Segurança só por HMAC compartilhado | **Duas camadas independentes**: SigV4/`AuthType=AWS_IAM` na infraestrutura + HMAC-SHA256 com segredo separado | `query_engine/security.py`, `supabase/functions/_shared/query_plan.ts` |
| Segredos no AWS Secrets Manager, materializados em arquivo (`/etc/plum/*.json`) | **SSM Parameter Store** (`SecureString`), lidos em memória via extensão Lambda, nunca tocam disco | `query_engine/config.py`, `infra/aws/provision.sh` |
| `app.py`, `auth.py`, `sheets_client.py`, `cache.py` (escritos nesta sessão) | Substituídos por `main.py`, `security.py`, `sheets.py`; `cache.py` foi **mantido**, mas de propósito **não conectado** (ver §3) | git: os quatro arquivos antigos foram apagados (`D query_engine/app.py`, etc.) |
| Endpoint de um plano por vez | Endpoint de **lote**: N planos (cards) de UM dataset, uma leitura só no Sheets (decisão 11A) | `query_engine/main.py` |
| IAM role única cobrindo tudo | Roles separadas e estreitas: execução do Lambda (só lê 2 parâmetros), deploy via OIDC do GitHub (só publica esta função), usuário IAM só para a Edge Function invocar (`InvokeFunctionUrl` só nesta função) | `infra/aws/provision.sh` |

**Por que faz sentido o pivô, e não é só "mudou de ideia":** a carga de trabalho descrita no
próprio `prd.md` ("dezenas de usuários da mesma empresa", picos em torno de horário comercial,
ocioso o resto do tempo) é exatamente o perfil que Lambda resolve melhor que uma instância
sempre ligada — paga-se por invocação, escala sozinho, e não existe processo de longa duração
para manter no ar, atualizar SO, ou proteger com firewall. A complexidade que o plano de EC2
gastava em Nginx/Certbot/Cloudflare Tunnel/systemd simplesmente não existe em Lambda.

---

## 2. O que ainda falta — o chat não foi ligado

O trabalho real resolveu o **dashboard** (`dashboard_cards`, Edge Function
`dashboard-execute`). O **chat** (`PlumChat.tsx` → `ai-plum-chat`) continua exatamente como
estava: o passo de execução é um mock fixo
(`{ rows: [{ valor: "Simulado" }], msg: "Execução do Pandas pendente da API Python." }`,
`PlumChat.tsx:143-144`). Isso não é um esquecimento do pivô — é só que o pivô resolveu o outro
consumidor primeiro.

Ligar o chat da forma certa significa **reaproveitar** o que já existe, não redesenhar:

1. O extrator de colunas de um Query Plan (`supabase/functions/_shared/query_plan.ts` —
   `extractColumns`, `authorizePlan`) já existe, é testado por `vitest`, e é declarado no
   próprio código como **o único interpretador do sistema** de propósito — duplicá-lo em outro
   lugar (inclusive dentro de `ai-plum-chat`, com lógica própria) reabriria exatamente o risco
   que motivou a decisão 8A: duas travas de segurança que podem divergir num aninhamento
   complexo de `where`.
2. `ai-plum-chat`, no passo que hoje é o mock, precisa: buscar `allowed_columns` de
   `role_permissions` para o cargo do usuário e o dataset; chamar `authorizePlan` com o plano
   do Agente A; se autorizado, montar o mesmo formato de payload que
   `supabase/functions/dashboard-execute/index.ts` monta (`ExecutionPayload`, com um único item
   em `plans`); assinar com `signPayload` (HMAC) e com SigV4 (`aws4fetch`, como o
   `dashboard-execute` já faz); chamar o mesmo Function URL, no mesmo path `/execute`.
3. O resultado (`results[0]`, ou o erro por `status`) substitui o `mockPythonVetor` antes de
   `synthesize_answer`.

Isso é descrito em detalhe em `prd.md` §9. Não repito aqui para não ter duas fontes da mesma
instrução divergindo com o tempo — é o mesmo problema que fez este documento inteiro ficar
obsoleto.

---

## 3. Crítica e sugestões (o que vale corrigir a seguir)

- **`query_engine/cache.py` é código morto por decisão consciente, mas não está marcado como
  tal no próprio arquivo.** A razão de não estar ligado (mover uma linha bruta do cliente de
  "vida de uma requisição" para "quinze minutos na memória do processo" é uma mudança de
  postura de privacidade que precisa de decisão explícita) está em `TODOS.md` item 1, não no
  arquivo. Sugestão: um comentário de uma linha no topo do `cache.py` apontando para
  `TODOS.md#1`, para que quem abrir só esse arquivo não presuma que está em uso.
- **`apply_formatting_rules`/`roles_from_formatting_rules` continuam por keyword-match em texto
  livre** (assunto do `urgent.md`, escrito antes deste pivô). O pivô tornou isso mais sério, não
  menos: `column_roles` agora alimenta a proteção de k-anonimato e a troca `sum`→`avg` em
  percentual. Vale reabrir `urgent.md` com essa consequência nova.
- **`CLAUDE.md` não foi atualizado.** A seção 5 (arquitetura de IA) ainda descreve só as duas
  Edge Functions antigas (`ai-agents`, `ai-plum-chat`) e não menciona Lambda,
  `dashboard-execute`, RBAC de coluna nem k-anonimato. Não mexi nele porque não foi pedido nesta
  tarefa e é um documento sensível o bastante para merecer sua própria revisão — mas ele hoje
  desinforma quem só lê `CLAUDE.md` e não cruza com o código.
- **Este arquivo deveria ter sido descoberto mais cedo.** Nenhum aviso automático aponta quando
  um documento de plano diverge do código real (o que aconteceu aqui foi o usuário notar e
  pedir a atualização). Não há ação de código a tomar por causa disso, mas vale, como hábito de
  processo, tratar `implementation.md`/`prd.md` como algo a revisar a cada mudança estrutural no
  `query_engine`, não só quando alguém percebe a divergência.
