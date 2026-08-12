# LOG — Fase 5b · PR 2: agrupar por período e gráfico de linha

**Data:** 2026-08-12 00:13 · **Modo:** Execução de Plano
**Branch:** `feat/fase-5b-pr2-periodo-e-linha` (empilhada sobre `feat/fase-5b-agrupar-por-periodo`)
**Commit inicial:** `9f320c5` (o PR 1) · **Base trazida:** `16d4747` (`origin/plataforma`)
**Plano de origem:** `docs/fases dashboard/2026-08-12-fase-5b-PLANO-v2-agrupar-por-periodo.md`

> **Escopo:** Etapas 3 a 6 do plano. A feature em si. O PR 1 (endurecimento,
> Etapas 1–2) está aberto e aguardando revisão do time — este PR **não o altera**.
>
> **Nenhuma Edge Function publicada.** `dashboard-agent`, `dashboard-execute` e
> `ai-plum-chat` continuam com o código anterior em produção. A publicação é ato
> manual e vem depois do merge — ver §Pendências.

---

## 1. Sumário executivo

### O que foi feito

O executor aprendeu a agrupar por período (`week`/`month`/`quarter`/`year`), o
dashboard ganhou gráfico de linha, e o agente que cria cards por pergunta passou a
gerar os dois. "Faturamento por mês" era literalmente impossível antes: o
`dashboard-agent` recusava com uma mensagem explícita, e o executor não sabia
derivar mês de uma coluna de data.

| Portão | Baseline | Agora |
|---|---|---|
| `pytest` | 242 (pós-PR 1) | **268** (+26) |
| `vitest` | 96 | **155** (+59) |
| `npm run build` | exit 0 | **exit 0** |
| `eslint` nos arquivos tocados | — | limpo |

Os números de `vitest` incluem a Etapa 7 (paleta por tema e refinamento visual), que
não estava no plano e entrou depois de sete rodadas de revisão visual — ver §2.

### Decisões tomadas

- **D3 — o rótulo é ISO no executor e português no front, e isto não é preferência.**
  O rótulo tem que **ordenar como texto**: o `order_by` ordena a coluna de saída e a
  linha desenha na ordem das linhas. "jan/2026" ordenaria alfabeticamente (abr, ago,
  dez, fev…) e a linha sairia embaralhada **sem nenhum erro no caminho**. Há um teste
  em cada lado, e um deles (`a saída em português NÃO ordena`) existe só para fixar o
  motivo da decisão.
- **A semana é rotulada pela data de início, não por `ano-Snn`.** Medido: para
  2027-01-03 o pandas dá `p.year=2027, p.week=53`, então o rótulo ingênuo diria
  "2027-S53" — semana 53 de um ano que começou, quando a ISO diz 2026-W53. E
  ordenaria no extremo direito de 2027.
- **`day` fora do enum (D2).** Agrupar pela coluna crua já agrupa por dia, e os
  rótulos divergiriam: `_serialize_df` dá "05/01/2026", um período `day` daria
  "2026-01-05". Duas formas de pedir a mesma coisa com duas respostas na tela.
- **D6 — linha sem data vira "Sem data"**, não é descartada. Descartar faria o total
  do gráfico não fechar com o total da base, em silêncio.
- **D8 — `--grid` e `--axis` medidos para o tema escuro** (ver Bugs).
- **O rótulo é materializado NA PRÓPRIA COLUNA**, não numa sintética tipo
  `_PREFIXO_DERIVADA`. É o que mantém `_grouped_agg`, `rename_map`, `order_by` e
  `_serialize_df` sem uma linha alterada — e evita o `Period` do pandas, que **não é
  serializável em JSON** e estouraria no FastAPI.
- **`line` é condicional em CINCO lugares**, não só no prompt: `formasCompativeis`,
  `vizPara` do `EditarCardDialog`, `VIZ_PERMITIDOS` + a nova TRAVA 2b do
  `NovoCardDialog`, e o dispatch do `CardDashboard`. Prompt é instrução, não garantia.

