# Remake do Plum — V3

**Base:** V1 + V2 + os comentários em `about_v2`.
**Audiência:** interna (produto + tech). **Status:** proposta para discussão.
**Convenções:** `⭐` central · `⚠️` risco concreto · `✂️` discordância · `❓` decisão sua ·
`⚰️` o que morre · `🏗️` **da plataforma (multi-tenant)** · `🔧` **da implementação (por cliente)**

---

## 0. A frase que organiza o documento

Você escreveu, em caixa alta e com razão:

> ⭐ **O PLUM NÃO É MAIS UMA CONSULTA DE DADOS PARA O USUÁRIO. É UMA CONSULTA DE DADOS PARA A IA.**

E, no comentário sobre §2, refinou o papel:

> *"o plum deve ser um **ARQUITETO**. ele deve traduzir a pergunta do usuário em um plano de ação
> analítico. deixar o usuário direto com a LLM gera confusão para a LLM. fazer usuário ↔ plum ↔
> LLM é ensinar a LLM a fazer a análise certa."*

A V2 tinha o Plum como **motor passivo** (a inteligência mora fora, o Plum só resolve). Você
corrigiu: ele é **motor + arquiteto**. A diferença não é semântica — decide onde está a
propriedade intelectual:

| | V2 (motor passivo) | V3 (arquiteto) |
|---|---|---|
| Quem decide o que buscar | a LLM, livremente | ⭐ o Plum estrutura, a LLM escolhe **dentro** da estrutura |
| Onde está o valor | no executor determinístico | no **andaime** que impede a LLM de errar a análise |
| Vira commodity quando | a LLM ficar boa em pedir dado | quase nunca — o andaime é conhecimento acumulado |

Sequência da V3: **usuário → Plum (arquiteto: que análise essa pergunta exige?) → Plum (motor:
resolve os dados) → LLM (interpreta) → usuário.** A LLM nunca recebe a pergunta crua, e nunca
fala direto com o usuário.

### O que mudou da V2

| | V2 | V3 |
|---|---|---|
| Camadas | tudo misturado num documento | ⭐ **tudo classificado em 🏗️ plataforma ou 🔧 implementação** (§1) |
| Catálogo de insights | 20 receitas por vertical | ⚰️ **morre.** Vira 🏗️ catálogo de **padrões analíticos** (universal) + 🔧 **dicionário de regras de negócio** (por cliente) — §3 |
| Agregação obrigatória | manter, `amostra` só depois | ⚰️ **cai.** Arquitetura híbrida com orçamento de linhas (§6) |
| Segurança | mecanismos na plataforma | **política** é 🔧, **mecanismo** é 🏗️ — e essa distinção é onde eu discordo de você (§7) |
| Escopo de dados | um dataset por pergunta | 🏗️ **banco de dados = N planilhas/CSVs** (§5) |
| Prospecção | frente do roadmap | ⚰️ sai da Etapa 1. Fica na Etapa 2, sem alteração (V1 §5.4) |
| Obsidian | — | 🏗️ nova seção (§11) |

---

## 1. ⭐ A separação que você pediu: plataforma × implementação

O contexto que faltava: **a Plataforma Plum é uma DEMO plug-and-play, multi-tenant, horizontal.**
O cliente conecta as planilhas dele sozinho e sente o gostinho. Gostando, vem a **implementação**
— vertical, feita à mão, sobre a base real dele.

Isso não é um detalhe organizacional. É o critério que decide o que construir, porque cada
camada tem uma economia diferente:

| | 🏗️ Plataforma | 🔧 Implementação |
|---|---|---|
| **Escala** | custo marginal ~zero por cliente | custo marginal alto (horas de gente) |
| **Alvo** | qualquer planilha, qualquer setor | uma base, um setor |
| **Quem faz** | dev, uma vez | equipe técnica, por cliente |
| **Onde cobra** | recorrência, assento | projeto (**"onboarding de dados"**, §10) |
| **Falha típica** | funciona pra todo mundo, encanta ninguém | encanta um, não escala |
| **Regra de ouro** | ⭐ se depende de saber o que a coluna significa, **não é plataforma** | ⭐ se serve pra qualquer base, **não deveria ser feito à mão** |

### 1.1. A classificação de tudo o que os três documentos propuseram

| Item | Camada | Nota |
|---|---|---|
| Contrato `/resolver`, pedidos nomeados, negação parcial | 🏗️ | §2 |
| Arquiteto (decompor pergunta → plano analítico) | 🏗️ | §2 — o ativo principal |
| Catálogo de **padrões analíticos** | 🏗️ | §3.3 — ~12 padrões, universais |
| Motor pandas, RBAC, cache, teto de linhas | 🏗️ | já existe |
| `metadados` como primitiva | 🏗️ | §6 |
| `vocabulario` (valores de dimensão) | 🏗️ mecanismo / 🔧 quais colunas | §4, §7 |
| Multi-planilha num "banco de dados" | 🏗️ | §5 |
| Cenários (`overrides`) | 🏗️ | §3.4 |
| Orçamento de linhas por sessão + auditoria | 🏗️ | §6 |
| **Dicionário semântico** (o que cada coluna significa) | 🔧 | §4 |
| **Regras de negócio** (margem = receita − custo − glosa) | 🔧 | ⭐ §3 — é o que destrava "se A muda, B fica como?" |
| **Relações entre planilhas** (chaves, grão) | 🔧 | §5 |
| Quais colunas são sensíveis / expostas | 🔧 | §7 |
| Insights de domínio ("glosa", "paralisação") | 🔧 | ⚰️ deixam de ser feature da plataforma |
| Prospecção (Apollo + Maisa) | 🏗️ Etapa 2 | fora deste documento |

