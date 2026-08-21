# B07 · A3 + A4 + presunções — diário

**Data:** 2026-08-21 · **Escopo:** `_shared/`, `adhoc/`, `ai-plum-chat`, o front. Sem migration.

⭐ **É onde o `ad_hoc` passa a responder.** Com a chave ligada, a pergunta atravessa A1 → metadados
→ A2 → vocabulário → A3 → resolvedor → executor → A4, e é essa resposta que chega à tela. As peças
dos cinco blocos anteriores deixam de ser código sem consumidor, todas de uma vez.

---

## A decisão que organizou o bloco

O 👤 escolheu: **com a chave ligada, o `ad_hoc` responde** — em vez de rodar em sombra e continuar
mostrando a resposta do caminho antigo.

⭐ **A consequência que desenhei em torno dela: qualquer falha do `ad_hoc` cai para o legado, em
silêncio para o usuário.** É o que torna a escolha segura. A regra que organiza a V3 é *não quebrar a
demo*, e um A3 com defeito não pode virar chat quebrado — o defeito aparece em `plum_logs`, não na
tela.

⚠️ **Com duas exceções, e elas importam:** `bloqueado` (porteiro) e `inviavel` (planejador) **não**
caem para o legado. São respostas, não falhas — cair ali faria a pergunta ser respondida por um
caminho que o outro já tinha recusado, e o usuário veria o sistema se contradizer consigo mesmo.

---

## O que o plano dizia e o código pediu diferente

### 1. ⭐ A negação parcial (B08) saiu de graça, e forçar o contrário seria pior

O plano põe negação parcial no B08. Mas assim que os pedidos viram um **lote**, autorizar cada um
separadamente é o caminho mais curto — e o oposto exigiria escrever código para *abortar* o lote
quando um pedido é negado, para depois removê-lo no bloco seguinte.

**Feito:** `handleExecutePlan` ganhou `opcoes.lote`, cada pedido passa pelo `authorizePlan`, e os
negados vão para o A4 como `negados[]`. O prompt do A4 já sabe o que fazer com eles.

⭐ É a diferença entre *"sua pergunta usa uma coluna que seu cargo não pode ver"* — o caminho atual,
que perde a pergunta inteira — e *"não incluí a margem porque seu cargo não tem acesso"*, com o resto
respondido. **O B08 encolheu para: decidir, com o dado do modo observação do B02, se o teto de
cardinalidade passa a valer no legado.**

### 2. A 2ª rodada do A3 ficou de fora, com motivo

O V7 prevê uma rodada extra quando o A3 olha os resultados e conclui que precisa de mais dado.
**Adiado.** Ela dobra o custo do agente mais caro, e sem a suíte de avaliação não há como dizer se
melhora alguma resposta — decidir isso por intuição é exatamente o que o §0-ter do V3 alerta.

A coluna `rodada_extra` do `plum_logs` continua nula, esperando.

### 3. `linhas_origem` e `linhas_brutas_entregues` já são gravadas — com zero

Não é preguiça: `agregado` **não entrega linha bruta**, então zero é o valor correto, e é o que faz o
orçamento do B10 partir de uma contagem real em vez de uma coluna nula. A linha do `executor` do
`metadados` grava `linhas_origem` com o `n_linhas` da base, que é o que aquela coluna sempre quis
dizer.

### 4. Temperatura diferente por papel, e o motivo é assimétrico

**A3 em 0.** Metade da razão de o planejador existir é a resposta ser reproduzível: o mesmo par
(pergunta, base) tem de dar o mesmo plano, senão "por que hoje deu diferente?" não tem resposta.

**A4 em 0.2.** Aqui variação pequena é boa — texto com temperatura 0 sai robótico e repetitivo entre
respostas. ⭐ E é seguro porque **o número não é escolha do modelo**: ele chega pronto nos resultados,
e o R-13 proíbe o A4 de calcular qualquer coisa.

---

## Decisões

**O id do pedido é gerado no servidor, não aceito do A3.** Ele vira `card_id` no payload e é a chave
pela qual o resultado volta; id repetido faria dois pedidos colidirem e um sumir em silêncio.

**Teto de 6 pedidos por turno.** Não é sobre custo: é sobre o A3 "resolver" uma pergunta difícil
pedindo tudo que existe e deixando o A4 achar a resposta no meio.

**Pedido malformado é descartado, não derruba o lote.** Um pedido inválido entre cinco não é motivo
para perder os outros quatro. ⚠️ Mas se **nenhum** sobrar, o chamador cai para o legado — e é por
isso que `normalizarPlanoDoA3` nunca lança.

**Entidade sem casamento segue com o termo cru.** O `where` do executor normaliza os dois lados, então
ainda pode casar — e devolver zero é mais honesto que trocar por um valor que o resolvedor não teve
confiança para escolher.

**Vocabulário limitado a 4 colunas por turno.** Cada uma é uma consulta ao Lambda; o A2 marcando dez
colunas como úteis viraria dez leituras antes de o A3 sequer começar.

⚠️ **`pedidos` e `presuncoes` trafegam pelo cliente entre as duas invocações.** É seguro pelo mesmo
motivo que o `plan` do `execute_plan` atual: o `authorizePlan` roda no servidor para cada pedido e a
barreira 4 do Lambda reconfere contra o `allowed_columns` lido com o JWT. **Plano é candidato, nunca
verdade** (§4 regra 1).

---

## ⚠️ O que este bloco NÃO garante

**O prompt do A3 é ponto de partida.** O V7 §9 o chama de *"o artefato mais importante da Etapa 1 e o
único sem responsável nomeado"*, e continua sendo. Nada aqui diz se ele planeja bem — só que a forma
do que ele devolve é conferida.

⭐ **É a primeira vez que o `_shared/llm/claude.ts` roda.** Escrito no B05, nunca executado até este
bloco. Qualquer surpresa — recusa, formato de resposta, contagem de token nula — suspeite dele antes
de suspeitar do prompt.

---

## Arquivos

**Novos:** `_shared/pedidos.ts` (forma, validação, troca de literal — puro) ·
`_shared/pedidos.test.ts` (13) · `adhoc/planejador.ts` · `adhoc/interprete.ts` ·
`adhoc/prompts/a3_planejador.ts` · `adhoc/prompts/a4_interprete.ts`

**Editados:** `ai-plum-chat/index.ts` (`opcoes.lote` no `handleExecutePlan`, a coleta de vocabulário
e o A3 no `ad_hoc_planejar`, e a ação `ad_hoc_executar` inteira) · `src/pages/PlumChat.tsx` (o modo
sombra vira o caminho de verdade, com queda para o legado)

**Verificado:** `npm test` — **269 testes** · `npx tsc --noEmit` limpo · `npm run build` passa · lint
na baseline · os seis arquivos Deno passam pelo parser do esbuild.

⛔ **Não tocado:** `pandas_executor.py`, `query_plan.ts`, `dashboard-agent`, `ai-agents`.
