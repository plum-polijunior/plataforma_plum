# B11 · Dicionário v2 e o leitor único — diário

**Data:** 2026-08-21 · **Escopo:** um arquivo novo, puro. Sem migration, sem deploy, sem front.

Primeiro bloco da Etapa 2, e o mais barato dos sete. Ele não muda comportamento nenhum: cria o
leitor que os outros seis vão usar. ⭐ Nasce **sem consumidor de propósito** — é a única ordem que
permite o B15 trocar `reconhecimento` por `dicionario` sem escrever o parser no meio da troca.

---

## ⭐ Por que um leitor, em vez de cada consumidor abrir o JSONB

O `schema_metadata` é lido hoje em seis lugares — `ai-plum-chat`, `ai-agents`, `dashboard-agent`,
`dashboard-execute`, `query_plan.ts` e o front. Enquanto o objeto teve duas chaves isso passou. Com a
Etapa 2 ele ganha cinco, e **duas formas convivendo**.

Seis interpretadores de um formato com duas versões é a receita do **D-028**: cada um internamente
coerente, divergindo em silêncio, e o sintoma aparecendo longe da causa. As duas dívidas de
normalização duplicada do projeto nasceram assim.

⛔ A regra que vale a partir daqui: **ninguém mais lê o JSONB na mão.**

---

## Decisões

### ⭐ A forma de saída espelha `Reconhecimento`, menos `confianca`

`conceito`, `papel_analitico`, `vocabulario_util`, `grao`, `observacoes` — os mesmos nomes que o A2
devolve hoje. É deliberado: no **B15** o A3 troca `reconhecimento` por `dicionario`, e com os campos
iguais a troca é mecânica em vez de reescrita.

O `semantic_definition` do JSONB vira `conceito` na saída pelo mesmo motivo.

⛔ `confianca` não vem junto (§B7 do plano). Ela existia para o A2 declarar onde tinha chutado, e no
cadastro assistido não sobra chute não conferido.

### ⭐ O que a `confianca` informava sobe de granularidade

Some o campo por coluna, entra `conferido` por base — `versao >= 2`. E o `paraPrompt` transforma isso
numa frase para o A3:

> ⚠️ Este dicionário NÃO foi conferido por uma pessoa: os conceitos acima foram deduzidos
> automaticamente e podem estar errados. Declare presunção sempre que usar uma coluna cuja descrição
> você teve de interpretar.

Em vez de o A3 saber **onde** desconfiar, ele passa a saber **quando** desconfiar de tudo. Para as
bases v1 da demo — que nunca passaram por gente — isso é mais honesto que a confiança por coluna, que
era palpite do próprio modelo sobre o próprio palpite.

### ⭐ Base v1 deduz o papel a partir do tipo de formatação

Base v1 não tem `papel_analitico`, mas **tem** `formatting_rule`. Devolver `dimensao` para tudo faria
o A3 tentar agrupar por faturamento; o tipo restringe bastante:

| formatação | papel |
|---|---|
| `data`, `ano` | `temporal` |
| `moeda_brl`, `numero_decimal`, `numero_inteiro`, `percentual` | `medida` |
| `documento_cpf_cnpj` | `identificador` |
| resto | `dimensao` |

⚠️ **Restringe, não determina** — e é por isso que a v2 pergunta a uma pessoa. `numero_inteiro` tanto
é `quantidade_vendida` (medida) quanto `pedido_id` (identificador). Há um teste garantindo que o
declarado vence a dedução, com exatamente esse caso.

### ⭐ Vocabulário ligado por padrão nas dimensões da v1 — pela assimetria do erro

Base v1 não declara `vocabulario_util` e não há cardinalidade no JSONB para decidir. Os dois erros
custam coisas diferentes:

- **falso positivo** (buscar vocabulário de coluna com 5.000 valores): o teto de 200 do executor
  recusa em silêncio e o A3 planeja sem. Custo: um pedido desperdiçado, dentro do limite de 4.
- ⛔ **falso negativo** (não buscar de coluna com 40 valores): o resolvedor de entidade fica sem
  lista e *"quanto o joão vendeu"* devolve **vazio** — a falha exata que o vocabulário existe para
  evitar, e que parece um fato em vez de um defeito.

Então dimensão da v1 assume `true`, e o executor filtra. É a mesma lógica de falha barulhenta ×
falha muda que já governa as duas dívidas de normalização.

### Coluna sem descrição continua sendo coluna

`{ columns: { a: null } }` produz a coluna `a` com conceito vazio, não some com ela. O nome está no
cabeçalho da planilha; some a descrição, não a coluna — apagá-la faria o A3 planejar sem uma coluna
que existe.

E o `paraPrompt` **diz** *"(sem descrição)"* em vez de omitir a linha: omitir faria a coluna parecer
inexistente, e o A3 a evitaria sem saber por quê.

### ⚠️ `versao` ausente é `1`, nunca `undefined`

Deixar `undefined` escapar obrigaria todo consumidor a lembrar de tratar, e um dia um não lembra.
Mesmo raciocínio do `nenhuma` como valor de `formatting_rule.type`.

---

## Testes

27 casos em `_shared/dicionario.test.ts`, e o bloco que mais importa é o da **v1** — as bases da demo
não serão recadastradas (C13), então elas passam por esse caminho para sempre.

⚠️ Doze entradas de lixo (`null`, `{columns: "lixo"}`, `{columns: []}`, `versao: "duas"`, …) provam
que **nada aqui lança**. Ele roda no caminho da pergunta: `schema_metadata` estranho tem de virar
dicionário pobre, não turno perdido.

---

## Arquivos

**Novos:** `supabase/functions/_shared/dicionario.ts` ·
`supabase/functions/_shared/dicionario.test.ts`

**Verificado:** `npm test` — **313 testes** (eram 286) · `npx tsc --noEmit` limpo.

⛔ **Não tocado:** nada. Nenhum consumidor existente foi alterado, e é o ponto do bloco.

## 👤 Falta

**Nada.** Sem migration, sem deploy, sem tela. Ver o `MANUAL.md`.
