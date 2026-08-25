---
status: vigente
camada: plataforma
atualizado_em: 2026-08-25
---

# Pendências da plataforma

> **O que este arquivo é:** o que falta, ordenado por **dificuldade**. Consolida cinco arquivos que
> viviam espalhados (`TODOS.md`, `organizar_tudo.md`, `pendencias_e_dividas_tecnicas.md`,
> `query_engine/urgent.md`, `urgent_multiplas_planilhas_simultâneas.md`), todos apagados em
> 2026-08-14 depois de o conteúdo ser extraído para cá e para `30-decisoes.md`.
> **O que este arquivo NÃO é:** o roadmap do remake (é `12-visao-tecnologica.md` §10), nem o porquê
> de cada adiamento (é `30-decisoes.md`).

**Níveis:** 🟢 trivial (< 1 dia) · 🔵 claro (1–5 dias, sabe-se como) · 🟠 projeto (1–3 semanas) ·
🔴 **precisa de decisão antes** (não é esforço, é escolha).

---

## 🟢 Trivial

| # | O quê | Nota |
|---|---|---|
| T1 | ⚠️ **Aplicar a migration `20260812140000_plum_chat_plan_query.sql`** no SQL Editor | Sem ela o insert do chat falha — `dataset_id` e `plan_query` não existem. Par indivisível com a Edge Function |
| T2 | ~~Republicar `ai-plum-chat`~~ — ✅ **feito em 2026-08-20**, no deploy da Etapa 0 do remake (versão 59) |
| T3 | ~~Corrigir o passo-a-passo de migration~~ — **resolvido por remoção**: o arquivo foi apagado e o procedimento ficou em `supabase/migrations/CLAUDE.md` |
| T4 | `query_engine/.pytest_cache/` no `.gitignore` | Arquivo gerado versionado |
| T5 | ~~Marcar o PRD do query engine como superado no ponto do cache~~ — **resolvido por remoção** (arquivo apagado em 2026-08-14) |
| T6 | Dividir `12-visao-tecnologica.md` (429 linhas) em `12a-arquiteto` / `12b-contrato` / `12c-dados` | Estourou o teto de 400 da regra 4 do `contexto/CLAUDE.md`. `30-decisoes` e `31-incidentes` têm exceção declarada; este não |
| T7 | ⚠️ **Apagar a Edge Function órfã `plum-chat`** | ⭐ Ver a linha nova em "Dívidas conhecidas". `ACTIVE`, sem código no repositório, `verify_jwt: false`. O comando é `DELETE /v1/projects/{ref}/functions/plum-chat` |

## 🔵 Claro — sabe-se o que fazer