⚠️ **A tensão central do negócio, na sua própria formulação:** *"sem conseguir trazer insights de
maneira multi-tenant com o produto, morreremos com ticket médio de 23k e ITIP de 2k."*

A tabela acima é a resposta operacional para isso. Traduzindo: **a parte do "insight" que pode ser
multi-tenant é o *como analisar*; a parte que não pode é o *o que significa*.** O erro da V1 e da
V2 foi colocar o catálogo de insights na plataforma quando ele é irredutivelmente 🔧. A §3 conserta
isso, e é a seção mais importante deste documento.

---

## 2. 🏗️ O arquiteto e o motor

### 2.1. Por que o arquiteto existe (e por que você está certo em não largar a LLM solta)

Sua justificativa foi *"deixar o usuário direto com a LLM gera confusão para a LLM"*. Concordo, e
vale nomear as três confusões concretas, porque cada uma vira um requisito do arquiteto:

1. **A LLM não sabe o que ela não sabe.** Pergunta "qual meu lucro?" numa base sem custo: a LLM
   solta usa faturamento como proxy e não avisa. O arquiteto checa viabilidade contra o
   dicionário antes (é o Agente Z de hoje, promovido de porteiro a arquiteto).
2. **A LLM improvisa o caminho.** Duas execuções da mesma pergunta pedem dados diferentes e
   chegam a números diferentes. Isso é fatal num produto que vende precisão. O arquiteto fixa
   o caminho: mesma pergunta → mesmo plano → mesmo número.
3. **A LLM não sabe o que é caro.** Solta, ela pede 8 agregações onde 2 bastavam, ou entra em
   loop. O arquiteto orça.

⭐ **O arquiteto é o único componente do Plum que fica mais valioso com cada LLM nova** (o ponto
que você chamou de genial na V2, agora com nome). A LLM melhor interpreta melhor *dentro* do
andaime. E o andaime é acúmulo de conhecimento sobre como analisar dado de negócio — não é
prompt, é a §3.3.

### 2.2. O contrato, sem mudança de forma

O `/resolver` da V2 §2.1 continua valendo como está: pedidos nomeados (`info_1`, `info_2`), lote
único, um `batchGet` por dataset (decisão 11A que já está no repo), negação **por pedido** e
`linhas_origem` no retorno. **Decidido em `abo  ut_v2`:** é **público** — o Plum deve rodar em
qualquer interface.

⚠️ Uma consequência de ser público que precisa ficar registrada agora, não depois: contrato
público é contrato **versionado**. `/v1/resolver`, mudança de forma só aditiva, e nada que
dependa de "a Maisa é a única chamadora". Refazer um contrato que já tem consumidor externo é
trimestre.

### 2.3. LLM: Gemini pago + Claude em discussão

Com API paga a pressão de **cota** cai; a de **custo por pergunta** continua, e o loop do
arquiteto multiplica.

- 🏗️ **Abstração de provedor desde o começo.** Uma interface, dois adaptadores. O `PRD-PLUM2.0`
  já registra que o legado tinha `llm_guard` como ponto de troca — mesma ideia, um nível acima.
- ⭐ **Papéis diferentes podem usar modelos diferentes, e isso é economia real.** Arquiteto e
  intérprete precisam de raciocínio (modelo caro); classificar escopo e casar vocabulário não
  (modelo barato). O `CLAUDE.md` já faz isso por `temperature`; fazer por **modelo** é o passo
  seguinte e corta custo sem cortar qualidade onde ela importa.
- ⚠️ **Com `amostra` ligada (§6), a escolha de provedor passa a ser decisão de compliance, não só
  de qualidade** — porque dado bruto do cliente sai do seu perímetro. Termos de zero-retention
  por provedor precisam entrar na comparação técnica.

---

## 3. ⭐ Resposta à sua pergunta sobre §5 — e ela derruba o catálogo

Você perguntou:

> *"usando a arquitetura {IA PEDE DADOS PRO PLUM ↔ PLUM RETORNA OS DADOS}, a IA poderia fazer mais
> análises do que um catálogo poderia prever. Por exemplo, se o dado A alterar, como fica o dado B.
> Ou estou errado?"*

**Você está certo, e o catálogo de insights da V1/V2 morre por causa disso.** Um catálogo tem como
teto o que alguém pensou em enumerar. Um laço pedido↔resposta tem como teto o que a LLM consegue
compor — que é maior, e cresce sozinho a cada modelo novo. Insistir no catálogo seria pagar 20
implementações para ficar com o teto mais baixo.

**Mas o exemplo que você escolheu é justamente o que revela onde o laço trava** — e é sorte, porque
é o caso mais instrutivo possível.

### 3.1. "Se o dado A alterar, como fica o dado B" tem dois casos, e só um é respondível