### Bugs encontrados e soluções

- **Gridline quase branca no tema escuro** → causa: o merge `16d4747` do colega
  introduziu um alternador claro/escuro no app (`use-tema.ts`), e o bloco
  `.tema-escuro` **não define `--grid`/`--axis`** — eles herdavam o valor do claro
  (L 91%). Medido com a fórmula da WCAG contra `--card` de cada tema:

  | | claro (referência) | escuro herdando o claro | escolhido |
  |---|---|---|---|
  | `--grid` | 1.248 | **14.283** | 1.262 |
  | `--axis` | 1.418 | **12.570** | 1.405 |

  → correção: `--grid: 320 12% 18%` e `--axis: 320 12% 21%` no `.tema-escuro`,
  igualando o contraste do claro. O `DESIGN.md` §4 exige gridline "recessiva"; era o
  oposto.
- **Um teste do PR 1 deixou de valer, de propósito** → `{"col":"regiao","trunc":"month"}`
  era caso de erro de tipo; agora a forma é válida (`regiao` falha por ser texto, com
  erro nomeado diferente). O caso saiu do parametrize com comentário explicando a
  migração, e a cobertura foi para `test_periodo.py`. **É mudança de contrato
  deliberada, não teste ajustado para passar.**
- **`formato.test.ts` não era coletado** → causa: `vitest.config.ts` restringe a
  `supabase/functions/**` e `src/lib/**` → correção: movido para
  `src/lib/rotulo-periodo.test.ts`, seguindo o precedente de
  `contraste-serie.test.ts`, que testa `components/dashboard/cores.ts` de lá.
- **`dot={false}` contradizia o próprio cabeçalho do componente** → o `DESIGN.md` §4
  pede marcador ≥8px no último ponto, permanente; `activeDot` só aparece no hover →
  correção: `dot` como função que desenha só no último índice, r=4 (8px) com anel de
  2px na cor da superfície.

### Safeguards e lacunas

- ✅ **O caminho antigo do chat é intocado e fixado por teste.**
  `test_group_by_string_na_coluna_de_data_continua_por_dia` e
  `test_objeto_sem_trunc_equivale_a_string` provam que `group_by` com string continua
  idêntico. O prompt do Agente A **não foi tocado**.
- ✅ **RBAC enxerga a coluna dentro do objeto.** Dois testes em
  `query_plan.test.ts` — um que barra a coluna proibida e um que libera. Antes do ramo
  novo, `addCol` descartava o objeto calado e o plano era autorizado sem ninguém olhar
  a coluna de data.
- ✅ **Gabarito humano reproduzido.** As 4 semanas de
  `testes/chat/teste-chat-vendas-roupas.md` §2 (R$ 2.227,91 · 2.387,92 · 2.274,55 ·
  2.338,89, total 9.229,27) passam pelo caminho real, com `apply_formatting_rules` e
  valor em texto pt-BR.
- ✅ **Recusas nomeadas, nunca 500 nem conversão silenciosa:** coluna de texto, papel
  `ano` (Int64 não tem `.dt`), `trunc` fora do enum, `trunc` não-texto, objeto sem
  `col`, coluna ausente.
- ✅ **Sem migration, sem alteração de dado.** `line` já estava no `CHECK` de
  `dashboard_cards.viz` desde `20260806230000`.
- ⚠️ **`quarter` e `year` só têm teste sintético.** Nenhuma base de teste atual tem
  coluna de papel `date` cruzando anos — a de estudos parece ter, mas é papel `ano`.
  Fecha com uma planilha de 12–20 linhas, se alguém quiser.
- ✅ **A paleta de série FOI medida no escuro** — resolvido na Etapa 7, que era uma
  lacuna aberta quando este sumário foi escrito. `MATIZES_ESCURO` derivada por busca
  numérica com os três critérios do teste, e `contraste-serie.test.ts` passou a validar
  **as duas** superfícies. Vale para as quatro viz.