| # | O quê | Por que importa |
|---|---|---|
| ~~C1~~ | ~~⭐ **Log estruturado no Supabase**~~ | ✅ **Resolvido na Etapa 0 do remake** (2026-08-18): `plum_logs` grava as 4 etapas do chat com token, latência e saída do agente |
| C2 | ⭐ **Abstração de provedor de LLM** | Hoje a URL do Gemini está em **4 lugares** em 3 funções. Com 4 call sites é meio dia; com 20 é refatoração. ⚠️ É o B05 da Etapa 1 — e só o `ai-plum-chat` vai adotar, porque `dashboard-agent` e `ai-agents` estão fora do escopo do remake |
| C3 | Renomear a rota `/dashboard` (que é "Minha Organização") | Já custou tempo de leitura mais de uma vez. Vários lugares mudam juntos |
| C4 | Passo de verificação no fim do onboarding — ler a planilha de verdade | Pega aba errada, base não compartilhada, cabeçalho divergente e coluna sem título **de uma vez**, com a pessoa olhando a tela (I-08) |
| C4b | ⚠️ **O smoke test do Lambda roda DEPOIS do `update-function-code`** | `query-engine.yml`: a imagem quebrada substitui a boa e o teste só avisa depois — não há janela em que o deploy seja verificado antes de valer. Derrubou o executor em 2026-08-21 (I-09). O conserto é publicar versão → invocar → promover alias, que é mudança de infra |
| C5 | Testes E2E (Playwright) dos 6 fluxos que cruzam camadas | Revogação de coluna surtindo efeito e POST direto no executor retornando 401 só se provam ponta a ponta |
| C6 | Eval do Agente A contra perguntas reais | Transforma "o chat parece que piorou" num número. É o único jeito de mexer no prompt com confiança |
| C7 | Escala do percentual: 0–1 nativo vs 0–100 em texto | Aberto desde 2026-08-11. A mesma coluna sai em duas escalas conforme a origem da célula |
| C8 | Fechar a policy `ALL / true` da tabela `Leads` | Dívida D-13 aceita conscientemente. **Fechar antes do primeiro usuário de cliente real** |
| C9 | Adoção de membros órfãos (conta criada antes da verificação de domínio) | Perfis com `organization_id` NULL não casam em nenhuma policy de SELECT — o admin não consegue nem contá-los |
| C10 | ⚠️ **`min`/`max` sobre coluna de texto agrupada devolvem `0`** | `_coerce_numeric_for_agg` converte a coluna antes de agregar, então "primeiro cliente por região" sai `0` em vez do nome. Não é proteção, é resposta errada em silêncio. ⚠️ **Não consertar antes do orçamento do B10**: destravar a coerção passa a devolver o literal de verdade, e hoje não há o que cobre isso |
| C11 | ⚠️ **Dois cabeçalhos que normalizam igual: uma coluna some na IMPORTAÇÃO** | ⭐ Investigado em 2026-08-20, e é mais estreito do que parecia. O **executor já recusa**, deliberadamente e com mensagem boa (`sheets.py`: *"não dá para saber qual usar… renomeie uma delas"*). O furo silencioso é só no `DatabasePipeline.tsx`, que monta `obj[normMap[h]] = row[i]` — a segunda coluna some do `schema_metadata`, e por tabela do `allowed_columns`. ⚠️ **Consertar só o `sheets.py` piora**: geraria uma coluna carregável e não autorizável, falhando com "coluna fora da permissão do cargo", que aponta para o lugar errado. O conserto nasce no **Agente 3** (onboarding), que já vê a amostra e nomeia conceitos — ele propõe dois nomes distintos e a pessoa confirma uma vez por base; casa com o C4. ⛔ Sufixo por ordem de coluna (`_2`) foi **recusado**: reordenar a planilha trocaria o sufixo de dono e o `allowed_columns` apontaria para a coluna errada — mesma classe de falha que o `google_sheet_gid` evita |
| C12 | ⚠️ **`allowed_columns` nunca é revalidado contra o cabeçalho da planilha** | Achado em 2026-08-20 pelo caminho `ad_hoc`. A matriz de permissões é curada à mão e **não** é refeita ao recadastrar a base — então ela envelhece em silêncio até alguém pedir a coluna que sumiu. Uma pergunta normal pede 2–3 colunas e não percebe; o pedido `metadados` pede **todas** e percebia derrubando tudo (consertado). ⭐ O `metadados` é justamente a peça que tornaria a verificação barata: desde o conserto ele devolve `{"existe": false}` por coluna, ou seja, **já sabe dizer quais colunas permitidas sumiram da planilha**. Casa com o C4 |
| C13 | ⛔ **Não há como reconferir uma base ativa: recadastrar cria uuid novo e órfã os cards** | Achado em 2026-08-21 ao planejar a Etapa 2. O onboarding só recupera rascunho com `status = 'processing'` (`DatabasePipeline.tsx:85-89`); base **ativa** cai no `insert` e vira linha nova. ⚠️ E **deletar** a antiga é pior: `dashboard_cards` e `role_permissions` têm `ON DELETE CASCADE` (`20260806230000_dashboard_cards.sql:33`, `create_role_permissions_table.sql:13`), então some junto **todo card daquela base e a matriz de permissões curada à mão** — sem aviso. `plum_chat` e `plum_logs` são `SET NULL` e ficam órfãos, o que faz a referência do caminho legado (R$ 224.042,24 de 2026-08-20) perder o vínculo. ⭐ O conserto é uma entrada "reconferir esta base" que preserve o `id` e rode só o perfil + auditor. Ficou **fora do escopo da Etapa 2 por decisão** (👤 optou por recadastrar só a `plum_base_suja`), não por esquecimento — mas enquanto não existir, base da demo só ganha dicionário v2 ao custo dos cards, ou seja, não ganha. Ver `PLANO-etapa-2.md` §B6 |

### ⚠️ Ligar o typecheck de verdade no `npm run build`

`npm run build` é `vite build` — esbuild, que só remove tipos — e `npx tsc --noEmit` na raiz checa
**zero arquivos** (I-11). Um `ReferenceError` chegou à tela por isso.

**O que fazer:** `"build": "tsc -p tsconfig.app.json --noEmit && vite build"`, e `deno check` das
Edge Functions no CI.

⚠️ **Por que não foi feito junto:** sobra **um** erro pré-existente, `src/pages/PlumChat.tsx:331`
(`Type 'unknown' is not assignable to type 'Json'`). Ligar o typecheck antes de resolvê-lo quebra o
build de todo mundo. É meia hora de trabalho, não um projeto — só não é uma linha.

