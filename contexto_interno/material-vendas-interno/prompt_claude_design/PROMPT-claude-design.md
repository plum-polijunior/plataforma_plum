# Deck de vendas Plum — briefing de design

Você vai desenhar um deck de vendas de 15 slides, 16:9, em português do Brasil.

**Contexto de uso:** reunião presencial ou por vídeo com um decisor de empresa de médio porte,
conduzida por um vendedor. **Não é material de leitura autônoma.** O slide apoia a fala — quem
lê o slide não escuta o vendedor. Slide denso mata a reunião.

**O produto:** Plum, uma plataforma que permite perguntar em português sobre planilhas e
documentos da empresa, com garantia arquitetural de que a IA não inventa número.

**A tese que o deck inteiro defende:**

> Você já tentou jogar seus dados numa IA. Ela devolveu um número errado com muita confiança.
> O Plum é a camada que faz a IA acertar — e essa camada se constrói sobre a estrutura dos seus
> dados.

---

## Marca e assets

| | |
|---|---|
| **Cor principal** | vinho `#7A2F56` |
| **Fundo** | claro (branco ou off-white). Vinho é acento, nunca preenchimento de tela inteira |
| **Logo** | `logo-plum.png` · versões claras em `light-logo-plum.png` e `light-logo-plum-high-density.png` (usar sobre fundo escuro ou sobre imagem) |
| **Textura de fundo** | `net-background.png` · use com parcimônia, só na capa e no fechamento |
| **Print — a pergunta** | `print-prompt-dashboard.png` · caixa "Novo card" com a pergunta digitada |
| **Print — o resultado** | `print-dashboard.png` · gráfico "Receita por mês" com as variações anotadas |
| **Logos de parceiros** | pasta `logos/` — usar no slide 3 |
| **Institucional a reaproveitar** | PDF anexo, páginas 1, 2, 3, 4 e 5 |

---

## Regras globais

1. **Uma ideia por slide.** Se dois argumentos couberem, é porque falta um slide.
2. **Teto de ~30 palavras de corpo por slide.** Título não conta. Onde o texto abaixo passa
   disso, ele é para o campo de notas — está sempre marcado como **📝 Notas do apresentador**.
3. **Número grande.** Todo valor numérico é protagonista visual, nunca corpo de texto.
4. **Hierarquia:** título 40–54pt · corpo 18–22pt · legenda 12–14pt. Nada abaixo de 12pt.
5. **Sem foto de banco de imagens.** Diagrama, ícone de traço e print de produto.
6. **Ícones num único estilo**, de traço, na cor da marca.
7. **Slides reaproveitados do PDF** (1, 2, 3, 11, 15) mantêm o conteúdo e ganham o design novo.
8. ⛔ **Nenhum preço aparece no deck.** Valores ficam na proposta comercial.
9. **A copy abaixo é final.** Componha como está — não reescreva, não resuma, não ajuste o tom.

---

# Slide 1 · Capa

♻️ Reaproveitar a p.1 do PDF, com design novo e a logo nova (`logo-plum.png`).

**Substituir o subtítulo por:**

> Do dado à decisão, em segundos — o Plum é a camada que faz a IA acertar.

---

# Slide 2 · Quem é a Poli Júnior

♻️ Reaproveitar a p.2 do PDF. Mesmo conteúdo, design novo.

---

# Slide 3 · Empresas parceiras

♻️ Reaproveitar a p.3 do PDF. Grade de logos, respiro generoso, design novo.

---

# Slide 4 · O que acontece num chat de IA convencional

### Título
> **O que acontece ao colocar suas planilhas num chat de IA convencional?**

### Corpo — três blocos curtos, em sequência vertical

1. **Vai funcionar.** A resposta vem em segundos, bem escrita, com o número no meio da frase.
2. **E aí você conferiu um.** Estava errado.
3. **O problema não é ter errado. É você não ter como saber.**

### Visual
Um print estilizado de conversa com IA, ocupando o lado direito. Uma pergunta, uma resposta:

> **Tive alguma venda extraordinária em agosto?**
>
> *Sim. Suas vendas em agosto somaram **R$ 85.100** — **o melhor mês do semestre**, puxadas por
> um pico na segunda quinzena.*

Hierarquia de marcação, e ela é o argumento do slide:

1. `R$ 85.100` em **vermelho forte**, com um `✗` discreto ao lado — é o valor inventado.
2. `o melhor mês do semestre` e `puxadas por um pico na segunda quinzena` em **vermelho claro ou
   tracejado** — são conclusões derivadas do valor inventado, e caem junto com ele.

