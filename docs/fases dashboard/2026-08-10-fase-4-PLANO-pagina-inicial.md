# PLANO — Fase 4: Página Inicial (dashboard de cards)

> **Este documento é um plano, não um registro de execução.** Ele existe para ser
> validado pela equipe *antes* de qualquer código. Quando a fase for executada, o
> resumo estruturado no formato do `README.md` desta pasta entra num arquivo
> irmão, sem "PLANO" no nome.

**Branch:** `feat/pagina-inicial-dashboard` (a partir de `plataforma` em `6886787`)
**Data:** 2026-08-10

---

## 0. A frase que resume o plano

A Página Inicial é uma aba nova que **lê cards que já existem** e os manda executar
pela Edge Function `dashboard-execute`, **que já está escrita e no ar**. Nenhuma
linha do chat, do executor Python ou do interpretador de Query Plan é alterada.

---

## 1. Ponto de partida — o que já existe (verificado no código, 2026-08-10)

O dashboard não está pela metade. Ele está inteiro, **menos a tela**.

| Peça | Onde | Estado |
|---|---|---|
| Tabelas `dashboard_cards` + `dashboard_card_snapshots` | `supabase/migrations/20260806230000_dashboard_cards.sql` | Completa: RLS, índices, cache por impressão digital de permissão |
| Edge Function que executa os cards | `supabase/functions/dashboard-execute/index.ts` (331 l.) | Escrita inteira, deploy automático, usa os mesmos 5 segredos do chat |
| Motor de cálculo (Lambda) | `query_engine/` | Em produção. Aceita **vários planos numa chamada só** — desenhado em lote justamente para o dashboard |
| RBAC de coluna + assinatura | `supabase/functions/_shared/query_plan.ts` | Testado por vitest (46 testes verdes) |
| Sistema de design do card | `DESIGN.md` §5–§10 | Anatomia, estados, paleta, grade responsiva, lista de reprovação |
| `recharts` + `src/components/ui/chart.tsx` | `package.json:63` | Já instalado, nunca usado |

**O que falta, e só isso:**

1. Nenhuma rota mostra `dashboard_cards`. `App.tsx` tem `/`, `/auth`, `/dashboard`,
   `/cfgdatabase`, `/plum` — nenhuma lê a tabela.
2. `dashboard_cards` e `dashboard_card_snapshots` **não estão em
   `src/integrations/supabase/types.ts`**. Hoje um `supabase.from('dashboard_cards')`
   quebra o typecheck.
3. Não existe tela de criar card. Hoje só via `INSERT` manual
   (`infra/aws/PASSO-A-PASSO.md` §6.3).
4. **`dashboard-execute` nunca foi invocada uma única vez.** Zero referências no
   front. O motor está no ar e nunca girou.

---

## 2. Princípio de isolamento — o que esta fase NÃO toca

Esta é a razão de existir da branch separada. A fase inteira é **aditiva**.

**Zero linhas alteradas em:**

- `supabase/functions/ai-plum-chat/index.ts` — o chat que acabou de funcionar
- `src/pages/PlumChat.tsx`
- `supabase/functions/_shared/query_plan.ts` — só é *importado*, nunca editado
- `query_engine/**` — o executor Python
- `infra/aws/**` — nenhum provisionamento novo, nenhum segredo novo
- **Nenhuma migration nova.** O banco já tem tudo.

**A única exceção, consciente e escrita:**
`supabase/functions/dashboard-execute/index.ts` ganha **um** campo opcional no
corpo, `force?: boolean`, que pula a busca de snapshot (~3 linhas aditivas). Sem
isso o botão ⟳ da Etapa 5 é literalmente inimplementável: a função só aceita
`{ dataset_id, card_ids }` (`:115`) e o navegador não pode apagar snapshot — a
tabela não tem policy de DELETE para `authenticated`, de propósito.

Por que esta exceção é segura, e por que ela **não** enfraquece o princípio: esta
função **não é chamada por ninguém hoje** — zero referências no front, verificado
por grep. Alterá-la não tem como quebrar um fluxo de usuário, porque nenhum fluxo
de usuário chega nela. É o oposto de mexer no chat.

**Arquivos existentes tocados, e quanto:**

| Arquivo | Mudança | Quando |
|---|---|---|
| `src/App.tsx` | +2 linhas (import + `<Route>`) | Etapa 2 |
| `src/integrations/supabase/types.ts` | +2 blocos de tabela | Etapa 1 |
| `src/layouts/DashboardLayout.tsx` | +6 linhas (item de menu) | **Só depois da §8 passar** — ver 2.3 |
| `DESIGN.md` | remove o 5º estado do card | Etapa 3 |
| `supabase/functions/dashboard-execute/index.ts` | +3 linhas (`force?: boolean`) | Etapa 5 — exceção justificada abaixo |

Todo o resto são **arquivos novos**.

### 2.1 Manter a branch em dia — olhar antes de mexer

A branch fica velha rápido: Allekka e bmchad empurraram commits para `plataforma`
**no mesmo dia** em que esta fase começou.

Antes da regra, o que precisa estar claro para ninguém ter medo dela:

- `git merge origin/plataforma` traz commits **para dentro desta branch**.
  `plataforma` **não é alterada** — é leitura de lá, escrita aqui. Este comando não
  tem como estragar o que o time está usando.
- O que queimou o projeto em 2026-08 não foi merge, foi **merge acumulado**:
  semanas de divergência resolvidas de uma vez, sem contexto, sob pressão. É assim
  que arquivo some. Merge frequente é o remédio, não a doença.
- **Existe desfazer total:** `git merge --abort` devolve tudo ao estado anterior,
  desde que a árvore esteja limpa antes (`git status` sem pendências).

**A regra — dois comandos que não alteram nada, e só então decidir:**

```sh
git fetch origin
git log --oneline HEAD..origin/plataforma --name-only
```

Isso só *lista* o que entrou e quais arquivos foram tocados. Esta fase compartilha
**três** arquivos com o resto do time: `src/App.tsx`,
`src/integrations/supabase/types.ts` e — só na Etapa 6 —
`src/layouts/DashboardLayout.tsx`.

- **Nenhum dos três na lista** → o merge é sem conflito por construção. Carimbo.
- **Algum dos três apareceu** → aí sim vale merge com atenção, sabendo de antemão
  qual arquivo vai brigar. Se complicar, `git merge --abort` e resolve com calma.

Melhor do que uma cadência fixa: assim ninguém dá merge no escuro, e ninguém adia
merge por medo.

### 2.2 As Edge Functions não deployam desta branch

Detalhe operacional que trava a Etapa 4 se ninguém souber: a integração
GitHub↔Supabase publica `supabase/functions/**` automaticamente, mas **só a partir
do branch `plataforma`**. Enquanto o trabalho estiver em
`feat/pagina-inicial-dashboard`, `dashboard-agent` **nunca chega ao ar sozinho** —
e o D.O.D. da Etapa 4 exige testá-la.

O mesmo vale para `dashboard-execute`, que ganha o `force?` na Etapa 5: sem deploy
manual, o botão ⟳ também não tem como ser testado.

**Durante o desenvolvimento, publicar à mão:**

```bash
npx supabase functions deploy dashboard-agent   --project-ref rjwidarrsykufuifzunu  # Etapa 4
npx supabase functions deploy dashboard-execute --project-ref rjwidarrsykufuifzunu  # Etapa 5
```

Os dois são seguros, por motivos diferentes: `dashboard-agent` é função **nova** —
enquanto nada a chama, existe em produção sem efeito. `dashboard-execute` já existe,
mas **ninguém a chama** (zero referências no front), e a mudança é um campo opcional
que, ausente, mantém o comportamento atual byte a byte. O deploy automático assume
sozinho no merge.

### 2.3 A válvula de rollback: a rota nasce sem link

O front é um bundle único na Vercel. No instante do merge, tudo que existe fica
visível para todo mundo, e desligar significa reverter o merge.

**Decisão:** a rota `/inicio` entra funcionando, mas **o item da sidebar não**.
Quem sabe a URL testa; nenhum usuário comum encontra a aba. O link é um commit de
uma linha em `DashboardLayout.tsx`, aplicado **só depois** da bateria da §8 passar.

Dois momentos, ambos reversíveis, e o segundo é reversível por `git revert` de um
commit de uma linha — não de uma fase inteira.

---

## 3. Decisões — todas resolvidas em 2026-08-10

### D1 — Onde nasce um card? · **RESOLVIDO: opção (a)**

