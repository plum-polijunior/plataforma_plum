---
status: vigente
camada: negocio
atualizado_em: 2026-08-14
---

# Visão comercial

> **O que este arquivo é:** quem compra, por quê, quanto paga, quais objeções, e o problema central
> do negócio.
> **O que este arquivo NÃO é:** arquitetura, nem roadmap.

---

## Onde estamos, em números

| | |
|---|---|
| Vendas fechadas | **4** |
| Ticket médio | **~R$ 23.000** (projeto) |
| ITIP (recorrente) | **~R$ 2.000** |
| O que o cliente comprou | majoritariamente a **equipe técnica** organizando a base — não o produto |

⚠️ **o PRD antigo (apagado em 2026-08-14) diz "0 clientes pagantes". Está desatualizado.**

---

## ⭐ O problema central: não é o valor, é a recorrência

O diagnóstico intuitivo é "não consigo explicar por que consulta de dados gera valor". Isso é
verdade, mas é o sintoma. O problema medido é outro:

> **O produto vende — mas o que se compra é o serviço, e o serviço não deixa nada atrás.**

Cada venda gasta a equipe e produz conhecimento que evapora em Slack e na cabeça das pessoas. Quatro
projetos de 23k é **caixa**; não é empresa. A pergunta certa não é "que feature justifica o preço" —
é:

> ❓ **O que o cliente paga no mês 13, depois que a base já está organizada?**

Hoje a resposta é R$ 2k, e o que ele perderia ao cancelar é pouco: a base limpa já é dele. Ver §
"Os três movimentos" abaixo.

## Por que "facilidade de consulta" não sustenta o preço

Quatro causas estruturais — nenhuma se resolve melhorando o pitch:

1. **O beneficiário não é o comprador.** Facilidade de consulta economiza o tempo de quem
   *entrega* o dado (analista) para quem *pede* (stakeholder). O stakeholder não tem o custo do
   analista no bolso; o analista não assina contrato.
2. **A dor é intermitente e barata.** Esperar dois dias por um relatório é irritante, não caro. Dor
   irritante compra ferramenta de R$ 200/mês, não projeto de R$ 23k.
3. **O Plum concorre com o "já dá pra fazer".** O cliente já tem Excel e um analista. Nada disso é
   bom, mas tudo funciona. O Plum não substitui um sistema — substitui um **hábito**, e para isso
   precisa fazer algo que o hábito não consegue.
4. **Não existe evento de sucesso observável.** Perguntas respondidas não deixam rastro. ⭐ Toda
   feature nova deve produzir um **artefato atribuível ao Plum** — um cenário salvo, um insight com
   R$ estimado. É a diferença entre renovar e não renovar.

⚠️ **Sobre a narrativa:** *"Do dado à decisão. Em segundos"* **já está no `HeroSection.tsx`**. Não
há nada a reposicionar — a landing já promete decisão e o produto entrega consulta. A dívida é entre
o que se vende e o que se entrega, não na narrativa.

---

## O ICP — e ele é bom

**Médio porte · varejo · base bagunçada · equipe técnica pequena · com orçamento.**

Para esse cliente a dificuldade de consultar dados **não é incômodo, é dor real**: ninguém internamente
consegue arrumar a base, e ele tem verba para contratar quem arrume.

⭐ **Uma empresa que paga 23k para organizar a base está declarando três coisas de uma vez:** (a) o
problema é reconhecido e tem dono, (b) não se resolve internamente, (c) há orçamento. É um ICP
melhor definido do que qualquer segmentação teórica — e foi descoberto vendendo, não em workshop.

E o Plum é a **única** ferramenta que fica mais valiosa conforme a base é organizada, porque o
`schema_metadata` é literalmente o subproduto daquele trabalho.

---

## Os três movimentos para escapar do 23k + 2k

**1. O onboarding de dados vira produto com nome, preço e entregável.**
Mesmo trabalho, mesmo preço — mas o entregável passa a ser o **dicionário de 4 camadas assinado
pelo cliente** (colunas, valores, relações e grão, regras de negócio), não só "a base limpa". A
diferença: um entregável que o produto **consome**.

**2. Template de dicionário por vertical.**
O décimo varejista chega com grão, fórmulas e proibições típicas pré-preenchidas. O onboarding cai
de semanas para dias, e a margem sobe sem o preço cair. ⭐ **Este é o único mecanismo que faz
consultoria escalar** — não eliminando o humano, mas fazendo cada execução baratear a próxima.

