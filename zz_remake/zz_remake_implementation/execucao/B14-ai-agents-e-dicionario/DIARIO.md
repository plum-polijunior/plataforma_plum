# B14 · `ai-agents` reorganizado, e a etapa 4 absorve o A2 — diário

**Data:** 2026-08-25 · **Escopo:** `ai-agents` inteiro, uma ação nova no `ai-plum-chat`,
`_shared/perfil.ts`, `_shared/llm_core.ts` e a etapa 4 do `DatabasePipeline.tsx`. Sem migration.

⭐ **É o bloco em que o cadastro passa a escrever o dicionário v2 — e o A2 do chat deixa de ter
razão de existir.**

---

## ⭐ O que a absorção do A2 resolve

O A2 e o Agente 1 descreviam a mesma planilha, e **só um deles tinha gente olhando**. O A2 rodava no
caminho da pergunta, deduzia `conceito`, `grao`, `papel_analitico` e `vocabulario_util` a partir de
uma descrição estrutural sem ver linha nenhuma, e o resultado ia direto para o A3 — ninguém nunca
leu um.

Agora o Agente 1 roda no cadastro, **vê 20 linhas, o perfil da base inteira e o vocabulário das
colunas de texto**, e a pessoa confere campo por campo na tela antes de salvar.

| campo | antes (A2) | agora (etapa 4) |
|---|---|---|
| `conceito` / `semantic_definition` | deduzido do nome da coluna | escrito com amostra e perfil, **editável** |
| `grao` | deduzido de `linhas ÷ distintos` | proposto e **editável** — campo próprio na tela |
| `observacoes` | deduzidas, invisíveis | propostas, **editáveis e removíveis** |
| `papel_analitico` | deduzido pelo modelo | **calculado** do perfil, o modelo revisa, a pessoa confirma |
| `vocabulario_util` | deduzido pelo modelo | idem, com caixa de seleção só em dimensão |
| `confianca` | o A2 declarava onde chutou | ⛔ **não existe mais** — ver abaixo |

---

## ⭐ O modelo confirma ou contesta, não substitui

`papel_analitico` e `vocabulario_util` **já chegam calculados** ao Agente 1, por regra fechada em
`_shared/perfil.ts`: `linhas_por_valor` perto de 1 é identificador, texto dentro do teto de 200 tem
vocabulário útil, número é medida, data é temporal.

O valor do modelo é **discordar com motivo** — *"`cep` tem cardinalidade de dimensão, mas é
identificador"*. Onde ele não tem o que acrescentar, o determinístico vale, e o prompt manda repetir
a sugestão em vez de recalculá-la. O cálculo viu a base inteira; o modelo viu 20 linhas.

⚠️ **A precedência que mais importa é `identificador` vencendo o tipo.** É o único caso em que a
regra contraria o tipo da coluna, e é o que estraga resposta se sair errado: uma coluna de CPF
marcada como dimensão faz o planejador agrupar por ela e devolver uma linha por pessoa — resultado
plausível, tamanho absurdo, nenhum erro no caminho. Travado em `perfil.test.ts`.

---

## ⚠️ `_shared/perfil.ts` nasceu de uma duplicação que eu mesmo criei

A primeira versão pôs as regras determinísticas em `ai-agents/dicionario_do_cadastro.ts` **e** uma
cópia da regra de vocabulário em `ai-plum-chat/index.ts`, porque as duas pontas precisam dela: o
`ai-plum-chat` decide de quais colunas pedir a lista de valores ao executor, e o `ai-agents` sugere
`vocabulario_util` ao Agente 1.

⇒ Divergir ali tem um sintoma específico e silencioso: **o Agente 1 marca uma coluna como
`vocabulario_util: true` sem nunca ter visto os valores dela**, porque o outro lado não pediu. O
dicionário nasce afirmando algo que ninguém conferiu.

Mesma razão de `query_plan.ts` e `dicionario.ts` existirem — um interpretador, vários pontos de
aplicação. `perfil.test.ts` tem um teste que compara os dois consumidores coluna por coluna.

---

## ⭐ A ordem 3 → 4 ganhou um motivo mecânico

O `papel` que o perfil devolve sai do `column_roles` do executor, que vem da `formatting_rule`.
Perfilar **depois** de a formatação estar decidida dá um perfil melhor: uma coluna de moeda
perfilada como texto não devolve `min`/`max` (o `metadados` os recusa em texto, por privacidade), e
o Agente 1 perderia justamente a evidência de que ela é medida.