- ⚠️ **A divergência intencional de `_shared/` (D7)** entra em vigor no deploy. Ver
  Pendências.

### Pendências

- [ ] **PR 1 precisa entrar antes.** Este PR está empilhado sobre ele.
- [ ] **Publicar as Edge Functions, à mão, DEPOIS do merge — e apenas DUAS:**
      `dashboard-execute` e `dashboard-agent`. **`ai-plum-chat` NÃO é republicada**
      (decisão D7). Conferir `ezbr_sha256` das duas.
- [ ] **O Lambda sobe pelo CI** ao entrar na branch principal, e é compartilhado com
      o chat. Ordem: Lambda **antes** das Edge Functions.
- [ ] 🚨 **Registrar a armadilha da D7 no `CLAUDE.md` §9.** Quem for ligar período no
      **chat** tem que republicar `ai-plum-chat` **antes** de mudar o prompt do Agente
      A — senão o chat emite `{col, trunc}`, a cópia antiga de `query_plan.ts` não
      extrai a coluna de data e a pergunta morre em `MissingColumnError`. Falha fechada
      e barulhenta, não vazamento, mas confusa de diagnosticar. **Não fiz esta edição
      ainda** — o `CLAUDE.md` foi tocado pelo merge do colega e prefiro não misturar.
- [ ] **Validar na tela** com a base real: criar "faturamento por semana", conferir os
      4 pontos contra o gabarito, e alternar claro/escuro para ver a gridline e a
      paleta de série nos dois temas.
- [ ] **O prompt do Tarsila continua sem verificação.** Nada prova ainda que ele gera
      `{col, trunc}` e `viz: "line"` para "faturamento por mês" — não há
      `GEMINI_API_KEY` local, e o caminho completo (pergunta → agente → executor) não
      roda fora de produção. Fecha depois do deploy, ou antes com uma chave num `.env`.

---

## 2. Detalhamento passo a passo

### Etapa 0 — Conferir o que o time commitou — [SUCESSO]

Feito a pedido do usuário, antes de escrever qualquer linha.

```sh
$ git fetch --all --prune
   a8560b1..16d4747  plataforma -> origin/plataforma

$ git diff --stat a8560b1..origin/plataforma
 28 files changed, 817 insertions(+), 1404 deletions(-)

$ git merge-tree $(git merge-base 9f320c5 origin/plataforma) 9f320c5 origin/plataforma | grep -c "<<<<<<<"
0
```

**Resultado:** o merge do colega é o redesign da landing + tema claro/escuro no front
interno. **Zero conflito com o PR 1** (nada em `query_engine/`), e **nenhum** dos
arquivos que o PR 2 ia tocar foi alterado por ele. `supabase/functions/plum-chat/` foi
**deletada** — é a demo da landing, não o `ai-plum-chat`, sem relação com esta fase.

Dois achados que mudaram o plano, os dois vindos do `use-tema.ts` novo:
o alternador de tema existe agora, e os tokens de gráfico não acompanharam (D8).

`git merge origin/plataforma` — limpo, sem conflito. Os três portões seguiram verdes
depois dele (242 / 96 / exit 0), medidos antes de qualquer alteração minha.

---

### Etapa 3 — O executor aprende `trunc` — [SUCESSO]

**Arquivos alterados**

| Arquivo | Ação | Mudança |
|---|---|---|
| `query_engine/pandas_executor.py` | alterado | `_colunas_de_group_by` passa a devolver pares `(col, trunc)` e a aceitar a forma objeto; `_rotulo_de_periodo` (nova); `_TRUNC_PARA_PERIODO` e `_SEM_DATA` (novas constantes); bloco de materialização em `execute_plan` |
| `query_engine/tests/test_periodo.py` | **criado** | 26 testes |
| `query_engine/tests/test_formas_de_plano.py` | alterado | 1 caso do parametrize migrado (ver Bugs), +1 caso novo |

