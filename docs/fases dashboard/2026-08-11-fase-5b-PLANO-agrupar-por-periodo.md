# PLANO — Fase 5b: agrupar por período e gráfico de linha

> **Documento de planejamento, não de execução.** Existe para ser validado pela
> equipe *antes* de qualquer código. O resumo do que foi feito entra num arquivo
> irmão depois, no formato do `README.md` desta pasta.

**Data:** 2026-08-11
**Depende de:** Fase 4 (Página Inicial) e Fase 5a (tabela, parte-do-todo,
alternador) — as duas concluídas.

---

## 0. A frase que resume

Hoje o executor não sabe derivar mês, semana ou trimestre de uma coluna de data.
Sem isso, **"faturamento por mês" é impossível** e o gráfico de linha não tem o
que desenhar. Esta fase ensina o executor a agrupar por período — e é a primeira
que altera peças compartilhadas com o chat.

---

## 1. O que está bloqueado, e a evidência

`group_by` opera sobre coluna que existe no DataFrame:

```python
gb_cols = [_strip_table(c) for c in group_by_raw if c]   # pandas_executor.py:195
```

E não existe extração de parte de data em lugar nenhum — verificado por busca de
`.dt.month`, `to_period`, `resample` e `trunc` em `pandas_executor.py`. Logo:

| Plano | Resultado real hoje |
|---|---|
| `group_by: ["mes"]` | **Erro** — a coluna não existe na planilha |
| `group_by: ["data_da_venda"]` | Agrupa **por dia**: ~250 linhas num ano |

O `line` já existe no `CHECK` de `dashboard_cards.viz`, mas desenhar uma linha
por dia com 250 pontos não é um gráfico de evolução, é ruído. **Por isso as duas
coisas são uma fase só, e não duas.**

O agente do dashboard já recusa explicitamente esse pedido hoje (regra 3 do
prompt em `dashboard-agent/index.ts`), respondendo que ainda não sabe agrupar por
período. Esta fase remove essa recusa.

---

## 2. O modelo de risco — correção de uma afirmação anterior

**Nas conversas que levaram a este plano eu afirmei, mais de uma vez, que uma
implementação pela metade em `_shared/query_plan.ts` seria "bypass de RBAC".
Fui verificar o caminho inteiro, e está errado.** A correção importa porque
risco superestimado atrapalha prioridade tanto quanto risco ignorado.

O que acontece de fato quando `extractColumns` deixa de extrair uma coluna:

1. Ela não entra em `veredito.required`.
2. `required` vira `resolved_columns` no payload assinado.
3. O executor carrega **apenas** `resolved_columns`
   (`main.py`: `colunas_a_carregar |= colunas`, e é esse conjunto que vai para
   `sheets.load_columns`).
4. O plano referencia uma coluna que não está no DataFrame → `MissingColumnError`.

**O resultado é um card quebrado, não um vazamento.** É a segunda barreira
funcionando como projetada: o Lambda nunca confia no plano para decidir o que
ler, só lê o conjunto já resolvido e assinado.

**O risco real desta fase, então, é outro e é menor:** um `group_by` em forma de
objeto passa por `addCol` (que ignora não-strings) sem erro, chega ao executor
como `_strip_table({...})` → um nome de coluna sem sentido → `MissingColumnError`
com uma mensagem confusa. **Falha fechada, com péssima mensagem.**

Isso muda a natureza do cuidado necessário: continua exigindo teste dos dois
lados, mas o que está em jogo é **corretude e clareza de erro**, não isolamento
entre empresas. É uma mudança normal de produto, não uma operação de risco.

---

## 3. As quatro peças, e por que precisam andar juntas

| # | Arquivo | Mudança | Compartilhado com o chat? |
|---|---|---|---|
| 1 | `supabase/functions/_shared/query_plan.ts` | `extractColumns` passa a extrair a coluna da forma objeto em `group_by` | **Sim** |
| 2 | `query_engine/pandas_executor.py` | `group_by` aceita `{col, trunc}` e agrupa por período | **Sim** |
| 3 | `supabase/functions/dashboard-agent/index.ts` | prompt aprende a forma nova; sai a recusa da regra 3 | Não |
| 4 | `src/components/dashboard/VizLinha.tsx` | componente novo | Não |

