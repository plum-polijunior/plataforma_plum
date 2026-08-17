# Remake do Plum — V5

**Escopo:** esclarecer as dúvidas abertas antes de validar o remake. Não introduz frente nova.
**Base:** V4 + seus comentários.
**Convenções:** `⭐` central · `⚠️` risco · `✂️` discordância · `❓` aberto · `🏗️` plataforma ·
`🔧` implementação

---

## 1. ⭐ Os 12 padrões — você está certo, e eu só consigo defender três

Você pediu para eu provar você errado. Não consigo, e a tentativa produziu uma resposta melhor que
a lista: **oito dos meus doze "padrões universais" não eram padrão nenhum.**

### 1.1. A lista, com o veredicto de cada um

O critério que apliquei: **quantos Query Plans o padrão exige, e há aritmética *entre* os
resultados?**

| Padrão | Nº de planos | Veredicto |
|---|---|---|
| Comparação temporal | 2 | ✂️ **ad_hoc** — a diferença e o % são triviais |
| ⭐ **Decomposição de variação** | 4 + contribuição | ✅ **padrão de verdade** |
| Concentração (Pareto) | 1 + soma cumulativa | 🟡 borderline — a cumsum é aritmética |
| Sazonalidade | 1 (`group_by` com `trunc`) | ✂️ **ad_hoc** |
| Ranking com contexto | 1–2 | ✂️ **ad_hoc** |
| Outlier | — | ⛔ **impossível hoje** (§1.4) |
| Tendência | — | ⛔ **impossível hoje** (§1.4) |
| Composição / mix | 2 + aritmética de mix | 🟡 borderline |
| Cohort / recompra | muitos | ⛔ fora de escopo agora |
| ⭐ **Cenário (`overrides`)** | 2 | ✅ **padrão de verdade** (exige fórmula 🔧) |
| Cobertura / qualidade | 0 | ✂️ é `metadados`, não padrão |
| ⭐ **Cruzamento por grão comum** | 2 + join na chave | ✅ **padrão de verdade** |

**Sobram 3 sólidos e 2 discutíveis.** Doze era otimismo meu.

### 1.2. ⭐ O critério que substitui a lista

Vale mais que a lista, porque é testável em qualquer padrão futuro:

> **Um padrão só se justifica se ele faz aritmética ENTRE resultados de queries diferentes.**

O motivo é R-13, e ele é forte: a LLM **não pode** fazer essa conta — foi exatamente assim que o
Agente C multiplicou `soma(qtd) × média(preço)` e chamou de faturamento (I-02). Então, para uma
pergunta que exige combinar dois resultados, existem só duas saídas: **a plataforma faz a conta
deterministicamente, ou a pergunta não é respondível com honestidade.** É aí, e só aí, que a
maquinaria de padrão se paga.

Tudo o mais da minha lista era **um plano só com parâmetros diferentes** — ou seja, `ad_hoc` já
cobre. Transformar isso em "padrão" só acrescenta um passo de classificação, que é custo e risco
sem ganho.

### 1.3. Onde eu concordo com você, ponto por ponto

- **"ad_hoc será 90%"** — provavelmente sim, e **isso é o certo**, não uma falha. As perguntas de
  chat são cauda longa; classificar cauda longa em 12 classes é a parte frágil.
- **"gargalo na interpretação"** — o pior é este. Classificar errado é **pior que `ad_hoc`**:
  produz resposta confiante para uma pergunta ligeiramente diferente da que foi feita. `ad_hoc` não
  tem esse passo, logo não tem esse erro.
- **"gargalo na compilação"** — o compilador só sabe expressar o que eu antecipei. É código novo
  para manter, com teto próprio.
- **"torcer pro usuário perguntar exatamente aquilo"** — é a descrição exata do risco W2 da V4, e
  você chegou nele antes da medição.

⭐ **E o argumento mais forte contra o catálogo é um que você não escreveu, mas está implícito:**
se o andaime existe para compensar fraqueza do modelo, ele é um **ativo que se desvaloriza** — cada
geração melhor de LLM torna o catálogo menos necessário. Isso contradiz o que eu escrevi na V3
("o arquiteto é o único componente que fica mais valioso com cada LLM nova"). A V3 estava errada
nessa frase. **O que ganha valor com modelo melhor é o dicionário; o andaime, não.**

