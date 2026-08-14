# Remake do Plum — V2

**Base:** `REMAKE-PLUM-tese-e-arquitetura_V1.md` + os comentários em `about_v1`.
**Audiência:** interna (produto + tech). **Status:** proposta para discussão.
**Convenções:** `⭐` central · `⚠️` risco concreto · `✂️` discordância · `❓` decisão sua ·
`⚰️` o que morre da V1.

---

## 0. Diff da V1 — leia esta seção antes de tudo

A V1 estava organizada em torno de "empurrar o Plum na cadeia dado→ação". Isso continua
verdadeiro, mas **dois dos seus comentários mudam a arquitetura**, não só a ênfase. A V2 é
menor que a V1, não maior.

| | V1 | V2 |
|---|---|---|
| **O que o Plum é** | produto de chat com pipeline Z→A→executor→C | ⭐ **motor de resolução de dados** com contrato explícito. O chat é um cliente fino |
| **Onde mora a inteligência** | dentro do Plum (Agente A planeja, C narra) | **fora** — Maisa (ou qualquer agente) raciocina; o Plum obedece pedidos nomeados |
| **Camada de escrita** | 3 variantes, (A) cenários recomendada | ⚰️ (B) lançamento e (C) escrita na fonte **morrem**. Cenário sobrevive e fica mais barato (§5) |
| **Catálogo de insights** | motor + 20 receitas → Query Plan | ⭐ receita = **roteiro de pedidos**. É a mesma coisa que o seu parágrafo 10 do `about_v1` descreve. Uma feature, não duas (§5) |
| **Resolução de entidade** | não tratada | primitiva nova (`vocabulario`) — §3 |
| **Agregação obrigatória** | "manter sem exceção" | deixa de ser regra de privacidade e passa a ser **regra de interface**, com 2 exceções nomeadas (§4) |
| **Prospecção** | §5.4, versão ICP | mantida sem alteração. Não repito aqui |
| **Fato comercial de base** | "0 clientes pagantes" (do PRD) | ⭐ **4 vendas, ticket médio 23k, vendendo serviço** — muda a estratégia inteira (§1) |

**Ressalva sua que eu aceito integralmente:** *"Do dado à decisão. Em segundos"* já está no
`HeroSection.tsx`. A V1 apresentou como reposicionamento algo que já é o slogan. Corrigindo:

> ⭐ **O problema não é de narrativa — é que a landing page promete uma coisa que o produto não
> faz.** A promessa está pronta e correta. O que falta é torná-la verdadeira. Isso é uma história
> interna melhor que "vamos nos reposicionar": não há nada a reposicionar, há uma dívida entre o
> que se vende e o que se entrega.

---

## 1. O fato novo que mais muda a estratégia: as 4 vendas

Você escreveu: *"o plum já teve 4 vendas com ticket médio de 23k, mas elas exploraram mais a
equipe técnica (para formatar e organizar a base de dados) que o produto em si."*

O `docs/PRD-PLUM2.0.md` ainda diz "0 clientes pagantes" — está desatualizado, e a diferença não
é cosmética. São ~R$ 92k de receita **realizada** e, mais importante, um sinal de mercado que
contradiz a premissa da V1.

**A V1 assumiu que o produto não vende porque falta valor. Os dados dizem outra coisa: o produto
vende — só que o que o cliente compra é a organização da base.**

⭐ **Três leituras, e eu defendo a terceira:**

1. *Pessimista:* é consultoria disfarçada de SaaS. Não escala, não tem recorrência, e a equipe
   técnica é o produto.
2. *Otimista ingênua:* é só o começo, o produto pega depois. Não há evidência disso em 4 vendas.
3. ⭐ *A que eu defendo:* **você descobriu, sem querer, o único wedge validado que existe** — e
   está tratando ele como custo de onboarding em vez de como produto.

O raciocínio: uma empresa que paga 23k para alguém organizar a base dela está declarando três
coisas ao mesmo tempo — (a) a base é um problema real e reconhecido, (b) ela não consegue
resolver internamente, (c) tem orçamento. Esse é um ICP melhor definido que qualquer coisa no
PRD. E o Plum é a **única** ferramenta que ganha valor à medida que a base é organizada, porque
o `schema_metadata` é literalmente o subproduto do trabalho.

