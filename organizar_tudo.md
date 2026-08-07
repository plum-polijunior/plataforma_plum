# Organizar Tudo — plano de arrumação do repositório

> Escrito em 2026-08-07, depois de ler o histórico de commits, o código atual e toda a
> documentação do repositório. Todo achado abaixo tem uma evidência (arquivo, linha, ou
> comando) — não é impressão, é o que o código mostra hoje. Onde eu não tenho certeza do
> motivo por trás de uma decisão, deixei como pergunta na seção 6, em vez de supor.

---

## 1. Quem fez o quê (para entender de onde vêm os conflitos)

O histórico de commits mostra três pessoas com três tarefas bem diferentes, trabalhando em
paralelo sem muita sincronia entre si:

| Pessoa | Período | Tarefa | Onde mexeu |
|---|---|---|---|
| **Allekka** | 22–23/07 | Segurança de login e SSO por domínio: fechar o escalonamento de privilégio, endurecer as regras de acesso do banco (RLS) | `supabase/migrations/2026072*`, `docs/INCIDENTE-*`, `docs/SSO-DOMINIO.md` |
| **bmchad** | 06–07/08 | Interface do chat (`/plum`), painel de edição de schema em `Cfgdatabase`, e uma primeira tentativa de fazer o motor de cálculo rodar na AWS | `src/pages/PlumChat.tsx`, `src/components/PlumThinkingBar.tsx`, `src/pages/Cfgdatabase.tsx`, `query_engine/app.py`/`auth.py`/`sheets_client.py`/`cache.py` (esses quatro últimos já foram substituídos, ver §2.2) |
| **RicardoMoussalli** | 07/08 | O motor de cálculo de verdade (AWS Lambda) e um novo recurso: "cards" de dashboard com números fixos, recalculados sozinhos, com controle de quem vê qual coluna | `query_engine/main.py`/`security.py`/`sheets.py`/`config.py`, `supabase/functions/dashboard-execute/`, `infra/aws/`, migration `20260806230000_dashboard_cards.sql`, `docs/fases dashboard/` |

Nenhuma dessas três pessoas estava fazendo algo errado sozinha. O problema é que a tarefa do
bmchad (chat) e a tarefa do RicardoMoussalli (motor de cálculo + dashboard) **precisavam se
encontrar em um ponto** — o motor de cálculo — e não se encontraram ainda. E a tarefa mais
antiga (Allekka) deixou um documento de plano (`reorganizacao_cargos_e_permissoes`) que nunca
terminou de ser aplicado, e ninguém mais tocou nele depois.

---

## 2. Conflitos e sobreposições encontrados

Cada item abaixo é um caso real de duas (ou mais) coisas que descrevem, decidem, ou implementam
a mesma coisa de formas diferentes — o que a pergunta chama de "pleonasmo" (repetição) ou
"conflito" (contradição).

### 2.1 A matriz de permissões existe em dois lugares, nenhum completo — o mais grave

**O que eu encontrei, com evidência:**

- `src/pages/Dashboard.tsx` **ainda tem** o diálogo inteiro de "quais colunas cada cargo pode
  ver" — estados `datasets`, `rolePermissions`, `editingRole` (linhas 45–55), a busca de
  `datasets` (linha 163), e o `<Dialog>` de 184 linhas (linhas 819–1003) com o botão
  **"Configurar Colunas →"** (linha 806) que ainda abre esse diálogo.
- `src/pages/Cfgdatabase.tsx` **não tem nada disso.** Procurei por `Tabs`, `permissoes`,
  `role_permissions` e `allowed_columns` no arquivo inteiro e não apareceu nenhuma ocorrência.
- Existe um arquivo na raiz do projeto, `reorganizacao_cargos_e_permissoes` (sem extensão
  `.md`, parece ter sido salvo sem querer sem a extensão), que é um **plano** escrito para
  fazer exatamente a mudança que falta: tirar a matriz de `Dashboard.tsx`, trocar o botão para
  **"Configure no CfgDatabase →"**, e recriar a matriz dentro de `Cfgdatabase.tsx` numa aba
  própria (`?tab=permissoes`).
- O próprio `CLAUDE.md` (o guia deste projeto) **já afirma, na tabela do mapa do repositório**,
  que `Cfgdatabase.tsx` tem "matriz de permissões (?tab=permissoes)" — o que não é verdade no
  código de hoje.

