# Deck de vendas Plum — estrutura por slide

**Para:** Claude Design · **Marca:** vinho `#7A2F56`, fundo claro, a nova logo do PLUM será ![alt text](image-2.png) (não será mais a nuvem roxa com uma seta apontando para fora)
**Formato:** 16:9 · **Contexto de uso:** reunião com decisor, apresentado por vendedor (não é
material de leitura autônoma — slide denso mata a reunião)
---
OBSERVAÇÕES
# O que eu preciso de você antes do design

| # | O que falta | Por quê |
|---|---|---|
| 1 | O case Vital Brasil tem número de antes-e-depois? | decide se o slide 9 é prova ou depoimento — e se o 10 pode se apoiar nele | -> NÃO
| 2 | O WhatsApp está no ar, em piloto, ou é roadmap? | muda o verbo do slide 12, e prometer errado custa a renovação | -> NO AR
| 3 | O onboarding vai aparecer com preço no deck ou só na proposta? | se não aparecer, o slide 7 precisa pelo menos dizer "projeto com escopo e prazo" | -> NA PROPOSTA
| 4 | Tem print real do produto? | o slide 12 sem tela real perde a maior parte do efeito |
![alt text](image.png)
![alt text](image-1.png)
---

## ⭐ A tese do deck, em uma frase

> **Você já tentou jogar seus dados numa IA. Ela te devolveu um número errado com muita
> confiança. O Plum é a camada que faz a IA acertar — e essa camada é construída sobre a
> estrutura dos seus dados.**

Todo slide novo existe para avançar essa frase. Se um slide não avança, ele sai.

---

## Mapa

| # | Slide | Origem |
|---|---|---|
| 1 | Capa | ♻️ PDF p.1 |
| 2 | Quem é a Poli Júnior | ♻️ PDF p.2 |
| 3 | Empresas parceiras | ♻️ PDF p.3 |
| 4 | **Você já tentou isso** | 🆕 |
| 5 | ⭐ **Por que falhou: não é o prompt, é a arquitetura** | 🆕 |
| 6 | **A solução: Plum** | 🆕 |
| 7 | ⭐ **Onde mora o trabalho: o dicionário** | 🆕 *(slide que faltava)* |
| 8 | ⭐ **A regra está no contrato. O número está na planilha.** | 🆕 *(documentos)* |
| 9 | Quando o Plum entra *(opcional)* | 🆕 |
| 10 | Case Vital Brasil | ♻️ PDF p.4 |
| 11 | O custo de hoje × o custo com Plum | 🆕 |
| 12 | Segurança e governança | 🆕 |
| 13 | Para onde isso vai | 🆕 |
| 14 | Fechamento e próximo passo | ♻️ PDF p.5 |

⚠️ **14 no papel, 13 na reunião** — o 9 é opcional e é o primeiro a cair quando o tempo aperta.

---

# Slides 1–3 · reaproveitar sem mexer

Capa, institucional da PJ, logos de parceiros. A credibilidade
institucional é o que compra os primeiros 90 segundos, e ela já está pronta.

**Apenas alterar o design**, 

⚠️ Uma exceção: troque o subtítulo da capa por "Do dado à decisão, em segundos: o PLUM é camada que faz a IA acertar"

---

# Slide 4 · O que acontece se você colocar suas planilhas e documentos na IA? //"Você já tentou fazer isso" só atinge o público que já tentou fazer isso.

**Função:** fazer o decisor se reconhecer. Ele provavelmente já colou uma planilha num chat de
IA, ou pelo menos pensou em fazer isso. Comece de onde ele já está, não de onde você quer chegar.

### Título
> **O que aconteceu ao colocar suas planilhas num chat de IA convencional?**

### Corpo (três blocos curtos, em sequência visual)

1. **Vai funcionar** — a resposta veio em segundos, bem escrita, com o número no meio da frase.
2. **E aí você conferiu um.** Estava errado.
3. **O problema não é ter errado. É que você não tinha como saber.**