⚠️ **É essa gradação que faz o slide.** O risco não é um número errado solto: é uma **história
inteira construída sobre ele**, que o decisor lê e usa. Se tudo ficar em vermelho igual, o slide
diz "a IA errou um número" em vez de "a IA construiu uma narrativa falsa e convincente".

⚠️ **Este é um mock ilustrativo**, com visual neutro de chat. Não imite a interface de nenhum
produto real nem use marca de concorrente.

⚠️ `R$ 85.100` e `melhor mês do semestre` reaparecem nos slides 5 e 7. **Têm que ser exatamente
os mesmos** — é a continuidade que faz os dois próximos slides funcionarem.

Nada mais na tela.

---

# Slide 5 · Por que falhou — não é o prompt, é a arquitetura

### Título
> **Não é falta de prompt. É falta de arquitetura.**

### Corpo
> Modelo de linguagem prevê a próxima palavra. **Número, para ele, é palavra.**
>
> Ele soma no texto, arredonda no texto, e devolve com a mesma confiança de quando acerta.
>
> **Um número errado que parece certo não dispara alarme nenhum.**

A terceira linha é a mais importante do slide — trate-a como destaque tipográfico, não como
continuação do parágrafo.

### Visual principal — tabela de contraste, duas colunas

| IA sozinha | IA + Plum |
|---|---|
| a IA calcula | **a IA nunca calcula** |
| o número sai do texto | o número sai de um motor determinístico |
| infere o contexto com confiança, mesmo errando | só usa os contextos que vocês aprovaram |
| erro plausível, sem aviso | o erro é estruturalmente impossível |

Coluna direita com fundo vinho claro; esquerda em cinza.

### Faixa de destaque, no rodapé — caixa de citação com a etiqueta `caso real`

> Os R$ 85.100 do slide anterior: o modelo pegou 1.480 unidades e preço médio de R$ 57,50 e
> multiplicou os dois. **Isso só é receita se todo produto custar o mesmo** — e ali eles iam de
> R$ 2,50 a R$ 90,00. O número estava errado, **tinha a ordem de grandeza certa**, e o decisor
> não tinha como saber.

### 📝 Notas do apresentador
Esse erro aconteceu **no nosso próprio produto**, em agosto de 2026, e foi o que nos levou a
mudar a arquitetura: nenhum agente faz conta, nunca, mesmo quando os dois números estão na tela
e a multiplicação parece óbvia. Contar que o erro foi nosso é mais forte do que atribuí-lo a um
terceiro — demonstra que a defesa nasceu de dor real.

---

# Slide 6 · A solução: Plum

### Título
> **O Plum é o que falta entre a IA e os seus dados.**

### Visual — o diagrama é o slide inteiro

```
   DECISOR  ⇄  IA  ⇄  PLUM  ⇄  PLANILHAS
                                + DOCUMENTOS
```

Rótulos nas setas:

- entre **DECISOR** e **IA**: *pergunta em português, interpreta o resultado*
- entre **IA** e **PLUM**: *calcula, confere contra o dicionário, aplica permissão e devolve o
  número pronto*
- na seta final: selo **`somente leitura`**

⚠️ **`+ DOCUMENTOS` fica pequeno e discreto.** É só uma semente para o slide 9. Se ganhar peso
visual aqui, a plateia pergunta sobre documentos agora e o argumento central se perde.

### Legenda, uma linha, abaixo do diagrama
> A IA pergunta. O Plum calcula. **A conta nunca sai do texto.**

### 📝 Notas do apresentador
Pergunta que sempre vem: *"por que a própria IA não faz isso?"* Resposta: porque a garantia
depende do negócio, não do modelo. O que "faturamento" significa aqui, qual das duas colunas de
data vale, que o mês fecha no dia 25 — isso é o dicionário da operação do cliente. Nenhum modelo
genérico vem com o significado dos dados dele dentro.

---

# Slide 7 · Na prática

⭐ **É o único slide do deck com imagem real do produto** — os demais são diagrama, tabela e
tipografia. Depois de dois slides de abstração, a plateia precisa ver a coisa funcionando, e é
aqui ou em lugar nenhum. Trate-o como o slide de maior peso visual do deck.

### Título
> **A mesma pergunta. Agora com o número certo.**

### Visual — os dois prints reais, em sequência, com uma seta entre eles

**Esquerda:** `print-prompt-dashboard.png` — a caixa "Novo card", com a pergunta em português
digitada pelo usuário.

**Direita:** `print-dashboard.png` — o gráfico "Receita por mês", com os valores e a variação
percentual mês a mês já anotados.