### 1.4. ⛔ Dois padrões da minha lista são ficção hoje

Conferido no código: o executor **não tem** desvio-padrão, mediana, quantil nem regressão. Só
`sum`, `avg`, `min`, `max`, `count`.

**Outlier** e **tendência** não são "padrões a construir" — são **impossíveis** até o executor
ganhar agregações estatísticas. E o Pareto precisa de soma cumulativa, que também não existe.

⚠️ E uma observação para confirmar antes de assumir qualquer coisa: **não encontrei whitelist de
`agg` no autorizador.** O enum de R-11 aparece no prompt e na mensagem de erro do
`RawRowsBlocked`, mas o `func` parece ir direto para o `.agg()` do pandas. Se for isso, ampliar
para `std`/`median` é mudança de prompt, não de executor — **e o inverso também vale: um `agg`
inesperado chegaria ao pandas sem barreira.** ❓ Vale checar antes de tratar como enum fechado.

### 1.5. 🔧 Na implementação o catálogo é válido — e por um motivo diferente

Você já concluiu isso; o que a V5 acrescenta é **por quê**, porque a razão muda o desenho:

| Na plataforma o catálogo seria… | Na implementação ele é… |
|---|---|
| um **roteador** de perguntas desconhecidas | um **conjunto de artefatos salvos** |
| aposta em qual pergunta virá | reflexo das perguntas que **você já sabe** que vêm |
| exige classificação | não exige — o card/insight já nasce escolhido |

Na implementação você conhece a base, conhece o cargo e conhece as 10 perguntas que aquele gestor
faz toda semana. Aí o "padrão" deixa de ser categoria a inferir e passa a ser um card, um insight
agendado, um cenário salvo. **Reprodutibilidade passa a importar de verdade** (o número da
segunda-feira tem de bater com o da anterior), e é aí que a compilação determinística paga.

⭐ **Consequência de roadmap:** o catálogo sai da Etapa 1 🏗️ e vira entregável do onboarding 🔧.
A frente 3 da V4 ("arquiteto + 6 padrões") encolhe para **"arquiteto + `ad_hoc` bem feito + os 3
padrões que fazem aritmética entre resultados"**.

---

## 2. R1: LLM na plataforma, código na implementação — e a razão é boa

Sua resposta está certa, e vale registrar o motivo porque ele generaliza:

| | Como mapear pergunta → tabelas/colunas |
|---|---|
| 🏗️ **Plataforma** | **LLM.** Não se sabe nada sobre a base; casar "faturamento" com `receita_liquida` exige julgamento semântico |
| 🔧 **Implementação** | **Código.** A base é conhecida; o mapa termo→coluna é construído no onboarding e vira lookup |

⭐ **E isso é um caso de "quanto melhor a plataforma, mais fácil a implementação" rodando ao
contrário, o que é ótimo:** a implementação **substitui uma chamada de LLM por uma tabela de
lookup**. Ou seja, o produto pago é mais **rápido, mais barato e mais determinístico** que a demo —
não apenas mais configurado. É um argumento de venda que não existia antes: *"na sua versão, o
Plum não precisa adivinhar de onde vem o número."*

E o mapa termo→coluna passa a ser um item do dicionário de 4 camadas (fica na camada 2, ao lado do
vocabulário de dimensão).

---

## 3. `ad_hoc` visível = presunções à mostra, não um rótulo

Sua definição resolve a dúvida e mata a pergunta que eu tinha deixado aberta: **não é para
etiquetar a pergunta como "ad_hoc"** na interface. É para o usuário ver **como a IA pensou e o que
ela presumiu** ao decidir como devolver o dado.

O que isso exige da resposta, concretamente:

```
"Faturamento de agosto: R$ 412.300.

 Como cheguei nesse número:
 • 'faturamento' → coluna `receita_liquida` (a base não tem receita bruta)
 • período → 01/08 a 31/08 pela coluna `data_venda`
 • soma de 1.840 linhas
 
 Presumi que agosto está completo. Se o fechamento é dia 5, o número ainda vai mudar."
```

