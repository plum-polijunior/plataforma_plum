# Fase 3 — Chat real fecha o ciclo de ponta a ponta, e k-anonimato sai do produto

## 1. Por que esta fase existiu

A Fase 2 (`2026-08-08-fase-2-formatacao-estruturada-e-fio-do-executor.md`) tinha deixado dois
pontos abertos: `execute_plan` ainda não tinha completado um ciclo real de ponta a ponta sem
erro em nenhuma camada (`TODOS.md` #8), e um `WORKER_RESOURCE_LIMIT` não investigado. Esta
fase começou com um teste real do chat — "quantas peças não conformes em 10/02/2026?" — que
respondeu "não foram encontrados registros", sem nenhum erro visível em nenhuma camada. Isso
forçou a pergunta: é bug de código, ou o dado simplesmente não existe pra esse filtro?

## 2. O que foi construído

### 2.1 Investigação da data "não encontrada" — não era bug de conversão

Histórico documentado em `test_data/test_errors/investigacao-data-nao-encontrada.md`. Resumo:

1. Descartada supressão por k-anonimato de saída (`suppressed_groups: 0` no log de
   `execute_plan` — o filtro genuinamente não bateu com nenhuma linha).
2. Log de debug temporário em `pandas_executor.py::apply_formatting_rules` (bruto vs.
   formatado, primeiro 3 linhas, depois a coluna inteira — a amostra de 3 não
   necessariamente incluía a linha do filtro) confirmou algo específico: a coluna de data
   tem tipos mistos por linha (serial do Sheets em algumas linhas, texto `DD/MM/YYYY` em
   outras) — já resolvido antes desta fase pelo fix `6f8686d` (conversão por linha, não por
   maioria da coluna).
3. Com a coluna inteira logada (`test_error_3.txt`), **nenhuma linha** convertia para
   `2026-02-10` — nem como serial, nem como texto. A primeira linha de dado (que o usuário
   confirmou ser a linha em questão, com `pecas_nao_conformes = 1`) tinha o serial `46297`,
   que converte matematicamente para **2 de outubro de 2026** — exatamente o resultado de ler
   `"10/02/2026"` como mês/dia (MM/DD) em vez de dia/mês (DD/MM).
4. **Conclusão: não é bug de código.** O dado já chegou com mês e dia invertidos na planilha
   (entrada manual ou importação de fonte MM/DD) — o `pandas_executor.py` converte o serial
   corretamente para a data que ele de fato representa. Detalhe completo em
   `investigacao-data-nao-encontrada.md`.

Ação tomada: removido o log de debug temporário de bruto/formatado (não é mais necessário,
causa já confirmada). Como proteção contra o próximo caso parecido (usuário pergunta uma data
sem ano, ex. "2 de outubro"), o prompt do Agente A (`plan_query`, em `ai-plum-chat/index.ts`)
ganhou uma linha com a data corrente calculada em runtime (`new Date().toISOString()`),
instruindo a assumir o ano atual quando o usuário não especificar um.

### 2.2 k-anonimato: de "bypass do Admin" para remoção completa

Ponto de partida: o Admin da organização já tinha bypass de RBAC de coluna (todas liberadas,
via `DatabasePipeline.tsx` + migration de backfill), mas **não** tinha bypass equivalente de
k-anonimato — sofria a mesma supressão de grupo pequeno que qualquer cargo.

Primeira tentativa (`plano-k-anonimato-por-cargo.md`, Fase 1 do plano): dar ao Admin
`k_min=1` em vez do `k_min` da organização, nos dois consumidores do executor
(`dashboard-execute`, `ai-plum-chat`). Implementado, testado, e no processo apareceu um efeito
colateral real: o cache de snapshot do dashboard (`permissions_fingerprint`) não considerava
`k_min`, então um cargo não-Admin com o mesmo conjunto de colunas do Admin podia reaproveitar,
do cache, um resultado calculado sem supressão — corrigido com um discriminador
`kMinBypass` na função de fingerprint.

Decisão final do usuário: em vez de só resolver o caso do Admin, **remover k-anonimato do
produto inteiro**. Raciocínio (documentado em `k-anonimato-removido.md` na raiz do repo):
k-anonimato só protege alguma coisa quando o eixo de agrupamento é uma pessoa; na maioria das
planilhas reais do Plum o agrupamento é por data/evento/categoria, não por pessoa — nesse
caso a regra não comprava privacidade real, só produzia falsos negativos ("não encontrado")
com frequência alta em bases pequenas/médias, que são a maioria dos clientes atuais.

Consequência: o trabalho da Fase 1 do plano (bypass só do Admin, incluindo o fix do
fingerprint) foi revertido antes de ser commitado, e substituído pela remoção completa.
`RawRowsBlocked` (nenhuma linha bruta sai, sempre) deixou de depender de `k_min` e passou a
ser incondicional — essa proteção nunca foi o que estava sendo removido.

### 2.3 Chat confirmado funcionando de ponta a ponta

Os logs de Lambda capturados durante a investigação (`test_error_2.txt`, `test_error_3.txt`)
já mostravam `POST /execute 200` — nenhum 403 em nenhuma camada, nas duas invocações reais.
Ao final da sessão o usuário confirmou o chat funcionando na prática. Isso fecha o `TODOS.md`
#8 (403 "base nao encontrada" / permissão AWS da Function URL, aberto desde a Fase 2) e a
pendência equivalente registrada em `CLAUDE.md` §8 — ambos marcados resolvidos.

## 3. O que ainda não está pronto — próxima fase

- **`WORKER_RESOURCE_LIMIT`** (aberto pela Fase 2) não foi revisitado nesta fase — não
  reproduziu durante os testes de hoje, mas não há confirmação de que a causa raiz foi
  corrigida ou só não foi exercitada. [LACUNA: confirmar se o limite de memória/tempo do
  Lambda (1024 MB / 30s) é suficiente pra base real de produção, não só pro dataset de teste
  — quem for rodar o primeiro cliente real de porte médio decide.]
- **Nenhum teste E2E automatizado** cobre o fluxo completo (pergunta → Agente Z → Agente A →
  executor real → Agente C). A confirmação desta fase foi manual, via logs e o usuário
  testando o chat. `TODOS.md` #3 (testes E2E dos 6 fluxos mapeados) continua aberto.
- **A causa raiz do dado invertido (DD/MM ↔ MM/DD) na planilha de teste não foi corrigida na
  planilha** — não é ação do Plum (R-01, read-only), mas o dataset de teste usado nesta
  investigação continua com pelo menos uma linha "errada" até alguém corrigir manualmente na
  fonte.
- **Nenhuma detecção de locale da planilha foi implementada** — a hipótese de "planilha
  importada de fonte MM/DD" nunca foi 100% confirmada (não checamos
  `spreadsheets.get(fields="properties.locale")` da planilha real). Ficou como hipótese mais
  provável, não fato confirmado.