**O que isso implica, concretamente:**

- ⭐ **Vender o diagnóstico da base como produto pago, com entregável.** Hoje o pipeline de 5
  etapas (`DatabasePipeline.tsx`, `ai-agents`) é tratado como fricção de onboarding. É o que o
  cliente compra. Deve ter nome, preço, prazo e relatório.
- ⭐ **O mecanismo que converte serviço em recorrência já foi desenhado na V1 §4.2:** o campo
  `requisitos` das receitas. *"Sua base habilita 12 dos 20 insights; organizando a coluna de
  custo, habilita 17."* Isso transforma horas de consultoria em um **resultado mensurável e
  crescente** — e cria a razão para o cliente continuar pagando depois que a base está limpa,
  que é exatamente o que hoje não existe.
- ⚠️ **O risco real do negócio não é "não sei explicar o valor". É "receita sem recorrência".**
  Quatro projetos de 23k é caixa; não é empresa. A pergunta certa do remake não é "que feature
  nova justifica o preço" — é **"o que o cliente paga no mês 13, depois que a base já está
  organizada?"**. A resposta tem que ser o Plum. Hoje não é.

❓ **Pergunta que eu levaria antes de qualquer código:** dos 4 clientes, quantos ainda usam o
Plum? Se a resposta for baixa, o problema é retenção, e nenhuma das features deste documento
resolve retenção diretamente — insight proativo (§5) é a única que tenta.

---

## 2. ⭐ A arquitetura nova: o Plum é um motor, não um chat

Seu parágrafo:

> *"o plum interno é um MOTOR. a IA fala, em linguagem de código: 'pra tomar essa decisão,
> preciso da soma das colunas X no intervalo t1, da Y no t2 e da Z no t3, salve como info_1,
> info_2 e info_3'. o plum devolve o dado, a IA traz o insight."*

Isso não é um ajuste do pipeline atual — é uma inversão. Vale nomear o que muda:

| Hoje | No motor |
|---|---|
| 1 pergunta → 1 Query Plan → 1 resposta | 1 **decisão** → N pedidos nomeados → o agente raciocina |
| o Plum decide o que precisa ser buscado (Agente A) | **o agente de fora** decide; o Plum só resolve |
| a inteligência e o dado moram juntos | separados por um **contrato** |
| a interface é linguagem natural | a interface é **código**; linguagem natural é problema da Maisa |

⭐ **Por que isso é melhor, e não só diferente — quatro razões:**

1. **Raciocínio de múltiplos passos passa a ser possível.** Hoje "minha margem fecha positiva?"
   precisa caber num plano só. No motor, o agente pede receita, depois custo, depois glosa, olha,
   e pede mais se precisar. Decisão real quase nunca é uma agregação.
2. **O Plum para de competir com o modelo.** Cada geração de LLM melhor deixa o Agente A mais
   obsoleto. Cada geração melhor deixa o **motor mais valioso**, porque o agente que o consome
   fica mais capaz. Você quer estar do lado certo dessa curva.
3. **Vira infraestrutura consumível.** Maisa é o primeiro cliente do contrato. Depois: o agente
   próprio do cliente, um GPT/Claude com a ferramenta conectada, um n8n. O Plum deixa de ser
   uma tela para ser uma capacidade (§8).
4. **A garantia determinística sobrevive intacta.** É a parte que o mercado não replica com
   prompt melhor.

### 2.1. O contrato

Uma chamada, vários pedidos nomeados, uma leitura do Sheets:

```json
POST /resolver
{
  "dataset_id": "…",
  "pedidos": [
    { "id": "receita_ago",  "tipo": "agregado",    "plano": { "select":[{"expr":{"agg":"sum","col":"receita"}}],
                                                              "where":{"col":"data","op":"BETWEEN","val":["2026-08-01","2026-08-31"]} } },
    { "id": "glosa_ago",    "tipo": "agregado",    "plano": { … } },
    { "id": "vend_joao",    "tipo": "vocabulario", "col": "vendedor", "parecido_com": "João Silva" }
  ]
}
```

