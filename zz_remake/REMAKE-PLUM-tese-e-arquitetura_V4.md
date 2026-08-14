# Remake do Plum — V4

**Base:** V3 + os comentários em `about_v3`.
**Escopo:** ⭐ **a única lacuna real que sobrou do `about_v3`** — *"temos que discutir melhor como vai
ser a estrutura das queries enviadas ao pandas"*, e o fluxo em que *"a IA arquiteta recebe dados da
planilha pra gerar contexto de quais colunas consultar, depois consulta via a atual arquitetura"*.
**Status:** proposta. **Convenções:** `⭐` central · `⚠️` risco · `✂️` discordância · `❓` decisão sua ·
`🏗️` plataforma · `🔧` implementação

---

## 0. Por que a V4 é curta

Dos 14 pontos do `about_v3`, **13 já entraram no `contexto/`** durante a execução do plano de
documentação:

| Seu ponto | Onde já está |
|---|---|
| Manter **uma** receita forte como modelo | `11-visao-de-produto.md` (`margem-sob-estresse`) |
| "Quanto melhor a plataforma, mais fácil a implementação" | `02-plataforma-vs-implementacao.md`, abertura |
| A plataforma interpreta, o stakeholder decide o significado | `01` e `02` |
| Pode propor arquitetura de agentes nova, sem herdar Z/A/C | `12-visao-tecnologica.md` §2 |
| Logs no Supabase | `12-visao-tecnologica.md` §9 + `20-pendencias.md` C1 |
| Gemini Flash + Claude por papel | `30-decisoes.md` D-038 |
| Mostrar o raciocínio em vez de travar a IA | `30-decisoes.md` D-037 |
| Fórmulas/grão como "skills" em "minha base de dados" | `21-melhorias-do-plum-vendido.md` |
| Catálogo e regras visíveis no front | `11-visao-de-produto.md` |
| Implementar o join **depois** da agregação (5.3a) | `30-decisoes.md` D-035 |
| A tese "a IA não lê seus dados" é fraca | `10-visao-comercial.md` |
| 5 linhas bastam (é o que o onboarding já faz) | `30-decisoes.md` D-034 |
| Orçamento de linhas por sessão | `12-visao-tecnologica.md` §7 |

**Sobrou um.** Este documento é sobre ele — e ele é o mais difícil dos catorze, porque decide onde
está a fronteira entre o que a LLM faz e o que a plataforma faz.

---

## 1. O protocolo do arquiteto — três rodadas

Sua formulação: *"a IA arquiteta recebe dados da planilha pra gerar contexto de quais colunas
consultar para resolver o problema. Depois ela consulta via a atual arquitetura do Plum."*

Correto. O que falta é **em quantas etapas**, porque mandar tudo de uma vez não funciona: com N
planilhas e dicionário de 4 camadas, o prompt explode; e não se sabe de antemano **de quais** colunas
mandar o vocabulário.

| Rodada | O arquiteto recebe | O que ele produz | Custo |
|---|---|---|---|
| **R1 — reconhecimento** | `metadados` de todas as tabelas: nomes, tipos, período coberto, nº de linhas, % de nulo. **Zero dado.** | quais tabelas e colunas são candidatas | barato (modelo rápido) |
| **R2 — aterrissagem** | das candidatas **apenas**: `amostra` (5 linhas) + `vocabulario` das dimensões + camada 4 do dicionário (fórmulas, sinais, grão, proibições) | a **análise declarada** (§2) | caro (modelo de raciocínio) |
| **R3 — execução** | — | a plataforma compila e executa; o intérprete narra | barato + determinístico |

⭐ **Por que R1 existe separada, e é a parte que quase se perde:** é o que permite mandar dado real na
R2 **sem mandar dado de tudo**. Com 5 planilhas × 20 colunas, R2 sem R1 exigiria 100 vocabulários e
5 amostras. Com R1, a R2 recebe as 3 a 6 colunas que importam. É a diferença entre um prompt de 40k
tokens e um de 4k — e é o que torna "a IA vê os dados" viável em vez de teórico.

⚠️ **R1 não é grátis em latência.** São duas chamadas de LLM antes do primeiro número. Mitigação: R1
é cacheável por (dataset, versão do dicionário) — a resposta "quais colunas existem" não muda entre
perguntas. Na segunda pergunta sobre a mesma base, R1 sai do cache.

### O que muda em relação ao que está escrito hoje

