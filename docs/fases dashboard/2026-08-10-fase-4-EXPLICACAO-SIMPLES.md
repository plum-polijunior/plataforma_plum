# O Dashboard do Plum, explicado de forma simples

Companheiro do plano da Fase 4
(`2026-08-10-fase-4-PLANO-pagina-inicial.md`). O plano diz *como fazer*. Este aqui
diz *o que é*, para quem nunca abriu o código.

---

## A ideia em uma frase

**A Página Inicial é um mural de perguntas que se respondem sozinhas.**

Você pergunta uma vez. A resposta fica lá, no mural, e se atualiza sem você
perguntar de novo.

---

## O Plum é um restaurante

Essa é a única imagem que você precisa guardar. Todo o resto é detalhe dela.

```
   VOCÊ            O GARÇOM            A COZINHA
   pergunta   →    escreve a      →    faz a conta
                   comanda
                   (a IA)             (o Python)
```

**Você** faz o pedido: *"quanto vendemos por loja?"*

**O garçom é a inteligência artificial.** Ele entende o que você quis dizer e
escreve uma comanda — uma listinha do que precisa ser feito. **O garçom nunca
cozinha.** Ele não sabe cozinhar, e se tentasse, inventaria o prato.

**A cozinha é um programa de computador** (chamado Python). Ela não conversa, não
opina e não inventa. Ela só faz exatamente o que está escrito na comanda. Por isso a
conta sempre sai certa.

> **A regra mais importante do Plum inteiro:** a IA **planeja**, o computador
> **calcula**. Nenhum número que você vê na tela saiu da cabeça da IA.

Isso existe porque inteligência artificial é ótima para entender frases e **ruim
para fazer contas** — ela às vezes chuta um número com toda a confiança do mundo. O
computador comum nunca chuta.

---

## O que é um "card"

Um card é **uma pergunta guardada**.

Quando você gosta de uma resposta, você fixa ela no mural. Aí o Plum refaz aquela
mesma conta sozinho, de tempos em tempos, e o número no mural fica sempre novo.

Um card tem: um **título** (que você escolhe), um **desenho** (número grande ou
gráfico de barras) e a **comanda** guardada.

---

## Como um card nasce

1. Você clica em **"Novo card"** e escreve a pergunta.
2. O garçom escreve a comanda.
3. **Aparece uma prévia**: você vê o número antes de qualquer coisa ser salva.
4. Se estiver bom, você clica em **Publicar**. Só aí o card vai para o mural.

Se você fechar sem publicar, nada é salvo. Nada acontece.

Isso existe porque o card fica visível para **toda a empresa**, e se atualiza para
sempre. Um card errado não é um erro só seu — é um número errado na cara de todo
mundo, todo dia. Melhor conferir antes.

---

## O segurança na porta

Nem todo mundo pode ver tudo.

Cada cargo na empresa tem permissão para ver certas colunas da planilha. O estagiário
pode ver "vendas"; talvez não possa ver "salário".

Antes de qualquer conta ser feita, **um segurança confere a lista**: as colunas que
essa comanda usa estão liberadas para o seu cargo?

- **Sim** → a comanda vai para a cozinha.
- **Não** → o card aparece **sem número nenhum**, com um aviso.

E repare no detalhe: quando falta permissão, o Plum **não** faz a conta escondendo a
coluna proibida. Ele se recusa a fazer. Porque um número calculado pela metade
pareceria certo, e ninguém perceberia que estava errado.

Uma coisa que vale saber: **o título do card todo mundo vê**, mesmo quem não pode ver
o número. Então ninguém deve escrever segredo no título.

---

## Por que a resposta às vezes tem 15 minutos de idade

A planilha mora no Google. E o Google tem um limite: **60 pedidos por minuto**.

Se cada pessoa que abrisse o mural fizesse o Plum ler a planilha inteira de novo, seis
pessoas ao mesmo tempo já estourariam esse limite — e aí ninguém veria nada.

