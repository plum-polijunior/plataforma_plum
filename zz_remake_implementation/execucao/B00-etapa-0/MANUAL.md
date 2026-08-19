# B00 · Etapa 0 — manual do 👤

## Antes de publicar qualquer coisa

**1. Colar `supabase/migrations/20260818100000_remake_habilitado.sql`** no SQL Editor.

Conferir o bloco final. As quatro linhas têm de sair `OK`. A que mais importa é a última —
*"NENHUMA organizacao nasceu com a chave ligada"*: se ela vier `FALTANDO`, o default não pegou e
alguma organização já está apontando para um caminho que ainda não existe.

**2. Colar `supabase/migrations/20260818110000_plum_logs.sql`.**

Ela roda três testes vivos antes da tabela de verificação — insere valores inválidos de propósito e
espera que os `CHECK` recusem. Se algum `RAISE EXCEPTION` disparar, **pare**: significa que o enum
não está travando e o log vai encher de valor sujo.

Depois, as oito linhas de verificação. Duas merecem olhar:

- *"Append-only: sem policy de UPDATE nem DELETE"* — log que pode ser editado não é log.
- *"Identidade tem default vindo do JWT"* — é o que dispensa a Edge Function de mandar
  `organization_id`/`user_id`. Sem os defaults, todo insert de log falha por `NOT NULL`.

**2-bis. Colar `supabase/migrations/20260818120000_plum_logs_resposta.sql`.**

Acrescenta `resposta_agente` — a saída de cada agente. Migration separada porque a anterior já está
aplicada, e migration aplicada não se edita.

⚠️ **Esta tem de rodar ANTES do deploy**, não depois: a função nova manda a coluna no insert. Como
`registrar()` engole o próprio erro, a ordem trocada não derruba o chat — só produz um punhado de
linhas perdidas com `column resposta_agente does not exist` no console da função.

## Publicar

```bash
npx supabase functions deploy ai-plum-chat --project-ref rjwidarrsykufuifzunu
```

⚠️ **Só esta função.** A Etapa 0 não tocou em `_shared/query_plan.ts`, então `dashboard-execute` e
`dashboard-agent` não precisam subir. (Se tivesse tocado, seriam os três — ver o
`supabase/functions/README.md`.)

⚠️ **Confirme que subiu pelo `ezbr_sha256`, não pelo `version`.** O `version` sobe sozinho em troca
de secret, sem código novo. É a regra do I-03.

## Depois

**3. Faça uma pergunta no chat** e confira:

```sql
select turno_id, etapa, status, latencia_ms, tokens_entrada, tokens_saida
from plum_logs
order by created_at desc
limit 10;
```

Esperado: **4 linhas com o mesmo `turno_id`** — `guard`, `plan_query`, `execute_plan`,
`synthesize_answer`, nessa ordem. Se o plano tiver vindo do cache de reuso, são **3** (sem
`plan_query`), e isso é o comportamento certo, não um bug.

⭐ **`tokens_entrada` e `tokens_saida` não podem estar nulos** nas linhas de agente. Se estiverem, a
leitura do `usageMetadata` não funcionou e "custo por pergunta" — a métrica principal deste log —
não existe. Era exatamente o estado anterior: o Gemini devolvia a contagem e o código descartava.

**4. Faça uma pergunta fora de escopo** ("resuma a revolução francesa") e confira que a linha do
`guard` saiu com `status = 'bloqueado'`, não `'ok'`.

**5. Confira que a saída do agente foi gravada.**

```sql
select etapa, status, jsonb_pretty(resposta_agente) as saida
from plum_logs
where turno_id = '<cole o turno_id do passo 3>'
order by created_at;
```

Esperado: `guard` com `{"status": "PERMITIDO", ...}`, `plan_query` com o Query Plan inteiro,
`synthesize_answer` com o texto da resposta.

⚠️ **`execute_plan` sai com `resposta_agente` nulo, e isso é o certo** — ele não é agente, e a saída
dele é dado de negócio do cliente. Se um dia aparecer conteúdo ali, alguém criou uma segunda cópia
dos números do cliente numa tabela com outra retenção.

---

## O que saiu deste manual, e por quê

**O passo antigo — "prove que o log não derruba a pergunta" — virou teste automatizado.**

O que ele pedia era isto, e **não funciona**:

```sql
begin;
  revoke insert on public.plum_logs from authenticated;
  -- ... faça uma pergunta no chat
rollback;
```

Um `REVOKE` dentro de transação não commitada é invisível para qualquer outra conexão — a Edge
Function continuaria inserindo normalmente, e o teste "passaria" sem ter testado nada. Na prática ele
nem chegaria lá: o REVOKE pega lock no objeto, e a sessão do chat travaria esperando.

⭐ **Mas a garantia que ele queria verificar é a mais importante da Etapa 0.** O `registrar()` roda em
*toda* pergunta; se ele lançar em vez de engolir, o log deixa de ser observabilidade e vira o motivo
de o chat estar fora do ar. E é um caminho que nunca executa em operação normal — o tipo de garantia
que apodrece em silêncio.

Por isso ela agora é `supabase/functions/_shared/log_core.test.ts`: um client dublê que falha de
propósito (erro do banco, exceção de rede, `throw` de string), verificado a cada `npm test` em vez de
uma vez, na mão. Foi o que motivou separar `log_core.ts` de `log.ts` — o segundo importa o
`supabase-js` de uma URL, que o vitest não resolve.

## Se der errado

| Sintoma | Rollback |
|---|---|
| Chat parou de responder depois do deploy | Republicar a versão anterior da função pelo painel (Edge Functions → `ai-plum-chat` → histórico) |
| Log não grava, mas o chat funciona | Nada urgente. É o comportamento projetado; investigar pelo `console.error` da função |
| Migration do log aplicada e quer desfazer | ⚠️ Não dropar (§4.9). `revoke insert ... from authenticated` para de gravar sem remover nada |
| A chave ligou para alguém sem querer | `update organizations set remake_habilitado = false;` — sem deploy, imediato |
