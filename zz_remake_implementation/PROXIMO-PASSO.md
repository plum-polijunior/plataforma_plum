# ▶ Próximo passo — onde o remake parou

**Atualizado:** 2026-08-20, fim do dia · **Leia isto primeiro ao retomar.**

Este arquivo existe porque o agendador do Claude Code morre junto com a sessão: um lembrete só
sobrevive se estiver no repositório. Ele é sempre reescrito por inteiro — não é histórico, é estado.
O histórico está nos `DIARIO.md` de cada bloco.

---

## 👤 A fila, em ordem

### 1. Publicar o `ai-plum-chat` e seguir o `MANUAL.md` do B07

```bash
npx supabase functions deploy ai-plum-chat --project-ref rjwidarrsykufuifzunu
```

⭐ **É o bloco em que o remake passa a RESPONDER.** Com a chave ligada, a resposta na tela vem do
caminho novo — e qualquer falha dele cai para o legado em silêncio, que é o que torna isso seguro.

⚠️ **Consequência: ausência de defeito na tela NÃO prova que o `ad_hoc` funcionou.** O manual tem a
query que separa os dois casos, e ela é o passo mais importante do bloco.

⚠️ **É a primeira vez que o adaptador da Anthropic roda.** Confira que `planejador` e `interprete`
saem com `modelo = claude-opus-5` no log — se vier Flash, a chave não está sendo lida.

⭐ E o passo que mais rende: **repita `quanto joão silva vendeu?`** e compare com R$ 224.042,24, que é
o que o caminho antigo respondeu em 2026-08-20. Número diferente é o achado mais importante que este
bloco pode produzir.

### 2. ✅ (feito) Migrations, Lambda e o deploy do B06

⚠️ Do episódio do push de 2026-08-21, uma coisa **continua de pé**: o `query-engine.yml` roda
`update-function-code` **antes** do smoke test, então não há janela em que o deploy seja verificado
antes de valer. Derrubou o executor uma vez (**I-09**), e virou **C4b** em `20-pendencias.md`.


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