```json
{
  "receita_ago": { "status": "ok",     "valor": 412300.0, "unidade": "BRL", "linhas_origem": 1840 },
  "glosa_ago":   { "status": "negado", "motivo": "coluna 'glosa' não liberada para o cargo Vendedor" },
  "vend_joao":   { "status": "ok",     "candidatos": [ {"valor":"JOAO DA SILVA","score":0.91,"linhas":312},
                                                       {"valor":"João Silva Jr","score":0.88,"linhas":47} ] }
}
```

Quatro decisões de desenho embutidas aí, cada uma por um motivo:

- ⭐ **`id` é do chamador.** É o `info_1` do seu parágrafo. O agente escolhe o nome e sabe o que
  fazer com o resultado sem parsear posição de array.
- ⭐ **Negação é por pedido, não por lote.** Hoje é tudo-ou-nada. Com negação parcial, o agente
  produz resposta honesta e incompleta — *"consigo te dar receita, mas margem não está liberada
  para você"* — em vez de um erro genérico. Isso é estritamente melhor para o usuário **e** para
  a segurança: torna a fronteira do RBAC visível em vez de misteriosa.
- **`linhas_origem` no retorno.** O agente precisa saber se o número veio de 1.840 linhas ou de
  3 para calibrar o que afirma. Hoje o Agente C não recebe isso e não tem como calibrar nada.
- **Um lote → um `batchGet`.** Reaproveita literalmente a decisão 11A que já está no
  `CLAUDE.md` (união das colunas de todos os cards numa chamada por dataset, para contornar o
  limite de 60 req/min do Google). O que foi construído para o lote de cards do dashboard é
  exatamente o que o motor precisa. `dashboard-execute` já opera por `card_ids[]` — o formato de
  lote existe, muda o chamador.

### 2.2. `tipo` de pedido é o ponto de extensão — e cada tipo tem seu envelope de privacidade

✂️ **Isto substitui a ideia de "uma gramática de Query Plan para tudo".** Uma gramática única
obriga toda necessidade nova a se disfarçar de agregação. Um enum de tipos deixa cada
necessidade ter suas próprias regras:

| `tipo` | O que devolve | Envelope |
|---|---|---|
| `agregado` | escalar ou vetor pequeno | RBAC de coluna; sem linha bruta |
| `vocabulario` | valores distintos de uma dimensão + contagem | RBAC + teto de cardinalidade + coluna não marcada como identidade (§3.2) |
| `metadados` | colunas, tipos, período coberto, nº de linhas, % de nulo | sem dado, só forma. **Deveria ser sempre permitido** |
| `serie` | agregado por período (`{col, trunc}` que a Fase 5b já ensinou) | igual a `agregado` |
| `amostra` | ≤ N linhas, colunas não sensíveis | ⚠️ **desligado por padrão, por dataset** — é a exceção do §4 |

⭐ **`metadados` é a primitiva mais subestimada da lista.** Metade dos erros que hoje aparecem
como "coluna não encontrada" no chat são o agente não sabendo o que existe. Deixar ele
**perguntar a forma da base antes de perguntar o número** custa quase nada e elimina uma classe
inteira de falha. E não expõe dado nenhum.

### 2.3. O loop agêntico precisa de orçamento, ou a conta explode

Se o agente pode pedir, olhar e pedir de novo, ele **vai** — e cada rodada é uma chamada de LLM
mais uma resolução de dados.

- **Teto de rodadas por pergunta** (sugestão: 3), com o agente informado do orçamento restante.
- **O cache de 15 min (`query_engine/cache.py`) deixa de ser otimização e passa a ser
  estrutural.** Rodada 2 sobre as mesmas colunas tem que ser quase grátis, ou multi-passo é
  inviável economicamente.
- ⚠️ **A cota do Gemini é por requisição, e o `CLAUDE.md` já registra que o Z-dash sozinho
  cortou pela metade a quantidade de cards por dia.** Um loop de 3 rodadas multiplica isso.
  Antes de construir, calcule: cota atual ÷ rodadas médias = perguntas/dia. Se o número for
  ridículo, a decisão é de modelo/cota, e é melhor descobrir agora que depois de 6 semanas.

