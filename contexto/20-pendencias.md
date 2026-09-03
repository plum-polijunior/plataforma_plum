---
status: vigente
camada: plataforma
atualizado_em: 2026-09-03
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
| T6 | Dividir `12-visao-tecnologica.md` (**434** linhas) em `12a-arquiteto` / `12b-contrato` / `12c-dados` | Estourou o teto de 400 da regra 4 do `contexto/CLAUDE.md`. `30-decisoes` e `31-incidentes` têm exceção declarada; este não. ⚠️ Cresceu 5 linhas desde que este item foi aberto — não encolhe sozinho |
| T7 | ⚠️ **Apagar a Edge Function órfã `plum-chat`** | ⭐ Ver a linha nova em "Dívidas conhecidas". `ACTIVE`, sem código no repositório, `verify_jwt: false`. O comando é `DELETE /v1/projects/{ref}/functions/plum-chat` |
| T8 | ⚠️ **Tabela inexistente devolve `{"error": …}` em vez de levantar** | `pandas_executor.py:654` destoa do resto do executor, que levanta `MissingColumnError`, `RawRowsBlocked`, `RowLimitExceeded`. Com **uma** tabela isso nunca apareceu, porque o `main.py` sobrescrevia o `from`; com multi-planilha vira o modo de falha mais provável — planejador erra o nome da planilha e o card fica **vazio em silêncio**, enquanto `MissingColumnError` apareceria. Ver `PLANO-etapa-3.md` §A2 |

## 🔵 Claro — sabe-se o que fazer

