# B03 · `metadados` — diário

**Data:** 2026-08-20 · **Escopo:** só o executor. Nenhuma Edge Function, nenhuma migration.

O pedido que o Reconhecedor (A2) usa para responder *"que colunas importam para esta pergunta?"* sem
que nenhuma linha da base saia. Por coluna: papel, valores distintos, percentual de vazio e — só
onde é seguro — mínimo e máximo.

⭐ **`n_linhas ÷ distintos` responde o grão sem olhar dado nenhum.** É a razão de `distintos` valer
mais que uma amostra: amostra aleatória pode, por azar, não repetir data nenhuma e sugerir grão
diário numa base que tem cinquenta linhas por dia. A razão nunca erra.

---

## O que o plano dizia e o código pediu diferente

### 1. ⭐ O papel declarado é sobre exibição, não sobre tipo — e isso quase quebrou o bloco

O plano dizia: `min`/`max` só para papéis `number`, `date` e `ano`; texto recebe `None`. Implementei
assim, e o teste de ponta a ponta caiu — `faturamento`, uma coluna de `float`, voltou sem extremos.

A causa é o achado **A3** do plano da etapa, mordendo num lugar que ele não previa. `column_roles`
vem de `formatting_rules`, que é conceito de **exibição**, e `TYPE_TO_ROLE["nenhuma"] = "text"`.
Coluna que o Agente 3 não classificou é `text` — e na **base suja** que a Etapa 0 §0.3 manda criar,
isso é a maioria. A regra escondia o mínimo e o máximo justamente das colunas numéricas onde o A2
mais precisa deles.

**Feito:** papel declarado vence; **sem declaração, o dtype decide** (`datetime` → `date`, numérico →
`number`, resto → `text`).

⚠️ **A ordem importa e é o que impede o atalho errado.** `documento_cpf_cnpj` vira papel `text`, mas
a planilha guarda CPF como número. Se o dtype decidisse *por cima* da declaração, o menor e o maior
CPF da base sairiam daqui. O dtype só é consultado quando **não há** classificação nenhuma. Há um
teste marcado `invariante` só para esse caso.

Efeito colateral bom: o `papel` reportado ficou honesto. Antes uma coluna numérica não classificada
seria descrita ao A2 como `text`.

### 2. Vazio conta string em branco, não só `NaN`

O V3 pede `nulos_pct` para denunciar "coluna preenchida só a partir de certo mês". Contando só
`isna()` isso não funcionaria: o Google Sheets entrega célula em branco como `""`, e a coluna
apareceria com **0% de vazio**.

Chamei o campo de `vazios_pct`, não `nulos_pct` — o nome antigo prometeria uma coisa (`NULL`) e
entregaria outra.

### 3. Coluna pedida que não existe é reportada, não omitida

`{"existe": false}` em vez de sumir do retorno. Omitir faria o A2 presumir ausência de **dado** onde
há erro de **nome** — mesma razão pela qual o executor levanta `MissingColumnError` em vez de ignorar
um filtro.

⚠️ **Correção de 2026-08-20: isto nasceu inalcançável, e só apareceu no B06.** O
`sheets.load_columns` levanta `SheetError` quando **qualquer** coluna pedida falta no cabeçalho — ou
seja, `descrever()` nunca chegava a ver uma coluna ausente. A defesa estava escrita no lugar certo e
o caminho até ela, fechado.

⭐ Custou caro justamente porque o `metadados` pede **todas** as colunas do cargo: uma única entrada
obsoleta na matriz de permissões derrubava o caminho `ad_hoc` inteiro, enquanto o chat legado — que
pede duas ou três colunas — respondia normalmente. O conserto é `tolerar_ausentes`, ligado **só**
quando o lote inteiro é `metadados`.

### 4. O caminho entra antes do executor, não dentro dele

`metadados` não tem Query Plan, e um plano sem `select` viola o P1.3 — com razão. O desvio fica no
laço do `main.py`, antes do `execute_plan`, e reaproveita tudo que já estava de pé: a barreira 4
(`assert_columns_allowed`), a leitura única do Sheets para o lote, o `apply_formatting_rules` e o
`roles_from_formatting_rules`.

⭐ **Nada disso precisou mudar** — foi o que tornou o bloco meio dia em vez de dois. O campo
`PlanRequest.tipo` que o B02 criou já servia.

---

## Decisões

**"Zero linhas expostas" é quase verdade, não verdade — e está escrito no módulo.** O `min`/`max` de
uma coluna numérica ou de data **são valores reais da base**, um por coluna. É o que uma descrição
de base é, e o V7 conta com isso para o A2 saber o período coberto. Mas o V3 e o V7 repetem "zero
linhas expostas" como se fosse literal, e alguém ia acreditar.

**Papel numérico declarado + dtype de texto não vira coerção.** `to_numeric(errors="coerce")`
inventaria um mínimo a partir das linhas que por acaso pareciam número. Descrição de base **errada**
é pior que incompleta: o A2 escolheria a coluna confiando numa faixa que não existe.

**`linhas_por_valor` sai `None`, nunca `inf`.** Base vazia ou coluna toda nula dividiria por zero, e
`inf` não tem representação em JSON — o agente leria um número.

---

## O que ficou de fora

**O `vocabulario` não entrou aqui**, embora o V7 os trate no mesmo parágrafo. Ele expõe **valor
literal** de texto e precisa de teto de cardinalidade, da flag `vocabulario_exposto` e do resolvedor
de entidade para fazer sentido. É o B04 inteiro, não um apêndice deste.

⭐ E é o que fecha o desenho: `metadados` responde *quantos* e *qual faixa*; `vocabulario` responde
*quais*, e é a **única** porta para isso, com trava própria.

---

## Arquivos

**Novos:** `query_engine/metadados.py` · `query_engine/tests/test_metadados.py` (14 casos)

**Editados:** `query_engine/main.py` (o desvio do `tipo == "metadados"`) ·
`query_engine/tests/test_endpoint.py` (+5 casos: barreira de cargo, convivência com plano normal no
mesmo lote, e pedido sem `tipo` continuando a funcionar)

**Verificado:** `npm run test:py` — **304 testes**, todos verdes. Nada de TypeScript foi tocado.

⛔ **Não tocado:** `pandas_executor.py`, `_shared/query_plan.ts`, e nenhuma Edge Function.
