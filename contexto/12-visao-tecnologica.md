---
status: proposta
camada: plataforma
atualizado_em: 2026-08-14
---

# Visão tecnológica — arquitetura-alvo

> **O que este arquivo é:** para onde a arquitetura vai, e por quê.
> ⛔ **O que este arquivo NÃO é:** o que está no ar. **O que está no ar é o `CLAUDE.md` da raiz.**
> Se este arquivo e o `CLAUDE.md` discordarem, o `CLAUDE.md` está certo sobre o presente e este
> está certo sobre o futuro.
> ⚠️ **`status: proposta` — nada aqui está implementado.**

---

## 0. A frase que organiza

> ⭐ **O Plum não é mais uma consulta de dados para o usuário. É uma consulta de dados para a IA.**

E o papel que isso dá ao produto:

> **O Plum é um ARQUITETO.** Ele traduz a pergunta do usuário em um plano de ação analítico. Deixar
> o usuário direto com a LLM confunde a LLM; `usuário ↔ Plum ↔ LLM` é ensinar a LLM a fazer a
> análise certa.

Sequência: **usuário → Plum (arquiteto: que análise essa pergunta exige?) → Plum (motor: resolve os
dados) → LLM (interpreta) → usuário.** A LLM nunca recebe a pergunta crua e nunca fala direto com o
usuário.

---

## 1. Por que o arquiteto existe

Três confusões concretas de uma LLM solta, e cada uma é um requisito:

1. **Ela não sabe o que não sabe.** "Qual meu lucro?" numa base sem custo: usa faturamento como
   proxy e não avisa. → o arquiteto checa viabilidade contra o dicionário **antes**.
2. **Ela improvisa o caminho.** Duas execuções da mesma pergunta pedem dados diferentes e chegam a
   números diferentes — fatal num produto que vende precisão. → o arquiteto fixa o caminho: mesma
   pergunta, mesmo plano, mesmo número.
3. **Ela não sabe o que é caro.** Pede 8 agregações onde 2 bastavam, ou entra em loop. → o arquiteto
   orça.

⭐ **O arquiteto é o único componente que fica mais valioso com cada LLM nova.** Um modelo melhor
interpreta melhor *dentro* do andaime. E o andaime é conhecimento acumulado sobre como analisar dado
de negócio — não é prompt, é o catálogo de padrões.

---

## 2. A arquitetura de agentes proposta

⚠️ **Não herda Z/A/C.** O desenho atual (Guardião → Planejador → Sintetizador) foi feito para "uma
pergunta = um plano = uma resposta". O motor precisa de outra decomposição.

| Papel | Entrada | Saída | Modelo sugerido |
|---|---|---|---|
| **Porteiro** | pergunta | `PERMITIDO` / `BLOQUEADO` | barato |
| **Arquiteto** | ⭐ ver §2.1 — trabalha em **três rodadas** e vê **dado real** na segunda | **análise declarada** (§2.2), não Query Plan | ⭐ raciocínio (Claude) |
| **Resolvedor de entidade** | valor citado + vocabulário | literal exato, ou pergunta de desambiguação | nenhum — é código (§4) |
| **Compilador** | análise declarada | os N Query Plans | nenhum — é código |
| **Motor** | pedidos autorizados | dados | — (determinístico) |
| **Intérprete** | pergunta + resultados + `limitacoes` | resposta com **cálculos visíveis** | ⭐ raciocínio |

**Duas regras que atravessam todos:**
- o **Motor** é o único que produz número (R-02, R-13);
- o **Intérprete** é obrigado a mostrar de onde cada número veio e o que assumiu
  (`30-decisoes.md` D-037).

### 2.1. As três rodadas do arquiteto

Mandar tudo de uma vez não funciona: com N planilhas e dicionário de 4 camadas o prompt explode, e
**não se sabe de antemão de quais colunas mandar o vocabulário**.

| Rodada | Recebe | Produz | Custo |
|---|---|---|---|
| **R1 — reconhecimento** | `metadados` de todas as tabelas: nomes, tipos, período, nº de linhas, % de nulo. **Zero dado** | quais tabelas e colunas são candidatas | barato · ⭐ cacheável por (dataset, versão do dicionário) |
| **R2 — aterrissagem** | das candidatas **apenas**: `amostra` (5 linhas) + `vocabulario` das dimensões + camada 4 do dicionário | a **análise declarada** | caro |
| **R3 — execução** | — | a plataforma compila, autoriza e executa | zero LLM |

