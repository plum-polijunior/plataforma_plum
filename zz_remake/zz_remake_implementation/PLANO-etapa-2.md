# Etapa 2 — plano de implementação

## Contexto

A Etapa 1 está escrita inteira (B02..B10). O `ad_hoc` responde de ponta a ponta, com a chave ligada,
sem queda para o legado.

**Esta etapa muda de conteúdo em relação ao V3.** O 👤 formulou o problema assim:

⭐ **O `a2_reconhecedor` conflita com o que o cadastro já faz.** O cadastro devolve `formatting_rule`
e `semantic_definition`; o A2 devolve `grao`, `conceito`, `confianca`, `papel_analitico`,
`vocabulario_util` e `observacoes`. São dois agentes descrevendo a mesma planilha, e só um deles tem
gente olhando.

E ao resolver isso apareceu uma mudança maior, que o 👤 propôs e que reorganiza a etapa inteira:

⭐⭐ **A planilha do Google passa a ser a etapa 1 do cadastro, e o upload de arquivo é removido.**

Isso não é ajuste de UX. Hoje o cadastro descreve um `.xlsx` que a pessoa subiu e o chat consulta um
Google Sheets, e **nada garante que sejam a mesma planilha**. As pendências C11 e C12 são as duas
faces disso. Com uma fonte só, elas deixam de ser possíveis em vez de serem consertadas.

**Decisões já tomadas** (perguntadas antes deste plano):

- **A URL da planilha vira a etapa 1. O upload some.** Cabeçalhos, amostra e perfil saem todos da
  planilha.
- **O cadastro passa a ter 4 passos** — o passo do Google Sheets virou o primeiro.
- **Etapas 3 e 4 sobem para modelo de raciocínio.**
- **A amostra do cadastro é de 20 linhas** (§B8), com o vocabulário das colunas candidatas junto.
- **`confianca` sai** (§B7). Não sobra campo deduzido sem humano olhando.
- **`ai-agents` entra no escopo**, com reorganização de arquivos (pasta `prompts/`).
- **Só a `plum_base_suja` é recadastrada.** As bases da demo ficam em v1 e o chat as tolera (§B1).
  ⛔ Deletar para recadastrar foi avaliado e **recusado** (§B6).
- **O marcador de conferência é guardado, sem tela.** `schema_metadata.versao`, consultável por SQL.
- **O legado fica como escape hatch.** `remake_habilitado` nasce `true` e vira chave de emergência.
- **A suíte de avaliação entra na etapa, depois do padrão** (§B3).

⛔ **Fora de escopo, sem exceção:** `dashboard-agent`, `dashboard-execute`, `/inicio`, os cards.

---

## §A · O que não fecha entre V7 e o código

### A1 ⭐ A definição que o usuário escreve nunca chega ao `ad_hoc`

