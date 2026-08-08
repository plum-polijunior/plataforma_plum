# Fase 2 — `formattingRules` estruturado, parsing defensivo do Gemini, e o fio que faltava entre a Edge Function e o Lambda

## 1. Por que esta fase existiu

`query_engine/urgent.md` documentava que `apply_formatting_rules` decidia como limpar/tipar
dado bruto da planilha por keyword-match em texto livre gerado pelo Agente 3/3.1 — qualquer
regra fora do vocabulário hardcoded passava sem transformação, em silêncio. Investigando isso,
apareceu um fato que o próprio `urgent.md` não registrava: `apply_formatting_rules` e
`execute_plan_with_formatting` eram **código morto em produção** — `main.py` chamava
`execute_plan` direto, e o payload assinado que `dashboard-execute`/`ai-plum-chat` mandavam
carregava só `column_roles` (calculado por regex), nunca a regra de formatação em si. Corrigir
só o formato da regra não bastava: era preciso religar o fio até o Lambda.

Depois dessa correção, o primeiro teste real do chat (`execute_plan`) revelou uma segunda
camada de fio faltando, agora em infraestrutura AWS: a chamada assinada da Edge Function para
o Lambda nunca tinha sido exercitada de ponta a ponta antes (todo teste anterior falhava mais
cedo, na busca do dataset — `TODOS.md` #8). Ao chegar nessa chamada de verdade, ela recebia
403 direto da AWS, antes do Lambda rodar.

## 2. O que foi construído

### 2.1 `formattingRules` — de texto livre para instrução estruturada

Novo formato em `schema_metadata.columns[col].formatting_rule`:
`{"type": <enum fechado>, "params": {...}, "explicacao": "<texto para humano>"}`. Enum:
`moeda_brl` · `numero_decimal` · `numero_inteiro` · `percentual` · `data` ·
`texto_trim_maiusculas` · `texto_trim_minusculas` · `documento_cpf_cnpj` ·
`booleano_sim_nao` · `nenhuma`.

- `query_engine/pandas_executor.py`: dispatcher `_FORMATTERS` (uma função por `type`) e
  `TYPE_TO_ROLE` (lookup direto, substitui o regex antigo de `roles_from_formatting_rules`).
  `type` desconhecido ou `"nenhuma"` não transforma a coluna, mas **loga warning** — fecha o
  problema central do `urgent.md` (falha de tipagem invisível).
- `security.py`/`main.py`: `ExecutionPayload` passou a carregar `formatting_rules` (não mais
  `column_roles`, que a Edge Function calculava); `main.py` aplica `apply_formatting_rules`
  logo depois de `sheets.load_columns` e deriva `column_roles` internamente antes de
  `execute_plan`. **Esta é a mudança que religou o fio morto.**
- `_shared/query_plan.ts`: `columnRolesFromSchema` (regex sobre `cleaning_rule`) foi
  substituída por `formattingRulesFromSchema` (leitura direta de `formatting_rule.type`) —
  `dashboard-execute` e `ai-plum-chat` atualizados. Papel de coluna (percent/date/number/text)
  passou a ser responsabilidade única do Python; o TypeScript só extrai `{type, params}`.
- `ai-agents/index.ts`: prompts do Agente 3 (`format_data`) e 3.1 (`refine_format`)
  reescritos pedindo o enum fechado; `sanitizeFormattingRules` como segunda barreira contra o
  Gemini inventar um `type` fora da lista.
- `DatabasePipeline.tsx`/`Cfgdatabase.tsx`: migrados de `cleaning_rule` (string) para
  `formatting_rule` (objeto), exibindo `explicacao` ao humano revisor.
- **Sem migração de dados antigos** — decisão consciente do usuário (bmchad): a plataforma
  ainda é protótipo, dataset não reprocessado cai no fallback seguro `{type: "nenhuma"}`.

### 2.2 Parsing defensivo do Gemini

Um teste real do Agente 1 (`predict_semantics`) revelou `semanticDefinitions` salvo como
**string** (`"{\n \"of\": ...}"`) em vez de objeto — as caixas de texto por coluna não tinham
o que iterar. Causa: o mesmo defeito já corrigido para o Agente Z do chat
(`extractJsonObject`, commit `f6b7464`) nunca foi levado para `ai-agents/index.ts`; o
`JSON.parse` falhava em silêncio e devolvia a string bruta, que o front salvava sem checar o
tipo.

- `_shared/gemini_parsing.ts` (novo): `stripMarkdownFences` / `extractJsonObject` /
  `parseGeminiJson`, um interpretador só, usado por `ai-plum-chat` (que antes tinha a cópia
  local) e agora também por `ai-agents`.
- `ai-agents/index.ts`: falha de parse agora lança erro explícito (400), nunca degrada em
  silêncio para texto bruto.
- `DatabasePipeline.tsx`: `handleAnalyzeSemantics` e `handleFormatData` ganharam o mesmo
  fallback de parse que `handleRefineFormat` já tinha, por defesa em profundidade.

### 2.3 O fio que faltava entre a Edge Function e o Lambda (AWS)

Primeiro teste real de `execute_plan` (chat) chegando até a chamada ao executor: 403 direto da
AWS (`aws4fetch` → Function URL), antes do Lambda rodar (confirmado pelo CloudWatch do Lambda
sem nenhum log da tentativa). Diagnóstico, por eliminação, testando com credenciais reais e o
IAM Policy Simulator da própria AWS:

- Não era a credencial (`PLUM_AWS_ACCESS_KEY_ID`/`SECRET` rotacionados, mesmo erro).
- Não era o `aws4fetch` (a mesma chamada, com credencial root, funcionava).
- Era a **policy do usuário `plum-edge-invoker`**, faltando duas coisas nunca provisionadas:
  a ação `lambda:InvokeFunction` (só tinha `InvokeFunctionUrl` — o IAM Policy Simulator
  confirmava "allowed" com só essa ação, mas a chamada real continuava negada) **e** uma
  resource-based policy no próprio Lambda (`aws lambda add-permission`).

Corrigido em produção (`put-user-policy` + `add-permission`) e nos scripts, para deploys
futuros não caírem no mesmo buraco: `infra/aws/provision.sh` (policy de identidade com as duas
ações) e `infra/aws/valores-supabase.sh` (novo passo idempotente de `add-permission`).
Documentado em `TODOS.md` #8 e `CLAUDE.md` §8.

## 3. O que ainda não está pronto — próxima fase

Com o fio da AWS corrigido, a pergunta real do chat **chegou no Agente C pela primeira vez**
— mas o Pandas não conseguiu executar o plano, e a chamada acabou falhando com:

```json
{"code": "WORKER_RESOURCE_LIMIT", "message": "Function failed due to not having enough compute resources (please check logs)"}
```

Não investigado ainda nesta fase — fica como abertura da próxima:

- **De onde vem exatamente o `WORKER_RESOURCE_LIMIT`?** O código é terminologia do runtime de
  Edge Function (Deno/Supabase), não do Lambda — mas não está confirmado se o limite foi
  batido dentro da Edge Function (`ai-plum-chat`, processando uma resposta grande do
  executor?) ou se é como o Supabase relata um limite batido dentro do próprio Lambda. Próximo
  passo: olhar o log completo da invocação (Edge Function **e** CloudWatch do Lambda) para o
  mesmo `request_id`/horário, e ver em qual camada o processo morreu.
- **Por que o Pandas "não conseguiu executar"?** Sem saber ainda se foi `MissingColumnError`,
  `RawRowsBlocked`, uma base grande demais para `max_rows`, ou uma exceção não tratada dentro
  de `execute_plan`/`apply_formatting_rules` — a mensagem do usuário foi só "o pandas não
  conseguiu executar", sem o erro específico. Primeiro passo da próxima sessão: reproduzir de
  novo com o log do Lambda aberto e capturar o erro exato.
- **Melhorar o Pandas** (pedido explícito para a próxima fase): depois de identificar a causa
  acima, considerar — limites de memória/tempo do Lambda (hoje 1024 MB / 30s, ver
  `.github/workflows/query-engine.yml`) podem precisar subir se a base real for maior do que os
  testes cobrem; vale también revisar se `execute_plan` tem algum caminho sem proteção de
  timeout/memória para planos caros (ex.: `group_by` numa base grande antes do `head(limit)`).
- **Nenhum teste E2E real ainda terminou com sucesso** — mesmo com o fio da AWS corrigido, a
  primeira tentativa completa (dataset → RBAC → AWS → Lambda → Pandas → Agente C) ainda não
  fechou o ciclo. `TODOS.md` #8 continua aberto até uma pergunta real ser respondida
  corretamente de ponta a ponta.

# Resumo estruturado

## Nome da task: `formattingRules` estruturado (Agente 3/3.1 → Pandas)

1. **O que foi feito** — troca de regra de formatação em texto livre por `{type, params,
   explicacao}` de um enum fechado; dispatcher `_FORMATTERS`/`TYPE_TO_ROLE` no lugar do
   keyword-match; `main.py` passou a de fato aplicar a formatação antes de `execute_plan`
   (antes, código morto).
2. **Decisão técnica** — sem migração automática de datasets antigos (decisão do usuário,
   protótipo); fallback seguro `{type: "nenhuma"}` para quem não for reprocessado. Papel de
   coluna decidido só em Python (`TYPE_TO_ROLE`), TypeScript só extrai `{type, params}` — evita
   duas heurísticas divergindo.
3. **Integrações tocadas** — `query_engine/pandas_executor.py`, `security.py`, `main.py`,
   `_shared/query_plan.ts`, `dashboard-execute/index.ts`, `ai-plum-chat/index.ts`,
   `ai-agents/index.ts`, `DatabasePipeline.tsx`, `Cfgdatabase.tsx`.
4. **Safeguard** — `apply_formatting_rules` loga warning em `type` desconhecido/`"nenhuma"`;
   `sanitizeFormattingRules` (Edge Function) força `type` inválido do Gemini para `"nenhuma"`.
5. **Como validar** — `npm run build`, `npm run lint`, `npm test` (39), `npm run test:py` (69,
   incluindo `test_formatting.py` novo) — todos passando.
6. **Lacunas e pendências** — [LACUNA: nenhum dataset real foi reprocessado pelo Agente 3.1 no
   novo formato ainda — quem for testar o pipeline de importação de ponta a ponta com uma base
   real decide se reprocessa uma existente ou cria uma nova].

## Nome da task: Parsing defensivo do Gemini (`ai-agents`)

1. **O que foi feito** — `_shared/gemini_parsing.ts` centraliza `extractJsonObject`/
   `parseGeminiJson`; `ai-agents/index.ts` passou a usá-lo e a lançar erro explícito em vez de
   degradar para texto bruto; `DatabasePipeline.tsx` ganhou fallback de parse em mais dois
   pontos.
2. **Decisão técnica** — reaproveitar a função que já existia em `ai-plum-chat` em vez de
   duplicar a lógica pela segunda vez no repositório.
3. **Integrações tocadas** — `supabase/functions/_shared/gemini_parsing.ts` (novo),
   `ai-plum-chat/index.ts`, `ai-agents/index.ts`, `DatabasePipeline.tsx`.
4. **Safeguard** — erro de parse agora é visível (400 na Edge Function) em vez de silencioso.
5. **Como validar** — `npm run build`/`lint`/`test` passando; manualmente, rodar o Agente 1
   várias vezes e confirmar que `semanticDefinitions` sempre chega como objeto no front.
6. **Lacunas e pendências** — N/A.

## Nome da task: Permissão AWS que faltava para a Function URL do Lambda

1. **O que foi feito** — `plum-edge-invoker` ganhou `lambda:InvokeFunction` (além de
   `InvokeFunctionUrl`) e uma resource-based policy no Lambda (`add-permission`), em produção e
   nos scripts (`provision.sh`, `valores-supabase.sh`).
2. **Decisão técnica** — diagnosticado por eliminação empírica (credencial, biblioteca de
   assinatura, e por fim a policy) em vez de assumir a causa mais óbvia (credencial errada);
   confirmado com o IAM Policy Simulator da própria AWS, que por si só não capturava o
   problema — só o teste real revelou.
3. **Integrações tocadas** — IAM (`plum-edge-invoker`, resource policy do Lambda),
   `infra/aws/provision.sh`, `infra/aws/valores-supabase.sh`, `TODOS.md` #8, `CLAUDE.md` §8.
4. **Safeguard** — N/A (infraestrutura, não código de aplicação).
5. **Como validar** — reproduzido com uma chave de teste + `aws4fetch` real: passou de
   `403 Forbidden` (AWS) para `401 assinatura invalida` (nosso próprio `security.py`),
   confirmando que a chamada chega ao Lambda.
6. **Lacunas e pendências** — [LACUNA: ciclo completo ainda não fechou — ver §3 acima,
   `WORKER_RESOURCE_LIMIT` no Pandas — D.O.D.: uma pergunta real do chat respondida
   corretamente de ponta a ponta, sem nenhum erro em nenhuma camada].
