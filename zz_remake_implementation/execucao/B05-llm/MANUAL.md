# B05 · abstração de provedor de LLM — manual do 👤

⚠️ **Este é o primeiro bloco da Etapa 1 que exige deploy de Edge Function.** O B02 e o B03 eram só
executor; aqui o caminho que responde as perguntas do chat mudou por dentro.

## Antes

**Nenhuma migration. Nenhum secret novo** — a `ANTHROPIC_API_KEY` ficou de fora a seu pedido, e o
bloco funciona sem ela.

## Publicar

```bash
npx supabase functions deploy ai-plum-chat --project-ref rjwidarrsykufuifzunu
```

⚠️ **Só esta função.** O B05 mexeu em `_shared/llm*` e `_shared/log*`, e o único consumidor dos dois
é o `ai-plum-chat`. O `query_plan.ts` não foi tocado, então o portão dos três consumidores não se
aplica.

⚠️ **Confirme pelo `ezbr_sha256`** — receita em `supabase/functions/README.md`, seção Deploy. Aqui
vale de verdade: se o deploy não subir, o chat continua respondendo com o código antigo e todos os
testes abaixo passam sem provar nada.

## Depois

**1. Faça uma pergunta normal no chat.** Ela tem de responder como sempre — o B05 não mudou nem o
prompt, nem o modelo, nem o comportamento do caminho atual. É refatoração.

**2. ⭐ Confira que o log continua com custo, e agora com o modelo de verdade:**

```sql
select etapa, status, modelo, provedor, tokens_entrada, tokens_saida, latencia_ms
from plum_logs
order by created_at desc
limit 10;
```

Esperado: `modelo = 'gemini-3.5-flash'`, `provedor = 'google'`, e **tokens não nulos**.

⚠️ **Se `tokens_entrada` vier nulo, pare.** Foi exatamente o que o B05 mexeu: a leitura de token saiu
do log e foi para dentro de cada adaptador. Nulo aqui significa que a mudança quebrou "custo por
pergunta", que é a métrica principal do log.

⭐ A diferença em relação a ontem: essas duas colunas eram **constantes cravadas no código**. Agora
vêm do adaptador — então quando um papel mudar de modelo, o log conta a verdade em vez de repetir
`gemini-3.5-flash`.

**3. Faça uma pergunta fora de escopo** e confira que o `guard` ainda grava `status = 'bloqueado'`.

**4. Procure `[llm]` no log da função.** Não deve aparecer nada. Esse prefixo só sai quando um papel
que deveria ir para a Anthropic cai no Gemini — e hoje nenhum papel da cadeia atual vai para lá.

## ⭐ O que muda quando você criar a `ANTHROPIC_API_KEY`

Nada de código. `supabase secrets set ANTHROPIC_API_KEY=...` e republicar.

A partir daí, os papéis `planejador` e `interprete` — que nascem no **B07** — passam a rodar em
`claude-opus-5`. Sem a chave eles caem no Gemini, e cada chamada emite um aviso `[llm]` no console e
grava `provedor = 'google'` no log. **A degradação é visível de propósito:** um planejador rodando em
Flash é uma cadeia mais fraca que a projetada, e isso não pode virar uma suspeita seis semanas
depois.

⚠️ **O adaptador da Anthropic nunca foi executado.** Ele está escrito, mas nenhuma linha dele já
rodou — não havia chave. Quando a primeira pergunta passar por ele, espere ajustes; em especial o
tratamento de recusa (`stop_reason: "refusal"`) e o `fallbacks: "default"` que deixei ligado, que
existem no papel e não na prática.

## Se der errado

| Sintoma | Rollback |
|---|---|
| Chat parou de responder depois do deploy | Republicar a versão anterior pelo painel (Edge Functions → `ai-plum-chat` → histórico). ⭐ É o rollback real deste bloco — o `git revert` sozinho não desfaz o deploy |
| Chat responde, mas `tokens_entrada` está nulo | Não é urgente para o usuário e é grave para a medição. Me avise com uma linha do `plum_logs`; é bug no adaptador |
| Erro `sem_api_key` no chat | A `GEMINI_API_KEY` sumiu do projeto. Nada a ver com a Anthropic |
| Aparece `[llm]` no console | Um papel foi para a Anthropic sem chave. Não deveria acontecer antes do B07 |