⭐ **R1 é o que torna "a IA vê os dados" viável em vez de teórico.** Com 5 planilhas × 20 colunas, R2
sem R1 exigiria 100 vocabulários e 5 amostras; com R1, recebe 3 a 6 colunas. É a diferença entre um
prompt de ~40k tokens e um de ~4k.

⚠️ **Custo:** duas chamadas de LLM antes do primeiro número. O cache de R1 zera isso da segunda
pergunta na mesma base em diante. ❓ E R1 **pode não precisar de LLM** — casar termo da pergunta com o
dicionário é código. Vale tentar código primeiro. Ver D-043.

### 2.2. ⭐ O arquiteto NÃO escreve o Query Plan — duas linguagens

| Nível | Quem escreve | O quê |
|---|---|---|
| **Alto — análise declarada** | 🤖 o arquiteto | *que análise* fazer, com parâmetros |
| **Baixo — Query Plan** | 🏗️ a plataforma, por compilação | os N planos que aquela análise exige |

```jsonc
// ALTO — o arquiteto emite isto
{ "padrao": "decomposicao_de_variacao", "tabela": "vendas",
  "metrica": { "agg": "sum", "col": "receita" }, "dimensao": "loja",
  "periodo_a": ["2026-07-01","2026-07-31"], "periodo_b": ["2026-08-01","2026-08-31"], "top": 5 }

// BAIXO — a plataforma compila em 4 pedidos: total_a, total_b, por_loja_a, por_loja_b
```

Por quê: o plano deixa de ser texto gerado por LLM (`col` inexistente fica impossível por
construção); reprodutibilidade passa a ser estrutural em vez de depender de `temperature: 0`; o padrão
fica testável sem LLM; o RBAC autoriza planos que a **plataforma** gerou; e a LLM passa a
**classificar e preencher parâmetro** — o que ela faz bem — em vez de gerar consulta.

⚠️ **Válvula de escape obrigatória: `padrao: "ad_hoc"`**, em que o arquiteto emite Query Plan direto,
com a validação de hoje. Sem ela o produto responderia "não consigo analisar isso" com frequência — a
trava recusada em D-037.

⭐ **A taxa de `ad_hoc` é a métrica do catálogo**, medida em perguntas reais: se cair, o catálogo
funciona; se ficar em 80%, a abstração está errada. Ver D-044.

---

## 3. O contrato `/resolver`

Público, versionado desde `/v1/`, mudança só aditiva. Um lote, vários pedidos nomeados, uma leitura
do Sheets.

```jsonc
POST /v1/resolver
{
  "dataset_id": "…",
  "pedidos": [
    { "id": "receita_ago", "tipo": "agregado",
      "plano": { "from": "vendas",
                 "select": [{ "expr": { "agg": "sum", "col": "receita" } }],
                 "where":  { "col": "data", "op": "BETWEEN", "val": ["2026-08-01","2026-08-31"] } } },
    { "id": "glosa_ago",  "tipo": "agregado",    "plano": { /* … */ } },
    { "id": "vend_joao",  "tipo": "vocabulario", "col": "vendedor", "parecido_com": "João Silva" }
  ]
}
```

```jsonc
{
  "receita_ago": { "status": "ok",     "valor": 412300.0, "unidade": "BRL", "linhas_origem": 1840 },
  "glosa_ago":   { "status": "negado", "motivo": "coluna 'glosa' não liberada para o cargo Vendedor" },
  "vend_joao":   { "status": "ok",
                   "candidatos": [ { "valor": "JOAO DA SILVA", "score": 0.91, "linhas": 312 },
                                   { "valor": "João Silva Jr",  "score": 0.88, "linhas":  47 } ] }
}
```

Quatro decisões embutidas:

- ⭐ **`id` é do chamador.** O agente batiza o que pediu e não parseia posição de array.
- ⭐ **Negação por pedido, não por lote.** Hoje é tudo-ou-nada. Com negação parcial o agente
  responde *"consigo receita, margem não está liberada para você"* em vez de erro genérico —
  melhor para o usuário **e** para a segurança, porque torna a fronteira do RBAC visível.
