# ▶ Próximo passo — onde o remake parou

**Atualizado:** 2026-08-19, fim do dia · **Leia isto primeiro ao retomar.**

Este arquivo existe porque o agendador do Claude Code morre junto com a sessão: um lembrete só
sobrevive se estiver no repositório. Ele é sempre reescrito por inteiro — não é histórico, é estado.
O histórico está nos `DIARIO.md` de cada bloco.

---

## 👤 O que só você pode fazer, em ordem

### 1. Fechar a Etapa 0 (pendente desde o commit `058f9df`)

```
a) Colar supabase/migrations/20260818120000_plum_logs_resposta.sql no SQL Editor
b) npx supabase functions deploy ai-plum-chat --project-ref rjwidarrsykufuifzunu
c) Conferir o ezbr_sha256 (receita em supabase/functions/README.md, seção Deploy)
```

⚠️ **Nessa ordem.** A função nova manda `resposta_agente` no insert. Trocada, não derruba o chat — o
`registrar()` engole o próprio erro —, só perde algumas linhas de log com
`column resposta_agente does not exist` no console.

Depois, o passo 5 do `execucao/B00-etapa-0/MANUAL.md`: confirmar que `resposta_agente` saiu
preenchida nas três linhas de agente e **nula** no `execute_plan`.

### 2. Os dois passos "antes" do B02

Estão em `execucao/B02-redutora-seletora/MANUAL.md`. O passo 2 (conferir se algum card tem
`limit > 500`) precisa acontecer **antes do push**, porque o push publica o Lambda sozinho.

⭐ **O passo 1 daquele manual provavelmente vai ser apagado** — ver a seção do 🤖 abaixo. Não gaste
tempo com ele antes de perguntar.

### 3. Só então: `git push`

Há **dois commits locais não pushados**: `435ac55` (o B02) e `a893d36` (documentação). O push
dispara `query-engine.yml`, que substitui o executor no mesmo minuto.

---

## 🤖 O que fica engatilhado para mim

**Encerrar a D-028.** O plano está pronto e aprovado; o portão é o deploy do item 1 acima.

A D-028 diz que `ai-plum-chat` roda com cópia **antiga** de `_shared/query_plan.ts`, de propósito
desde 2026-08-12. Isso quase certamente deixou de valer quando a Etapa 0 republicou a função — e
**sete documentos vivos ainda a tratam como fato corrente**, incluindo o plano da Etapa 1.
O deploy do item 1 fecha a questão por construção, seja qual for o histórico.

Consequência que muda conclusão, não só redação: sem a D-028, **o passo 1 do manual do B02 perde o
motivo inteiro** (a outra justificativa já tinha caído quando a integração GitHub↔Supabase foi
desconectada). Ele sai, e a receita de como ler o `ezbr_sha256` fica no
`supabase/functions/README.md`, que é onde pertence.

**Depois disso, o B03** (`metadados`) ou o **B05** (`_shared/llm.ts`) — são independentes entre si e
do B02. Detalhe em `PLANO-etapa-1.md` §C.

---

## Estado, em três linhas

- **Etapa 0:** implementada, migrations 1 e 2 aplicadas, a 3ª e o deploy pendentes.
- **Etapa 1:** plano escrito (`PLANO-etapa-1.md`). **B02 implementado e commitado**, não pushado.
  285 testes Python, 199 TypeScript, todos verdes.
- **Bloqueante da etapa, sem dono:** o conjunto de **25–30 perguntas de avaliação** (V3 §6). Sem
  usuário real nesta plataforma, é o único critério de parada que o remake tem — e é papel pelas sete
  semanas, não tarefa de uma. **Não bloqueia nenhum bloco individual.**

## Pontas soltas

- `zz_remake/LEIA-PRIMEIRO.md` está modificado no working tree apontando o **V2** como autoritativo,
  que o V3 substituiu. É edição sua; não commitei.
- `zz_remake_implementation/chequei-dashboard-agent-e-n-o-nested-platypus.md` continua **não
  rastreado de propósito** — contém a chave publicável do projeto Supabase abandonado. Não commitar.
- `contexto/30-decisoes.md` passou de 450 linhas (o teto é 400). Divisão limpa: D-001..D-030
  `vigente` × D-031+ `proposta`. Decisão sua, não comecei.