### Visual
Um print estilizado de conversa com IA: pergunta simples ("tive alguma venda extraordinária em agosto?"), resposta confiante com um valor. **O valor destacado em vermelho, com um "✗" discreto
ao lado.** Nada mais na tela.

---

# Slide 5 · ⭐ Por que falhou — não é o prompt, é a arquitetura

**Função:** este é o slide mais importante do deck. É onde você deixa de ser fornecedor de
ferramenta e passa a ser quem entende o problema.

### Título
> **Não é falta de prompt. É falta de arquitetura.**

### Corpo

> Modelo de linguagem prevê a próxima palavra. **Número, para ele, é palavra.**
>
> Ele soma no texto, arredonda no texto, e devolve com a mesma confiança de quando acerta.
>
> **Um número errado que parece certo não dispara alarme nenhum.**

### Visual
Duas colunas, contraste direto:

| IA sozinha | IA + Plum |
|---|---|
| a IA calcula | ⭐ **a IA nunca calcula** |
| número sai do texto | número sai de um motor determinístico |
| erro plausível, sem aviso | o erro é estruturalmente impossível |
| infere o contexto com confiança, mesmo que esteja errado | só usa contextos aprovados pelos decisores |

Caso real de alucinação com um cliente nosso antes do plum: *"em uma empresa de varejo, o modelo calculou a receita do mês multiplicando 1.480 unidades e preço médio de R$ 57,50 e respondendo R$ 85.100 de faturamento com confiança. Mas isso só funciona se a quantidade vendida por a mesma e, na base real, os preços dos produtos iam de R$ 2,50 a R$ 90,00. O número estava errado, tinha a ordem de grandeza certa e o decisor não tinha como saber."*

---

# Slide 6 · A solução: Plum

**Função:** o produto em quatro caixas. Um slide, um diagrama, quase nenhum texto.

### Título
> **O Plum é o que falta entre a IA e os seus dados.**

### Visual — o diagrama (é o slide inteiro)

```
   DECISOR  ⇄  IA  ⇄  PLUM  ⇄  PLANILHAS
              │       │        + DOCUMENTOS
              │       └─ calcula, aplica permissão, devolve o número pronto, checa contexto
              └─ pergunta em português, interpreta o resultado
```

⚠️ **"+ DOCUMENTOS" fica pequeno e sem destaque aqui.** É só uma semente para o slide 8 — se
ganhar peso visual neste slide, a sala pergunta sobre documentos agora e você perde o fio do
argumento central.

Rótulos nas setas, e um selo na última: **`somente leitura`**.

### Legenda, uma linha
> A IA pergunta. O Plum calcula. **A conta nunca sai do texto.**

### 💬 A pergunta que sempre vem, e a resposta
*"Por que a própria IA não faz isso?"*

> **Porque a garantia depende do seu negócio, não do modelo.** O que "faturamento" significa
> aqui, qual das suas duas colunas de data vale, que o seu mês fecha no dia 25 — isso não é
> capacidade de modelo, é o dicionário da sua operação. **Nenhum modelo genérico vem com o
> significado dos seus dados dentro.**

⭐ Essa é a resposta que sustenta o preço, e é o melhor argumento competitivo do deck. Ensaie.

---

# Slide 7 · ⭐ Onde mora o trabalho: o dicionário

**Função:** ⭐ Sem esse slide, o deck vende uma plataforma e o orçamento cobra um projeto — e a surpresa aparece na
proposta, que é o pior lugar possível.

### Título
> **A garantia não vem do software. Vem de estruturar seus dados.**

### Corpo — as quatro camadas, como entregável

| Camada | O que a gente escreve com você |
|---|---|
| **Colunas** | o que cada campo é, de verdade |
| **Valores** | que `F` é faturado e `PP` é parcialmente pago |
| **Relações e grão** | uma linha é um pedido ou um item? *(é aqui que quase todo relatório erra)* |
| **Regras** | suas fórmulas, seu calendário fiscal, o que nunca se soma |