**3. A recorrência tem de ser o que cresce sozinho.**
O que o cliente perde ao cancelar não pode ser a base limpa. Tem de ser: padrões analíticos novos
que entram sem projeto, o cruzamento das planilhas que ele foi conectando depois, o insight
proativo. ❓ **Qual é a linha do contrato que descreve isso?** Se não existe, o ITIP de 2k é
consequência, não acidente.

---

## Estrutura de preço proposta

| Camada | O quê | Por que o cliente paga |
|---|---|---|
| **Onboarding de dados** (existe, vendeu 4×) | leitura da base, dicionário, formatação, relatório de análises habilitadas × bloqueadas | dor reconhecida, orçamento existente |
| **Plataforma** (recorrente, por assento) | consulta, cenários, metadados, vocabulário | é o que ele perde se cancelar |
| **Pacotes de análise por vertical** (recorrente, **crescente**) | padrões e regras novas entram no catálogo dele | ⭐ cresce sem projeto novo — é o que justifica o mês 13 |
| **Etapa 2** (Plum Externo, prospecção) | por volume / por lead | → `22-planos-futuros.md` |

⭐ **O movimento comercial:** o onboarding deixa de ser o produto e passa a ser a **porta** —
precificado para cobrir custo, com o contrato já embutindo 12 meses de plataforma. Trocar 23k uma
vez por 15k + recorrência é a diferença entre 4 projetos e uma empresa. ❓ Decisão comercial, e a
mais importante deste arquivo.

---

## Objeções conhecidas e as respostas

| Objeção | Resposta |
|---|---|
| **"Meus dados estão no SAP/Totvs"** (armadilha do ERP) | Espelho de dados: export `.xlsx`/`.csv` diário para a nuvem. Não se tenta integração nativa agora |
| **"A IA vai inventar número"** | R-02: a IA planeja, o pandas executa. Nenhum número sai de texto livre. É demonstrável ao vivo |
| **"Meu TI não vai deixar"** | Read-only absoluto, escopo `readonly`, o cliente compartilha como Leitor e a governança continua dele |
| **"Setup de R$ 31k é caro para o meu caso"** | Origem da versão Express/light. Ver estrutura de preço |
| **"Quem vê o quê?"** | RBAC de coluna por cargo, default nada. Vendedor vê vendas, diretor vê margem |
| **"A IA treina com meus dados?"** | ⚠️ ver abaixo — a resposta mudou |

### ⚠️ A narrativa de privacidade mudou, e é melhor assim

A tese *"a IA não lê seus dados"* é **fraca**, e o motivo é desconfortável mas correto:
**o Google/a Anthropic são mais confiáveis, aos olhos do cliente, que a nossa equipe.** A equipe
ler os dados gera incômodo; o Google ler gera indiferença.

Além disso ela nunca foi 100% verdadeira: o onboarding já envia cabeçalho + 5 linhas para o LLM
(`contexto/20-pendencias.md` D7 registra isso como violação da premissa P1.1).

**A frase honesta, e a que deve ser usada:**

> *"O modelo vê, no máximo, N linhas por sessão, das colunas que você liberou, e todo acesso fica
> registrado. Número nenhum é calculado pelo modelo — só pelo nosso motor."*

Complementos que fecham compliance sem código: **zero-retention / no-training nos termos de API do
provedor**. Recupera boa parte do que se perde na arquitetura.

❓ **A medir:** nas 4 vendas, alguém perguntou sobre privacidade? Se ninguém perguntou, o custo de
manter a garantia é ainda menor do que se supõe.

---

## Segmentação para o pitch (não para RBAC)

| Área | O que dói |
|---|---|
| Comercial / Vendas | top performers, ticket médio, meta |
| Operações / Logística | gargalos, prazos, campo |
| Financeiro | fluxo de caixa, inadimplência, margem |
| TI / Segurança | compliance, LGPD, "não quebrar o banco" → contornado pelo read-only |

---

## ❓ Perguntas comerciais abertas

1. **Dos 4 clientes, quantos ainda usam o Plum?** Se for baixo, o problema é retenção, e nenhuma
   feature deste repositório resolve retenção diretamente — só o insight proativo tenta.
2. **A vertical é varejo, definitivamente?** Decide quais padrões analíticos e templates construir
   primeiro.
3. **O onboarding passa a embutir 12 meses de plataforma no contrato?**
4. **A frase nova de privacidade entra na LP e na proposta, ou fica só na resposta ao comitê de
   segurança do cliente?**
