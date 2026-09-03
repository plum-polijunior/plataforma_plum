# src/ — o que esta pasta esconde

Sistema de design completo em **`DESIGN.md`**. Aqui só as armadilhas.

## 1. ⚠️ São TRÊS mecanismos de tema, não dois

| Mecanismo | Onde | Estado |
|---|---|---|
| `:root` | tudo | **tema claro**, marca `#7A2F56`. É o default |
| `.dark` | — | **sem consumidor hoje.** Fica como saída de emergência |
| `.tema-escuro` | produto logado, via `use-tema.ts` | matiz 329, on-brand (`index.css:228+`) |

⚠️ Se `.dark` voltar a ser usado, `--glow-*`, `--glass-*` e `--gradient-*` precisam ser redefinidos
lá dentro — foram retunados de roxo para vinho e só existem em `:root`.

⚠️ **A classe vai em `document.documentElement`** (o `<html>`, nó único da SPA), e **não** num
wrapper: o Radix renderiza `Dialog`/`Select`/`Popover` em portal no `body`, fora da árvore do
layout — wrapper daria a todo diálogo o tema errado.

⚠️ **Efeito que escreve em nó global precisa de limpeza.** Sem `return () => classList.remove(...)`
a classe sobrevive ao logout e vaza para a landing/`/auth`/404, que não têm opinião própria sobre
tema. Já aconteceu — `contexto/31-incidentes-e-licoes.md` I-06.

⚠️ `profiles.tema` é escrito **só por RPC `definir_tema()`**, nunca `UPDATE` direto: a única policy
de UPDATE em `profiles` exige `id <> auth.uid()` de propósito, contra autopromoção.

## 2. ⚠️ Hairline é `border-border`, sem opacidade

`border-border/20` era padrão no tema escuro e **desaparece no claro** (`--border` já é `#EBE3E7`,
L 91%). Para hover mais forte existe `border-line-hover`. 57 ocorrências foram varridas — não
reintroduza.

Cores **só** via CSS variables (`hsl(var(--primary))`), nunca hex solto.

## 3. ⚠️ O extrator de classes do Tailwind é regex e não pula comentário

Citar o nome de uma classe dentro de um comentário **gera o CSS dela** — utilitário morto no bundle
(custou 2,08 kB uma vez, só por explicar o que havia antes). **Descreva** a classe em vez de escrever
o nome dela.

## 4. `src/lib/colunas.ts` é metade de um contrato entre duas linguagens

`normalizarNomeDeColuna` é espelhada em `query_engine/sheets.py`. Mexeu em uma? Mexa na outra **e
nas duas tabelas de 26 casos**. Nunca reimplemente a normalização num componente.

## 5. Literais que não podem ser inline

`join_mode` vive em `src/lib/organizacao.ts`, **e só lá**. O SQL versionado diz `'share_id'`, o dump
de produção diz `'codigo'` — ler é inofensivo, **escrever** com o valor errado dá `23514`. Importe as
constantes.

⭐ **`src/lib/dicionario.ts` é o mesmo caso, e tem DUAS telas escrevendo** (cadastro e "Editar
Esquema"): `PAPEIS`, `REGRA_SEM_FORMATACAO`, `VERSAO_DO_DICIONARIO` e `vocabularioEfetivo`.

⚠️ O último não é açúcar: `colunasComVocabulario` (no leitor, Deno) filtra **só** por
`vocabulario_util`, sem olhar o papel. Um `true` sobrando numa coluna de medida faz o chat pedir a
lista de valores de uma coluna numérica em **toda** pergunta daquela base — e sobra fácil, porque a
tela esconde o interruptor fora de dimensão. A checagem é na **gravação**, nunca no `onChange` —
mesmo agora que o "Editar Esquema" grava sozinho e os dois momentos distam ~900 ms. O estado guarda o
valor cru, então trocar o papel e voltar devolve a escolha; é o banco que recebe o saneado.

⚠️ **E naquela tela há UM caminho de escrita do `schema_metadata`** (`salvarAgora`), de propósito:
dois caminhos no mesmo painel já apagaram o trabalho de alguém — `contexto/31-incidentes-e-licoes.md`
I-15. Quem gravar tem de partir do que está na tela, nunca do que está salvo.

## 6. Rotas e nomes que enganam

- **`/dashboard` NÃO é o dashboard** — é "Minha Organização" (membros, cargos, permissões). O
  dashboard de dados é **`/inicio`**.
- **Todo login pousa em `/inicio`** — três caminhos em `Auth.tsx` (senha, SSO, criar organização) que
  **não compartilham constante**. Mexeu em um, mexa nos três.
- ⚠️ **`Cfgdatabase.tsx` NÃO tem a matriz de permissões** — não há `Tabs` nem `?tab=permissoes` ali.
  Ela é datasets + edição de esquema (definições, formatação e o **Reler a planilha** do B22). A
  matriz mora em `Dashboard.tsx`; movê-la para cá é a pendência P9, nunca aplicada.

## 7. Convenções

Código e domínio em **português** (`carregando`, `pendente`, `criar_organizacao`). Alias `@/` →
`src/`. shadcn em `src/components/ui/` — **preferir compor a editar**. Cargo comparado sempre com
`.toLowerCase()` (`is_org_admin()` é case-insensitive).

⚠️ Resposta do chat é **Markdown restrito** e é um par com o prompt do Agente C: parágrafo, lista
`- `, `**negrito**` só no valor principal. Renderiza `RespostaMarkdown.tsx`, e **só** na bolha do
assistente — a do usuário é literal. Mexeu num lado, mexa no outro.