**Ou seja: três fontes (o código antigo, o plano de mudança, e a documentação) concordam sobre
"pra onde isso deveria ir", mas nenhuma delas reflete o estado real, que é "só existe no lugar
velho".** Isso não é um problema estético — é um risco de produto: alguém pode editar a matriz
em `Dashboard.tsx` pensando que está mexendo no lugar certo, ou pode confiar no `CLAUDE.md` e
procurar em `Cfgdatabase.tsx` uma tela que não existe.

**O que tem de melhor em cada lado:**
- O código atual (`Dashboard.tsx`) **funciona** — é a única versão que um usuário real pode
  usar hoje.
- O plano (`reorganizacao_cargos_e_permissoes`) tem uma justificativa de produto sólida:
  `Dashboard.tsx` deveria ser só sobre a empresa (membros, cargos), e tudo que é sobre "bases
  de dados e o que cada um vê" deveria morar junto de onde a base é conectada
  (`Cfgdatabase.tsx`). Isso faz sentido e evita que a pessoa precise pular entre duas telas
  para configurar uma coisa só.

**Sugestão de mesclagem:** seguir o plano já escrito (ele já existe, já foi pensado, só não foi
executado) — mover a matriz para `Cfgdatabase.tsx`, deixar o botão em `Dashboard.tsx` como um
atalho que só navega para lá, e **depois** corrigir o `CLAUDE.md` (que hoje descreve a versão
que ainda não existe) ou, com a mesma facilidade, atualizar o mapa para descrever a realidade
até a mudança acontecer. Não decido sozinho qual dos dois botões fazer primeiro — ver §6.

---

### 2.2 Duas implementações do motor de cálculo — já resolvido, mas com sobras

**O que aconteceu:** bmchad escreveu uma primeira versão do serviço que roda na nuvem
(`app.py`, `auth.py`, `sheets_client.py`, `cache.py`) pensando em uma máquina (EC2) sempre
ligada. No mesmo dia, RicardoMoussalli escreveu uma segunda versão (`main.py`, `security.py`,
`sheets.py`, `config.py`) para rodar sob demanda (Lambda), com mais proteções (ver
`docs/fases dashboard/2026-08-06-fase-0-executor-deterministico.md`). As duas bateram de
frente no mesmo commit (`ad08c60`) e o próprio RicardoMoussalli já resolveu isso pouco depois
(commit `e677b38`, *"consolida as duas implementações paralelas"*): apagou os quatro arquivos
do bmchad e manteve os dele.

**O que sobrou, sem estar quebrado, mas merecendo atenção:**
- `query_engine/cache.py` (do bmchad) **foi mantido de propósito**, mas não é usado por
  nenhum outro arquivo — está "estacionado" até alguém decidir se vale a pena guardar dado do
  cliente em memória por 15 minutos (ver `TODOS.md` item 1). Não é lixo, é uma decisão em
  aberto — mas hoje nada no arquivo avisa isso para quem abrir só ele.
- `query_engine/prd.md` e `query_engine/urgent.md` foram escritos descrevendo a primeira
  versão (a do bmchad). Eu já os atualizei numa sessão anterior para refletir a versão real —
  este item já está resolvido, cito aqui só para constar que a causa raiz era esta.
- `query_engine/implementation.md` também já foi reescrito como "isto foi abandonado, veja
  `infra/aws/` para o real" — também já resolvido.

**Não há ação pendente aqui além de, opcionalmente, um comentário de uma linha no topo de
`cache.py` apontando para `TODOS.md` #1**, para reduzir a chance de alguém presumir que está
ligado. Cito o caso inteiro porque é o exemplo mais claro, dentro deste repositório, de como
um conflito de código é resolvido bem: quem chegou depois leu o que já existia, escolheu a
versão mais robusta, e documentou por quê (ver `docs/fases dashboard/`). É o padrão a copiar
para os outros conflitos deste documento.

---

### 2.3 Duas convenções de Edge Function convivendo, uma delas sem rede de segurança — RESOLVIDO em 2026-08-07

