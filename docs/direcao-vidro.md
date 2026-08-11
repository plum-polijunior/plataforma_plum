# Direção Vidro — proposta de ambiente interno

Port do protótipo `Plum Interno - Vidro v2.dc.html` (projeto de design "Frontend interno
da plataforma Plum") para React.

**Rota:** `/vidro` — fora do `DashboardLayout`, sem guard de organização.

---

## 1. Leia isto antes do resto: ela contraria o `DESIGN.md`

Não é descuido da transcrição. É a característica central da direção, e a decisão que ela
existe para provocar.

| `DESIGN.md` | O que a Direção Vidro faz |
|---|---|
| §1 App UI — fundo "plano, sem gradiente, sem glow, **sem vidro**" | Todo painel é `backdrop-filter: blur(22–30px) saturate(165–175%)` sobre um fundo com gradiente radial, três manchas animadas e um canvas de feixes |
| §1 App UI — sombra "**nenhuma.** Separação por hairline de 1px" | Três níveis de sombra (`--sombra-1/2/3`), até `0 34px 80px -34px` |
| §1 App UI — movimento "só transição de estado (≤150ms), **nada decorativo**" | Manchas em deriva de 46s, 61s e 53s, em laço infinito |
| §10 reprovação automática, item 1 — "gradiente ou glow atrás de número" | Os oito KPIs são vidro translúcido sobre as manchas animadas |
| §9 acessibilidade — "nada acessível só por hover" | O rail só revela os rótulos no `:hover`; fechado, são cinco ícones sem texto |

Some contexto que pesa na decisão: os commits `c053ed2` e `ea2f915` (2026-08-11) **removeram**
vidro e glow de `Auth.tsx` e `AccessPending.tsx`, citando a §1 nos comentários. Esta direção
anda no sentido oposto ao que o código andou naquele dia.

Isso não a invalida — o `DESIGN.md` §11 já mudou de ideia uma vez, quando o modo claro saiu de
"o produto é dark-only" para a Direção A. Mas adotar a Vidro em tela de produto exige **revisar
a §1 e a §10 antes**, não depois. Enquanto isso não acontecer, `/vidro` é maquete: navegável,
discutível, e sem nenhuma ligação com o tema do produto.

---

## 2. O que isto é, e o que não é

É uma **proposta navegável**. Roda no app real, com os componentes e o build do repo, para a
direção ser avaliada com `npm run dev` em vez de captura de tela — e para o custo de
`backdrop-filter` em tela cheia aparecer em máquina de verdade.

**Não é** a plataforma. Sem Supabase, sem sessão, sem RBAC. Tudo vem de
`src/components/vidro/dados-demo.ts` e é fictício: a organização "Cali Ltda" não existe e
nenhum e-mail `@cali.com.br` é real. Nenhum botão escreve nada.

Os números **não** são os mesmos da Direção A, de propósito: o protótipo Vidro reescreveu a
cópia para mostrar dado que incomoda — o tempo de resposta piorou (`+0,3s`, "piorou com a base
nova"), uma base está parada na etapa 4 com um responsável nomeado, e 212 pedidos ficaram de
fora da conta do gráfico. Um protótipo em que tudo sobe não testa se a interface aguenta número
ruim.

---

## 3. Os dois temas, e por que não mexem no `.dark`

A proposta tem tema claro e escuro, alternados pelo botão no cabeçalho. Abre no escuro.

O mecanismo é um atributo `data-tema` na raiz da rota, com os dois blocos de variáveis em
`src/components/vidro/vidro.css`. **Não** é o `.dark` do produto, e não pode ser: o `.dark` do
`src/index.css` é opt-in da landing e vive no `className` da raiz de `Index.tsx` e
`NotFound.tsx` (`CLAUDE.md` §7). Se o alternador daqui mexesse em `document.documentElement`, um
botão de protótipo trocaria o tema do app inteiro.

`src/index.css` não foi tocado. `:root` continua sendo o claro da Direção A.

---

## 4. Mapa de telas

| Tela da proposta | Arquivo aqui | Página real correspondente |
|---|---|---|
| Shell / rail | `components/vidro/Rail.tsx` | `layouts/DashboardLayout.tsx` |
| Cabeçalho | `components/vidro/Cabecalho.tsx` | `layouts/DashboardLayout.tsx` |
| PLUM Chat | `components/vidro/TelaChat.tsx` | `pages/PlumChat.tsx` |
| Minhas Bases de Dados | `components/vidro/TelaBases.tsx` | `pages/Cfgdatabase.tsx` |
| Pipeline (etapa 3 de 5) | `components/vidro/TelaPipeline.tsx` | `components/DatabasePipeline.tsx` |
| Minha Organização | `components/vidro/TelaOrganizacao.tsx` | `pages/Dashboard.tsx` |
| Membros | `components/vidro/TelaMembros.tsx` | `pages/AccessPending.tsx` + `hooks/use-org-access.ts` |

O protótipo Vidro **não tem tela de login** — diferente da Direção A, que tinha.

---

## 5. Superfície de mudança

Um único arquivo existente foi alterado: **`src/App.tsx`**, `+7` linhas (um `import` e uma
rota). Todo o resto é arquivo novo.

Não foram tocados: `src/index.css`, `tailwind.config.ts`, `index.html`, `package.json`,
`package-lock.json`, nenhuma página, nenhum componente de `ui/`, nada de `supabase/`,
`query_engine/` ou `infra/`.

`index.html` não precisou de nada porque a Direção A já subiu Bricolage Grotesque, Geist e
JetBrains Mono no link do Google Fonts.

Arquivo novo: `src/assets/plum-mark.png` (o símbolo isolado — `plum-logo.png` continua onde
estava e segue em uso), `src/components/vidro/` (15 arquivos) e `src/pages/Vidro.tsx`.

### Por que um `.css` num repositório Tailwind

`src/components/vidro/vidro.css` existe porque quatro coisas da proposta não têm utilitário
equivalente e virariam valor arbitrário ilegível — ou simplesmente não existiriam:

1. a superfície de vidro, com `backdrop-filter` em blur e saturação diferentes por camada;
2. a borda de 1px feita de gradiente, que precisa de um elemento externo com `padding: 1px`
   porque `border-image` não convive com `border-radius`;
3. os fallbacks de `@supports not (backdrop-filter)` e `prefers-reduced-transparency`, que
   dependem de `!important`;
4. o rail, que abre por `:hover` em CSS puro, sem estado em React.

Geometria, espaçamento e tipografia continuam em utilitários no JSX. Cor crua existe **só**
nesse arquivo, que é a definição dos tokens; todo o resto lê por `var()`, como o `CLAUDE.md` §7
pede. Todo seletor está sob `.v-raiz` / `[data-tema]`, que só existem nesta rota — no protótipo
`a`, `input::placeholder` e a barra de rolagem eram globais, e assim escritos apagariam a
landing.

---

## 6. Desvios conscientes do protótipo

- **`isolation: isolate` na raiz.** No protótipo a raiz era filha direta do `body`; aqui vive
  dentro de um app que tem tema próprio, e as camadas de fundo usam `mix-blend-mode`. Sem o
  isolamento elas mesclariam contra o que estiver atrás da rota.
- **O `@supports` também testa `-webkit-backdrop-filter`.** O do protótipo testava só a
  propriedade sem prefixo, o que ligaria o fallback opaco no Safari, justamente onde o vidro
  funciona.
- **O `prefers-reduced-motion` também desliga as animações de entrada**, não só as manchas.
  O `DESIGN.md` §9 pede que o movimento desligue por completo.
- **Item ativo do rail virou variável (`--nav-ativo`).** O protótipo resolvia essa cor em JS
  porque no escuro o ativo é branco e não o acento. Tudo o mais que ele resolvia em JS (cor e
  gradiente das barras do gráfico) já existia como token nos dois temas e passou a ser lido de
  lá — o ramo em JS era redundante.
- **A linha do tempo da Atividade não puxa fio depois do último item.** No protótipo puxa, e a
  linha fica pendurada no respiro do card. É o único ponto em que a transcrição corrige em vez
  de copiar.
- **Peso 600 em JetBrains Mono não existe no subconjunto carregado** (o `index.html` sobe 400 e
  500). O número do passo do pipeline usa 500. Resolver custa um caractere no `index.html`, mas
  seria mexer num arquivo compartilhado por causa de uma rota de proposta.
- **Responsividade mínima.** O protótipo foi desenhado em viewport fixa de 1440×900. As grades
  de KPI caem para 2 colunas abaixo de `lg` e as de duas colunas viram uma. Em 1440px o
  resultado é o do protótipo.
- **Ícones via `lucide-react`** em vez de SVG inline — os do protótipo já eram do mesmo
  conjunto. Botões só de ícone ganharam `aria-label`.

---

## 7. O que foi verificado

- `npm run build` limpo; `npm run lint` sem apontamentos nos arquivos novos; `npm test` 96/96.
- As cinco telas percorridas nos **dois** temas em 1440×900, conferindo título, subtítulo,
  `aria-current` do rail e o conteúdo de cada uma.
- O canvas de feixes pinta (36,9% dos pixels), e é **determinístico**: alternar para o claro e
  voltar reproduz o mesmo buffer byte a byte. Era o risco de trocar o `componentDidUpdate` do
  protótipo por um efeito com dependência em `tema`.
- Resolução do canvas medida em 432×270 para uma tela de 1440×900 — os 30% pretendidos.
- Tokens conferidos nos dois temas: fundo, tinta, `--vidro-alto`, blur/saturação por camada,
  raio interno = externo − 1px, cor de `ok`/`alerta`, e o par ativo/inativo do rail
  (`#7A2F56`/`#5F545A` no claro, `#FFFFFF`/`#C9BEC3` no escuro).
- As três regras de fallback presentes na folha compilada.
- **A landing continua intacta:** em `/`, o `DIV.dark` segue com `rgb(8,8,12)` e
  `--primary: 270 70% 60%`, e nenhum seletor, variável ou elemento da Direção Vidro existe fora
  de `/vidro`.

---

## 8. Dívidas da proposta, se ela for adiante

1. **O rail depende de hover** (§9 do `DESIGN.md`). Resolver exige decidir o gatilho — botão de
   fixar, atalho de teclado, ou rótulos sempre visíveis —, não ajustar CSS.
2. **Custo de `backdrop-filter` não foi medido.** São até dez superfícies desfocando ao mesmo
   tempo na tela de Organização, sobre um fundo que anima continuamente. Falta medir em máquina
   fraca antes de qualquer adoção.
3. **Contraste não foi validado.** Texto sobre vidro translúcido tem contraste que varia com o
   que passa por baixo — e por baixo há manchas em movimento. O `DESIGN.md` §3 exige paleta
   medida, não estimada; nada aqui foi medido.
4. **A paleta de série do dashboard não foi considerada.** A proposta não tem tela de dashboard,
   e os sete slots de `cores.ts` foram calibrados contra `#FAF7F8` opaco — não contra vidro.
