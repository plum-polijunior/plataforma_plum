# Fase 1 — O chat ligado ao executor real, e uma casa só para as Edge Functions

## 1. Por que esta fase existiu

Depois da Fase 0/0b, o executor em Lambda existia, estava testado e tinha um consumidor real:
o dashboard (`dashboard-execute`). O chat (`PlumChat.tsx`, de bmchad) continuava exatamente
como antes de o executor existir — o passo entre o Agente A gerar o Query Plan e o Agente C
sintetizar a resposta era um vetor fingido, fixo no código:

```ts
const mockPythonVetor = { rows: [{ valor: "Simulado" }], msg: "Execução do Pandas pendente da API Python." };
```

Um levantamento à parte (`organizar_tudo.md`, escrito para mapear conflitos entre o trabalho
de três pessoas em paralelo — Allekka, bmchad, RicardoMoussalli) identificou esse ponto como
prioridade confirmada pelos três: terminar o chat de verdade vinha antes de construir a tela
do dashboard de cards, que já tinha motor mas nenhuma interface.

O mesmo levantamento identificou uma segunda pendência que bloqueava a primeira de ser feita
com qualidade: existiam duas convenções de Edge Function convivendo — uma antiga
(`supabase/edge-functions/`, arquivos soltos, sem teste, pensada para colar manualmente no
painel do Supabase) e uma nova (`supabase/functions/`, padrão do Supabase CLI, com teste),
usada só por `dashboard-execute`. Ligar o chat ao executor exigia reescrever `ai-plum-chat` de
qualquer forma — fazia sentido reescrevê-la já na convenção nova, em vez de continuar
alimentando a antiga.

## 2. O que foi construído

### 2.1 `ai-plum-chat` ganhou uma quarta ação: `execute_plan`

As três ações que já existiam (`guard`, `plan_query`, `synthesize_answer` — os Agentes Z, A e
C) continuam sendo um proxy para o Gemini, sem mudança de comportamento. A ação nova não fala
com o Gemini: ela é o mesmo tipo de ponte que `dashboard-execute` já fazia para o dashboard,
só que para uma pergunta ad-hoc do chat em vez de um card salvo.

Sequência dentro de `execute_plan` (`supabase/functions/ai-plum-chat/index.ts`):

1. Confere JWT, perfil ativo, cargo definido (mesma ordem de `dashboard-execute`).
2. Busca o dataset, confirma que pertence à organização do usuário.
3. Busca `allowed_columns` de `role_permissions` para o cargo e o dataset.
4. Autoriza o plano do Agente A com `authorizePlan` (`_shared/query_plan.ts`) — a mesma função
   que `dashboard-execute` usa. **Não existe uma segunda implementação da extração de
   colunas.** Se o plano usar uma coluna fora da permissão, a resposta é `forbidden`, nunca
   um filtro removido em silêncio.
5. Deriva `column_roles` (percent/date/number/text) a partir de `schema_metadata` com
   `columnRolesFromSchema` — movida de dentro de `dashboard-execute` para
   `_shared/query_plan.ts` nesta mesma fase, pelo mesmo motivo do item 4: o chat precisava
   exatamente do mesmo cálculo, e ter dois lugares calculando isso divergiria cedo ou tarde.
6. Monta o payload (`sheet_id`, `tab`, `plans: [{card_id: "chat", plan, resolved_columns}]`,
   `allowed_columns`, `column_roles`, `k_min`, `max_rows`, `issued_at`), assina com HMAC
   (`signPayload`) e com SigV4 (`aws4fetch`), e chama o mesmo Lambda Function URL que o
   dashboard chama.
7. Devolve `results[0]` para o front.

**Diferença deliberada em relação a `dashboard-execute`:** não há cache de snapshot nem
degradação para "resultado antigo com selo de idade". Uma pergunta de chat é ad-hoc — não
existe um resultado anterior dela para cair de volta. Falha do executor vira mensagem de erro
direto.

### 2.2 `PlumChat.tsx`

O mock foi removido. O fluxo agora é: `guard` → `plan_query` → `execute_plan` → (se
`status === "ok"`) `synthesize_answer`. Se `execute_plan` devolver `forbidden` ou `error`, o
chat mostra a mensagem correspondente direto, sem chamar o Agente C com dado inexistente.

O Agente C (`synthesize_answer`) ganhou uma instrução nova no prompt: se `suppressed_groups`
do resultado for maior que zero, explicar brevemente que parte dos grupos foi omitida por
k-anonimato — nunca ignorar o campo, e nunca tentar adivinhar o que foi suprimido. Antes desta
fase isso não importava, porque o resultado nunca vinha do executor de verdade.

