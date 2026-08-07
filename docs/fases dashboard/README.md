# docs/fases

Um arquivo por fase ou execução de trabalho relevante. O objetivo não é
registrar o que foi digitado: é registrar **por que** foi digitado, para que
alguém que chegar daqui a três meses não reabra uma discussão que já aconteceu
nem desfaça uma decisão sem saber que ela foi deliberada.

## Convenção de nome

```
AAAA-MM-DD-<slug-da-fase>.md
```

Exemplo: `2026-08-06-fase-0-executor-deterministico.md`

## O que cada arquivo tem

1. **Contexto** — o que existia antes e por que a fase foi necessária.
2. **Explicação didática** — o que foi construído, em linguagem que alguém de
   fora do código entenda, com diagramas quando ajudar.
3. **Resumo estruturado** — um bloco por task, no formato fixo abaixo.

## Formato do resumo (obrigatório ao final de cada arquivo)

```
Nome da task:

1. O que foi feito — a entrega em si, em 1-3 linhas
2. Decisão técnica — o "como" e o "porquê" + alternativas descartadas
3. Integrações tocadas — endpoints, APIs ou schemas (ou N/A)
4. Safeguard — só se corrigiu bug: o bug e como o novo código impede a
   recorrência (ou N/A)
5. Como validar — passos ou query para o próximo reproduzir
6. Lacunas e pendências — [LACUNA: o que falta — quem resolve — D.O.D.]
   (ou N/A). Nada implícito.
```

A regra da seção 6 é a mais importante do documento inteiro: **pendência que
não está escrita não existe**, e três meses depois vira retrabalho ou bug.

## Índice

| Data | Fase | Estado |
|---|---|---|
| 2026-08-06 | [Fase 0 — Executor determinístico](2026-08-06-fase-0-executor-deterministico.md) | Serviço completo e testado; deploy e Edge Function pendentes |
| 2026-08-07 | [Fase 0b — Ligando as pontas](2026-08-07-fase-0b-ligando-as-pontas.md) | Migration, Edge Function, `google_sheet_id`, vitest e script da AWS. Falta executar o provisionamento e aplicar a migration |
| 2026-08-07 | [Fase 1 — Chat ligado ao executor real](2026-08-07-fase-1-chat-executor-real.md) | Chat, Edge Functions unificadas em `supabase/functions/`, cache ligado, deploy automático das Edge Functions via integração GitHub↔Supabase. Falta teste E2E real |

## Documentos relacionados

- `DESIGN.md` na raiz: sistema de design, criado na revisão de design.
- `TODOS.md` na raiz: trabalho conscientemente adiado, com o raciocínio junto.
- `query_engine/prd.md`: PRD do chat conversacional (anterior a estas fases).
