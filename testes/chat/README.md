# Testes do chat

Roteiros de validação manual do chat conversacional (`PlumChat.tsx` → Agente Z → Agente A →
`execute_plan` → Agente C) e as bases que eles usam.

**Isto não é suíte automatizada.** Os testes que rodam no CI vivem em `query_engine/tests/`
(pytest) e `supabase/functions/_shared/*.test.ts` (vitest). O que está aqui é o outro tipo de
teste, o que aquelas suítes não alcançam: perguntas em português, com gabarito calculado à
mão fora do Plum, para medir se a resposta que chega ao usuário está certa — e, quando não dá
para estar certa, se o chat **admite** em vez de inventar.

## Arquivos

| Arquivo | O que é |
|---|---|
| `teste-chat-tabela-estudos.md` | Roteiro do catálogo de estudos: 39 estudos, 7 colunas, **nenhuma coluna numérica de medida** |
| `teste-chat-tabela-estudos-RESULTADO.md` | Execução do roteiro acima contra o executor real (2026-08-10) |
| `teste-chat-vendas-roupas.md` | Roteiro da base de vendas: 4 colunas numéricas, o risco é errar a conta |
| `bases/` | Os arquivos que alimentam os dois roteiros |

Os dois roteiros são **opostos de propósito**. Em vendas há medida para somar, e o que se
testa é precisão aritmética. Em estudos não há nenhuma: 6 das 7 colunas são texto categórico
e a sétima é um ano. A única agregação com sentido é `count`, e as perguntas mais naturais de
um catálogo (*"quais estudos existem da Bacia de Campos?"*) são estruturalmente impossíveis,
porque o executor bloqueia linha bruta. Boa parte daquele roteiro mede honestidade, não conta.

## Como usar

Cada pergunta tem: resposta esperada, plano esperado, e o que está sendo testado. Registre no
formato do §6 do roteiro:

```
ID | pergunta | status Z | plano do A (json) | retorno do executor | resposta do C | ✅/❌ | observação
```

Guarde também, uma vez por ingestão, a `formattingRules` que o Agente 3 gerou, o
`column_roles` resultante e o total de linhas que o `sheets.py` carregou. Vários dos bugs
prováveis nascem na ingestão, não no plano — sem esses artefatos não dá para saber de quem foi
a culpa. Foi exatamente assim que o type `ano` apareceu: o `RESULTADO` registrou que
`data_conclusao` tinha sido tipada como `numero_inteiro`, e daí saiu a resposta errada de
"qual o ano com mais estudos".

## Metade determinística

O `RESULTADO` cobre só o executor, que é reproduzível sem LLM e sem rede: dá para carregar a
base do `bases/`, aplicar as `formatting_rules` reais e chamar `execute_plan_with_formatting`
direto. A metade dos agentes (qual plano o Agente A escolhe, o quanto o Agente C admite os
limites) só se testa no chat de verdade.

Ao reproduzir a ingestão fora do Google Sheets, imite o `sheets.py`: ele lê com
`majorDimension="COLUMNS"`, então cada coluna é truncada no último valor não-vazio e depois
preenchida com `None` até o tamanho da maior. É por isso que o CSV de estudos tem 43 registros
e o executor enxerga 41.