### As 25–30 perguntas da suíte de avaliação

O arnês existe e roda (`npm run avaliacao`), com **14** perguntas. ⛔ **Não é trabalho de código:**
completar inventando pergunta plausível mede a coisa errada com confiança (D-052). Precisa de quem
usa a base. ⭐ O que rende mais são as perguntas que já se viu o chat errar.

## 🟠 Projeto

| # | O quê | Nota |
|---|---|---|
| P1 | ⭐ `metadados` + `vocabulario` (dicionário camada 2) | Resolve a resolução de entidade e destrava o resto do remake |
| P2 | ⭐ Contrato `/resolver` + negação parcial + orçamento de linhas | A fundação da arquitetura-alvo |
| P3 | ⭐ Arquiteto + primeiros 6 padrões analíticos | O ativo do produto |
| P4 | Multi-planilha degrau 1 (arquiteto resolve o `from`) + cruzamento por grão comum | `urgent_multiplas_planilhas` pedia exatamente isso |
| P5 | Dicionário camadas 3 e 4 + editor em "minha base de dados" | Sem isso, cenário e "se A muda B" não existem |
| P6 | Streaming / agregação incremental para bases grandes | Hoje o executor carrega tudo num DataFrame; centenas de milhares de linhas matam o container |
| P7 | `formattingRules` cumprir o que promete | Quem escolhe o `type` ainda é um LLM olhando 5 linhas de amostra. O enum é fechado e `type` inválido loga warning, mas a escolha continua sendo um chute informado |
| P8 | Domínio próprio (`plum-polijunior.com.br`) | ⚠️ O domínio **não aponta para a Vercel** hoje. Três lugares têm de mudar juntos ou o SSO quebra |
| P9 | Mover a matriz de permissões de `Dashboard.tsx` para `Cfgdatabase.tsx` | `Dashboard.tsx` tem 1007 linhas. Plano existe e continua válido; sem urgência |

## 🔴 Precisa de decisão antes de virar tarefa

| # | Questão | Quem decide |
|---|---|---|
| D1 | ⭐ **Quantas perguntas reais exigem join *antes* da agregação?** Decide se R-11 sobrevive | mensurável nas 4 bases — 1 semana |
| D2 | **Orçamento de linhas por sessão: qual número?** (sugestão 200) | produto |
| D3 | **`amostra` e `registro` entram com teto de 5?** Cai a frase "a IA não lê seus dados" | produto + comercial |
| D4 | **Quais 6 padrões analíticos primeiro?** (aposta: decomposição de variação) | produto, informado por C1 |
| D5 | **Data trocada na origem** (CSV BR importado em planilha com Local EUA): 12 de ~30 dias de todo mês ficam errados, **em silêncio**. Não é número que falta, é número trocado | produto — como avisar sem corrigir (R-08) |
| D6 | **`plum_chat.assunto`**: a intenção (sugerir perguntas frequentes) continua boa; a implementação por LLM com taxonomia aberta caiu. Que mecanismo substitui? | produto |
| D7 | **Parar de enviar 5 linhas reais ao LLM no onboarding?** ⚠️ Hoje isso já torna falsa a garantia "a IA nunca lê seus dados". O remake decide **manter e mudar a narrativa** — confirmar | comercial |
| D8 | **`40-implementacao/clientes/` é versionado no git?** | Bernardo — decidir **antes** de a pasta ter conteúdo real |
| D9 | **A vertical é varejo, definitivamente?** | comercial |
| D10 | ⭐ **O arquiteto emite análise declarada (compilada pela plataforma) ou Query Plan direto?** Recomendação: compilador **com `ad_hoc` liberado** desde o começo, para medir a taxa (D-044) | produto + tech |
| D11 | **R1 do arquiteto é LLM ou código?** Casar termo da pergunta com o dicionário talvez não precise de modelo. Tentar código primeiro é mais barato e determinístico (D-043) | tech |
| D12 | **`ad_hoc` fica visível ao usuário?** ("essa pergunta saiu do meu repertório") — honestidade contra ruído | produto |

---

## Dívidas conhecidas — **não "consertar" sem combinar**

Estas não são pendências: são escolhas com razão registrada. Mexer nelas sem ler o porquê é
regressão.

