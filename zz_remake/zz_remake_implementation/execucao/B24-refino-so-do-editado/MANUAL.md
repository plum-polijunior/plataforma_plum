# B24 · O Agente 2 refina só o que você editou — manual do 👤

⭐ **O problema não era o custo, era o texto.** O "Refinar" mandava ao Agente 2 **todas** as
definições da base, inclusive as que você não tinha tocado. Você clicava pensando numa coluna e
voltava com doze frases reescritas — incluindo as que já estavam do jeito que você queria, e sem
nenhuma pista de quais mudaram.

⚠️ E o que se perde nessa reescrita é o que menos se recupera: *"lucro não inclui impostos"* é
conhecimento que só existe na sua cabeça. O dicionário existe para guardá-lo.

Fecha a **C16**.

**Front puro.** Sem migration, sem Edge Function, sem Lambda.

## Antes

Nada. Mas o **B23** é da mesma sessão e mexe na mesma tela — publique os dois juntos.

## Publicar

```sh
git push
```

## ⭐⭐ O que confirmar

### 1. No cadastro (etapa 4), o teste central

Cadastre uma base até a etapa 4 e deixe o Agente 1 descrever as colunas. **Sem editar nada**, olhe o
botão do rodapé.

⭐ Ele diz **"Nada editado para refinar"** e está desabilitado. Sem diferença em relação à saída do
Agente 1 não há o que melhorar, e a chamada só gastaria cota devolvendo o texto que já está na tela.

Agora edite **uma** definição — acrescente uma frase sua. O botão vira **"Refinar o que editei (1)"**.

Antes de clicar, **copie o texto de duas outras colunas**. Clique.

⛔ **O que tem de acontecer:** só a coluna que você editou muda. As duas que você copiou têm de estar
**caractere por caractere** iguais.

⚠️ É este o teste, e não "o refino funcionou": o defeito antigo não quebrava nada — ele reescrevia
texto aprovado, e passava despercebido porque nada na tela apontava o que mudou.

### 2. ⚠️ O rascunho carrega a linha de base

Edite uma definição, **saia do cadastro pelo meio** (feche a aba), volte e cole o mesmo link para
retomar o rascunho.

⭐ Na etapa 4, o botão tem de continuar dizendo **(1)** — a saída original do Agente 1 é guardada no
rascunho junto com o resto. Sem isso, retomar zeraria a memória do que foi editado e o refino voltaria
a mandar tudo.

ⓘ **Rascunho salvo antes desta versão não tem essa informação.** Nele o botão manda todas as
definições, como antes — é o comportamento anterior, deliberado. Sem linha de base não há diff, e
travar o botão deixaria alguém preso num rascunho válido.

### 3. ⚠️ Na base ativa é diferente — e mudou no mesmo dia

O "Editar Esquema" também tinha o defeito, e ganhou o conserto junto. **Mas horas depois a tela
inteira mudou** (I-15 / D-058): ela passou a gravar sozinha, e com isso o diff "o que editei desde o
último salvamento" ficaria sempre vazio.

⇒ Lá **não há botão em lote**. Cada coluna tem o seu **Melhorar**, ao lado do nome:

- clicar refina **aquela** definição só, e a alteração é gravada sozinha em seguida;
- coluna sem definição escrita é recusada — o Agente 2 melhora a redação do que **você** escreveu;
- ⛔ e não há desfazer. Se o texto voltar ruim, reescreva o campo (decisão registrada na D-058).

⭐ O efeito colateral bom: a IA nunca reescreve mais de uma definição por vez, então o estrago máximo
de um refino ruim é um campo — e não as doze que o defeito original produzia.

### 4. ⛔ O campo "Ordem para o Agente 2" sumiu, e é conserto

No Editar Esquema havia um campo *"Ordem para o Agente 2 (Opcional)"*. Ele **travava o botão quando
estava vazio** e **nunca era enviado** — a ação `refine_semantics` monta a entrada com as definições
e mais nada; não existe campo de prompt do outro lado.

⇒ Você escrevia uma ordem, ela era descartada, e o resultado não tinha relação com o que você pediu.

⭐ **E não foi consertado mandando a ordem.** O Agente 2 é o único agente do cadastro cuja entrada não
veio de dado nenhum: ele recebe texto humano e melhora a redação. O prompt dele diz, literalmente,
*"PRESERVE O CONTEÚDO. Você melhora a redação, não o conteúdo"* — porque a regra de negócio que você
escreveu é a única fonte daquilo. Um campo de ordem livre briga com esse papel, e mandá-lo exigiria
publicar `ai-agents`.

Se você quiser que uma definição diga outra coisa, **edite a definição**. O Agente 2 então melhora o
que você escreveu.

## Se algo der errado

| sintoma | causa provável |
|---|---|
| O botão fica sempre desabilitado | você não editou nenhuma **definição**. Trocar papel ou vocabulário não conta — o Agente 2 só mexe em texto |
| Refinei uma coluna e outra mudou também | ⛔ regressão: ou o envio voltou a ser total, ou a resposta está substituindo em vez de fazer merge |
| Refinei e **nenhuma** mudou | o Agente 2 achou que o texto já estava bom, ou devolveu chave que não bate com a coluna. O console do navegador traz a resposta crua |
| No cadastro o contador zera ao retomar rascunho | rascunho anterior a esta versão — comportamento esperado, manda tudo |
| Na base ativa não acho o botão "Refinar o que editei" | ele não existe lá — é um **Melhorar** por coluna. Ver o item 3 |