**Feito:** todas as cinco funções agora moram em `supabase/functions/<nome>/index.ts` (padrão
único). A convenção antiga (`supabase/edge-functions/`) e a ponte que existia entre as duas
(`scripts/gerar-edge-function.mjs` + `arquivo-colavel.test.ts`) foram removidas — deixaram de
fazer sentido a partir do momento em que o deploy passa a ser automático (via CLI/pipeline),
porque a razão de existir de um "arquivo colável" era só a limitação de colar manualmente no
painel, sem resolver import local. `ai-plum-chat` ganhou uma quarta ação, `execute_plan`,
reaproveitando `_shared/query_plan.ts` (ver §2.4). `dashboard-execute` também passou a
importar `columnRolesFromSchema` do `_shared/` em vez de manter uma cópia local
(`papeisDeColuna`). Ver `supabase/functions/README.md` para a convenção atual. O raciocínio
original que levou a essa arrumação fica registrado abaixo, sem alterar.

<details>
<summary>Raciocínio original (antes da migração)</summary>

**O que existia:**
- `supabase/edge-functions/` (convenção antiga): arquivos soltos, escritos à mão, sem teste,
  cada um citando no nome se é "function" (singular) ou "functions" (plural) sem nenhum
  padrão — `supabase_edge_function_ai_agents.ts`, `supabase_edge_functions_ai_plum_chat.ts`,
  `supabase_edge_functions_plum_chat.ts`, `supabase_edge_function_send_auth_email.ts`. Todos
  existem porque este projeto publica Edge Functions colando o arquivo no painel do Supabase,
  não pela linha de comando (ver `CLAUDE.md` §1) — então eles **precisam** ser um arquivo só,
  sem importar nada de fora.
- `supabase/functions/` (convenção nova, de Ricardo): estrutura oficial do Supabase CLI, com
  `_shared/query_plan.ts` (código compartilhado, testado) e `dashboard-execute/index.ts`
  (a função em si, que importa o compartilhado).
- **A ponte entre as duas:** `scripts/gerar-edge-function.mjs`. Ele pega os dois arquivos da
  convenção nova, cola um dentro do outro, e escreve o resultado em
  `supabase/edge-functions/supabase_edge_function_dashboard_execute.ts` — que é o arquivo que
  de fato se cola no painel. Um teste (`supabase/functions/_shared/arquivo-colavel.test.ts`)
  **quebra o `npm test`** se alguém esquecer de rodar `npm run gen:edge` depois de editar o
  fonte. Isso é documentado com clareza em `supabase/edge-functions/README.md`.

**Por que isso importa:** `dashboard-execute` é a função que decide se um cargo pode ver uma
coluna ou não. Ela tem 28 testes cobrindo justamente essa extração de colunas. As outras
quatro funções (`ai-agents`, `ai-plum-chat`, `plum-chat`, `send-auth-email`) **não têm teste
nenhum** e são editadas direto no arquivo que vai para o painel — ou seja, o padrão bom
existe, mas só foi aplicado onde o risco de segurança apareceu primeiro.

**O que tem de melhor em cada lado:** a convenção nova (gerar + testar) é objetivamente
superior em segurança e manutenção — impossível o que roda divergir do que foi testado. A
convenção antiga é mais simples de entender de cara (é só um arquivo) e não exige rodar nada
antes de colar.

**Sugestão de mesclagem:** não são incompatíveis — a convenção nova já **é** um arquivo colável
no fim das contas, só que com uma fonte de verdade testável por trás. O caminho natural é
migrar `ai-agents` e `ai-plum-chat` para o mesmo padrão, sobretudo porque são justamente as
funções que decidem o que a IA pode fazer e o que o executor recebe (ver §2.4) — exatamente o
tipo de lógica que "não pode viver sem teste", nas palavras do próprio `README.md` do projeto.
`plum-chat` e `send-auth-email` são mais simples; migrar ou não é decisão de prioridade, não de
necessidade.

**Além disso, uma sobra concreta que foi apagada:** o arquivo
`supabase_edge_function_ai_plum_chat.ts` **na raiz do repositório** era uma cópia idêntica,
byte a byte, do arquivo em `supabase/edge-functions/supabase_edge_functions_ai_plum_chat.ts`
(eu comparei os dois — eram exatamente iguais). Sobra de alguém copiando o arquivo pra colar
no painel e esquecendo de apagar a cópia. **Apagado** junto da migração acima.

</details>

---

### 2.4 O chat e o motor de cálculo real nunca se encontraram — RESOLVIDO em 2026-08-07 (§6, pergunta 1)