**Comandos executados**

```sh
$ cd query_engine && ../.venv/Scripts/python.exe -m pytest tests/test_periodo.py -q
..........................                                               [100%]

$ ../.venv/Scripts/python.exe -m pytest --collect-only -q
tests/test_endpoint.py: 13
tests/test_expressao_derivada.py: 18
tests/test_formas_de_plano.py: 42
tests/test_formatting.py: 29
tests/test_periodo.py: 26
tests/test_privacidade.py: 14
tests/test_seguranca.py: 14
tests/test_sheets.py: 112
```

**Resultado:** 268 testes. Os 26 novos passaram de primeira. O gabarito humano das 4
semanas bate exatamente, incluindo o total de R$ 9.229,27.

---

### Etapa 4 — `_shared/query_plan.ts` extrai da forma objeto — [SUCESSO]

**Arquivos alterados**

| Arquivo | Ação | Mudança |
|---|---|---|
| `supabase/functions/_shared/query_plan.ts` | alterado | o laço de `group_by` reconhece `{col}`; `Array.isArray` para não tratar array como objeto de período |
| `supabase/functions/_shared/query_plan.test.ts` | alterado | +10 testes num bloco novo |

O `addCol` **continua** só aceitando string — é a proteção contra plano malformado, e
não foi afrouxada. O que mudou é o laço, que agora sabe olhar dentro de `{col}`.

```sh
$ npm test
 Test Files  4 passed (4)
      Tests  106 passed (106)
```

**Resultado:** os dois testes que importam para segurança passam — `authorizePlan` barra
a coluna de data quando o cargo não a tem, e libera quando tem. Antes deste ramo, esse
plano era **autorizado sem ninguém olhar a coluna de data**.

---

### Etapa 5 — Gráfico de linha e as whitelists — [SUCESSO]

**Arquivos alterados**

| Arquivo | Ação | Mudança |
|---|---|---|
| `src/components/dashboard/VizLinha.tsx` | **criado** | o componente; recharts, sem dependência nova |
| `src/components/dashboard/formato.ts` | alterado | `rotuloDePeriodo` + tipo `TruncPeriodo` |
| `src/lib/rotulo-periodo.test.ts` | **criado** | 9 testes |
| `src/components/dashboard/tipos.ts` | alterado | `CardNaTela.periodo` |
| `src/hooks/use-dashboard-cards.ts` | alterado | `truncDoPlano` deriva o período do `query_plan` |
| `src/components/dashboard/formas.ts` | alterado | `line` no alternador **só** com período |
| `src/components/dashboard/CardDashboard.tsx` | alterado | dispatch de `line` |
| `src/components/dashboard/NovoCardDialog.tsx` | alterado | `line` em `VIZ_PERMITIDOS` + **TRAVA 2b** |
| `src/components/dashboard/EditarCardDialog.tsx` | alterado | `VIZ` estático → `vizPara(card)` |
| `src/index.css` | alterado | `--grid`/`--axis` no `.tema-escuro` (D8) |

**Dependências:** nenhuma. `recharts@^2.15.4` já estava instalado, e o
`ui/chart.tsx` (shadcn) já o importava. O `VizBar` só **menciona** recharts num
comentário — e esse comentário já previa este momento.

```sh
$ npm test
 Test Files  5 passed (5)
      Tests  115 passed (115)

$ npm run build
✓ built in 22.96s        # exit 0

$ npx eslint src/components/dashboard/VizLinha.tsx src/components/dashboard/formato.ts src/lib/rotulo-periodo.test.ts
                          # sem saída = limpo
```

**Resultado:** a linha desenha, o alternador só a oferece em card de período, e a
gridline tem contraste medido nos dois temas. Um caso especial tratado: **um período
só** (que é o que a base de vendas devolve em "por mês", porque é toda de janeiro)
mostra o número e diz "sem evolução para desenhar", em vez de um pingo no meio do card.