Sobre o print da direita, chame atenção para **agosto: R$ 28,8 mil, −61%** com um marcador
discreto na cor da marca.

### Fecho do slide — a linha que fecha o argumento dos slides 4 e 5
> A IA disse que agosto foi o melhor mês do semestre. **Foi o pior, com queda de 61%.**
> Essa é a diferença entre um número escrito e um número calculado.

⚠️ Os prints são de tela real e o gráfico usa azul, fora da paleta da marca. **Não recolora o
print** — autenticidade vale mais que consistência cromática aqui. Compense com moldura,
sombra e fundo na cor da marca.

---

# Slide 8 · Onde mora o trabalho: o dicionário

### Título
> **A garantia não vem do software. Vem de estruturar seus dados.**

### Corpo — três etapas, com **peso visual crescente**

⭐ **A hierarquia é o slide.** 01 e 02 são pequenos e discretos; **03 é grande, em destaque, com
fundo na cor da marca.** Os dois primeiros existem para dar escala ao terceiro — se os três
tiverem o mesmo peso, o slide volta a ser uma lista e nada fica.

> **01 · Padronizar**
> Entedemos a estrutura dos seus dados e os jargões utilizados, formatando e limpando os valores **antes de fazer qualquer cálculo**.
>
> **02 · Explicar**
> Escrevemos com o seu time o que cada dado significa aqui dentro: o que conta como faturamento,
> qual data vale, o que nunca se soma.
>
> **03 · Encontrar** ⭐
> Conecte todas as suas planilhas, o PLUM cruza os dados de todas. "Consigo pagar as dívidas de hoje? (Pega os dados que está em fluxo_de_caixa.xlxs e compara com a dívida em orcamento.xlxs)

⭐ **Uma frase fecha o slide inteiro**, logo abaixo do bloco 03, ligando visualmente os três:

> **E ele só sabe porque os passos 1 e 2 ensinaram.**

⚠️ O rodapé abaixo é faixa discreta — não compete com o bloco 03.

### Fecho, faixa discreta no rodapé
> Isso é o **onboarding de dados**: semanas de trabalho com o seu time. O entregável é seu — e é
> o que faz o Plum funcionar.

⚠️ O rodapé não compete com o bloco 03. Ele existe só para o decisor entender que há um projeto
com duração.

---

# Slide 9 · A regra está no contrato. O número está na planilha.

### Título
> **A regra está no contrato. O número está na planilha.**

### Visual — o cruzamento ocupa o centro do slide

```
   📄 CONTRATO                      📊 PLANILHA DE VENDAS
   cláusula 7.2                     12.400 linhas
   "desconto máximo de 15%"         jan – ago

                    ↘           ↙
                      [ logo ]
                         ↓
         37 vendas violaram o contrato · R$ 84.200
              ↳ cláusula 7.2, pág. 4   [ver trecho]
```

Duas fontes convergindo em um resultado. **O nó central é a logo do Plum** (`logo-plum.png`),
não um ícone genérico. `R$ 84.200` é o maior elemento tipográfico do slide.

⚠️ **`[ver trecho]` precisa parecer clicável** — botão ou link, na cor da marca. É o detalhe que
sustenta o fecho do slide, não é ornamento.

### Faixa inferior — três cruzamentos, uma linha cada, ícone pequeno
> **Fornecedor** — *o reajuste aplicado nas notas ficou acima do índice que o contrato define?*
> **Crédito** — *quais clientes estão acima do limite que a nossa própria política permite?*
> **Logística** — *quantas entregas estouraram o SLA escrito no contrato, e o que isso custou?*

### Fecho do slide
> **O documento diz a regra. O motor faz a conta. E o Plum mostra de qual cláusula a regra veio.**

### 📝 Notas do apresentador
O documento entra como **fonte de regra**, nunca como objeto de análise — resumir contrato a IA
generativa já faz muito bem, e não é aí que está o nosso valor. O parâmetro extraído da cláusula
é tratado como presunção e aparece sempre na resposta, com a citação literal e o link para o
trecho: *"apliquei desconto máximo de 15%, extraído da cláusula 7.2, pág. 4"*. Nenhum chat
genérico consegue dizer de onde veio a regra que aplicou.

---

# Slide 10 · Quando o Plum entra *(opcional)*

⚠️ Este slide é o primeiro a cair quando a reunião está curta. Desenhe de forma que a remoção
não quebre a sequência visual.

### Título
> **Quando ninguém vai alocar um analista.**

### Corpo — dois casos, lado a lado

