# Etapa 3 — plano de implementação

## Contexto

A Etapa 2 está escrita inteira (B11..B17). O cadastro escreve o dicionário v2 e o
`ad_hoc` o lê; o A2 saiu do caminho da pergunta e ficou desligado no repositório,
com "volta na Etapa 3" escrito no topo.

**Esta etapa tem duas metades que quase não se tocam**, e vale dizer isso de
saída porque elas competem por atenção:

- ⭐ **multi-planilha** — o titular, e o que faz o A2 voltar a ter trabalho;
- 🔧 **cinco pontas soltas do cadastro** que o 👤 anotou no V3, todas sobre a base
  já cadastrada envelhecer mal.

⚠️ **A segunda metade é a que dói hoje.** A primeira é capacidade nova; a segunda
são coisas que já mordem quem usa o produto — recadastrar cria base duplicada em
silêncio, e mudar uma coluna na planilha obriga a refazer o cadastro inteiro.
Se a etapa tiver de encolher, **é a primeira metade que espera.**

---

## §A · O que não fecha entre o V3 e o código

### A1 ⭐ O executor sempre soube multi-tabela; quem não sabe é o `main.py`

`execute_plan(plan, tables: Dict[str, DataFrame])`
([pandas_executor.py:632](query_engine/pandas_executor.py#L632)) sempre aceitou
várias tabelas, e resolve `plan["from"]` contra elas.

⛔ Mas o `main.py` monta `tabelas = {"producao": df}`
([:301](query_engine/main.py#L301)) e depois **sobrescreve**
`plano["from"] = "producao"` ([:358](query_engine/main.py#L358)). O `from` que o
planejador emitiu é descartado, sempre.

⇒ **O trabalho não é escrever multi-tabela, é parar de apagar o `from`.** E como
esse caminho nunca executou em produção, tratá-lo como pronto seria otimismo:
ele é código que compila, não código que rodou.

### A2 ⚠️ Tabela inexistente devolve `error`, não levanta

[pandas_executor.py:654](query_engine/pandas_executor.py#L654) devolve
`{"error": "Tabela 'x' nao encontrada."}`. Todo o resto do executor levanta
exceção nomeada — `MissingColumnError`, `RawRowsBlocked`, `RowLimitExceeded`.

⚠️ A diferença importa: `from` errado num card vira **card vazio em silêncio**,
enquanto `MissingColumnError` aparece. Com uma tabela só isso nunca acontecia,
porque o `from` era sobrescrito. Com várias, passa a ser o modo de falha mais
provável — o planejador escrevendo o nome errado da planilha.

### A3 ⭐ O A2 volta, e o trabalho dele agora existe

`adhoc/reconhecedor.ts`, `_shared/reconhecimento.ts` e `plum_reconhecimento`
ficaram desligados no B15 exatamente para isto (D-049).

Com **uma** planilha o trabalho dele era vazio — *"que tabelas importam"* era
constante. Com várias, é a pergunta central: mandar o dicionário de seis
planilhas ao A3 em toda pergunta é caro e ruidoso, e ele escolheria mal.

⚠️ **Mas ele não volta igual.** O A2 do V7 deduzia o significado das colunas sem
ver linha nenhuma; isso agora é do cadastro e está no dicionário, conferido por
gente. O que sobra para ele é **seleção**: dadas N planilhas e uma pergunta,
quais entram no prompt do A3. Entrada menor, saída menor, e o cache por
`(dataset, versão do dicionário)` volta a fazer sentido.

### A4 ⚠️ Recadastrar a mesma planilha cria base duplicada, calada

[DatabasePipeline.tsx:151](src/components/DatabasePipeline.tsx#L151): a retomada
de rascunho casa por `google_sheet_id` **mas filtra `status = 'processing'`**.

⇒ Base **ativa** com a mesma planilha não é encontrada, e o cadastro segue como
se fosse planilha nova: `insert` cria outro `dataset`, com outro uuid. A pessoa
termina com duas bases idênticas na tela e nenhuma indicação de qual o chat usa.

⛔ **O V3 propõe detectar isso comparando COLUNAS. Não faça.** É voltar ao
casamento por assinatura de colunas que o B13 abandonou de propósito — duas
planilhas diferentes com as mesmas colunas se confundiam, e era o furo que a
inversão do cadastro fechou.

⭐ E a preocupação que motivou a proposta ("os links podem ser diferentes") **já
está resolvida**: `extrairSheetRef` extrai o `id` da URL, e o mesmo documento dá
o mesmo `id` em qualquer forma de link — `/edit`, `?usp=sharing`, com ou sem
`#gid`. Casar por `google_sheet_id` + `google_sheet_gid` cobre o caso inteiro,
com uma consulta e sem heurística.

### A5 ⭐ "Editar o nome da coluna à mão" é a solução errada para o problema certo

O 👤 escreveu: *"ao mudar uma coluna ou adicionar uma coluna no Google Sheets, tem
que recadastrar. Por isso, permita editar o nome da coluna e adicionar coluna
manualmente em 'editar esquema'."*

**O problema é real e é o mais caro dos cinco.** A solução proposta, não:

⛔ O nome normalizado da coluna é **contrato com três lados** — as chaves de
`schema_metadata`, os valores de `role_permissions.allowed_columns`, e o
cabeçalho real da planilha, que o executor normaliza na leitura. Editar o nome à
mão quebra os três: a coluna deixa de casar com o cabeçalho e o RBAC aponta para
um nome que não existe mais. Falha muda, tipo "coluna não encontrada".

⛔ E "adicionar coluna manualmente" cria uma coluna que **não existe na
planilha**. O executor a procuraria no cabeçalho e não acharia.

⭐ **O que ele quer é reconciliar com a planilha, não digitar.** A capacidade já
existe: `cabecalhos_da_planilha` lê o cabeçalho atual em uma requisição. "Editar
esquema" ganha um **Reler**, que compara o cabeçalho de hoje com o
`schema_metadata` e mostra três listas — colunas novas (a descrever), colunas que
sumiram (a remover), colunas iguais (intocadas). É a **C13** com outro nome, e o
B13 já a deixou "natural" ao fazer da planilha a identidade da base.

### A6 As observações do usuário já existem — falta o lugar de editá-las

O V3 pede: *"o usuário poderá colocar observações na base como contexto adicional
para o Gemini (ex.: considere apenas vendas faturadas para a receita)."*

⭐ **Isso foi entregue no B14.** `schema_metadata.observacoes` existe, é editável
na etapa 4, e chega ao A3 via `paraPrompt`. O exemplo do 👤 é literalmente o que
o chat fez em 2026-08-25: filtrou `status = FATURADO` e declarou a presunção,
citando o dicionário.

⇒ Sobra **onde**: hoje só se editam durante o cadastro. Quem quer acrescentar uma
observação a uma base ativa não tem por onde. É trabalho de tela em
`Cfgdatabase.tsx`, não de agente — e cai junto com o A5, na mesma tela.

### A7 O Agente 2 refina o que ninguém pediu

[DatabasePipeline.tsx:539-540](src/components/DatabasePipeline.tsx#L539-L540):
`handleRefineSemantics` manda **todas** as definições ao Agente 2, inclusive as
que a pessoa não tocou.

⚠️ Duas consequências, e a segunda é a que incomoda: gasta tokens no que já estava
bom, e **reescreve texto que a pessoa aprovou**. Ela clica em "Refinar" pensando
em uma coluna e volta com doze frases diferentes.

⇒ Precisa guardar a saída original do Agente 1 e mandar só o que divergir dela.

---

## §B · Decisões que atravessam blocos

### B1 ⭐ Uma base = uma aba. Multi-planilha é multi-BASE, não multi-aba

O `datasets` já é por aba (`google_sheet_gid`), e o `from` do plano passa a nomear
**um dataset**, não uma aba dentro de um arquivo. Duas abas do mesmo arquivo são
duas bases, cadastradas duas vezes, com dois dicionários.

⚠️ Parece desperdício e não é: cada aba tem cabeçalho, grão e formatação
próprios. Um dicionário que cobrisse várias abas teria de dizer a qual cada
coluna pertence — que é exatamente o que o `from` já diz.

### B2 ⛔ `join` continua bloqueado. Cruzamento é DEPOIS da agregação

R-11 não muda. O executor não ganha `join`, e o A3 não passa a poder pedir um.

⭐ O caminho é o do D-035: cada planilha responde a sua agregação, e o cruzamento
acontece sobre os **resultados**, que são pequenos e já agregados. Isso exige
**grão declarado** nas duas pontas — e o grão existe desde o B14, conferido por
gente, o que não era verdade quando a D-035 foi escrita.

⚠️ **Mas isso é a Etapa 6, não esta.** Aqui o A3 ganha o direito de pedir a
*planilha certa*; pedir **duas e cruzar** é o passo seguinte. Confundir os dois
transforma uma etapa de 2–3 semanas numa de dois meses.

### B3 O RBAC é por dataset, e isso já funciona — confira, não reescreva

`allowed_columns` é `(role_id, dataset_id)`. Com o `from` nomeando um dataset, o
`authorizePlan` precisa autorizar **contra o dataset daquele pedido**, não contra
um único dataset do turno.

⚠️ É o ponto de maior risco da etapa inteira: é onde uma coluna pode escapar do
RBAC (I-05). Todo pedido do lote carrega o seu `dataset_id`, e a resolução de
`allowed_columns` passa a ser por pedido. **Teste antes de código.**

### B4 ⚠️ O orçamento do B10 é por pessoa/base/dia — e "base" ficou ambíguo

Com uma pergunta tocando duas planilhas, 5 linhas de cada são 10 linhas. O
`plum_logs.dataset_id` é uma coluna só.

⇒ Decisão: o débito é **por dataset tocado**, não por turno. Uma pergunta que lê
duas bases debita das duas cotas. Alternativa (debitar só da "principal") faria
o teto virar sugestão assim que alguém perguntasse cruzando.

---

## §C · Os blocos

### B18 · O `from` deixa de ser sobrescrito

**Servidor puro, e é a fundação dos outros.** Sem migration, sem front.

1. `main.py` monta `tabelas` com **uma entrada por dataset** do payload, em vez
   de `{"producao": df}`, e **para de sobrescrever** `plano["from"]`.
2. `execute_plan` **levanta** `TabelaNaoEncontradaError` em vez de devolver
   `{"error"}` (§A2), alinhando com `MissingColumnError`.
3. ⚠️ **Compatibilidade:** plano sem `from`, ou com `from: "producao"` e uma
   tabela só, continua funcionando. Todo card salvo hoje tem `"from": "producao"`
   — quebrar isso apaga o dashboard de todo mundo.

**Testes:** Python. Dois datasets, plano apontando para cada um; `from`
inexistente levanta; o caso de uma tabela só continua idêntico.

**Pronto quando:** um `curl` com duas tabelas e dois planos devolve dois
resultados corretos.

### B19 · A Edge Function manda mais de uma base — e autoriza cada uma

⭐ **É aqui que mora o risco da etapa** (§B3).

- O payload do executor passa a levar N `sheet_id`/`tab_gid`, um por dataset.
- `authorizePlan` roda **por pedido**, contra o `allowed_columns` do dataset
  daquele pedido.
- A barreira 4 do Lambda recebe `allowed_columns` **por tabela**.

⛔ Nada de `allowed_columns` global do turno: é o atalho que transformaria o RBAC
numa união de permissões de bases diferentes.

**Testes:** `vitest`, e antes do código — plano que pede coluna permitida na base
A mas proibida na B é negado; lote misto aprova um e nega outro.

### B20 · O A2 volta, como seletor de planilha

- Entrada: a pergunta + a **lista** de bases com nome, grão e observações (não o
  dicionário inteiro de cada uma).
- Saída: quais datasets entram no prompt do A3.
- O cache por `(dataset, versão do dicionário)` volta — a chave passa a ser o
  **conjunto** de bases da organização.
- ⚠️ Uma base só: o A2 **não roda**. Não há escolha a fazer, e pagar um LLM para
  responder "essa" é o que esvaziou o A2 na Etapa 2.

**Pronto quando:** numa organização com três bases, a pergunta sobre vendas leva
só a base de vendas ao A3, e o `plum_logs` mostra `reconhecedor` de volta.

### B21 · 🔧 Planilha já cadastrada para de virar base duplicada

**O bloco mais barato e o que mais dói hoje** (§A4).

`handleConectarPlanilha` procura por `google_sheet_id` **+ `google_sheet_gid`**,
em qualquer `status`:

| encontrado | o que acontece |
|---|---|
| `processing` | retoma o rascunho, como já faz hoje |
| `active` | ⛔ **não cria base nova** — avisa que já está cadastrada e oferece abrir a base ou reler a planilha (B22) |
| nada | cadastro novo, como hoje |

⛔ Sem comparação de colunas (§A4).

**Testes:** `vitest` sobre `extrairSheetRef` — os quatro formatos de link do mesmo
documento dão o mesmo `id`.

### B22 · 🔧 "Editar esquema" relê a planilha e reconcilia (C13)

Substitui a edição manual proposta no V3 (§A5). Em `Cfgdatabase.tsx`, sobre uma
base **ativa**:

- **Reler** chama `cabecalhos_da_planilha` e mostra o diff: colunas novas,
  colunas que sumiram, colunas iguais.
- Coluna nova entra com definição vazia, para a pessoa escrever — **sem IA neste
  passo**, como o 👤 pediu. (Chamar o Agente 1 só para as novas é candidato a
  bloco próprio, depois de isto funcionar.)
- Coluna que sumiu é **removida do `schema_metadata` e do `allowed_columns`** de
  todos os cargos, na mesma transação. ⚠️ Senão a matriz de permissões passa a
  citar coluna inexistente — a **C12** por outra porta.
- ⭐ **Preserva o `id` do dataset.** É o ponto: os cards e a matriz sobrevivem.

⚠️ **Colisão de nome vale aqui igual ao passo 1 do cadastro** (C11): dois
cabeçalhos que normalizam para o mesmo nome travam a reconciliação.

### B23 · 🔧 Observações editáveis na base ativa

Na mesma tela do B22: `schema_metadata.observacoes` e `grao` editáveis fora do
cadastro (§A6). Trabalho de tela; o consumo pelo A3 já existe desde o B14.

### B24 · 🔧 O Agente 2 refina só o que a pessoa editou

Guardar a saída original do Agente 1 em estado e no `sketch`, e mandar ao
`refine_semantics` apenas as chaves que divergirem dela (§A7).

⚠️ **A saída volta parcial**, então o merge é no front: o que não foi refinado
fica exatamente como estava. Substituir o objeto inteiro pela resposta apagaria
as colunas não enviadas.

---

## Ordem e o que cada bloco publica

| bloco | migration | deploy Edge | Lambda | front |
|---|---|---|---|---|
| B18 | — | — | **sim** | — |
| B19 | — | `ai-plum-chat` | — | — |
| B20 | — | `ai-plum-chat` | — | sim |
| B21 | — | — | — | **sim** |
| B22 | — | `ai-plum-chat` | — | **sim** |
| B23 | — | — | — | **sim** |
| B24 | — | — | — | **sim** |

⭐ **B21 primeiro, apesar de ser o último na numeração temática.** Ele é de um
dia, não depende de nada, e resolve o problema que morde hoje. Numerar por tema e
executar por dor não é contradição — é o que evita a etapa inteira ficar refém do
bloco mais difícil.

⚠️ **B18 antes de B19, sem exceção** — a Edge Function mandando duas tabelas para
um executor que sobrescreve o `from` produz resultado silenciosamente errado: os
dois pedidos leem a mesma planilha.

---

## O que esta etapa resolve de pendência

| | como |
|---|---|
| **C13** — reconferir base ativa sem uuid novo | ⭐ B22, e o B13 já a tinha tornado natural ao fazer da planilha a identidade |
| **C12** — `allowed_columns` não revalidado | B22 remove a coluna que sumiu da matriz junto |
| **`plum_reconhecimento` vestigial** | B20 volta a usá-la |

---

## O que esta etapa deixa em aberto

- ⭐ **Cruzar duas planilhas numa resposta** (§B2) — o A3 ganha o direito de
  escolher a planilha certa, não de pedir duas e cruzar. Etapa 6, e depende do
  grão declarado, que agora existe.
- **Chamar o Agente 1 para as colunas novas** do B22 — depois de a reconciliação
  manual funcionar.
- ⚠️ **A família de bugs do `fillna(0)` no executor**, achada em 2026-08-25:
  `avg` e `min` tratam valor ilegível como zero, `count` conta linha que somou
  zero, e o caminho escalar diverge do agrupado. **Não é Etapa 3** — é correção
  independente e mais urgente que esta etapa inteira, porque produz número errado
  hoje, com uma planilha só. Ver o plano em
  `C:\Users\berna\.claude\plans\` ou reabrir a investigação.
- **As 25–30 perguntas de avaliação** continuam bloqueantes e sem dono (D-052).