### 2.4. Onde o RBAC vive no motor

Sem mudança de princípio, só de granularidade: **cada pedido é autorizado individualmente**,
antes de qualquer chamada ao executor, com o `allowed_columns` do cargo de quem pede.
`_shared/query_plan.ts` continua sendo o único interpretador; `extractColumns` passa a andar por
`pedidos[]` e precisa cobrir `overrides` (§5) e `vocabulario.col` — mesma armadilha do
`walkArithmetic`, em que `addCol` descarta o que não é string e a coluna escapa do RBAC sem
ninguém notar.

⚠️ **E a armadilha de deploy da V1 §3.2 continua valendo, agravada:** `ai-plum-chat` está com
cópia antiga de `query_plan.ts` em produção **de propósito** (exceção da Fase 5b, D7). Qualquer
forma nova de pedido exige publicar os três consumidores **antes** de o prompt emitir a forma
nova, conferindo `ezbr_sha256`. Na ordem inversa a falha é fechada mas confusa —
`MissingColumnError` longe da causa.

---

## 3. ⭐ "Quanto o vendedor NOME SOBRENOME vendeu?" — o problema que você levantou

Sua dúvida foi: *se tirar a estrutura de query do pandas, tudo ficaria mais simples*, porque
`where nome = ?` é frágil — `NOME`? `NOME SOBRENOME`? e se estiver diferente na linha?

Você identificou o **modo de falha nº 1 dos sistemas de NL→query na prática**. Mas eu discordo
do diagnóstico.

### 3.1. ✂️ O plano não é o culpado

Isso é **resolução de entidade**, e ela existe independentemente da arquitetura. Se a IA lesse a
planilha direto, ela não resolveria o problema — ela o esconderia: escolheria uma interpretação
("achei João da Silva, deve ser esse"), somaria de cabeça, e devolveria um número sem dizer que
ignorou 47 linhas de "João Silva Jr". ⚠️ **Trocar um erro visível (`MissingColumnError`,
resultado zerado) por um erro invisível é o pior negócio possível num produto que vende
precisão.**

O que o plano faz de errado hoje não é existir — é **adivinhar**. O `where nome = 'João Silva'`
é o Agente A palpitando um literal que ele nunca viu, porque ele só recebe `schema_metadata` e
`schema_metadata` descreve colunas, **não conhece valores**.

### 3.2. ⭐ A primitiva que falta: vocabulário de dimensão

O agente para de adivinhar e passa a perguntar:

```
1. { "tipo":"vocabulario", "col":"vendedor", "parecido_com":"João Silva" }
   → [ {"JOAO DA SILVA", 0.91, 312 linhas}, {"João Silva Jr", 0.88, 47 linhas} ]
2. dois candidatos plausíveis → o agente NÃO escolhe. Pergunta:
   "Encontrei dois: JOAO DA SILVA (312 registros) e João Silva Jr (47). Qual deles?"
3. resolvido → o `where` usa o literal EXATO que existe na base
```

**Por que isso é a resposta certa, e não um remendo:**

- O `where` passa a usar um valor **que existe**, verificado. Deixa de ser palpite.
- Ambiguidade vira **pergunta ao usuário**, que é o comportamento correto. Um humano analista
  faria isso. Um sistema que escolhe sozinho está errando em silêncio metade das vezes.
- ⭐ **É a mesma primitiva que resolve outras cinco coisas:** "quais vendedores existem?",
  "quais status a base usa?", validação de filtro antes de executar, autocompletar na interface,
  e o preenchimento do dicionário semântico no onboarding. Uma primitiva, seis usos.
- Cardinalidade baixa é cacheável quase para sempre (muda quando a base muda), então é barata.

⚠️ **Cuidado que precisa de regra explícita: vocabulário de dimensão PODE ser PII.** Valores
distintos de `cliente` é a lista de clientes; de `cpf` é pior. Regras mínimas: (a) coluna tem
que estar em `allowed_columns`; (b) teto de cardinalidade (acima de ~200 valores distintos, não
é dimensão, é identificador — recusa); (c) flag por coluna no `schema_metadata`
(`vocabulario_exposto`), default **falso**, ligado na revisão humana do onboarding — mesmo
espírito de R-06.