O `12-visao-tecnologica.md` §2 diz que o arquiteto recebe "pergunta + dicionário + catálogo". A V4
corrige: ele recebe **dicionário na R1 e dado real na R2**. É a sua concessão do `about_v3` §6
(*"se ver os dados durante o prompt é a melhor maneira de ela interpretar, que seja feito"*) aplicada
ao **arquiteto**, não só ao intérprete — e é onde ela rende mais, porque errar a escolha de coluna
é o erro mais caro do pipeline.

---

## 2. ⭐ A resposta principal: duas linguagens, não uma

**A pergunta era "qual a estrutura das queries enviadas ao pandas". A resposta que eu defendo é que
o arquiteto não deveria escrever essa estrutura.**

Hoje o Agente A emite Query Plan direto. Isso significa que **a LLM escreve a consulta**, e por isso
todo problema de qualidade e de segurança vira um problema de prompt. A proposta:

| Nível | Quem escreve | O quê |
|---|---|---|
| **Alto — análise declarada** | 🤖 o arquiteto | *que análise* fazer, com parâmetros |
| **Baixo — Query Plan** | 🏗️ a plataforma, por compilação | os N planos que aquela análise exige |

```jsonc
// NÍVEL ALTO — o que o arquiteto emite
{
  "padrao": "decomposicao_de_variacao",
  "tabela": "vendas",
  "metrica": { "agg": "sum", "col": "receita" },
  "dimensao": "loja",
  "periodo_a": ["2026-07-01", "2026-07-31"],
  "periodo_b": ["2026-08-01", "2026-08-31"],
  "top": 5
}
```

```jsonc
// NÍVEL BAIXO — o que a plataforma compila e o pandas recebe
{ "pedidos": [
  { "id": "total_a",  "plano": { "from": "vendas", "select": [{"expr":{"agg":"sum","col":"receita"}}],
                                 "where": {"col":"data","op":"BETWEEN","val":["2026-07-01","2026-07-31"]} } },
  { "id": "total_b",  "plano": { /* idem periodo_b */ } },
  { "id": "por_loja_a", "plano": { "from":"vendas", "group_by":["loja"],
                                   "select":[{"expr":{"agg":"sum","col":"receita"}}],
                                   "where": {"…periodo_a"}, "order_by":[…], "limit": 5 } },
  { "id": "por_loja_b", "plano": { /* idem periodo_b */ } }
]}
```

⭐ **Cinco consequências, e cada uma resolve um problema que hoje não tem solução:**

1. **O plano deixa de ser texto gerado por LLM.** A superfície de erro cai de "qualquer JSON que o
   modelo inventar" para "os parâmetros de um padrão conhecido". Um `col` inexistente ou um `agg`
   inválido passa a ser impossível por construção, não por validação.
2. **Reprodutibilidade sai de graça.** Mesma análise declarada → mesmos planos → mesmo número. É o
   requisito nº 2 do arquiteto (*"a LLM improvisa o caminho"*) resolvido estruturalmente, não com
   `temperature: 0`.
3. **O padrão fica testável sem LLM.** `compilar(declaracao) === [planos esperados]` é um teste
   unitário. Hoje testar o Agente A exige rodar o Gemini e comparar semântica.
4. **O RBAC passa a autorizar planos que a plataforma gerou**, não planos que a LLM inventou. Some
   uma classe inteira de risco: `extractColumns` continua sendo a barreira, mas agora sobre uma
   estrutura de forma conhecida.
5. ⭐ **A LLM passa a fazer o que ela faz bem.** Classificar ("isso é uma decomposição de variação")
   e preencher parâmetros é tarefa de classificação. Escrever consulta é geração de código — o que
   ela faz pior e onde erra em silêncio.

### ✂️ E a válvula de escape, porque senão isso vira o que você recusou

⚠️ **Nem toda pergunta cabe num padrão.** Se a única saída fosse o catálogo, o produto responderia
"não consigo analisar isso" com frequência — exatamente a trava que você recusou em `about_v3` §3.1.

Por isso existe `padrao: "ad_hoc"`, em que o arquiteto **emite o Query Plan direto**, com a validação
de hoje (R-11, `authorizePlan`, `RawRowsBlocked`). A diferença é o *default*:

| | Caminho | Quando |
|---|---|---|
| Padrão | análise declarada → compilada | a pergunta casa com um dos ~12 padrões |
| Escape | `ad_hoc` → Query Plan da LLM | não casa |

⭐ **E o `ad_hoc` é a melhor métrica de produto que existe nesse desenho:** a taxa de `ad_hoc` diz
quantos padrões faltam no catálogo, medida em perguntas reais. Se ela cair de 60% para 15% em três
meses, o catálogo está funcionando. Se não cair, o catálogo é a abstração errada — e você descobre
com dados, não com opinião.