**Caso 1 — A e B ligados por fórmula.** `margem = receita − custo − glosa`. Se a glosa sobe 20k, a
margem cai 20k. Determinístico, exato, e o motor calcula sem esforço (é o `overrides` da V1).
⚠️ **Mas o Plum só acerta se souber a fórmula — e a fórmula não está nos dados.** Ela está na
cabeça do controller do cliente. Nenhuma quantidade de LLM boa a descobre olhando colunas.

**Caso 2 — A e B só associados estatisticamente.** Preço e volume. "Se eu subir o preço 10%, quanto
cai o volume?" A LLM **vai** responder, com número e confiança, e vai estar inventando: ela não tem
elasticidade, tem correlação histórica de um período em que dez outras coisas mudaram junto.

⭐ **A conclusão:** o laço amplia o que pode ser **perguntado**; não amplia o que pode ser
**sabido**. O teto das análises nunca foi o catálogo — é o **dicionário de regras de negócio**. Um
laço aberto sobre um dicionário pobre produz muita análise errada rápido, o que é pior que pouca
análise certa.

### 3.2. Então o catálogo morre e nascem duas coisas — uma de cada camada

| | ⚰️ Catálogo de insights (V1/V2) | 🏗️ Padrões analíticos | 🔧 Dicionário de regras |
|---|---|---|---|
| Conteúdo | "insight de glosa", "insight de paralisação" | comparação temporal, decomposição de variação, Pareto, sazonalidade… | `margem = receita − custo − glosa`; `glosa é perda`; grão = 1 linha por atendimento |
| Escala | 4 dias × 20, por vertical | ~12, **uma vez, pra sempre** | horas por cliente, no onboarding |
| Camada | (nenhuma — era o erro) | plataforma | implementação |
| Teto | o que alguém enumerou | o que a LLM compõe | — |

Essa é a resposta operacional ao seu *"sem insight multi-tenant, morremos com 23k"*: **o que
escala é o repertório de análises; o que não escala é o significado.** E o significado é
justamente o que o cliente já está pagando 23k para você produzir (§10).

### 3.3. 🏗️ O catálogo de padrões analíticos (o que substitui as 20 receitas)

Não são insights, são **formas de analisar** — independentes de setor. Cada padrão é: uma
assinatura de dados que ele exige, os pedidos que ele gera, e o que ele **não** pode concluir.

| Padrão | Exige | Pergunta que atende |
|---|---|---|
| Comparação temporal | data + métrica | "vendi mais que mês passado?" |
| Decomposição de variação | data + métrica + dimensão | ⭐ "**por que** caiu?" — o mais valioso da lista |
| Concentração (Pareto) | dimensão + métrica | "quanto do faturamento vem dos 20% maiores?" |
| Sazonalidade | data + métrica | "que dia/mês vende mais?" |
| Ranking com contexto | dimensão + métrica | "melhores e piores, e o quanto isso é normal" |
| Outlier | métrica | "algum valor fora do padrão?" |
| Tendência | data + métrica | "estou crescendo ou é ruído?" |
| Composição e mudança de mix | dimensão + métrica em 2 períodos | "mudou o que eu vendo ou quanto?" |
| Cohort / recompra | id + data | "cliente novo volta?" |
| Cenário (`overrides`) | fórmula 🔧 | "se A muda, B fica como?" |
| Cobertura / qualidade | qualquer | "quanto da base está vazia ou incoerente?" |
| Cruzamento entre planilhas | 2 tabelas + grão comum 🔧 | §5.2 |

⭐ **Nenhum desses precisa saber o que é glosa.** Todos ficam melhores quando o dicionário sabe.
É exatamente a divisão que você pediu, e note o efeito colateral comercial: **12 padrões × N
clientes** é multi-tenant de verdade — enquanto 20 receitas de saúde valiam zero para o varejo.

⚠️ **`limitacoes` continua obrigatório, e agora é do padrão, não da receita.** "Decomposição de
variação" declara, uma vez, que ela mostra **onde** mudou, nunca **por que**. Isso é R-14 e é
mais barato de garantir em 12 padrões do que em 20 receitas por vertical.

### 3.4. 🔧 O dicionário de regras de negócio — a peça que faltava nos três documentos

É o que transforma o laço em algo que responde o Caso 1. Conteúdo mínimo:

```
formulas:   margem = receita - custo - glosa
            ticket  = receita / pedidos
sinais:     glosa: perda (subir é ruim) · nps: bem (subir é bom)
grao:       vendas = 1 linha por item de pedido
            metas  = 1 linha por mês por loja
relacoes:   vendas.loja_id → lojas.id
temporal:   fechamento contábil no dia 5; agosto/2026 ainda parcial
proibicoes: nunca somar 'preco_unitario' · nunca usar 'status' antigo como ativo
```

Três coisas que isso destrava e que nada mais destrava: cenário correto (Caso 1), sinal certo na
narrativa ("a glosa caiu" é boa notícia — sem `sinais`, a LLM chuta 50% das vezes), e recusa
honesta no Caso 2 ("não tenho como estimar elasticidade a partir dessa base").