⭐ **Nota de produto que vale mais que a solução técnica:** o `schema_metadata` é chamado no
`CLAUDE.md` de "o cérebro do produto", e ele hoje descreve **colunas**. Um cérebro que conhece
os conceitos mas não conhece os nomes das coisas é meio cérebro. Vocabulário de dimensão é a
outra metade, e é barata.

### 3.3. ❓ "IA lê a planilha" vs "IA pede ao pandas" — a resposta honesta

Você pediu para analisar a viabilidade. A comparação sem torcida:

| | IA lê a planilha direto | IA pede ao motor |
|---|---|---|
| Aritmética | ⚠️ **erra** — e erra com confiança | exata, por construção |
| Custo por pergunta | **O(tamanho da base)** | O(1) no tamanho da base |
| Teto de tamanho | ~poucos milhares de linhas | milhões |
| Nome torto / entidade | resolve naturalmente ✅ | precisa da §3.2 |
| RBAC de coluna | ⚠️ **impossível** — o modelo viu tudo | é o desenho |
| Reprodutibilidade | mesma pergunta, respostas diferentes | mesmo plano, mesmo número |
| Auditoria ("de onde veio?") | nenhuma | plano + linhas de origem |
| LGPD | linha bruta do cliente vai para o provedor | não sai |
| Tempo de setup | zero | exige dicionário |

⭐ **Veredicto — e o argumento decisivo é aritmético, não filosófico:** `dashboard_max_rows` tem
default **200.000** e teto de **5.000.000** (`20260806230000_dashboard_cards.sql`). E o Plum de
verdade, pelas suas palavras no contexto inicial, é para "bancos de dados imensos". Mandar a base
para o modelo a cada pergunta não é uma escolha de arquitetura ruim — **é impossível**. Some a
isso que RBAC de coluna deixa de existir no instante em que o modelo vê a planilha inteira, e
RBAC é o que vende o produto para o TI do cliente.

**Mas o seu instinto acerta em algo, e a V2 incorpora:** o que a leitura direta dá de graça é o
modelo **entender a forma e os valores** dos dados. Isso é obtível sem entregar a base:

> ⭐ **Regra: o modelo pode ver metadados e vocabulários. Nunca pode ver linhas de fato.**
> Número sempre vem do pandas. Nome sempre vem do vocabulário.

Isso preserva R-02 inteiro e mata a fragilidade que te incomodou. É a versão controlada da sua
intuição — e é bem mais barata que qualquer uma das duas alternativas puras.

---

## 4. ❓ Agregação obrigatória — insumo para a discussão da equipe

Você registrou que a permanência é discussão aberta. O que a V2 acrescenta é que **a pergunta
mudou de natureza no motor**, e isso simplifica o debate:

⭐ **No motor, agregação obrigatória deixa de ser uma regra de privacidade e passa a ser uma
regra de interface.** O agente pede `soma(receita)` porque ele quer um número para raciocinar —
1.840 linhas brutas estourariam o contexto dele e não serviriam para nada. Ou seja: na esmagadora
maioria dos casos a regra **não está atrapalhando o produto**, ela está descrevendo o que o
consumidor já quer. Isso remove a urgência do debate.

Restam exatamente **duas** pressões legítimas, e nenhuma pede relaxamento geral:

| Pressão | O que ela precisa | Proposta |
|---|---|---|
| Resolução de entidade (§3) | valores distintos de dimensão, com contagem | `tipo: "vocabulario"` — **não é linha bruta**: é agregação (`count` por valor). Cabe dentro da regra sem exceção nenhuma |
| Plum Externo — "meu pedido saiu?" | 1 linha, do próprio interlocutor | caminho separado `responder_para_principal` (V1 §5.3). **Mais estreito, não mais frouxo** |

E uma pressão de conveniência, que é onde está a decisão de verdade:

