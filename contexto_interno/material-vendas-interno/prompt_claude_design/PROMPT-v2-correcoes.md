# Deck Plum — v2 · correções sobre o deck existente

Você já produziu `Deck Plum.dc.html`, com 15 slides. **Este documento não recomeça o deck** — ele
descreve as alterações da v2. Tudo que não está aqui permanece exatamente como está.

**O que muda, em uma frase:** o deck hoje argumenta "IA sozinha × IA com Plum", que é uma
comparação de recurso. A v2 posiciona o Plum como **camada de infraestrutura** — o lugar por onde
os dados da empresa passam — e só depois entra na comparação.

---

## 1. Tese nova (global)

> **Do dado à decisão, em segundos.**
> **O Plum é o integrador da sua base de dados, e a camada que faz a IA acertar.**

Substitui as duas linhas do bloco vinho da **capa** (slide 01).

⚠️ **"Integrador" precisa ser definido pelo próprio deck**, no slide 05 novo. Sem definição, o
ouvinte preenche a palavra com "conector para o meu ERP", que não é o que o produto faz. O slide
05 existe em boa parte para controlar essa interpretação.

## 2. Mudança de vocabulário (global, slides 06 a 10)

O deck fala em "planilhas" onde deveria falar em **fontes de dados**. Trocas exatas:

| Onde | De | Para |
|---|---|---|
| Slide 06, título | "ao colocar suas **planilhas** num chat de IA convencional?" | "ao colocar **os dados da sua empresa** num chat de IA convencional?" |
| Slide 08, diagrama, último nó | "PLANILHAS + DOCUMENTOS" | "**SEUS DADOS** · planilhas · sistemas · documentos" |
| Slide 10, bloco 03 | "Conecte todas as suas planilhas" | "Conecte **todas as suas fontes**" |
| Slide 10, rodapé | mantém "onboarding de dados" | — |

⚠️ **Não troque em massa.** O slide 09 ("Na prática") usa prints reais de planilha, e o slide 11
fala de contrato — nesses dois, "planilha" é literal e correto.

## 3. Numeração

Dois slides novos entram **antes** do atual 04. Tudo que vem depois desloca em dois:

| Antes | Depois | Slide |
|---|---|---|
| — | **04** | 🆕 A dor |
| — | **05** | 🆕 O integrador |
| 04 → | 06 | Chat convencional |
| 05 → | 07 | Arquitetura |
| 06 → | 08 | A solução |
| 07 → | 09 | Na prática |
| 08 → | 10 | O dicionário |
| 09 → | 11 | Contrato × planilha |
| 10 → | 12 | Quando o Plum entra |
| 11 → | 13 | Case V.tal |
| 12 → | 14 | O custo de hoje |
| 13 → | 15 | Segurança |
| 14 → | 16 | Para onde vai |
| 15 → | 17 | Fechamento |

Atualize `data-screen-label` de todos.

---

# 🆕 Slide 04 · A dor

**Função:** nomear o custo do problema **antes** de falar de IA. Hoje o deck abre a argumentação
já dentro de uma discussão sobre modelos — o decisor precisa reconhecer o próprio problema
primeiro.

### Título
> **Você já tem o dado. E decidiu sem ele.**

### Corpo — três linhas, ritmo crescente

> O dado está lá. Você pagou para coletar, pagou para armazenar, e ele continua lá.
>
> Mas está no ERP, no CRM, em quatro planilhas e num contrato que ninguém abre.
>
> **Então a decisão sai sem ele — e ninguém registra que saiu.**

### Visual
Fontes dispersas, **sem** nenhum ponto de convergência: caixas soltas e desalinhadas, ligadas por
nada, ocupando o espaço de forma desconfortável. Rótulos: `ERP` · `CRM` · `Vendas_2026.xlsx` ·
`Base consolidada` · `Contrato fornecedor` · `Financeiro_v3`.

⭐ **O vazio no centro é o slide.** O slide 05 vai preencher exatamente esse centro com o Plum —
os dois precisam ser lidos como o mesmo desenho, antes e depois. Use a mesma disposição das caixas
nos dois.

### Fecho, discreto no rodapé
> Não falta dado. Falta o dado chegar a tempo, junto, e certo.

### 📝 Notas do apresentador
Não é sobre consulta ser trabalhosa — isso é incômodo, e incômodo não compra projeto. É sobre
decisão tomada no escuro numa empresa que **já pagou** pelo dado. Se a sala reagir a este slide, o
resto da apresentação corre sozinha.

---

# 🆕 Slide 05 · O integrador

**Função:** definir "integrador" nos termos do produto, antes que o ouvinte defina sozinho.

### Título
> **O Plum é o lugar por onde seus dados passam.**

### Visual — o mesmo desenho do slide 04, agora com centro

Idêntica disposição de caixas, agora todas ligadas a um nó central com a logo do Plum, e uma única
saída do nó para a direita, rotulada **`uma pergunta`**.

A transição entre 04 e 05 deve ser lida como **a mesma imagem ganhando um centro**.

### Três selos abaixo do diagrama

| | |
|---|---|
| **Conecta** | planilhas, sistemas e documentos, cada um como uma fonte |
| **Unifica** | a mesma informação passa a ter um nome só, entre fontes diferentes |
| **Responde** | uma pergunta em português, e o número calculado por um motor determinístico |

### Fecho, destacado
> **E nada muda de lugar.** Seus sistemas continuam onde estão, do jeito que estão. O Plum lê —
> nunca escreve.

⭐ Essa é a frase mais importante do slide. Componha com peso — é ela que separa o Plum de um
projeto de migração, que é o que o ouvinte teme quando escuta "integrador".

### 📝 Notas do apresentador
⚠️ **Integração aqui é de significado, não de sistema.** O Plum não substitui o ERP nem exige
projeto de TI: cada fonte entra como uma base, e o que as unifica é o dicionário — é por isso que
o slide 10 existe. Para um sistema que não é planilha, o caminho hoje é uma exportação
programada; se perguntarem, diga isso com naturalidade, porque **é uma vantagem**: não há projeto
de integração, não há fila do time de TI deles, e a governança não muda.

---

## Slide 16 (era 14) · Para onde vai

**a)** Trocar *"Dashboards automáticos em tempo real"* por
**"Dashboards que se atualizam sozinhos"**. ⚠️ "Tempo real" não é verdade — o card recalcula no
intervalo configurado, e há cache de 15 minutos. É a palavra que o TI cobra na implantação.

**b)** Troque "Interpretação, não só consulta" de lugar com "Onde você já está"

## Slide 17 (era 15) · Fechamento

**a)** Inverter a hierarquia visual. Hoje `Obrigado!` está em 92px e o bloco **Próximo passo**
aparece subordinado. Reduza o "Obrigado!" para ~56px e dê ao bloco do próximo passo o maior peso
da tela. A última coisa que a sala lê tem de ser o pedido, não a cortesia.
