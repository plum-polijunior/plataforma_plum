---
status: vigente
camada: produto
atualizado_em: 2026-09-18
---

# Plataforma × Implementação — o teste que toda proposta passa

> **O que este arquivo é:** a fronteira entre o que escala para todo cliente (🏗️) e o que é
> trabalho por cliente (🔧), e o teste que decide de que lado uma ideia cai.
> **O que este arquivo NÃO é:** roadmap.

---

## A pergunta que decide

> **Se o décimo cliente chegar amanhã, isso já está pronto para ele — ou alguém precisa
> escrever de novo?**

Pronto → 🏗️ plataforma. Escrever de novo → 🔧 implementação. Não há terceira categoria, e a
resposta honesta às vezes é desconfortável.

---

## O mapa

| 🏗️ Plataforma — horizontal, multi-tenant | 🔧 Implementação — vertical, por cliente |
|---|---|
| Resolução de identidade: canal → titular | **Os conectores** para os sistemas daquele cliente |
| Modelo de permissão: titular, linha, coluna, documento | O mapa de quem pode ver o quê naquela operação |
| Canal de atendimento (WhatsApp) e a fila humana | O vocabulário da operação (o que é "missão", "escala", "diária") |
| Pipeline de agentes, prompts, roteamento de intenção | O conjunto de perguntas que aquele cliente atende |
| Console da central | Onboarding dos documentos daquele cliente |
| Log, auditoria, orçamento por sessão | A política de exceção (o que vai para humano) |
| ⭐ **O contrato do conector** (`13-contrato-do-conector.md`) | — |

---

## ⭐ Conectores são implementação — a decisão, e o que ela custa

**Decidido** (`30-decisoes.md` D-E-002): os conectores para sistemas de origem — Cavok, Onfly,
Paytrack na Helisul — são **implementação**. É impossível prever qual sistema o cliente usa, e
fingir que dá certo produz um catálogo de integrações que nunca cobre o próximo caso.

A decisão está certa. Ela tem três consequências que precisam estar escritas **antes** de virarem
surpresa:

### ⚠️ 1. A margem volta a ser o problema

Se cada venda exige conector novo, cada venda gasta a equipe. É o mesmo padrão que travou a tese
anterior: caixa, não empresa.

⭐ **O mecanismo que faz consultoria escalar não é eliminar o humano — é fazer cada execução
baratear a próxima.** Aqui isso tem nome: o **contrato do conector**. Se um conector novo é uma
semana porque o contrato é claro, a implementação vira margem. Se é um mês porque cada sistema
exige mexer no núcleo, ela vira prejuízo disfarçado de receita.

### ⭐ 2. O contrato do conector é o artefato central da plataforma

Se conector é implementação, **a plataforma tem que declarar exatamente o que um conector
entrega**. Esse contrato é 🏗️ e é o documento mais importante desta pasta —
`13-contrato-do-conector.md`.

**O teste:** um conector novo deve ser escrito **sem tocar em nenhum arquivo do núcleo**. Se
precisar tocar, o contrato está errado, não o conector.

### ⚠️ 3. O ciclo de venda precisa de uma porta sem conector

Sem conector pronto, toda demonstração exige integração antes — e integração exige credencial,
que exige TI do cliente, que exige semanas. **O ciclo de venda morre antes da primeira demo.**

⭐ **A saída: um conector de planilha como porta universal.** O cliente exporta do sistema dele
para um Google Sheets; o porteiro roda em uma semana; o conector nativo entra depois, se valer a
pena. Tem três virtudes:

- é 🏗️ — um só, serve todo mundo;
- é a mesma resposta que já existe para a armadilha do ERP (*"exporte, não integre"*);
- ⭐ transforma o conector nativo em **upsell**, em vez de pré-requisito.

⚠️ A limitação é real e precisa ser dita na venda: exportação tem atraso. Para "qual a minha
escala amanhã" um espelho diário serve. Para "meu voo atrasou agora" não serve — e essa fronteira
define quais perguntas entram no piloto.

---

## Casos de fronteira, já julgados

| Proposta | Lado | Por quê |
|---|---|---|
| Suporte a áudio e imagem no WhatsApp | 🏗️ | Todo cliente com gente em campo precisa |
| "Missão" como conceito consultável | 🔧 | É vocabulário da Helisul; outro cliente chama de outra coisa |
| Regra "reembolso vai para o financeiro" | 🔧 | Política de encaminhamento daquela operação |
| Motor de encaminhamento (o mecanismo de rotear ao humano) | 🏗️ | A mecânica é universal; a regra é do cliente |
| Onboarding de documentos | 🏗️ mecanismo · 🔧 conteúdo | O pipeline serve todos; o documento é de um |
| Resposta em espanhol | 🏗️ | É capacidade de canal, não de cliente |
| Tabela telefone → pessoa | 🏗️ mecanismo · 🔧 povoamento | O modelo é do produto; quem está nela é do cliente |

⚠️ **O padrão que se repete:** quase tudo se divide em **mecanismo 🏗️ + conteúdo 🔧**. Quando uma
proposta parece 100% de um lado só, quase sempre é porque o mecanismo ainda não foi extraído — e
extrair é exatamente o trabalho que faz o produto escalar.
