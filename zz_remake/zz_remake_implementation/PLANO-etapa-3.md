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

### A3 ⭐⭐ O A2 volta como ENCAMINHADOR — e tem DUAS escolhas, não uma

Com **uma** planilha o trabalho dele era vazio — *"que tabelas importam"* era
constante. Com várias, é a pergunta central: mandar o dicionário de seis
planilhas ao A3 em toda pergunta é caro e ruidoso, e ele escolheria mal.

⚠️ **Correção de 2026-08-27, e ela muda o bloco.** Este parágrafo dizia que o A2
volta como *seletor de planilha* e que o cache por `(dataset, versão do
dicionário)` voltava a fazer sentido. 👤 definiu o escopo real:

> **O A2 decide quais bases serão calculadas E quem vai gerar o plano de
> execução.**

Hoje existe um A3 só, o `a3_planejador`, que é pau pra toda obra. A intenção é
ter outros — um `a3_tendencia` ligado a ferramentas de predição, por exemplo. Por
mais que nenhum especialista exista ainda, o valor agora é **deixar a arquitetura
pronta**, não o roteamento em si.

⛔⛔ **E o bloco preservado NÃO SERVE.** A D-049 guardou `adhoc/reconhecedor.ts`,
`_shared/reconhecimento.ts` e `plum_reconhecimento` dizendo que *"apagar seria
jogar fora um bloco inteiro já testado para reescrevê-lo igual"*. Essa frase
morreu, e o motivo está no cabeçalho do próprio módulo:

> ⭐ **Não recebe a pergunta.** É o que torna o resultado cacheável por
> `(dataset, digital do dicionário)` e vale para qualquer pergunta depois.

**Escolher bases exige a pergunta.** Um A2 que vê a pergunta não é cacheável por
aquela chave — e se for cacheado assim de todo modo, devolve a escolha de uma
pergunta para **outra** pergunta, em silêncio. É a classe de bug mais caro deste
produto.

⇒ O A2 é **escrito do zero**, é **por pergunta** e **não cacheia**. E
`plum_reconhecimento` não volta: o índice que o A2 precisa para escolher sai de um
`select` no `schema_metadata` — não há chamada de LLM ali para cachear.

⚠️⚠️ **NOMES: use os do código.** Os quatro arquivos são `a1_porteiro.ts`,
`a2_reconhecedor.ts`, `a3_planejador.ts`, `a4_interprete.ts`. O A3 é o
**planejador**; `reconhecedor` era o nome do **A2** — o que o cadastro
substituiu. Escrever "a3_reconhecedor" cola no A3 o nome do agente que morreu, e
manda quem for implementar procurar um arquivo que não existe.

**Fluxo hoje:** `a1_porteiro → a3_planejador → executor → a4_interprete`
**Fluxo alvo:** `a1_porteiro → a2_encaminhador → a3_* → executor → a4_interprete`

⭐ **`a3_tendencia`, sem acento.** Nome de arquivo neste repositório é ASCII.

#### O contrato do A2

```
recebe:  a pergunta · o ÍNDICE das bases da organização · o REGISTRO de agentes
devolve: { agente: "a3_planejador", bases: ["vendas", "estoque"],
           presuncao: "…", inviavel?: "…" }
```

**a · ⭐ O índice das bases não é o dicionário.** Mandar o dicionário completo de
seis bases ao A2 move o custo um salto em vez de resolvê-lo — é o problema que ele
existe para atacar. O que ele precisa é: por base, o nome, o **grão**, uma linha
de descrição e a **lista de colunas sem as descrições**. ⇒ `paraIndice(d)` ao lado
do `paraPrompt(d)` que já existe em `_shared/dicionario.ts:265`; reusar o módulo,
não escrever um segundo formatador — `paraPrompt` já resolve o *"(sem descrição)"*,
que omitir faria a coluna parecer inexistente. O A3 continua recebendo o
dicionário **inteiro**, mas só das bases escolhidas. É aí que a economia mora.

**b · ⭐⭐ O registro de agentes é DADO, e o dono dele é o ADMINISTRADOR.**
`_shared/agentes.ts`, uma entrada por agente: `{ id, papel, quando_usar,
capacidades }`. Dele saem duas coisas **geradas**: o trecho do prompt do A2 que
descreve as opções, e o `switch` que despacha.

⚠️ Sem isso, acrescentar um A3 é editar um prompt **e** um dispatch em lugares
diferentes — e eles divergem em silêncio, que é o padrão do D-028 e da divergência
TS↔Python do D-017. Um dono, dois consumidores, como o `MODELO_POR_PAPEL`.

