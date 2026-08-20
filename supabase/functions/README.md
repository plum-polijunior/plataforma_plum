# Edge Functions

Convenção única desde 2026-08-07: cada função é uma pasta com `index.ts`, no
padrão do Supabase CLI. A convenção antiga (`supabase/edge-functions/`, um
arquivo solto por função, colado manualmente no painel) foi aposentada em
2026-08-07, quando as funções passaram a viver no formato do CLI.

| Pasta | Função | O que faz |
|---|---|---|
| `ai-agents/` | `ai-agents` | Agentes 0/1/2/3/3.1 do pipeline de importação (`DatabasePipeline.tsx`) |
| `ai-plum-chat/` | `ai-plum-chat` | Agente Z/A/C do chat + `execute_plan` (chama o executor real) |
| `dashboard-agent/` | `dashboard-agent` | Cria card a partir de pergunta (`gerar_card`) + `executar_previa`. Dois agentes dentro: Z-dash (escopo) e Tarsila do Amaral (planejador). ⚠️ Faltava nesta tabela até 2026-08-18 — ficou em produção sem existir em commit nenhum até 2026-08-11 |
| `dashboard-execute/` | `dashboard-execute` | RBAC de coluna + chama o executor real para os cards do dashboard |
| `send-auth-email/` | `send-auth-email` | E-mails transacionais (aprovação de conta, convite, lead) via Resend |
| `_shared/query_plan.ts` | — | Único interpretador de Query Plan do sistema. ⭐ **Três** consumidores: `ai-plum-chat`, `dashboard-execute` e `dashboard-agent` — nunca duplicar esta lógica |

## Deploy

⚠️ **Publique à mão. Sempre.** Esta seção afirmava, até 2026-08-18, que o deploy era *"automático
desde 2026-08-07 — todo push que muda algo em `supabase/functions/**` publica sozinho"*. **Foi
medido, e é falso.**

Existe uma integração nativa GitHub↔Supabase (Project Settings → Integrations → GitHub, ligada ao
branch `plataforma`, diretório `supabase`), e ela **publica** — mas com **cobertura desconhecida**.
No push medido, ela republicou duas funções que aquele commit não tocava e **deixou de fora a
única** que ele mudava. O relato completo está em `contexto/31-incidentes-e-licoes.md` **I-03**; não
é repetido aqui para não criar um segundo dono do fato.

As duas regras que sobreviveram àquela medição:

1. Publique à mão a função que você mexeu (comando abaixo).
2. **Confirme que subiu:** o `ezbr_sha256` tem de mudar. O `version` sobe sozinho em troca de
   secret, sem código novo — **não serve de prova**. ⭐ Como obter esse número está no fim desta
   seção.

⚠️ Vale o inverso também: uma função que você **não** mexeu pode ter sido republicada pelo push de
outra pessoa. Como `_shared/` é empacotado **por função** e não compartilhado em runtime, isso deixa
cópias divergentes do interpretador de RBAC no ar sem ninguém ter feito deploy.

Migrations continuam manuais, de propósito (`contexto/30-decisoes.md` D-005).

Comando:

```bash
npx supabase functions deploy ai-agents --project-ref rjwidarrsykufuifzunu
npx supabase functions deploy ai-plum-chat --project-ref rjwidarrsykufuifzunu
npx supabase functions deploy dashboard-agent --project-ref rjwidarrsykufuifzunu
npx supabase functions deploy dashboard-execute --project-ref rjwidarrsykufuifzunu
npx supabase functions deploy send-auth-email --project-ref rjwidarrsykufuifzunu
```

⭐ **Mexeu em `_shared/query_plan.ts`? Publique os TRÊS consumidores** — `ai-plum-chat`,
`dashboard-execute` e `dashboard-agent`. Publicar um só deixa cópias divergentes do interpretador de
RBAC no ar. O `dashboard-agent` faltava nesta lista até 2026-08-18, o que tornava esse erro o
resultado natural de seguir o README.

### ⭐ Como ler o `ezbr_sha256`

⚠️ **Até 2026-08-19 nenhum documento deste repositório dizia isto** — onze lugares mandavam
"conferir o `ezbr_sha256`" e nenhum explicava onde ele aparece, o que tornava a regra 2 acima
literalmente inexecutável para quem não estivesse presente na medição do I-03.

Ele **não aparece no painel**. Vem da Management API, e exige um token pessoal
(*supabase.com/dashboard/account/tokens* → "Generate new token").

**1. Guarde o token sem escrevê-lo na linha de comando.**

