---
status: vigente
camada: negocio
atualizado_em: 2026-09-18
---

# A tese externa — o Plum como porteiro

> **O que este arquivo é:** o que o porteiro resolve, quem compra, e por que este é um negócio
> melhor que o da tese interna.
> **O que este arquivo NÃO é:** arquitetura (→ `12-deltas-tecnicos.md`) nem o case detalhado
> (→ `15-case-helisul.md`).

---

## Em uma frase

> **A central de atendimento existe porque as pessoas não têm acesso aos sistemas. O Plum dá o
> acesso — filtrado — e a central para de responder a mesma pergunta.**

---

## ⭐ Por que a tese externa é um negócio melhor que a interna

Não é opinião: cada linha abaixo responde a um problema que `contexto_interno/10-visao-comercial.md`
diagnosticou e não resolveu.

| Problema da tese interna | Como a externa resolve |
|---|---|
| ⭐ **"O beneficiário não é o comprador"** — o analista economiza tempo, mas quem assina não sente o custo dele | A central de atendimento **é um centro de custo com headcount e dono de orçamento**. Quem sofre é quem paga |
| ⭐ **"O que o cliente paga no mês 13?"** — a base limpa já é dele, cancelar custa pouco | **Desligue o Plum e o telefone toca de novo na manhã seguinte.** A recorrência é estrutural: o valor não é um artefato que fica, é um serviço que deixa de acontecer |
| **"Não existe evento de sucesso observável"** — pergunta respondida não deixa rastro | Cada atendimento desviado **é** o rastro. Contável, no sistema da central, todo dia |
| **ROI intangível** — o deck interno precisa de um slide pedindo ao cliente que estime o valor de uma resposta rápida | `atendimentos desviados × custo por atendimento`. Uma multiplicação |
| **A dor é intermitente e barata** | A central é dor **diária e contínua**, com escala e turno |

⭐ **E o RBAC deixa de ser uma casa de verificação para virar o produto.** Na tese interna,
permissão por coluna é um selo no slide de segurança. Na externa, **é o que torna o produto
possível**: sem controle de acesso confiável, não se abre dado nenhum para 400 pessoas. A
engenharia que já existe muda de papel — de guarda-corpo a razão de ser.

---

## Quem compra, e o que ele já mede

**ICP:** operação distribuída, com muita gente em campo e poucos logins nos sistemas centrais —
transporte, logística, frota, manutenção, obras, serviços com equipe externa.

O sinal de qualificação é direto: **existe uma central, ou um grupo de WhatsApp, respondendo a
mesma pergunta todo dia?** Se existe, o custo já está sendo pago e alguém já o conhece.

Três perguntas que qualificam em dois minutos:

1. Quantas pessoas da sua operação **não têm login** nos sistemas que guardam o dado delas?
2. Quantas mensagens por dia a central recebe, e que fração é a **mesma pergunta**?
3. Quando alguém pergunta algo que não pode ver, **o que impede hoje** que a resposta saia?

⭐ A terceira é a mais reveladora. Na maioria das operações a resposta é *"o bom senso do
atendente"* — e essa é a brecha que o porteiro fecha com uma regra em vez de uma pessoa cansada.

---

## O que muda no discurso, em relação à tese interna

| Tese interna | Tese externa |
|---|---|
| "Do dado à decisão" | **"Do dado a quem precisa dele"** |
| a IA não inventa número | a IA não inventa número **e não mostra o que não pode** |
| integrador | **porteiro** |
| economiza o tempo do analista | **esvazia a fila da central** |
| comprador: diretoria / financeiro | comprador: operações / atendimento |
| concorre com: BI, planilha, analista | concorre com: chatbot de FAQ, portal do colaborador, a própria central |

⚠️ **O conjunto competitivo muda inteiro.** O Plum Externo não é comparado a Power BI — é
comparado a um chatbot de atendimento. Isso é bom (o comparável é mais fraco) e é perigoso: o
preço de referência de um chatbot é muito menor que o de um projeto de dados. **O argumento que
defende o preço é o acesso filtrado**, que nenhum chatbot de FAQ tem.

---

## A garantia de determinismo vale mais aqui, não menos

Na tese interna, um número errado leva a uma decisão ruim — grave, mas abstrato e distante.

Na tese externa, **a escala errada põe um piloto no aeroporto errado**. A consequência é física,
imediata e atribuível. O mesmo `R-02` que era um diferencial passa a ser um requisito de
operação, e a frase de venda fica mais forte sem mudar uma palavra do produto.

⭐ Corolário para o material de venda: **"a IA não inventa"** sai da seção de segurança e vira
promessa de linha de frente.

---

## ❓ Perguntas comerciais em aberto

- **Preço.** Por assento (400 colaboradores) ou por volume (atendimentos desviados)? Por volume
  alinha incentivo e conta a própria história — mas pune o sucesso do cliente quando a demanda
  cai porque o Plum educou a operação.
- **O onboarding continua existindo?** Na tese interna ele é o produto que vendeu 4×. Aqui o
  trabalho equivalente é **mapear permissões e resolver identidade** — é menos "estruturar dados"
  e mais "descobrir quem pode ver o quê". ⭐ Provavelmente continua sendo a porta, com outro nome.
- **A central sobrevive?** O produto não elimina a central, esvazia a fila dela. Vender como
  "redução de headcount" cria inimigo interno — a central é quem opera o console de gestão e é
  quem pode sabotar a adoção. Vender como *"a central para de responder o repetitivo e passa a
  resolver o que é difícil"*.
