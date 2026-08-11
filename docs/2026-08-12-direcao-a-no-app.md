# Direção A no app real

**Data:** 2026-08-12 · **Branch:** mergeada em `plataforma` (`3c93ff6..e203320`, fast-forward) ·
**Estado:** `npm run build`, `npm test` e `npm run lint` verdes; CI verde nas duas etapas; front
publicado pela Vercel; `ai-plum-chat` publicada à mão (versão 51, `cf4801de…`).

⚠️ **Duas pendências reais, nenhuma delas fechada nesta leva:**

1. **Nenhuma verificação visual foi feita.** Tudo o que está afirmado aqui é estático — build,
   testes, hashes, CSS gerado, bundle publicado. Ninguém olhou uma página renderizada. Os itens
   da §8 que dependem de olho humano continuam todos abertos, começando pelo mais importante:
   a landing tem que estar idêntica.
2. **O ΔE sob daltonismo reprova.** Ver §2.1. O `DESIGN.md` §3 pede ≥8 e o tema escuro dava 8,4;
   o claro dá **4,4** em deuteranopia. É decisão de produto, não ajuste de constante.

A branch `feat/ui-direcao-a` trouxe uma proposta visual do ambiente interno — tema claro, marca
`#7A2F56` no lugar do roxo `270 70% 60%`, e um vocabulário próprio de botão, campo e tipografia.
Ela vivia isolada em `/direcao-a`, com dados fictícios. O `docs/direcao-a.md` dela já escrevia o
passo seguinte: *"Quando a direção for aprovada, esses pares viram CSS vars e o `:root` muda de
uma vez."* Este documento é esse passo.

**Escopo:** cores, botões, campos, tipografia, títulos e textos das telas do produto. Nenhuma
linha de autenticação, cargo, RBAC, onboarding de planilha ou pipeline de agentes foi alterada.

---

## 1. O mecanismo do tema, e por que nesta direção

Antes: `index.html` tinha `<html lang="pt-BR" class="dark">` fixo, e `:root` e `.dark` em
`src/index.css` eram **cópias byte a byte** um do outro. Ou seja, não existia tema claro, e o
`.dark` não selecionava nada de fato — era decoração.

Agora:

| Seletor | Papel |
|---|---|
| `:root` | ambiente interno, **claro**, marca `#7A2F56` — a verdade do produto |
| `.dark` | os valores escuros de antes, **intactos** — opt-in da landing |

`Index.tsx` (landing) e `NotFound.tsx` pedem `className="dark"` na raiz do próprio JSX.

⚠️ **Por que não o contrário** (um `.tema-claro` embrulhando o app): o Radix renderiza `Dialog`,
`Select`, `Popover` e `DropdownMenu` em **portal no `body`**, fora da árvore do layout. Com o
claro num wrapper, todo diálogo do produto herdaria o tema errado — e o produto é feito de
diálogos (`NovoCardDialog`, `EditarCardDialog`, `AcoesDoCard`, a matriz de permissões). Com
`:root` claro, o portal já nasce certo.

O preço é o inverso, e é barato: o único modal da landing (o paywall em
`DataPlaygroundSection`) sai claro. É uma página que já está sendo refeita por outra pessoa.

Os tokens exclusivos da landing (`--glass-*`, `--gradient-*`, `--glow-*`) continuam **só em
`:root`** e são herdados por cascata dentro de `.dark` — é por isso que `glass`, `text-gradient`
e os glows não precisaram ser duplicados.

**Verificado no CSS construído:** `:root` com `--background: 0 0% 100%` e `--primary: 329 44%
33%`; `.dark` com `240 20% 4%` e `270 70% 60%`. O `.dark` aparece **depois** do `:root` no
arquivo, o que importa porque as duas têm especificidade igual (0,1,0) e vence a última.

### Mapa de tokens

| Direção A | Hex | CSS var |
|---|---|---|
| `brand` | `#7A2F56` | `--primary`, `--ring` → `329 44% 33%` |
| `brand-hover` | `#8E3A66` | `--brand-hover` |
| `ink` | `#191317` | `--foreground` |
| `ink-soft` | `#2E262B` | `--ink-soft` (corpo de texto longo) |
| `text` / `text-soft` | `#5F545A` / `#7B6E75` | `--secondary-foreground` / `--text-soft` |
| `muted` | `#6F636A` | `--muted-foreground` |
| branco | `#FFFFFF` | `--background`, `--card`, `--popover` |
| `surface` / `surface-hover` | `#FAF7F8` / `#F3EDF0` | `--muted`, `--secondary` / `--surface-hover` |
| `line` / `line-strong` / `line-hover` | `#EBE3E7` / `#E0D6DB` / `#C9BBC3` | `--border` / `--input` / `--line-hover` |
| `tint` / `tint-soft` / `tint-line` | `#F5E4EC` / `#F7EBF1` / `#E7CFDC` | `--accent` / `--tint-soft` / `--tint-line` |
| `ok` / `warn` / `danger` | `#276B4E` / `#8A5A12` / `#B3384F` | `--ok` / `--warn` / `--danger` (+ `-bg`, `-line`) |

