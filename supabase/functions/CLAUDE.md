# supabase/functions/ — o que esta pasta esconde

## 🚨 1. O código aqui NÃO é o que está rodando

Deploy **não** é confiável. O check "Supabase Preview" que aparece no commit é um **publicador de
cobertura desconhecida**: em 2026-08-12 ele publicou `dashboard-execute` e `dashboard-agent` no mesmo
segundo, e **não** publicou `ai-plum-chat` — que era a única função que aquele push mudava.

**Antes de depurar qualquer comportamento, confirme a versão implantada**
(`mcp__supabase__get_edge_function` ou o painel). Senão você analisa linhas que produção nunca
executou.

```sh
npx supabase functions deploy <nome> --project-ref rjwidarrsykufuifzunu
```

⚠️ **Prove que subiu:** `ezbr_sha256` tem de mudar. `version` sobe sozinho em mudança de secret, sem
código novo — **não serve de prova**.
⚠️ Vale o inverso: uma função que você **não** mexeu pode ter sido republicada pelo push de outra
pessoa.

## 🚨 2. `_shared/` é empacotado POR FUNÇÃO, não compartilhado em runtime

Mexeu em `_shared/`? Publique **todos** os consumidores, ou ficam cópias divergentes em produção:

| Arquivo | Consumidores |
|---|---|
| `query_plan.ts` | `ai-plum-chat` · `dashboard-execute` · `dashboard-agent` |
| `gemini_parsing.ts` | `ai-plum-chat` · `ai-agents` · `dashboard-agent` |

Confira a lista real com `mcp__supabase__list_edge_functions` antes de assumir — em 2026-08-11 o
`dashboard-agent` estava no ar sem estar em commit nenhum.

## 🚨 3. EXCEÇÃO DELIBERADA: `ai-plum-chat` está com `query_plan.ts` ANTIGO

De propósito, desde a Fase 5b (2026-08-12). É seguro **enquanto** o prompt do Agente A não emitir
`group_by: [{col, trunc}]` — o chat nunca gera a forma nova, então a cópia antiga nunca a encontra.

⚠️ **Quem for ligar forma nova no chat publica `ai-plum-chat` ANTES de mudar o prompt.** Na ordem
inversa a coluna não entra em `resolved_columns` e a pergunta morre em `MissingColumnError`, longe da
causa. Ver `contexto/30-decisoes.md` D-028.

## 4. `query_plan.ts` é o ÚNICO interpretador de Query Plan

Ele extrai as colunas para o RBAC. ⚠️ **Toda forma nova na gramática é um lugar onde uma coluna pode
se esconder do RBAC:** `addCol` descarta o que não é string, e foi assim que `walkArithmetic`
autorizou plano sem olhar os operandos. `extractColumns` tem de andar recursivamente por qualquer
estrutura nova. Ver `contexto/31-incidentes-e-licoes.md` I-05. Testes: `query_plan.test.ts`
(`npm test`).

## 5. Fail-open é decisão, não descuido

O Z-dash (`dashboard-agent`) é fail-**open** de propósito — é economia de custo, não controle de
segurança. Não "conserte" isso. Ver `contexto/30-decisoes.md` D-023.

## 6. Nada de decisão de autorização a partir de dado do cliente

Toda a autorização vive aqui (JWT + RLS + RBAC de coluna) e é resolvida **antes** de chamar o
Lambda. O executor nunca consulta o Supabase.