```powershell
$env:SUPABASE_ACCESS_TOKEN = Read-Host "token"
```

⚠️ **Não faça `$env:SUPABASE_ACCESS_TOKEN = "eyJ…"`.** O PSReadLine grava toda linha digitada em
`%APPDATA%\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt`, em texto puro — e um
*personal access token* do Supabase alcança a **conta inteira**, não só este projeto. O `Read-Host`
não entra no histórico. A variável vale só naquela janela do PowerShell, que é o desejado.

**2. Olhe os campos antes de filtrar.**

```powershell
Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/rjwidarrsykufuifzunu/functions" `
  -Headers @{ Authorization = "Bearer $env:SUPABASE_ACCESS_TOKEN" } | ConvertTo-Json -Depth 3
```

⭐ **Não pule este passo.** A listagem pode devolver um objeto mais magro que o endpoint por função
(`…/functions/<slug>`), e o `Select-Object` do passo 3 **não reclama de propriedade inexistente**:
mostra a coluna vazia. Você leria "o hash está vazio" quando o certo é "o campo tem outro nome" — e
o plano B abaixo nunca seria acionado, porque nada indicou falha.

**3. Aí sim, a tabela.**

```powershell
Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/rjwidarrsykufuifzunu/functions" `
  -Headers @{ Authorization = "Bearer $env:SUPABASE_ACCESS_TOKEN" } |
  Select-Object slug, version, ezbr_sha256, updated_at | Format-Table
```

⚠️ A crase no fim da primeira linha é continuação de linha e precisa ser o **último** caractere —
um espaço depois dela quebra o comando. É o erro de colagem mais comum aqui.

No Git Bash, o equivalente do passo 2:

```bash
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/rjwidarrsykufuifzunu/functions"
```

**Plano B, se o campo não vier em resposta nenhuma.** Comparar o corpo publicado, que é o método
efetivamente usado em 2026-08-12 (`CLAUDE.md` §1) — o `functions download` não serve porque exige
Docker:

```bash
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/rjwidarrsykufuifzunu/functions/<nome>/body" \
  | grep -a -c "walkArithmetic"
```

Contagens iguais nos três consumidores de `query_plan.ts` significam interpretador de RBAC igual nos
três. É comparação de conteúdo, não de hash — resolve "os três batem?", não "esta subiu agora?".

## Segredos

Nenhum segredo mora neste repositório. Configure com `supabase secrets set NOME=valor`.

| Variável | Quem usa | O que é |
|---|---|---|
| `GEMINI_API_KEY` | `ai-agents`, `ai-plum-chat` | Chave da API do Google Gemini |
| `RESEND_API_KEY` | `send-auth-email` | Chave da API do Resend |
| `PLUM_EXECUTOR_URL` | `ai-plum-chat`, `dashboard-execute` | Function URL do Lambda (sem barra no fim) |
| `PLUM_EXECUTOR_HMAC_SECRET` | `ai-plum-chat`, `dashboard-execute` | Segredo que assina o payload do executor. **Diferente** da credencial AWS, de propósito — vazar um não basta para explorar o outro |
| `PLUM_AWS_REGION` | `ai-plum-chat`, `dashboard-execute` | Região do Lambda |
| `PLUM_AWS_ACCESS_KEY_ID` | `ai-plum-chat`, `dashboard-execute` | Credencial do usuário `plum-edge-invoker`, que só pode invocar aquela função |
| `PLUM_AWS_SECRET_ACCESS_KEY` | `ai-plum-chat`, `dashboard-execute` | Idem |

Os valores dos cinco últimos saem de `infra/aws/provision.sh` /
`infra/aws/valores-supabase.sh`, que os imprimem prontos para colar.
`ai-plum-chat` e `dashboard-execute` usam exatamente os mesmos cinco — é o
mesmo Lambda do outro lado, só muda quem está perguntando.

## Testes

```bash
npm test    # supabase/functions/_shared/query_plan.test.ts + src/lib/**/*.test.ts
```

O que é coberto: a extração de colunas de um Query Plan (`extractColumns`), a
autorização por conjunto de colunas (`authorizePlan`), a impressão digital de
permissão (`permissionsFingerprint`), a assinatura HMAC (`signPayload`), e a
derivação de papel de coluna a partir do schema (`columnRolesFromSchema`). É a
peça de TypeScript onde um bug vira vazamento de dado entre empresas — não é
opcional ter teste aqui, mesmo que as próprias Edge Functions (`ai-agents`,
`ai-plum-chat`, `dashboard-execute`, etc.) não tenham suíte própria ainda.
