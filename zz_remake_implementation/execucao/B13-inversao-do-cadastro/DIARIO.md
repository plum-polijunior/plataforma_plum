# B13 · A inversão do cadastro — diário

**Data:** 2026-08-21 · **Escopo:** `DatabasePipeline.tsx` e uma ação a mais no `ai-plum-chat`. Sem
migration.

⭐ **A planilha do Google deixa de ser o destino do cadastro e vira a fonte dele.** O upload de
arquivo some. O cadastro passa de 5 para 4 passos.

---

## ⭐ O que a inversão resolve, e não é o que motivou o bloco

O que motivou foi destravar os campos que precisam de estatística da base. O que ela **resolve** é
maior:

Antes, o cadastro descrevia um `.xlsx` que a pessoa subiu e o chat consultava um Google Sheets. Nada
garantia que fossem a mesma planilha — nem a mesma versão dela. **C11 e C12 são as duas faces
disso**, e com uma fonte só elas deixam de ser possíveis em vez de serem consertadas.

| pendência | antes | agora |
|---|---|---|
| **C11** cabeçalhos que normalizam igual | a segunda coluna sumia calada na importação | ⛔ **barra o cadastro** no passo 2, com os nomes na tela |
| **C12** `allowed_columns` não revalidado | a matriz envelhecia até alguém pedir a coluna que sumiu | o grant nasce dos cabeçalhos reais da planilha |
| **C4** verificar a planilha no fim | nunca foi feito | ⭐ vira desnecessária: ela é lida no **começo** |

---

## ⚠️ O grant do Admin subiu, e sem ele nada funciona

O §A5 do plano previu isto e a implementação confirmou: `handleExecutePlan` recusa quando
`allowed_columns` está vazio, e a concessão ao Admin acontecia **no finalize**.

Com a URL primeiro, a corrente vira: URL → cabeçalhos → **grant** → tudo legível. `liberarColunasParaAdmin`
é o mesmo código de antes, alimentado pelos cabeçalhos da planilha em vez dos do arquivo, e roda no
passo 1.

⚠️ Sem ele o cadastro trava no meio dizendo *"seu cargo não tem acesso a nenhuma coluna"* — sobre a
base que a pessoa acabou de conectar. É o sintoma mais confuso que este fluxo poderia produzir.

---

## ⚠️ O plano subestimou o bloco em uma ação de servidor

O `PLANO-etapa-2.md` diz que o B13 é *"front"* e que o B12 é *"Lambda + `ai-plum-chat`"*. Faltou uma
peça: os passos 3 e 4 precisam de **amostra**, e ela agora vem da planilha.

O B12 foi desenhado em torno de *"o que não precisa de permissão"*, e a amostra **precisa** — ela roda
depois do grant, pela via normal, com barreira 4 valendo. Por isso não cabia lá.

`handleAmostraDoCadastro` foi escrita aqui, com duas travas que valem registrar:

⭐ **`status = 'processing'`.** As 20 linhas existem porque o cadastro precisa ver mais que o chat. Se
essa porta continuasse aberta depois de a base ficar `active`, seria um jeito de ler 20 linhas por
chamada de qualquer base — quatro vezes o teto do B10, sem orçamento nenhum contando. A porta fecha
no `handleFinalizeAndSave`, junto com a virada para `active`.

⚠️ **`allowed_columns` sai do `role_permissions`, não do que o front mandou.** Confiar na lista do
cliente aqui seria escrever "RBAC" e não ter RBAC. Se o grant não aconteceu, falha fechada.

⭐ E o tipo `amostra_cadastro` **não é alcançável pela ação `execute_plan`**: se o front pudesse
escolher o `tipo`, o teto de 5 do chat deixaria de existir na prática.

---

## A colisão de nomes passa a BARRAR, não a avisar

Enquanto houver colisão, o botão de avançar fica desabilitado e a tela mostra
`numero_de_pecas ← "Número de Peças" e "numero de pecas"`, com a instrução de renomear uma delas.

⭐ **Avisar não bastaria.** O custo de seguir é uma base nascer com uma coluna a menos no dicionário e
no `allowed_columns` — exatamente o que acontecia calado, e que ninguém procurava porque nada
apontava. Um aviso que dá para clicar "ok" reproduz o problema com um passo a mais.

Coluna **sem título** não barra: ela é contada e avisada, porque ignorá-la é o comportamento certo
(nome inventado seria adivinhar), mas quem tem uma coluna sem cabeçalho merece saber.

---

## Decisões menores

**A retomada de rascunho passa a casar por `google_sheet_id`.** Antes era por assinatura das colunas
do arquivo, o que confundia duas planilhas com o mesmo cabeçalho. Identidade de verdade.

⚠️ **Ao retomar, o cabeçalho vem sempre da planilha, nunca do rascunho.** Só volta o que já foi
*decidido* (formatação, definições). A planilha pode ter mudado desde ontem, e o rascunho não sabe.

**`handleFinalizeAndSave` encolheu** — o link, o `gid` e o grant já aconteceram. Sobrou gravar o
dicionário e virar `active`.

**`xlsx` saiu do `package.json`.** O último consumidor era o `handleFileUpload`. ⚠️ O bundle **não**
diminuiu (1.502 kB antes e depois): ele já estava sendo removido pelo tree-shaking assim que o import
sumiu. O ganho é uma dependência a menos, não tamanho.

---

## Arquivos

**Editados:** `src/components/DatabasePipeline.tsx` (`handleConectarPlanilha`, `lerCabecalhos`,
`liberarColunasParaAdmin`, `handleRelerPlanilha`, `buscarAmostra`; passos 0 e 1 reescritos; passo 4
removido; stepper com 4) · `ai-plum-chat/index.ts` (`exigirAdminDaBase`, `handleAmostraDoCadastro`) ·
`package.json`

**Verificado:** `npx tsc --noEmit` limpo · `npx vite build` passa · `npm test` **313** · lint na
baseline (65 erros, nenhum novo).

⛔ **Não tocado:** `ai-agents` (é o B14), executor, nenhuma migration.

## 👤 Falta

**Deploy do `ai-plum-chat`** (a ação nova) **e o push do front**. E o cadastro de uma base pelo fluxo
novo — ver o `MANUAL.md`.