| # | O quê | Por que importa |
|---|---|---|
| ~~C1~~ | ~~⭐ **Log estruturado no Supabase**~~ | ✅ **Resolvido na Etapa 0 do remake** (2026-08-18): `plum_logs` grava as 4 etapas do chat com token, latência e saída do agente |
| C2 | ⭐ **Abstração de provedor de LLM** | Hoje a URL do Gemini está em **4 lugares** em 3 funções. Com 4 call sites é meio dia; com 20 é refatoração. ⚠️ É o B05 da Etapa 1 — e só o `ai-plum-chat` vai adotar, porque `dashboard-agent` e `ai-agents` estão fora do escopo do remake |
| C3 | Renomear a rota `/dashboard` (que é "Minha Organização") | Já custou tempo de leitura mais de uma vez. Vários lugares mudam juntos |
| C4 | Passo de verificação no fim do onboarding — ler a planilha de verdade | Pega aba errada, base não compartilhada, cabeçalho divergente e coluna sem título **de uma vez**, com a pessoa olhando a tela (I-08) |
| C4b | ⚠️ **O smoke test do Lambda roda DEPOIS do `update-function-code`** | `query-engine.yml`: a imagem quebrada substitui a boa e o teste só avisa depois — não há janela em que o deploy seja verificado antes de valer. Derrubou o executor em 2026-08-21 (I-09). O conserto é publicar versão → invocar → promover alias, que é mudança de infra. ⛔ **E há um segundo furo, de branch:** o `if:` que exige `refs/heads/plataforma` protege o `push`, mas **`workflow_dispatch` o ignora** — apertar "Run workflow" de dentro de qualquer branch publica no Lambda de **produção**, porque `LAMBDA_FUNCTION: plum-query-engine` é fixo no `env:`. Enquanto não houver variante de dev, a regra é: **não usar o botão** |
| C5 | Testes E2E (Playwright) dos 6 fluxos que cruzam camadas | Revogação de coluna surtindo efeito e POST direto no executor retornando 401 só se provam ponta a ponta |
| C6 | Eval do Agente A contra perguntas reais | Transforma "o chat parece que piorou" num número. É o único jeito de mexer no prompt com confiança |
| C7 | Escala do percentual: 0–1 nativo vs 0–100 em texto | Aberto desde 2026-08-11. A mesma coluna sai em duas escalas conforme a origem da célula |
| C8 | Fechar a policy `ALL / true` da tabela `Leads` | Dívida D-13 aceita conscientemente. **Fechar antes do primeiro usuário de cliente real** |
| C9 | Adoção de membros órfãos (conta criada antes da verificação de domínio) | Perfis com `organization_id` NULL não casam em nenhuma policy de SELECT — o admin não consegue nem contá-los |
| C10 | ⚠️ **`min`/`max` sobre coluna de texto agrupada devolvem `0`** | `_coerce_numeric_for_agg` converte a coluna antes de agregar, então "primeiro cliente por região" sai `0` em vez do nome. Não é proteção, é resposta errada em silêncio. ⚠️ **Não consertar antes do orçamento do B10**: destravar a coerção passa a devolver o literal de verdade, e hoje não há o que cobre isso |
| C11 | ⚠️ **Dois cabeçalhos que normalizam igual: uma coluna some na IMPORTAÇÃO** | ⭐ Investigado em 2026-08-20, e é mais estreito do que parecia. O **executor já recusa**, deliberadamente e com mensagem boa (`sheets.py`: *"não dá para saber qual usar… renomeie uma delas"*). O furo silencioso é só no `DatabasePipeline.tsx`, que monta `obj[normMap[h]] = row[i]` — a segunda coluna some do `schema_metadata`, e por tabela do `allowed_columns`. ⚠️ **Consertar só o `sheets.py` piora**: geraria uma coluna carregável e não autorizável, falhando com "coluna fora da permissão do cargo", que aponta para o lugar errado. O conserto nasce no **Agente 3** (onboarding), que já vê a amostra e nomeia conceitos — ele propõe dois nomes distintos e a pessoa confirma uma vez por base; casa com o C4. ⛔ Sufixo por ordem de coluna (`_2`) foi **recusado**: reordenar a planilha trocaria o sufixo de dono e o `allowed_columns` apontaria para a coluna errada — mesma classe de falha que o `google_sheet_gid` evita |

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
| P9 | Mover a matriz de permissões de `Dashboard.tsx` para `Cfgdatabase.tsx` | `Dashboard.tsx` tem 1007 linhas. Plano existe e continua válido; sem urgência |
| P10 | ⭐ **`a2_encaminhador` — o slot 2 volta, com duas escolhas** | Etapa 3. Escolhe **quais bases** entram no prompt do A3 **e qual A3** planeja (D-054). ⛔ Escrito do zero: o `reconhecedor` preservado não vê a pergunta, e escolher base exige a pergunta — o cache por digital devolveria a escolha de uma pergunta para outra, calado. Junto vem o registro `_shared/agentes.ts`, que é **código nosso**, não campo do cliente. ⚠️ Depende do T8 e do `main.py` parar de sobrescrever o `from`, senão a escolha do A2 é descartada e nada dela é observável. Ver `PLANO-etapa-3.md` §A3 e B20 |

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
| D13 | **Um A3 especialista fica disponível para toda organização, ou é entitlement?** A *definição* de cada A3 é nossa e global (D-054); a *disponibilidade* talvez não seja — um cliente que não comprou o `a3_tendencia` deveria vê-lo? O padrão já existe (`organizations.remake_habilitado`) e a mudança é filtrar o registro antes de montar o prompt do A2. ⛔ Não antecipar o campo enquanto não houver o segundo A3: seria desenhar para um preço que ninguém definiu | comercial |

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
| ⚠️ **`aprovarLote` decide o orçamento pelo MENOR saldo entre as bases** | Assumida em 2026-08-28, no B20. Ela recebe **um** saldo, e um pedido não declara de qual base lê — quem sabe isso é o `from`. ⇒ Num turno multi-base o lote é julgado pelo saldo da base mais gasta. ⭐ **Erra para o lado seguro** (nunca entrega mais do que a base mais apertada permite), e o custo é o inverso: uma base zerada trava as outras, e o usuário lê *"você já viu o máximo de linhas"* sobre uma base que ainda tem cota. ⛔ **Consertar exige `resolverBase` dentro do cálculo do orçamento** — e aí a decisão de *qual base* passa a existir em dois lugares do `ai-plum-chat/index.ts`, que é exatamente o que a barreira 3 foi desenhada para evitar (a divergência ali não é erro de coluna, é autorizar contra a base A e executar sobre a B). O caminho certo é `aprovarLote` passar a receber `{base: saldo}` e o pedido a carregar a base que a barreira 3 **já** resolveu — uma decisão, dois consumidores. ⚠️ Só vale a pena quando houver medição de quantos turnos tocam duas bases (D1) |
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
| ⭐ **C13** — reconferir base ativa sem uuid novo | 2026-09-03 | **B22.** "Editar Esquema" ganhou um *Reler a planilha* que reconcilia preservando o `id` do dataset, então os cards e a matriz sobrevivem. Recadastrar continua criando uuid novo — só deixou de ser a única saída |
| ⭐ **C15** — mudar coluna no Sheets obrigava a recadastrar tudo | 2026-09-03 | **B22**, mesmo Reler. ⛔ Ficou de fora, por decisão, a edição **manual** de nome de coluna que o V3 pedia: o nome normalizado é contrato com três lados e digitá-lo à mão quebra os três (D-056) |
| **C12** — `allowed_columns` nunca revalidado contra o cabeçalho | 2026-09-03 | **B22.** Coluna que sumiu da planilha sai do `schema_metadata` **e** do `allowed_columns` de todos os cargos, nessa ordem — a ordem é o que substitui a transação que o cliente Supabase não tem (D-056) |
| **C14** — cadastrar a mesma planilha de novo não avisava nada | 2026-09-03 | **B21.** A busca passou a ser por `google_sheet_id` + `google_sheet_gid`, em qualquer status. ⚠️ **O texto desta pendência estava errado** e vale registrar: ela afirmava que *"a detecção não pode ser pela URL… tem de ser pelo conteúdo, p. ex. o conjunto de cabeçalhos"*. Pode ser pela URL — o mesmo documento dá o mesmo `id` em qualquer forma de link, e comparar cabeçalhos era voltar ao casamento por assinatura que o B13 abandonou (D-055) |
| **C17** — observações da base editáveis em "minha base de dados" | 2026-09-03 | **B23**, e saiu maior: o **dicionário v2 inteiro** ficou editável numa base ativa — grão, observações, `papel_analitico` e `vocabulario_util`. ⭐ E o botão de **acrescentar** observação não existia em lugar nenhum, nem no cadastro: só dava para editar ou apagar o que o Agente 1 escrevera, então uma base cuja IA não apontou nada nunca ganhava a primeira. Entrou nos dois lugares |
| **C16** — "Refinar semântica" refinava todas as colunas | 2026-09-03 | **B24**, nos **dois** lugares (cadastro e "Editar Esquema"). Linha de base diferente em cada um: a saída do Agente 1 no cadastro, o que está salvo na base ativa. ⛔ A resposta volta parcial, então o merge é obrigatório — substituir apagaria as colunas não enviadas |
| O pipeline de importação não lia a planilha | 2026-08-25 | resolvido pelo B12/B13 **eliminando o arquivo local**, não validando-o contra a planilha (I-08) |
| Formatação aprovada sem ver o dado | 2026-08-25 | a tabela antes-vs-depois passou a ser renderizada; era documentada e nunca existiu (D-048) |
| **C2** — abstração de provedor de LLM | 2026-08-25 | o `ai-agents` entrou nela no B14. Sobra o `dashboard-agent`, fora de escopo por decisão. ⚠️ **"Fora do escopo" não quer dizer intocado:** em 2026-08-26 ele adotou `_shared/hoje.ts` (D-053). O que continua verdade é o estreito — ele **não** usa `_shared/llm.ts`, e a URL do Gemini segue inline lá |
| A definição semântica do usuário não chegava ao chat | 2026-08-25 | o A3 lê o dicionário (D-049). Era só o hash da chave do cache do A2 |
| **P8** — domínio próprio `plum-polijunior.com.br` | 2026-08-27 | ✅ no ar na Vercel (`Server: Vercel`, `gru1`), com SSO funcionando. ⭐ Os **três lugares** que a pendência citava sem nomear estão no `CLAUDE.md` §4. O que quebrou no caminho foi o segundo — ver `03-erros-comuns.md` |
| `plum_logs.presuncoes_qtd` sempre `NULL` | 2026-08-25 | mapeamento que faltava em `montarLinha`, com regressão (I-12). ⚠️ Sem linha de base recuperável |