⭐ **E isso responde a pergunta 11.6 da V2, que você bloqueou nesta.** A pergunta era "quem revisa
uma receita antes de entrar no catálogo". Com o catálogo morto, ela muda de endereço e fica
melhor: **quem valida as fórmulas, os sinais e o grão é o cliente, durante o "onboarding de
dados"**, e fica assinado. Não é revisão de um artefato nosso — é **extração de conhecimento do
cliente**, que é o que a sua equipe técnica já faz hoje nas 4 vendas, só que sem guardar o
resultado num formato reutilizável.

---

## 4. 🔧+🏗️ O dicionário é o produto (a "nota de produto" que você destacou)

Você apontou como uma das implementações mais importantes esta, da V2 §3.2:

> *o `schema_metadata` é chamado no `CLAUDE.md` de "o cérebro do produto", e ele hoje descreve
> **colunas**. Um cérebro que conhece os conceitos mas não conhece os nomes das coisas é meio
> cérebro.*

Expandindo. O dicionário tem **quatro camadas**, e hoje existe uma:

| Camada | Conteúdo | Hoje | Resolve |
|---|---|---|---|
| 1. Colunas | nome, tipo, significado, `formattingRules` | ✅ existe | "que colunas existem?" |
| 2. **Valores** | vocabulário das dimensões: quais lojas, status, vendedores | ❌ | ⭐ "quanto o vendedor NOME SOBRENOME vendeu?" (V2 §3) |
| 3. **Relações** | chaves entre planilhas, grão de cada tabela | ❌ | §5 — banco com N planilhas |
| 4. **Regras** | fórmulas, sinais, proibições, calendário | ❌ | §3.4 — "se A muda, B fica como?" |

⭐ **As camadas 2, 3 e 4 são o produto que o cliente já compra por 23k, num formato que hoje é
jogado fora.** O `CLAUDE.md` §8 registra que o mapa cabeçalho-original→normalizado morre porque
vive em `datasets.sketch` e `sketch` vira `NULL` na finalização. É o mesmo padrão, mais grave: a
equipe técnica descobre o grão, as fórmulas e os sinais de cada base, e isso fica em Slack e na
cabeça das pessoas.

**Consequência de negócio, e é a que mais importa neste documento:** enquanto o conhecimento não
tem formato, cada cliente é um projeto do zero e o ticket fica travado em 23k por gente-hora. Com
formato, o décimo cliente de varejo chega com um **template de dicionário de varejo** — grão
típico, fórmulas típicas, proibições típicas — e o onboarding cai de semanas para dias. ⭐ **É
assim, e só assim, que consultoria vira produto:** não eliminando o trabalho humano, mas fazendo
cada execução dele baratear a seguinte.

---

## 5. 🏗️ Banco de dados = N planilhas (e o join que R-11 bloqueia)

Você foi explícito: *"a ideia do plum é funcionar desse jeito para um banco de dados com
diferentes planilhas e .csv, não só pra uma."* Isso já é um pedido registrado no repo
(`urgent_multiplas_planilhas_simultâneas.md`, ainda sem plano). Tecnicamente são **dois degraus
com custos muito diferentes**, e confundi-los é o risco aqui.

### 5.1. Degrau 1 — o agente escolhe a planilha (barato, faça agora)

O usuário conecta 5 planilhas em "minha base"; a pergunta é sobre uma delas; o arquiteto escolhe
o `from`. `execute_plan(plan, tables: Dict[str, DataFrame])` **já recebe várias tabelas** — a
assinatura sempre previu isso. O que falta é: o arquiteto ver o dicionário das 5 de uma vez,
resolver o `from`, e a interface parar de exigir seleção manual de base.

⚠️ Custo escondido: o prompt do arquiteto passa a carregar 5 dicionários em vez de 1. Com 4
camadas de dicionário (§4), isso cresce rápido — o arquiteto vai precisar de um passo de
**pré-seleção** (que tabelas essa pergunta pode envolver?) antes do passo de plano. Um modelo
barato resolve.

### 5.2. Degrau 2 — a pergunta atravessa planilhas ⭐

Aqui está o achado técnico da V3. R-11 diz **joins bloqueados**, e a intuição é que
multi-planilha exige derrubar isso. **Não exige — na maioria dos casos.** Separe:

**(a) Join DEPOIS da agregação — grátis, funciona hoje, sem tocar em R-11.**
"Bati a meta?" → `receita por mês` (planilha A) + `meta por mês` (planilha B) → dois vetores
pequenos com a mesma chave (`mês`). ⭐ **Quem cruza é a LLM, com dois números na mão.** Não há
linha bruta, não há join no pandas, não há mudança de invariante. E R-13 é respeitado porque a
comparação é a mesma chave, não uma conta nova.

**(b) Join ANTES da agregação — precisa de join real, é caro.**
"Faturamento dos clientes que também compraram o produto X" → o casamento tem que acontecer
linha a linha, antes de somar. Aqui não há truque: é um join no pandas, exige `relacoes` no
dicionário (§4, camada 3) e é uma mudança de R-11.