**Feito:** `ai-plum-chat` ganhou a ação `execute_plan`, reaproveitando `authorizePlan` e
`columnRolesFromSchema` de `_shared/query_plan.ts` — exatamente o caminho recomendado abaixo,
sem duplicar o RBAC de coluna que o dashboard já tinha. `PlumChat.tsx:143-144` não tem mais o
mock; o vetor que chega em `synthesize_answer` agora é o resultado real do Lambda. Suíte de
testes (39 TS + 53 Python) roda verde, e o `npm run build` do front também passa. Falta o
teste manual E2E contra dados reais de uma planilha de teste — isso é trabalho de QA, não de
código, e fica para quem for validar antes de considerar a Fase 2 encerrada de vez.

O raciocínio original que motivou a priorização fica registrado abaixo:

- bmchad construiu a tela de chat (`PlumChat.tsx`) completa, incluindo a barra de "Plum está
  pensando" animada. No lugar onde deveria chamar o motor de cálculo, tem um valor **fixo e
  fingido**: `{ rows: [{ valor: "Simulado" }] }` (`PlumChat.tsx:143-144`).
- RicardoMoussalli construiu o motor de cálculo de verdade, testado, seguro, em produção — mas
  o único jeito de chamá-lo hoje é através da função `dashboard-execute`, pensada para os
  "cards" fixos do dashboard, não para uma pergunta livre de chat.

**Não é um erro de ninguém.** É simplesmente o próximo passo óbvio, e eu já deixei o caminho
recomendado escrito em `query_engine/prd.md` §9 e em `CLAUDE.md` §5: reaproveitar o mesmo
extrator de colunas (`_shared/query_plan.ts`) e o mesmo formato de payload que
`dashboard-execute` já usa, em vez de inventar um segundo jeito de chamar o motor.

---

### 2.5 O dashboard de cards tem motor e banco, mas nenhuma tela

RicardoMoussalli construiu todo o back-end dos "cards" (tabela `dashboard_cards`, o motor que
os recalcula, o cache por permissão) — mas **não existe nenhuma página no site que mostre
isso**. Conferi todas as rotas em `App.tsx`: só existem `/`, `/auth`, `/dashboard`,
`/cfgdatabase` e `/plum`. Nenhuma delas lê a tabela `dashboard_cards`. O único jeito de ver um
card funcionando hoje é inserindo ele à mão pelo painel do Supabase, como o próprio roteiro
`infra/aws/PASSO-A-PASSO.md` (Etapa 6.3) ensina a fazer para teste.

Isso não é um conflito entre pessoas — é um recurso pela metade que vale nomear alto, porque é
fácil ler os testes passando e a infraestrutura no ar e achar que o dashboard "já existe". Ele
existe como motor. Não existe como produto usável ainda.

---

### 2.6 Quatro documentos "PRD" descrevendo o mesmo produto em escopos diferentes

| Documento | Escopo | Estado |
|---|---|---|
| `docs/PRD-PLUM2.0.md` | Produto inteiro | **Aspiracional** — o próprio `CLAUDE.md` avisa que ele descreve tabelas que não existem no banco real. Não tem nenhum aviso disso escrito nele mesmo. |
| `query_engine/prd.md` | Chat + motor de cálculo | Atualizado recentemente para bater com o código real, inclusive com uma seção "estado real de implementação" |
| `src/pages/prd_chat_ui.md` | Tela do chat, especificamente | Parece já implementado (a barra de progresso descrita nele é literalmente `PlumThinkingBar.tsx`), mas está **guardado dentro de `src/pages/`**, junto dos componentes React, em vez de em `docs/` |
| `docs/fases dashboard/*.md` | O que foi construído, fase a fase | O mais confiável dos quatro — descreve o que **foi feito de fato**, com resumo estruturado por tarefa, não o que se pretende fazer |

**O problema não é ter documentação demais — é não estar claro qual documento manda em qual
pergunta.** Alguém que perguntar "como funciona o chat hoje" pode ler qualquer um dos quatro e
sair com uma resposta diferente.

**Sugestão de mesclagem:**
1. `docs/PRD-PLUM2.0.md` ganha um aviso no topo (uma linha) dizendo que é aspiracional e não
   reflete o schema real — o `CLAUDE.md` já sabe disso, falta o próprio arquivo saber.
2. `src/pages/prd_chat_ui.md` muda de endereço para `docs/` (arquivos de código não deveriam
   morar junto de documentos de planejamento) e ganha uma nota indicando o que dele já foi
   implementado (praticamente tudo, pelo que vi) para não parecer um plano em aberto.
3. `docs/fases dashboard/` continua sendo o "diário de bordo" do que foi construído — e o
   ideal é que a próxima fase (ligar o chat ao motor real, ou construir a tela do dashboard)
   vire um novo arquivo no mesmo formato, para manter o único lugar que hoje está confiável.