**1 e 2 têm que subir juntas.** Se o interpretador aprender a forma nova antes do
executor, um plano válido pelo RBAC quebra no Python. Se o executor aprender
primeiro, ele nunca recebe a forma nova, porque o agente ainda não a gera. A
ordem segura é: **2 → 1 → 3**, com a 4 em paralelo (é só front).

O item 5, opcional, é o prompt do **Agente A do chat** — ver decisão D3.

---

## 4. Decisões que precisam do aval de vocês

### D1 — Qual a forma do período no Query Plan?

| Opção | | |
|---|---|---|
| **(a) `group_by: [{"col": "data_da_venda", "trunc": "month"}]`** | Estende o campo existente. Exige mexer em `addCol`, mas mantém um conceito só: "agrupe por isto" | **Recomendada** |
| (b) Campo novo `period_by: {col, trunc}` | Não toca `group_by`. Mas `extractColumns` precisa aprender o campo novo do mesmo jeito, então **não reduz o trabalho nem o risco** — só cria uma segunda forma de dizer a mesma coisa |
| (c) String convencionada, `"month(data_da_venda)"` | Nenhuma mudança de tipo. Mas cria uma mini-linguagem dentro de uma string, que alguém vai ter que analisar com regex nos dois lados. É a dívida do keyword-match de novo, em outra roupa |

### D2 — Quais truncamentos?

Recomendado: **`day`, `week`, `month`, `quarter`, `year`** — os cinco que
`pd.Series.dt.to_period` cobre direto, sem código de calendário próprio.

`week` merece atenção: semana começa na segunda no Brasil e no domingo no
padrão ISO usado pelo pandas por omissão. Precisa ser decidido e escrito, senão
"vendas da semana" muda de significado conforme quem lê.

### D3 — O chat também ganha isso agora?

| Opção | | |
|---|---|---|
| **(a) Dashboard primeiro, chat depois** | O executor passa a suportar; só o `dashboard-agent` aprende a gerar. O chat continua como está, sem risco de regressão | **Recomendada** |
| (b) Os dois na mesma fase | "Quanto vendemos por mês" é pergunta óbvia no chat, e a capacidade estaria lá. Mas mexe no prompt do Agente A, que é o caminho mais exercitado do produto |

Se for (a), vale registrar em `TODOS.md`: o executor terá capacidade que o chat
não usa, e alguém precisa saber que ligar é só prompt.

### D4 — Fuso horário

As datas chegam sem fuso (`naive`) e o agrupamento por mês usa o dia como está
na planilha. Isso é o comportamento certo para dado de negócio brasileiro, mas
**precisa estar escrito** — do contrário, a primeira venda de 1º de março às 23h
que "aparece em fevereiro" vira investigação.

Recomendado: não converter fuso em lugar nenhum, e dizer isso no comentário.

---

## 5. Etapas

Cada etapa tem D.O.D. verificável. Nenhuma começa antes de a anterior estar verde.

### Etapa 0 — Provar o modelo de risco · P

Antes de mexer em qualquer coisa, um teste que **documenta o comportamento
atual**: um plano com `group_by` em forma de objeto hoje produz
`MissingColumnError`, não vazamento.

**D.O.D.:** teste em `query_engine/tests/` verde, afirmando a falha fechada. Ele
é a rede que garante que a mudança das etapas seguintes não inverte isso.

### Etapa 1 — `pandas_executor.py` aprende `trunc` · M

- `group_by` aceita item string (comportamento atual, intocado) **ou**
  `{col, trunc}`.
- A coluna derivada entra no resultado com um rótulo legível (`2026-01`,
  `2026-S03`), não com o `Period` cru do pandas.
- Coluna que não é data com `trunc` → erro nomeado, nunca conversão silenciosa.

**D.O.D.:** `pytest` verde, incluindo os casos de erro. O caminho antigo
(`group_by` com strings) tem que continuar passando **sem nenhuma alteração nos
testes existentes** — é a prova de que o chat não regrediu.