- **`linhas_origem`** — o intérprete precisa saber se o número veio de 1.840 linhas ou de 3 para
  calibrar o que afirma. Hoje ele não recebe isso.
- **Um lote → um `batchGet`** — reaproveita a decisão 11A (`30-decisoes.md` D-010), feita para o
  lote de cards do dashboard. `dashboard-execute` já opera por `card_ids[]`; muda o chamador.

### 3.0. ⭐ O escopo real da mudança no executor: DUAS coisas

O Query Plan **não é redesenhado**. `_shared/query_plan.ts` + `pandas_executor.py` + as duas tabelas
de teste são a parte mais testada do repositório, e é onde vivem as garantias de R-11. Os acréscimos
são compatíveis para trás:

| Acréscimo | Onde muda |
|---|---|
| `pedidos[]` (envelope de lote com `id` do chamador) | Edge Function |
| `from` resolvido entre N tabelas | ⭐ **nada** — `execute_plan(plan, tables: Dict[str, DataFrame])` sempre recebeu um dicionário de tabelas e `plan["from"]` já seleciona. Multi-planilha degrau 1 é trabalho de arquiteto e interface |
| `vocabulario` | ⭐ **nada** — compila para `group_by + count + limit` (§4). Açúcar na Edge Function |
| `overrides` (cenário) | **executor** |
| `amostra` | **executor** — e é a **única** que quebra `RawRowsBlocked` |

⭐ **Consequência para revisão de PR:** toda a discussão de privacidade do remake se concentra em um
único ponto de código. A pergunta *"esse PR afrouxa a privacidade?"* passa a ter resposta binária —
ele toca o caminho `amostra` ou não toca.

**O que NÃO muda:** `agg ∈ {sum,avg,min,max,count}` · `limit` 1..500 · joins bloqueados ·
`RawRowsBlocked` no caminho `agregado` · `MissingColumnError` · teto de linhas antes do parse.

### 3.1. Tipos de pedido — o ponto de extensão

Cada tipo tem seu próprio envelope de privacidade. Isso substitui a ideia de "uma gramática única
para tudo", que obrigava toda necessidade nova a se disfarçar de agregação.

| `tipo` | Devolve | Teto | Consome orçamento? |
|---|---|---|---|
| `metadados` | colunas, tipos, período coberto, nº de linhas, % de nulo | — | não |
| `agregado` | escalar ou vetor pequeno | `limit` 1..500 | não |
| `serie` | agregado por período (`{col, trunc}`) | idem | não |
| `vocabulario` | valores distintos + contagem | cardinalidade + flag por coluna | não (é `count`) |
| `registro` | linhas identificadas por filtro explícito | ⭐ ≤ 5 | **sim** |
| `amostra` | primeiras linhas, para entender a forma | ⭐ ≤ 5 | **sim** |

⭐ **`metadados` é a primitiva mais subestimada.** Metade dos erros que hoje aparecem como "coluna
não encontrada" é o agente não sabendo o que existe. Deixá-lo **perguntar a forma da base antes de
perguntar o número** custa quase nada e não expõe dado.

**Por que `amostra` = 5:** é o que o pipeline de importação já trafega (cabeçalho + 5 linhas). 5
basta para entender **forma**; **variedade** (quantos status existem) é melhor resolvida por
`vocabulario`, com contagem e sem trafegar linha. (`30-decisoes.md` D-034.)

### 3.2. O laço agêntico precisa de orçamento

- **Teto de rodadas por pergunta** (sugestão: 3), com o agente informado do orçamento restante.
- **O cache de 15 min deixa de ser otimização e passa a ser estrutural** — rodada 2 sobre as mesmas
  colunas tem de ser quase grátis.
- ⚠️ **Calcule antes de construir:** custo por rodada × rodadas médias. O Z-dash sozinho já cortou
  pela metade a quantidade de cards por dia. Se o número der ridículo, a decisão é de modelo/cota, e
  é melhor descobrir agora.

### 3.3. RBAC no motor

