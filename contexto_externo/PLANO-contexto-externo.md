---
status: plano
camada: meta
atualizado_em: 2026-09-18
---

# Plano do `contexto_externo/` — independente, sem virar cópia

> **Objetivo:** quem trabalha no Plum Externo lê **só esta pasta** e o `CLAUDE.md` da raiz. Nunca
> precisa abrir `contexto_interno/`.

---

## ⭐ O princípio que torna a independência possível sem duplicar

A regra "um fato, um dono" continua valendo. Independência e não-duplicação só brigam se a gente
deixar o `contexto_interno/` ser dono de fatos que **não são dele**. Três categorias, três donos:

| Categoria | Exemplo | Dono |
|---|---|---|
| **Fato sobre o que está no ar** | o executor bloqueia linha bruta; o cache é de 15 min; migrations são manuais | ⭐ **`CLAUDE.md` da raiz** e os `CLAUDE.md` de pasta — já é o dono declarado |
| **Fato sobre o produto interno** | Tarsila, dashboard cards, posicionamento de BI, k-anonimato | `contexto_interno/` |
| **Fato sobre o produto externo** | porteiro, titular, canal, conector | ⭐ `contexto_externo/` |

⭐ **A independência sai de graça:** o que as duas teses compartilham é **código em produção**, e
o dono disso nunca foi o `contexto_interno/` — é o `CLAUDE.md`. Onde eu escrevi "→ veja
`contexto_interno/12`", o certo é "→ veja `CLAUDE.md` §5".

**A única coisa que aparece nas duas pastas é a doutrina** (R-01 read-only, R-02 a IA planeja,
R-13 só o Python multiplica, e "nenhuma autorização nasce de dado que o modelo tocou"). Isso não
é duplicação, é **tradução**: o mesmo invariante, com a consequência de cada tese. No interno,
violar o R-02 dá uma decisão ruim. No externo, põe um piloto no aeroporto errado.

⚠️ **Custo aceito conscientemente:** se um invariante mudar, dois arquivos mudam. É barato —
invariante muda a cada 18 meses, e os dois já apontam para o `CLAUDE.md` como fonte.

---

## ⭐ Plataforma × Implementação na tese externa

Você decidiu: **os conectores de API (Cavok, Onfly, Paytrack) são implementação.** Está certo — é
impossível prever o sistema do cliente — e a decisão tem três consequências que precisam estar
escritas antes de virarem surpresa.

| 🏗️ Plataforma (horizontal, multi-tenant) | 🔧 Implementação (vertical, por cliente) |
|---|---|
| Resolução de identidade (telefone → titular) | **Os conectores** para os sistemas daquele cliente |
| Modelo de permissão: titular, linha, coluna, documento | O mapa de quem pode ver o quê naquela operação |
| Canal (WhatsApp) e a fila humana | O vocabulário da operação (o que é "missão", "escala") |
| Pipeline de agentes e os prompts | O conjunto de perguntas atendidas |
| Console da central | Onboarding dos documentos daquele cliente |
| Log, auditoria, orçamento | — |

### ⚠️ Consequência 1 — a margem volta a ser o problema

Se cada venda exige conectores novos, cada venda gasta a equipe — **é o 23k + 2k da tese interna
outra vez**, com outro rótulo. A tese interna resolveu isso com "template de dicionário por
vertical". O equivalente aqui é o item abaixo, e ele é o mais importante desta pasta.

### ⭐ Consequência 2 — o contrato do conector é o artefato central

Se conector é implementação, **a plataforma tem que declarar exatamente o que um conector precisa
entregar** para o resto do produto funcionar. Acertar esse contrato faz uma integração durar uma
semana; errar faz cada cliente ser um produto novo.

Rascunho do que um conector tem de expor — a ser fechado em `13-contrato-do-conector.md`:

1. **Resolução de titular** — dado um identificador de pessoa, devolver os registros dela. Não o
   contrário: o conector nunca recebe "traga tudo" e filtra depois.
2. **Tipos de registro legíveis**, cada um com nome estável, campos e **qual campo é o titular**.
3. **Somente leitura.** Sem exceção (R-01, e `ADR-001` do PRD Helisul).
4. **Falha explícita.** Indisponível é erro, nunca resposta vazia — resposta vazia vira "você não
   tem escala amanhã", que é pior que não responder.
5. **Sem semântica de negócio.** O conector traz o dado; o que significa mora no dicionário.

⭐ **O teste do contrato:** um conector novo deve ser escrito sem tocar em nenhum arquivo do
núcleo. Se precisar, o contrato está errado.

### ⚠️ Consequência 3 — o piloto de venda muda

