# Investigação: Admin barrado por RBAC de coluna no chat (`producao`)

Pergunta de teste (`test_data/test_errors/test_error_4.txt`): **"dia 30 de março, qual foi
o motivo do refugo?"**, dataset `producao`, usuário com cargo Admin. Resposta do chat:

> Sua pergunta usa uma coluna que seu cargo nao pode ver.

---

## ⭐ RESOLVIDO em 2026-08-10 — era bug de código, não desalinhamento de dado

**Nenhuma** das hipóteses abaixo era a causa. Todas procuravam dado errado no banco
(dataset duplicado, `role_id` apontando pro cargo errado, NBSP em `allowed_columns`);
o banco estava certo o tempo todo.

A causa é `extractColumns` (`_shared/query_plan.ts`) tratar todo `order_by[].col` como
coluna de origem. Reproduzido com "quais estudos tem?" na base `tabela-de-estudos.csv`,
onde o Agente A gerou:

```json
"select":  ["estudo", {"expr":{"agg":"count","col":"estudo"},"as":"quantidade"}],
"order_by":[{"col":"quantidade","dir":"desc"}]
```

`quantidade` não é coluna de planilha — é o alias que o próprio `select` criou para o
`count`. O RBAC exigia esse alias em `allowed_columns`, onde ele não pode estar, então
o plano era negado **para qualquer cargo**, inclusive um com acesso total. Confirmado
por `SELECT` em produção: o Admin tinha as 7 colunas da base liberadas, `estudo` entre
elas.

A pergunta original deste doc ("dia 30 de março, qual foi o motivo do refugo?") cai no
mesmo lugar: um "os maiores motivos de refugo" gera `order_by` sobre o alias da
agregação do mesmo jeito.

**Correção:** PR #5, commit `ed3c007`. `order_by` é a única posição que o executor
resolve depois da agregação (`pandas_executor.py`, bloco ORDER BY), quando as colunas do
frame já são os aliases — lá o alias do próprio plano deixa de ser exigido. `group_by`,
`where`, `target_columns` e `select` rodam antes, sobre o frame de origem, e continuam
estritos; três testes fixam essa fronteira, porque dispensar alias em `group_by` seria
bypass de RBAC de verdade.

O log recomendado na seção "Diagnóstico recomendado" (abaixo) **foi aplicado** no mesmo
commit, e é o que faltava: com ele, esse diagnóstico levaria um minuto em vez de quatro
hipóteses. Publicado em `ai-plum-chat` (v38) e `dashboard-execute` (v28) — as duas
funções que empacotam o `query_plan.ts`.

O que sobra de lição, e não é pequeno: a análise ficou quatro hipóteses no lado do dado
porque a mensagem de erro não distinguia "sua permissão está incompleta" de "o plano
pediu algo que não é coluna". Eram falhas diferentes com o mesmo texto.

---

## De onde vem essa mensagem exatamente

É o texto literal de `supabase/functions/ai-plum-chat/index.ts:171`, o branch `forbidden`
de `authorizePlan()` (`_shared/query_plan.ts`) dentro da ação `execute_plan`. Importante: a
requisição **não chega no Lambda/pandas** quando cai nesse branch — é barrada na Edge
Function, antes de qualquer chamada ao executor. A nota original do teste ("travou no
pandas") está incorreta.

Essa mensagem só aparece quando `allowedColumns` (lido de `role_permissions.allowed_columns`
pro `role_id` do usuário + `dataset_id` da base) **não está vazio, mas não cobre** todas as
colunas que o Query Plan do Agente A usa. Se `allowedColumns` estivesse vazio, a mensagem
seria outra ("Seu cargo nao tem acesso liberado a nenhuma coluna desta base",
`index.ts:159`). Essa distinção já elimina hipóteses de "cargo sem nenhuma permissão".

Não existe bypass de RBAC para o cargo Admin em lugar nenhum do backend
(`ai-plum-chat`, `dashboard-execute`, `_shared/query_plan.ts`) — todos leem
`allowed_columns` de `role_permissions` do mesmo jeito, para qualquer cargo. O único
mecanismo que dá ao Admin acesso a todas as colunas é uma escrita explícita nessa tabela,
feita em dois lugares: `DatabasePipeline.tsx:451-472` (toda vez que uma base fica `active`)
e, retroativamente para bases mais antigas, a migration
`supabase/migrations/20260807190000_backfill_permissao_admin_bases_existentes.sql`.

## Hipóteses descartadas

**A) `role_permissions` do Admin para `producao` estava incompleto** (a migration só
sobrescreve linha com `allowed_columns = '{}'`, então uma linha pré-existente com um
subconjunto de colunas ficaria intocada). **Descartada** — conferido diretamente na tabela:
o Admin tem todas as colunas da planilha liberadas para esse dataset.