⚠️ **`tipo: "amostra"`** — o agente ver 10–20 linhas para entender a forma dos dados é
genuinamente útil (é 80% do que a leitura direta oferece). Se for adotado: teto rígido de linhas,
só colunas em `allowed_columns` **e** não marcadas como sensíveis, **desligado por padrão por
dataset**, e cada uso logado. Minha recomendação: ⭐ **não fazer na v1.** Meça primeiro quantas
falhas sobram depois que `metadados` + `vocabulario` existirem. Meu palpite é que sobra pouco, e
aí a exceção não precisa ser paga.

**Resumo para levar à mesa:** manter a regra no caminho interno **não custa nada agora**, porque
as duas necessidades reais são atendidas por primitivas que respeitam a regra. Relaxar por
antecipação é gastar a garantia mais forte do produto para comprar conveniência que ainda não foi
medida.

---

## 5. ⭐ Cenários e catálogo de insights são a mesma feature (e a V1 não viu isso)

Reli o seu parágrafo 10 do `about_v1` — *"pra tomar essa decisão, preciso da soma de X em t1, de
Y em t2, de Z em t3"* — e o comparei com a "receita de insight" da V1 §4.1.

**São o mesmo objeto.** Uma receita de insight é um **roteiro de pedidos**: a lista de bindings
que uma decisão específica requer, mais o baseline de comparação, mais as limitações. A V1
tratava "motor de insights" e "cenários" como duas frentes; no desenho do motor, elas colapsam:

```ts
{
  id: "margem-sob-estresse-de-glosa",
  perguntas_gatilho: ["e se a glosa subir X, minha margem fecha positiva"],
  requisitos: [ {papel:"receita"}, {papel:"custo"}, {papel:"glosa"} ],
  pedidos: [
    { id:"real",    tipo:"agregado", plano:"…margem no período…" },
    { id:"cenario", tipo:"agregado", plano:"…mesma margem…", overrides:[{col:"glosa", op:"add", val:"{X}"}] }
  ],
  narrativa: "Com glosa de {cenario.glosa}, a margem cai de {real.margem} para {cenario.margem}.",
  limitacoes: ["assume custo e volume constantes"]
}
```

Cenário = uma receita com `overrides`. Insight = uma receita sem. **Um motor, um catálogo, uma
frente de trabalho** — a V2 é uma feature menor que a V1 aqui, e o seu exemplo do `about_v1`
(margem sob estresse de glosa) é literalmente a primeira receita do catálogo.

O que continua valendo da V1 sem mudança:
- `requisitos` como mecanismo comercial (*"12 de 20 insights habilitados"*) — e agora ele é a
  ponte serviço→recorrência do §1.
- ⚠️ `limitacoes` obrigatório e **R-14 proposta**: nenhum agente emite afirmação causal ou
  contrafactual sem a receita declarar o desenho que a sustenta. Isso fica **mais** urgente no
  motor, porque agora o agente compõe números de fontes diferentes e a chance de inventar uma
  relação entre eles sobe. R-13 nasceu de o Agente C multiplicar dois números; no motor ele terá
  seis à disposição.

⚰️ **O que morre:** a V1 §3.3 (`lancamentos_plum`) e §3.4 (escrita na fonte). Você concordou que
alterar dado é péssima ideia, e no desenho do motor não sobra motivo nenhum para isso — a
escrita que gera valor é a da Maisa (agenda, nota fiscal), no mundo, não na base.

---

## 6. A narrativa "a IA não treina com seus dados"

Você escreveu que ela cai, que a maioria das empresas não liga, e que a barreira é fortíssima.
Concordo com dois terços — e acho que você está abrindo mão de mais do que precisa.

**No desenho do §3.3, o que de fato vai para o modelo é:** metadados, vocabulários de dimensão e
**resultados agregados**. Linha de fato, não. Então a frase honesta não é *"a IA não vê seus
dados"* — é:

> ⭐ *"O modelo nunca recebe as linhas da sua base. Ele recebe a estrutura e os totais que você
> autorizou."*

Isso é (a) verdadeiro, (b) verificável, (c) suficiente para 90% dos comitês de segurança, e
(d) você **não precisa deixar de dizer**.

Complementos práticos, porque arquitetura sozinha não fecha compliance:
- **Zero-retention / no-training nos termos de API do provedor.** É contratual, é padrão em API
  paga, e resolve a parte que a arquitetura não resolve. Boa parte do que você acha que perdeu se
  recupera aqui, sem código.