⭐ **Recomendação:** implemente (a) explicitamente como padrão analítico ("cruzamento por grão
comum") e **não implemente (b) na Etapa 1**. Minha estimativa é que a maioria das perguntas de
negócio de varejo é (a) — meta vs realizado, estoque vs venda, custo vs receita, todas por
mês/loja/SKU. ❓ Vale medir isso nas 4 bases que vocês já conhecem antes de decidir: **quantas
perguntas reais são (b)?** Se for pouca, R-11 sobrevive à multi-planilha inteira, o que é um
resultado excelente e barato.

⚠️ E o pré-requisito de (a) que ninguém orça: **grão declarado por tabela.** Cruzar `receita por
mês` com `meta por mês` só funciona se as duas forem por mês. Se `metas` for por trimestre, a LLM
vai cruzar errado e ninguém percebe. Grão está na camada 4 do dicionário e é 🔧.

---

## 6. Agregação obrigatória cai — arquitetura híbrida

Você perguntou: *"e se o usuário quiser apenas um dado específico? será que poderia ser usada uma
arquitetura híbrida?"* E decidiu na 11.3: **`amostra` entra, e a tese "a IA não lê seus dados"
cai.**

Concordo com a decisão, e acho que ela é mais fácil de defender do que você está supondo — desde
que a proteção mude de natureza junto. **A proteção deixa de ser estatística e passa a ser
contábil.**

⚠️ **Antes: registro do seu comentário sobre k-anonimato.** Você notou que eu poderia querer
reintroduzir regras do tipo, e que vocês testaram e removeram por alto risco de falha. **Não vou
propor nada dessa família, e o motivo é o mesmo que vocês mediram:** k-anonimato falha porque é
uma regra *estatística* aplicada a dados cuja distribuição ninguém controla — em planilha
organizada por data/evento ela suprime resposta legítima o tempo todo. Tudo abaixo é **contável
e determinístico**: teto de linhas, contador de sessão, log. Não tem regime em que "funciona pra
uma base e falha na outra".

### 6.1. Os tipos de pedido, revisados

| `tipo` | Devolve | Teto | Camada |
|---|---|---|---|
| `metadados` | colunas, tipos, período, nº de linhas, % de nulo | — | 🏗️ sempre permitido |
| `agregado` | escalar ou vetor pequeno | `limit` 1..500 | 🏗️ |
| `serie` | agregado por período | idem | 🏗️ |
| `vocabulario` | valores distintos + contagem | por cardinalidade | 🏗️ mecanismo, 🔧 política |
| **`registro`** | linhas identificadas por filtro explícito | ⭐ **≤ 20 linhas** | 🏗️ novo |
| **`amostra`** | primeiras/aleatórias N linhas, para a LLM entender a forma | ⭐ **≤ 20 linhas** | 🏗️ novo |

`registro` atende o seu "quero um dado específico" ("qual foi a venda do pedido 4471?").
`amostra` atende o seu comentário de que ver dado no prompt é a melhor forma de a LLM
**interpretar**, não só consultar.

### 6.2. ⭐ A proteção que substitui a agregação obrigatória: orçamento de linhas por sessão

Teto por pedido é insuficiente e é o erro fácil de cometer: 200 pedidos × 20 linhas = a base
inteira, um pedido por vez, sem violar nenhum teto.

> **Orçamento:** cada sessão (usuário × dataset × janela) tem um teto de **linhas brutas
> entregues** — sugestão inicial: 200. `agregado`, `serie` e `metadados` **não consomem
> orçamento**. `registro` e `amostra` consomem. Estourou: o motor recusa e o arquiteto é obrigado a
> voltar a agregar.

Por que isso é melhor que agregação obrigatória: é **um número**, auditável, ajustável por
organização (como `dashboard_max_rows` já é), sem regime de falha silenciosa, e transforma
exfiltração em massa de "possível" em "visível no log e barrada no contador". É a mesma escola do
teto de linhas que o executor já aplica antes do parse.

⚠️ **O que de fato se perde, dito sem maquiagem:** a frase "o modelo nunca vê linha da sua base"
deixa de ser verdadeira. A frase honesta passa a ser: *"o modelo vê, no máximo, N linhas por
sessão, das colunas que você liberou, e todo acesso fica registrado."* Menos vendável, ainda
defensável — e, como você disse, provavelmente irrelevante para a maioria dos clientes de médio
porte no varejo. Só não deixe de dizer a verdade nova: cliente que descobre sozinho é o pior
caminho.

---

## 7. Segurança: ✂️ política é 🔧, mecanismo é 🏗️

Seu comentário:

> *"eu acho que essas regras de segurança falhariam no modelo multi-tenant, porque qualquer
> previsão de segurança com certeza falharia com a variedade de planilhas. a segurança deve entrar
> para a etapa de implementação."*

**Concordo em metade, e a metade em que discordo é a que já quebrou este produto uma vez.**

**Onde você está certo:** *o que* é sensível não é previsível. Nenhuma heurística da plataforma vai
adivinhar que `obs_cliente` tem CPF colado à mão ou que `codigo_interno` é o nome do paciente. Toda
regra que tenta inferir sensibilidade a partir da forma da planilha vai errar nas duas direções — é
o mesmo modo de falha do k-anonimato e da decisão de tipo por keyword-match que o `CLAUDE.md` já
registra como dívida. **Política de sensibilidade é 🔧, decidida com o cliente no onboarding.**

✂️ **Onde eu discordo:** *mecanismo* não pode ir para a implementação. Isolamento de tenant, RLS,
`current_org_id()`, RBAC de coluna, o teto de linhas, o orçamento da §6.2, o log — nada disso
depende de conhecer a planilha, e **tudo isso é a plataforma que tem que garantir**, porque a
plataforma é onde clientes reais sobem dados reais. Uma demo multi-tenant com dado real de 5
empresas é um alvo tão legítimo quanto a produção. O incidente de 2026-07-22 (escalonamento de
privilégio) foi falha de **mecanismo de plataforma** — e ele aconteceu justamente porque uma
decisão de segurança foi delegada a um lugar que não podia decidir.

⭐ **A regra que eu escreveria:** *a plataforma fornece os cofres; a implementação decide o que
guardar em cada um.* Cofre sem chave é inútil, chave sem cofre é pior.

### 7.1. Respondendo direto: `vocabulario_exposto` é keyword?

> *"qualquer uso de chatbot (palavras-chave) em multi-tenant é uma grande perda de tempo. e é isso
> que `vocabulario_exposto` propõe, não é?"*

**Não** — e a confusão é justa, porque eu não fui claro. `vocabulario_exposto` não analisa texto
nem procura palavra-chave em nada. É um **booleano por coluna**, default `false`, gravado no
dicionário. Não há inferência, não há heurística, não há classificador. Só:

```
vendedor  → vocabulario_exposto: true    (a LLM pode ver a lista de vendedores)
cliente   → vocabulario_exposto: false   (não pode)
```

Ou seja: 🏗️ o **mecanismo** (respeitar a flag) é plataforma, determinístico, e não erra;
🔧 o **valor** da flag é implementação, decidido por humano no onboarding. É exatamente a
distinção da §7 aplicada a um campo.

⚠️ **E se a flag não existir, o default do sistema é "expõe tudo"** — a lista de clientes de todas
as bases indo para o modelo sem ninguém ter decidido isso. É mais barato ter a flag e não usá-la
do que descobrir que ela faltava.

---

## 8. Etapa 1 × Etapa 2

Decidido em `about_v2`: prospecção sai da Etapa 1. **Etapa 1 = fazer a IA usar o pandas para
analisar o banco de dados do usuário.**

### Etapa 1 — o produto analítico

| # | Frente | Camada | Esforço | Por quê |
|---|---|---|---|---|
| 0 | Medir: perguntas reais no chat + as 4 bases (quantas perguntas são join-antes? §5.2) | — | 1 sem | Decide §5.2 e os primeiros padrões. Sem isso é palpite |
| 1 | `metadados` + `vocabulario` (camada 2 do dicionário) | 🏗️ | 2 sem | Mata a fragilidade do "NOME SOBRENOME"; destrava o resto |
| 2 | Contrato `/resolver` versionado + negação parcial + orçamento de linhas | 🏗️ | 3 sem | A fundação. Público desde o desenho (§2.2) |
| 3 | Arquiteto + 6 primeiros padrões analíticos | 🏗️ | 4 sem | O ativo. Começar por decomposição de variação, comparação temporal, Pareto, sazonalidade, ranking, cobertura |
| 4 | `registro` + `amostra` com orçamento | 🏗️ | 1 sem | A híbrida da §6 |
| 5 | Multi-planilha degrau 1 + cruzamento por grão comum | 🏗️ | 2–3 sem | O `urgent_*.md`; degrau 2 só se a medição da frente 0 pedir |
| 6 | Dicionário camadas 3 e 4 (relações, fórmulas, sinais, grão) + editor | 🏗️ mecanismo / 🔧 conteúdo | 3 sem | ⭐ Sem isso, cenário e "se A muda B" não existem |
| 7 | Produtizar o **onboarding de dados** (§10) | 🔧 com ferramenta 🏗️ | 2 sem | Onde está a receita hoje |

### Etapa 2 — a camada de relacionamento

Maisa como tradutor sobre o contrato · Plum Externo (cliente final, V1 §5.3) · prospecção
Apollo+ICP (V1 §5.4). Nada disso muda; só sai da fila.

---

## 9. Riscos

| # | Risco | Camada | Gravidade | Mitigação |
|---|---|---|---|---|
| V1 | LLM inventando relação causal entre bindings (Caso 2 da §3.1) | 🏗️ | **crítico** | R-14; `limitacoes` por padrão; recusa explícita quando falta fórmula |
| V2 | Exfiltração por acúmulo de `amostra`/`registro` | 🏗️ | **crítico** | orçamento por sessão, não por pedido (§6.2) |
| V3 | Cruzamento entre planilhas com grão diferente → número errado plausível | 🔧 | **alto** | grão obrigatório no dicionário; recusar cruzamento sem grão declarado |
| V4 | Dicionário de regras não ser preenchido (dá trabalho e não dá dopamina) | 🔧 | **alto** | ⭐ é o entregável pago do onboarding, não uma tela opcional |
| V5 | Conhecimento continuar morrendo em Slack e na cabeça da equipe | 🔧 | **alto** | formato versionado + templates por vertical (§4) |
| V6 | Vocabulário de dimensão vazando PII | 🏗️+🔧 | alto | flag default `false` (§7.1) |
| V7 | Segurança delegada à implementação e faltando na plataforma | 🏗️ | **crítico** | §7 — mecanismo é plataforma, sem exceção |
| V8 | Custo do loop com modelo caro | 🏗️ | médio | teto de rodadas; modelo barato nos papéis baratos (§2.3) |
| V9 | `extractColumns` não cobrir `pedidos[]`/`overrides`/`vocabulario.col` → bypass de RBAC | 🏗️ | **crítico** | mesma armadilha do `walkArithmetic`; teste antes de publicar |
| V10 | Contrato público quebrando consumidor externo | 🏗️ | médio | versionar desde `/v1` |
| V11 | ⭐ **Ficar em 23k + 2k** | negócio | **existencial** | §10 |

---

## 10. O negócio: escapar do 23k + ITIP de 2k

Você confirmou as duas leituras: a equipe **é** o produto hoje, e o wedge é real — **médio porte,
varejo, base bagunçada, equipe técnica pequena, orçamento**. Para esse cliente a dificuldade de
consulta não é incômodo, é dor. E você nomeou o produto: **onboarding de dados**.

⭐ **O problema não é o ticket de 23k — é que ele não deixa nada atrás.** Cada venda gasta a
equipe e produz conhecimento que evapora. Três movimentos, em ordem de impacto:

1. **O entregável do onboarding de dados passa a ser o dicionário de 4 camadas (§4), assinado
   pelo cliente.** Mesmo trabalho, mesmo preço, mas agora com artefato — e um artefato que o
   produto consome. Hoje o artefato é uma base limpa; amanhã é uma base limpa **+ o modelo de
   negócio dela em formato executável**.
2. **Template de dicionário por vertical.** O décimo varejista chega com grão, fórmulas e
   proibições típicas pré-preenchidas. O onboarding cai de semanas para dias, e a margem do
   projeto sobe sem o preço cair. ⭐ **Isso é o único mecanismo neste documento que faz consultoria
   escalar** — não eliminando o humano, mas fazendo cada execução baratear a próxima.
3. **A recorrência tem que ser o que cresce sozinho.** O que o cliente perde ao cancelar no mês
   13 não pode ser "a base limpa" (ela já é dele). Tem que ser: padrões analíticos novos que
   entram sem projeto, o cruzamento das planilhas novas que ele foi conectando, o insight
   proativo. ❓ **Qual é a linha do contrato que descreve isso?** Se não existe, o ITIP de 2k é
   consequência, não acidente.

⚠️ **E um alerta sobre a frase "insight multi-tenant".** Pela §3, o que é multi-tenant é o
*repertório*, não o *insight*. Um insight sempre precisa do dicionário daquele cliente para não
ser genérico. Isso não é má notícia: significa que o produto **precisa** do onboarding, ou seja,
que serviço e produto se vendem um ao outro. É a forma saudável dessa dependência — o insalubre é
a de hoje, em que o serviço vende e o produto pega carona.

---

## 11. 🏗️ Obsidian: como organizar o projeto para o Claude Code não se perder

Você quer jogar o projeto no Obsidian para separar contextos. As duas ferramentas querem coisas
diferentes — o Obsidian quer links e notas atômicas; o Claude Code quer **contexto escopado e
arquivo pequeno**. Dá para servir aos dois com uma decisão de layout e uma regra.

### 11.1. A decisão: o vault É o repositório

Vault separado significa duas fontes de verdade e uma delas apodrece. Abra a **raiz do repo** como
vault. Custo: configurar exclusões (obrigatório, ver 11.5).

### 11.2. ⭐ O mecanismo que resolve "o Claude Code se perde": um `CLAUDE.md` por fronteira

Não é o Obsidian que resolve isso — é o Claude Code lendo o `CLAUDE.md` da raiz **mais** o da
pasta em que está mexendo. Hoje existe um só, com ~400 linhas cobrindo tudo. Quebrado por
fronteira, cada tarefa carrega só o contexto dela:

```
CLAUDE.md                    ← só o que é global: stack, comandos, invariantes, a §1 deste doc
plataforma/CLAUDE.md         ← "aqui só entra o que serve a QUALQUER base.
                                 Se depende do significado de uma coluna, é implementacao/."
implementacao/CLAUDE.md      ← "aqui vive conhecimento de cliente. Nunca importado por código
                                 da plataforma; carregado como dado."
```

⭐ **Esse arquivo de fronteira é o guardrail de verdade.** Ele não descreve código, descreve
**onde a coisa pertence** — que é exatamente o erro que a V1 e a V2 cometeram (catálogo vertical
na plataforma).

### 11.3. Estrutura de pastas

```
00-mapa/
  MOC-plataforma.md · MOC-implementacao.md · MOC-negocio.md
  glossario.md               ← arquiteto, motor, padrão, receita(⚰️), grão, ITIP…
10-plataforma/     CLAUDE.md
  arquiteto/ · contrato-resolver/ · padroes-analiticos/  (uma nota por padrão)
  motor/ · onboarding-tecnico/
20-implementacao/  CLAUDE.md
  metodo/                    ← como conduzir um onboarding de dados (o playbook)
  templates/                 ← template-varejo.md, template-saude.md
  clientes/<cliente>/        ← dicionario.md · regras.md · relacoes.md · historico.md
30-negocio/        icp.md · precificacao.md · vendas-realizadas.md · narrativa.md
40-decisoes/       D-001-….md   ← uma nota por decisão, irreversível-first
50-riscos/         R-001-….md   ← uma nota por risco, com mitigação e dono
90-arquivo/        REMAKE-…_V1.md · _V2.md · about_v1 · about_v2
```

⚠️ **`20-implementacao/clientes/` tem dado de cliente.** Repo privado, e se algum dia deixar de
ser: essa pasta sai antes, não depois. Considere `.gitignore` com um `exemplo-cliente/` versionado
para servir de molde.

### 11.4. As cinco regras que fazem isso funcionar (sem elas vira pasta com markdown)

1. **Uma nota = uma decisão ou um conceito.** Documento longo (V1/V2/V3) é narrativa, vai para
   `90-arquivo/` depois de destrinchado em notas. ⭐ Enquanto a decisão só existir dentro de um
   documento de 500 linhas, nenhum agente vai achá-la.
2. **Frontmatter obrigatório e curto:**
   ```yaml
   camada: plataforma | implementacao | negocio
   status: proposta | decidido | superado
   decide: "o que esta nota decide, em uma linha"
   ```
   `camada` é o campo que operacionaliza a separação que você pediu. Se você não consegue
   preencher, a nota está misturando duas coisas.
3. **Nota superada nunca é apagada** — vira `status: superado` com link para a que a substituiu.
   É o que o `CLAUDE.md` atual já faz bem, com as correções datadas ("⚠️ Correção de 2026-08-12").
   Preserva o *porquê*, que é a parte que o agente não reconstrói.
4. **Links `[[ ]]` à vontade.** São ricos no Obsidian e inofensivos para o Claude Code — que
   inclusive resolve o nome do arquivo.
5. ⚠️ **Não dependa de Dataview para nada essencial.** Painel gerado por plugin é invisível para
   qualquer agente. Índice que importa é lista escrita à mão nos MOCs.

### 11.5. Armadilhas de configuração (as três que doem)

- **`node_modules` e `dist`** têm milhares de `.md`. Sem excluir em *Settings → Files & Links →
  Excluded files*, a busca e o grafo do Obsidian ficam inúteis.
- **`.obsidian/`**: versione `app.json` e os plugins core; ignore `workspace.json` (muda a cada
  clique e polui todo diff).
- **Renomear nota move arquivo.** O Obsidian atualiza os `[[links]]`, mas **não** atualiza um
  caminho citado dentro de código ou de um `CLAUDE.md`. Ao renomear, procure o nome antigo em
  `src/` e nos `CLAUDE.md`.

### 11.6. Como usar isso na prática com o Claude Code

- Tarefa de plataforma: abra a sessão na raiz e diga em que pasta está mexendo. Ele carrega o
  `CLAUDE.md` raiz + o de `10-plataforma/`.
- Tarefa de cliente: aponte para `20-implementacao/clientes/<cliente>/`. Ele carrega a fronteira
  certa e **não** vai tentar generalizar o dicionário daquele cliente para a plataforma — que é o
  erro exato que você está tentando prevenir.
- ⭐ Antes de aceitar qualquer proposta de feature, uma pergunta: **"isso é `camada: plataforma` ou
  `camada: implementacao`?"** Se a resposta for "os dois", ainda não está desenhado.

---

## 12. ❓ Decisões abertas

1. **Quantas perguntas reais exigem join *antes* da agregação?** (§5.2) Decide se R-11 sobrevive.
   Mensurável nas 4 bases que vocês já conhecem, em uma semana.
2. **Orçamento de linhas por sessão: qual número?** (§6.2) Sugestão 200; decidir por organização,
   como `dashboard_max_rows` já é.
3. **Quais 6 padrões analíticos primeiro?** (§8) Minha aposta: decomposição de variação primeiro —
   é o "por que caiu?", o que mais parece analista e o que o Excel menos entrega.
4. **A frase nova de privacidade** (§6.2) entra na LP e na proposta, ou fica só na resposta ao
   comitê de segurança do cliente?
5. **Gemini, Claude, ou os dois por papel?** (§2.3) Decisão técnica com consequência de compliance
   depois da `amostra`.
6. **Quem, do lado do cliente, assina o dicionário de regras?** (§3.4) Sem essa pessoa, V4 não tem
   mitigação — e é ela que substitui a pergunta 11.6 da V2.

---

## Anexo — invariantes, versão V3

| Invariante | V3 |
|---|---|
| R-01 read-only | absoluto, sem asterisco |
| R-02 IA planeja, código executa | mantido para **número**. A LLM passa a ver ≤ N linhas por sessão para **interpretar** (§6) |
| R-11 limites do plano | + `overrides`, + `pedidos[]`, + `from` resolvido pelo arquiteto entre N tabelas. **Joins continuam bloqueados** — cruzamento acontece depois da agregação (§5.2) |
| R-12 k-anonimato | permanece removido. Nada da mesma família é reintroduzido (§6) |
| R-13 só o Python multiplica | mantido |
| **R-14** | nenhuma afirmação causal ou contrafactual sem fórmula declarada no dicionário 🔧 (§3.1) |
| **R-15 (nova)** | ⭐ orçamento de linhas brutas por sessão, com log. Substitui a agregação obrigatória como proteção contra exfiltração (§6.2) |
| **R-16 (nova)** | ⭐ mecanismo de segurança é 🏗️ plataforma; política de sensibilidade é 🔧 implementação. Nenhum dos dois delega para o outro (§7) |
| Agregação obrigatória | ⚰️ deixa de ser regra. Vira default do arquiteto, não trava do executor |