Sem mudança de princípio, só de granularidade: **cada pedido é autorizado individualmente**, antes
de qualquer chamada ao executor, com o `allowed_columns` do cargo. `_shared/query_plan.ts` continua
sendo o **único** interpretador.

⚠️ **`extractColumns` passa a ter de andar por `pedidos[]`, por `overrides` (incluindo o `where`
interno) e por `vocabulario.col`.** É a armadilha exata do `walkArithmetic`: `addCol` descarta o que
não é string, então uma coluna que apareça só numa forma nova **não é extraída** e o plano é
autorizado sem ninguém olhar. Ver `31-incidentes-e-licoes.md` I-05.

| Forma nova | `extractColumns` tem de andar por |
|---|---|
| `pedidos[]` | cada `pedidos[i].plano` — e o resultado é autorizado **por pedido** |
| `overrides[]` | `overrides[i].col` **e** `overrides[i].where` (recursivo) |
| `vocabulario` | `col` — mas como compila para plano normal, cai na regra existente |
| análise declarada | ⭐ **não precisa** — o RBAC roda sobre os planos **compilados**. Outra vantagem do §2.2 |
| `amostra` | as colunas pedidas + checagem de sensibilidade + orçamento |

⚠️ **E a armadilha de deploy:** `ai-plum-chat` está com cópia antiga de `query_plan.ts` de propósito
(D-028). **Publique os três consumidores ANTES de o prompt emitir forma nova**, conferindo
`ezbr_sha256`. Na ordem inversa, a coluna não entra em `resolved_columns` e a pergunta morre em
`MissingColumnError`, longe da causa.

---

## 4. Resolução de entidade

**O problema:** "quanto o vendedor NOME SOBRENOME vendeu?" → `where nome = 'João Silva'` é um
literal que o planejador **nunca viu**, porque `schema_metadata` descreve colunas e não conhece
valores. Basta o banco ter "JOAO DA SILVA" e o resultado é zero, sem erro.

**Por que "a IA lê a planilha" não resolve:** ela não resolve, **esconde** — escolhe uma
interpretação, soma de cabeça, e não conta que ignorou 47 linhas de "João Silva Jr". ⚠️ Trocar um
erro visível por um erro invisível é o pior negócio possível num produto que vende precisão.

**A solução:**

```
1. { "tipo":"vocabulario", "col":"vendedor", "parecido_com":"João Silva" }
   → [ {"JOAO DA SILVA", 0.91, 312 linhas}, {"João Silva Jr", 0.88, 47 linhas} ]
2. dois candidatos plausíveis → o agente NÃO escolhe; pergunta ao usuário
3. resolvido → o `where` usa o literal EXATO que existe na base
```

⭐ A mesma primitiva resolve seis coisas: "quais vendedores existem?", "quais status a base usa?",
validação de filtro antes de executar, autocompletar na interface, preenchimento do dicionário no
onboarding, e a desambiguação acima.

⚠️ **Vocabulário pode ser PII.** Valores distintos de `cliente` é a lista de clientes. Regras:
(a) a coluna tem de estar em `allowed_columns`; (b) teto de cardinalidade — acima de ~200 valores
distintos não é dimensão, é identificador, e recusa-se; (c) flag `vocabulario_exposto` por coluna,
default **`false`**, ligada na revisão humana do onboarding.
**Não é keyword-match:** é um booleano gravado no dicionário, sem inferência nenhuma. Mecanismo 🏗️,
valor 🔧.

---

## 5. O dicionário de 4 camadas

O `schema_metadata` é chamado de "o cérebro do produto" e hoje é **meio cérebro**: conhece os
conceitos, não conhece os nomes das coisas.

| Camada | Conteúdo | Hoje | Resolve |
|---|---|---|---|
| 1. Colunas | nome, tipo, significado, `formattingRules` | ✅ | "que colunas existem?" |
| 2. **Valores** | vocabulário das dimensões | ❌ | ⭐ resolução de entidade (§4) |
| 3. **Relações** | chaves entre planilhas, **grão** de cada tabela | ❌ | multi-planilha (§6) |
| 4. **Regras** | fórmulas, sinais, proibições, calendário | ❌ | "se A muda, B fica como?" |