Os tokens novos existem **nos dois temas**: `ui/button.tsx` e `ui/input.tsx` passaram a usar
alguns, e a landing usa esses primitivos (`variant="hero"` no `Header`). Sem a versão escura, um
botão da landing herdaria rosa-claro de `:root`.

Os `ok`/`warn`/`danger` resolvem uma dívida: havia **7 usos de cor crua** de status espalhados
(`Dashboard.tsx`, `Cfgdatabase.tsx`, `AccessPending.tsx`, `PlumChat.tsx`), incluindo o único
`text-white` do repositório.

### Tipografia

Bricolage Grotesque (`font-display`), Geist (`font-geist`) e JetBrains Mono (`font-code`) entram
no `index.html`. **`code`, nunca `mono`:** sobrescrever a chave `mono` do Tailwind trocaria a
fonte de todo `font-mono` já existente no repo sem ninguém pedir.

**Correção a uma afirmação do plano:** o plano dizia que isto consertaria de graça o item 11 da
lista de reprovação do `DESIGN.md` (`system-ui` por omissão), porque `Inter` estaria declarada e
nunca importada. **Está importada** — `index.html` já tinha o `<link>` do Google Fonts para
Inter. Não havia defeito ali, e nada foi consertado de graça.

---

## 2. A paleta do dashboard: cinco medições, não uma inversão

`DESIGN.md:251-253` avisava:

> **Modo claro.** `:root` e `.dark` têm os mesmos valores hoje: o produto é dark-only. Se um
> cliente pedir modo claro, a paleta de série precisa ser **re-degrau na superfície clara e
> revalidada**, não invertida automaticamente.

Exigia mesmo. `corDaSerie` (`src/components/dashboard/cores.ts`) gerava toda cor de gráfico de
uma faixa global de luminosidade 82% → 52%, validada contra a superfície escura `#120E1B`.

| # | Tentativa | Pior caso sobre `#FAF7F8` | Veredito |
|---|---|---|---|
| 1 | manter 82→52 | **1,21:1** | reprova — barra quase invisível no branco |
| 2 | baixar a faixa global (7 pares, de 62→32 a 50→28) | **1,29:1** no melhor | reprova |
| 3 | teto por matiz, amplitude fixa de 20 | **2,80:1** (azul) | reprova |
| 4 | teto por matiz buscado sobre a rampa inteira | **3,00:1** | passa em contraste |
| 5 | sinais de desvio invertidos + amplitude até o piso L=14 | **3,00:1 e ΔE 9,2** | **passa** |

**Por que nenhum par global cabe.** É física, não estética: o verde carrega o coeficiente de
luminância 0,7152 na fórmula WCAG, então `hsl(120 100% 50%)` tem 1,37:1 contra o branco. Na
superfície escura os 7 matizes tinham **piso** entre 22% e 43%, com janela larga acima; na clara
eles têm **teto** entre **32% (verde) e 65% (vermelho)** — 53 pontos de dispersão.

**Por que o passo 4 não bastou, e é a parte menos óbvia.** Ele tinha contraste em ordem nos 42
degraus e a rampa do azul saía **perceptualmente plana**: L\* 58 no maior valor contra 57 no
menor. O culpado era o sinal do desvio de matiz. Na superfície escura cada sinal apontava para o
vizinho **mais luminoso** da roda, porque ao escurecer era ganhar luminância que salvava o
contraste. Na clara, o degrau crítico é o **mais claro** — e nele o desvio nem acumulou. O que o
desvio passou a fazer foi **cancelar a rampa**: a luminosidade caía e o matiz devolvia o brilho.
Uma escala sequencial que não ordena por tamanho não é escala, é decoração.

Com os sinais invertidos, o matiz caminha para o vizinho **menos** luminoso e reforça o
escurecimento. O contraste no degrau claro não muda (lá o desvio é zero) e o escuro só melhora.
O ΔE mínimo entre degraus vizinhos subiu de **4,7 para 9,2**.