⇒ `perfil_do_cadastro` lê as regras da etapa 3 **do `sketch`**, não do corpo da requisição. O front
já grava `sketch.formattingRules` no fim da etapa 3, então o dado está no banco quando a ação roda.
Não é sobre autorização — regra de formatação não autoriza nada — é sobre não ter duas versões da
mesma decisão em trânsito.

---

## ⚠️ `vocabulario_exposto` é ignorado no cadastro, e é decisão

A trava 2 do B04 existe para o **chat** não listar valor de texto de uma base que ninguém liberou.
No cadastro ela não protege nada: a etapa 3 já mostrou 20 linhas cruas de todas as colunas na tela
da mesma pessoa, que é uma porta maior que a lista de distintos de uma coluna com no máximo 200
deles.

Mesma justificativa do `TETO_DE_CADASTRO` (§B8): é o dono da base registrando a própria planilha,
com todas as colunas concedidas. As travas **1** (`allowed_columns`, lido do `role_permissions`) e
**3** (teto de cardinalidade, no executor) continuam valendo, e a flag default é `false` — sem esta
decisão, o Agente 1 nunca veria vocabulário nenhum.

---

## ⚠️ Falha parcial é resposta, não erro

Perfil e vocabulário são evidência *a mais*. Se o executor recusar um deles, a etapa 4 segue com
menos — e o prompt **diz** que está com menos (`PERFIL DA BASE: não disponível`), em vez de omitir o
bloco. Silêncio faria o modelo escrever definição mais vaga sem dizer por quê.

Derrubar o cadastro porque o vocabulário de uma coluna não veio seria trocar um dicionário um pouco
pior por nenhum dicionário.

---

## ⛔ `confianca` saiu, e a informação subiu de nível

Ela existia porque o A2 deduzia sozinho e **precisava declarar onde tinha chutado**. Com a etapa 4
assistida, não sobra chute não conferido.

Mas ela era um dos quatro gatilhos de presunção do A3. O que a substitui é `schema_metadata.versao`:
**confiança por base, não por coluna**. `paraPrompt` acrescenta um aviso explícito quando o
dicionário é v1, e o A3 é instruído a ser mais liberal com presunções ali. Base v1 nunca passou por
gente — os conceitos dela são palpite de modelo que ninguém leu.

---

## ⚠️ Uma tentativa desfeita: `response_schema` no Agente 1

Cheguei a escrever um `response_schema` declarando `grao` e `observacoes`, que são os campos novos e
os que ninguém notaria faltando. **Está errado, e desfiz:** o schema descreve a resposta INTEIRA, e
`columns` (chaves dinâmicas — nome de coluna) não é declarável. Um schema parcial faria `columns`
virar propriedade não declarada e o modelo a **omitiria** — trocando um campo que às vezes falta
pelo campo que nunca pode faltar.

Quem garante a forma é `normalizarDicionarioDoAgente1`, em código: toda coluna pedida sai, papel
fora do enum cai na sugestão, `grao` ausente vira `""` — que é o que `lerDicionario` já sabe tratar.

---

## ⭐ A reorganização, e o que ela conserta de verdade (C2)

Seis `systemInstruction` saíram do `index.ts` para `prompts/`, um arquivo por agente, no molde do
`ai-plum-chat/adhoc/prompts/`. E toda chamada passou a ir por `_shared/llm.ts`.

⚠️ **O ganho não é estético.** A URL tinha `gemini-3.5-flash` cravado, fora da tabela
`MODELO_POR_PAPEL` — que existe exatamente para ser o único lugar de subir versão. O literal ficou
**duas versões atrás** sem ninguém notar: o Flash da tabela já era `3.7`.

Quatro papéis novos: `guardiao`, `formatador`, `semantico`, `suporte`, todos no modelo de
raciocínio. O plano subia só `formatador` e `semantico` (as etapas 3 e 4); subir os quatro foi
decisão do 👤 em 2026-08-25 — *"todos os agentes das 4 etapas"* —, registrada como **D-047**. O
raciocínio: o que estes seis escrevem entra no `schema_metadata` e vale para toda pergunta futura, e
o custo é O(1) por base, não por pergunta.

⚠️ Sobra o `dashboard-agent` fora da abstração, por decisão de escopo.

---

## Arquivos

**Novos:** `_shared/perfil.ts` · `_shared/perfil.test.ts` ·
`ai-agents/dicionario_do_cadastro.ts` + `.test.ts` · `ai-agents/prompts/` (7 arquivos).

**Mudados:** `ai-agents/index.ts` (reescrito) · `_shared/llm_core.ts` (+4 papéis) ·
`_shared/llm_core.test.ts` · `ai-plum-chat/index.ts` (ação `perfil_do_cadastro`) ·
`src/components/DatabasePipeline.tsx` (etapa 4 + `schema_metadata` v2).