# Resumo estruturado

## Nome da task: Investigação e fechamento do bug "data não encontrada"

1. **O que foi feito** — confirmado, via log da coluna de data inteira, que o filtro
   `2026-02-10` não bate com nenhuma linha porque o dado já chegou com mês/dia invertidos na
   planilha (serial `46297` = 2 de outubro, não 10 de fevereiro). Não é bug de código. Debug
   temporário removido; Agente A ganhou a data corrente no prompt para não hallucinar o ano em
   datas sem ano explícito.
2. **Decisão técnica** — a conversão de data por linha (serial vs. texto, fix anterior à esta
   fase) está correta e não foi tocada; a única mudança de código foi adicionar contexto de
   data ao prompt do Agente A, não ao executor Python (o problema não estava lá).
3. **Integrações tocadas** — `query_engine/pandas_executor.py` (remoção do log de debug),
   `supabase/functions/ai-plum-chat/index.ts` (data corrente no prompt do Agente A).
4. **Safeguard** — N/A (não era bug de código; a "correção" é o prompt do Agente A não
   inferir ano errado em perguntas futuras sem ano explícito).
5. **Como validar** — repetir a pergunta com uma data sem ano (ex. "quanto foi vendido em 2 de
   outubro?") e confirmar que o Agente A assume o ano corrente no Query Plan gerado.
6. **Lacunas e pendências** — [LACUNA: confirmar o locale da planilha real
   (`spreadsheets.get`) pra saber se a inversão DD/MM veio de digitação ou importação — sem
   isso não dá pra orientar o cliente sobre como evitar recorrência — quem for revisitar o
   caso decide].

## Nome da task: Remoção do k-anonimato

1. **O que foi feito** — removida a supressão por tamanho de grupo (k-anonimato) do
   `pandas_executor.py` e de todo o caminho que alimentava `k_min` (Edge Functions, payload,
   config, testes). `RawRowsBlocked` (bloqueio de linha bruta) passou a ser incondicional.
2. **Decisão técnica** — decisão de produto do usuário, não achado técnico: k-anonimato só
   protege quando o agrupamento é por pessoa; na maioria das planilhas reais do Plum o
   agrupamento é por data/categoria, então a regra gerava mais falso-negativo do que
   privacidade real. Raciocínio completo em `k-anonimato-removido.md`. Um caminho
   intermediário (bypass só do Admin, com `k_min=1`) foi implementado e depois revertido em
   favor da remoção completa — documentado como obsoleto em `plano-k-anonimato-por-cargo.md`.
3. **Integrações tocadas** — `query_engine/pandas_executor.py`, `main.py`, `config.py`,
   `security.py`, `supabase/functions/dashboard-execute/index.ts`,
   `supabase/functions/ai-plum-chat/index.ts` (prompt do Agente C também simplificado, não
   menciona mais `suppressed_groups`), `.github/workflows/query-engine.yml`, `CLAUDE.md`,
   `TODOS.md`, `query_engine/prd.md`, `infra/aws/PASSO-A-PASSO.md`,
   `infra/aws/smoke-test.sh`.
4. **Safeguard** — testes que antes provavam supressão (`test_privacidade.py`) foram
   substituídos por testes que provam que grupos pequenos **não** são mais suprimidos —
   qualquer reintrodução acidental do mecanismo quebra a suíte.
5. **Como validar** — `npm test` (39), `npm run test:py` (67), `npm run build` — todos
   passando. Manualmente: perguntar algo que isolaria um grupo pequeno (ex. um dia com poucos
   registros) e confirmar que a resposta vem com o número real, não "não encontrado".
6. **Lacunas e pendências** — [LACUNA: se algum cliente futuro tiver uma base onde o
   agrupamento natural é por pessoa (RH, saúde, folha de pagamento), a proteção removida aqui
   pode precisar voltar — nem que seja configurável só pra esse caso, não como regra global.
   Ver `k-anonimato-removido.md` §"Quando essa decisão merece ser revisitada". Sem D.O.D. —
   condicional a esse tipo de cliente aparecer.] A coluna `organizations.dashboard_k_min`
   continua no banco, vestigial, sem migration de remoção (decisão consciente: não é
   destrutivo deixá-la).

## Nome da task: Chat real confirmado de ponta a ponta — fecha `TODOS.md` #8

1. **O que foi feito** — confirmado que `execute_plan` completa sem 403 em nenhuma camada
   (Supabase → HMAC/SigV4 → Lambda → Pandas → resposta), em múltiplas invocações reais durante
   esta fase, e o usuário confirmou o chat funcionando na prática ao final da sessão.
2. **Decisão técnica** — N/A (confirmação, não mudança de código).
3. **Integrações tocadas** — N/A diretamente; `TODOS.md` #8 e `CLAUDE.md` §8 atualizados de
   "aberto" para "resolvido".
4. **Safeguard** — N/A.
5. **Como validar** — repetir uma pergunta real no chat em produção e confirmar resposta
   correta sem erro em nenhuma camada (Edge Function, AWS, Lambda).
6. **Lacunas e pendências** — [LACUNA: nenhum teste E2E automatizado cobre este fluxo —
   `TODOS.md` #3 continua aberto, cobre esta lacuna com mais detalhe].