⭐ **As camadas 2, 3 e 4 são o que o cliente já paga 23k para produzir, num formato que hoje é
jogado fora.** Há precedente do desperdício: o mapa `cabeçalho original → normalizado` vive em
`datasets.sketch`, e `sketch` vira `NULL` quando a base fica ativa
(`31-incidentes-e-licoes.md` I-04).

**Onde vive:** em "minha base de dados", como "skills" que o agente daquela base carrega. Mecanismo
🏗️, conteúdo 🔧.

---

## 6. Banco de dados = N planilhas

Hoje o usuário escolhe uma base antes de perguntar. O alvo é conectar 5 planilhas/CSVs em "minha
base de dados" e perguntar sobre qualquer uma. **Dois degraus, custos muito diferentes.**

### Degrau 1 — o arquiteto escolhe a planilha (barato, fazer)

`execute_plan(plan, tables: Dict[str, DataFrame])` **já recebe várias tabelas** — a assinatura
sempre previu isso. Falta: o arquiteto ver o dicionário das N de uma vez, resolver o `from`, e a
interface parar de exigir seleção manual.

⚠️ **Custo escondido:** o prompt passa a carregar N dicionários. Com 4 camadas isso cresce rápido —
vai precisar de um passo de **pré-seleção** (que tabelas essa pergunta pode envolver?) com modelo
barato antes do passo de plano.

### Degrau 2 — a pergunta atravessa planilhas ⭐

R-11 bloqueia joins, e a intuição é que multi-planilha exige derrubar isso. **Não exige.** Separe:

**(a) Join DEPOIS da agregação — grátis, sem tocar em R-11. ✅ Implementar.**
"Bati a meta?" → `receita por mês` (planilha A) + `meta por mês` (planilha B) → dois vetores
pequenos com a mesma chave. **Quem cruza é a LLM, com dois números na mão.** Sem linha bruta, sem
join no pandas, sem mudança de invariante.

**(b) Join ANTES da agregação — caro. ❌ Fora da Etapa 1.**
"Faturamento dos clientes que também compraram X" exige casamento linha a linha antes de somar.
Requer `relacoes` no dicionário e mudança de R-11.

⚠️ **Pré-requisito de (a): grão declarado por tabela.** Cruzar "receita por mês" com "meta por
trimestre" dá número errado plausível, e a LLM não percebe.

❓ **A medir nas 4 bases conhecidas: quantas perguntas reais são (b)?** Se for pouca, R-11 sobrevive
à multi-planilha inteira.

---

## 7. Privacidade: de estatística para contábil

**A agregação obrigatória cai** (`30-decisoes.md` D-033) — o usuário legitimamente quer um dado
específico, e a IA interpreta melhor vendo a forma dos dados.

⚠️ **Nada da família do k-anonimato volta.** Ele falhou porque era regra **estatística** sobre uma
distribuição que ninguém controla — em planilha organizada por data/evento suprimia resposta legítima
o tempo todo (D-012). O que substitui é **contável e determinístico**:

> **Orçamento de linhas por sessão.** Cada sessão (usuário × dataset × janela) tem teto de **linhas
> brutas entregues** — sugestão 200, configurável por organização como `dashboard_max_rows` já é.
> `agregado`, `serie`, `metadados` e `vocabulario` **não consomem**. `registro` e `amostra`
> consomem. Estourou: o motor recusa e o arquiteto volta a agregar.

⭐ **Por que por sessão e não por pedido:** teto por pedido é o erro fácil. 200 pedidos × 5 linhas é
a base inteira, um pedido por vez, sem violar teto nenhum.

---

## 8. LLM: abstração de provedor

Hoje a URL do Gemini está escrita em **4 lugares**, em 3 Edge Functions, com o nome do modelo colado
no meio — e o helper compartilhado se chama `_shared/gemini_parsing.ts`.

```
_shared/llm.ts
  chamar({ papel, prompt, schema, temperatura })
    → { texto, json, tokens_entrada, tokens_saida, provedor, modelo }
_shared/llm/gemini.ts   ·   _shared/llm/claude.ts
```

⭐ **`papel` é a chave:** `porteiro`, `arquiteto`, `vocabulario`, `interprete` mapeiam para modelo
numa **tabela de configuração**, não no código. Decidido: **Gemini Flash para raciocínio rápido,
Claude para pensamento** (D-038). Hoje o repo já varia `temperature` por papel; variar **modelo** é
o passo seguinte e corta custo sem cortar qualidade onde ela importa.