Então o Plum guarda a resposta por um tempinho e mostra a guardada. É como um prato na
estufa: pronto, quentinho, feito há pouco.

Para não enganar ninguém, **o card sempre mostra a idade dele**: *"calculado há 4
min"*. E tem um botão de recarregar (⟳) para quem precisa do número agora.

E se a cozinha estiver fora do ar? O card mostra o **último número que deu certo**,
com a idade escrita. Nunca uma tela de erro vermelha. Um número de uma hora atrás é
mais útil que um erro.

---

## Uma coisa que ainda não dá

**"Faturamento por mês" ainda não funciona.**

Motivo: a planilha guarda a data completa (`05/01/2026`), e a cozinha ainda não sabe
juntar dias em meses. Ela sabe agrupar por coisas que já estão escritas na planilha —
por loja, por produto, por vendedor, por forma de pagamento.

Dá para **filtrar** um período ("vendas de 12 a 16 de janeiro"). O que não dá é
**agrupar** por mês de uma vez só.

Isso vai ser resolvido, mas em uma etapa própria: mexer nisso encosta em uma peça
delicada do sistema — a mesma que confere as permissões. Fazer pela metade abriria um
buraco de segurança. Então é melhor fazer direito depois do que rápido agora.

---

## E a privacidade?

Três coisas que valem saber:

1. **A planilha continua sendo sua.** O Plum só lê, nunca escreve, nunca apaga.
2. **A IA nunca vê as linhas.** Ela vê os *nomes* das colunas e o que elas
   significam — nunca o conteúdo. O garçom lê o cardápio, não a despensa.
3. **Só o resultado somado sai da cozinha.** O Plum é proibido de devolver a lista de
   linhas. Sempre um total, uma média, uma contagem — nunca "aqui estão as 40 vendas,
   uma por uma".

*(Uma exceção honesta: na hora de **cadastrar** uma planilha nova, 5 linhas de
exemplo são enviadas para a IA entender o formato das colunas. Isso é um problema
conhecido, está anotado, e é de outra parte do sistema — não do dashboard.)*

---

## Como vamos construir, na ordem

Cada passo só começa quando o anterior estiver funcionando.

| | Passo | O que acontece |
|---|---|---|
| **−1** | Arrumar a mesa de teste | Uma planilha de mentirinha, numa empresa de teste. Nenhum dado de cliente real é usado |
| **0** | Ver se a cozinha liga | Um card feito à mão, para provar que a máquina funciona antes de construir a tela |
| **1** | Avisar o código das tabelas novas | Detalhe técnico, cinco minutos |
| **2** | Criar a aba | A página existe, ainda vazia |
| **3** | Mostrar os cards | A primeira vez que aparece algo de verdade na tela |
| 🛑 | **PARADA** | Você olha, no seu computador, e diz se ficou bom. Nada continua sem esse "ok" |
| **4** | Botão de criar card | Com a prévia antes de publicar |
| **5** | Arrumar o mural | Apagar, reordenar, renomear, recarregar |
| **6** | Abrir a porta | A aba aparece no menu para todo mundo |

---

## Os dois botões de emergência

Este projeto já quebrou uma vez. Então o plano tem duas saídas.

**A porta fica fechada até o fim.** A página existe desde o passo 2, mas **não
aparece no menu**. Só quem sabe o endereço entra. O menu só ganha o botão no passo 6,
depois de tudo testado — e desfazer isso é apagar uma linha.

**Nada do que já funciona é tocado.** O chat, a calculadora e a peça que confere
permissões não mudam **nenhuma linha**. Tudo o que esta fase faz é somar arquivos
novos. Se der errado, some o que foi somado e o resto continua igual.

---

## Resumindo em cinco frases

1. Um card é uma pergunta guardada que se responde sozinha.
2. A IA escreve a comanda; o computador faz a conta. A IA nunca inventa número.
3. Um segurança confere as permissões antes — e recusa em vez de responder pela
   metade.
4. A resposta pode ter alguns minutos, e o card diz quantos.
5. Nada do que já funciona hoje é alterado.