❓ **Decisão:** começar com o catálogo pequeno e `ad_hoc` liberado (recomendo), ou só `ad_hoc` até o
catálogo amadurecer? A primeira opção mede; a segunda é o que já existe hoje.

---

## 3. A estrutura que chega ao pandas: aditiva, não nova

**Não redesenhe o Query Plan.** `_shared/query_plan.ts` + `pandas_executor.py` + as duas tabelas de
teste são a parte mais testada do repositório, e é onde vivem as garantias de R-11. Três acréscimos,
todos compatíveis para trás:

```jsonc
{
  "pedidos": [                            // 1. envelope de lote com id do chamador
    { "id": "…", "tipo": "agregado",
      "plano": {
        "from": "vendas",                 // 2. já existe; passa a ser resolvido entre N tabelas
        "select": [ … ], "where": { … }, "group_by": [ … ], "order_by": [ … ], "limit": 500,
        "overrides": [                    // 3. cenário: altera valor em memória antes de agregar
          { "col": "glosa", "op": "add", "val": 20000, "where": { … } }
        ]
      } }
  ]
}
```

O executor já está pronto para dois dos três: `execute_plan(plan, tables: Dict[str, DataFrame], *,
column_roles, max_rows)` **sempre** recebeu um dicionário de tabelas, e `plan["from"]` já seleciona
qual. Multi-planilha no degrau 1 é trabalho de **arquiteto e interface**, não de executor.

⚠️ **O que muda no executor é só `overrides`** (e a `amostra`, §4). Nada mais.

### O que NÃO muda, e é bom que não mude

| Continua igual | Por quê |
|---|---|
| `agg ∈ {sum,avg,min,max,count}` | enum fechado é o que impede geração livre |
| `limit` 1..500 | teto de saída |
| **joins bloqueados** | cruzamento acontece depois da agregação (D-035) |
| `RawRowsBlocked` no caminho `agregado` | a exceção é o `tipo`, não o plano |
| `MissingColumnError` | filtro nunca é ignorado em silêncio |
| Teto de linhas antes do parse | `limit` protege saída, não entrada |

---

## 4. ⭐ Dois achados que encolhem o escopo pela metade

### 4.1. `vocabulario` **não precisa de primitiva nova no executor**

Vocabulário de dimensão é "valores distintos com contagem". Isso é um Query Plan comum:

```jsonc
{ "from": "vendas", "group_by": ["vendedor"],
  "select": [{ "expr": { "agg": "count" }, "as": "linhas" }],
  "order_by": [{ "col": "linhas", "dir": "desc" }], "limit": 200 }
```

⭐ **Consequência:** `vocabulario` respeita `RawRowsBlocked` (tem agregação), passa pelo RBAC como
qualquer plano, e **roda no executor de hoje, sem uma linha de Python nova.** O `tipo: "vocabulario"`
do contrato é açúcar sintático sobre isso, resolvido na Edge Function.

E o casamento difuso (`parecido_com: "João Silva"`) roda na Edge Function sobre os ≤200 valores que
voltaram — não precisa de LLM nem de executor. Normalização + distância de edição resolve.

⚠️ Duas travas continuam necessárias, e são de política, não de código: coluna em `allowed_columns`,
e `vocabulario_exposto = true` (default `false`, ligado na revisão do onboarding).

### 4.2. `amostra` é a **única** mudança real no executor

E é a única que quebra `RawRowsBlocked`. Ou seja: **toda a discussão de privacidade do remake se
concentra em um único ponto de código**, com teto de 5 linhas, orçamento por sessão e log.

⭐ Isso é excelente para revisão: a pergunta "esse PR afrouxa a privacidade?" tem uma resposta
binária — ele toca o caminho `amostra` ou não toca.

**Escopo real do executor no remake:** `overrides` + `amostra`. Nada além disso.

---

## 5. Custo, com a conta na mesa

Por pergunta, no caminho com padrão:

| Etapa | Chamadas LLM | Modelo |
|---|---|---|
| Porteiro | 1 | rápido |
| R1 reconhecimento | 1 (cacheável por dataset) | rápido |
| R2 análise declarada | 1 | raciocínio |
| Resolução de entidade (só se houver nome citado) | 0 — é código | — |
| R3 compilação + execução | 0 | — |
| Intérprete | 1 | raciocínio |

**4 chamadas, 2 delas em modelo caro** — contra 3 chamadas hoje (Z, A, C), todas no mesmo modelo.
Com R1 em cache a partir da segunda pergunta na mesma base, cai para 3.