Sem conector pronto, uma demo exige integração antes. ❓ Vale ter **um conector de planilha** como
porta de entrada universal: o cliente exporta para um Sheets, o porteiro roda em uma semana, e o
conector nativo entra depois se valer a pena. É o mesmo "espelho de dados" que a tese interna já
usa contra a armadilha do ERP — e aqui ele ainda serve de degrau comercial.

---

## A estrutura da pasta

Espelha o `contexto_interno/`, de propósito: quem navega uma navega a outra.

| Arquivo | O que traz | Estado |
|---|---|---|
| `00-LEIA-PRIMEIRO.md` | roteador. As duas teses, a fronteira, "o que não ler aqui" | ✅ escrito — **reescrever as referências** |
| `01-tese-externa.md` | o porteiro, quem compra, por que é negócio melhor | ✅ escrito |
| ⭐ `02-plataforma-vs-implementacao.md` | a tabela acima, o teste que toda feature passa | ⏳ |
| `03-erros-comuns.md` | as crenças falsas desta tese, com a verdade ao lado | ⏳ |
| `04-glossario.md` | titular · canal · conector · porteiro · fila humana · deflexão | ⏳ |
| `10-visao-comercial.md` | ICP, ROI, preço, objeções | ⏳ |
| `11-visao-de-produto.md` | o que o produto faz e o que recusa fazer | ⏳ |
| ⭐ `12-visao-tecnologica.md` | arquitetura-alvo **autossuficiente** (substitui `12-deltas-tecnicos.md`) | ♻️ converter |
| ⭐ `13-contrato-do-conector.md` | o que um conector entrega — **o artefato central** | ⏳ |
| `15-case-helisul.md` | o case, separando medido de estimado | ⏳ |
| `20-pendencias.md` | trabalho adiado, por dificuldade | ⏳ |
| `30-decisoes.md` | D-E-001 em diante — numeração própria, prefixo `E` | ⏳ |
| `31-incidentes-e-licoes.md` | ainda vazio; o primeiro incidente desta tese cria | ⏳ |
| `CLAUDE.md` | as regras desta pasta, igual ao do interno | ⏳ |

⚠️ **Numeração de decisão com prefixo próprio** (`D-E-001`). Sem isso, um `D-012` de cada pasta
significando coisas diferentes é questão de tempo.

---

## O que muda nos dois arquivos já escritos

### `00-LEIA-PRIMEIRO.md`
- A tabela "o que não ler aqui" hoje manda para `contexto_interno/`. **Trocar por `CLAUDE.md` da
  raiz e os `CLAUDE.md` de pasta.** A única linha que pode continuar apontando para lá é
  *"quer entender a tese interna"*.
- Acrescentar a regra de independência: *quem lê esta pasta não precisa abrir a outra.*

### `12-deltas-tecnicos.md` → `12-visao-tecnologica.md`
O arquivo hoje é escrito como diferença ("o que muda em relação a"). Precisa virar descrição
direta. O conteúdo aproveita quase inteiro; muda o enquadramento:

| Hoje (delta) | Vira (autossuficiente) |
|---|---|
| "a arquitetura já está 90% pronta precisa de qualificação" | **"O que existe hoje e o que falta"** — tabela do que é reaproveitável, sem comparar teses |
| "o conflito agregado × registro individual" | **"Por que o porteiro devolve linha bruta, e como isso é seguro"** — a regra do titular como invariante próprio, não como exceção a uma regra alheia |
| "identidade: o telefone é a nova barreira" | **"O titular"** — seção própria, com as quatro fragilidades e a invariante proposta |
| os três próximos passos | vira `20-pendencias.md` |

⭐ A doutrina herdada (R-01, R-02, R-13, autorização fora do alcance do modelo) entra **declarada
como invariante desta tese**, com o exemplo desta tese — não como citação da outra.

---

## Ordem de execução sugerida

1. ⭐ `12-visao-tecnologica.md` + `13-contrato-do-conector.md` — **destravam a Etapa 1 de código**
2. `02-plataforma-vs-implementacao.md` — é o filtro que as próximas decisões vão usar
3. `00` (ajuste) · `04-glossario.md` · `03-erros-comuns.md`
4. `15-case-helisul.md` — ⚠️ depende de o número de deflexão estar medido
5. `10` e `11` — visão comercial e de produto
6. `20`, `30`, `CLAUDE.md` — acumulam a partir daqui

❓ **Decisão que precede tudo:** o Plum Externo é um produto novo no mesmo repositório, um
repositório novo, ou o `central-platform` que já existe fora daqui vira a base? A resposta muda
se `contexto_externo/` fica aqui ou viaja junto com o código.
