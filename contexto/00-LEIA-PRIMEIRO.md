---
status: vigente
camada: ambos
atualizado_em: 2026-08-14
---

# LEIA PRIMEIRO

> **Você é um agente ou uma pessoa nova neste repositório.** Este arquivo existe porque o repo tem
> ~15.000 linhas de markdown e boa parte descreve coisas que **não existem** ou **já mudaram**.
> Ler na ordem errada produz um modelo mental errado do produto — e nada avisa que está errado.
>
> Leia este arquivo inteiro. São 80 linhas.

---

## As 6 frases que definem o Plum

1. O Plum responde perguntas sobre dados de negócio em português, sem SQL, sem dashboard, sem
   analista no meio.
2. **A IA nunca calcula.** Ela planeja; o Python (pandas) executa. Nenhum número sai de texto livre
   de LLM.
3. **O Plum nunca escreve na fonte do cliente.** Só leitura, escopo `spreadsheets.readonly`.
4. ⭐ Existem **duas coisas** chamadas "Plum": a **Plataforma** (multi-tenant, plug-and-play, uma
   demo) e a **Implementação** (vertical, feita à mão para um cliente). Confundir as duas é o erro
   mais comum e mais caro — leia `02-plataforma-vs-implementacao.md`.
5. O que se **vende** hoje é a implementação (~R$ 23k). A plataforma é como o cliente experimenta.
6. ⭐ A direção do remake: **o Plum deixa de ser uma consulta de dados para o usuário e passa a ser
   uma consulta de dados para a IA.** Ver `12-visao-tecnologica.md`.

---

## ⛔ O que NÃO ler

| Não leia | Por quê |
|---|---|
| `zz_remake/` | Rascunhos da discussão do remake (V1 a V4 e os comentários). ⚠️ **Contêm propostas contraditórias entre si, de propósito** — são a conversa, não a conclusão. A conclusão está em `contexto/` |

⚠️ **`docs/` e `contexto/90-arquivo/` não existem mais** — foram apagados em 2026-08-14, depois de o
**fato** e o **porquê** de cada coisa terem sido extraídos para `30-decisoes.md` e
`31-incidentes-e-licoes.md`. Se algum arquivo aqui ainda apontar para lá, é resquício: corrija.

⚠️ **A armadilha que aquela limpeza eliminou, e que vale conhecer:** existia um PRD de 1.108 linhas
descrevendo tabelas (`tenants`, `tenant_users`, `data_dictionary`) que **nunca existiram no banco**.
Todo agente que o abria formava o modelo errado. Se você encontrar cópia dele em algum lugar
(branch antiga, Drive, `git log`), **não é o schema** — o schema é `supabase/migrations/`.

---

## Quero fazer X → leia Y

| Preciso… | Leia |
|---|---|
| entender o produto em uma leitura | `01-o-que-e-o-plum.md` |
| saber se uma feature é plataforma ou implementação | ⭐ `02-plataforma-vs-implementacao.md` |
| **não acreditar em coisa errada** | ⭐ `03-erros-comuns.md` — 60 linhas, leia sempre |
| entender um termo interno | `04-glossario.md` |
| falar de preço, ICP, objeção | `10-visao-comercial.md` |
| saber o que o produto faz e para quem | `11-visao-de-produto.md` |
| **mexer no código** | `CLAUDE.md` na raiz + o `CLAUDE.md` da pasta que vou tocar |
| entender a arquitetura-alvo do remake | `12-visao-tecnologica.md` |
| escolher no que trabalhar | `20-pendencias.md` (ordenado por dificuldade) |
| saber o que oferecer a um cliente que já tem onboarding | `21-melhorias-do-plum-vendido.md` |
| saber o que existe no horizonte e não está sendo feito | `22-planos-futuros.md` |
| ⭐ **saber por que algo é assim** | `30-decisoes.md` |
| não repetir um erro já cometido | `31-incidentes-e-licoes.md` |
| conduzir um onboarding pago | `40-implementacao/metodo-onboarding-de-dados.md` |

---

## Onde está a verdade de cada coisa

Regra deste repositório: **um fato tem um único dono.** Se dois arquivos responderem a mesma
pergunta, um deles está velho. Os donos são:

| Pergunta | Dono da verdade |
|---|---|
| Qual é o schema do banco? | `supabase/migrations/` (o `login_supabase.sql` está lá dentro). **Nada mais** |
| Como rodo, testo, faço deploy? | `CLAUDE.md` (raiz) |
| Quais são as armadilhas desta pasta? | o `CLAUDE.md` da própria pasta |
| Por que decidimos assim? | `contexto/30-decisoes.md` |
| Como subo o executor na AWS? | `infra/aws/PASSO-A-PASSO.md` |
| Qual é o sistema de design? | `DESIGN.md` |
| O que está pendente? | `contexto/20-pendencias.md` |

---

## Ordem de leitura recomendada

**Agente que vai mexer em código (5 min):**
`00` (este) → `03-erros-comuns` → `CLAUDE.md` raiz → o `CLAUDE.md` da pasta.

**Agente que vai propor produto ou arquitetura (20 min):**
`00` → `03` → `02-plataforma-vs-implementacao` → `12-visao-tecnologica` → `30-decisoes`.

**Pessoa nova no time (1 h):**
`00` → `01` → `02` → `04-glossario` → `10-visao-comercial` → `11-visao-de-produto` → `31-incidentes`.

---

## Se você está escrevendo alguma coisa aqui

Cinco regras. Elas são o que impede este conjunto de apodrecer como o anterior:

1. **Um fato, um dono.** Não repita — **linke**.
2. **Nunca misture "o que é" com "o que queremos".** Foi isso que estragou o PRD.
3. **Todo arquivo tem frontmatter** com `status`, `camada`, `atualizado_em`.
4. **Teto de ~400 linhas.** Estourou, divide.
5. **Superado vira decisão, não arquivo.** Quando um fato deixa de valer, o registro do porquê vai
   para `30-decisoes.md` (com o que foi rejeitado) e a afirmação antiga é corrigida **e datada** no
   lugar onde estava. Ver `30-decisoes.md` D-041.

⭐ **E use a skill `contexto-plum`** ao terminar qualquer alteração que mude um fato sobre o
produto. Ela roteia a mudança para o arquivo certo e não deixa você criar um segundo dono para o
mesmo fato.
