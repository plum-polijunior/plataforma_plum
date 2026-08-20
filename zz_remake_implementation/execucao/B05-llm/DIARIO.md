# B05 · `_shared/llm.ts` — abstração de provedor — diário

**Data:** 2026-08-20 · **Escopo:** `_shared/` e `ai-plum-chat`. Nenhuma migration, nenhum Python.

A URL do provedor sai do `ai-plum-chat` e qual modelo atende cada papel vira **uma linha de tabela**
em `llm_core.ts`. É o C2 de `contexto/20-pendencias.md`, aberto desde antes do remake.

⚠️ **O bloco foi escrito sem a `ANTHROPIC_API_KEY`**, a pedido do 👤. Ela foi criada no fim do
mesmo dia — então o adaptador da Anthropic passa de "inalcançável" a "alcançável e nunca executado",
que é uma situação diferente e mais escorregadia. Ver a seção própria abaixo.

---

## O que o plano dizia e o código pediu diferente

### 1. ⭐ A leitura de token teve de sair do log — e é o que dá sentido ao bloco

`extrairUsoDeTokens` vivia em `log_core.ts` e lia `usageMetadata`, que é formato do **Gemini**. A
Anthropic devolve `usage.input_tokens`/`output_tokens`.

Mantida onde estava, ela seria "a leitura de token", no singular. No dia em que o planejador passasse
a rodar em Claude, **"custo por pergunta" — a métrica principal do `plum_logs` — sairia nula, e nada
quebraria para avisar.** É a mesma falha silenciosa que a Etapa 0 encontrou (o `usageMetadata` era
descartado por todo o repositório), reaparecendo pelo outro lado.

**Feito:** `tokensDoGemini` e `tokensDaAnthropic` em `llm_core.ts`, cada adaptador devolvendo
`{entrada, saida}` já normalizado. Há um teste que prova que uma não lê o formato da outra.

### 2. `responder()` cravava o nome do modelo

A Etapa 0 escreveu isso como constante — correto na época, porque só havia um modelo. Com a tabela
papel→modelo, a constante passaria a **mentir justamente na coluna que serve para comparar custo
entre modelos**.

**Feito:** modelo e provedor vêm da resposta do adaptador. ⭐ É isso que torna a degradação por falta
de chave **mensurável** em vez de suspeita: se o planejador rodou em Flash, está escrito na linha.

### 3. A queda do `response_schema` era do Gemini, não do chamador

Ela vivia no laço de retentativa do `handleAgente`, com um `tentativa--` para não consumir tentativa
— o pedido nem chegava a ser avaliado, então não era retentativa de verdade.

**Feito:** virou detalhe interno do adaptador do Gemini, com a semântica idêntica. O laço do
`handleAgente` ficou com uma responsabilidade só: *pedir de novo quando o JSON não parseia*, que é
política de produto e vale para qualquer provedor.

### 4. Só o `ai-plum-chat` adota — e isso é o achado A5, não esquecimento

As 4 URLs do Gemini estão em 3 funções, mas `dashboard-agent` e `ai-agents` são ⛔ fora do escopo da
Etapa 1. E como `_shared/` é empacotado **por função**, adotar nos outros depois exige republicar
cada um. Está escrito no cabeçalho do `llm_core.ts` para não parecer descuido.

---

## ⚠️ O adaptador da Anthropic nunca foi executado — e agora tem chave

A `ANTHROPIC_API_KEY` existe desde 2026-08-20. Mesmo assim **nenhuma linha de `llm/claude.ts` já
rodou**, porque os únicos papéis que apontam para lá — `planejador` e `interprete` — só nascem no
**B07**. Nada da cadeia de hoje passa por ele.

⚠️ É uma situação pior que a anterior, e vale dizer por quê: antes o caminho era *inalcançável*, e
inalcançável é seguro. Agora ele é alcançável e não testado, e o primeiro a exercitá-lo será o
bloco mais caro da etapa. **Trate qualquer surpresa no B07 como suspeita deste arquivo primeiro.**

O que ficou decidido dentro dele, e vale conferir na primeira chamada real:

**Modelo: `claude-opus-5` para os dois papéis.** É o padrão da referência da API. O planejador é o
artefato mais importante da etapa e o intérprete é quem não pode fazer conta (R-13); nenhum dos dois
é lugar para economizar antes de a suíte de avaliação existir. Baixar para `claude-sonnet-5` é uma
linha, e a decisão fica melhor informada depois das 25–30 perguntas.

**SDK oficial (`npm:@anthropic-ai/sdk@0.120.0`), não `fetch`.** Diferente do Gemini, que não tem
cliente para Deno. Versão pinada como o resto do repositório.