### Etapa 2 — `_shared/query_plan.ts` extrai da forma objeto · P

`addCol` continua ignorando não-strings (é a proteção contra plano malformado);
o laço de `group_by` é que passa a reconhecer `{col}`.

**D.O.D.:** `npm test` com casos novos em `query_plan.test.ts` — forma string,
forma objeto, objeto sem `col`, objeto com `col` não-string. Os 54 testes atuais
seguem verdes.

### Etapa 3 — Prompt do `dashboard-agent` · P

Sai a recusa da regra 3; entra a forma nova, com a instrução de escolher o
truncamento pela pergunta ("por mês" → `month`, "por semana" → `week`).

**D.O.D.:** "faturamento por mês" gera plano válido, e a prévia mostra o número.

### Etapa 4 — `VizLinha.tsx` · M

**Aqui `recharts` finalmente se justifica**, ao contrário de `bar` e
`stacked_bar`: linha tem eixo, escala e domínio temporal de verdade, e
reimplementar isso à mão seria trabalho sem ganho.

Regras que o componente herda do `DESIGN.md`: linha de 2px com junta e ponta
arredondadas (§4), marcador ≥8px só no último ponto, gridline de 1px sólida e
recessiva, **nunca dois eixos Y** (§10 item 5), rótulo direto seletivo em vez de
número em cada ponto.

**D.O.D.:** card com `line` desenha a série, e o alternador oferece linha só
quando o `group_by` é de período (linha sobre categoria não ordenada não
significa nada).

---

## 6. Riscos

| | Risco | Contenção |
|---|---|---|
| **R1** | Regressão no chat: o executor é o mesmo | O caminho antigo não muda. A prova é a suíte atual passar **sem edição** — teste alterado junto com o código não prova nada |
| **R2** | `MissingColumnError` confuso quando o plano vier malformado | Etapa 1 inclui mensagem nomeada para `trunc` sobre coluna não-data |
| **R3** | Semana começando no dia errado | D2. Decidir e escrever antes de codar |
| **R4** | A base sintética não testa mês | Ver §7 — ela é toda de janeiro/2026 |
| **R5** | Alguém "resolver rapidinho" só no Python | As duas peças sobem juntas, na ordem 2 → 1 |

---

## 7. Verificação — e um problema com a base de teste

**`vendas_loja_roupas_teste.csv` é toda de janeiro de 2026.** Agrupar por mês ali
devolve **um ponto**, o que não prova nada sobre um gráfico de linha.

Duas saídas, e a segunda é melhor:

1. Testar por **semana**: a base tem 4 semanas úteis, com gabarito conferido à
   mão em `testes/chat/teste-chat-vendas-roupas.md` §2 — R$ 2.227,91 · R$
   2.387,92 · R$ 2.274,55 · R$ 2.338,89. Quatro pontos são suficientes para uma
   linha, e o gabarito já existe.
2. Usar **`tabela-de-estudos.csv`** para mês e ano: `data_conclusao` cobre vários
   anos, então serve para o caso que a outra não cobre. Precisa de gabarito
   conferido à mão, que hoje não existe para esse corte.

Recomendado: semana na base de vendas (gabarito pronto) **e** ano na de estudos
(gabarito novo, pequeno).

⚠️ **Lembrete que custou uma investigação inteira:** conferir o **Local** da
planilha de teste antes de qualquer conclusão sobre data. Ver `TODOS.md` #12.

---

## 8. Explicitamente fora de escopo

- **`meter`** — precisa de onde guardar uma meta; é migration e decisão de
  produto (`dashboard_cards` não tem coluna para isso)
- **Delta e tendência** (`higher_is_better` já existe no banco e ninguém lê) —
  dependem do histórico de snapshots, que só começou a acumular em 2026-08-11
- **Comparar dois períodos no mesmo card** ("este mês vs. o anterior") — é outra
  forma de plano, não só outro `trunc`
- **Prompt do Agente A do chat**, se a D3 for (a)
- **Preencher períodos vazios** — um mês sem venda hoje simplesmente não aparece.
  Numa linha isso desenha um salto que parece continuidade. Merece decisão
  própria, e é mais sutil do que parece