---

### 2.7 Arquivos soltos na raiz do repositório

Nenhum destes quebra nada, mas todos competem por atenção com os arquivos que realmente
importam quando alguém abre a pasta pela primeira vez:

| Arquivo | O que é | Sugestão |
|---|---|---|
| `supabase_edge_function_ai_plum_chat.ts` | Cópia idêntica de um arquivo que já existe no lugar certo (§2.3) | **Apagar** |
| `reorganizacao_cargos_e_permissoes` | Plano de mudança sem extensão `.md`, incompleto (§2.1) | **RESPONDIDO (§6):** o plano será aplicado, só não agora — manter na raiz até virar Fase 4 |
| `esquema_autenticacao.html` | Um diagrama exportado (provavelmente do fluxo de login) | **RESPONDIDO e feito (§6):** movido para `docs/esquema_autenticacao.html` |
| `login_supabase.sql`, `create_role_permissions_table.sql`, `add_role_permissions.sql` | Scripts SQL "de origem", aplicados uma vez, fora da pasta `supabase/migrations/` | O próprio `CLAUDE.md` já diz que `add_role_permissions.sql` é histórico e não deve ser aplicado de novo — ele é o único dos três realmente morto; sugiro apagá-lo. Os outros dois continuam sendo a base real do banco (fora do sistema de migrations por serem anteriores a ele) — mover para dentro de `supabase/` (ex.: `supabase/base/`) deixaria a raiz mais limpa sem perder o histórico |

---

## 3. O que já está bom e deve virar padrão (não mexer, só copiar a ideia)

- **`scripts/gerar-edge-function.mjs` + `arquivo-colavel.test.ts`** (§2.3): resolve exatamente
  a tensão entre "precisa ser um arquivo só pra colar" e "não pode viver sem teste". Vale
  aplicar às outras Edge Functions.
- **`docs/fases dashboard/*.md`**: cada arquivo termina com um "resumo estruturado por tarefa"
  (ver `docs/fases dashboard/README.md`) — fácil de auditar depois, difícil de ficar
  desatualizado, porque documenta o que foi feito, não o que se pretende fazer.
- **As quatro barreiras de segurança do motor de cálculo** (`query_engine/security.py`):
  duas credenciais independentes, RBAC de coluna resolvido uma única vez (`_shared/query_plan.ts`),
  k-anonimato. Esse é o nível de rigor que a integração do chat (§2.4) e qualquer coisa nova
  no dashboard (§2.5) deveriam mirar.
- **`infra/aws/provision.sh`**: papéis de acesso (IAM) bem estreitos — cada peça só pode fazer
  exatamente uma coisa. Bom padrão para qualquer coisa nova que precisar de acesso à AWS.

---

## 4. Tabela de ações (apagar / mover / mesclar / manter)

| Item | Ação | Depende de |
|---|---|---|
| `supabase_edge_function_ai_plum_chat.ts` (raiz) | **Feito — apagado** | — |
| `add_role_permissions.sql` (raiz) | **Apagar** | confirmar com quem escreveu (§6) |
| `login_supabase.sql`, `create_role_permissions_table.sql` (raiz) | **Mover** para `supabase/base/` ou pasta equivalente | — |
| `reorganizacao_cargos_e_permissoes` (raiz) | **Manter na raiz**, aplicar na Fase 4 (não agora) | resolvido (§6, perguntas 3 e 7) |
| `esquema_autenticacao.html` | **Feito** — movido para `docs/` | resolvido (§6, pergunta 6) |
| `src/pages/prd_chat_ui.md` | **Mover** para `docs/`, marcar o que já foi implementado | — |
| `docs/PRD-PLUM2.0.md` | **Manter**, adicionar aviso de "aspiracional" no topo | — |
| Matriz de permissões em `Dashboard.tsx` | **Mesclar** para dentro de `Cfgdatabase.tsx`, conforme o plano já escrito, na Fase 4 | resolvido (§6, pergunta 3) — confirmado, não é urgente |
| `CLAUDE.md` (mapa do repositório) | **Feito parcialmente** — arquitetura de IA e mapa do `supabase/functions/` já corrigidos; a parte de `Dashboard.tsx`/`Cfgdatabase.tsx` ainda depende da Fase 4 | item anterior |
| `ai-agents`, `ai-plum-chat`, `plum-chat`, `send-auth-email` em `supabase/edge-functions/` | **Feito** — todas migradas para `supabase/functions/<nome>/index.ts`; convenção antiga e `scripts/gerar-edge-function.mjs` removidos | resolvido (§6, pergunta 5) |
| `query_engine/cache.py` | **Feito — ligado** em `sheets.py:load_columns`, `TODOS.md` #1 atualizado | resolvido (§6, pergunta 4) |
| Ação `execute_plan` em `ai-plum-chat` | **Feito** — chat ligado ao Lambda real, mock removido de `PlumChat.tsx` | Fase 2, prioridade confirmada (§6, pergunta 1) |
| `query_engine/cache.py` | **Manter**, só adicionar comentário apontando para `TODOS.md` #1 | — |
| Ligação chat → motor real | **Construir — PRIORIDADE CONFIRMADA**, vira Fase 2 | — (respondido em §6) |
| Tela do dashboard de cards | **Construir**, mas rebaixada para Fase 7 (por último) | — (respondido em §6) |