### Fecho do slide
> Isso é o **onboarding de dados**: um estudo extenso da sua inteligência de negócios escritos em código, e o entregável é
> seu. **É também o que faz o Plum funcionar** — e o que nenhuma ferramenta de prateleira entrega.

### Por que este slide é o que mais protege a venda
As quatro vendas fechadas compraram **exatamente isso**. Nomear o trabalho, precificá-lo e
transformá-lo em entregável assinado converte "o software é caro" em "o projeto tem escopo".

---

# Slide 8 · ⭐ A regra está no contrato. O número está na planilha.

**Função:** abrir a segunda fonte de dados — **sem** transformar o Plum em leitor de documentos.
Os documentos entram no deck **como fontes de regra**, e não como objeto de análise. Análise de documentos os modelos de 
IA generativa já fazem muito bem.

### Título
> **A regra está no contrato. O número está na planilha.**

### Visual — o slide inteiro é um cruzamento, com números reais

```
   📄 CONTRATO                    📊 PLANILHA DE VENDAS
   cláusula 7.2                   12.400 linhas
   "desconto máximo de 15%"       jan – ago
                    ↘         ↙
                     🍇 PLUM
                        ↓
        37 vendas violaram o contrato · R$ 84.200
              ↳ cláusula 7.2, página 4  [ver trecho]
```

⭐ **O "[ver trecho]" não é enfeite — é o slide.** Ver a justificativa no bloco de arquitetura
abaixo, porque ele é o que impede a feature nova de furar a promessa do slide 5.

### Faixa inferior — três cruzamentos, uma linha cada
Para que qualquer prospect se reconheça em pelo menos um:

> **Fornecedor** — *o reajuste aplicado nas notas ficou acima do índice que o contrato define?*
> **Crédito** — *quais clientes estão acima do limite que a nossa própria política permite?*
> **Logística** — *quantas entregas estouraram o SLA escrito no contrato, e o que isso custou?*

### Fecho do slide
> **O documento diz a regra. O motor faz a conta. E o Plum mostra de qual cláusula a regra veio.**

## Arquitetura:
O parâmetro extraído do documento é uma
**presunção**, não um fato — e presunção no Plum é sempre visível, com a fonte ao lado.

> *"Apliquei desconto máximo de **15%**, extraído da cláusula 7.2 (pág. 4). [ver trecho]"*

Três consequências que eu trataria como requisito, não como refinamento:

1. **Todo parâmetro vindo de documento aparece na resposta**, com a citação e o link para o
   trecho. Nunca embutido em silêncio no cálculo.
2. **O trecho citado é recuperado literalmente do documento**, não reescrito pelo modelo. Ou é
   verificável, ou não é citação.
3. **Existe o gesto de "não é essa cláusula"** — o mesmo mecanismo de correção de presunção que
   o chat já precisa ter.

⚠️ **E isso vira argumento de venda, não ressalva:** "toda regra aplicada mostra de onde veio"
é uma frase que nenhum chat genérico pode dizer. O furo, bem resolvido, é o diferencial.

## Segurança

**Permissão por coluna existe para planilha. O equivalente para documento é a permissão por documento**

## A feature já existe e está no ar

---

# Slide 9 · Quando o Plum entra *(opcional — corte se a reunião estiver curta)*

### Título
> **Quando ninguém vai alocar um analista.**

### Corpo — **dois** casos, não quatro

> **Cinco minutos antes da reunião.**
> A pergunta é simples, a resposta está na base, e não dá tempo de pedir para ninguém. Ele
> pergunta e entra na sala com o número.
>
> **A análise que nunca vira prioridade.**
> Precisa cruzar quatro coisas para uma decisão de médio porte. Não justifica abrir uma
> demanda — então a decisão sai sem o dado.

### ⚠️ Por que cortei os outros dois
Os casos do executivo no sofá e do gestor 40+ que não gosta de BI vendem **conveniência**. E
conveniência não tem linha no P&L de ninguém: ela justifica ferramenta de R$ 200/mês, não
projeto. Pior — ela contradiz o slide 7, que acabou de dizer que o valor está na estrutura.

