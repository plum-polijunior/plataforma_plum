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

**5. ⚠️ Prove que o log não derruba a pergunta.** É o único teste que vale, porque é o modo de falha
que transformaria observabilidade em incidente:

```sql
begin;
  revoke insert on public.plum_logs from authenticated;
  -- agora faça uma pergunta no chat: ela TEM de responder normalmente,
  -- só sem gravar log (o erro aparece no log da Edge Function)
rollback;
```

Se o chat quebrar, o `registrar()` está lançando em vez de engolir, e isso precisa ser corrigido
antes de qualquer bloco seguinte.

## Se der errado

| Sintoma | Rollback |
|---|---|
| Chat parou de responder depois do deploy | Republicar a versão anterior da função pelo painel (Edge Functions → `ai-plum-chat` → histórico) |
| Log não grava, mas o chat funciona | Nada urgente. É o comportamento projetado; investigar pelo `console.error` da função |
| Migration do log aplicada e quer desfazer | ⚠️ Não dropar (§4.9). `revoke insert ... from authenticated` para de gravar sem remover nada |
| A chave ligou para alguém sem querer | `update organizations set remake_habilitado = false;` — sem deploy, imediato |
