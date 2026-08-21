# ▶ Próximo passo — onde o remake parou

**Atualizado:** 2026-08-20, fim do dia · **Leia isto primeiro ao retomar.**

Este arquivo existe porque o agendador do Claude Code morre junto com a sessão: um lembrete só
sobrevive se estiver no repositório. Ele é sempre reescrito por inteiro — não é histórico, é estado.
O histórico está nos `DIARIO.md` de cada bloco.

---

## ⚠️ O que aconteceu no push de 2026-08-21

O push subiu tudo e **derrubou o executor**: o `Dockerfile` listava os módulos um a um e o
`metadados.py` (B03) nunca entrou na lista. `Runtime.ImportModuleError`, executor fora do ar até o
push seguinte. Corrigido com `COPY *.py` — está em **I-09** de `contexto/31-incidentes-e-licoes.md`.

⭐ **A lição que sobrou, e é mais geral que o Docker:** *um teste que roda contra o repositório não
diz nada sobre o artefato publicado.* Vale igual para o `_shared/` das Edge Functions, que é
empacotado por função.

⚠️ E a causa que **continua de pé**: o `query-engine.yml` roda `update-function-code` **antes** do
smoke test. Virou **C4b** em `20-pendencias.md`.

---

## 👤 A fila, em ordem

### 1. ✅ (feito) `git push` — Lambda no ar com B03, B04 e os consertos

### 2. Duas migrations, nesta ordem

```
supabase/migrations/20260820120000_vocabulario_exposto.sql     (B04)
supabase/migrations/20260820130000_plum_reconhecimento.sql     (B06)
```

A ordem numérica é a de aplicação. Leia o bloco de verificação de cada uma.

⚠️ A do B06 falhou na primeira tentativa com `42710: policy already exists` — faltava
`DROP POLICY IF EXISTS`. **Corrigido**: pode rodar de novo do começo, por cima da execução parcial.

### 3. `npx supabase functions deploy ai-plum-chat --project-ref rjwidarrsykufuifzunu`

Confirme pelo `ezbr_sha256` — receita em `supabase/functions/README.md`, seção Deploy.

### 4. O `MANUAL.md` do B06, do começo

`execucao/B06-porteiro-reconhecedor/MANUAL.md`. Ele testa **primeiro com a chave desligada** (nada
pode mudar), depois ligando numa organização de teste. Dois critérios da etapa saem dali:

- **§0.5 do V3** — os dois caminhos (`legado` e `ad_hoc`) no **mesmo `turno_id`**;
- **V7 §8 item 4** — `cache_hit_a2 = true` na 2ª pergunta na mesma base.

⭐ **O passo 7 é o único do remake sem teste automatizado:** ler o `plum_reconhecimento` e julgar se
o A2 entendeu a base. Se ele estiver lendo mal, o A3 vai planejar mal e nenhum ajuste no B07
conserta.

---

## 🤖 O que fica engatilhado para mim

**B09 (`agg` ampliado)** ou **B10 (`registro`, `amostra` e orçamento)** — os dois que sobram, e
independentes entre si.

⭐ **O B08 encolheu no B07:** a negação parcial saiu de graça quando os pedidos viraram um lote. O
que resta dele é uma decisão, não código — ligar ou não o teto de cardinalidade no caminho legado,
com o dado que o modo observação do B02 já vem acumulando (`[adhoc-observacao]` no CloudWatch).

⚠️ O prompt do A3 é **o artefato mais importante da etapa** (V7 §9) e continua sem responsável
nomeado. Nada do B07 diz se ele planeja bem — só que a forma do que ele devolve é conferida. Quem
diz é a suíte de 25–30 perguntas.

---

## Estado

- **Etapa 0:** ✅ fechada e no ar.
- **Etapa 1:** **8 dos 9 blocos** (o B08 encolheu para uma decisão). B02–B06 no ar e validados;
  **B07 commitado, esperando o deploy do `ai-plum-chat`.** Faltam B09 e B10.
- ⭐ **O `ad_hoc` responde de ponta a ponta** a partir do próximo deploy, com queda para o legado em
  qualquer falha.
- **Testes:** 339 Python, 269 TypeScript, `tsc` limpo, lint na baseline (65 erros, nenhum novo).
- **Bloqueante da etapa, sem dono:** o conjunto de **25–30 perguntas de avaliação** (V3 §6). Sem
  usuário real, é o único critério de parada que o remake tem. **Não bloqueia nenhum bloco.**

## Pontas soltas

- ⚠️ **`_shared/llm/claude.ts` nunca foi executado**, mesmo com a `ANTHROPIC_API_KEY` criada: os
  papéis que apontam para ele nascem no B07. Caminho alcançável e não testado é pior que
  inalcançável.
- ⚠️ **Duas dívidas de normalização duplicada**, TS × Python, com tabela de casos replicada:
  nome de coluna (D-017, falha barulhenta) e **valor de texto** (B04, falha **muda** — devolve
  resultado vazio). Mudou um lado, mude o outro e os dois testes.
- **C11 e C12** em `contexto/20-pendencias.md` saíram desta semana e se resolvem juntos, no
  onboarding: cabeçalhos que colidem ao normalizar, e `allowed_columns` que nunca é revalidado
  contra a planilha. ⭐ O `metadados` já sabe apontar o segundo.
- `zz_remake/LEIA-PRIMEIRO.md` modificado no working tree apontando o **V2** como autoritativo, que
  o V3 substituiu. É edição sua; não commitei.
- `20260818120000_plum_logs_resposta.sql` está sem quebra de linha no fim — edição sua ao colar no
  SQL Editor. Inofensivo.
- `zz_remake_implementation/chequei-dashboard-agent-e-n-o-nested-platypus.md` continua **não
  rastreado de propósito**: contém a chave publicável do projeto Supabase abandonado.
- `contexto/30-decisoes.md` passou de 450 linhas (teto 400). Divisão limpa: D-001..D-030 `vigente`
  × D-031+ `proposta`. Decisão sua.