⚠️ **Não abstraia demais.** Cubra o que os dois provedores fazem bem (prompt, saída estruturada,
temperatura, contagem de tokens). Uma camada que tenta unificar cache de prompt, tool use e
streaming fica mais complexa que os dois clientes separados.

⚠️ **Com `amostra` ligada, provedor passa a ser decisão de compliance**, não só de qualidade — termos
de zero-retention diferem, e é plausível um cliente aceitar X e não Y.

---

## 9. Observabilidade — e hoje não existe nada

⭐ **Não há métrica nenhuma de uso do chat.** Quantas perguntas, por quem, quantas falharam, quais
viraram nada. Isso é pré-requisito, não melhoria: **quais perguntas as pessoas fazem de verdade é o
insumo que decide quais padrões analíticos construir primeiro** — e hoje essa decisão seria palpite.

**Proposta: log estruturado no Supabase.** Uma tabela, uma linha por etapa:

```
plum_logs: id · organization_id · user_id · dataset_id · sessao_id
           etapa (porteiro|arquiteto|vocabulario|motor|interprete)
           modelo · tokens_entrada · tokens_saida · latencia_ms
           status (ok|negado|erro) · codigo_erro
           pedidos_qtd · linhas_origem · linhas_brutas_entregues
           criado_em
```

⚠️ **A pergunta crua NÃO vai para o log** — D-022 já decidiu não guardar isso nem no banco;
reintroduzir pelo log seria contornar a própria decisão. O que se registra é a **forma** (quais
padrões, quantos pedidos, quais colunas), não o texto.

RLS: a organização vê o próprio log; `service_role` vê tudo. E isso destrava o que hoje é
impossível: medir a taxa de erro por etapa, o custo real por pergunta, e o teste do §6 (quantas
perguntas exigem join antes da agregação).

---

## 10. Etapa 1 — ordem de construção

| # | Frente | Esforço | Por quê nessa ordem |
|---|---|---|---|
| 0 | **Log estruturado + medir** as perguntas reais e as 4 bases | 1 sem | Decide as frentes seguintes. Sem isso é palpite |
| 1 | `metadados` + `vocabulario` (camada 2) | 2 sem | Mata a fragilidade do §4; destrava o resto |
| 2 | Contrato `/resolver` versionado + negação parcial + orçamento | 3 sem | A fundação |
| 3 | Arquiteto + 6 primeiros padrões | 4 sem | O ativo. Começar por decomposição de variação |
| 4 | `registro` + `amostra` | 1 sem | A híbrida do §7 |
| 5 | Multi-planilha degrau 1 + cruzamento por grão comum | 2–3 sem | O `urgent_multiplas_planilhas`; degrau 2 só se a medição pedir |
| 6 | Dicionário camadas 3 e 4 + editor em "minha base de dados" | 3 sem | ⭐ Sem isso, cenário e "se A muda B" não existem |
| 7 | Abstração de provedor | 0,5 sem | Fazer **agora**, com 4 call sites, não depois com 20 |

**Etapa 2** (Maisa, Plum Externo, prospecção): `22-planos-futuros.md`.

---

## 11. Invariantes na arquitetura-alvo

| Invariante | Alvo |
|---|---|
| R-01 read-only | absoluto, sem asterisco |
| R-02 IA planeja, código executa | mantido para **número**. A LLM passa a ver ≤5 linhas por sessão para **interpretar** |
| R-11 limites do plano | + `overrides` + `pedidos[]` + `from` resolvido entre N tabelas. **Joins seguem bloqueados** |
| R-12 k-anonimato | permanece removido; nada da família volta |
| R-13 só o Python multiplica | mantido, e mais crítico — o intérprete terá 6 números à mão |
| **novo** | orçamento de linhas brutas por sessão, com log (§7) |
| **novo** | mecanismo de segurança é 🏗️; política de sensibilidade é 🔧 |
| **novo** | toda resposta mostra os cálculos e o que assumiu (D-037) |
| Agregação obrigatória | deixa de ser trava do executor; passa a ser default do arquiteto |