**A rampa final:**

| Matiz | L | Desvio | Contraste | ΔE viz. |
|---|---|---|---|---|
| azul | 59→25 | +24 (violeta) | 3,05 | 9,6 |
| laranja | 57→23 | −24 (vermelho) | 3,08 | 9,6 |
| aqua | 37→14 | +24 (petróleo) | 3,03 | 10,0 |
| amarelo | 38→14 | −18 (âmbar) | 3,06 | 11,2 |
| magenta | 64→30 | −34 (púrpura) | 3,00 | 9,2 |
| verde | 32→14 | +20 (pinho) | 3,15 | 10,6 |
| vermelho | 65→31 | −30 (magenta) | 3,06 | 9,9 |

### 2.1 O que NÃO foi cumprido: ΔE sob daltonismo

O plano listava isto como pendente, com estas palavras: *"Contraste eu validei; ΔE não."* Medido
depois, com simulação de dicromacia (Brettel/Viénot em espaço LMS):

| Visão | ΔE degraus vizinhos | ΔE entre slots |
|---|---|---|
| normal | 9,2 | 21,8 |
| protanopia | 5,7 | 9,4 |
| **deuteranopia** | **4,4** (vermelho, degraus 3/4) | **6,0** (laranja × verde) |

O `DESIGN.md:80` registra que a paleta escura dava *"pior par sob daltonismo ΔE 8,4 (alvo ≥8)"*.
A clara dá 4,4. **É uma regressão medida contra um alvo declarado.**

O teste `contraste-serie.test.ts` **não** cobre daltonismo, de propósito: afrouxar o limiar para
o número passar seria fingir que o critério foi atendido.

O que segura a leitura hoje é o `DESIGN.md` §9 — "cor nunca sozinha": cada barra leva rótulo e
valor ao lado, a legenda da empilhada traz valor e percentual, e existe o alternador
"Ver como → Tabela", que o próprio documento chama de *"a peça que mais paga"*.

Fechar o furo é decisão de produto: menos degraus por rampa (o `DESIGN.md` §3 já põe teto de 3
slots em formas de todos-os-pares, por motivo parecido), separação maior de matiz, ou assumir
conscientemente a dependência da tabela. Não é ajuste de constante.

**Ponto vizinho:** o magenta fica no piso **exato** de 3,00:1, sem folga. Qualquer mexida na
saturação dele reprova o teste — que é o comportamento desejado, mas vale saber antes.

### O sentido da rampa inverteu

Os três consumidores (`VizBar`, `VizStackedBar`, `VizPie`) ordenam por valor **decrescente**,
então `i = 0` é sempre o maior valor. Na superfície escura ele recebia o tom mais **claro**,
porque contra um fundo quase preto quem salta é o claro. Na clara quem salta é o **escuro** — e é
o que o `DESIGN.md` §3 pede ao pé da letra: *"mais escuro = maior"*. Sem essa inversão a barra
maior sairia a mais pálida do card: correto e lendo ao contrário.

`quantos <= 1` passou a devolver o tom **forte**, não o fraco: uma barra sozinha não precisa de
rampa, precisa de presença.

### A trava é executável agora

`src/lib/contraste-serie.test.ts`, 5 casos. Percorre os 7 slots × todas as rampas de 1 a 6
degraus e falha se: contraste < 3:1 contra a superfície; ΔE76 entre vizinhos < 8; amplitude de
L\* do maior ao menor < 8; série sozinha não for o tom forte; slot fora da faixa não ciclar.

Antes esses números viviam **só em comentário**, escritos por quem mediu uma vez. Nada impedia um
ajuste "de um pontinho" derrubar a barreira em silêncio — e o sintoma seria uma barra pálida que
ninguém associa a regressão. É o mesmo padrão que o repo já usa para o RBAC de coluna e para a
normalização de nome de coluna.

O teste importa `../components/dashboard/cores` por caminho relativo: o `vitest.config.ts` não
declara `resolve.alias` (só o `vite.config.ts`), então `@/` não resolve em teste.

**Nenhum componente do dashboard mudou.** `CardDashboard`, os 5 estados, o `gap-[2px]`, o
esqueleto de altura uniforme, os Viz — intactos. Mudou a tabela de constantes de um arquivo.

---

## 3. Uma consequência do tema que não estava no plano: hairline por opacidade

`border-border/20` era a hairline padrão do produto. Sobre `#120E1B` isso dava uma linha
discreta; sobre branco, com `--border` já em `#EBE3E7` (L 91%), **20% de opacidade desaparece**.