- ⚠️ **Vocabulário de dimensão é o vazamento silencioso.** "Lista de clientes distintos" é dado
  pessoal, e é a única coisa da §3.2 que sai da base para o modelo. É por isso que
  `vocabulario_exposto` tem que ser default **falso** e revisado por humano. Se essa flag não
  existir, a frase acima deixa de ser verdadeira e você não vai perceber.
- ❓ E vale medir em vez de supor: nas 4 vendas, alguém perguntou sobre privacidade? Se
  ninguém perguntou, o custo de manter a garantia é ainda menor do que parece — porque no desenho
  novo ela é quase de graça.

---

## 7. Precificação, revisada pelo §1

A V1 propôs base + pacotes de insight. O fato das 4 vendas muda a ênfase: **o problema não é
achar o que cobrar, é achar o que cobrar de novo no mês seguinte.**

| Camada | O quê | Por que o cliente paga |
|---|---|---|
| **Diagnóstico & estruturação** (existe, é o que vendeu 4×) | leitura da base, dicionário semântico, formatação, relatório de "insights habilitados vs bloqueados" | dor reconhecida, orçamento existente. **Dê nome e preço** |
| **Motor** (recorrente, por assento) | consulta + cenários + metadados/vocabulário | é a única coisa que ele perde se cancelar |
| **Pacotes de insight por vertical** (recorrente, crescente) | receitas novas entram no catálogo dele | ⭐ o catálogo cresce sem novo projeto — é o que justifica o mês 13 |
| **Plum Externo / prospecção** | V1 §5.3 e §5.4 | por volume / por lead |

⭐ **O movimento comercial que eu faria:** o diagnóstico deixa de ser o produto e passa a ser a
**porta** — precificado para cobrir custo, com o contrato já embutindo 12 meses de motor. Você
troca 23k uma vez por 15k + recorrência. Isso é a diferença entre 4 projetos e uma empresa. ❓ E
é uma decisão comercial, não técnica — mas é a mais importante deste documento.

---

## 8. ⭐ Consequência que só aparece no desenho de motor: quem mais pode ser cliente

Se o Plum é um contrato e não uma tela, a lista de consumidores possíveis é maior que "o chat do
Plum":

| Consumidor | O que muda |
|---|---|
| **Maisa** | primeiro cliente. Ela traduz linguagem natural → pedidos, como você descreveu |
| **Chat do Plum** | vira cliente fino do mesmo contrato. Deixa de ser "o produto" |
| **Dashboard** | já é isso hoje (`dashboard-execute` executa plano salvo em lote). Converge sem reescrever |
| **Agente do próprio cliente** | ele conecta o Plum como ferramenta no agente que já tem. **Distribuição sem venda** |
| **n8n / automação** | insight proativo por `cron` sai de graça (V1 §4.3) |

⚠️ **Risco simétrico, e ele é estratégico:** se o Plum é uma ferramenta que qualquer agente
consome, o valor migra para quem tem o **dicionário semântico e o catálogo de receitas** — não
para quem tem o executor. Um executor de pandas com HMAC é replicável em duas semanas por
qualquer time competente. Um dicionário revisado da base de um cliente e 20 receitas validadas
numa vertical, não. ⭐ **Trate o dicionário e o catálogo como o ativo, e o motor como
encanamento.** Isso deveria mudar onde o time gasta tempo.

---

## 9. Sequência revisada