**B) Duas linhas de cargo "Admin" na mesma organização** (nome duplicado/com variação de
maiúscula ou espaço), com o `role_id` do usuário testado apontando para a que não recebeu o
backfill. **Descartada.**

**C) A migration rodou no projeto/ambiente errado** (Supabase local ou de teste, não o
projeto de produção `rjwidarrsykufuifzunu`). **Descartada.**

## Hipótese que ficou em aberto — e também estava errada

**D) `producao` tem mais de uma linha em `datasets`** (duplicata de um re-upload/reconexão
anterior), e o dropdown do chat (`PlumChat.tsx`, `selectedDatasetId`) está mandando pro
`execute_plan` um `dataset_id` **diferente** daquele cuja `role_permissions` foi conferida
na hipótese A.

> **Descartada em 2026-08-10.** A causa era o alias de agregação em `order_by` (ver o bloco
> RESOLVIDO no topo). O raciocínio abaixo sobre `DatabasePipeline.tsx` criar linha nova em
> `datasets` a cada upload que não bata com um rascunho continua factualmente correto e vale
> como observação sobre duplicação de base — só não é o que causou este erro.

Isso é plausível porque `DatabasePipeline.tsx` (linhas 86-138) só reaproveita um dataset
já existente quando encontra um **rascunho** (`status = 'processing'`) com o cabeçalho
idêntico; qualquer upload que não bata com um rascunho em andamento cria uma linha nova em
`datasets`, ainda que já exista uma base `active` com o mesmo nome/planilha. Se essa
planilha foi reconectada/reprocessada em algum momento, pode haver uma base `producao`
"órfã" (antiga, sem as permissões corrigidas) e outra `active` (a que foi checada), e não
há garantia visual no dropdown de qual é qual — os dois aparecem só pelo campo `name`.

### Como verificar D

⚠️ **Correção de 2026-08-10.** A primeira versão desta seção mandava envolver a consulta num
bloco `DO` com `RAISE NOTICE`, alegando que isso apareceria em Supabase → Logs → Postgres
Logs. **Isso não funciona e foi testado**: `log_min_messages` do Postgres vale `warning` por
padrão, e `NOTICE` fica *abaixo* desse corte — a mensagem só é enviada ao cliente, nunca
escrita no log do servidor. E o SQL Editor do Supabase não exibe mensagens `NOTICE` na aba
de resultados. Resultado prático: a consulta rodou, as mensagens foram emitidas, e foram
descartadas nas duas pontas. Nenhum log em lugar nenhum.

Rode a consulta direta e leia a grade de resultados — é o caminho certo aqui:

```sql
SELECT d.id            AS dataset_id,
       d.name,
       d.status,
       d.created_at,
       d.organization_id,
       r.id            AS admin_role_id,
       r.name          AS admin_role_name,
       coalesce(array_length(rp.allowed_columns, 1), 0) AS qtd_colunas_liberadas,
       rp.allowed_columns
FROM datasets d
LEFT JOIN roles r
  ON r.organization_id = d.organization_id
 AND lower(btrim(r.name)) = 'admin'
LEFT JOIN role_permissions rp
  ON rp.dataset_id = d.id
 AND rp.role_id    = r.id
WHERE d.name ILIKE '%produ%'
ORDER BY d.created_at;
```

Duas diferenças em relação à versão anterior, além de largar o `DO`: `roles` entra como
`LEFT JOIN` em vez de subconsulta escalar (a subconsulta estouraria com *"more than one row
returned by a subquery"* justamente no cenário da hipótese B, que é um dos que se quer
enxergar), e `qtd_colunas_liberadas` deixa óbvio de bater contra a contagem de colunas do
`schema_metadata`.