⭐ **O WhatsApp não se perde:** ele reaparece no slide 12 como **canal**, que é um diferencial
de produto. Como caso de uso, ele vira anedota; como canal, vira capacidade.

---

# Slide 10 · Case Vital Brasil

♻️ Reaproveitar do PDF (p.4). mudar o design.

---

# Slide 11 · O custo de hoje × o custo com Plum

**Função:** transformar a conversa em número. ⚠️ **Como estava no rascunho, eram três perguntas
sem resposta** — e slide de pergunta sem resposta entrega o controle da reunião para o outro lado.

### Título
> **Quanto custa hoje uma resposta sobre seus dados?**

### Visual — uma tabela para **preencher na reunião**, ao vivo, com o cliente

| | Hoje | Com Plum |
|---|---|---|
| Tempo até a resposta | ___ | minutos |
| Analistas envolvidos | ___ | na palma da sua mão |
| Perguntas que ninguém faz porque dá trabalho | ___ | — |
| Decisão tomada sem o dado no último trimestre | ___ | — |

### Fecho
> **A terceira linha é a mais caras das quatro** — e é a única que não aparece em nenhum
> relatório de custo.
- ⭐ Ancore em **decisão atrasada e pergunta não feita**. É o que dói e é o que o Plum realmente
  muda.

---

# Slide 12 · Segurança e governança

**Função:** matar as objeções do TI antes que elas apareçam. Slide de tranquilidade, denso é ok.

### Título
> **O seu TI não precisa aprovar nada novo.**

### Corpo — quatro selos

| | |
|---|---|
| 🔒 **Somente leitura, por arquitetura** | o Plum nunca escreve na sua planilha ou no seu documento. Escopo de leitura, e nada além |
| 👁️ **Permissão por coluna** | o vendedor vê venda, o diretor vê margem. Default é **nada** — libera-se explicitamente |
| 📄 **Permissão por documento** | o contrato do jurídico não responde ao comercial. Mesmo default: nada |
| 📋 **Trilha de auditoria** | toda mudança de acesso é registrada, e o registro não é editável |
| 🧮 **Motor determinístico** | o número é calculado em Python, nunca escrito pelo modelo — e toda regra vinda de um documento mostra a cláusula de origem |

### Fecho
> **Você compartilha seus documentos com o PLUM como leitor. A governança continua sendo sua.**

---

# Slide 13 · Para onde isso vai

**Função:** mostrar que a compra é de uma plataforma que cresce, não de um projeto que termina.

### Título
> **O mesmo motor, cada vez mais perto do seu negócio.**

### Três blocos

> **Agentes por vertical** — análises típicas do seu setor entram no seu catálogo sem projeto
> novo: decomposição de variação, comparação de período, curva de produto.
>
> **Onde você já está** — a pergunta sai do navegador e vai para o WhatsApp. Mesmo motor, mesma
> permissão, mesma garantia.
>
> **Interpretação, não só consulta** — ***"se minha glosa subir para 50 mil, minha margem vai para quanto?"***

### Visual
Mockup do produto em duas telas lado a lado: dashboard no desktop e uma conversa no WhatsApp
mostrando pergunta e resposta com um número. ⭐ **O WhatsApp é o que a sala vai comentar depois**
— dê espaço a ele.

### ⚠️ Regra
Só entra aqui o que existe ou está em construção com data. **Roadmap em deck de vendas vira
promessa contratual** na cabeça de quem compra.

---

# Slide 14 · Fechamento e próximo passo

♻️ Reaproveitar do PDF (p.5), **com um acréscimo obrigatório.**

⚠️ Fechamento institucional termina em "obrigado". **Deck de vendas termina em ação.**
Acrescente, na parte de baixo:

> **Próximo passo:** uma sessão de 1h com quem cuida das suas bases hoje. Saímos dela com o mapa
> das suas planilhas **e dos contratos que governam elas**, e uma estimativa de escopo do
> onboarding — sem custo.

⭐ Pedido pequeno, concreto, com dono definido. "Vamos conversar" não é próximo passo; é o fim
da conversa.