| Opção | Toca o chat? | |
|---|---|---|
| **(a) Só na Página Inicial**: botão "Novo card" → a pessoa digita a pergunta ali → agente novo gera o card | **Não** | **Recomendada** |
| (b) No chat: botão "📌 Fixar no dashboard" sob a resposta, reaproveitando o plano do Agente A | Sim (`PlumChat.tsx`) | Depois, se fizer falta |
| (c) `if (pergunta contém "dashboard")` no chat, roteando para outra função | Sim | Não recomendada — ver abaixo |

**Por que (a):** é a única que respeita as três restrições ao mesmo tempo — não
reutilizar os agentes existentes (orientação do gerente), não encostar no chat que
acabou de estabilizar, e manter card fixo e pergunta livre como dois produtos
diferentes (decisão já registrada em `organizar_tudo.md` §6, pergunta 2).

**Por que não (c):** a proposta de roteamento por palavra-chave funciona como MVP e
é honestamente de baixo risco, mas (i) é frágil — "monta um gráfico do faturamento
por mês" não contém "dashboard" e cai no chat; (ii) este projeto **já tem uma dívida
ativa causada por decidir comportamento com keyword-match em texto livre**
(`query_engine/urgent.md`, citada em `CLAUDE.md` §8); (iii) se o dashboard tem aba
própria, o clique já declara a intenção — palavra mágica escondida no chat é pior
UX que um botão.

**A opção (a) gera gráfico a partir da pergunta, igual à (b).** A diferença entre as
duas é *onde a pessoa digita*, não o que sai do agente.

### D1b — O card é publicado direto? · **RESOLVIDO: prévia com número real, depois "Publicar"**

Isso importa por causa da D4: o card vai para a página inicial **de toda a
organização**, e se re-executa sozinho para sempre. Um card errado não é um erro
particular. Somado ao risco R4 (agente inventando nome de coluna), publicar direto
é publicar erro por padrão.

Fluxo: a pessoa digita a pergunta → o agente devolve o card → **a prévia executa o
plano e mostra o número/gráfico real** → só então o botão "Publicar" grava em
`dashboard_cards`. Enquanto não publicar, nada é salvo e ninguém mais vê.

**Consequência técnica que muda o tamanho da Etapa 4:** `dashboard-execute` só
executa card **já salvo** — ela busca na tabela por `dataset_id`. A prévia de um
card não-salvo não passa por ela. Então `dashboard-agent` ganha uma **segunda
ação**, que executa um plano avulso.

Isso NÃO duplica trava de segurança: `authorizePlan`, `signPayload` e
`formattingRulesFromSchema` continuam vindo de `_shared/query_plan.ts`. O que se
repete é encanamento (buscar perfil, resolver `allowed_columns`, montar o payload),
exatamente o mesmo arranjo que já existe entre `dashboard-execute` e `ai-plum-chat`
— é precedente do repositório, não exceção nova. Nenhum segredo novo é necessário:
`supabase secrets` é por projeto, a função nova já enxerga as cinco variáveis do
executor.

