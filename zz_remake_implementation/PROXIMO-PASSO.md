# ▶ Próximo passo — onde o remake parou

**Atualizado:** 2026-08-20 · **Leia isto primeiro ao retomar.**

Este arquivo existe porque o agendador do Claude Code morre junto com a sessão: um lembrete só
sobrevive se estiver no repositório. Ele é sempre reescrito por inteiro — não é histórico, é estado.
O histórico está nos `DIARIO.md` de cada bloco.

---

## 👤 O que só você pode fazer, em ordem

### 1. Apagar a Edge Function órfã `plum-chat`

Achada na medição de 2026-08-20: `ACTIVE`, versão 38, criada em 14/07, **sem código no repositório**,
sem nenhuma chamada em `src/` ou `supabase/`, e com ⚠️ **`verify_jwt: false`** — invocável sem token.
É a primeira PRD da plataforma, sobrevivente do rename de `0b0eb9c`.

```powershell
Invoke-RestMethod -Method Delete `
  -Uri "https://api.supabase.com/v1/projects/rjwidarrsykufuifzunu/functions/plum-chat" `
  -Headers @{ Authorization = "Bearer $env:SUPABASE_ACCESS_TOKEN" }
```

⚠️ **Apagar não invalida segredo.** Os secrets do Supabase são por projeto, não por função: a
`plum-chat` enxergava `GEMINI_API_KEY` como qualquer outra, e esteve aberta desde 14/07. Vale olhar
o consumo do Gemini no período. Sem sinal de abuso, mas não dá para descartar.

### 2. Os dois passos "antes" do B02

Em `execucao/B02-redutora-seletora/MANUAL.md`. Na prática é só o passo 2: conferir se algum card tem
`limit > 500`, **antes do push** — porque o push publica o Lambda sozinho. (O passo 1 foi removido:
a D-028 que o justificava está encerrada.)

### 3. `git push`

Commits locais não pushados — confira com `git log --oneline origin/plataforma..plataforma`. O push
dispara `query-engine.yml`, que substitui o executor no mesmo minuto.

---

## 🤖 O que fica engatilhado para mim

**B03 (`metadados`) ou B05 (`_shared/llm.ts`)** — independentes entre si e do B02. Detalhe em
`PLANO-etapa-1.md` §C.

⚠️ **O B05 tem um pré-requisito seu:** criar o secret `ANTHROPIC_API_KEY`
(*supabase.com/dashboard/account/tokens* é outro token — este é da Anthropic). Não bloqueia: sem ele
a tabela papel→modelo cai para Gemini e o adaptador Claude nasce inerte.

---

## Estado

- **Etapa 0:** ✅ fechada. As três migrations aplicadas, `ai-plum-chat` publicada em 2026-08-20
  (versão 59), `plum_logs` gravando com token, latência e saída dos agentes.
- **Etapa 1:** plano em `PLANO-etapa-1.md`. **B02 implementado e commitado.** 285 testes Python,
  199 TypeScript, todos verdes.
- **D-028:** ✅ encerrada em 2026-08-20 — os três consumidores de `query_plan.ts` estão na mesma
  versão, medido pela Management API.
- **Bloqueante da etapa, sem dono:** o conjunto de **25–30 perguntas de avaliação** (V3 §6). Sem
  usuário real nesta plataforma, é o único critério de parada que o remake tem — papel pelas sete
  semanas, não tarefa de uma. **Não bloqueia nenhum bloco individual.**

## Pontas soltas

- ⭐ **`ls supabase/functions/` não é a lista do que está no ar.** A Management API lista seis
  funções; o repositório tem cinco. Já tinha acontecido com o `dashboard-agent` (I-03). Confira pela
  API antes de assumir — a receita está em `supabase/functions/README.md`.
- `zz_remake/LEIA-PRIMEIRO.md` está modificado no working tree apontando o **V2** como autoritativo,
  que o V3 substituiu. É edição sua; não commitei.
- `zz_remake_implementation/chequei-dashboard-agent-e-n-o-nested-platypus.md` continua **não
  rastreado de propósito** — contém a chave publicável do projeto Supabase abandonado.
- O I-03 registra a republicação em massa às `18:38:22Z`; a API diz `2026-08-12 15:51:31.617 UTC`.
  O fenômeno está confirmado, o relógio anotado não. Registrado no próprio I-03.
- `contexto/30-decisoes.md` passou de 450 linhas (teto 400). Divisão limpa: D-001..D-030 `vigente`
  × D-031+ `proposta`. Decisão sua, não comecei.
