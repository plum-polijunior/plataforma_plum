---
status: vigente
camada: ambos
atualizado_em: 2026-09-03
---

# Plataforma × Implementação

> **O que este arquivo é:** a distinção mais importante do produto, e o teste que toda proposta de
> feature tem de passar.
> **O que este arquivo NÃO é:** arquitetura (é `12-visao-tecnologica.md`) nem preço
> (é `10-visao-comercial.md`).

---

## O princípio

> ⭐ **QUANTO MELHOR FOR A PLATAFORMA, MAIS FÁCIL É A IMPLEMENTAÇÃO.**

Toda melhoria de plataforma é dividida por todos os clientes futuros. Toda hora gasta em
implementação serve a um cliente só. Não é que implementação seja ruim — é que ela tem de ser o
mínimo irredutível, e a plataforma tem de empurrar esse mínimo para baixo a cada versão.

---

## As duas coisas

**🏗️ Plataforma Plum** — multi-tenant, plug-and-play, **horizontal**. O cliente conecta as
planilhas dele sozinho, faz o onboarding pela interface e sente o gostinho do produto. Funciona
para qualquer planilha, de qualquer setor. **É uma demo** — não no sentido de ser fraca, mas no
sentido de que o objetivo dela é provar valor, não entregar o valor final.

**🔧 Plum implementado** — **vertical**, feito à mão sobre a base real de um cliente. É o
dicionário revisado, as fórmulas do negócio dele, o grão de cada tabela, o que é sensível, quais
análises importam naquele setor. **É o que se vende.**

| | 🏗️ Plataforma | 🔧 Implementação |
|---|---|---|
| **Escala** | custo marginal ~zero por cliente | custo marginal alto (horas de gente) |
| **Alvo** | qualquer planilha, qualquer setor | uma base, um setor |
| **Quem faz** | dev, uma vez | equipe técnica, por cliente |
| **Onde cobra** | recorrência, por assento | projeto — o **onboarding de dados** |
| **Falha típica** | funciona pra todo mundo, encanta ninguém | encanta um, não escala |
| **O que a IA precisa** | mecanismo: buscar, agregar, autorizar | significado: o que a coluna quer dizer |

---

## ⭐ A regra de ouro, nas duas direções

**Se depende de saber o que a coluna significa → não é plataforma.**
`margem = receita − custo − glosa` não é código, é conhecimento do negócio do cliente. Colocar isso
na plataforma é hardcodear um cliente — o erro que travou o Plum legado single-tenant.

**Se serve para qualquer base → não deveria ser feito à mão.**
Se a equipe técnica está repetindo a mesma tarefa no terceiro cliente, aquilo é plataforma
disfarçada de projeto. É aqui que o ticket fica preso em gente-hora.

⭐ **Antes de aceitar qualquer proposta de feature, uma pergunta: é plataforma ou implementação?**
Se a resposta for "os dois", ela ainda não está desenhada — separe as duas partes antes de estimar.

---

## A fronteira de responsabilidade com o usuário

> **A plataforma interpreta os dados e produz um resultado. O stakeholder decide o que aquele
> resultado significa para o negócio dele.**

Isso não é uma esquiva de responsabilidade — é o desenho. A plataforma não sabe se margem de 4,1% é
boa ou ruim naquele setor, e finge saber é pior que não saber. O que ela **tem** de fazer é mostrar
como chegou lá: os números que usou, os cálculos que fez, o que assumiu.

Quando o cliente quer que o produto **também** interprete o significado — "4,1% está abaixo da sua
meta" — isso vira regra de negócio, e regra de negócio é 🔧.

---

## A tensão central do negócio

> *"Sem conseguir trazer insights de maneira multi-tenant com o produto, morreremos com ticket
> médio de 23k e ITIP de 2k."*

Está correto, e a saída não é tornar o insight genérico. É separar o insight em duas metades:

| | Escala? | Camada |
|---|---|---|
| **Como analisar** — comparação temporal, decomposição de variação, Pareto, sazonalidade… | ✅ ~12 padrões, feitos uma vez | 🏗️ |
| **O que significa** — o que é glosa, se subir é ruim, qual o grão da tabela | ❌ por cliente | 🔧 |

⭐ **É por isso que um "catálogo de 20 insights de saúde" não resolve o problema:** ele vale zero
para o varejo. O que é multi-tenant é o **repertório de análises**; o que não é multi-tenant é o
**significado**. Ver `30-decisoes.md` D-036.

E note o lado bom dessa dependência: o produto **precisa** do onboarding, e o onboarding **produz**
o insumo do produto. Serviço e produto se vendem um ao outro. A forma insalubre é a de hoje, em que
o serviço vende e o produto pega carona.

---

## Classificação do que já foi proposto