⚠️ **Sem saída estruturada.** Só o porteiro usa `schema`, e o porteiro roda no Gemini. Quando o
planejador precisar de garantia de forma, o caminho é `output_config.format` — mas o Query Plan tem
união de tipos em `select` e recursão em `where`, e prendê-lo num schema distorceria o plano. A
disciplina de JSON continua no prompt mais a retentativa, igual ao `plan_query` de hoje.

⚠️ **`max_tokens` é obrigatório** na Anthropic, ao contrário do Gemini. Fixado em 16000: baixo demais
trunca a resposta no meio; alto demais esbarra no timeout HTTP do SDK e obrigaria a virar streaming.

⚠️ **Recusa não levanta exceção** — devolve HTTP 200 com `stop_reason: "refusal"`. Deixei ligado o
`fallbacks: "default"`, que faz a própria API repetir o pedido em outro modelo na mesma chamada; se a
cadeia inteira recusar, vira `codigo_erro: "recusa"` no log em vez de resposta vazia sem explicação.
**Também não testado.**

---

## Decisões

**A degradação é barulhenta, não silenciosa.** Sem chave da Anthropic, `resolver()` devolve o destino
do Gemini com `degradado: true`, e o `llm.ts` emite um `console.warn` por chamada. Silêncio aqui
viraria *"o remake não ficou tão bom quanto esperávamos"* seis semanas depois, sem ninguém saber que
o planejador estava rodando em Flash o tempo todo.

**A tabela aceita os dois vocabulários** (`guard`/`plan_query`/`synthesize_answer` e
`porteiro`/`reconhecedor`/`planejador`/`interprete`), pela mesma razão que o `CHECK` de
`plum_logs.etapa`: durante a Etapa 1 as duas cadeias convivem.

**⭐ Os identificadores de modelo viraram constantes, e o Flash subiu para 3.7.** O 👤 perguntou se
não seria melhor ter os modelos como variáveis para mudar num lugar só — e estava certo sobre o
problema: `gemini-3.5-flash` aparecia **cinco vezes** na tabela, e subir de versão eram cinco edições
com quatro chances de esquecer uma. Agora é `MODELOS.FLASH` e `MODELOS.OPUS`, com um teste que impede
literal solto de voltar.

⚠️ **Mas não viraram variáveis de ambiente**, e a diferença importa. Ler o modelo de um secret
permitiria trocar sem republicar; em troca, um erro de digitação derrubaria todas as perguntas
daquele papel, nenhum teste alcançaria o valor, e o que está rodando deixaria de estar no
repositório — que é literalmente a lição do I-03. Some-se que trocar secret **incrementa o `version`**
da função sem código novo, criando de propósito mais casos do sinal falso que o I-03 manda ignorar.

**Um teste garante que as duas cadeias usam o mesmo Flash.** A Etapa 1 compara o `ad_hoc` com o
`legado`; modelos diferentes entre eles contaminariam a comparação — não daria para saber se o remake
ficou melhor ou se só ganhou um modelo mais novo. ⭐ E a troca de 3.5 para 3.7 é segura para a linha
de base justamente por causa da mudança nº 2 acima: `plum_logs.modelo` separa as duas fases.

**O contrato é estreito de propósito:** prompt, saída estruturada, temperatura, token. Cache de
prompt, tool use e streaming ficam de fora — unificá-los sai mais caro que dois clientes separados, e
nenhum agente do remake precisa deles.

---

## Um conserto de passagem

O cabeçalho do `ai-plum-chat/index.ts` afirmava *"DEPLOY: automático, via integração
GitHub↔Supabase"*. Foi medido e é falso (I-03), e a integração está desconectada desde a Etapa 0. Era
a última cópia daquela frase no repositório.

---

## Arquivos

**Novos:** `_shared/llm_core.ts` (tabela, resolução, leitura de token — puro e testável) ·
`_shared/llm.ts` (o fio) · `_shared/llm/gemini.ts` · `_shared/llm/claude.ts` ·
`_shared/llm_core.test.ts` (14 casos)

**Editados:** `ai-plum-chat/index.ts` (adota o `chamar()`; `responder()` deixa de cravar o modelo) ·
`_shared/log_core.ts` e `_shared/log.ts` (a leitura de token sai, com o motivo no lugar dela) ·
`_shared/log_core.test.ts` (o grupo de token migra para `llm_core.test.ts`)

**Verificado:** `npm test` — **208 testes** · `npx tsc --noEmit` limpo · lint na baseline (65 erros,
nenhum novo) · os sete arquivos tocados passam pelo parser do esbuild, que é o mais perto de
`deno check` que dá para rodar aqui.

⛔ **Não tocado:** `dashboard-agent`, `ai-agents`, `dashboard-execute`, `query_plan.ts`, e nada em
Python.