### 2.3 Todas as Edge Functions numa casa só

`supabase/edge-functions/` (a convenção antiga) foi removida por completo, junto de
`scripts/gerar-edge-function.mjs` e `supabase/functions/_shared/arquivo-colavel.test.ts` — o
mecanismo de gerar um arquivo colável só fazia sentido enquanto o deploy fosse manual pelo
painel. Com deploy automático a caminho, ele virou complexidade sem função.

Layout resultante, todas em `supabase/functions/<nome>/index.ts`:

| Função | Origem | Observação |
|---|---|---|
| `ai-agents` | movida sem mudança de conteúdo | pipeline de importação |
| `ai-plum-chat` | reescrita (ver 2.1) | chat + execute_plan |
| `dashboard-execute` | já existia na convenção nova | passou a importar `columnRolesFromSchema` de `_shared/`, em vez de manter cópia local |
| `plum-chat` | movida sem mudança de conteúdo | demo da landing page (`DataPlaygroundSection.tsx`) — **não confundir com `ai-plum-chat`** |
| `send-auth-email` | movida sem mudança de conteúdo | e-mails transacionais, confirmado em uso real antes de mover |

`supabase/functions/README.md` (novo) documenta a convenção, os comandos de deploy e a lista
de segredos que cada função espera.

### 2.4 De passagem: o cache de dados do executor foi ligado