> **Cinco minutos antes da reunião.**
> A pergunta é simples, a resposta está na base, e não dá tempo de pedir para ninguém. Ele
> pergunta e entra na sala com o número.
>
> **A análise que nunca vira prioridade.**
> Precisa cruzar quatro coisas para uma decisão de médio porte. Não justifica abrir uma demanda
> — então a decisão sai sem o dado.

---

# Slide 11 · Case Vital Brasil

♻️ Reaproveitar a p.4 do PDF, com design novo.

⚠️ **Este case não tem número de antes-e-depois.** Trate-o como depoimento e credibilidade — não
force uma métrica na arte, e não use layout que pareça estudo de resultado.

---

# Slide 12 · O custo de hoje

### Título
> **Quanto custa hoje uma resposta sobre seus dados?**

### Visual — tabela para o vendedor **preencher ao vivo**, com o cliente

A coluna "Hoje" precisa ter espaço em branco visível, com cara de campo a preencher.

| | Hoje | Com Plum |
|---|---|---|
| Tempo até a resposta | | minutos |
| Analistas envolvidos | | 1 — você |
| Perguntas que ninguém faz porque dá trabalho | | — |
| Decisões tomadas sem o dado no último trimestre | | — |

### Fecho
> **A terceira linha é a mais cara das quatro** — e é a única que não aparece em relatório de
> custo nenhum.

### 📝 Notas do apresentador
Preencher junto, em voz alta, nunca chegar com a tabela pronta — número que o cliente diz é
número que ele defende internamente depois. Ancore em **decisão atrasada** e **pergunta não
feita**: é o que dói, e é o que o Plum realmente muda.

---

# Slide 13 · Segurança e governança

Slide de tranquilidade — aqui a densidade é aceitável.

### Título
> **O seu TI continua no controle.**

### Corpo — cinco selos, cada um com ícone

| | |
|---|---|
| 🔒 **Somente leitura, por arquitetura** | o Plum nunca escreve na sua planilha nem no seu documento. Escopo de leitura, e nada além |
| 👁️ **Permissão por coluna** | o vendedor vê venda, o diretor vê margem. Default é **nada** — libera-se explicitamente |
| 📄 **Permissão por documento** | o contrato do jurídico não responde ao comercial. Mesmo default: nada |
| 📋 **Trilha de auditoria** | toda mudança de acesso fica registrada, e o registro não é editável |
| 🧮 **Motor determinístico** | o número é calculado em Python, nunca escrito pelo modelo — e toda regra vinda de um documento mostra a cláusula de origem |

### Fecho
> **Você compartilha suas planilhas e documentos com o Plum como leitor. A governança continua
> sendo sua.**

---

# Slide 14 · Para onde isso vai

### Título
> **O mesmo motor, cada vez mais perto do seu negócio.**

### Corpo — quatro blocos
> **Agentes por vertical** — as análises típicas do seu setor entram no seu catálogo sem projeto
> novo: decomposição de variação, comparação de período, curva de produto.
>
> **Onde você já está** — a pergunta sai do navegador e vai para o WhatsApp. Mesmo motor, mesma
> permissão, mesma garantia.
>
> **Uma pergunta, várias planilhas** — hoje o Plum encontra a planilha certa. O próximo passo é
> cruzar duas na mesma resposta: *"o desconto de cada vendedor cabe na meta da região dele?"*
>
> **Interpretação, não só consulta** — *"se minha glosa subir para 50 mil, minha margem vai para
> quanto?"*

### Visual
Slide tipográfico, sem print: três colunas ou três faixas, cada uma com um ícone de traço na cor
da marca. Sem imagem de produto — a evidência visual do produto já foi dada no slide 7.

⚠️ **Reserve, na coluna "Onde você já está", um espaço com proporção de tela de celular em pé.**
Um print de conversa no WhatsApp entra ali numa próxima versão, e o layout precisa aceitá-lo sem
redesenho. Por ora, deixe o espaço ocupado por um ícone grande de conversa — **nunca** por um
mockup genérico de celular com tela falsa.

---

# Slide 15 · Fechamento e próximo passo

♻️ Reaproveitar a p.5 do PDF, com design novo, **e acrescentar na parte de baixo:**

> **Próximo passo:** uma sessão de 1 hora com quem cuida das suas bases hoje. Saímos dela com o
> mapa das suas planilhas e dos contratos que governam elas, e uma estimativa de escopo do
> onboarding — sem custo.

O próximo passo precisa de destaque visual próprio, em bloco separado. É a última coisa que a
sala lê.

---

## Entregável

Deck de 15 slides em 16:9, editável, com o texto acima composto exatamente como está. Campo de
notas preenchido nos slides que trazem o bloco **📝 Notas do apresentador**.
