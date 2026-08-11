# O formato da resposta do chat

**Data:** 2026-08-11 · **Branch:** `plataforma` · **Estado:** ✅ **tudo no ar.** Front publicado
pela Vercel e Edge Function `ai-plum-chat` publicada em 2026-08-12 (versão 51,
`ezbr_sha256` `cf4801de97b9178e17f4cffb80e298564d2e7a6bea00ad5d2c72e09155913adc`, subindo de
`14ffe669…`). Conferido no bundle publicado: `FORMATO DA RESPOSTA`, `PORTUGUÊS CORRETO` e a
mensagem já acentuada estão lá. Ver "Reversão e deploy" no fim.

A queixa foi de apresentação, não de conteúdo: a resposta do chat vinha com `**` visível na
tela, listas emendadas numa frase corrida, e erros de acentuação. O número em si já estava
certo — o Agente C devolvia `**R$ 7.800,00**`, com separador de milhar e centavos corretos.
São **três causas independentes**, e nenhuma delas era o cálculo.

---

## 1. As três causas

### 1.1 O `**` na tela: um renderizador que nunca existiu

`src/pages/PlumChat.tsx` pendurava as classes `prose prose-sm …` na bolha e depois renderizava
`{msg.content}` como **texto puro**. Não havia parser de Markdown no projeto — `react-markdown`,
`marked`, `markdown-it`, `remark`: zero ocorrências em `package.json` e em `node_modules/`.

Pior, e é a parte que engana: **as classes `prose` eram código morto.**
`@tailwindcss/typography` estava instalado em `devDependencies` desde sempre, mas nunca foi
registrado em `tailwind.config.ts` — a lista de `plugins` só tinha `tailwindcss-animate`.
Verificação que fecha o caso: o CSS construído (`dist/assets/index-*.css`) tinha **zero**
ocorrências da string `prose`. Alguém pretendeu Markdown ali e parou no meio, deixando um JSX
que *parece* estilizado.

Dois efeitos colaterais do mesmo texto puro, menos óbvios que o asterisco:

- `- item` aparecia com o hífen literal;
- todo `\n\n` colapsava em espaço simples. Sem `whitespace-pre-wrap`, o default
  `white-space: normal` come a quebra de linha, então a resposta virava um parágrafo corrido
  **mesmo quando o modelo separava os blocos corretamente**.

Contraste que confirma: a demo da landing (`src/components/sections/DataPlaygroundSection.tsx`)
faz o certo — `<p className="text-sm whitespace-pre-wrap">`. O chat real era o único lugar sem
tratamento.

### 1.2 A lista como frase corrida: prompt sem contrato de formato

O `systemInstruction` do Agente C não dizia **nada** sobre estrutura: nem Markdown, nem lista,
nem negrito, nem tamanho de resposta. As duas únicas menções a formatação em todo o prompt
eram `"respeite moedas R$, percentuais e totais"` e o exemplo `Reformatar (1480 → "1.480")`.

O contraste interno é o que dói: o Agente A, 4 linhas acima no mesmo arquivo, termina com
`"Retorne ESTRITAMENTE o JSON do Query Plan sem markdown"`. Quem **não** deveria emitir
Markdown tinha instrução explícita; quem deveria, não tinha nenhuma.

### 1.3 Os erros de ortografia: duas fontes distintas

**Fonte A — o prompt não pedia acentuação, e a entrada ensinava o contrário.** O JSON que o
Agente C recebe é cheio de identificador `snake_case` sem acento: as chaves de `rows` são os
**aliases** do Query Plan (`receita_total`), nunca os nomes de origem, e as chaves de
`schema_metadata` são a saída de `normalizarNomeDeColuna` (`natureza_da_aquisicao`,
`preco_unitario`). O modelo espelha o registro da entrada e escreve isso em prosa.

**Fonte B — mensagens nossas, sem acento, lidas como se fossem do chat.** Quatro strings de
`ai-plum-chat/index.ts` são gravadas em `plum_chat` e renderizadas na bolha do assistente:
`"Nao consegui calcular isso agora"`, `"Sua pergunta usa uma coluna que seu cargo nao pode
ver."`, `"Seu cargo nao tem acesso liberado a nenhuma coluna desta base."`, `"Executor nao
devolveu resultado."`

Essas **não passam pelo Gemini**: `PlumChat.tsx` retorna antes de chamar `synthesize_answer`
quando o status é `forbidden` ou `error`. Ou seja, não eram erro do modelo nem priming de
prompt — era erro de ortografia nosso, atribuído ao produto por quem lê.

---

## 2. O que mudou