Decisão separada, tomada durante a mesma conversa que definiu a prioridade desta fase
(`TODOS.md` #1, que registrava a pendência de privacidade): `query_engine/sheets.py` passou a
usar `query_engine/cache.py` de verdade. `load_columns` agora cacheia por
planilha+aba+conjunto exato de colunas, TTL 15 min. Aceito conscientemente: a linha bruta do
cliente fica até 15 minutos na memória do processo do executor, em troca de menos leituras
repetidas no Google Sheets entre perguntas parecidas (chat e dashboard incluídos, já que os
dois passam pelo mesmo `load_columns`).

## 3. O que ainda não está pronto

- **Teste manual E2E contra uma planilha real** — a suíte automatizada (39 testes TS + 53
  Python) cobre a lógica pura; ninguém rodou uma pergunta de verdade contra o Lambda em
  produção ainda pelo caminho do chat.
- ~~Deploy automático~~ — **feito, ainda no mesmo dia**: a integração nativa GitHub↔Supabase
  foi conectada (branch `plataforma`, diretório `supabase`), não um GitHub Actions próprio.
  Cobre só Edge Functions — migrations continuam manuais, de propósito.
- **Novo risco introduzido por essa escolha, para registro:** ao contrário do Lambda
  (`.github/workflows/query-engine.yml`, que roda 76 testes e só publica se passar), a
  integração nativa do Supabase **publica direto, sem rodar `npm test` antes**. Um push que
  quebrasse `_shared/query_plan.ts` — a peça que aplica o RBAC de coluna, tanto para
  `ai-plum-chat` quanto para `dashboard-execute` — chegaria em produção mesmo que a suíte
  local estivesse vermelha, porque nada no caminho de deploy confere isso. Mitigação mínima
  enquanto isso não for revisitado: rodar `npm test` manualmente antes de dar push em
  `plataforma` tocando `supabase/functions/**`. Se isso incomodar, o caminho é trocar a
  integração nativa por um GitHub Actions próprio (a opção descartada nesta fase, ver decisão
  técnica da task abaixo) — não é preciso decidir agora, só registrar que a troca ficou aberta.
- **A matriz de permissões continua só em `Dashboard.tsx`** — não fazia parte do escopo desta
  fase (ver `organizar_tudo.md` §2.1 e §6, pergunta 3 — confirmado que é uma fase futura, não
  descartada).

# Resumo estruturado

## Nome da task: Chat ligado ao executor real (`execute_plan`)

1. **O que foi feito** — `ai-plum-chat` ganhou a ação `execute_plan`; `PlumChat.tsx` perdeu o
   mock e passou a repassar o resultado real para o Agente C.
2. **Decisão técnica** — reaproveitar `authorizePlan`/`columnRolesFromSchema` de
   `_shared/query_plan.ts` em vez de reimplementar a extração de colunas no contexto do chat.
   Alternativa descartada: escrever uma segunda função de extração dedicada ao chat — rejeitada
   porque duas implementações do mesmo cálculo de segurança divergem cedo ou tarde (mesmo
   raciocínio da decisão 8A da Fase 0).
3. **Integrações tocadas** — `supabase/functions/ai-plum-chat/index.ts` (novo comportamento),
   `src/pages/PlumChat.tsx`, `supabase/functions/_shared/query_plan.ts` (nova função exportada
   `columnRolesFromSchema`), o Lambda `plum-query-engine` (novo consumidor).
4. **Safeguard** — N/A (não é correção de bug, é funcionalidade nova).
5. **Como validar** — pelo chat (`/plum`), fazer uma pergunta sobre uma base conectada; conferir
   que a resposta reflete dado real da planilha, não mais "Simulado". Testar também uma
   pergunta usando uma coluna fora da permissão do cargo — deve responder que não tem acesso,
   não silenciosamente ignorar a coluna.
6. **Lacunas e pendências** — [LACUNA: nenhum teste manual E2E rodou contra o Lambda em
   produção pelo caminho do chat ainda — quem for fazer o primeiro teste real, documentar o
   resultado aqui ou em novo arquivo de fase — D.O.D.: uma pergunta real, com dado real,
   respondida corretamente end-to-end].

## Nome da task: Migração das Edge Functions para `supabase/functions/`

1. **O que foi feito** — as cinco Edge Functions (`ai-agents`, `ai-plum-chat`,
   `dashboard-execute`, `plum-chat`, `send-auth-email`) passaram a viver todas em
   `supabase/functions/<nome>/index.ts`. A convenção antiga (`supabase/edge-functions/`) e o
   mecanismo de gerar arquivo colável (`scripts/gerar-edge-function.mjs`,
   `arquivo-colavel.test.ts`) foram removidos.
2. **Decisão técnica** — migrar tudo de uma vez, não só a função em uso nesta fase
   (`ai-plum-chat`), porque manter duas convenções vivas por mais tempo só adiava o mesmo
   trabalho. Alternativa descartada: manter o mecanismo de arquivo colável como caminho
   alternativo de deploy — rejeitada porque o deploy automático (a caminho) o torna
   redundante, e código redundante tende a ficar desatualizado sem ninguém perceber.
3. **Integrações tocadas** — `package.json` (removido o script `gen:edge`), `.gitattributes`
   (removido, só existia para o arquivo gerado), `CLAUDE.md` (mapa do repositório e seção de
   arquitetura de IA atualizados).
4. **Safeguard** — N/A.
5. **Como validar** — `npm test` (39 testes) e `npm run build` passam;
   `supabase functions deploy <nome> --project-ref rjwidarrsykufuifzunu` funciona para
   qualquer uma das cinco pastas. Deploy automático: dar push em `plataforma` tocando
   `supabase/functions/**` e conferir no painel (Integrations → GitHub) que rodou sozinho.
6. **Lacunas e pendências** — [LACUNA: `ai-agents`, `plum-chat` e `send-auth-email` não têm
   teste automatizado — quem for mexer nelas de novo decide se vale escrever, não é obrigatório
   ainda (decisão registrada em `organizar_tudo.md` §6, pergunta 5) — D.O.D.: decisão consciente
   documentada se continuar sem teste, ou suíte mínima se decidirem escrever]. ~~[LACUNA: deploy
   automático...]~~ **resolvida no mesmo dia**: integração nativa GitHub↔Supabase conectada
   (branch `plataforma`, diretório `supabase`), toggle de Edge Functions ligado. Nenhum GitHub
   Actions próprio foi escrito para isso — ao contrário do Lambda, que usa
   `.github/workflows/query-engine.yml` e roda teste antes de publicar, esta integração nativa
   **não roda `npm test` antes de deployar**. Ver §3 (nota nova) para o risco que isso implica.

## Nome da task: Cache de dados do executor ligado

1. **O que foi feito** — `query_engine/sheets.py` (`load_columns`) passou a usar
   `query_engine/cache.py` (TTLCache, 15 min), chave por planilha+aba+conjunto de colunas.
2. **Decisão técnica** — decisão de privacidade explicitamente pendente desde a Fase 0
   (`TODOS.md` #1) foi tomada nesta conversa: ligar, aceitando que a linha bruta do cliente
   fica até 15 min na memória do processo. Alternativa descartada: granularidade por coluna
   individual (como o `TODOS.md` original sugeria) — mantida a granularidade por conjunto
   exato de colunas, que já era a implementação existente de `cache.py`; refinar para
   por-coluna fica como otimização futura, não bloqueando a decisão de ligar agora.
3. **Integrações tocadas** — `query_engine/sheets.py`, `TODOS.md` #1 (decisão registrada).
4. **Safeguard** — N/A.
5. **Como validar** — `python -m pytest query_engine` (53 testes) passa; em produção, duas
   chamadas ao Lambda pedindo exatamente as mesmas colunas da mesma planilha dentro de 15 min
   geram só um `batchGet` real ao Google Sheets (visível no log: "cache miss" aparece só na
   primeira).
6. **Lacunas e pendências** — N/A.
