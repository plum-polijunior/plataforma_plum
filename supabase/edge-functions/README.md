# Edge Functions

Duas convenções convivem aqui, e a diferença é deliberada.

## 1. Funções coladas no painel (`supabase/edge-functions/*.ts`)

Cada arquivo é o `index.ts` de uma função, copiado para o painel do Supabase.

| Arquivo | Função |
|---|---|
| `supabase_edge_function_ai_agents.ts` | `ai-agents` |
| `supabase_edge_functions_ai_plum_chat.ts` | `ai-plum-chat` |
| `supabase_edge_functions_plum_chat.ts` | `plum-chat` |
| `supabase_edge_function_send_auth_email.ts` | `send-auth-email` |

São arquivos únicos, sem import local, porque colar exige um arquivo só.

## 2. Funções com código compartilhado (`supabase/functions/<nome>/index.ts`)

| Função | Deploy |
|---|---|
| `dashboard-execute` | `supabase functions deploy dashboard-execute` |

Esta usa o layout padrão do Supabase CLI porque importa
`_shared/query_plan.ts`, e esse arquivo é coberto por testes.

**Por que abrir exceção.** `dashboard-execute` é quem aplica o RBAC de coluna:
ela extrai as colunas que um Query Plan referencia e recusa o card quando o
cargo não pode ver alguma. Se essa extração deixar passar uma coluna em
qualquer posição do plano (`select`, `where` aninhado, `group_by`, `order_by`,
`target_columns`), um cargo lê dado que não deveria, e nenhuma camada abaixo
pega, porque todas confiam no conjunto que sai dali.

Código assim não pode viver sem teste, e teste precisa de módulo importável.
Colar num arquivo só significaria duplicar a lógica entre o que é testado e o
que é executado, que é a forma mais confiável de os dois divergirem.

```bash
npm test    # roda os testes do _shared
```

## Segredos das funções

Nenhum segredo mora neste repositório. Configure com:

```bash
supabase secrets set NOME=valor
```

`dashboard-execute` espera:

| Variável | O que é |
|---|---|
| `PLUM_EXECUTOR_URL` | Function URL do Lambda (sem barra no fim) |
| `PLUM_EXECUTOR_HMAC_SECRET` | Segredo que assina o payload. **Diferente** da credencial AWS, de propósito: vazar um não basta para explorar o outro. |
| `PLUM_AWS_REGION` | Região do Lambda |
| `PLUM_AWS_ACCESS_KEY_ID` | Credencial do usuário `plum-edge-invoker`, que só pode invocar aquela função |
| `PLUM_AWS_SECRET_ACCESS_KEY` | Idem |

Os valores saem de `infra/aws/provision.sh`, que os imprime no resumo final.
