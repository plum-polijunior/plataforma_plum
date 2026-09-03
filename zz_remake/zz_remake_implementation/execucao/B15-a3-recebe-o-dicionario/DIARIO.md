# B15 · O A3 recebe o dicionário; o A2 sai do chat — diário

**Data:** 2026-08-25 · **Escopo:** `ai-plum-chat` (`handleAdHocReconhecer`, `handleAdHocPlanejar`),
`adhoc/planejador.ts`, o prompt do A3, `_shared/dicionario.ts`, `_shared/log_core.ts` e
`PlumChat.tsx`. Sem migration.

⭐ **É o bloco em que a Etapa 1 fecha a dívida que a motivou:** a `semantic_definition` que a pessoa
escreve no cadastro finalmente chega a um agente do `ad_hoc`.

---

## ⭐ A dívida que este bloco paga

O achado que motivou a Etapa 2 inteira: o cadastro gerava e a pessoa **editava à mão** a
`semantic_definition` de cada coluna — o campo onde cabe *"lucro não inclui impostos"* — e ela
**nunca chegava a nenhum agente do `ad_hoc`**. Era buscada do banco, entregue ao `reconhecer()`, e
lá dentro servia para **exatamente uma coisa**: calcular o hash da chave do cache.

E o caminho **legado** usava: os três agentes antigos recebem o `schema_metadata` inteiro no prompt.
O remake havia **regredido** nisso, e ninguém notou porque a saída continuou plausível.

---

## ⭐ A troca foi mecânica, e isso foi projetado no B11

`EntradaDoPlanejador` ganhou `dicionario` e perdeu `reconhecimento`. Uma linha em cada lado.

Isso não é sorte: `_shared/dicionario.ts` foi escrito no B11 **espelhando os campos de
`Reconhecimento`, menos `confianca`**, exatamente para que esta troca fosse mecânica em vez de
reescrita. O cabeçalho de lá diz isso.

A única mudança de substância no `montarEntrada` foi trocar `JSON.stringify(reconhecimento)` por
`paraPrompt(dicionario)` — que escreve o dicionário em prosa curta, diz `(sem descrição)` onde
ninguém descreveu (omitir faria a coluna parecer inexistente e o A3 a evitaria sem saber por quê) e
acrescenta o aviso de dicionário não conferido.

---

## ⭐ O turno encurtou duas etapas

```
antes:  porteiro → executor (metadados) → A2 → [vocabulário] → A3 → executor → A4
agora:  porteiro → [vocabulário] → A3 → executor → A4
```

Saíram **uma chamada de LLM e uma ida ao Lambda** por pergunta em base fria. O `metadados` existia
no caminho da pergunta só para alimentar o A2.

⚠️ **Isso reabre a fusão das duas invocações** (§B4) — mas como decisão **medida**, com a
`latencia_ms` na mão. Registrado, não feito.

---

## ⚠️ Um sinal se perde, e não em silêncio

O `metadados` era quem devolvia `existe: false` para coluna que desapareceu da planilha. Sem ele,
coluna que sumiu vira `MissingColumnError` do executor — que é **erro visível** na resposta, não uma
degradação calada.

O preço real é outro: **o dicionário passa a ser um retrato do dia do cadastro.** Reperfilar é
assunto da Etapa 5.

⭐ A defasagem do `vocabulario_util` já estava coberta: se a coluna passou de 200 distintos depois do
cadastro, o executor recusa o vocabulário e o A3 planeja sem ele — degradado, não errado.

---

## ⚠️ Achado grave: `presuncoes_qtd` era `NULL` em toda linha do `plum_logs`

O critério de pronto deste bloco, escrito no plano, é: *"efeito esperado, e vale medir: menos
presunções. Se o número não cair, o dicionário não está sendo lido de verdade."*

**O número não estava sendo gravado.** A coluna `presuncoes_qtd INT` existe desde o B07, o
`handleAdHocPlanejar` sempre passou `presuncoesQtd: plano.presuncoes.length`, e:

- `LinhaDeLog` **não declarava** o campo;
- `montarLinha` **não o mapeava**.

⇒ `presuncoes_qtd` ficou `NULL` em toda linha, desde o B07. É exatamente o modo de falha que o
comentário do próprio `montarLinha` avisa — *"um nome de coluna errado aqui vira `null` silencioso no
banco em vez de erro"* — por **omissão** em vez de por typo, que é pior: um typo aparece na revisão,
uma ausência não.

Corrigido, com regressão em `log_core.test.ts`. ⚠️ **Turno anterior a 2026-08-25 tem `NULL` ali** —
a linha de base "quantas presunções o A3 declarava antes do dicionário" **não existe**, e não é
recuperável. Este bloco começa a medir; não tem com o que comparar.

---

## ⭐ Como a `versao` continua interpretável

`presuncoes_qtd` sozinho não diz nada: dicionário `versao: 1` faz o A3 presumir mais **por
instrução** (`paraPrompt` acrescenta o aviso, e o prompt manda ser liberal). Sem saber a versão, uma
queda de presunções não se distingue de uma amostra de bases já conferidas.

⇒ `respostaAgente` do `planejador` ganhou `_dicionario: {versao, conferido, colunas}`. Prefixo `_`
porque é metadado da **entrada**, não saída do modelo. Não precisou de coluna nova nem de migration.

---

## ⛔ O A2 não foi apagado

`adhoc/reconhecedor.ts`, `_shared/reconhecimento.ts` e a tabela `plum_reconhecimento` ficam, com um
aviso de 15 linhas no topo de cada um explicando por quê.

Com **uma** planilha o trabalho dele é vazio: *"que tabelas importam"* é constante, *"que colunas
importam"* o A3 resolve melhor porque é ele que tem a pergunta, e *"de quais preciso vocabulário"* é
determinístico. Na **Etapa 3**, com várias planilhas, escolher entre elas volta a ser problema de
verdade — e é este agente que o resolve. Apagar seria jogar fora um bloco testado para reescrevê-lo
igual (§A3, D-005).

---

## ⚠️ `EtapaLog` não conhecia o remake, e outros 18 erros de tipo

Ao rodar `deno check` no `ai-plum-chat` **pela primeira vez** apareceram **19 erros**. Um era meu; os
outros 18 eram pré-existentes, o mais numeroso sendo `EtapaLog` — que listava só as quatro etapas do
caminho legado, enquanto o código gravava `porteiro`, `reconhecedor`, `planejador`, `interprete` e
`executor` desde o B06.

⇒ Nada typechecava esta pasta: `deno check` não roda no CI, `npm run build` é `vite build` (esbuild,
que só remove tipos) e o `tsconfig.app.json` cobre apenas `src/`. Os 19 foram corrigidos e as duas
funções fecham limpas.

---

## Arquivos

**Mudados:** `ai-plum-chat/index.ts` (`handleAdHocReconhecer` reescrito) ·
`adhoc/planejador.ts` · `adhoc/prompts/a3_planejador.ts` · `_shared/dicionario.ts`
(+`normalizarDicionario`) + `.test.ts` · `_shared/log_core.ts` (+`presuncoesQtd`, `EtapaLog`) +
`.test.ts` · `src/pages/PlumChat.tsx` · `B07/MANUAL.md`.

**Marcados como desligados:** `adhoc/reconhecedor.ts` · `_shared/reconhecimento.ts`.