---

## 5. Etapas cronológicas de implementação

> **Reordenado em 2026-08-07** depois da decisão: *terminar o chat de verdade é prioridade*
> (respondia a §6, pergunta 1). A ligação do chat ao motor real passou a ser a Fase 2, logo
> depois da limpeza sem risco — antes da arrumação da matriz de permissões e antes de
> qualquer trabalho na tela do dashboard, que agora vem por último (Fase 7). A limpeza (Fase 1)
> continua primeiro porque não custa nada e não compete por tempo com o chat.

### Fase 1 — Limpeza sem risco (pode começar imediatamente, não depende de decisão)
1. ~~Apagar `supabase_edge_function_ai_plum_chat.ts` da raiz~~ — **feito**, junto da migração
   das Edge Functions (Fase 2/5).
2. Apagar `add_role_permissions.sql` da raiz (o próprio `CLAUDE.md` já o declara morto).
3. Mover `src/pages/prd_chat_ui.md` para `docs/prd_chat_ui.md`, com uma nota no topo
   listando o que dele já foi implementado.
4. Adicionar uma linha de aviso no topo de `docs/PRD-PLUM2.0.md` marcando-o como aspiracional.
5. ~~Adicionar um comentário no topo de `query_engine/cache.py` apontando para `TODOS.md` #1~~
   — **superado**: a decisão saiu antes (§6, pergunta 4) e o cache já foi ligado de verdade em
   `sheets.py`, não só comentado. `TODOS.md` #1 já documenta a decisão.

### Fase 2 — Ligar o chat ao motor de cálculo real (PRIORIDADE — §2.4) — FEITO em 2026-08-07

Antes de começar, uma verificação: a permissão de coluna (`allowed_columns` em
`role_permissions`) já existe no banco e já é editável hoje pela matriz antiga em
`Dashboard.tsx` (§2.1) — mesmo bagunçada, ela é funcional. **Isto significa que o chat pode
ser ligado ao motor real sem esperar a Fase 4 (arrumação da matriz)** — os dois trabalhos são
independentes, porque o dado que o chat vai ler já existe e já pode ser editado, só a tela que
edita ele é que está no lugar "errado". (Confirmado: a Fase 2 foi concluída sem tocar na Fase 4.)

6. ~~Migrar `ai-plum-chat`...~~ **Feito** — `supabase/functions/ai-plum-chat/index.ts`,
   reaproveitando `authorizePlan`/`columnRolesFromSchema` de `_shared/query_plan.ts`. Sem
   teste novo para a lógica de `ai-plum-chat` em si (§6, pergunta 5) — a parte crítica de
   segurança continua sendo o `_shared/query_plan.ts` já testado (39 testes agora, incluindo
   os 4 novos para `columnRolesFromSchema`), só reaproveitado.
7. ~~No passo que hoje é o mock...~~ **Feito**, exatamente como descrito: extrai colunas com
   `authorizePlan`, busca `allowed_columns`, monta o mesmo payload de `dashboard-execute`,
   assina (HMAC + SigV4), chama o mesmo Lambda em `/execute`.
8. ~~Remover o `mockPythonVetor` de `PlumChat.tsx`~~ — **feito**.
9. **Pendente — é trabalho de QA, não de código:** testar manualmente contra uma planilha real:
   pergunta válida, pergunta bloqueada pelo Agente Z, pergunta com coluna fora da permissão do
   cargo (deve recusar, não filtrar em silêncio), pergunta que dispara supressão por
   k-anonimato (poucas linhas no resultado). `npm run build`, `npm test` (39) e
   `npm run test:py` (53) passam, mas isso confirma que o código compila e a lógica pura está
   correta — não substitui testar contra o Lambda de verdade com uma planilha de teste.