Se aparecer mais de uma linha, a base cujo `id` bate com o que o front está de fato mandando
em `execute_plan` (ver diagnóstico abaixo) é a que importa.

Se ainda assim quiser deixar registro no log do Postgres (Supabase → Logs → Postgres, URL
direta `/project/rjwidarrsykufuifzunu/logs/postgres-logs`), o `DO` só funciona trocando a
severidade — `RAISE WARNING` passa nos dois cortes (cliente e servidor), `RAISE NOTICE` não
passa em nenhum:

```sql
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT d.id, d.name, d.status, d.created_at LOOP
    RAISE WARNING '[diag-rbac] dataset_id=% name=% status=%', rec.id, rec.name, rec.status;
  END LOOP;
END $$;
```

Mas para esta investigação isso é desnecessário: o `SELECT` acima responde D na hora, e o
registro durável de verdade é o log da Edge Function abaixo.

## Diagnóstico recomendado (resolve D e qualquer hipótese nova de uma vez)

Hoje o branch `forbidden` de `execute_plan` (`ai-plum-chat/index.ts:167-174`) **não loga
nada** antes de retornar — ao contrário do caminho de sucesso, que loga
`[execute_plan]` com o resultado do executor (`index.ts:223`). Por isso, até agora, toda
hipótese sobre "qual coluna faltou e em qual dataset/cargo" teve que ser reconstruída às
cegas a partir do texto da pergunta, sem ver o dado real.

**Aplicado em 2026-08-10** (`ai-plum-chat/index.ts`, dentro do `if (!veredito.allowed)`).
Fecha a investigação de forma definitiva, sem mais hipóteses:

```ts
const veredito = authorizePlan(plan as QueryPlan, allowedColumns);
if (!veredito.allowed) {
  console.error("[execute_plan] RBAC negou colunas", {
    datasetId,
    roleId: profile.role_id,
    allowedColumns,
    colunasNecessarias: veredito.required,
    colunasNegadas: veredito.forbidden,
  });
  return json({ ... });
}
```

Reproduzir a pergunta de teste depois disso mostra, no log da função (mesmo padrão de
observabilidade permanente já usado para `[plan_query]`/`[synthesize_answer]`), exatamente
qual `dataset_id` foi usado e quais colunas o RBAC considerou negadas — confirma ou
descarta D e qualquer outra hipótese sobre desalinhamento de dado sem precisar adivinhar.

## Outras hipóteses, menos prováveis, se D e o log acima não explicarem

- **Perfil de teste não é o cargo que parece ser**: `profiles.role_id` é lido ao vivo do
  banco a cada request (`ai-plum-chat/index.ts:105-109`), não vem de claim do JWT — mas se
  o usuário testado tem mais de um perfil/organização, ou o cargo foi trocado recentemente,
  vale confirmar que o `role_id` realmente aponta pro "Admin" cuja `role_permissions` foi
  inspecionada, e não para outro cargo.
- **Caractere invisível em `allowed_columns`**: o código já dá `.trim()` em cada elemento
  antes de comparar (`query_plan.ts:144`), então espaço comum não quebra a comparação — mas
  caracteres como NBSP (` `) sobreviveriam a um `.trim()` comum. Baixa probabilidade,
  mas fácil de descartar comparando `array_length(allowed_columns,1)` com a contagem de
  colunas do `schema_metadata` e um `unnest(...) except unnest(...)` entre os dois
  conjuntos.
- **O teste é histórico**: se ninguém repetiu literalmente a mesma pergunta no chat depois
  de confirmar a hipótese A, vale simplesmente tentar de novo antes de aprofundar mais —
  pode já estar resolvido e o que falta é só confirmar.

## Recomendação de ordem

1. Rodar a query de D acima primeiro (rápida, sem precisar de deploy).
2. Se não achar duplicata, aplicar o log de diagnóstico e reproduzir a pergunta uma vez —
   ele responde D, o caso do `role_id` errado e o de caractere invisível ao mesmo tempo.
3. Remover o log (ou deixar, se a equipe decidir que vale como observabilidade permanente
   do branch `forbidden`, hoje o único de `execute_plan` sem log nenhum).
