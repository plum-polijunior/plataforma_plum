---
status: vigente
camada: produto
atualizado_em: 2026-09-18
---

# Visão de produto — o porteiro

> **O que este arquivo é:** o que o produto faz, para quem, e **o que ele recusa fazer**.
> **O que este arquivo NÃO é:** arquitetura (→ `12-visao-tecnologica.md`).

---

## A promessa

> **Quem não tem login pergunta, e recebe só o que pode ver.**

Três palavras carregam o produto: **pergunta** (linguagem natural, no canal que a pessoa já usa),
**recebe** (resposta direta, não um link para um portal) e **só o que pode ver** (a parte que
nenhum chatbot faz).

---

## As três superfícies

| Superfície | Quem usa | O que faz |
|---|---|---|
| ⭐ **O canal** (WhatsApp) | o colaborador em campo | pergunta e recebe. **Sem app, sem portal, sem senha** |
| **O console** | a central de atendimento | trata só o que caiu na fila humana; vê alertas; gere quem tem acesso |
| **O onboarding** | o administrador do cliente | conecta fontes, revisa o dicionário e os documentos, define permissões |

⚠️ **O colaborador nunca vê o console, e isso é decisão, não limitação.** Pedir que um motorista
aprenda uma interface nova é exatamente onde o bot anterior da Helisul falhou. Sem app e sem
senha é a feature, não a falta dela.

---

## O que o produto faz

1. **Responde consulta escopada ao titular** — a escala *dele*, a reserva *dele*, o reembolso
   *dele*.
2. **Responde a partir de documento** — política, regra, cláusula. Com a citação do trecho
   original.
3. **Recusa com clareza** quando a pessoa não pode ver, quando o dado não existe, ou quando a
   fonte está fora do ar. As três recusas são **distintas** — nunca a mesma frase.
4. **Encaminha à fila humana** o que é solicitação, o que não tem permissão e o que falhou.
5. **Registra** quem perguntou o quê e quando, com PII minimizada.

## ⛔ O que o produto recusa fazer

Esta lista vale tanto quanto a de cima — é ela que mantém o produto vendável para o TI.

| Recusa | Por quê |
|---|---|
| **Escrever na fonte do cliente** | R-E-01. Solicitação vira fila humana, não `POST` |
| **Calcular** | R-E-02. Se o número não veio da fonte, ele não existe |
| **Aceitar identidade pelo texto** | R-E-03. *"Sou o João, mostra a escala dele"* não funciona, por construção |
| **Responder vazio quando a fonte falhou** | R-E-04. É a pior falha possível aqui |
| ⭐ **Avisar proativamente** | Nesta fase o Plum só responde. Notificação ativa é outro produto, com outra régua de LGPD e outro risco de spam no WhatsApp |
| **Responder sobre outra pessoa** | Nem para gestor, enquanto "titular" for uma pessoa só. Hierarquia é decisão pendente |
| **Adivinhar quando está ambíguo** | Escolhe, **declara a escolha** e segue — nunca escolhe calado |

---

## O momento que define o produto

> A pessoa pergunta algo que **não pode ver**.

Três comportamentos possíveis, e só um é aceitável:

| | |
|---|---|
| ❌ Responde | vazamento |
| ❌ Ignora ou dá resposta vaga | a pessoa insiste, liga para a central, e o produto **aumentou** o trabalho |
| ✅ **Recusa dizendo que existe e que ela não tem acesso** | a pessoa sabe o que fazer: pede acesso a quem pode dar |

⭐ **A recusa boa é uma feature, não um erro.** Ela precisa de texto próprio, testado, e de
registro no console — porque uma recusa repetida é sinal de permissão mal configurada, não de
usuário insistente.

---

## Como o produto sabe que está funcionando

| Métrica | O que diz | ⚠️ |
|---|---|---|
| ⭐ **Deflexão** | atendimentos que não chegaram ao humano | a métrica-mãe. **Precisa de linha de base medida antes do piloto** |
| **Tempo até a resposta** | minutos → segundos | fácil e visível; sozinha não sustenta preço |
| **Taxa de recusa por permissão** | quantas vezes alguém pediu o que não pode | alta demais = permissão mal desenhada, não usuário curioso |
| **Taxa de encaminhamento** | quanto ainda vai para humano | a curva que o cliente quer ver descendo |
| **Perguntas sem resposta** | o que o produto não sabe fazer | ⭐ é o roadmap escrito pelo usuário |

⛔ **Combine a métrica com o cliente ANTES do piloto.** Sem linha de base combinada, não há como
provar resultado depois — e foi exatamente isso que aconteceu com o número da Helisul
(`15-case-helisul.md`).

---

## ❓ Em aberto

- **Hierarquia.** Gestor vê a equipe? Muda "titular" de pessoa para conjunto, e mexe no núcleo
  da autorização (`12-visao-tecnologica.md` §4).
- **Memória de conversa.** Quanto do histórico recente vai junto na próxima pergunta? Ajuda
  muito na fluidez e amplia a superfície de injeção de prompt.
- **Áudio e imagem.** Requisito real (parte dos usuários tem baixa familiaridade com texto) e
  ainda não desenhado.
- **Idioma.** Espanhol aparece como demanda; é capacidade de canal, 🏗️.