10. ~~Adaptar `scripts/gerar-edge-function.mjs`...~~ — **não se aplica mais**: o mecanismo de
    arquivo colável foi aposentado (ver §2.3) porque o deploy passa a ser automático. Deploy
    de `ai-plum-chat` agora é `supabase functions deploy ai-plum-chat`, igual às outras.
11. Registrar o que foi feito num novo arquivo em `docs/fases dashboard/` — ainda não feito
    nesta sessão; recomendo fazer antes de considerar a Fase 2 formalmente encerrada, seguindo
    o mesmo formato de `2026-08-07-fase-0b-ligando-as-pontas.md`.

### Fase 3 — Decisões pequenas e locais
12. ~~Decidir o destino de `esquema_autenticacao.html` e `reorganizacao_cargos_e_permissoes`~~
    — **feito**: o primeiro já foi movido para `docs/`; o segundo fica na raiz até a Fase 4.
13. Mover `login_supabase.sql` e `create_role_permissions_table.sql` para dentro de
    `supabase/`, atualizando qualquer referência a eles (`CLAUDE.md`, `docs/PASSO-A-PASSO-APLICAR.md`).

### Fase 4 — Resolver o conflito da matriz de permissões (§2.1) — confirmado, sem urgência
14. Implementar a aba de permissões em `Cfgdatabase.tsx`, trocar o botão em `Dashboard.tsx`
    para o atalho de navegação, remover o `<Dialog>` de 184 linhas e os estados associados de
    `Dashboard.tsx` — o plano em `reorganizacao_cargos_e_permissoes` já descreve exatamente
    isso, só falta executar (§6, pergunta 3, já confirmado que ainda vale).
15. Atualizar `CLAUDE.md` para descrever a realidade pós-mudança.
16. Rodar `npm run build` e testar manualmente os dois fluxos (criar cargo, liberar coluna,
    conferir no chat — já ligado ao motor real desde a Fase 2 — que a permissão realmente
    restringe o que é respondido).

### Fase 5 — Padronizar as Edge Functions restantes (§2.3) — FEITO em 2026-08-07

17. ~~Repetir para `ai-agents`...~~ **Feito, e estendido às outras duas também**:
    `ai-agents`, `plum-chat` (demo da landing page — confirmado em uso por
    `DataPlaygroundSection.tsx`, não é código morto) e `send-auth-email` (confirmado em uso
    por `Dashboard.tsx`, `Auth.tsx` e `ContactForm.tsx`) foram todas movidas para
    `supabase/functions/<nome>/index.ts`. Nenhuma ganhou teste novo (§6, pergunta 5) — só
    mudou de endereço. `supabase/functions/README.md` documenta as cinco agora.

### Fase 6 — Organização estrutural final
18. Revisar se a convenção de nomes das Edge Functions (`function` vs `functions`, arquivos
    prefixados com `supabase_edge_function`) vale a pena padronizar, agora que a maioria já
    passou pelo processo de gerar+testar.
19. Reler este documento inteiro e apagar as seções que já viraram passado.

### Fase 7 — Construir a tela do dashboard de cards (§2.5)

Rebaixada para último lugar por decisão explícita (§6, pergunta 1 respondida). O motor e o
banco já existem e não perdem validade esperando — só não há tela ainda.

20. Definir a rota (`/dashboard/cards`? um novo item dentro do `/dashboard` atual?) — decisão
    de produto, não técnica.
21. Consumir `dashboard-execute` a partir do front, usando `DESIGN.md` como guia visual (os
    cinco estados do card já estão especificados lá).
22. Construir a tela de criação de card (hoje só existe via SQL manual, per
    `infra/aws/PASSO-A-PASSO.md` Etapa 6.3).

---

## 6. Dúvidas — preciso de decisões, não só de código

Estas perguntas não são retóricas: são pontos onde o código, sozinho, não me diz qual é a
decisão certa, porque é decisão de produto ou de prioridade, não de engenharia.

### Perguntas de arquitetura e do próprio Plum