| Item | Camada |
|---|---|
| Contrato `/resolver`, pedidos nomeados, negação parcial | 🏗️ |
| Arquiteto — decompor pergunta em plano analítico | 🏗️ (o ativo principal) |
| Catálogo de padrões analíticos (~12, universais) | 🏗️ |
| Motor pandas, RBAC de coluna, cache, teto de linhas | 🏗️ (já existe) |
| `metadados` como primitiva | 🏗️ |
| Multi-planilha num "banco de dados" | 🏗️ |
| Cenários (`overrides`) | 🏗️ |
| Orçamento de linhas por sessão + log | 🏗️ |
| Editor de fórmulas/grão em "minha base de dados" | 🏗️ mecanismo · 🔧 conteúdo |
| `vocabulario` de dimensão | 🏗️ mecanismo · 🔧 quais colunas |
| **Dicionário semântico** (o que cada coluna significa) | 🔧 |
| **Regras de negócio** (fórmulas, sinais, proibições) | 🔧 |
| **Relações e grão** entre planilhas | 🔧 |
| Quais colunas são sensíveis | 🔧 |
| Insights de domínio ("glosa", "paralisação") | 🔧 |
| Travar a IA quando falta fórmula | 🔧 (opcional por cliente — `30-decisoes.md` D-037) |

---

## Segurança atravessa as duas camadas — e a divisão é precisa

| | Camada | Exemplos |
|---|---|---|
| **Mecanismo** | 🏗️ **plataforma, sem exceção** | isolamento de tenant, RLS, `current_org_id()`, RBAC de coluna, teto de linhas, orçamento de linhas, log de acesso |
| **Política** | 🔧 implementação | *quais* colunas são sensíveis, *quais* vocabulários podem ser expostos, se a IA pode ver amostra desta base |

**Por que a política é 🔧:** nenhuma heurística da plataforma adivinha que `obs_cliente` tem CPF
colado à mão. Toda regra que tenta inferir sensibilidade a partir da forma da planilha erra nas
duas direções — mesmo modo de falha do k-anonimato (`30-decisoes.md` D-012).

**Por que o mecanismo é 🏗️:** a plataforma é onde clientes reais sobem dados reais. Uma demo
multi-tenant com dado de 5 empresas é alvo tão legítimo quanto produção — e o incidente de
2026-07-22 foi falha de **mecanismo** (`31-incidentes-e-licoes.md` I-01).

⭐ **A regra:** *a plataforma fornece os cofres; a implementação decide o que guardar em cada um.*
Cofre sem chave é inútil; chave sem cofre é pior.

---

## ⭐ Elas rodam em infraestruturas diferentes — e ninguém tinha escrito isso

**A implementação de cada cliente é um deploy TOTALMENTE separado:** Supabase próprio, Lambda
próprio, service account do Google própria. Ela foi derivada desta plataforma e já está pronta e
entregue.

**Consequência que mais importa no dia a dia:** 🏗️ **esta plataforma não tem usuário cliente.** Quem
a usa são os **devs**, para testar, e prospects, numa demonstração. Mudar, quebrar ou republicar
qualquer coisa aqui **não alcança os 4 clientes**.

⚠️ **Isto não afrouxa nada — muda o que está em risco.** O que se protege aqui não é o cliente no
ar, é a **demonstração**: a plataforma é como o cliente experimenta o produto antes de comprar, e
uma demo quebrada custa uma venda.

⚠️ **É a armadilha mais fácil deste repositório, e ela pega quem já leu a frase 4 do
`00-LEIA-PRIMEIRO`.** Saber que "a plataforma é uma demo" não basta: dá para saber disso e ainda
assim planejar como se os clientes estivessem conectados aqui. Aconteceu em 2026-08-18, na primeira
redação do `zz_remake/zz_remake_implementation/PLANO-implementacao-remake_V3.md` — metade do documento era
proteção contra um dano impossível. Ver `03-erros-comuns.md`.

---

## Onde isso vive no repositório

| | Onde |
|---|---|
| 🏗️ código da plataforma | `src/`, `supabase/functions/`, `query_engine/`, `supabase/migrations/` |
| 🏗️ contexto da plataforma | `contexto/01`, `02`, `11`, `12`, `20` |
| 🔧 método e templates | `contexto/40-implementacao/` |
| 🔧 conhecimento de cliente | `contexto/40-implementacao/clientes/<cliente>/` |

⚠️ **Regra de dependência:** código da plataforma **nunca importa** nada de `40-implementacao/`. O
conhecimento de cliente é carregado como **dado** (via `schema_metadata` e regras no banco), nunca
como código. No dia em que uma condicional na plataforma disser
`if (cliente === 'x')`, a separação morreu.
