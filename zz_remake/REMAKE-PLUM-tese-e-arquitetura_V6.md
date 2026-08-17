# Remake do Plum — V6 (fechamento)

**Base:** V5 + `about_v5`. **Papel:** consolidar o que ficou decidido, para o plano de implementação
consumir. Não abre discussão nova.
**Convenções:** `⭐` central · `⚠️` consequência a tratar · `🏗️` plataforma · `🔧` implementação

---

## 1. As sete decisões

| # | Decisão | Efeito |
|---|---|---|
| 1 | ⭐ **`ad_hoc` é o caminho, e bem feito** | O catálogo deixa de ser roteador. §2 diz o que "bem feito" significa |
| 2 | ⭐ **Catálogo 🏗️ = só decomposição de variação** | Um padrão, não doze. É o único que sobrecarregaria o `ad_hoc` |
| 3 | **`std`, mediana, quantil, regressão entram** | Responde 6.3. Destrava outlier; tendência tem ressalva (§3.2) |
| 4 | **Não existe e não existirá whitelist de `agg`** | ⚠️ exige a distinção redutora × seletora (§3.1) |
| 5 | **Mapa termo→coluna é 🔧** | Entregável do onboarding, não mecanismo da plataforma |
| 6 | **Multi-planilha só depois do `ad_hoc` validado** | `main.py` continua sobrescrevendo `from = "producao"` |
| 7 | **"Memória do Plum" vira ideia futura** | ⭐ é a camada 4 do dicionário em self-service (§3.3) |

---

## 2. O que "`ad_hoc` bem feito" significa — o escopo real da Etapa 1

Como o catálogo saiu de cena, **isto é o produto**. Oito itens, todos 🏗️:

| # | Item | Por quê |
|---|---|---|
| 1 | **Log estruturado no Supabase** | Não existe métrica nenhuma hoje. Sem ele, tudo depois é palpite |
| 2 | **`metadados` como primitiva** | Metade dos "coluna não encontrada" é o agente não saber o que existe. Zero dado exposto |
| 3 | **`vocabulario`** (valores distintos + contagem) | Resolve "quanto o vendedor NOME SOBRENOME vendeu". Compila para `group_by + count + limit` — **zero mudança no executor** |
| 4 | **R1 de reconhecimento** (LLM na plataforma) | Cacheável por dataset; sem ele o prompt não cabe com N tabelas |
| 5 | **Presunções visíveis na resposta** | "'faturamento' → `receita_liquida`; presumi agosto completo". É a sua definição de `ad_hoc` visível |
| 6 | **Negação parcial por pedido** | "consigo receita, margem não está liberada pra você" em vez de erro genérico |
| 7 | **`agg` ampliado** | `std`, `median`, `quantile` |
| 8 | **Orçamento de linhas por sessão** | Só se `registro`/`amostra` entrarem. Ver §3.1 |

⭐ **A métrica de validação do `ad_hoc`:** não é taxa de acerto, é **quantas vezes o usuário corrige
uma presunção**. Isso aponta direto para o que falta no dicionário, que é o ativo.

---

## 3. Três consequências que as decisões criam

### 3.1. ⚠️ Sem whitelist, a distinção redutora × seletora passa a ser obrigatória

Concordo com a decisão — o problema nunca foi a falta de uma lista de nomes. Mas ela deixa aberto o
furo que a §6.2 da V5 revelou, e **ampliar o `agg` (decisão 3) aumenta a superfície**: `first` e
`last` passam a ser alcançáveis junto com `std` e `median`.

O furo: `RawRowsBlocked` verifica que **existe** agregação, não que ela **agrega**. `min`/`max` sobre
coluna de texto devolvem o conteúdo literal da célula — 500 nomes de clientes reais, um por grupo,
formalmente agregados, sem consumir orçamento nenhum.

**A correção não é whitelist, é classificação por comportamento:**

| Tipo | Funcs | Regra |
|---|---|---|
| **Redutora** | `sum` `avg` `count` `std` `median` `var` `quantile` | livre — o resultado não é um valor da base |
| **Seletora** | `min` `max` `first` `last` `nunique` | sobre coluna **numérica**: livre. Sobre **texto**: consome orçamento de linhas e respeita a política de sensibilidade |

O `column_roles` já distingue `text` de `number` — a informação necessária está no payload. Isso é
compatível com "não existirá whitelist": não há lista de permitidos, há regra por comportamento.

⚠️ **E um detalhe de gramática:** `quantile` precisa de parâmetro. `.agg("quantile")` devolve a
mediana silenciosamente. O plano precisa de `{"agg":"quantile","p":0.9}` — senão "o percentil 90"
vira "o percentil 50" sem erro.

### 3.2. ⚠️ Outlier vira `ad_hoc`; tendência não

**Outlier sim:** `std` e `quantile` são agregações. `.agg()` aceita direto, o agente emite, funciona.

**Tendência não.** Regressão **não é uma agregação** — não existe `agg: "slope"`. Inclinação é um
modelo sobre uma série, e há duas saídas:

- o agente pede a série por período (`serie`) e **a plataforma** calcula a inclinação → é aritmética
  entre resultados, logo **padrão**, não `ad_hoc`;
- ou uma agregação customizada registrada no executor.

Nenhuma das duas é `ad_hoc`. Então tendência fica na lista de ideias futuras **como padrão**, junto
com as outras — não como consequência grátis da decisão 3.

E a ressalva de produto continua: com 6 meses de dado não se separa tendência de ruído. O valor está
mais em outlier do que em tendência.

### 3.3. ⭐ A "memória do Plum" é a camada 4 em self-service — e isso é melhor do que parece

"Meu mês fecha no dia 5" é **calendário**; "margem = receita − custo" é **fórmula**. As duas coisas já
são a camada 4 do dicionário. O que a ideia acrescenta é **quem preenche**: o usuário, pelo front, em
vez da equipe técnica no onboarding.

Consequência boa: move o *mecanismo* e a *interface* da camada 4 de 🔧 para 🏗️, mantendo o *conteúdo*
com o cliente. É "quanto melhor a plataforma, mais fácil a implementação" na forma mais direta —
**cada campo que o usuário preenche sozinho é uma hora que a equipe não gasta.**

⚠️ **E o risco é o mesmo do mapa termo→coluna:** regra escrita pelo usuário não é validada. "Meu mês
fecha no dia 5" é inofensivo. `margem = receita − custo` escrito por quem esqueceu a glosa produz um
número errado **estável**, em toda resposta, para sempre — e ninguém desconfia, porque é consistente.

Por isso: **memória entra no bloco de presunções.** Se o Plum usou uma regra que o usuário escreveu,
a resposta diz qual.

---

## 4. Ideias futuras — anotadas, com o gatilho de cada

Nenhuma entra na Etapa 1. O gatilho é o que faz ela voltar à mesa.

| Ideia | Gatilho para reavaliar |
|---|---|
| **Cenário (`overrides`)** | camada 4 do dicionário existir (sem fórmula declarada ele não propaga) |
| **Cruzamento por grão comum** | grão declarado por tabela + multi-planilha ligado |
| **Concentração (Pareto)** | soma cumulativa disponível; e valores só positivos na métrica |
| **Composição / mix** | ⭐ é ele que responde "por que a margem **%** caiu" — o caso de razão que a decomposição não trata. Sobe quando aparecer pergunta de percentual |
| **Outlier como padrão** | se o `ad_hoc` com `std`/`quantile` produzir resposta sem contexto de calendário |
| **Tendência** | agregação customizada no executor, ou padrão que calcula inclinação (§3.2) |
| **Memória do Plum** | front de camada 4 (§3.3) |
| **Multi-planilha** | `ad_hoc` validado (decisão 6) |
| **Cohort / recompra** | exige self-join, que R-11 bloqueia. Não é "depois", é "outro projeto" |

---

## 5. O que vai para o `contexto/`

| Arquivo | Mudança |
|---|---|
| `30-decisoes.md` | **D-044 reescrita** (catálogo = 1 padrão; `ad_hoc` é o caminho) · **D-047** (sem whitelist de `agg`, com redutora × seletora) · **D-048** (`std`/`median`/`quantile` entram; regressão não é agregação) · **D-049** (mapa termo→coluna é 🔧) · **D-050** (multi-planilha depois do `ad_hoc`; `from` segue sobrescrito) |
| `11-visao-de-produto.md` | 12 padrões → **1**. O resto vira lista de ideias futuras com gatilho |
| `12-visao-tecnologica.md` | §2.2 reescrita; §3.1 ganha redutora × seletora; §10 vira os 8 itens da §2 daqui |
| `20-pendencias.md` | 🔴 furo do `min`/`max` em texto (é do produto **atual**, não do remake) · `quantile` sem parâmetro · alinhar erro de tabela inexistente com `MissingColumnError` |
| `21-melhorias-do-plum-vendido.md` | mapa termo→coluna + memória do Plum como itens de upsell |
| `03-erros-comuns.md` | "o `from` funciona" → não, é sobrescrito · "existe enum de `agg`" → não existe, e é decisão |
| `04-glossario.md` | `ad_hoc`, redutora × seletora, memória do Plum, mapa termo→coluna |

---

## 6. O que o plano de implementação ainda vai ter de decidir

Nada de tese — só execução:

1. **Ordem dentro da §2.** Minha recomendação: log (1) → `metadados` (2) → `vocabulario` (3) →
   presunções (5) → negação parcial (6) → R1 (4) → `agg` (7). O log primeiro porque ele mede tudo o
   que vem depois; R1 depois de `metadados` porque depende dele.
2. **`registro` e `amostra` entram na Etapa 1?** Se não entrarem, o orçamento de linhas (item 8) pode
   esperar — mas a §3.1 **não pode**, porque o furo do `min`/`max` já existe hoje.
3. **Quem escreve o prompt do `ad_hoc`.** É o artefato mais importante da Etapa 1 e o único sem dono
   nomeado.
4. **Critério de "validado"** para liberar multi-planilha (decisão 6). Sugestão: taxa de correção de
   presunção estável e abaixo de um limiar, medida pelo log.
