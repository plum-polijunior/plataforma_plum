---
status: vigente
camada: plataforma
atualizado_em: 2026-08-14
---

# O que é o Plum (a plataforma)

> **O que este arquivo é:** o produto em uma leitura — o que faz, para quem, como funciona ponta a
> ponta, e o que ele deliberadamente não faz.
> **O que este arquivo NÃO é:** roadmap (é `22-planos-futuros.md`), nem arquitetura-alvo do remake
> (é `12-visao-tecnologica.md`), nem o manual de operação (é `CLAUDE.md`).
>
> ⚠️ Sempre que este arquivo disser "o Plum", leia **a plataforma**. A distinção está em
> `02-plataforma-vs-implementacao.md`.

---

## Em um parágrafo

A Plataforma Plum é um sistema multitenant de *Natural Language Query* sobre planilhas. O usuário
conecta um Google Sheets, a IA gera um dicionário semântico da base, e depois ele conversa com os
dados em português. **A IA nunca calcula: ela planeja, e o Python executa.** É read-only por
construção — o Plum nunca altera, cria ou apaga nada na fonte do cliente.

---

## O problema que resolve

Numa empresa de médio porte, a distância entre a dúvida de um gestor e o número que responde a
dúvida passa por: pedir para um analista, esperar, receber uma planilha, descobrir que a pergunta
era outra, pedir de novo. O dado existe — está no ERP, no CRM, na planilha. O que não existe é
**acesso** a ele na velocidade da decisão.

O vocabulário interno para isso: sistemas de **registro** (ERP, CRM, planilha) guardam o dado;
sistemas de **entrega** (BI, dashboard, o Plum de hoje) dão acesso ao dado. O remake acrescenta o
terceiro degrau — **decisão** — porque acesso mais rápido é conveniência, e conveniência não
sustenta ticket de projeto. Ver `10-visao-comercial.md`.

---

## Como funciona hoje, ponta a ponta

### 1. Onboarding da base (5 etapas)

O usuário sobe um arquivo e conecta a planilha correspondente. As etapas:

1. **Upload invisível** — o arquivo é lido no **navegador** (`FileReader`); só **cabeçalho + 5
   linhas** trafegam, nunca a base inteira.
2. **Revisão de colunas** — nomes normalizados para `snake_case` sem acento.
3. **Formatação** — a IA propõe regras de limpeza/tipagem e mostra antes-e-depois nas amostras.
4. **Semântica** — a IA propõe a definição de negócio de cada coluna; **o humano revisa** (R-06).
5. **Persistência** — o `schema_metadata` é salvo e a planilha é vinculada.

⚠️ **O pipeline nunca lê a planilha** — só o arquivo. Aba errada, planilha não compartilhada e
cabeçalho divergente aparecem dias depois, no chat, como erro. Ver `31-incidentes-e-licoes.md` I-08.

### 2. Pergunta no chat

Três chamadas de LLM em sequência, todas recebendo o `schema_metadata` e **nenhuma** recebendo as
linhas da base:

| | Agente | Papel |
|---|---|---|
| 1 | **Z — Guardião** | a pergunta é sobre dados? as colunas necessárias existem? Bloqueia fora de escopo e o inviável (pedir lucro sem coluna de custo) |
| 2 | **A — Planejador** | emite o **Query Plan** JSON: `from`, `select`, `where`, `group_by`, `order_by`, `limit`. Pode ser **pulado** se o plano já estiver em cache (`30-decisoes.md` D-024) |
| 3 | **C — Sintetizador** | recebe a pergunta + o vetor de resultados e escreve a resposta. Nunca faz conta (R-13) |

### 3. Entre A e C: o executor

`execute_plan` resolve o `allowed_columns` do cargo do usuário, autoriza o plano com
`authorizePlan`, assina (HMAC + SigV4) e chama o **Lambda**. O executor é um **motorista cego**:
não vê a pergunta, não conhece a intenção, não consulta o Supabase. Ele lê só as colunas
necessárias do Sheets (um `batchGet` por dataset), aplica as regras de formatação, executa o plano
em pandas e devolve um vetor agregado.

