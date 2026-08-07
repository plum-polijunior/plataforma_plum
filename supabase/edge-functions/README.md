# Edge Functions

Cada arquivo aqui é o `index.ts` de uma função, para colar no painel do
Supabase. Arquivo colado não resolve caminho relativo, então todos são
arquivos únicos, sem import local.

| Arquivo | Função | Origem |
|---|---|---|
| `supabase_edge_function_ai_agents.ts` | `ai-agents` | escrito à mão |
| `supabase_edge_functions_ai_plum_chat.ts` | `ai-plum-chat` | escrito à mão |
| `supabase_edge_functions_plum_chat.ts` | `plum-chat` | escrito à mão |
| `supabase_edge_function_send_auth_email.ts` | `send-auth-email` | escrito à mão |
| `supabase_edge_function_dashboard_execute.ts` | `dashboard-execute` | **gerado** |

## O arquivo gerado

`supabase_edge_function_dashboard_execute.ts` **não é editado à mão.** Ele é
montado a partir de dois fontes:

```
supabase/functions/_shared/query_plan.ts        ┐
supabase/functions/dashboard-execute/index.ts   ┘ →  npm run gen:edge  →  arquivo colável
```

Para mudar qualquer coisa, edite os fontes e rode:

```bash
npm run gen:edge
```

### Por que gerar em vez de escrever direto

`dashboard-execute` é quem aplica o RBAC de coluna: ela percorre o Query Plan
e recusa o card quando o cargo não pode ver alguma coluna referenciada. Se
essa extração deixar passar uma coluna em qualquer posição do plano (`select`,
`where` aninhado, `group_by`, `order_by`, `target_columns`), um cargo lê dado
que não deveria, e nenhuma camada abaixo pega, porque todas confiam no
conjunto que sai dali.

Código assim não pode viver sem teste, e teste precisa de módulo importável.
Escrever o arquivo colável à mão significaria manter duas cópias da mesma
lógica: a testada e a que roda. Elas divergem, sempre, e a divergência é
silenciosa.

Gerando, o que você cola é literalmente o mesmo código que os testes
exercitam. E `npm test` **falha** quando o arquivo gerado está desatualizado
em relação aos fontes, então esquecer de regenerar não passa batido.

```bash
npm test    # 40 testes: o interpretador de plano, e a saúde do arquivo gerado
```

Quem preferir a CLI pode publicar direto do fonte, sem passar pelo gerado:

```bash
supabase functions deploy dashboard-execute --project-ref rjwidarrsykufuifzunu
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
