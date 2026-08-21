# B09 · `agg` ampliado — manual do 👤

## Antes

**Nada.** Sem migration, sem secret, sem deploy de Edge Function.

⭐ Este é um bloco **aditivo**: nenhum card e nenhuma pergunta usa `std`, `median`, `var` ou
`quantile` hoje. O que mudou de comportamento existente foi só o que já estava errado — ver abaixo.

## Publicar

`git push`. O Lambda sobe sozinho pela Action `query-engine`.

⚠️ **Confira que a Action terminou verde.** O smoke test roda **depois** do `update-function-code`
(C4b), então uma falha só aparece com o executor já substituído — foi assim que ele caiu em
2026-08-21 (I-09).

## Depois

**1. Abra um dashboard e confirme que os números não mudaram.**

Deve ser trivial: nenhum card usa as funções novas. Se algum mudou, o bloco saiu do escopo e vale
reverter antes de investigar.

**2. Com a chave ligada, pergunte algo de dispersão** — *"tem alguma venda muito fora do padrão?"*,
*"qual o valor típico de uma venda?"*, *"quanto fazem os 10% melhores?"*.

Depois confira o que o planejador emitiu:

```sql
select jsonb_pretty(resposta_agente) from plum_logs
where caminho = 'ad_hoc' and etapa = 'planejador'
order by created_at desc limit 1;
```

⭐ **O que procurar:** o A3 usando `std`, `median` ou `quantile` em vez de contornar com `avg`. Se
ele continuar respondendo tudo com média, o prompt não pegou — e a orientação está em
`adhoc/prompts/a3_planejador.ts`.

⚠️ **Se ele emitir `quantile` sem `p`, o pedido é recusado** e você verá isso como erro do executor.
É de propósito, e é o ponto do bloco: sem `p`, a biblioteca por trás devolveria a **mediana** em
silêncio, e "percentil 90" viraria "percentil 50" com um número convincente.

## ⭐ O que este bloco consertou, e vale saber que estava quebrado

| | antes | agora |
|---|---|---|
| `std`/`median`/`var` **sem** `group_by` | devolvia `null`, sem erro | responde |
| `std`/`median`/`var` **com** `group_by` | já funcionava | igual |
| `quantile` | devolvia a **mediana**, calada | exige `p`, ou recusa |
| agregação inventada (`skew`) | devolvia `null` | recusa nomeando qual |

A terceira linha é a que mais importa: *"qual o desvio padrão do faturamento?"* respondia ou não
**conforme a forma da pergunta**, e ninguém tinha como saber.

⚠️ **Uma coisa NÃO foi consertada, de propósito:** `sum` e `avg` sobre coluna de texto continuam
convertendo para número e preenchendo zero. Mudar isso agora alteraria o resultado de cards que
existem — e a dívida irmã (`min`/`max` agrupado sobre texto devolvendo `0`) está registrada como
**C10** em `contexto/20-pendencias.md`. As funções novas nascem recusando; as antigas ficam como
estão até alguém decidir.

## Se der errado

| Sintoma | O que fazer |
|---|---|
| Um card mudou de número | Não deveria: o bloco é aditivo. `git revert` e me avise |
| O A3 nunca usa as funções novas | Prompt, não código. Me diga a pergunta que deveria ter usado |
| Pergunta de percentil vira erro | Olhe se o A3 mandou o `p`. Sem ele a recusa é o comportamento certo |
| Erro `'X' precisa de uma coluna numerica` | A coluna está tipada como texto no `schema_metadata`. Corrija o tipo na tela de base de dados — é melhor que a estatística sair sobre zeros inventados |
