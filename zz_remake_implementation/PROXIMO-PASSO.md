# ▶ Próximo passo — onde o remake parou

**Atualizado:** 2026-08-20, fim do dia · **Leia isto primeiro ao retomar.**

Este arquivo existe porque o agendador do Claude Code morre junto com a sessão: um lembrete só
sobrevive se estiver no repositório. Ele é sempre reescrito por inteiro — não é histórico, é estado.
O histórico está nos `DIARIO.md` de cada bloco.

---

## 🚨 ANTES DE QUALQUER COISA: o Lambda está 5 commits atrás

**`git push`.** É o primeiro passo, e ele reordena tudo o que vem depois.

Sete commits locais não pushados, e o `origin` está em `4ffc316` — ou seja, **o executor em produção
tem o B02 e não tem o B03**. O `tipo: "metadados"` não existe para ele.

⚠️ **Isso muito provavelmente explica o erro do reconhecedor de ontem à noite**, e não a hipótese que
levantei na hora (matriz de permissões velha). Sem o B03, o pedido `metadados` cai no caminho de
plano normal com `plan: {}` → `RawRowsBlocked` → *"Este card precisa de uma agregação"*. Bate com o
sintoma de "renomeei a coluna e continua dando erro".

⭐ **A lição, para mim e para o arquivo:** eu teoricei sobre a causa antes de conferir o que estava
publicado. É literalmente o I-03 (*"o código no repositório não é o que está rodando"*), e desta vez
nem o repositório estava — o commit era local.

**Como confirmar em 30 segundos, depois do push e do deploy:**

```sql
select codigo_erro, jsonb_pretty(resposta_agente) as detalhe
from plum_logs
where caminho = 'ad_hoc' and etapa = 'reconhecedor' and status = 'erro'
order by created_at desc limit 1;
```

Se o `detalhe` de ontem falar em *"precisa de uma agregação"*, era o Lambda atrasado e acabou. Se
falar em *"a planilha não tem a(s) coluna(s): X"*, aí sim é a matriz de permissões, e o conserto de
ontem (`tolerar_ausentes`) faz o A2 reportar X nas `observacoes` em vez de morrer.

---

## 👤 A fila, em ordem

### 1. `git push`

Sobe o Lambda sozinho (Action `query-engine`) com B03, B04 e o conserto do `metadados`.

### 2. Duas migrations, nesta ordem

```
supabase/migrations/20260820120000_vocabulario_exposto.sql     (B04)
supabase/migrations/20260820130000_plum_reconhecimento.sql     (B06)
```

A ordem numérica é a de aplicação. Leia o bloco de verificação de cada uma.

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

**B07 (A3 + A4 + presunções)** — o mais caro da etapa, e onde o `ad_hoc` passa a **responder** em vez
de só reconhecer. Consome tudo que os seis blocos anteriores deixaram pronto.

⚠️ **É a primeira vez que o `_shared/llm/claude.ts` roda.** Escrito no B05, nunca executado —
qualquer surpresa, suspeite dele antes de suspeitar do prompt.

⚠️ O prompt do A3 é **o artefato mais importante da etapa** (V7 §9) e o único sem responsável
nomeado. O texto da V7 §5.3 é ponto de partida, não entrega.

---

## Estado

- **Etapa 0:** ✅ fechada e no ar.
- **Etapa 1:** 6 dos 9 blocos escritos. **B02 no ar. B03, B04, B05 e B06 commitados e NÃO pushados.**
  Faltam B07, B08, B09 e B10.
- **Testes:** 339 Python, 257 TypeScript, `tsc` limpo, lint na baseline (65 erros, nenhum novo).
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