Alternativa mais barata, se a equipe quiser cortar escopo: prévia **sem** número,
mostrando em português o que o agente entendeu ("vou somar `faturamento` por `mes`,
filtrando `regiao = Sul`"). Custa quase nada e já pega coluna inventada, porque os
nomes aparecem no texto. Perde a conferência do valor.

### D2 — Quais tipos de gráfico entram no MVP? · **RESOLVIDO: `kpi` + `bar`**

O `CHECK` da tabela já fecha o enum: `kpi`, `line`, `bar`, `stacked_bar`, `meter`,
`table`. **Recomendação: `kpi` + `bar` na primeira entrega**, os outros depois.
`kpi` é o caso mais comum e o mais fácil de acertar; `bar` prova que o caminho de
`group_by` funciona ponta a ponta.

### D3 — A rota `/dashboard` muda de nome? · **RESOLVIDO: fica para depois, registrado em `TODOS.md` #10**

Hoje `/dashboard` é **gestão de organização** (membros, cargos, aprovações — 1007
linhas), não dashboard de dados. O nome engana. **Recomendação: não renomear
agora.** `Auth.tsx` redireciona para `/dashboard` em 3 lugares (`:90`, `:111`,
`:244`) e um deles é o callback do SSO — mexer ali é exatamente o tipo de coisa que
quebra login. A Página Inicial entra em `/inicio` e o rename fica para depois.
Para não se perder, virou item **#10 do `TODOS.md`**, com os três lugares que
precisam mudar juntos.

### D4 — Quem vê o quê · **RESOLVIDO, com um limite conhecido e aceito**

Pergunta feita na validação: *"cada membro só vê os cards das colunas que o cargo
dele acessa, né?"* — **Não exatamente, e a diferença importa.**

Do jeito que o banco e a Edge Function estão construídos hoje:

| | Quem vê |
|---|---|
| **Existência e título do card** | **Todo membro ativo da organização.** A RLS de `dashboard_cards` filtra por `organization_id` + `is_active_member()`, e nada mais |
| **O número dentro do card** | Só quem tem **todas** as colunas do plano liberadas no cargo. Sem isso, `dashboard-execute` devolve `status: "forbidden"` e a tela mostra o card sem valor nenhum, com a frase "Seu cargo nao tem acesso a uma das colunas deste card" |

Ou seja: **o número está protegido, o título não.** Um card chamado "Salário médio
por cargo" é lido por toda a organização, mesmo por quem nunca verá o valor.

Esconder o card inteiro no front é uma linha de código, mas seria **cosmético e não
segurança**: o título já viajou para o navegador na consulta a `dashboard_cards`.
Esconder de verdade exige filtragem no servidor — migration nova, fora do escopo.

**Decisão para o MVP:** aceitar o limite e **escrevê-lo**, em vez de fingir que
está resolvido. Título de card é público dentro da organização; quem cria card não
põe segredo no título. Se algum cliente exigir mais que isso, vira migration
própria e uma fase própria.

**E o limite para por aí, de propósito:** a coluna `origin_question` guardaria a
pergunta original em texto livre, sob a mesma RLS. Ela **não será gravada** nesta
fase (ver Etapa 4, trava 5). Título a pessoa escolhe; pergunta ela digita sem
pensar — ampliar o vazamento de um para o outro seria decidir por descuido o que a
D4 decidiu com cuidado.

### D5 — "Tempo real" · **RESOLVIDO: cache mantido, idade sempre visível**

Levantado na revisão do bmchad: *"o dashboard tem que ser em tempo real"*. Hoje ele
**não é, de propósito** — e a diferença precisa ser combinada agora, não descoberta
com a tela pronta.

Um número exibido pode ter até ~15 min de idade por **duas** camadas somadas: o TTL
do snapshot (`refresh_interval_minutes`, padrão 15) e o cache de dados dentro do
Lambda (`query_engine/cache.py`, 15 min, decisão registrada em `TODOS.md` #1).

Isso não é feature faltando: é a cota de **60 requisições por minuto** da API do
Google Sheets. Se cada carregamento fosse ao vivo, seis pessoas abrindo o dashboard
ao mesmo tempo estourariam a cota — é a invariante "um `batchGet` por dataset, não
por pergunta/card" do `CLAUDE.md` §5.

**Decisão:** manter o cache e **tornar a idade visível o tempo todo**. O card mostra
`● calculado há X min` sempre, não só no estado degradado, e o ⟳ existe para quem
precisa do número agora. Expectativa vira informação na tela, em vez de surpresa.

Isso muda um detalhe do `DESIGN.md` §6, onde a pílula de idade aparece só no estado
degradado — o ajuste entra junto com a correção do 5º estado, na Etapa 3.

### D6 — Uma pergunta gera quantos cards? · **RESOLVIDO: um**

Também da revisão do bmchad: *"faça um dashboard do faturamento"* sugere vários
cards de uma vez. Nesta fase, **uma pergunta gera um card**.

Motivo: uma pergunta com `group_by` sobre coluna categórica já rende um gráfico de
N barras — "faturamento por loja", "por categoria", "por vendedor" (ver 4.1). Quem
quiser mais cards faz mais perguntas.

⚠️ **Atenção ao exemplo:** *"faturamento por mês"* especificamente **não** funciona
hoje, por falta de agrupamento por período — ver D7. O caso do bmchad é justamente o
que o MVP não cobre, e a resposta para ele não é "um card por mês", é "essa é a
próxima fase".

O modo "monta o dashboard inteiro" é atraente e a execução em lote **já existe** no
motor, mas o custo está no agente e na UI da prévia, e inflaria a Etapa 4 sem
necessidade agora. Fica no fora de escopo, com a nota de que a parte cara já está
pronta.

### D7 — Agrupar por período · **RESOLVIDO: fora do MVP, vira fase própria**

Consequência direta da 4.1: o executor não agrupa por mês/semana/trimestre, porque
não deriva parte de data. **Os cards do MVP agrupam só por coluna categórica que
existe** — loja, categoria, vendedor, forma de pagamento, status.

Não esconder isso é parte da decisão: "faturamento por mês" é provavelmente o card
mais pedido de qualquer dashboard, então a limitação precisa estar escrita, e não
descoberta pelo primeiro usuário.

**Escopo real da fase seguinte, para ela não ser subestimada de novo:**

1. `query_engine/pandas_executor.py` — aceitar `{"col": ..., "trunc": "month"}` em
   `group_by`, com `dt.to_period` e teste
2. `supabase/functions/_shared/query_plan.ts` — `addCol` precisa passar a extrair a
   coluna da forma objeto. **Sem isso é bypass de RBAC**, não bug de feature
3. Prompt do Agente A — ensinar a forma nova, sem quebrar a antiga
4. Testes dos dois lados; `query_plan.test.ts` ganha caso de `group_by` em objeto

**Enquanto isso, a saída de emergência que funciona hoje:** um card com `where`
filtrando um intervalo de datas ("faturamento de março") é plenamente suportado — o
filtro por data funciona, é o que a Fase 3 consertou. O que não funciona é *agrupar*
por período numa tacada.

---

## 4. Como o fluxo funciona

```
  Página Inicial (/inicio)
        │
        │  1 chamada, com o dataset e a lista de cards
        ▼
  dashboard-execute  ← JÁ EXISTE (+ `force?`, única exceção da §2)
        │   • JWT → perfil ativo → cargo
        │   • o dataset é desta organização?
        │   • allowed_columns do cargo
        │   • authorizePlan() por card  ─── recusa, nunca filtra em silêncio
        │   • snapshot fresco no TTL? devolve sem sair daqui
        ▼
  Lambda (query_engine)  ← JÁ EXISTE, não muda
        │   um batchGet no Sheets para TODOS os cards de uma vez
        ▼
  snapshot gravado (service role) → tela
```

**Degradação já implementada e de graça:** se o executor cair, cada card sem
resultado busca o último snapshot **ignorando o TTL** e volta com `status: "stale"`
e o `computed_at`. A tela mostra o número com um selo de idade, nunca um erro
vermelho. Isso é `dashboard-execute:301-328`, já escrito.

### 4.1 O que o `group_by` faz e o que ele NÃO faz

Levantado por bmchad na revisão (2026-08-10):

> *"faturamento por mês… não teria como usar só 1 arquivo json, teriam que ser 12
> arquivos, 12 requisições, e cada resposta como uma parte do dashboard… o que
> comprometeria o chat"*

**Ele está certo na primeira metade, e a primeira versão desta seção estava errada.**
Vale registrar as duas coisas separadamente, porque a diferença entre elas decide
trabalho.

#### O que funciona hoje: agrupar por coluna que existe

```json
{ "select": [{"expr": {"agg": "sum", "col": "valor_total"}, "as": "total"}],
  "group_by": ["loja_filial"] }
```

Um plano, uma chamada, N linhas na resposta. Mecanismo:
`pandas_executor.py:332` (`df.groupby(gb_cols, dropna=False)`), desde a Fase 0, com
teste (`query_engine/tests/test_formas_de_plano.py`). É a forma do card de exemplo
do roteiro de infra (`PASSO-A-PASSO.md` §6.3, `group_by: ["regiao"]`).

#### O que NÃO funciona: agrupar por período

**Não existe extração de parte de data no executor.** Verificado: nenhum
`.dt.month`, `to_period`, `resample` ou `trunc` em `pandas_executor.py` — a linha
436 só formata a saída como `%d/%m/%Y`, e a 680 é a conversão do tipo `ano`.
`group_by` opera sobre coluna existente, e coluna ausente levanta
`MissingColumnError` de propósito (`:198-201`).

Na base sintética existe `Data da Venda` (`05/01/2026`) e **não existe** `mes`.
Logo:

| Plano | Resultado real |
|---|---|
| `group_by: ["mes"]` | **Erro** — a coluna não existe |
| `group_by: ["data_da_venda"]` | Agrupa **por dia**: 20 grupos na base sintética, ~250 num ano. Não é "por mês" |

**"Faturamento por mês" não é expressável em um plano só hoje.** A versão anterior
desta seção pressupunha uma coluna `mes` que não existe. O que vale é: agrupar por
coluna **categórica que existe** (loja, categoria, vendedor, forma de pagamento)
funciona; agrupar por período, não.

#### Onde a conclusão dele não segue: 12 planos ≠ 12 requisições

O corpo enviado ao Lambda tem `plans` como **array**, e o executor foi construído
para lote:

| Onde | O que faz |
|---|---|
| `main.py:114` | itera sobre `payload.plans`, que é array |
| `main.py:135-143` | **uma** leitura do Sheets, para a **união** das colunas de todos os cards aprovados |
| `main.py:163` | roda cada plano contra o **mesmo** DataFrame já em memória |

Doze planos cabem numa chamada, com um `batchGet` só. **Nada disso exige alterar o
executor, então o chat não é afetado** — ele continua mandando `plans` com um item.
Também não há necessidade de um segundo Lambda.

O que a saída de doze planos custa, e não foi mencionado: cada plano tem seu
`card_id`, então doze planos são **doze cards**, não um gráfico de doze barras.
Juntá-los num gráfico é lógica nova. E não escala — "por semana" viraria 52, "por
dia" 365.

#### Por que o conserto certo é fase própria, e não puxadinho

A saída limpa é bucketing de data:
`group_by: [{"col": "data_da_venda", "trunc": "month"}]`. Parece vinte linhas no
pandas. **Não é**, e o motivo é de segurança:

`_shared/query_plan.ts` extrai as colunas do `group_by` com `addCol(cols, c)`, e
`addCol` **ignora silenciosamente qualquer valor que não seja string**
(`query_plan.ts:51`). Um `group_by` em forma de objeto passaria pelo RBAC **sem a
coluna ser extraída**: o executor usaria a coluna, e a checagem de permissão nunca a
veria. É literalmente o cenário que o cabeçalho daquele arquivo descreve — *"quando
duas travas de segurança discordam, quem passa é a mais frouxa"*.

Bucketing de data exige, coordenados: `pandas_executor.py`, `_shared/query_plan.ts`
(a peça mais sensível do sistema, testada), o prompt do Agente A, e testes novos nos
dois lados. Ver D7.

---

## 5. Etapas, em ordem

Cada etapa tem um D.O.D. (*definition of done*) verificável. A regra: **nenhuma
etapa começa antes de a anterior estar verde.**

### Etapa −1 — Preparar o ambiente de teste (nenhuma linha de código) · P

**Vem antes de tudo, e não é burocracia:** sem isto, a Etapa 0 não tem contra o que
rodar, e a tentação é usar a base de um cliente — que é exatamente o que o princípio
da §8 proíbe. O ambiente de teste é pré-requisito da primeira etapa, não preparação
da última.

1. **Antes de subir qualquer coisa: pôr o Local da planilha em Brasil**
   (Arquivo → Configurações da planilha → Local). Em local dos Estados Unidos o
   Sheets lê `05/01/2026` como 1º de maio e grava o serial errado — dias de 1 a
   12 ficam com dia e mês trocados, de 13 em diante acerta por acidente. O
   Plum **não tem como perceber**: o serial gravado é legítimo, só aponta para
   o dia errado. Custou uma investigação inteira em 2026-08-11 (ver
   `TODOS.md` #12). O Local não reinterpreta o que já foi importado, então tem
   que ser antes.
2. Subir `testes/chat/bases/vendas_loja_roupas_teste.csv` para o Google Sheets (separador `;`; o
   arquivo tem BOM no cabeçalho — conferir se a primeira coluna importou como
   `Código do Pedido` e não com lixo na frente).
2. Compartilhar a planilha com
   `plum-polijunior@plataforma-plum.iam.gserviceaccount.com` como **Leitor**.
3. **Renomear a aba para `Sheet1`.** Descoberto na execução (2026-08-10): o front
   **nunca grava `google_sheet_tab`** — `DatabasePipeline.tsx` grava
   `google_sheet_id` e `google_sheet_url` e mais nada, então a coluna fica no
   default `'Sheet1'` do banco. Ao subir um CSV, o Sheets batiza a aba com o nome do
   arquivo, e o executor responde *"A aba 'Sheet1' nao existe nessa planilha"*.
   Bug de produção, não do teste: atinge todo Sheets em português (aba padrão
   "Página1") e todo CSV/XLSX importado. **Tem dono** — `origin/fix/gid-da-aba`,
   ainda não em `plataforma`. Aqui, renomear resolve.
4. Criar uma **organização nova, dedicada a teste** (decisão do furo #2), e passar a
   planilha pelo pipeline de importação normal (`/cfgdatabase`). Org nova, e não
   Babygoat/Machado Lmtd, por dois motivos: garante que nada nesta fase encosta em
   dado real, e dá um lugar limpo para criar o cargo sem permissão que a §8.2(4)
   precisa.

**D.O.D.:** a base aparece em `/cfgdatabase` com `status = 'active'` e a Etapa 0
completa sem erro.

⚠️ **A versão anterior deste D.O.D. exigia "o chat responde uma pergunta sobre ela",
e estava errada** — não por ser um teste ruim, mas por amarrar um portão da fase a
um serviço externo com **cota**. Em 2026-08-10 a cota do Gemini estourou no meio do
dia de testes e o chat parou de responder, o que teria bloqueado a fase inteira por
um motivo que nada tem a ver com dashboard.

A Etapa 0 prova exatamente as mesmas coisas — service account, `google_sheet_id`,
nome da aba, `allowed_columns` do Admin — e prova **melhor**, porque vai direto ao
executor sem três chamadas de LLM no meio. Testar pelo chat continua sendo bom, mas
é confirmação extra, nunca o portão.

### Etapa 0 — Provar que o motor gira (nenhuma linha de código) · P

O maior risco desta fase é construir tela em cima de uma função que nunca rodou.
Tudo aqui roda contra a base sintética da Etapa −1, nunca contra base de cliente.

1. Confirmar no SQL Editor que a migration do dashboard está aplicada:
   `select count(*) from public.dashboard_cards;`
2. Confirmar que a base sintética gravou `google_sheet_id` com o **ID puro**, não a
   URL completa (`CLAUDE.md` §8 registra pelo menos uma base em produção assim):
   `select id, name, google_sheet_id from public.datasets where status='active';`
3. Criar **um** card à mão pelo SQL (`infra/aws/PASSO-A-PASSO.md` §6.3), agrupando
   por uma coluna **categórica** — `Loja / Filial`, por exemplo. Não por data: ver
   D7.
4. Invocar `dashboard-execute` uma vez, sem front: no console do navegador com a
   sessão aberta, um `fetch` no endpoint da função com `{ dataset_id: "..." }` no
   corpo.

   ⚠️ **Mandar os dois cabeçalhos**, senão volta 401 que não é bug:
   `Authorization: Bearer <access_token do localStorage>` **e**
   `apikey: <anon key>`. O `supabase.functions.invoke` envia os dois por baixo dos
   panos; um `fetch` cru, não.

**D.O.D.:** a resposta traz `results[0].status === "ok"` com `columns` e `rows`
preenchidos.

**Antes de declarar falha, dois cuidados:**

1. **Tentar duas vezes.** O Lambda é imagem de container e o timeout da Edge
   Function é de 20 s (`EXECUTOR_TIMEOUT_MS`). Um *cold start* somado à leitura da
   planilha pode estourar isso na primeiríssima invocação e nunca mais.
2. **`forbidden` aqui pode não ter nada a ver com dashboard.** Era o mesmo sintoma
   investigado no chat — **resolvido em `6a15569`**, e por uma causa que ninguém
   tinha levantado: `order_by` sobre o **alias** do `select` era lido como coluna de
   origem. Se aparecer mesmo assim, o log do branch `forbidden`
   (`ai-plum-chat`, `89dba05`) diz exatamente qual coluna foi negada. **A fase só
   para se o problema for do caminho do dashboard.**

Nos demais casos de `error` ou 403, a fase para aqui e vira investigação — não se
escreve tela.

### Etapa 1 — `types.ts` · P

Adicionar `dashboard_cards` e `dashboard_card_snapshots` **à mão**.

⚠️ **Não rodar `supabase gen types`.** O arquivo foi editado à mão e tem comentários
explicativos (ex.: `types.ts:75-77`) que a regeneração apaga.

**D.O.D.:** `npm run build` verde.

### Etapa 2 — A aba existe · P

- `src/pages/Inicio.tsx` — arquivo novo, shell da página, estado vazio ("Nenhum
  card ainda") e o caso "seu cargo não tem acesso a nenhuma base", espelhando o que
  `PlumChat.tsx` já faz.
- `src/App.tsx` — rota `/inicio` dentro do `DashboardLayout`.
- `src/layouts/DashboardLayout.tsx` — **nada nesta etapa.** O item de menu é a
  válvula de rollback (2.3) e entra só depois da §8.

**D.O.D.:** `npm run build` verde; digitar `/inicio` na barra de endereço abre a
página; **a sidebar continua com três itens**; `/plum` e `/cfgdatabase` idênticos.

### Etapa 3 — Ler e exibir · M

- `src/hooks/use-dashboard-cards.ts` — arquivo novo. Segue o padrão de
  `PlumChat.tsx` para descobrir quais bases o cargo enxerga
  (`role_permissions` → `datasets`).

  ⚠️ **São DUAS leituras, não uma.** `dashboard-execute` devolve só
  `card_id, status, columns, rows, row_count, computed_at, error` — **não devolve
  `title` nem `viz`**. O hook lê `dashboard_cards` direto (a RLS permite: membro
  ativo da org) para pegar `title`, `viz`, `higher_is_better` e `position`, e casa
  com o resultado da Edge Function por `card_id` no cliente. Descobrir isso com a
  tela meio pronta custa caro.

- **Seletor de base no topo, uma base por vez** (decisão do furo #8).
  `dashboard-execute` recebe **um** `dataset_id` por chamada; com um dropdown igual
  ao do chat, é uma chamada só, e o código espelha `PlumChat.tsx:224-242`.

  ⚠️ **Copiar o padrão do chat, mas corrigindo dois defeitos dele no caminho** —
  senão a Página Inicial nasce com bug conhecido:

  1. **Desempatar bases de mesmo nome.** O dropdown do chat lista só `d.name`
     (`PlumChat.tsx:229-236`). Havendo duplicata de re-upload, não há como saber
     qual é qual — é exatamente a hipótese D da investigação aberta do chat.
     Mostrar data de criação (ou os 8 primeiros caracteres do `id`) quando dois
     nomes colidirem.
  2. **Não listar base sem coluna liberada.** `fetchDatasets` inclui a base sempre
     que existe linha em `role_permissions`, **mesmo com `allowed_columns = '{}'`**
     — e aí `dashboard-execute` responde **403 de corpo inteiro** (`:161-163`), não
     um card `forbidden`. Filtrar `allowed_columns` não-vazio na consulta.

- **Três respostas de erro que não são "card com erro"** e precisam de tratamento
  próprio na página, senão viram tela quebrada:

  | Resposta | Quando | O que mostrar |
  |---|---|---|
  | **403** corpo inteiro | cargo sem nenhuma coluna na base (`:161-163`) | Mensagem no lugar da grade, não card por card |
  | **409** | dataset sem `google_sheet_id` (`:132-137`) | "Esta base precisa ser reconectada", com link para `/cfgdatabase` |
  | `results: []` | a base não tem nenhum card | Estado vazio, não erro |
- `src/components/dashboard/CardDashboard.tsx` — arquivo novo. **Quatro** estados,
  conforme `DESIGN.md` §6: saudável, carregando (esqueleto de **altura uniforme**),
  degradado (número em peso total + pílula `● calculado há 3 h`, nunca vermelho) e
  erro (sem número nenhum, frase humana, link "Tentar de novo").
- `src/components/dashboard/VizKpi.tsx` e `VizBar.tsx` — arquivos novos.

**Dois acertos no `DESIGN.md`, ambos parte desta etapa:**

1. **O 5º estado ("Suprimido") não deve ser implementado.** Ele morreu com o
   k-anonimato em 2026-08-08 e `suppressed_groups` volta sempre `0`. Confirmado na
   revisão por quem removeu a regra do pandas (bmchad): estava barrando resultado
   demais.
2. **A pílula de idade passa a aparecer sempre**, não só no estado degradado —
   decisão D5. O `DESIGN.md` §6 hoje descreve o contrário.

**D.O.D.:** o card da Etapa 0 aparece na tela com o número correto; trocar de base
no seletor troca os cards; desligar a internet e recarregar mostra o estado
degradado, não um erro.

---

### 🛑 PARADA OBRIGATÓRIA — revisão visual, antes da Etapa 4

**A execução para aqui e não continua sem o "pode seguir".**

Este é o primeiro momento em que existe algo real para julgar: a página com cards
renderizando números de verdade. Antes disso era shell vazio; depois disso, o
diálogo de criação (Etapa 4) e os botões de gestão (Etapa 5) passam a ser
construídos **em cima** deste layout — e mudar o card depois custa mais.

**Como olhar, sem risco nenhum:**

```sh
npm run dev
```

e abrir `http://localhost:8080/inicio`. É a máquina de quem está revisando. Nada
publicado, nada em produção, nenhum outro usuário envolvido. Ajustar e olhar de
novo quantas vezes for preciso é o comportamento esperado aqui, não retrabalho.

**O que vale decidir nesta parada** (mudar agora é barato, depois não):

- Densidade e tamanho dos cards; qual é a figura herói
- Onde fica o seletor de base
- O texto dos estados vazio, degradado e de erro
- Se `kpi` e `bar` estão legíveis com os dados reais da base sintética

**O que NÃO se decide aqui:** as decisões D1–D7 já fechadas, e qualquer coisa da
lista de reprovação do `DESIGN.md` §10 — essa lista não é preferência, é regra.

### Etapa 4 — Criar card pela tela, com prévia · M/G

Cresceu com a D1b: a prévia precisa executar um plano que ainda não foi salvo.

- `supabase/functions/dashboard-agent/index.ts` — **Edge Function nova, pasta
  própria, prompt próprio**, com **duas ações**:
  - `gerar_card` — recebe `{ pergunta, schemaMetadata }`, devolve
    `{ title, viz, query_plan, higher_is_better }` (Gemini).
  - `executar_previa` — recebe `{ datasetId, plan }`, resolve `allowed_columns`,
    chama `authorizePlan`, assina e chama o Lambda. **Não grava nada.**

  Não importa nada de `ai-plum-chat`. A única coisa compartilhada é
  `_shared/query_plan.ts`, e só para *ler*.

**Custo desta escolha, registrado de propósito.** A ação `execute_plan` de
`ai-plum-chat` já faz exatamente isto e está em produção; reusá-la custaria zero
linha alterada no chat. A decisão foi **duplicar, pelo isolamento** — e o preço é
uma **terceira** cópia das checagens de autorização numa camada que a §8.3 admite
não ter teste nenhum. Duas cópias já existem (`dashboard-execute` e `execute_plan`),
e o risco de uma terceira é esquecer um check, não errar a assinatura.

**Por isso a cópia não é "escrever de novo": é transcrever, na mesma ordem.** As
cinco checagens, todas obrigatórias, todas antes de assinar qualquer payload:

1. JWT válido (`supabase.auth.getUser()` com o `Authorization` do chamador — cliente
   com a **anon key**, nunca service role: com service role um bug de filtro vira
   vazamento entre organizações em vez de resultado vazio)
2. `profile.organization_id` existe · `status === "ativo"` · `role_id` não nulo
3. O dataset pertence a essa organização (`.eq("organization_id", ...)`)
4. `allowed_columns` do par (cargo, dataset); vazio ⇒ recusa, **nunca** "tudo"
5. `authorizePlan(plan, allowedColumns)` ⇒ recusa o plano inteiro, nunca filtra
   coluna em silêncio

Referência literal para transcrever: `ai-plum-chat/index.ts:90-174`. Se alguma das
cinco não estiver no arquivo novo, a duplicação virou o buraco que ela deveria
evitar.
- `src/components/dashboard/NovoCardDialog.tsx` — arquivo novo. Pergunta →
  prévia → **Publicar**. Só o "Publicar" escreve em `dashboard_cards`.

**Publicar a função à mão durante o desenvolvimento** — ver 2.2. Sem isso a etapa
não tem como ser testada.

**Cinco travas antes de gravar, todas baratas e todas com bug garantido se faltarem:**

1. **Colunas existem?** Validar cada nome de coluna do `query_plan` contra
   `Object.keys(schema_metadata.columns)` e recusar com mensagem clara se algum não
   existir. Motivo na §6 (R4) — sem isso o erro que aparece é "seu cargo não pode
   ver", que é mentira e manda a pessoa investigar permissão em vez do plano.
2. **`viz` dentro do enum.** A tabela tem
   `CHECK (viz IN ('kpi','line','bar','stacked_bar','meter','table'))`. Se o agente
   devolver `"pie"` ou `"donut"`, o `INSERT` quebra no Postgres. Clampar no front
   para o par decidido na D2 (`kpi`/`bar`), com fallback em `kpi`.
3. **Campos que a RLS exige.** A policy de INSERT pede
   `organization_id = current_org_id()` **e** `is_active_member()` **e**
   `created_by = auth.uid()`. Esquecer o `created_by` faz o Postgres recusar sem
   dizer qual das três condições falhou — meia hora perdida, garantida.
4. **`position` explícito.** A coluna é `NOT NULL DEFAULT 0` e **não tem `UNIQUE`**.
   Se todo card nascer com 0, o `.order("position")` de `dashboard-execute:145`
   devolve ordem arbitrária, que muda entre carregamentos. Card novo entra no fim:
   `position = (max(position) da base) + 1`, calculado na hora do insert.
5. **Impedir publicação dupla.** Descoberto na execução da Etapa 0 (2026-08-10),
   rodando o `insert` duas vezes sem querer: **não existe `UNIQUE` em
   `dashboard_cards`**, então nada no banco impede dois cards idênticos na mesma
   base. Pelo diálogo isso é um clique a mais no "Publicar", ou um clique enquanto
   a prévia ainda está calculando. Desabilitar o botão durante a gravação, e não
   confiar no banco para isto.
6. **`origin_question` fica `NULL`** (decisão do ponto 8). A coluna guardaria a
   pergunta em texto livre — "quanto a cliente Maria Silva comprou" — sob a mesma
   RLS do título, ou seja, legível por todo membro ativo. A D4 aceitou o vazamento
   do **título**, que a pessoa escolhe; a pergunta ela digita sem pensar. Não gravar
   é de graça.

**D.O.D.:** criar um card pela interface, sem SQL; ver o número na prévia; fechar
sem publicar **não** deixa lixo em `dashboard_cards`; publicar faz o card aparecer
na grade.

### Etapa 5 — Gestão · P

Apagar card, reordenar (`position`), botão de recalcular (⟳) e **editar título e
tipo de gráfico** (decisão do furo #7).

**O ⟳ exige a exceção da §2:** `force?: boolean` em `dashboard-execute`, que pula a
consulta de snapshot e vai direto ao executor. Sem isso o botão devolveria o mesmo
número em cache e pareceria quebrado. É a única alteração de arquivo existente fora
do front nesta fase, e o motivo de ela ser segura está escrito na §2.

**Reordenar exige o esquema de `position`** definido na Etapa 4: sem `UNIQUE` e com
todos em 0, arrastar um card não tem efeito estável. Reordenar reescreve as posições
da base inteira em sequência (0,1,2,…), num `upsert` só.

A edição é deliberadamente leve: **a pergunta não se edita.** Se o cálculo está
errado, cria-se outro card e apaga-se o velho — regerar o `query_plan` reabriria
todo o caminho do agente e da prévia dentro de uma etapa marcada como pequena. O
que a edição cobre é o caso real: título ruim e gráfico errado.

Alvo de toque mínimo de 44px nos botões (`DESIGN.md` §9).

**D.O.D.:** os quatro funcionam; a RLS barra apagar ou editar card de outra pessoa
quando não se é Admin; trocar `bar` por `kpi` num card salvo não perde o
`query_plan`; o ⟳ muda o `computed_at` exibido.

⚠️ **Não ler este D.O.D. como "o banco protege os campos".** A policy de UPDATE só
valida `organization_id` no `WITH CHECK` — ela restringe **quem** edita, não **o
quê**. Nada no banco impede uma chamada de API de trocar o `query_plan` de um card.
Se isso importar, é trava de aplicação ou migration nova, e não existe hoje.

### Etapa 6 — Abrir a porta · P

**Só depois de a bateria da §8 passar inteira.** Um commit, uma linha: o item
"Página Inicial" entra na sidebar do `DashboardLayout.tsx`, primeiro da lista,
ícone `LayoutDashboard`.

É o segundo dos dois momentos reversíveis da 2.3. Se algo aparecer errado depois,
`git revert` deste commit tira a aba do caminho de todo mundo sem desfazer a fase.

**D.O.D.:** a aba aparece para um usuário comum e abre.

---

## 6. Riscos, e como cada um é contido

| | Risco | Contenção |
|---|---|---|
| **R1** | `dashboard-execute` nunca rodou; pode ter bug latente | Etapa 0 antes de qualquer tela. Custa ~30 min e zero código |
| **R2** | `google_sheet_id` guardando a URL completa em vez do ID (`CLAUDE.md` §8, não confirmado) | Item 2 da Etapa 0 |
| **R3** | A migration `20260806230000` pode não estar aplicada | Item 1 da Etapa 0. Sintoma silencioso: `dashboard_max_rows` ausente cai no fallback `200_000` sem erro nenhum |
| **R4** | **O agente novo inventa nome de coluna** — um card nasceria quebrado e o erro diria "seu cargo não pode ver", que é mentira | Validação de nomes no front antes de salvar (Etapa 4). Barato, e impede o card de nascer quebrado |
| **R5** | Base grande estourar o teto de linhas | Já tratado: `RowLimitExceeded` é checado **antes** do parse. O card mostra estado de erro com frase humana |
| **R6** | Alguém "consertar" o dashboard mexendo no chat | A branch separada + a §2 deste documento. Se um PR desta fase tocar `ai-plum-chat` ou `PlumChat.tsx`, é sinal de que saiu do plano |
| **R7** | **A branch envelhece e o merge vira o problema de 2026-08 de novo** — o time empurrou commits para `plataforma` no mesmo dia em que esta fase começou | 2.1: `fetch` + `log --name-only` **antes** de qualquer merge. Se nenhum dos três arquivos compartilhados aparecer, o merge é sem conflito por construção; se aparecer, já se sabe qual vai brigar. `git merge --abort` desfaz por completo |
| **R8** | A fase entra no ar de uma vez e não há como desligar | 2.3: a rota nasce sem link na sidebar. O link é a Etapa 6, um commit de uma linha, revertível sozinho |
| **R9** | O visual não agrada e a descoberta vem tarde, com Etapas 4 e 5 já construídas em cima | Parada obrigatória de revisão visual depois da Etapa 3, em `npm run dev` na máquina de quem revisa |
| **R10** | **A terceira cópia das checagens de autorização esquece um check** — custo assumido de duplicar `executar_previa` em vez de reusar `execute_plan` | Etapa 4: as cinco checagens estão listadas, na ordem, com o arquivo de referência para transcrever (`ai-plum-chat/index.ts:90-174`). A parte crítica (`authorizePlan`) continua vindo de `_shared/`, testada |
| **R11** | ~~A fase herda como bloqueio a investigação do `forbidden` do chat~~ — **resolvido em `6a15569`, antes da fase começar.** A causa não era nenhuma das hipóteses levantadas: o Agente A gerava `order_by` sobre o **alias** do próprio `select` (`{"col":"quantidade"}`, alias de um `count`), e `extractColumns` tratava alias como coluna de origem, negando a um Admin com tudo liberado | O conserto vive em `_shared/query_plan.ts`, que o dashboard **importa** — a fase herda a correção de graça. Mantido o log do branch `forbidden` (§8.2), que foi o que permitiu achar a causa |
| **R12** | **Alguém reconstruir o lote que já existe** — dividir cards em N requisições, ou criar um segundo Lambda "para não comprometer o chat" | 4.1, com os três pontos do código (`main.py:114`, `:135-143`, `:163`). O motor já recebe lista de planos e faz um `batchGet` só. Custo de não ter isto escrito: semanas reimplementando o que está pronto, mais um Lambda a operar |
| **R13** | Muitos cards numa base grande estourarem os 20 s de `EXECUTOR_TIMEOUT_MS` — uma leitura do Sheets mais N agregações no mesmo request | Não é bloqueio hoje (o MVP tem poucos cards), mas é o teto real desta arquitetura. Se aparecer, o sintoma é o estado degradado com selo de idade, não erro — e a saída é aumentar o timeout, não fatiar em N chamadas |
| **R14** | **Alguém pedir "por mês" e receber erro ou agrupamento por dia**, sem entender por quê | D7: a limitação está escrita e o MVP só oferece agrupamento por coluna categórica. O agente e a mensagem de erro precisam ser explícitos — "agrupar por período ainda não é suportado; posso filtrar um intervalo" é honesto; `MissingColumnError` cru não é |
| **R15** | Alguém "resolver o D7 rapidinho" mexendo só no `pandas_executor` | D7 lista os quatro pontos. O crítico é `_shared/query_plan.ts:51`: `addCol` ignora não-string, então `group_by` em objeto **passaria pelo RBAC sem a coluna ser extraída**. Meia solução aqui é bypass de permissão, não feature incompleta |
| **R16** | **A Etapa 0 usar base de cliente por não ter outra à mão** — e a fase inteira nascer violando o princípio da §8 | Etapa −1 é pré-requisito da Etapa 0, não preparação da §8. Sem ambiente de teste pronto, a fase não começa |
| **R17** | **A cota do Gemini estourar** — aconteceu em 2026-08-10, no meio do dia de testes, e derrubou o chat inteiro (HTTP 400 vindo de `ai-plum-chat:407`, que repassa o erro do Google) | Nenhum portão desta fase depende do Gemini (ver Etapa −1). E o dashboard **degrada melhor que o chat** aqui: só a *criação* de card usa LLM; card já publicado se re-executa sem IA nenhuma. Com a cota estourada, a Página Inicial continua mostrando números — o chat, não. Sintoma a reconhecer: guard funciona e a chamada seguinte dá 400 |

---

## 7. Checklist rápido, antes de abrir o PR

- [ ] `npm run build` verde
- [ ] `npm test` verde (46 testes — não devem mudar: esta fase não toca `_shared/`)
- [ ] `git diff plataforma --stat` **não lista** `ai-plum-chat/`, `PlumChat.tsx`,
      `query_plan.ts`, `query_engine/` nem nenhuma migration.
      `dashboard-execute/index.ts` **pode** aparecer, com ~3 linhas — é a exceção
      da §2. Mais que isso, ou qualquer outro arquivo, é sair do plano
- [ ] `git log --oneline HEAD..origin/plataforma --name-only` conferido; se algum
      dos três arquivos compartilhados apareceu, merge feito e resolvido (2.1)
- [ ] A parada de revisão visual depois da Etapa 3 aconteceu e teve "pode seguir"
- [ ] **Smoke test do chat**, que é o que não pode quebrar: uma pergunta conhecida
      da base sintética, ponta a ponta, com a resposta batendo com o gabarito de
      `testes/chat/teste-chat-vendas-roupas.md` §2. "Abri e pareceu ok" não conta
- [ ] A sidebar ainda **não** tem o item "Página Inicial" (ele é a Etapa 6, depois
      da §8 — ver 2.3)
- [ ] Página Inicial com um card `kpi` e um `bar` batendo com o gabarito **da base
      sintética** (`testes/chat/teste-chat-vendas-roupas.md` §2) — nunca conferindo contra a
      planilha de um cliente; o porquê está na §8
- [ ] Um cargo não-Admin, sem uma das colunas do card, vê `forbidden` e não o número
      (o título aparece — é o limite aceito na D4, não um bug)
- [ ] Abrir o diálogo de novo card, ver a prévia e fechar sem publicar não cria
      linha em `dashboard_cards`
- [ ] Nenhum item da lista de reprovação do `DESIGN.md` §10 na tela nova

A bateria completa, com as seis afirmações de privacidade, é a **§8** — esta lista
aqui é só o portão mínimo do PR.

---

## 8. Verificação e testes ao final da implantação

### O princípio que organiza tudo aqui

> **Conferência de valor se faz em base sintética. Em base de cliente, verifica-se
> mecanismo — nunca valor.**

Abrir a planilha de um cliente para conferir se o card somou certo é, ele próprio,
um acesso a dado pessoal. Se a equipe precisa ler a base do cliente para saber se o
produto funciona, o produto não é auditável. Então a bateria de conferência roda
contra uma base **fabricada**, com gabarito conhecido, e a verificação em produção
prova só que o mecanismo executou e não vazou. **Quem confere se o número da base
real está certo é o cliente**, que é o dono do dado.

### 8.1 Verificação funcional — base sintética, gabarito conhecido

**Fixture já existe no repositório**, commitado hoje pelo Allekka em `c564b95`:

| Arquivo | O que é |
|---|---|
| `testes/chat/bases/vendas_loja_roupas_teste.csv` | 40 linhas, 19 colunas. Tem `Cliente`, `CPF`, `Vendedor(a)`, moeda em `R$`, percentual em `Desconto (%)`, data `DD/MM/AAAA`. **Dado fabricado que parece real** — exercita os caminhos de privacidade sem nenhuma pessoa real |
| `testes/chat/teste-chat-vendas-roupas.md` §2 | Os números de referência conferidos à mão |
| `testes/chat/bases/tabela-de-estudos.csv` | Base oposta: quase nenhuma coluna numérica. Boa para testar o que o produto **recusa** |

**Preparação: já feita na Etapa −1.** O executor lê **Google Sheets por ID**, não
CSV — subir a planilha, compartilhar com a service account e criar a organização de
teste são pré-requisito da Etapa 0, não desta seção. Se a §8 for executada por
alguém que não fez a fase, começar por lá.

**Procedimento:** criar cinco cards nessa base, cada um provando uma coisa
diferente:

| # | Card | Prova |
|---|---|---|
| 1 | `kpi` — soma de `Valor Total` | O caminho básico bate com o gabarito |
| 2 | `bar` — `Valor Total` por `Loja / Filial` | `group_by` ponta a ponta |
| 3 | `kpi` — soma de `Desconto (%)` | O executor troca `sum` por `avg` sozinho: somar percentual não significa nada |
| 4 | `kpi` — soma de `Valor Total` com `where` no intervalo **12–16/01** = **R$ 2.387,92** | Conversão de data serial do Sheets, o bug que custou a Fase 3 |
| 5 | Um card pedindo a lista de pedidos | **Tem que falhar** com `RawRowsBlocked`. Se voltar dado, é o achado mais grave possível |

⚠️ **Dois cuidados no card 4, os dois descobertos conferindo o CSV:**

1. **Não pode ser "vendas de janeiro".** A base tem 20 datas distintas e **todas são
   de janeiro/2026**, então um filtro de "mês = janeiro" devolve a base inteira — um
   filtro **silenciosamente ignorado passaria no teste**, que é exatamente a falha
   que ele deveria pegar (mesma classe do bug corrigido em `c564b95`). O recorte
   precisa ser mais estreito que a base: 12–16/01 vale R$ 2.387,92 dos R$ 9.229,27
   totais (`testes/chat/teste-chat-vendas-roupas.md:118-126`).
2. **Nem pode ser um `bar` "por semana".** Agrupar por período não existe (4.1 e
   D7). Tem que ser `kpi` com `where` no intervalo — o filtro por data funciona; o
   agrupamento por data, não.

**D.O.D.:** cards 1 a 4 batem com o gabarito de `testes/chat/teste-chat-vendas-roupas.md`; o 5
falha. Divergência num dos quatro é bug do Plum, não do gabarito — o gabarito foi
conferido à mão antes.

### 8.2 Verificação de privacidade — as seis afirmações e como provar cada uma

Cada linha é uma afirmação que o produto faz. Uma afirmação que não tem como ser
verificada não deve ser feita.

**(1) Nenhuma linha bruta chega ao navegador.**
DevTools → Network → resposta de `dashboard-execute`. Conferir que `rows` só contém
as colunas do `group_by` e os aliases do `select`, e que o número de linhas é o
número de grupos — nunca 40. O card 5 da 8.1 é o teste negativo.

**(2) Nenhuma linha bruta chega ao LLM.**
`dashboard-agent` recebe só `{ pergunta, schemaMetadata }`. Verificado no código
que `schema_metadata` guarda apenas `semantic_definition` e `formatting_rule` por
coluna (`DatabasePipeline.tsx:422-430`) — **nenhuma amostra de dado**.

⚠️ **Ressalva que precisa estar escrita, e não pode sumir daqui:** o pipeline de
**importação** (`ai-agents`) envia **5 linhas reais** da planilha para o Gemini —
`TODOS.md` #6, item aberto, com outro dono. Portanto "a IA nunca lê seus dados" é
verdadeiro para o dashboard e para o chat, e **falso para o onboarding**. A frase
não vai para contrato ou proposta sem essa qualificação.

**(3) Nenhum dado pessoal nos logs.**
Este é o item que mais rende, porque o teste é exato: os CPFs da base sintética são
conhecidos. Depois de rodar a bateria da 8.1, procurar por `123.456.789-01` (e por
`Maria Silva`) em: Supabase → Edge Functions → logs de `dashboard-agent`; AWS →
CloudWatch → log group do Lambda. **Zero ocorrências.**

Três pontos já identificados no código atual que merecem atenção nessa busca:

- `query_engine/pandas_executor.py:473-476` loga o **nó de filtro inteiro** (`%r` do
  `node`) quando um `and`/`or` vem sem operandos. Esse nó carrega os *valores* do
  filtro: uma pergunta como "quanto a cliente Maria Silva comprou" põe o nome no
  CloudWatch. Caminho estreito (só no erro), mas é dado pessoal em log.
- `query_engine/main.py:211` usa `logger.exception` — um traceback de pandas pode
  arrastar valor de célula junto.
- `ai-plum-chat/index.ts:223` já loga o resultado agregado inteiro. Agregado por
  vendedor ou por cliente **nomeia pessoas**. O `dashboard-agent` novo não deve
  copiar esse padrão sem decisão: logar só **forma** (status, contagem de linhas,
  nomes de coluna), nunca `rows`.

**E se a busca por CPF der positivo?** Precisa estar decidido antes, senão a
bateria encontra um defeito que a §2 proíbe consertar e a fase trava sem regra:

| Onde apareceu | O que fazer |
|---|---|
| Em `dashboard-agent` (código novo desta fase) | **Conserta na hora.** É código nosso, é escopo |
| Em `query_engine/**` ou `ai-plum-chat` | **Não conserta aqui.** Vira item do `TODOS.md`, com o log exato e o caminho que o produziu. Mexer neles é a linha que esta fase não cruza — e um achado registrado com evidência vale mais que um conserto apressado numa branch de dashboard |

O único caso que **para** a fase é dado pessoal saindo pelo caminho novo — grade,
prévia ou `dashboard-agent`. O resto é dívida documentada, não bloqueio.

**(4) O RBAC de coluna realmente barra.**
Criar um cargo de teste sem `Valor Total`, entrar com ele e conferir que o card 1
volta `forbidden`, sem número na tela e sem número na resposta da rede.

**Sobre `forbidden` para um Admin — a leitura correta, sem a certeza demais que
esta seção teve numa versão anterior.** Nos dois caminhos que escrevem a permissão
do Admin (`DatabasePipeline.tsx:460` e a migration de backfill), `allowed_columns`
nasce como o conjunto de chaves de `schema_metadata.columns`. Mas essa igualdade
**pode ser quebrada depois**, por pelo menos dois caminhos conhecidos:

- **Editar o schema não atualiza a permissão.** `Cfgdatabase.tsx:360` e `:421` dão
  `update` em `schema_metadata` **sem tocar** em `role_permissions`. Renomear ou
  acrescentar coluna pela tela de bases desalinha os dois conjuntos.
- **Dataset duplicado** — hipótese D, ainda aberta em
  `investigacao-rbac-admin-colunas-negadas.md`.

- **`order_by` sobre alias do `select`** — foi esta a causa real do caso do chat,
  resolvida em `6a15569`: `{"col":"quantidade"}` referenciando o alias de um
  `count` era lido como coluna de origem. Já corrigido em `_shared/query_plan.ts`,
  que o dashboard importa.

Então `forbidden` para Admin é **sinal forte** de coluna inventada pelo agente, e
não prova. A conclusão só se fecha comparando as colunas negadas com as chaves do
`schema_metadata` **daquele** `dataset_id` — que é o que o log torna possível em
minutos.

**Por isso o branch `forbidden` do `dashboard-agent` loga desde o primeiro dia**:
`datasetId`, `roleId`, colunas necessárias e colunas negadas — **só nomes, nunca
valores**, compatível com o item (3) acima. É a informação que faltou no chat e que
transformou uma pergunta de cinco minutos em uma investigação de dois dias.

**(5) O que fica persistido, e onde.**
Depois da bateria, abrir um `dashboard_card_snapshots.payload` no SQL Editor e
confirmar que ali só há **agregados**, sob RLS por organização + digital de
permissão. Nenhuma linha bruta em disco — é a premissa P1.2, e este é o teste dela.

**(6) O único lugar onde linha bruta sobrevive à requisição.**
Cache de 15 minutos na **memória** do processo Lambda (`query_engine/cache.py`,
decisão consciente registrada em `TODOS.md` #1). Não é disco, mas estende a vida do
dado de "uma requisição" para "quinze minutos", e por isso precisa estar no material
comercial. Nada a testar aqui — a verificação é que a afirmação existe e está certa.

### 8.3 O que fica automatizado, e o que não fica

- `npm test` (46 testes) continua sendo a rede de `authorizePlan`,
  `permissionsFingerprint` e `signPayload` — e esta fase **não muda nenhum deles**.
- **Lacuna honesta:** nenhuma Edge Function tem suíte própria hoje, e
  `dashboard-agent` não será exceção. O que protege a decisão de autorização dela é
  importar `authorizePlan` de `_shared/query_plan.ts` em vez de reimplementar. Testar
  a função inteira exige E2E, que é o `TODOS.md` #3 e continua aberto.
- A bateria da 8.1 e 8.2 é **manual e roteirizada**, no mesmo formato que
  `testes/chat/teste-chat-vendas-roupas.md` já usa. Vira um arquivo irmão,
  `teste-dashboard-vendas-roupas.md`, para o próximo repetir sem reinventar.

### 8.4 O que esta verificação NÃO prova

Dizer isso evita que alguém leia o resultado como mais forte do que ele é:

- Não prova que o número está certo **na base do cliente** — só na sintética.
- Não cobre o onboarding, que continua mandando 5 linhas reais ao Gemini
  (`TODOS.md` #6).
- Não fecha o vazamento por **título** de card (D4), que é limite aceito.
- **Em aberto, e vale decidir antes de vender compliance:** qual é o prazo de
  retenção dos logs do CloudWatch e do Supabase? Log com dado pessoal tem prazo sob
  LGPD, e hoje ninguém neste repositório sabe qual é o configurado.
- **Em que plano está a `GEMINI_API_KEY`?** Deixou de ser pergunta teórica em
  2026-08-10: a cota estourou num dia de testes e derrubou o chat (R17). Importa por
  dois motivos, e o segundo é de privacidade — os tiers gratuito e pago da API do
  Gemini têm **políticas diferentes de uso dos dados enviados**, e o onboarding
  manda 5 linhas reais do cliente (`TODOS.md` #6). Enquanto ninguém confirmar o
  tier nos termos da conta, a frase "seus dados não são usados para treinar
  modelos" não pode ir para proposta comercial.
- **`dashboard_card_snapshots` não tem retenção nenhuma.** A chave primária inclui
  `computed_at`, então **cada execução insere uma linha nova** e nada é apagado
  jamais. São agregados, não linhas brutas — mas agregado por pessoa nomeia pessoa,
  e a tabela cresce para sempre. Isto é a mesma pergunta LGPD do item acima, com
  outra roupa, e cai fora desta fase: resolver exige política de retenção e uma
  migration.

---

## 9. Explicitamente fora de escopo

Para não virar discussão no meio da execução:

- Renomear `/dashboard` → `/organizacao` (D3 — em `TODOS.md` #10)
- Fixar card a partir do chat (D1, opção b)
- Editar a **pergunta** de um card já publicado (furo #7 — a Etapa 5 cobre só
  título e tipo de gráfico; refazer a pergunta é criar outro card)
- Modo "monta o dashboard inteiro": uma pergunta gerando vários cards de uma vez
  (D6). **A parte cara já está pronta** — o Lambda executa uma lista de planos numa
  chamada só (4.1); o que falta é prompt do agente e UI de prévia múltipla. É o
  candidato natural à próxima fase
- Um segundo Lambda, ou qualquer alteração no `query_engine` para "aceitar
  requisição maior" — desnecessário, ver 4.1
- **Agrupar por mês / semana / trimestre** (D7). É a limitação mais visível do MVP e
  a candidata mais forte à próxima fase, junto do modo "dashboard inteiro". Filtrar
  por intervalo de datas continua funcionando; o que falta é *agrupar* por período
- `line`, `stacked_bar`, `meter`, `table` (D2) — e qualquer ampliação de
  visualização, detalhada na §10
- Esconder do membro o **título** de card cujas colunas ele não acessa (D4). Exige
  filtragem no servidor; esconder no front seria cosmético
- Cards sugeridos automaticamente pelo `source = 'suggested'` (a coluna existe, o
  gerador não)
- Usar `plum_chat.assunto` para sugerir quais cards criar (`TODOS.md` #7)
- Mover a matriz de permissões de `Dashboard.tsx` para `Cfgdatabase.tsx`
  (`organizar_tudo.md` §2.1)
- Testes E2E com Playwright (`TODOS.md` #3)
- Card privado por usuário (D4)

---

## 10. Escopo futuro — ampliar a visualização dos insights

Registrado a pedido, para não virar "a gente conversa depois". Não é trabalho desta
fase; é o mapa do que vem, com as **dependências entre os itens**, que é a parte que
costuma ser descoberta tarde.

### 10.1 O que é barato: os quatro tipos que já existem no banco

`dashboard_cards.viz` já aceita seis valores no `CHECK`:
`kpi`, `line`, `bar`, `stacked_bar`, `meter`, `table`. O MVP usa dois (D2).

Os outros quatro **não precisam de migration** — são só componente de front e uma
linha no clamp da Etapa 4. Ordem sugerida, do mais útil ao menos:

| Tipo | Para quê | Bloqueado por |
|---|---|---|
| `table` | Ver o resultado em linhas. É também a **visão alternativa de acessibilidade** que o `DESIGN.md` §9 exige de todo card com gráfico — "a peça que mais paga de todo o documento" | Nada |
| `stacked_bar` | Parte-do-todo. Máximo 3 segmentos, excedente agrupado em "Outros" (`DESIGN.md` §3) | Nada |
| `meter` | Progresso contra uma meta | Precisa de onde guardar a meta — coluna nova ou convenção |
| `line` | Evolução no tempo | **D7.** Linha sem agrupamento por período é inútil |

Repare no último: **o gráfico de linha, que é o mais pedido de qualquer dashboard,
depende de agrupar por período.** Não adianta priorizar `line` antes do D7 — sairia
um gráfico de linha por dia, com 250 pontos num ano.

### 10.2 O que é caro: tipos novos, fora do enum

Qualquer coisa além dos seis (dispersão, mapa de calor, cascata, funil) exige
**migration** para alterar o `CHECK` de `viz`. Não é difícil, mas é migration — e
migration neste projeto é manual, aplicada à mão no painel (`CLAUDE.md` §1). Ou seja:
não é "só adicionar um componente".

### 10.3 Três regras que qualquer ampliação herda

Não são preferência, estão escritas e têm motivo:

1. **Nada de rosca ou pizza** (`DESIGN.md` §10, item 4). Com 4 categorias o par
   amarelo/laranja fica indistinguível antes mesmo de considerar daltonismo. Parte-
   do-todo é barra empilhada horizontal.
2. **Nada de dois eixos Y** no mesmo gráfico (item 5).
3. **Todo card com gráfico precisa de alternador para tabela** (§9). Resolve leitor
   de tela, daltonismo severo, exportação e tela estreita de uma vez.

### 10.4 A peça de insight que já tem os dados prontos, e ninguém percebeu

`dashboard_card_snapshots` guarda **toda execução** de todo card, com `computed_at`.
O comentário da própria migration diz isso em voz alta:

> *"O acumulo destes snapshots É a serie temporal que o motor de insights vai usar,
> sem precisar varrer a planilha de novo e sem tocar em linha bruta."*

Ou seja: **delta** ("subiu 12% vs. o mês passado"), **sparkline de tendência** e
**alerta de variação** não precisam de dado novo nem de outra leitura do Google. Os
dados vão se acumulando sozinhos a partir do primeiro card publicado.

E `dashboard_cards.higher_is_better` já existe justamente para isso: dizer se subir é
bom, ruim ou neutro. Hoje ninguém lê essa coluna.

**Consequência prática para priorização:** quanto antes o MVP entrar no ar, mais
histórico existe quando a fase de insights começar. Publicar cedo é, aqui, coletar
dado — não é só entregar.

⚠️ Uma pendência atrelada: esses snapshots **não têm retenção nenhuma** (§8.4). A
fase de insights precisa decidir por quanto tempo essa série é guardada, antes de
depender dela.

### 10.5 Ordem sugerida das próximas fases

Não é compromisso, é o encadeamento que as dependências desenham:

1. **Agrupar por período** (D7) — destrava `line` e o card mais pedido de todos
2. **`table` + `stacked_bar`** — baratos, e o `table` fecha a acessibilidade
3. **Delta e tendência** (10.4) — usa o histórico que já se acumulou até lá
4. **Modo "dashboard inteiro"** (D6) — vários cards de uma pergunta
5. **`meter`, e tipos fora do enum** — só quando houver pedido real