Três coisas ficam obrigatórias na resposta: **que coluna virou qual conceito**, **quantas linhas
entraram**, e **o que foi presumido e pode estar errado**. Isso é D-037 ("mostrar o raciocínio")
com a fronteira definida — e mata a necessidade de qualquer rótulo técnico na interface.

⭐ E é um substituto melhor para a métrica que eu queria: em vez de medir "taxa de `ad_hoc`", meça
**quantas vezes o usuário corrige uma presunção**. Isso aponta direto para o que falta no
dicionário, que é o ativo de verdade.

---

## 4. 🔩 Nota técnica: o `from` não era ignorado — era **sobrescrito**

Sua memória está certa e o código é mais explícito do que você lembrava.
`query_engine/main.py`, linhas 164–169:

```python
tabelas = {"producao": df}

for pedido in aprovados:
    # `from` do plano pode nomear a tabela; aqui só existe uma.
    plano = dict(pedido.plan)
    plano["from"] = "producao"      # ← o valor emitido pela LLM é DESCARTADO
```

E os dois prompts que emitem plano mandam a LLM escrever `"from": "producao"`
(`ai-plum-chat/index.ts:350`, `dashboard-agent/index.ts:249`).

**As três consequências que importam:**

1. **O `from` nunca foi testado de verdade.** `execute_plan` sabe lidar com várias tabelas
   (`tables: Dict[str, DataFrame]`) e recusa a inexistente com `Tabela '<x>' nao encontrada`, mas
   esse caminho **nunca executou em produção**, porque o `main.py` força `"producao"` antes.
2. ⭐ **Multi-planilha é mais barato do que a V4 estimou.** O trabalho não é ensinar o executor —
   é **parar de sobrescrever** no `main.py`, passar `{nome: df}` por aba e deixar o arquiteto
   escolher. O executor já está pronto; o payload e o `main.py` não estão.
3. ⚠️ **O erro de tabela inexistente é silencioso hoje.** `execute_plan` devolve
   `{"error": "..."}` dentro do resultado em vez de levantar exceção. Com N tabelas, um `from`
   errado vai virar um card vazio, não um erro visível. Vale alinhar com `MissingColumnError`, que
   **levanta**.

Registrado como observação técnica: o `from` é a única parte da gramática do Query Plan que existe
no contrato e **não** existe na prática.

---

## 5. O que muda no `contexto/`

| Arquivo | Mudança |
|---|---|
| `30-decisoes.md` | **D-044 revisada** (o catálogo sai da plataforma; critério "aritmética entre resultados") · **D-043 revisada** (R1: LLM 🏗️ / código 🔧) · **D-046** (`from` sobrescrito) |
| `11-visao-de-produto.md` | os 12 padrões viram **3**; catálogo migra para 🔧 |
| `12-visao-tecnologica.md` | §2.2 — `ad_hoc` é o caminho padrão, não a exceção; §3 — multi-planilha começa no `main.py` |
| `20-pendencias.md` | novo: verificar se há whitelist de `agg` · alinhar erro de tabela inexistente com `MissingColumnError` |
| `21-melhorias-do-plum-vendido.md` | catálogo de análises entra como item de upsell 🔧 |
| `03-erros-comuns.md` | "o `from` funciona" → não: é sobrescrito |

---

## 6. ❓ O que ainda falta decidir antes de validar

1. **Os 3 padrões (decomposição de variação, cenário, cruzamento por grão) entram na Etapa 1, ou
   só o `ad_hoc` bem feito entra e eles vêm depois?** Minha recomendação: só **decomposição de
   variação** na Etapa 1 — é o "por que caiu?", o que mais parece analista, e o único que o Excel
   realmente não entrega. Os outros dois dependem de dicionário 🔧 (fórmula e grão) que ainda não
   existe.
2. **Existe whitelist de `agg`?** (§1.4) Muda se `std`/`median` são grátis ou não, e se há uma
   fresta aberta.
3. **`std`/`median`/`quantile` entram no enum?** Sem eles, "algum valor fora do padrão?" e
   "estou crescendo ou é ruído?" ficam sem resposta — e as duas são perguntas de negócio comuns.
4. **Multi-planilha entra agora**, já que o custo caiu para "parar de sobrescrever o `from`"?
5. **O mapa termo→coluna entra no dicionário de 4 camadas** (camada 2) como entregável do
   onboarding?
