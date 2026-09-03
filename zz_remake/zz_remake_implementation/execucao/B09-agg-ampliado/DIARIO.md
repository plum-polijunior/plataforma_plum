# B09 · `agg` ampliado — diário

**Data:** 2026-08-21 · **Escopo:** só o executor, mais o prompt do A3. Sem migration, sem deploy de
Edge Function.

O bloco existe para *"algum valor fora do padrão?"* poder ser respondido. Mas ele acabou sendo
**menos acrescentar e mais consertar** — os dois achados do plano da etapa se confirmaram inteiros.

---

## O que o plano dizia e o código confirmou

### 1. ⭐ `std`, `median` e `var` já funcionavam pela metade, e falhavam calados

No caminho **agrupado** o `func` vai direto para o `.agg()` do pandas e sempre funcionou. No
**escalar**, `_scalar_agg` tratava `sum|avg|mean|min|max|count` e fazia `return None` para o resto.

*"Qual o desvio padrão do faturamento?"* **com** `group_by` respondia; **sem** `group_by` devolvia
`null`. Sem erro, sem log, sem sintoma — a mesma pergunta com duas respostas conforme a forma. O V7
§4 afirmava que as três funcionavam.

### 2. ⭐ E o conserto não foi somar `if`s — `None` significava duas coisas

O `return None` final era o valor de *"função desconhecida"*. Mas `None` **já** era o valor legítimo
de *"coluna vazia"*, três linhas acima (`if len(s) == 0: return None`). Uma pergunta razoável sobre
uma coluna vazia e uma função inventada saíam idênticas.

**Feito:** função desconhecida **levanta** `ExecutorError` nomeando qual e listando as conhecidas;
coluna vazia continua `None`. Há um teste para cada lado da distinção.

### 3. ⚠️ `quantile` era pior que incompleto — era silenciosamente errado

`.agg("quantile")` do pandas devolve a **mediana** quando não recebe parâmetro. "Percentil 90"
viraria "percentil 50", com um número convincente e nenhum aviso.

**Feito:** `p` obrigatório, validado em `(0, 1)` no parsing. ⭐ **Sem default.** Assumir 0.5 seria
reintroduzir exatamente o comportamento que o bloco existe para tapar, agora com a nossa assinatura
— o que é pior que não ter a função.

⚠️ No caminho agrupado o `p` só chega ao pandas por um *callable*: `.agg("quantile")` ignora
qualquer parâmetro. Há um teste que roda o percentil agrupado e confere que ele **não** é a mediana
— se o `p` se perder entre o parsing e o `agg_dict`, é ali que aparece.

---

## Decisões

**`aggs` virou tupla de quatro** — `(alias, func, col, params)`. Nove pontos de uso, todos
mecânicos. ⛔ Rejeitado codificar o `p` dentro do `func` (`"quantile:0.9"`): transformaria um número
num problema de parsing de string, em três lugares diferentes.

**⚠️ As agregações novas recusam coluna de texto; as antigas continuam coagindo.** Média de zeros
forjados já é ruim; mediana e desvio padrão de zeros forjados são ruído puro com cara de número.
Mas **não uniformizei**: mudar `sum` sobre texto agora alteraria o resultado de cards que existem, e
a dívida irmã (`min`/`max` agrupado sobre texto devolvendo `0`) já está registrada como **C10**.
Novas nascem certas, velhas ficam como estão, e há um teste segurando **cada** comportamento — o do
`sum` existe justamente para impedir que a mudança vaze para o legado sem decisão.

**As novas entraram na tabela redutora × seletora do B02** — `std|median|var|quantile` redutoras,
`nunique|first|last` seletoras. ⭐ É o motivo de aquela tabela ter nascido extensível.

**O prompt do A3 lista as novas.** Sem isso o planejador nunca as emitiria, e o bloco entregaria uma
capacidade inalcançável — o mesmo formato de "peça sem consumidor" dos blocos anteriores, que aqui
custava três linhas evitar. Com a orientação que importa: preferir `median` a `avg` quando a
pergunta é sobre o caso típico e a base tem extremos.

---

## Um teste do lado TypeScript, e o motivo é o I-05

`_shared/query_plan.test.ts` ganhou um caso garantindo que o `p` **não** é confundido com nome de
coluna pelo `extractColumns`.

Ele já se comportava certo — `addCol` descarta o que não é string, e `p` é número. Mas a garantia
precisa estar escrita: *forma nova na gramática é onde uma coluna se esconde do RBAC* (I-05), e aqui
o risco é o espelho disso — se `p` virasse coluna, o `authorizePlan` exigiria permissão para uma
coluna chamada `0.9` e todo pedido de percentil morreria como negação de RBAC, apontando para o
lugar errado.

---

## Arquivos

**Editados:** `query_engine/pandas_executor.py` (`_parametros_da_agregacao`, a tupla de quatro,
`AGREGACOES_QUE_EXIGEM_NUMERO`, `AGREGACOES_CONHECIDAS`, o `quantile` no `_grouped_agg` e as sete
funções novas no `_scalar_agg`) · `query_engine/tests/test_privacidade.py` (+18 casos) ·
`supabase/functions/_shared/query_plan.test.ts` (+2) ·
`ai-plum-chat/adhoc/prompts/a3_planejador.ts`

**Verificado:** `npm run test:py` — **357 testes** · `npm test` — **272** · lint na baseline.

⛔ **Não tocado:** `query_plan.ts` (só o teste dele), `dashboard-agent`, `ai-agents`, e nenhuma
migration.