⛔ Quem escreve o `quando_usar` e as `capacidades` somos **nós**, não o cliente.
Logo: **constante em código**, versionada, publicada por deploy. Fica fora de
tabela no banco (I-03: o código no repositório deixa de ser o que está rodando, e
daria ao cliente superfície de escrita sobre o roteamento), fora de secret (o
mesmo motivo pelo qual `MODELOS` não é env var, já escrito em `llm_core.ts`) e
fora do `schema_metadata` (ali é território do cliente). A fronteira, que é a
mesma forma do D-039: o **cliente** escreve o que os dados significam; o
**administrador** escreve o que os agentes sabem fazer.

**c · As duas escolhas são acopladas e saem na MESMA passada.** Um `a3_tendencia`
precisa de base temporal; escolher as bases supondo o generalista e só depois
rotear entregaria base errada ao especialista. O prompt diz explicitamente que a
capacidade do agente restringe a base elegível.

**d · ⛔ Id desconhecido cai no `a3_planejador`, nunca em erro.** Um roteador que
levanta exceção transforma um typo do modelo em **chat morto**. Valida contra o
registro; não casou, despacha para o generalista e grava `codigo_erro`. Mesmo
espírito do `metadados`, que devolve `{"existe": false}` por coluna em vez de
recusar a base inteira.

**e · ⛔ A escolha de base vira PRESUNÇÃO DECLARADA.** Se o A2 pega 1 de 6 e a
resposta precisava de 2, o número sai **errado e confiante** — a mesma classe do
D5 (data trocada na origem), que é a falha contra a qual este produto tem menos
defesa. *"Respondi olhando só a planilha de Vendas."* A máquina de presunções já
existe no A3; reusar.

**f · `inviavel` também no A2.** *"Nenhuma base responde isso"* é resposta
legítima e é mais barata aqui que deixar o A3 inventar um `from`. `plum_logs.
status` já aceita o valor.

#### ⚠️ O roteamento com um destino só é INFALSIFICÁVEL — conserto agora, não depois

Com um A3, o A2 sempre acerta: não há como distinguir roteador funcionando de
roteador quebrado. O primeiro teste real seria no dia em que o segundo A3 sobe —
o pior momento possível para descobrir que o despacho nunca rodou.

1. ⭐ O registro aceita uma entrada **só de teste** (um `a3_tendencia` de
   mentira), para a suíte afirmar que uma pergunta de tendência escolhe o
   especialista e **não** o generalista. É o que torna o roteador falsificável
   antes de o especialista existir.
2. A escolha **e o motivo** vão para `plum_logs.resposta` da etapa
   `encaminhador` desde o primeiro dia. Sem coluna nova.

⚠️ Isto é o I-13 aplicado antes do erro: critério que só confere *"a peça está no
lugar?"* dá verde para mecanismo que nunca executou.

#### O acoplamento a mexer

| Onde | O quê |
|---|---|
| `_shared/llm_core.ts` | `Papel` ganha `encaminhador`; `MODELO_POR_PAPEL` ganha `encaminhador: { provedor: "google", modelo: MODELOS.FLASH }`. ⭐ **`MODELOS.FLASH` já É `gemini-3.7-flash`** — o pedido do 👤 é uma linha, não uma constante nova. E é a linha certa pela regra do próprio arquivo: classificação sobre entrada curta que roda em toda pergunta é Flash |
| `_shared/llm_core.test.ts` | itera todos os papéis (`:67`, `:92`, `:157`) — cobre o novo de graça |
| migration nova | ⚠️ **acrescenta** `'encaminhador'` ao CHECK de `plum_logs.etapa` e **mantém** `'reconhecedor'`: o A2 rodou de 2026-08-20 a 08-25 e há linhas com esse valor. Não destrutiva (D-005) |
| §A2 (tabela inexistente) | 🔮 deixa de ser detalhe e passa a **pré-requisito**: o A2 é justamente quem passa a poder errar o `from`, e hoje `from` errado devolve `{"error": …}` em vez de levantar ⇒ card vazio calado |

⛔ **Não** renomear o `a3_planejador`, e **não** reaproveitar o slot
`reconhecedor` para o encaminhador.

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

### B20 · O `a2_encaminhador` — escolhe as bases E escolhe o A3

⭐ Escrito **do zero** (§A3). Não é o `reconhecedor` adaptado: aquele não vê a
pergunta, e este precisa dela.

**Arquivos novos:** `_shared/agentes.ts` (o registro), `adhoc/encaminhador.ts`,
`adhoc/prompts/a2_encaminhador.ts`, e `paraIndice()` em `_shared/dicionario.ts`.

- **Entrada:** a pergunta + o **índice** das bases (nome, grão, uma linha,
  colunas sem descrição) + o registro de agentes, gerado de `agentes.ts`.