Eram **57 ocorrências em 8 arquivos de produto** (`Inicio`, `Dashboard`, `Cfgdatabase`,
`DatabasePipeline`, `CardDashboard`, `VizPie`, `VizStackedBar`, `VizTabela`). Substituição
mecânica, sem tocar em lógica:

- `hover:border-border/40` → `hover:border-line-hover` — o hover era "borda mais forte", e
  achatar os dois em `border-border` teria apagado o efeito;
- todo o resto → `border-border`.

Vale para `Dashboard.tsx`, `Cfgdatabase.tsx` e `DatabasePipeline.tsx`, que ficaram fora da
repaginação: sem isto, elas herdariam o tema claro **sem bordas**.

`bg-foreground/[0.045]` e afins **não** foram tocados: `--foreground` inverteu junto com o tema,
então continuam sendo um cinza discreto sobre a superfície — se adaptam sozinhos.

---

## 4. Telas

| Arquivo | O que mudou |
|---|---|
| `src/layouts/DashboardLayout.tsx` | Rail 68px ↔ 262px no hover; cabeçalho único com trilha `Organização › Tela`; 4 itens de menu uniformizados em dois grupos; identidade e "Sair" no pé |
| `src/pages/Auth.tsx` | Painel duplo; saíram os dois glows `blur-3xl`, o `glass`, o `text-gradient` e o `variant="hero"` |
| `src/pages/PlumChat.tsx` | Sem cartão, sem cabeçalho próprio; seletor de base no pé da caixa de texto; resposta do assistente sem bolha |
| `src/pages/AccessPending.tsx` | Moldura única no lugar de três wrappers idênticos |
| `src/pages/Inicio.tsx` | Só o título (agora condicional) e as bordas |
| `src/components/ui/button.tsx`, `input.tsx` | Variantes retematizadas |

### O que foi deliberadamente **não** portado

- **Busca e notificações no cabeçalho.** O protótipo desenha os dois. Não há nada atrás deles
  hoje, e affordance que não faz nada custa mais confiança do que entrega em aparência.
- **"Nova base" e "Membros" na navegação.** Não são rotas: o pipeline vive dentro de
  `/cfgdatabase` e a aprovação de membros dentro de `/dashboard`. Item de menu que não leva a
  lugar nenhum é pior que ausência de item.
- **O gráfico decorativo do login.** Virou texto. Número na tela de entrada não tem origem, e a
  única leitura possível é "estes são dados de alguém" — o mesmo princípio que faz o Agente C não
  inventar valor.
- **O cartão de identidade como botão de sair.** No protótipo, clicar no próprio nome desconecta.
  Aqui "Sair" é botão próprio.
- **Chips de sugestão e selo de proveniência no chat.** Dependem de dado que o chat não tem —
  confirmado com o usuário que precisa ser feito, mas não agora (ver §6).

### Reprovações do `DESIGN.md` §10 que morreram no caminho

Em `PlumChat.tsx`: `shadow-sm` no contêiner e na bolha, `backdrop-blur` no cabeçalho, dois ícones
em círculo colorido, o `bg-green-500` cru do selo "Online" (que não media nada) e uma animação de
300ms onde o teto é 150ms. Em `DashboardLayout.tsx`: `shadow-xl` na sidebar e o `text-gradient`
— classe de landing — no nome do produto. Em `AccessPending.tsx`: o glow `blur-3xl`, o `glass` e
o ícone em círculo colorido.

---

## 5. Reversão

| Reverter | Como | O que acontece |
|---|---|---|
| **Só o tema** (`index.css` + `index.html` + `.dark` nas duas páginas) | revert do commit de tema | As telas repaginadas ficam com cor errada: elas usam tokens que passaram a existir (`ink-soft`, `ok`, `tint-soft`). **Não reverta só isto.** |
| **Só a paleta do dashboard** | revert do commit de `cores.ts` + teste | Gráficos voltam à rampa clara sobre fundo claro: 1,21:1, ilegível. O teste fica vermelho e diz por quê. |
| **Só as telas** | revert do commit de telas | Volta o visual antigo sobre o tema novo: `glass` e `text-gradient` sobre fundo branco. Feio, funcional. |
| **Tudo, na ordem** | telas → primitivos → paleta → tema | Estado de 2026-08-11. |
| **Voltar o app inteiro para escuro sem reverter nada** | pôr `class="dark"` de volta no `<html>` do `index.html` | Saída de emergência: os tokens novos existem nos dois temas, então as telas repaginadas continuam coerentes. A rampa de `cores.ts` fica errada para escuro (é o passo 5, feito para claro) e o teste de contraste fica vermelho. |

