---
status: proposta
camada: ambos
atualizado_em: 2026-08-25
---

# Visão de produto

> **O que este arquivo é:** o que o produto faz, para quem, e o que muda com o remake.
> **O que este arquivo NÃO é:** o estado atual do sistema (é `01-o-que-e-o-plum.md`) nem a
> arquitetura (é `12-visao-tecnologica.md`).
> ⚠️ **`status: proposta`** — a parte do remake não está implementada.

---

## A tese, em uma frase

> ⭐ **O Plum deixa de ser vendido por reduzir o custo de perguntar e passa a ser vendido por
> encurtar a distância entre a pergunta e a ação.**

A cadeia real é `dado → consulta → interpretação → decisão → ação → resultado`. O Plum de hoje vive
no passo 2; o cliente sente dinheiro no passo 6. As três frentes do remake empurram o produto para
a direita:

| Frente | Onde põe o Plum | Argumento de valor |
|---|---|---|
| **Interpretação** — padrões analíticos + regras de negócio | passo 3 | "aqui está dinheiro que você perde e não sabia" |
| **Cenários** — "e se…" | passo 4 | "veja a consequência antes de decidir" |
| **Etapa 2** — Maisa, Plum Externo, prospecção | passo 5 | "o Plum não corta custo, ele traz cliente" |

E a fronteira que não se atravessa: **a plataforma interpreta os dados e produz um resultado; o
stakeholder decide o que aquele resultado significa.** Quando o cliente quer que o produto
interprete o significado também, isso é regra de negócio — 🔧.

---

## As superfícies

| Superfície | Quem fala | O que pede | Estado |
|---|---|---|---|
| **Chat** | stakeholder | pergunta em linguagem natural | ✅ existe |
| **Dashboard** (`/inicio`) | stakeholder | card = Query Plan salvo | ✅ existe |
| **Minha base de dados** | stakeholder / admin | onboarding, dicionário, ⭐ **fórmulas e grão** | parcial — falta o editor de regras |
| **Cenários** | stakeholder | consequência de uma premissa | proposta |
| **Plum Externo** | cliente final da empresa | a linha dele | Etapa 2 |

⚠️ **Só as duas primeiras rodam na arquitetura de autorização de hoje.** O Plum Externo precisa de
escopo **por linha**, que não existe — RBAC hoje é por coluna. Ver `22-planos-futuros.md`.

---

## ⭐ O que muda: o catálogo de insights morre, e o que nasce no lugar