1. ~~**O que é mais importante agora: terminar o chat de verdade (ligar ao motor de cálculo
   real) ou construir a tela do dashboard de cards?**~~ **RESPONDIDO (2026-08-07): terminar o
   chat é prioridade.** O plano nas seções 4 e 5 já foi reordenado para refletir isso — a
   ligação do chat ao motor real virou a Fase 2, antes da limpeza de menor risco de mais
   arquivos e antes de qualquer trabalho na tela do dashboard, que passa a vir por último.
2. ~~**A ideia de "card fixo" (dashboard) e "pergunta livre" (chat) são a mesma
   funcionalidade ou dois produtos diferentes?**~~ **RESPONDIDO: são dois produtos
   diferentes, e os dois vão usar o mesmo motor (Pandas/o executor em Lambda).** Confirma o
   desenho que já estava nos documentos (`query_engine/prd.md`, `CLAUDE.md`) — um único
   motor de cálculo, dois consumidores. Não muda nada no plano, só tira a dúvida de vez.
3. ~~**A matriz de "quem vê qual coluna" deveria mesmo morar em `Cfgdatabase`?**~~
   **RESPONDIDO: sim, o plano (`reorganizacao_cargos_e_permissoes`) continua valendo e será
   aplicado — só não é prioridade agora.** Mantém a Fase 4 como está (depois do chat), e o
   arquivo do plano **não deve ser apagado nem arquivado** (ver pergunta 7, que pergunta a
   mesma coisa por outro ângulo — resposta idêntica).

### Perguntas técnicas (com explicação simples ao lado)

4. **Vocês querem ligar o "cache de 15 minutos" do motor de cálculo (`query_engine/cache.py`)?**
   Em termos simples: hoje, toda vez que alguém faz uma pergunta ou abre um card, o sistema lê
   a planilha do zero. Ligar o cache significa guardar esse resultado na memória do computador
   por até 15 minutos, para não precisar ler a planilha de novo se outra pessoa perguntar algo
   parecido logo em seguida. O ganho é velocidade e menos risco de o Google bloquear por excesso
   de pedidos. O custo é que o dado do cliente fica "vivo" na memória por mais tempo do que uma
   única pergunta — hoje ele existe só durante o cálculo e some depois. É uma escolha entre
   velocidade e o quanto de tempo o dado do cliente fica guardado, mesmo que só na memória.
   **RESPONDIDO e feito: ligar de verdade agora.** `query_engine/sheets.py` (`load_columns`)
   já está conectado a `query_engine/cache.py` — chave por planilha+aba+conjunto exato de
   colunas, TTL 15 min. `TODOS.md` #1 atualizado registrando a decisão. Suíte de 53 testes
   Python roda verde depois da mudança.
5. ~~**Vale a pena escrever teste automatizado para `ai-agents`/`ai-plum-chat` agora?**~~
   **RESPONDIDO: não precisa de teste agora.** Isso simplifica a Fase 2 e a Fase 5 do plano —
   a migração dessas duas funções para a pasta nova pode acontecer só pela organização (um
   arquivo por função, gerado do mesmo jeito que `dashboard-execute`), sem a obrigação de
   escrever suíte de teste nova. A parte que já é testada (`_shared/query_plan.ts`) continua
   sendo reaproveitada de qualquer forma — isso não muda.
6. ~~**O arquivo `esquema_autenticacao.html` ainda é usado?**~~ **RESPONDIDO: mover para
   `docs/`.** Já feito — o arquivo agora vive em `docs/esquema_autenticacao.html`.
7. ~~**O plano de reorganização das permissões foi abandonado ou só esquecido?**~~
   **RESPONDIDO: será aplicado, só não é prioridade agora — manter o arquivo.** Mesma
   resposta da pergunta 3, dita de outro jeito. `reorganizacao_cargos_e_permissoes` continua
   na raiz por enquanto (não faz sentido mover para `docs/archive/` uma coisa que ainda vai
   ser feita — arquivo de "vai acontecer" é diferente de arquivo de "não vai acontecer mais").
8. ~~**Existe uma pessoa específica que decide arquitetura, ou as três decidem juntas?**~~
   **RESPONDIDO: os três juntos (Allekka, bmchad, RicardoMoussalli).** Vale registrar: as
   perguntas 2, 3 e 7 acima já foram decisões tomadas dessa forma. Se alguma delas foi
   respondida por só uma pessoa nesta conversa, vale confirmar com as outras duas antes de
   executar — eu não tenho como saber quem exatamente está do outro lado do teclado agora.
   não uma decisão técnica minha.