| Dívida | Por que fica |
|---|---|
| **Duas implementações da normalização de nome de coluna** (TS + Python) | Não há como compartilhar código entre browser e Lambda. Defesa: tabela de 26 casos replicada nos dois lados. Divergir aqui **não vira bypass** — vira "coluna não encontrada" (D-017) |
| `client.ts` com URL e anon key hardcoded | A chave `anon` é pública por design (protegida por RLS). A inconsistência com `.env.example` é real, o risco não |
| Divergência `join_mode`: SQL diz `'share_id'`, dump diz `'codigo'` | Ler é inofensivo; **escrever** com o valor errado dá `23514`. Importe as constantes de `src/lib/organizacao.ts`, nunca inline |
| Objetos no banco sem migration (`assistants`, `conversations`, `messages`, `get_user_org_id()`…) | Herança. Confirmar o estado real antes de mexer |
| `organizations.dashboard_k_min` vestigial | Migration não destrutiva (D-005). Registro histórico de D-012 |
| `plum_chat.assunto` vestigial | Mantida de propósito: é o registro de que a ideia existe e continua boa (D-026) |
| Migrations aplicadas à mão | Decisão consciente (D-005) |
| ⚠️ **Existem funções publicadas que não estão no repositório** | Medido em 2026-08-20: a Management API lista **seis** funções e o repositório tem **cinco**. A sexta (`plum-chat`, da primeira PRD) está em T7. ⭐ A lição fica mesmo depois de apagá-la: **`ls supabase/functions/` não é a lista do que está no ar** — a lista real vem da API. Já tinha acontecido com o `dashboard-agent` em 2026-08-11 (I-03) |
ao cadastrar uma planilha, e mudar uma coluna dela, tem que recadastrá-la
ao clicar em refinar semântica, ele refina a semântica de TODOS os itens, até mesmo os que já estavam certos. mudar pra refinar a semântica somente dos que sofreram alterações
ao cadastrar uma planilha (concluir as 5 etaps), clicar em "conectar nova planilha" e recadastrá-la, o banco de dados não armazena os dados da nova planilha. deveria aparecer "planilha já cadastrada" ou "já existe um rascunho dessa planilha"
cadastrar a planilha via google sheets ANTES do onboardign e não NO FIM DELE.
---

## Já resolvido — não reabrir

Registrado para que ninguém "conserte" de novo:

| Item | Quando | O que ficou |
|---|---|---|
| Cache de coluna com TTL no executor | 2026-08-07 | ligado, 15 min (D-011) |
| Chat ligado ao executor real (`execute_plan`) | 2026-08-08 | 403 tinha duas causas diferentes (I-07) |
| k-anonimato | 2026-08-08 | removido por decisão de produto (D-012) |
| `sheets.py` comparando cabeçalho cru contra nome normalizado | 2026-08-11 | corrigido |
| `gid` descartado por `extrairSheetId` | 2026-08-11 | corrigido (I-04) |
| `walkArithmetic` autorizando sem olhar operandos | 2026-08-11 | corrigido (I-05) |
| Reuso de plano no chat | 2026-08-12 | plano, nunca resultado (D-024) |
| Trava de servidor para domínio de SSO | 2026-08-12 | migration `20260812120000` (D-019) |
| Persistência de tema + vazamento para a landing | 2026-08-12 | RPC `definir_tema()` + limpeza do efeito (I-06) |
| Aba "Entrada & Domínios" em Minha Organização | 2026-08-12 | feito; ficou de fora a adoção de órfãos (C9) |
| Privacidade diferencial contra ataque de diferenciação | 2026-08-08 | **moot** — caiu junto com o k-anonimato |
| `ai-plum-chat` com cópia antiga de `query_plan.ts` | 2026-08-20 | exceção deliberada da Fase 5b, encerrada pelo deploy da Etapa 0 (D-028). Durou 8 dias |
| Log estruturado no Supabase | 2026-08-18 | `plum_logs` — era o C1 desta lista |
| O pipeline de importação não lia a planilha | 2026-08-25 | resolvido pelo B12/B13 **eliminando o arquivo local**, não validando-o contra a planilha (I-08) |
| Formatação aprovada sem ver o dado | 2026-08-25 | a tabela antes-vs-depois passou a ser renderizada; era documentada e nunca existiu (D-048) |
| **C2** — abstração de provedor de LLM | 2026-08-25 | o `ai-agents` entrou nela no B14. Sobra o `dashboard-agent`, fora de escopo por decisão |
| A definição semântica do usuário não chegava ao chat | 2026-08-25 | o A3 lê o dicionário (D-049). Era só o hash da chave do cache do A2 |
| `plum_logs.presuncoes_qtd` sempre `NULL` | 2026-08-25 | mapeamento que faltava em `montarLinha`, com regressão (I-12). ⚠️ Sem linha de base recuperável |