A última linha é a que interessa numa emergência: **uma palavra no `index.html` devolve o app ao
escuro** sem desfazer commit nenhum, ao custo dos gráficos do `/inicio`.

---

## 6. Adiado, com o motivo

| O quê | Por quê |
|---|---|
| `Dashboard.tsx` e `Cfgdatabase.tsx` | Return de 538 linhas com 4 `.map` aninhados no primeiro; **6 handlers `async` escritos inline dentro do JSX** no segundo, ou seja o `return` contém regra de negócio. Repaginar ali sem extrair antes encosta em lógica. Herdaram o visual novo pelos primitivos do shadcn e pela varredura de bordas do §3 |
| `DatabasePipeline.tsx` | Mesmo motivo — 791 linhas, 5 blocos `step === N` num return só |
| Chips de sugestão / selo de proveniência no chat | Dependem de trocar `plum_chat.assunto` por `plan_query` (`pendencias_e_dividas_tecnicas.md`) |
| Landing (`/`) | Outra pessoa é dona e ainda não commitou. Fica escura e intocada |
| Alvos de toque de 44px (`DESIGN.md` §9) | O repo já estava em 36px antes desta leva. O `size="icon"` foi mantido em 40px de propósito — o protótipo desenha 34px, e encolher pioraria acessibilidade para ganhar 6px |

---

## 7. Integração com o chat em Markdown

Esta leva está **em cima** dos 3 commits de `fix/formato-da-resposta-do-chat` (`5dd06ff`,
`5ef1e18`, `6c6ae94`), que são ancestrais e não uma branch paralela. Os dois trabalhos tocavam os
mesmos arquivos; em série isso vira decisão, em paralelo viraria conflito.

| Arquivo | Encontro | Resolução |
|---|---|---|
| `tailwind.config.ts` | chat registrou o plugin `typography`; leva nova acrescenta `fontFamily` e animações `pl-*` | Regiões diferentes. **Plugin preservado** — verificado: 504 ocorrências de `prose` no CSS construído |
| `RespostaMarkdown.tsx` | corpo passou de `foreground` para `ink-soft`; `strong` **ficou** em `foreground` | É o que cria a hierarquia: a frase é legível, o valor salta. Com os dois no mesmo token o negrito só engrossa o traço |
| `PlumChat.tsx` | o `return` foi reescrito por inteiro | A assimetria usuário/assistente atravessou — é segurança de exibição, não estética |
| Prompt do Agente C | nada a fazer | O contrato pede frase + valor em negrito + tópicos, que é exatamente o que a `TelaChat` desenha |

### Pendência herdada, e ainda aberta

A Edge Function `ai-plum-chat` **continua não publicada**. Não depende desta leva —
`supabase functions deploy` publica da árvore de trabalho, e nada aqui toca
`supabase/functions/`.

```sh
npx supabase functions deploy ai-plum-chat --project-ref rjwidarrsykufuifzunu
```

`ezbr_sha256` anterior: `14ffe669ef011c9fb869f15feca286afb2d988b84645e53b9af889504932bb6d`.

---

## 8. Verificação

Feito e verde:

| Comando | Resultado |
|---|---|
| `npm run build` | passa, typecheck incluído |
| `npm test` | **96** (91 anteriores + 5 do contraste de série) |
| `npm run lint` | 75 problemas / 66 erros — igual ao antes desta leva, e **um menos** que o HEAD original de 76/67 |
| `prose` no CSS | 504 ocorrências — o plugin `typography` continua registrado |
| fontes | Bricolage Grotesque e JetBrains Mono presentes no CSS construído |
| `:root` × `.dark` | `0 0% 100%` / `329 44% 33%` contra `240 20% 4%` / `270 70% 60%`, com `.dark` depois no arquivo |

Falta, e depende de olho humano com sessão autenticada:

- **A landing (`/`) tem que ficar idêntica.** É o teste mais importante do §1.
- As 5 telas da leva em 1440px e em mobile; o rail expandindo no hover.
- Os diálogos do produto (novo card, editar card, matriz de permissões) com o tema certo — é o
  caso que o wrapper teria quebrado.
- O `/inicio` com cards de verdade, para ver a rampa nova em barra e em pizza.
- O chat: pergunta de uma linha, de várias linhas, e recorte vazio; mais o histórico antigo, que
  tem `**` gravado no banco.