### 4. Dashboard

Um card é um Query Plan salvo. `dashboard-agent` cria o card a partir de uma pergunta;
`dashboard-execute` roda os cards em lote e guarda snapshot chaveado por
`permissions_fingerprint` — revogar uma coluna invalida o cache sozinho.

---

## Multitenancy e acesso

Hierarquia: `anon` < autenticado sem org < membro `pendente` (**não lê dados**) < membro `ativo` <
`Admin` da org < `service_role`.

**Permissão default é nada.** `role_permissions.allowed_columns` começa vazio; liberação é
explícita por par (cargo, dataset). Toda decisão de acesso é resolvida **antes** de qualquer chamada
ao executor, com o JWT do usuário e o RLS do Postgres.

O JWT carrega 4 claims injetadas por hook: `organization_id`, `profile_status`, `role_id`,
`role_name`. ⚠️ **Claims só são reemitidas no login** — mudar `status` no banco não reflete até o
usuário sair e entrar.

---

## O que o Plum deliberadamente NÃO faz

| Não faz | Por quê |
|---|---|
| **Escrever na fonte do cliente** | R-01. É o que faz o TI do cliente aprovar, e é pilar de venda antes de ser decisão técnica (`30-decisoes.md` D-018) |
| **Calcular no LLM** | R-02. Nenhum número sai de texto livre. É o antídoto anti-alucinação |
| **Criar planilha** | O cliente cola a URL da própria base e compartilha com a service account como Leitor. A governança de acesso continua sendo dele |
| **Devolver linha bruta** | Todo resultado é agregado (`RawRowsBlocked`). ⚠️ Em revisão pelo remake — `30-decisoes.md` D-033 |
| **Join entre planilhas** | R-11. O remake propõe cruzar depois da agregação (D-035) |
| **Substituir Power BI** | Foco é resposta e insight rápido, não painel complexo |
| **Prever o futuro** | Cenário é aritmética sobre premissa declarada, não previsão |
| **Mostrar o chat de um usuário para outro** | A RLS de `plum_chat` é `auth.uid() = user_id`. Nem gestor nem colega lê |

---

## O cérebro do produto: `schema_metadata`

É o campo `jsonb` em `datasets` que guarda, por coluna, a **definição semântica** (para o LLM
entender o conceito de negócio) e as **`formattingRules`** (limpeza e tipagem). Toda inteligência
do chat depende dele.

⭐ **E hoje ele é meio cérebro:** conhece as **colunas**, não os **valores**, nem as **relações**
entre tabelas, nem as **regras** do negócio. É a lacuna central que o remake ataca — ver
`12-visao-tecnologica.md`.

---

## Stack, em uma linha cada

- **Front:** React 18 + Vite 5 + TypeScript + Tailwind + shadcn/ui, deploy na Vercel.
- **Backend:** Supabase — Postgres com RLS + Edge Functions em Deno.
- **LLM:** Google Gemini (API paga). Claude em avaliação (`30-decisoes.md` D-038).
- **Executor:** Python + pandas, imagem de container em **AWS Lambda**, atrás de Function URL com
  `AuthType=AWS_IAM`.
- **Fonte de dados:** Google Sheets API, escopo `spreadsheets.readonly`.

Detalhe operacional — comandos, testes, deploy, armadilhas — está no `CLAUDE.md` da raiz.

---

## Onde o produto está

| | Estado |
|---|---|
| Plataforma | em beta. Chat e dashboard funcionando de ponta a ponta com executor real |
| Vendas | **4 fechadas**, ticket médio ~R$ 23k — vendendo majoritariamente a **implementação** |
| Remake | em desenho. Nada de `12-visao-tecnologica.md` está implementado |