O cadastro gera e **a pessoa edita à mão** a `semantic_definition` de cada coluna — é o campo onde
cabe *"lucro não inclui impostos"*. Sai salvo em `schema_metadata.columns[col].semantic_definition`
([DatabasePipeline.tsx:439](src/components/DatabasePipeline.tsx#L439)).

O `handleAdHocReconhecer` **busca esse objeto do banco**
([index.ts:827](supabase/functions/ai-plum-chat/index.ts#L827)) e o entrega ao `reconhecer()`. Lá
dentro ele serve para **exatamente uma coisa**: calcular o hash do cache
([reconhecedor.ts:66](supabase/functions/ai-plum-chat/adhoc/reconhecedor.ts#L66)). O prompt do A2
recebe só o `metadados`; o A3 recebe `pergunta + reconhecimento + vocabularios`.

⚠️ **E o caminho legado usa.** Os três agentes antigos recebem o `schema_metadata` inteiro no prompt
([index.ts:508](supabase/functions/ai-plum-chat/index.ts#L508),
[530](supabase/functions/ai-plum-chat/index.ts#L530),
[577](supabase/functions/ai-plum-chat/index.ts#L577)). O remake **regrediu** aqui, e ninguém notou
porque a saída continuou plausível.

### A2 ⭐ O V7 já manda o dicionário para o A3 — quem divergiu foi a implementação

V7 §1, linha do A3: entra com *"pergunta + **dicionário das candidatas** + amostra + vocabulários +
regras 🔧 + orçamento"*. E o diagrama da §2 põe o dicionário dentro da caixa **COLETA
DETERMINÍSTICA (sem LLM)**.

Então *"o A3 recebe o dicionário"* não é desenho novo desta etapa. É **dívida da Etapa 1**.

### A3 ⭐ O trabalho que o V7 dá ao A2 é vazio com uma planilha só

V7 §1: o A2 devolve *"tabelas/colunas candidatas + que vocabulários buscar"*. Com uma tabela:

- *"que tabelas importam"* — constante;
- *"que colunas importam"* — o A3 resolve melhor, porque é ele quem tem a pergunta;
- *"de quais preciso vocabulário"* — **é determinístico**: texto com `distintos ≤ 200`.

⭐ **O A2 não morre, é adiado para a Etapa 3**, onde escolher entre planilhas é problema de verdade.

⛔ Por isso `adhoc/reconhecedor.ts`, `_shared/reconhecimento.ts` e a tabela `plum_reconhecimento`
**não são apagados**. Ficam desligados, com o motivo escrito.

### A4 ⭐ A capacidade de ler só os cabeçalhos já existe, e não há rota que a exponha

`sheets.get_meta()` ([sheets.py:326](query_engine/sheets.py#L326)) lê **apenas a linha 1**
(`ranges=['Aba'!1:1]`) e devolve `headers` + `row_count`. É exatamente o que a etapa 1 precisa, e não
custa quase nada — uma chamada à API do Google, uma linha.

⚠️ Mas o `main.py` só tem `/health` e `/execute`. Falta o caminho, não a capacidade.

### A5 ⚠️ A armadilha da inversão é a permissão do Admin

`handleExecutePlan` recusa quando `allowed_columns` está vazio
([index.ts:213](supabase/functions/ai-plum-chat/index.ts#L213)), e o grant ao Admin acontece **no
finalize** ([:452-476](src/components/DatabasePipeline.tsx#L452)), a partir de
`Object.keys(schemaMetadata.columns)`.

| | corrente |
|---|---|
| hoje | arquivo → colunas → finalize → **grant** → planilha legível |
| nova | URL → cabeçalhos (`get_meta`) → **grant** → tudo legível |

⇒ **O grant sobe para a etapa 1.** É o mesmo código, mais cedo, alimentado pelos cabeçalhos da
planilha. Sem ele, tudo depois falha com *"seu cargo não tem acesso a nenhuma coluna"* no meio do
próprio cadastro — sintoma incompreensível para quem está cadastrando.

### A6 ⚠️ `ai-agents` acumulou seis ações e nenhum arquivo de prompt

`guard`, `predict_semantics`, `refine_semantics`, `format_data`, `refine_format`, `column_support` —
todos com `systemInstruction` embutido no `index.ts`. Esta etapa mexe em dois e sobe os dois de
modelo, então a reorganização deixa de ser estética.

⚠️ E há um enum espelhado em dois lugares: `FORMATTING_TYPES`
([ai-agents/index.ts:25-29](supabase/functions/ai-agents/index.ts#L25-L29)) e
`_FORMATTERS`/`TYPE_TO_ROLE` no `pandas_executor.py`. O comentário no próprio código avisa que mexer
em um lado sem o outro **quebra o dispatcher em silêncio**. Não conserto nesta etapa, mas quem mexer
no `format_data` passa por ali.

---

## §B · Decisões que atravessam blocos

### B1 ⭐ O dicionário v2 é aditivo, e os dois formatos convivem para sempre

A tolerância não é migração. As bases da demo ficam em v1 por tempo indeterminado (só a
`plum_base_suja` é recadastrada), e base esquecida não pode virar chat quebrado — tem de responder
com o que tem.

Um leitor único, `_shared/dicionario.ts`, com defaults para tudo que falta. ⛔ **Ninguém mais lê o
JSONB na mão** — nem o `ai-plum-chat`, nem o `ai-agents`, nem o front.

### B2 ⭐ Nada é salvo sem passar por gente

O modelo **propõe**; a pessoa aceita, edita ou ignora, na etapa 4 onde ela já edita as definições
hoje. É a diferença entre esta etapa e o A2, e é o único motivo de valer a pena mover a chamada.

### B3 A ordem é dicionário → padrão → avaliação, e o rollback é um `UPDATE`

O 👤 escolheu virar padrão **antes** da suíte. O risco é apontar o chat para um caminho que ninguém
mediu — e vale dizer uma vez. O que torna a escolha razoável é o B16 manter a chave: voltar é
`update organizations set remake_habilitado = false`, **sem deploy, efeito imediato**.

### B4 As duas invocações do `ad_hoc` continuam duas, e a razão mudou

O §B1 da Etapa 1 dividiu o `ad_hoc` em duas invocações porque cinco saltos sequenciais matavam a
função. Tirando o A2, o primeiro salto perde **uma chamada de LLM e uma ida ao executor**. ⭐ Isso
reabre a fusão — mas como decisão **medida**, com a `latencia_ms` na mão. Registrado, não feito.

### B5 ⚠️ O `metadados` sai do caminho da pergunta, e um sinal some junto

Hoje o `metadados` roda a cada pergunta em base fria, e é ele que devolve `existe: false` para coluna
que sumiu. Com o dicionário no banco, ele deixa de rodar no chat.

Não é regressão silenciosa: coluna que sumiu vira `MissingColumnError`, que é **erro visível** no
card. Mas o dicionário passa a ser um **retrato do dia do cadastro**.

⭐ A defasagem do `vocabulario_util` já está coberta: se a coluna passou de 200 distintos depois do
cadastro, o executor recusa o vocabulário e o A3 planeja sem ele — degradado, não errado.

### B6 ⛔ Recadastrar base ativa NÃO é operação de rotina

**Deletar um dataset dispara CASCADE:**

| tabela | chave | efeito |
|---|---|---|
| `dashboard_cards` | `ON DELETE CASCADE` | ⛔ todos os cards daquela base somem |
| `role_permissions` | `ON DELETE CASCADE` | ⛔ a matriz de permissões, curada à mão, some |
| `plum_chat.dataset_id` | `ON DELETE SET NULL` | histórico órfão |
| `plum_logs.dataset_id` | `ON DELETE SET NULL` | ⚠️ a linha de base da Etapa 0/1 perde o vínculo |

⚠️ **E recadastrar sem deletar não escapa:** base ativa cai no `insert` e vira uuid novo. Ver **C13**.

⭐ Depois desta etapa fica mais fácil de resolver: com a identidade sendo o `google_sheet_id`, um
"reconferir" que preserve o `id` passa a ser natural.

### B7 ⭐ `confianca` sai — e a informação que ela carregava sobe de nível

Ela existia porque o A2 deduzia sozinho e **precisava declarar onde tinha chutado**. Com a etapa 4
assistida, some o chute não conferido.

⚠️ **Mas ela é hoje um dos quatro gatilhos de presunção do A3.** Os outros três são sobre a
**pergunta** — duas colunas de receita, período não dito, "os melhores" — e continuam valendo.

O caso descoberto é a base cujo dicionário **nunca foi conferido** (as v1 da demo). ⭐ Para essas, a
informação sobe de granularidade: **`versao` já diz se houve humano no meio**, e o A3 é instruído a
ser mais liberal com presunções ao ler dicionário não conferido. Confiança por base, não por coluna.

### B8 ⚠️⚠️ A amostra do cadastro é de 20 linhas — e isso encosta no B10

O cadastro precisa de mais que 5 linhas: é dele que sai o `vocabulario_util`, e cinco linhas mostram
pouco de uma coluna de texto. **Decisão do 👤: 20.**

Junto vai o **vocabulário** das colunas candidatas (valores distintos + contagem), que é quase de
graça — `planoDeVocabulario` e `lerVocabulario` já existem — e é o que de fato deixa o modelo julgar
`papel_analitico` e `vocabulario_util`. As 20 linhas servem ao `grao`, que só aparece vendo colunas
repetirem juntas.

⚠️ **Mas 20 > `TETO_POR_PEDIDO = 5`, e esse 5 é do B10.** Não é detalhe: o B10 inteiro existe porque
*"o teto por pedido não protege nada sozinho"*, e `linhas.py` foi escrito para que toda linha bruta
saia por **uma porta só**.

⇒ O teto do cadastro **mora em `linhas.py`**, como constante nomeada `TETO_DE_CADASTRO = 20`, ao lado
de `TETO_POR_PEDIDO`, com o motivo escrito. ⛔ **Não** um segundo caminho. ⛔ **Não** um parâmetro
que o chamador escolhe — se o contexto virar parametrizável, o teto de 5 do chat vira sugestão.

A justificativa que precisa estar no código: o cadastro é o **dono da base registrando a própria
planilha**, com todas as colunas concedidas, antes de existir RBAC ou orçamento. Não é o chat.

⚠️ O débito de orçamento vive no `handleAdHocExecutar`, não no `handleExecutePlan` — a chamada de
cadastro não consome cota do chat. Deixar explícito, senão alguém "conserta".

### B9 ⚠️ A promessa de privacidade da tela muda de forma

Hoje, no passo do upload: *"Sua planilha não ficará armazenada em nenhum servidor… A inteligência
artificial apenas lerá o nome das colunas e os dados das 5 primeiras linhas."*

Continua verdadeira em substância — nada é guardado —, mas agora o servidor lê a planilha inteira
para **contar** (perfil) e devolve só agregado.

Redação nova, mais honesta e mais curta: *"o Plum lê sua planilha para contar e resumir; nunca guarda
os dados, e só as primeiras linhas chegam à IA."*

---

## §C · Os blocos

### B11 · O dicionário v2 e o leitor único

**Só código puro, sem migration e sem deploy.** É a fundação dos outros.

```jsonc
{
  "versao": 2,
  "grao": "uma venda",                              // novo
  "observacoes": ["custo_produto tem 40% vazio"],   // novo
  "columns": {
    "faturamento": {
      "semantic_definition": "receita líquida...",  // JÁ EXISTE, escrito por gente
      "formatting_rule": { "type": "moeda_brl" },   // JÁ EXISTE
      "papel_analitico": "medida",                  // novo
      "vocabulario_util": false                     // novo
    }
  }
}
```

⛔ **Sem `confianca`** (§B7).

**Novo:** `supabase/functions/_shared/dicionario.ts` — `lerDicionario(schemaMetadata)` devolve a
forma normalizada com default para tudo que falta e nunca lança; `paraPrompt(dicionario)` monta o que
o A3 recebe.

⭐ **`versao` é campo de primeira classe.** Ausente no JSONB significa `1`, nunca `undefined`.
Consultável: `select name, schema_metadata->>'versao' from datasets;`

⚠️ `formattingRulesFromSchema` ([query_plan.ts:368](supabase/functions/_shared/query_plan.ts#L368))
lê só `formatting_rule` e continua funcionando — mas confira, é o consumidor que quebraria mais longe
do erro.

**Testes:** blob v1 real lê limpo e devolve `versao: 1` sem o campo existir; v2 lê inteiro; `null`,
`{}`, `{columns: "lixo"}` não lançam; `paraPrompt` não vaza nome técnico onde deveria sair conceito.

---

### B12 · Ler a planilha antes de existir permissão

⭐ **Servidor puro — dá para conferir com `curl` antes de tocar na tela.** Duas peças no Lambda e uma
ação na Edge Function.

**1. `tipo: "cabecalhos"` no `main.py`** — chama `sheets.get_meta()` (§A4) e devolve `headers` +
`row_count`. Sem plano, sem colunas resolvidas.

⚠️ Ele pula a barreira 4 **de propósito**, e a justificativa é a mesma do `metadados` do B03: não há
colunas a autorizar quando o que se pede é justamente a lista de colunas. Escrever isso no código,
com o mesmo tom do comentário que já existe lá.

**2. `TETO_DE_CADASTRO = 20` em `linhas.py`** (§B8), ao lado do `TETO_POR_PEDIDO = 5`, com o motivo.
⛔ Não é parâmetro do chamador.

**3. Ação `preparar_cadastro` no `ai-plum-chat`** que expõe os dois. ⚠️ Ela roda **antes de existir
`role_permissions`**, então não pode passar pelo caminho normal — mas tem de conferir que quem chama
é membro ativo e Admin da organização dona do dataset. É a única porta desta etapa que afrouxa RBAC,
e por isso ela confere identidade explicitamente em vez de herdar.

**Testes:** Python para o teto de cadastro (20, e que ele não vaza para `amostra` do chat, que
continua em 5); TS para a ação recusar quem não é Admin da org dona.

---

### B13 · A inversão do cadastro

O bloco de front. **4 passos, não 5.**

| # | passo | o que roda |
|---|---|---|
| 1 | **Conectar planilha** — URL + instruções de compartilhamento | `preparar_cadastro` → cria dataset com `google_sheet_id`/`gid` → **grant ao Admin** (§A5) |
| 2 | **Colunas** — revisão dos cabeçalhos vindos da planilha | código. ⭐ é onde a C11 aparece na cara da pessoa |
| 3 | **Formatação** | B14 |
| 4 | **Semântica** — e salva ao final | B14 |

- ⛔ **`handleFileUpload` e o XLSX saem.** Com eles saem `originalColumns` vindo de arquivo e a
  divergência arquivo × planilha.
- ⭐ **A retomada de rascunho passa a casar por `google_sheet_id`**, não por assinatura de colunas
  ([:85-100](src/components/DatabasePipeline.tsx#L85-L100)) — identidade de verdade, e resolve o caso
  de duas planilhas com as mesmas colunas.
- `handleFinalizeAndSave` encolhe: `google_sheet_id`, `gid` e o grant já aconteceram; sobra gravar
  `schema_metadata` v2 e `status: active` ao fim do passo 4.
- ⚠️ **Reescrever a promessa de privacidade** (§B9).
- ⚠️ **Corrigir o comentário de** [DatabasePipeline.tsx:26](src/components/DatabasePipeline.tsx#L26),
  que já hoje descreve a ordem errada dos passos.

⚠️ **O erro de sequência a evitar:** publicar o B13 sem o B12 deixa o cadastro sem como ler a
planilha. B12 primeiro, sempre.

**Pronto quando:** 👤 cola a URL de uma planilha compartilhada e vê as colunas reais dela na tela,
sem ter subido arquivo nenhum.

---

### B14 · `ai-agents` reorganizado, e as etapas 3 e 4 em modelo de raciocínio

**A reorganização primeiro:** extrair os seis `systemInstruction` do `index.ts` para
`ai-agents/prompts/`, um arquivo por agente, no molde do `ai-plum-chat/adhoc/prompts/`.

⭐ E adotar o `_shared/llm.ts` do B05 no lugar das chamadas diretas ao Gemini: a escolha de modelo
passa a sair do `MODELO_POR_PAPEL`, um lugar só — que era o ponto daquele bloco, e o `ai-agents`
estava fora dele (**C2**). Papéis novos: `formatador` e `semantico`, apontando para o raciocínio.

**Etapa 3 — Formatação.** Sobe de modelo, mesmo contrato: `formatting_rule` por coluna, dentro do
enum fechado. ⚠️ Quem mexer aqui passa perto do enum espelhado (§A6).

**Etapa 4 — Semântica.** É onde o A2 é absorvido. Passa a devolver, na mesma chamada:

- `semantic_definition` por coluna (**já devolvia**)
- `papel_analitico` e `vocabulario_util` por coluna (**novos**)
- `grao` e `observacoes` da base (**novos**)

E passa a **receber** o perfil (`metadados` do Lambda), 20 linhas de amostra e o vocabulário das
colunas candidatas (§B8).

⭐ **A ordem 3 → 4 ganhou um motivo novo:** o `papel` que o perfil devolve sai do `column_roles`, que
vem da `formatting_rule`. Perfilar **depois** de a formatação estar decidida dá um perfil melhor.

⭐ **O modelo confirma ou contesta a derivação determinística, não a substitui.** `papel_analitico` e
`vocabulario_util` já vêm calculados do perfil (`texto && distintos ≤ 200`; `linhas_por_valor ≈ 1` ⇒
identificador). O valor do modelo é **discordar com motivo** — *"`cep` tem cardinalidade de dimensão,
mas é identificador"*. Onde ele não tiver o que acrescentar, o determinístico vale.

**A tela da etapa 4** ganha, além da tabela de definições: `grao` editável, `observacoes` em lista, e
por coluna o `papel_analitico` e o `vocabulario_util` — editáveis, porque é isso que os torna
confiáveis (§B2).

**Pronto quando:** 👤 cadastra a `plum_base_suja`, vê grão e observações propostos, corrige um, e
encontra a correção no `schema_metadata` com `versao: 2`.

---

### B15 · O A3 recebe o dicionário; o A2 sai do chat

⭐ **É aqui que o A2 sai** — o cadastro só produziu o artefato que torna a saída possível. B12, B13 e
B14 podem subir e ser conferidos com o chat ainda no formato antigo.

- `EntradaDoPlanejador` ganha `dicionario` e **perde** `reconhecimento`.
- `handleAdHocReconhecer` deixa de chamar LLM: lê o dicionário e busca vocabulário das colunas que o
  dicionário marcou.
- O prompt do A3 troca *"o RECONHECIMENTO da base"* por *"o DICIONÁRIO da base"*, com a frase que
  importa: **as definições foram escritas por quem conhece o negócio**. E ganha a instrução do §B7 —
  dicionário `versao: 1` não passou por humano, então seja mais liberal com presunções.

⭐ **Efeito esperado, e vale medir:** menos presunções. Se o número **não** cair, o dicionário não
está sendo lido de verdade.

⭐ **E o turno encurta:** de `porteiro → metadados → A2 → vocabulário → A3 → executor → A4` para
`porteiro → vocabulário → A3 → executor → A4`.

⛔ **Não apagar** `adhoc/reconhecedor.ts`, `_shared/reconhecimento.ts` nem `plum_reconhecimento`
(§A3, D-005). Desligar e escrever *"volta na Etapa 3"* no topo de cada um.

⚠️ **`etapa: "reconhecedor"` some dos turnos `ad_hoc`.** O `MANUAL.md` do B07 lista a sequência
esperada e passa a estar errado — corrigir junto.

---

### B16 · `ad_hoc` como padrão

**Migration nova** (⛔ não editar a de 2026-08-18 — migration aplicada é imutável):

```sql
ALTER TABLE public.organizations ALTER COLUMN remake_habilitado SET DEFAULT true;
UPDATE public.organizations SET remake_habilitado = true;
COMMENT ON COLUMN public.organizations.remake_habilitado IS
  'Chave de EMERGENCIA: desligar volta para o caminho legado (Agente A/C). Nasce true desde a Etapa 2.';
```

⚠️ **Isto não alcança os quatro clientes pagantes.** Eles usam a 🔧 implementação, deploy totalmente
separado. Confundir os dois é *"o erro mais comum e mais caro"* deste projeto.

⚠️ **A pré-condição real é o B11**, não o B15: se sobrar base v1 e o leitor não tolerar, virar o
padrão transforma base esquecida em chat quebrado.

---

### B17 · A suíte de avaliação

25–30 perguntas sobre a `plum_base_suja`, rodando como script, com o resultado registrado.

⛔ **Fora do `npm test`.** Chama modelo de verdade: no CI ficaria cara e instável, e o I-10 já mostrou
o custo de teste que falha por motivo alheio ao código.

⭐ **Duas metades, e só uma é automatizável:**

| | o quê | como |
|---|---|---|
| **mecânica** | emitiu `std` na pergunta de dispersão? declarou presunção onde havia duas colunas de receita? pediu linha onde agregação bastava? | conferível no `plum_logs`, vira regressão de verdade |
| **julgamento** | a resposta está boa? | 👤 lê e nota |

---

## Ordem e o que cada bloco publica

| bloco | migration | deploy Edge | Lambda | front |
|---|---|---|---|---|
| B11 | — | — | — | — |
| B12 | — | `ai-plum-chat` | **sim** | — |
| B13 | — | — | — | **sim** |
| B14 | — | **`ai-agents`** | — | sim |
| B15 | — | `ai-plum-chat` | — | — |
| B16 | **sim** | — | — | — |
| B17 | — | — | — | — |

⚠️ **B12 antes de B13, sem exceção** — o cadastro invertido não funciona sem quem leia a planilha.

⚠️ O B14 é o **primeiro deploy de `ai-agents`** em todo o remake. Vale o cuidado do I-03: publicar à
mão e confirmar pelo `ezbr_sha256`, nunca pelo `version`.

⚠️ O B12 publica Lambda: confira a Action `query-engine` verde, porque o smoke test roda **depois**
do `update-function-code` (C4b / I-09).

## O que esta etapa resolve de pendência

| | como |
|---|---|
| **C11** — cabeçalhos que normalizam igual | ⭐ **deixa de ser possível**: não há mais arquivo para divergir da planilha, e a colisão aparece na etapa 2 |
| **C12** — `allowed_columns` não revalidado | ⭐ **deixa de ser possível** pelo mesmo motivo; o grant nasce dos cabeçalhos reais |
| **C4** — verificar a planilha no fim do cadastro | ⭐ **vira desnecessária**: a planilha é lida no começo, não conferida no fim |
| **C2** — abstração de provedor de LLM | o `ai-agents` entra nela no B14 |

## O que esta etapa deixa em aberto

- ⭐ **C13** — reconferir base ativa sem criar uuid novo. Fica **mais fácil** depois desta etapa
  (§B6), mas continua fora do escopo por decisão.
- ⚠️ **O enum de formatação espelhado em dois lugares** (§A6). Terceira dívida de duplicação; esta
  etapa passa perto e não conserta.
- **A fusão das duas invocações do `ad_hoc`** (§B4) — espera medição.
- **`plum_reconhecimento` vestigial** — some de verdade só se a Etapa 3 não precisar dela.
- **O dicionário é um retrato do dia do cadastro** (§B5). Reperfilar é assunto da Etapa 5.
- **Os itens 2 e 3 da Etapa 2 do V3** — roteiro de demonstração (cai quase pronto do B17) e lista
  comercial (continua sem dono).