---

### Etapa 6 — Prompt do `dashboard-agent` — [SUCESSO]

**Por último, e não em paralelo.** É o único gatilho que faz a forma nova existir em
produção: enquanto ele não subir, nada gera `{col, trunc}`. Se tivesse vindo antes da
Etapa 5, a TRAVA 2 reescreveria `line` → `kpi` e o card ficaria **gravado** assim,
renderizando um `2026-01` gigante.

**Arquivos alterados**

| Arquivo | Ação | Mudança |
|---|---|---|
| `supabase/functions/dashboard-agent/index.ts` | alterado | `viz` aceita `line`; `group_by` documenta as duas formas; **a recusa da regra 3 saiu**; `target_columns` explicita "nunca objetos" |

A regra 3 era: *"NUNCA agrupe por data ou por período. […] devolva {"erro": "Ainda não
sei agrupar por período…"}"*. Agora ela ensina a forma nova, manda escolher o
truncamento pela pergunta, e avisa que coluna de **ano** não aceita `trunc`.

```sh
$ grep -n "Ainda não sei agrupar\|NUNCA agrupe por data" supabase/functions/dashboard-agent/index.ts
                          # vazio = removida
```

**Resultado:** prompt atualizado. ⚠️ **Não publicado** — validação em produção depende
do deploy manual, que é pendência.


---

### Etapa 7 — Paleta por tema e refinamento visual — [SUCESSO]

Não estava no plano. Saiu de **sete rodadas de revisão visual** com o dono do produto,
depois do commit `2667ce1`. Commit: `ba9b3f1`.

**Arquivos alterados**

| Arquivo | Ação | Mudança |
|---|---|---|
| `src/components/dashboard/cores.ts` | alterado | `MATIZES_ESCURO` (nova tabela), `TemaDaSerie`, `SUPERFICIE_DO_CARD_ESCURO`; `corDaSerie` e `corDeSerieUnica` ganham o tema como parâmetro (opcional, padrão `claro`) |
| `src/hooks/use-tema-ativo.ts` | **criado** | observa a classe do `<html>` por `MutationObserver` |
| `src/components/dashboard/rotulos.ts` | **criado** | 7 funções puras de seleção e posicionamento de rótulo, sem nenhum import |
| `src/components/dashboard/VizLinha.tsx` | alterado | degradê, 3px, pontos em dois pesos, variação com triângulo, densidade adaptável, extremos pela direção, eixo curto, `monotone`, tooltip |
| `VizBar` · `VizPie` · `VizStackedBar` | alterados | passam o tema para `corDaSerie` |
| `CardDashboard.tsx` | alterado | botão "Ver maior" + diálogo reusando o mesmo `Corpo` |
| `formato.ts` | alterado | `rotuloCurtoDePeriodo`, `anoDoPeriodo`, `variacaoPercentual`, `formatarVariacao`, `sentidoDaVariacao`, `leituraDoDelta`, `SEM_DATA` |
| `src/lib/contraste-serie.test.ts` | alterado | +5 casos na superfície escura |
| `src/lib/{variacao,lado-do-rotulo}.test.ts` | **criados** | 19 + 9 casos |
| `DESIGN.md` | alterado | §4.1 (desvios da linha) + nota na §3 (duas tabelas) |

**Decisões tomadas**

- **A cor do delta segue `higher_is_better`, não a direção crua** (`DESIGN.md` §7).
  O pedido foi "sobe verde, desce vermelho"; num card de **custo** subir é vermelho, e
  `null` (padrão de card novo) não ganha cor. Contrariei o pedido literal citando o
  documento, e foi aceito depois de ver os três casos lado a lado.