- **Saída:** `{ agente, bases[], presuncao, inviavel? }`.
- ⛔ **Não cacheia.** Ver §A3 — a chave por digital do dicionário devolveria a
  escolha de uma pergunta para outra, calada.
- ⛔ `agente` desconhecido ⇒ `a3_planejador` + `codigo_erro`. Nunca exceção.
- ⭐ A escolha de bases é **presunção declarada** e chega ao usuário.
- ⚠️ **Uma base só: o A2 ainda RODA**, porque a segunda escolha (qual A3) existe
  independente do número de bases. Com um A3 e uma base ele é quase um no-op —
  🔮 e se a medição mostrar que é gasto puro, o portão de "só roda com 2+ bases"
  volta a valer para a metade de seleção, nunca para a de roteamento.

**Pronto quando** (as três, e a terceira é a que costuma faltar):

1. Numa organização com três bases, a pergunta sobre vendas leva **só** a base de
   vendas ao A3, e `plum_logs` traz a etapa `encaminhador` com a escolha **e o
   motivo** em `resposta` — conferido no banco, não na tela (I-12).
2. Acrescentar um agente de mentira a `agentes.ts` muda o prompt **e** o dispatch
   **sem editar mais nenhum arquivo**. Precisou de uma segunda edição ⇒ o
   registro não é dono único.
3. ⛔ A suíte afirma que uma pergunta de tendência escolhe o `a3_tendencia` de
   teste e **não** o generalista. Sem isso o roteamento não está testado — está
   só instalado.

### B21 · 🔧 Planilha já cadastrada para de virar base duplicada — ✅ **FEITO em 2026-09-03**

**O bloco mais barato e o que mais dói hoje** (§A4). Ver
`execucao/B21-base-duplicada/MANUAL.md` e a **D-055**.

⭐ **Entrou uma coisa que não estava no plano, e era pré-requisito:** o link de "Publicar na web"
(`/spreadsheets/d/e/2PACX-…`) devolvia `id: "e"` para **toda** planilha publicada. Enquanto o `id` era
só parâmetro de leitura isso era falha isolada; virando **chave de identidade**, duas planilhas
publicadas diferentes viravam "a mesma base". Fechado junto, com a segunda porta (o "Salvar URL" do
Editar Esquema, que apontava uma base ativa para o sheet+aba de outra sem conferir nada).

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

### B22 · 🔧 "Editar esquema" relê a planilha e reconcilia (C13) — ✅ **FEITO em 2026-09-03**

Substitui a edição manual proposta no V3 (§A5). Ver
`execucao/B22-reler-e-reconciliar/MANUAL.md` e a **D-056**.

⭐ **Duas decisões que o plano deixou em aberto e foram fechadas na execução:** a *ordem* dos dois
updates substitui a transação que o cliente Supabase não tem (permissão primeiro, dicionário depois —
a ordem inversa é que produziria a C12), e a **`versao` do dicionário é preservada, nunca promovida**:
reconciliar não é conferir.

Em `Cfgdatabase.tsx`, sobre uma base **ativa**:

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

### B23 · 🔧 Observações editáveis na base ativa — ✅ **FEITO em 2026-09-03**

Na mesma tela do B22: `schema_metadata.observacoes` e `grao` editáveis fora do
cadastro (§A6). Trabalho de tela; o consumo pelo A3 já existe desde o B14.

⭐⭐ **Saiu MAIOR que este escopo, a pedido do 👤:** entraram também
`papel_analitico` e `vocabulario_util` por coluna. ⇒ Na prática o que ficou
editável é o **dicionário v2 inteiro** numa base ativa, não só os dois campos de
base. Ver `execucao/B23-dicionario-na-base-ativa/MANUAL.md`.

⭐ **E apareceu um buraco que este bloco não previa:** *acrescentar* observação
não existia em lugar nenhum — nem no cadastro. Só dava para editar ou apagar o
que o Agente 1 tivesse escrito, então uma base cuja IA não apontou observação
nenhuma **nunca ganhava a primeira**. Que é justamente a que mais vale, porque é
a regra que só a pessoa sabe. Corrigido nos dois lugares.

⚠️ **A decisão dura do bloco não estava aqui:** editar papel, vocabulário e grão
numa base ativa é exatamente o que `versao: 2` afirma ter sido conferido por
gente. Promover virou um **ato explícito** — botão próprio, exigindo o grão,
reversível; salvar edição nunca promove. Ver **D-057**, com o motivo pelo qual a
promoção automática por completude foi recusada.

### B24 · 🔧 O Agente 2 refina só o que a pessoa editou — ✅ **FEITO em 2026-09-03**

Guardar a saída original do Agente 1 em estado e no `sketch`, e mandar ao
`refine_semantics` apenas as chaves que divergirem dela (§A7).