| # | Frente | Esforço | Por quê agora | ⚰️ Critério de morte |
|---|---|---|---|---|
| 0 | **Medir o que já existe** — instrumentar perguntas do chat + falar com os 4 clientes | 1 sem | Decide quais receitas construir. Hoje seria palpite | — (não é aposta, é pré-requisito) |
| 1 | **`metadados` + `vocabulario`** | 2 sem | Mata a fragilidade da §3 e destrava tudo. É a peça mais barata com maior efeito | Falhas de "coluna/valor não encontrado" não caem depois de ligado |
| 2 | **Contrato `/resolver` com pedidos nomeados + negação parcial** | 2–3 sem | É a inversão do §2. Chat e dashboard convergem em cima dele | O agente não consegue compor 2 pedidos numa resposta melhor que 1 |
| 3 | **Catálogo: motor de receitas + 6 receitas de UMA vertical (inclui cenários)** | 4 sem | Superfície de preço e ponte serviço→recorrência (§1, §7) | Nenhuma receita sobrevive ao ceticismo de um especialista da vertical |
| 4 | **Maisa como tradutor sobre o contrato** | 3–4 sem | O casamento, na forma que você validou | — |
| 5 | **Plum Externo** (V1 §5.3) | 6–8 sem | Precisa da primitiva de escopo por linha | O prestador não quer expor a base ao cliente final |
| 6 | Prospecção versão ICP (V1 §5.4) | 4–6 sem | — | — |
| ⚰️ | Escrita de dados | — | **cortado** | — |

⭐ A frente 0 custa uma semana e muda a ordem de tudo o que vem depois. É a única coisa neste
documento que eu faria antes de escrever código — e a conversa com os 4 clientes provavelmente
vale mais que as outras 20 páginas.

---

## 10. Riscos novos que a V2 introduz

| # | Risco | Gravidade | Mitigação |
|---|---|---|---|
| N1 | Vocabulário de dimensão vazando PII para o modelo | **alto** | `vocabulario_exposto` default falso; teto de cardinalidade; revisão humana (§3.2) |
| N2 | Loop agêntico estourando cota/custo | alto | teto de rodadas; cache estrutural; calcular perguntas/dia **antes** (§2.3) |
| N3 | Agente compondo relação causal entre bindings independentes | **alto** | R-14; `limitacoes` obrigatório; léxico de correlação vs causa (§5) |
| N4 | Contrato virar API pública e o valor migrar para fora | médio-estratégico | dicionário e catálogo como ativo, não o motor (§8) |
| N5 | `extractColumns` não cobrir `pedidos[]`/`vocabulario.col` → bypass de RBAC | **crítico** | mesma armadilha do `walkArithmetic`; teste em `query_plan.test.ts` antes de publicar |
| N6 | Divergência de `_shared/query_plan.ts` entre os 3 consumidores | médio | publicar os 3, `ai-plum-chat` **antes** do prompt, conferir `ezbr_sha256` (§2.4) |
| N7 | Receita sem recorrência (o risco de negócio, não de produto) | **alto** | §7 — contrato de diagnóstico já com 12 meses de motor |

---

## 11. ❓ Decisões abertas

1. **Dos 4 clientes, quantos ainda usam?** Decide se o problema é venda ou retenção.
2. **A vertical é saúde/glosa?** Decide as 6 primeiras receitas (V1 §8.2).
3. **`amostra` entra ou não?** Minha recomendação: não na v1; medir depois de `metadados` +
   `vocabulario` (§4).
4. **O diagnóstico da base vira produto pago com nome e preço?** É a decisão comercial mais
   importante aqui (§7).
5. **O contrato `/resolver` é público (MCP/API) ou só interno para a Maisa?** Público antecipa a
   distribuição e antecipa o risco N4.
6. **Quem revisa uma receita antes de entrar no catálogo?** Sem nome, N3 não tem mitigação.

---

## Anexo — invariantes, versão V2

| Invariante | V2 |
|---|---|
| R-01 read-only | **absoluto e sem asterisco.** A V1 abria exceção (`lancamentos_plum`); ela morreu |
| R-02 IA planeja, código executa | mantido, e reforçado: número vem do motor, nome vem do vocabulário, o modelo nunca vê linha de fato |
| R-11 limites do plano | + `overrides` (enum fechado, RBAC em toda coluna do nó) + `pedidos[]` nomeados |
| R-13 só o Python multiplica | mantido, e mais crítico: o agente terá vários números à mão |
| **R-14 (nova)** | nenhuma afirmação causal ou contrafactual sem a receita declarar o desenho que a sustenta |
| Agregação obrigatória | mantida no caminho interno; `vocabulario` cabe dentro dela; exceção só em `responder_para_principal` |
| RBAC | por **pedido**, com negação parcial explícita; + `vocabulario_exposto` por coluna |