- **`monotone` como suavização padrão.** O pedido original era "suavizar só nas viradas
  drásticas", que não existe no recharts (`type` é da série, não do segmento). Reescrevi
  o aviso "NUNCA SUAVIZAR" que eu mesmo havia posto: ele era mais categórico do que a
  evidência sustenta. `natural`/`basis`/`cardinal` fazem **overshoot** e seguem
  proibidas; `monotone` não sai do intervalo entre os dois pontos.
- **Valor e variação têm regras SEPARADAS de densidade.** Variação mede ~34px, valor
  ~62px. No ampliado a variação aparece em todos, o valor não — foi o pedido explícito
  ("todas as variações mas não todos os valores").
- **`DESIGN.md` atualizado só onde era necessário**, conforme instrução. A necessidade é
  concreta: a §10 é lista de reprovação automática e a linha contraria a §4 em quatro
  pontos literais. Sem registro, quem revisar desfaz decisões do dono do produto.

**Bugs encontrados e soluções**

- **Tooltip mostrava o valor duas vezes** → `Area` e `Line` com o mesmo `dataKey`; o
  recharts monta o tooltip de todas as séries ativas → `tooltipType="none"` na `Area`.
  Verificado no código do recharts (`getTooltipItem` propaga como `type`,
  `DefaultTooltipContent` pula `type === 'none'`) em vez de confiar no tipo aceitar a prop.
- **Eixo X mostrava "jan · abr · jul · dez"** em 12 meses → `jan/2026` mede ~46px e o
  `minTickGap` descartava a maioria → rótulo curto (`jan`) + ano uma vez no fim. Série
  que cruza anos marca a virada no próprio tick (`jan/28`).
- **`interval={0}` era a causa raiz da sobreposição do eixo**, e blanquear texto no
  `tickFormatter` não resolvia: o espaço já foi reservado.
- **A alternância acima/abaixo estava por índice cru** → com densidade adaptável (de 2
  em 2), todos os índices exibidos têm a mesma paridade e **todos iriam para o mesmo
  lado**, desfazendo a alternância em silêncio → alternância pela ordem entre os
  rótulos exibidos.
- **`jan/2027` aparecia duas vezes** no gráfico de 18 meses → bug do gerador da página
  de teste (`7 + i < 12 ? 2026 : 2027` só sabe dois anos; o 18º ponto é jan/**2028**).
  O componente estava certo com entrada errada.
- **Derivação da paleta escura, dois erros meus antes de acertar:** (1) não clampava a
  saturação em 100%, produzindo `rgb(267,260,64)` fora de gamut — o teste existente já
  clampava, então a paleta clara sempre esteve correta; (2) otimizar por amplitude dava
  pastéis em L 91 sem identidade de matiz, e otimizar por croma dava amplitude de 8
  pontos de L — que é exatamente o bug que o teste documenta.

**Comandos executados**

```sh
$ npm test
 Test Files  7 passed (7)
      Tests  155 passed (155)

$ cd query_engine && ../.venv/Scripts/python.exe -m pytest -q
[…] 268 passed

$ npm run build
✓ built in 23.67s        # exit 0

$ npx eslint <os 18 arquivos tocados>
                          # sem saída = limpo
```

**Resultado:** **155 vitest** (eram 141), 268 pytest, build exit 0. Os 72 problemas que
`npx eslint src/` reporta são **pré-existentes** (`components/ui/*` do shadcn e
`DatabasePipeline.tsx`); nenhum arquivo tocado nesta etapa aparece na lista.

A paleta escura foi validada contra a colorimetria **independente** do
`contraste-serie.test.ts` (o teste implementa a própria conversão de propósito, para não
usar o mesmo utilitário do código sob teste) — é verificação cruzada, não circular. E o
hex da superfície escura (`#1E151B`) foi conferido contra o token `--card` do
`.tema-escuro` (`hsl(320 16% 10%)`).

**Limpeza:** a página temporária `src/pages/TesteLinha.tsx` foi removida e o
`src/App.tsx` voltou **idêntico** ao commit (`git diff --stat` vazio).