| Arquivo | Mudança |
|---|---|
| `tailwind.config.ts` | registra `@tailwindcss/typography`; os dois plugins passaram a entrar por `import` em vez de `require()` |
| `package.json` | `react-markdown@^10.1.0` + `remark-gfm@^4.0.1` em `dependencies` |
| `src/components/RespostaMarkdown.tsx` | **novo** — o renderizador, com o mapa de elementos aceitos |
| `src/pages/PlumChat.tsx` | bolha do assistente passa por `RespostaMarkdown`; a do usuário continua texto literal |
| `supabase/functions/ai-plum-chat/index.ts` | blocos FORMATO DA RESPOSTA e PORTUGUÊS CORRETO no Agente C; 4 mensagens acentuadas + 1 comentário que citava uma delas |

### 2.1 Por que um componente separado

`RespostaMarkdown.tsx` existe em vez de um `<ReactMarkdown>` inline no JSX do chat por dois
motivos: a reversão fica sendo "apagar o arquivo e trocar uma linha", e o mapa de componentes
tem justificativa longa que não caberia dentro da árvore JSX sem atrapalhar a leitura.

**Só a bolha do assistente renderiza Markdown.** A do usuário continua literal de propósito: é
o que ele digitou, e interpretar Markdown ali reescreveria a pergunta dele na tela — um `*` no
meio de uma frase viraria itálico e o caractere digitado desapareceria.

O conjunto de elementos é estreito e casa com o que o prompt pede (parágrafo, `- ` e `**`). O
mapa cobre o caso de o modelo sair do combinado: `h1`–`h6` degradam para parágrafo em negrito
(um `<h1>` de verdade dentro da bolha competiria com o título da página), links abrem em nova
aba com `rel="noreferrer noopener"`, e tabela ganha `overflow-x-auto` — a bolha tem no máximo
70% da largura no desktop e 85% no celular, então uma tabela sem scroll empurraria a conversa
inteira. **Não há `rehype-raw`:** o `react-markdown` ignora HTML cru por padrão, e como o texto
vem de um LLM, é assim que fica.

### 2.2 As cores vêm do tema, não do plugin

