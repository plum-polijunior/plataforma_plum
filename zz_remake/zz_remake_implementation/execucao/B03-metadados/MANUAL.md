# B03 · `metadados` — manual do 👤

## Antes

**Nada.** Sem migration, sem deploy de Edge Function, sem secret novo.

O B03 só toca o executor, e o executor sobe sozinho no push (`query-engine.yml` roda
`update-function-code` para todo push em `plataforma` que mexa em `query_engine/**`).

## Publicar

`git push` na `plataforma`. Acompanhe a Action `query-engine`.

## Depois

**1. Abra qualquer dashboard e confira que os números continuam iguais.**

É o portão de sempre. Deve ser trivial aqui: o B03 **não alterou nenhum caminho existente** — só
acrescentou um desvio para o tipo de pedido `metadados`, que nada emite ainda. Se um card mudou,
alguma coisa saiu do escopo e vale reverter antes de investigar.

**2. Não há como exercitar o `metadados` pela interface** — e isso é esperado.

Quem vai emitir esse pedido é o Reconhecedor (A2), que nasce no **B06**. Até lá o caminho existe,
está testado por `pytest` (14 casos novos em `test_metadados.py`, mais 5 de ponta a ponta em
`test_endpoint.py`) e não é alcançável por ninguém.

É o mesmo formato do B02: o bloco entrega a peça antes do consumidor dela, porque é assim que o V3
ordena a etapa — a fundação primeiro, os agentes depois.

## ⭐ O que este bloco garante, para você conferir na revisão

Se for ler um arquivo só, leia o cabeçalho de `query_engine/metadados.py`. Os três pontos que
importam:

| Garantia | Por quê |
|---|---|
| `min`/`max` de coluna de **texto** nunca saem | São valores literais da base — o primeiro e o último nome de cliente. É o vazamento que o B02 fechou, entregue por uma função que se apresenta como "descrição" |
| Papel **declarado** vence o dtype | `documento_cpf_cnpj` é `text` mesmo guardado como número. Se o dtype decidisse por cima, o menor e o maior CPF sairiam daqui |
| Coluna **sem** papel declarado cai no dtype | `formatting_rule` é conceito de exibição, e manda tudo que não foi classificado para `text`. Herdar isso esconderia min/max das colunas numéricas da base suja |

⚠️ **E uma frase para não repetir:** *"metadados não expõe nada"*. O `min`/`max` de uma coluna
numérica ou de data **são valores reais da base**, um por coluna. É o que uma descrição de base é, e
o A2 precisa deles para saber o período coberto — mas o V3 e o V7 dizem "zero linhas expostas" como
se fosse literal, e não é.

## Se der errado

| Sintoma | Rollback |
|---|---|
| Um card mudou de número | Não deveria: nenhum caminho existente foi tocado. `git revert` do commit e me avise — é bug |
| Erro no CloudWatch citando `metadados` | Só pode vir de pedido com `tipo: "metadados"`, que nada emite hoje. Se aparecer, alguém está chamando o executor por fora |
| Precisa desligar rápido | `git revert` e push. O Lambda volta em um minuto, sem painel nenhum |