⚠️ **A comparação que importa não é "quantas chamadas", é custo por pergunta correta.** Uma pergunta
respondida errado custa a chamada **e** a confiança. Mas isso é argumento, não medição — e é
exatamente por isso que o log estruturado (`12-visao-tecnologica.md` §9) precisa vir **antes** desta
frente, não depois. ⭐ Sem ele, esta tabela é chute.

**Orçamento:** teto de 3 rodadas de R2 por pergunta (o arquiteto pode querer olhar mais vocabulário
antes de decidir), com o orçamento restante informado a ele no prompt.

---

## 6. RBAC nas formas novas — a lista de verificação

`extractColumns` hoje anda por `select` (inclusive `args` de aritmética, recursivo), `where`
(recursivo) e `group_by` (inclusive `{col, trunc}`). ⚠️ **Cada estrutura nova é um lugar onde uma
coluna pode se esconder** — foi assim que `walkArithmetic` autorizou plano sem olhar operandos
(`31-incidentes-e-licoes.md` I-05).

| Forma nova | `extractColumns` tem de andar por |
|---|---|
| `pedidos[]` | cada `pedidos[i].plano`, e o resultado é autorizado **por pedido** |
| `overrides[]` | `overrides[i].col` **e** `overrides[i].where` (recursivo) |
| `vocabulario` | `col` — mas como ele compila para um plano normal, cai na regra existente |
| análise declarada | ⭐ **não precisa andar nela** — o RBAC roda sobre os planos **compilados**. É outra vantagem do §2 |
| `amostra` | as colunas pedidas, mais a checagem de sensibilidade e de orçamento |

⚠️ **E a ordem de deploy, que já tem precedente de mordida:** `ai-plum-chat` está em produção com
cópia antiga de `query_plan.ts`, de propósito (D-028). **Publique os três consumidores ANTES de
qualquer prompt emitir forma nova.** Na ordem inversa a coluna não entra em `resolved_columns` e a
pergunta morre em `MissingColumnError`, longe da causa. Confirme por `ezbr_sha256`.

---

## 7. O que a V4 muda no `contexto/`

| Arquivo | Mudança |
|---|---|
| `12-visao-tecnologica.md` | §2 e §3 reescritos: protocolo de 3 rodadas, duas linguagens, escopo do executor |
| `30-decisoes.md` | D-043 (protocolo R1/R2/R3) · D-044 (análise declarada + `ad_hoc`) · D-045 (`vocabulario` compila para plano) |
| `11-visao-de-produto.md` | a taxa de `ad_hoc` como métrica do catálogo |
| `20-pendencias.md` | D10: catálogo pequeno + `ad_hoc` liberado, ou só `ad_hoc`? |

---

## 8. Riscos novos e ❓ decisões

| # | Risco | Gravidade | Mitigação |
|---|---|---|---|
| W1 | O compilador de padrões virar um mini-ORM difícil de manter | médio | 12 padrões, enum fechado, teste unitário por padrão. Se passar de ~20, revisar a abstração |
| W2 | `ad_hoc` virar o caminho de 80% e o catálogo morrer sem uso | **alto** | medir a taxa desde o dia 1. É o sinal de morte da própria ideia |
| W3 | R1 + R2 dobrarem a latência percebida | médio | cache de R1 por dataset; mostrar progresso na interface |
| W4 | Coluna escondida em `overrides` → bypass de RBAC | **crítico** | §6, com teste em `query_plan.test.ts` antes de publicar |
| W5 | Amostra de 5 linhas ser suficiente para R1 mas não para R2 em base suja | médio | `vocabulario` cobre variedade; se não cobrir, medir antes de subir o teto |

❓ **As decisões desta versão:**

1. **Análise declarada + compilador, ou o arquiteto emite Query Plan direto?** Recomendo o
   compilador, com `ad_hoc` liberado desde o começo.
2. **R1 é uma chamada de LLM ou pode ser código?** Boa parte de "quais tabelas essa pergunta pode
   envolver" é casamento de termo com dicionário — talvez não precise de modelo. ⭐ Vale tentar
   código primeiro: é mais barato, mais rápido e determinístico.
3. **Quais 12 padrões, e em que ordem?** Continua aberto (`20-pendencias.md` D4), agora com um
   critério novo: comece pelos que **compilam para poucos planos**, porque são os mais baratos de
   testar.
4. **`ad_hoc` fica visível ao usuário?** ("essa pergunta saiu do meu repertório") — honestidade
   contra ruído.