O `prose-neutral dark:prose-invert` original trazia a escala de cinza própria do
`@tailwindcss/typography`, o que contraria a §7 do `CLAUDE.md` ("cores só via CSS variables do
tema") e brigava com o `text-foreground` que a bolha já define. Trocado por modificadores de
elemento (`prose-p:text-foreground`, `prose-strong:text-foreground`, …) que amarram cada
elemento de volta ao token do tema.

### 2.3 Duas armadilhas encontradas durante a implementação

**O extrator do Tailwind lê comentário.** A primeira versão dos comentários citava
`prose-neutral` e `dark:prose-invert` literalmente para explicar o que havia antes. O extrator
de conteúdo do Tailwind é regex sobre o arquivo inteiro e não entende comentário: ele gerou o
CSS dessas duas classes, **2,08 kB de utilitário morto no bundle só por terem sido mencionadas
numa explicação** (108,61 kB → 106,53 kB depois de reescrever os comentários sem os nomes).
Está registrado nos dois arquivos para não voltar.

**`first:prose-p:mt-0` não faz nada.** Foram escritos para zerar a margem do primeiro e do
último bloco e **não geravam CSS nenhum** — empilhamento de variante inválido. Também eram
redundantes: o plugin já emite `.prose :where(.prose > :first-child){margin-top:0}` e o par
simétrico. Removidos.

---

## 3. O prompt do Agente C, antes e depois

Esta é a parte da mudança **sem tipagem e sem teste**: uma regressão no prompt é invisível para
o `npm run build` e para o `npm test`. O texto anterior fica registrado aqui porque é o único
jeito de comparar depois.

### 3.1 Antes (íntegro, como estava publicado)

```
Você é o Agente C, Comunicador e Sintetizador de Respostas da Plataforma Plum.
Você receberá a pergunta original do usuário, o schema_metadata de contexto e o resultado exato e determinístico calculado pelo Pandas Executor (vetor de resultados).

Sua tarefa é elaborar uma resposta em português brasileiro executiva, clara, elegante e precisa.
- Utilize os valores exatos retornados pelo executor (respeite moedas R$, percentuais e totais).
- Não invente nem adicione números que não estejam no resultado do executor.

⛔ VOCÊ NÃO FAZ CONTA. Esta é a regra mais importante e não tem exceção.
Você não soma, não subtrai, não multiplica, não divide, não calcula porcentagem, não tira média, não projeta e não converte unidade. Todo número que aparecer na sua resposta precisa estar LITERALMENTE no resultado do executor. Reformatar (1480 → "1.480") pode; derivar um número novo, não.
- Combinar dois números do resultado para produzir um terceiro é proibido mesmo quando os dois estão ali e a conta parece óbvia. Exemplo real do que NÃO fazer: receber "total de unidades: 1.480" e "preço médio: R$ 57,50" e responder "o faturamento foi de R$ 85.100,00". Multiplicar um total por uma média não dá o valor total — dá um número errado com aparência de exato, e o usuário não tem como perceber.
- Se responder à pergunta exigiria um número que não está no resultado, diga com todas as letras que esse valor não foi calculado, apresente o que de fato veio, e sugira a pergunta que traria o número que falta. Uma resposta incompleta e honesta vale mais que uma completa e inventada.
- Se "row_count" for zero, diga que não encontrou dados para o recorte pedido, sem inventar um
  motivo.
- Responda diretamente à dúvida do usuário de forma profissional.
```

### 3.2 O que foi acrescentado (nada foi removido)

Os dois blocos entram **no fim**, depois do `⛔ VOCÊ NÃO FAZ CONTA`. A ordem é deliberada:
aquele bloco é o R-13, escrito depois de um incidente real (2026-08-11, `soma(qtd) × média(preço)`
apresentado como faturamento), e é a regra que não pode perder proeminência para uma instrução
de tipografia.

```
FORMATO DA RESPOSTA (o chat renderiza Markdown de verdade):
- Comece com UMA frase que responde diretamente à pergunta, com o valor principal em **negrito**. Só esse valor leva negrito.
- Se o resultado tiver mais de uma linha, liste os itens em tópicos, um por linha, começando com "- ", no formato "- Rótulo — valor". NUNCA emende os itens numa frase corrida separados por vírgula. NUNCA use negrito dentro dos tópicos.
- Deixe uma linha em branco entre a frase de abertura e a lista.
- Só estes recursos são permitidos: parágrafo curto, "- " para lista e "**" para o valor principal. NÃO use títulos (#), tabelas, blocos de código, citações, links nem emojis.
- No máximo 3 parágrafos. Se a lista passar de 15 itens, mostre os mais relevantes e diga quantos ficaram de fora.

PORTUGUÊS CORRETO:
- Escreva em português brasileiro com acentuação e cedilha completas: "não", "orçamento", "número", "média", "período", "aquisição".
- Nunca escreva sem acento, mesmo que a palavra apareça sem acento no JSON recebido. Nome técnico de coluna e mensagem interna do sistema vêm sem acento de propósito, e não são modelo de escrita.
- Nome de coluna NUNCA aparece cru na resposta: "preco_unitario" vira "preço unitário", "natureza_da_aquisicao" vira "natureza da aquisição", o alias "receita_total" vira "receita total". Use a definição semântica do schema_metadata para nomear o conceito em linguagem de negócio.
- Revise concordância e regência antes de responder.
```

Única alteração no texto que já existia: a quebra de linha solta em `"sem inventar um /
motivo."` foi juntada numa linha. Ela entrava literal no prompt.

**`temperature` não foi tocada.** Continua `action === "plan_query" ? 0.0 : 0.2` — o mesmo
ternário governa o Agente Z, e 0.2 é adequado para prosa.

### 3.3 O formato pedido, na prática

```
O faturamento total de julho foi **R$ 1.809,00**.

Por loja:
- Centro — R$ 980,00
- Zona Sul — R$ 529,00
- Norte — R$ 300,00
```

---

## 4. O que ficou de fora, e por quê

**Pré-formatar número no servidor — descartado nesta sessão.** A ideia era a Edge Function
formatar cada valor a partir do `formatting_rule.type` do schema e o Agente C só copiar, na
linha do R-02 ("o código executa, a IA comunica"). Descartado porque **o problema não era
esse**: o formato monetário já sai correto hoje. Fazer isso agora seria construir uma segunda
implementação de formatação (a primeira é `src/components/dashboard/formato.ts`, que não pode
ser importada num Deno) para resolver um sintoma que não existe.

**Risco vizinho que continua vivo:** `TODOS.md` registra que coluna de percentual vai **crua**
para o Agente C — "qual o desconto médio" repassa o número como veio. A formatação
determinística só existe no dashboard, não no chat. Se isso aparecer como bug, o caminho é a
pré-formatação descartada acima, e o raciocínio já está escrito aqui.

**Teste automatizado de renderização — não existe superfície.** `vitest.config.ts` limita o
escopo a `supabase/functions/**/*.test.ts` e `src/lib/**/*.test.ts`, sem `jsdom`, e o
comentário do próprio arquivo diz que componente entra "quando houver o que testar neles". A
verificação da bolha é manual, e está no §6 abaixo.

**Interação com o item `assunto → plan_query`.** `pendencias_e_dividas_tecnicas.md` propõe
trocar a coluna `plum_chat.assunto` por `plan_query` e reaproveitar o plano quando a mesma
pergunta repetir 5 vezes. Aquele item mexe no badge de `assunto` na bolha do usuário — o mesmo
bloco JSX que esta mudança editou, duas linhas abaixo. **Não há conflito de intenção** (um
troca o que é renderizado na bolha do assistente, o outro o que é gravado na linha do usuário),
mas há conflito de merge se forem feitos em branches paralelas. Este foi feito primeiro, então
o bloco JSX já está no formato final.

Nota a favor: aquele item propõe **pular o Agente A** em pergunta repetida. O Agente C continua
sintetizando em todos os casos, então o contrato de formato desta mudança vale também para as
respostas que vierem do caminho de cache.

---

## 5. Reversão e deploy

As duas metades sobem por caminhos diferentes e revertem separado. **Publique a Edge Function
depois do front** — ver a assimetria na tabela.

| Reverter | Como | O que acontece |
|---|---|---|
| **Só o front** | `git revert` do commit do front + redeploy Vercel | Volta o `**` na tela. O prompt novo continua pedindo tópicos, então a resposta chega com `- ` literal: **pior que o estado original**. Se reverter o front, reverta o prompt também. |
| **Só a Edge Function** | republicar o commit anterior de `ai-plum-chat` | Resposta volta a não ter estrutura, mas continua renderizada. Degradação limpa, sem `*` na tela. É o meio-caminho seguro. |
| **Tudo** | revert dos dois commits + republicar | Estado de 2026-08-11 pela manhã. |

Reverter só o front é o único caminho que piora — daí a ordem de deploy: front primeiro (já
melhora sozinho, porque renderiza o `**` que o modelo hoje emite), função depois.

### Publicação da Edge Function — **não é automática**

O cabeçalho de `ai-plum-chat/index.ts` afirma que o deploy é automático via integração
GitHub↔Supabase. **Não é** — a §1 do `CLAUDE.md` registra a verificação de 2026-08-10: o check
"Supabase Preview" roda em 5 segundos, sem output, e reporta `success` sem publicar nada.

```sh
npx supabase functions deploy ai-plum-chat --project-ref rjwidarrsykufuifzunu
```

**`ezbr_sha256` antes desta mudança:**
`14ffe669ef011c9fb869f15feca286afb2d988b84645e53b9af889504932bb6d` (`version` 50).

Registrado porque a Edge Function não tem rollback de um clique: desfazer é republicar o código
anterior. Sem o hash antigo, não há como afirmar de qual versão se está voltando nem provar que
a publicação nova pegou. Confira com `mcp__supabase__list_edge_functions` que o hash **mudou** —
`version` sobe sozinho em troca de secret e não serve de prova (§9 do `CLAUDE.md`).

Nada em `supabase/functions/_shared/*` foi tocado, então o fan-out da §9 (publicar
`ai-plum-chat` + `dashboard-execute` + `dashboard-agent` juntos) **não se aplica**. Só
`ai-plum-chat`.

---

## 6. Verificação

Feito e verde:

| Comando | Resultado |
|---|---|
| `npm run build` | passa, typecheck incluído |
| `npm test` | 91 testes, 3 arquivos, todos passando |
| `npm run lint` | 75 problemas / 66 erros — **um erro menos** que o baseline de 76/67 (a conversão `require()` → `import` no config resolveu um pré-existente) |
| `prose` no CSS gerado | passou de **0** para presente (`prose-strong`, `prose-p:text-foreground`, …) |

O item do CSS é o que prova que o passo do plugin pegou: se `dist/assets/*.css` continuar com
zero ocorrência de `prose`, o registro no `tailwind.config.ts` falhou em silêncio e o Markdown
renderiza sem estilo nenhum.

Falta (depende de sessão autenticada com base conectada):

- `npm run dev` → `/plum`, três perguntas:
  - **uma linha** ("qual o faturamento total?") → uma frase, negrito só no valor;
  - **várias linhas** ("faturamento por loja") → frase + tópicos com bullet renderizado, sem
    `*` na tela, sem negrito nos itens;
  - **recorte vazio** → frase honesta, sem `R$ 0,00` apresentado como fato de negócio
    (critério de `testes/chat/teste-chat-vendas-roupas.md`).
- Rolar o histórico: as respostas antigas já gravadas com `**` em `plum_chat.content` devem
  aparecer em negrito real. **Não precisa de migration** — o Markdown estava sempre no banco,
  só não era interpretado.
- Confirmar que o badge de `assunto` na bolha do usuário continua no lugar: é a linha vizinha
  à editada.
