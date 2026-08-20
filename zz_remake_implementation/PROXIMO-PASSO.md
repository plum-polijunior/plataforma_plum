# ▶ Próximo passo — onde o remake parou

**Atualizado:** 2026-08-20 · **Leia isto primeiro ao retomar.**

Este arquivo existe porque o agendador do Claude Code morre junto com a sessão: um lembrete só
sobrevive se estiver no repositório. Ele é sempre reescrito por inteiro — não é histórico, é estado.
O histórico está nos `DIARIO.md` de cada bloco.

---

## 👤 O que só você pode fazer, em ordem

### 1. Apagar a Edge Function órfã `plum-chat` — pelo painel

⚠️ Combinado em 2026-08-20: você faz pelo front do Supabase. O que segue é a alternativa por API.


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

### 2. Colar a migration do B04

`supabase/migrations/20260820120000_vocabulario_exposto.sql` no SQL Editor. Quatro linhas de
verificação, e a terceira é a que importa — *"NENHUMA base nasceu com vocabulario exposto"*.

⭐ **O B04 não pede deploy nenhum**: o código novo é só `_shared/`, nada o importa ainda, e o
`pandas_executor.py` não foi tocado. Deixe `vocabulario_exposto` desligada até o B06 — ligar antes só
remove uma trava de um caminho que ninguém percorre.

### 3. (feito) Publicar o B03 e o B05

Os dois estão commitados e vão juntos no próximo push. O **B03** é só executor — sobe sozinho na
Action. O **B05** é o primeiro bloco da Etapa 1 que exige deploy de Edge Function:

```bash
npx supabase functions deploy ai-plum-chat --project-ref rjwidarrsykufuifzunu
```

⚠️ Só essa função, e confirme pelo `ezbr_sha256`. Se o deploy não subir, o chat responde com o código
antigo e todos os testes passam sem provar nada.

Depois: `execucao/B05-llm/MANUAL.md`, passo 2 — ⭐ conferir que `tokens_entrada` **não** está nulo no
`plum_logs`. Foi exatamente o que o B05 mexeu.

---

## 🤖 O que fica engatilhado para mim

**B06 (A1 + A2 + cache de A2 + a chave `remake_habilitado`)** — o próximo, e a virada da etapa:
é onde o caminho `ad_hoc` **passa a existir**. Detalhe em `PLANO-etapa-1.md` §C.

⭐ Três coisas convergem nele: a chave `remake_habilitado` ganha o primeiro consumidor (adiada desde
a Etapa 0 por não haver o que gatear), o critério §0.5 do V3 vira exigível (uma pergunta com a chave
ligada e outra desligada, e o log mostrando `ad_hoc` × `legado`), e as peças de B02/B03/B04 deixam de
ser código sem consumidor.

⚠️ E é o primeiro bloco que **exige decisão de front**: o `ad_hoc` roda em duas invocações
(`ad_hoc_planejar` / `ad_hoc_executar`, §B1 do plano), então o `PlumChat.tsx` muda.

---

## Estado

- **Etapa 0:** ✅ fechada. As três migrations aplicadas, `ai-plum-chat` publicada em 2026-08-20
  (versão 59), `plum_logs` gravando com token, latência e saída dos agentes.
- **Etapa 1:** plano em `PLANO-etapa-1.md`. **B02, B03 e B05 no ar e validados.** B04
  (`vocabulario` + resolvedor) commitado, esperando só a migration. 334 testes Python, 243
  TypeScript, todos verdes.
- **D-028:** ✅ encerrada em 2026-08-20 — os três consumidores de `query_plan.ts` estão na mesma
  versão, medido pela Management API.
- **Bloqueante da etapa, sem dono:** o conjunto de **25–30 perguntas de avaliação** (V3 §6). Sem
  usuário real nesta plataforma, é o único critério de parada que o remake tem — papel pelas sete
  semanas, não tarefa de uma. **Não bloqueia nenhum bloco individual.**

## Pontas soltas

- ⚠️ **O adaptador da Anthropic (`_shared/llm/claude.ts`) continua sem nunca ter sido executado**,
  mesmo com a `ANTHROPIC_API_KEY` já criada: os papéis que apontam para ele (`planejador`,
  `interprete`) só nascem no B07. É um caminho **alcançável e não testado**, que é pior que
  inalcançável — qualquer surpresa no B07, suspeite dele primeiro.
- ⚠️ **Segunda dívida de normalização duplicada**, criada no B04: `_shared/texto.ts` (Deno) ×
  `_strip_accents` (Lambda), com tabela de 11 casos replicada. A primeira (D-017, nome de coluna)
  falha barulhento; esta falha **muda** — divergir devolve resultado vazio. Mudou um lado, mude o
  outro e os dois testes.

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