⭐ **Feito nos DOIS lugares**, e não só no cadastro como este bloco dizia: o
"Editar Esquema" tinha o mesmo defeito, na mesma tela que o B23 estava mexendo.
Lá a linha de base é o que está **salvo no banco**, não a saída de um agente.

⛔ **E saiu de lá o campo "Ordem para o Agente 2 (Opcional)"**, que travava o
botão quando vazio e **nunca era enviado** — a ação não lê `prompt` nenhum. Não
foi consertado mandando: o prompt do Agente 2 diz *"PRESERVE O CONTEÚDO, você
melhora a redação, não o conteúdo"*, e um campo de ordem livre briga com o papel
dele.

⚠️ **A saída volta parcial**, então o merge é no front: o que não foi refinado
fica exatamente como estava. Substituir o objeto inteiro pela resposta apagaria
as colunas não enviadas.

---

## Ordem e o que cada bloco publica

| bloco | migration | deploy Edge | Lambda | front | estado |
|---|---|---|---|---|---|
| B18 | — | — | **sim** | — | ✅ 2026-08-31 |
| B19 | — | `ai-plum-chat` | — | — | ✅ 2026-08-31 |
| B20 | — | `ai-plum-chat` | — | sim | ✅ 2026-08-31 |
| B21 | — | — | — | **sim** | ✅ 2026-09-03 |
| B22 | — | ⚠️ **— (ver abaixo)** | — | **sim** | ✅ 2026-09-03 |
| B23 | — | — | — | **sim** | ✅ 2026-09-03 |
| B24 | — | — | — | **sim** | ✅ 2026-09-03 |

⚠️ **Correção de 2026-09-03: o B22 NÃO precisa de deploy de `ai-plum-chat`**, e esta tabela dizia que
sim. A ação `cabecalhos_da_planilha` já servia base ativa — `exigirAdminDaBase` confere organização,
cargo e status **da pessoa**, nunca o `datasets.status`. Não havia nada a mudar do lado do servidor.

⭐ **O que isso muda na prática:** B21 e B22 são **front puro**, então a assimetria de deploy do I-14
(Vercel publica no push, Edge Function não) simplesmente não existe neles. Nenhuma ponte, nenhuma
janela.

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
| **C13** — reconferir base ativa sem uuid novo | ✅ B22, e o B13 já a tinha tornado natural ao fazer da planilha a identidade |
| **C12** — `allowed_columns` não revalidado | ✅ B22 remove a coluna que sumiu da matriz junto |
| **C14** — recadastrar a mesma planilha não avisava nada | ✅ B21. ⚠️ E o texto da C14 estava errado: dizia que a detecção não podia ser pela URL |
| **C15** — mudar coluna no Sheets obrigava a recadastrar | ✅ B22 |
| **C16** — "Refinar semântica" refinava todas as colunas | ✅ B24, nos dois lugares |
| **C17** — observações da base editáveis fora do cadastro | ✅ B23, e saiu maior: o dicionário v2 inteiro |
| **`plum_reconhecimento` vestigial** | ⚠️ **resolvido pelo oposto do que esta linha previa.** Ela dizia *"B20 volta a usá-la"*; o B20 a **dropou** (`20260827120000_drop_plum_reconhecimento.sql`), porque o que ela guardava deixou de ser uma chamada de LLM — o índice do A2 sai de um `select` no `schema_metadata`. O §A3 já dizia isso; esta tabela é que ficou para trás |

---

## O que esta etapa deixa em aberto

- ⭐ **Cruzar duas planilhas numa resposta** (§B2) — o A3 ganha o direito de
  escolher a planilha certa, não de pedir duas e cruzar. Etapa 6, e depende do
  grão declarado, que agora existe.
- **Chamar o Agente 1 para as colunas novas** do B22 — depois de a reconciliação
  manual funcionar.
- ~~**A família de bugs do `fillna(0)` no executor**~~ — ✅ **RESOLVIDA em 2026-09-03**, commit
  `db52921`, no Lambda desde 12:38Z. Um conversor único (`_como_numero`) para os três caminhos:
  `avg` deixa de contar a célula ilegível no denominador, `min` deixa de virar R$ 0,00, `max` deixa
  de virar 0 quando tudo é negativo, e coluna inteiramente ilegível devolve `None` em vez de soma 0.
  ⛔ A **C10 ficou intocada** de propósito — o motivo dela é privacidade, não compatibilidade.
  ⚠️ Era pré-requisito do B22: toda coluna que a reconciliação acrescenta nasce em
  `formatting_rule.type = "nenhuma"`, que é exatamente o caso que o bug atingia.
- **As 25–30 perguntas de avaliação** continuam bloqueantes e sem dono (D-052).