A ideia original era ~20 "agentes de insight" por vertical ("insight de glosa", "insight de
paralisação"), ~4 dias cada. O problema não é o prazo — é que **20 receitas de saúde valem zero no
varejo**. Não escala multi-tenant, que é exatamente a condição para o ticket subir.

Duas coisas nascem no lugar, uma de cada camada:

### 🏗️ Catálogo de padrões analíticos (~12, universais)

Não são insights, são **formas de analisar**. Nenhum deles precisa saber o que é glosa; todos ficam
melhores quando o dicionário sabe.

| Padrão | Exige | Pergunta que atende |
|---|---|---|
| Comparação temporal | data + métrica | "vendi mais que mês passado?" |
| **Decomposição de variação** | data + métrica + dimensão | ⭐ "**por que** caiu?" — o mais valioso |
| Concentração (Pareto) | dimensão + métrica | "quanto vem dos 20% maiores?" |
| Sazonalidade | data + métrica | "que dia vende mais?" |
| Ranking com contexto | dimensão + métrica | "melhores e piores, e o quanto isso é normal" |
| Outlier | métrica | "algum valor fora do padrão?" |
| Tendência | data + métrica | "estou crescendo ou é ruído?" |
| Composição / mix | dimensão + 2 períodos | "mudou o que eu vendo ou quanto?" |
| Cohort / recompra | id + data | "cliente novo volta?" |
| **Cenário** (`overrides`) | fórmula 🔧 | "se A muda, B fica como?" |
| Cobertura / qualidade | qualquer | "quanto da base está vazio ou incoerente?" |
| Cruzamento por grão comum | 2 tabelas + grão 🔧 | "bati a meta?" |

⭐ **E o padrão é o que o arquiteto emite** — ele declara `{padrao, metrica, dimensao, periodo…}` e a
plataforma compila para Query Plans. A LLM não escreve consulta (`12-visao-tecnologica.md` §2.2).
⚠️ **Pergunta que não cabe em padrão nenhum vira `ad_hoc`** e segue pelo caminho de hoje. Isso é
obrigatório: sem escape, o produto responderia "não consigo analisar isso" com frequência, que é a
trava recusada em D-037. ⭐ **A taxa de `ad_hoc` é a métrica de saúde do catálogo** — cair de 60% para
15% em três meses significa que ele funciona; ficar em 80% significa que a abstração está errada, e
vale saber com dado em vez de opinião.

**12 padrões × N clientes é multi-tenant de verdade.** Cada padrão declara `requisitos` (que
formato de dado exige) e `limitacoes` (o que ele **não** pode concluir — "decomposição de variação
mostra *onde* mudou, nunca *por que*").

### 🔧 Dicionário de regras de negócio

O que não está nos dados e nenhum LLM descobre olhando colunas:

```
formulas:   margem = receita - custo - glosa · ticket = receita / pedidos
sinais:     glosa: perda (subir é ruim) · nps: bem (subir é bom)
grao:       vendas = 1 linha por item de pedido · metas = 1 linha por mês por loja
relacoes:   vendas.loja_id → lojas.id
temporal:   fechamento no dia 5 · o mês corrente é parcial
proibicoes: nunca somar 'preco_unitario'
```

⭐ **Isso vive na interface, em "minha base de dados"** — como "skills" que o agente daquela base
carrega. Mecanismo é 🏗️, conteúdo é 🔧.

### E uma receita-modelo, forte, como referência

Não se apaga a ideia de receita — mantém-se **uma**, bem feita, como padrão de qualidade e ativo de
demonstração. Proposta: **`margem-sob-estresse`**, porque ela exercita fórmula, `overrides`, sinal e
limitação de uma só vez:

```
User: "e se a glosa subir 20k, minha margem ainda fecha positiva?"
Plum: "Com glosa de R$ 50k (hoje R$ 30k), a margem do mês cai de 12,4% para 4,1%.
       Cálculo: margem = receita (R$ 480k) − custo (R$ 410k) − glosa (R$ 50k).
       Assume custo e volume constantes."
       [cenário salvo · comparar com o real · alterar premissa]
```

---

## ⭐ Por que o laço aberto vence o catálogo, e onde ele trava

Com a arquitetura `IA pede dados → Plum devolve`, a IA consegue análises que **nenhum catálogo
enumeraria** — o teto passa a ser o que ela compõe, e cresce a cada modelo novo. Isso é o motivo de
o catálogo por vertical morrer.

**Mas há um limite, e é importante:** "se A alterar, como fica B" tem dois casos.

| | Caso | O Plum pode responder? |
|---|---|---|
| **1** | A e B ligados por **fórmula** (`margem = receita − custo − glosa`) | ✅ exato — **se souber a fórmula**, que não está nos dados |
| **2** | A e B só **associados** (preço → volume) | ❌ é elasticidade, não correlação. A IA vai responder com confiança e estar inventando |

⭐ **Conclusão: o laço amplia o que pode ser *perguntado*; não amplia o que pode ser *sabido*. O
teto nunca foi o catálogo — é o dicionário de regras.**

**Como o produto lida com o Caso 2** (`30-decisoes.md` D-037): **não travando**. Um parâmetro que
bloqueia produz "desculpa, não posso responder isso" a cada prompt, e o Plum não vai ser assim. Em
vez disso:

- a resposta **mostra como a IA pensou e os cálculos que fez** — sempre;
- o padrão declara as `limitacoes` que se aplicam;
- ⭐ a trava dura fica disponível como **regra de negócio 🔧**, por cliente, para quem quiser.

⚠️ **O risco residual é real:** um insight causalmente errado apresentado em diretoria queima o
produto de forma difícil de reverter. A mitigação é auditabilidade — o cliente ver a conta e poder
discordar — não recusa.

---

## Jornada do usuário

**Novo cliente (plataforma):** cria organização → conecta a base pelas 4 etapas → pergunta no chat →
salva um card → recebe convite para o onboarding pago quando a base mostrar limites.

**Cliente implementado:** dicionário de 4 camadas preenchido no onboarding → chat responde
perguntas de negócio de verdade → cenários → padrões analíticos novos entrando sem projeto →
insight proativo.

**Stakeholder no dia a dia:** abre `/inicio`, vê os cards, pergunta algo pontual no chat, roda um
cenário antes de uma reunião.

---

## O que ficou de fora, de propósito

| Fora | Por quê |
|---|---|
| **Plum alterar dados na fonte** | Muda a categoria da falha: resposta errada se questiona, dado corrompido não. E mata o argumento que faz o TI aprovar |
| Lançar fato novo em tabela do Plum | Foi considerado (união fonte ∪ lançamentos). Descartado: a escrita que gera valor é a da Maisa, no mundo |
| 20 insights por vertical | Não escala multi-tenant |
| Travar a IA por falta de fórmula | Produz recusa constante. Vira regra 🔧 opcional |
| Dashboard de BI complexo | Não se compete com Power BI |
| Prever o futuro | Cenário é aritmética sobre premissa declarada |
