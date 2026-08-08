# Edge Functions

Convenção única desde 2026-08-07: cada função é uma pasta com `index.ts`, no
padrão do Supabase CLI. A convenção antiga (`supabase/edge-functions/`, um
arquivo solto por função, colado manualmente no painel) foi aposentada — ver
`organizar_tudo.md` §2.3 para o histórico de por que existia e por que saiu.

| Pasta | Função | O que faz |
|---|---|---|
| `ai-agents/` | `ai-agents` | Agentes 0/1/2/3/3.1 do pipeline de importação (`DatabasePipeline.tsx`) |
| `ai-plum-chat/` | `ai-plum-chat` | Agente Z/A/C do chat + `execute_plan` (chama o executor real) |
| `dashboard-execute/` | `dashboard-execute` | RBAC de coluna + chama o executor real para os cards do dashboard |
| `plum-chat/` | `plum-chat` | Demo interativa da landing page (`DataPlaygroundSection.tsx`) — não confundir com `ai-plum-chat` |
| `send-auth-email/` | `send-auth-email` | E-mails transacionais (aprovação de conta, convite, lead) via Resend |
| `_shared/query_plan.ts` | — | Único interpretador de Query Plan do sistema. `ai-plum-chat` e `dashboard-execute` importam daqui — nunca duplicar esta lógica |

## Deploy

**Automático, desde 2026-08-07**, via integração nativa GitHub↔Supabase (Project Settings →
Integrations → GitHub, conectada ao branch `plataforma`, diretório `supabase`). Todo push que
muda algo em `supabase/functions/**` publica sozinho — sem comando manual, sem passar pelo
painel. A integração cobre só Edge Functions; migrations continuam manuais, de propósito (ver
`CLAUDE.md` §1).

Comando manual (só para debug local, ou publicar antes de dar push):

```bash
npx supabase functions deploy ai-agents --project-ref rjwidarrsykufuifzunu
npx supabase functions deploy ai-plum-chat --project-ref rjwidarrsykufuifzunu
npx supabase functions deploy dashboard-execute --project-ref rjwidarrsykufuifzunu
npx supabase functions deploy plum-chat --project-ref rjwidarrsykufuifzunu
npx supabase functions deploy send-auth-email --project-ref rjwidarrsykufuifzunu
```

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
