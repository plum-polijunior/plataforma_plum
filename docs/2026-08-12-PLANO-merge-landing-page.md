# PLANO — Merge do novo design da landing page

**Data:** 2026-08-12 · **Branch:** `plataforma` · **Estado:** plano aprovado, implementação
ainda não começada. As pendências no fim do documento continuam abertas.

## Contexto

Existe um projeto separado em `C:\Bernardo\Computação\New Plum - Landing Page\plataforma_plum`
com um redesenho completo da landing page do Plum. Ele precisa ser incorporado à landing que
já vive dentro do repo do produto (`C:\Bernardo\Computação\Plataforma Plum`, rota `/`), sem
tocar na plataforma logada.

**A descoberta que muda o tamanho do trabalho:** eu supus que o produto fosse escuro e o
design novo, claro — é o contrário do que importa aqui. O produto **já é claro** desde a
inversão de 2026-08-12 ("Direção A", ver `docs/2026-08-12-direcao-a-no-app.md`), com brand
`#7A2F56` = `329 44% 33%`. Quem ainda está escuro é **a landing**, que faz opt-in explícito no
`.dark` em `src/pages/Index.tsx:125`. E o design novo usa `--primary: 329 44% 33%` — o mesmo
brand. Então este merge **aproxima** as duas superfícies em vez de afastá-las, e a troca de
cores é em boa parte *remover* uma classe, não criar um tema.

Decisões confirmadas com o usuário:

- **Tokens:** usar o `:root` claro que o produto já tem. Nenhum token novo, nenhum escopo
  `.landing`. O produto logado não é tocado.
- **Hero:** trocar pelo hero novo inteiro (o fundo animado atual sai).
- **Funcionalidades:** exatamente 6 cards; `Consulta de dados históricos` sai.
- **Depoimento:** o bloco de vídeo do mockup **não entra** (não existe vídeo; a frase entre
  aspas se apresenta como fala de cliente real).

---

## 1. Tema: tirar a landing do escuro

`src/index.css` tem `:root` = claro (produto) e `.dark` = o tema roxo antigo. Só dois lugares
optam pelo escuro: `src/pages/Index.tsx:125` e `src/pages/NotFound.tsx`.

- **`Index.tsx`**: remover `dark` do `className` do wrapper. É o que faz a landing herdar a
  paleta clara.
- **`NotFound.tsx`**: remover também, senão o 404 fica sendo a única tela escura do sistema.
- **Não mexer em `:root` nem em `.dark`**, e **não mexer em `--radius`** (produto usa
  `0.75rem`; as seções novas usam valores explícitos como `rounded-[20px]`, então não
  dependem dele).

Três classes globais em `src/index.css` foram desenhadas para o fundo escuro e ficam
ilegíveis ou sem sentido no claro:

| Classe | Hoje | Ação |
|---|---|---|
| `.text-gradient` | gradiente roxo pálido (`hsl(270 80% 85%)`…) — some no branco | trocar pelo gradiente vinho do design novo: `linear-gradient(90deg, hsl(330 45% 25%), hsl(329 44% 33%), hsl(331 36% 45%))` |
| `--glow-purple` / `--glow-violet` | roxo `270 70% 60%` | retunar para `329 44% 33%` / `331 36% 45%` |
| `--gradient-primary` / `--gradient-text` / `--gradient-glow` | roxos | retunar para os equivalentes vinho |

⚠️ **`.text-gradient` também é usado pelo produto** (`src/layouts/DashboardLayout.tsx`, no
logo da sidebar). Verificar como ele está renderizando hoje — no fundo claro do produto, o
gradiente roxo pálido atual provavelmente já está quase invisível. Se estiver, a troca para o
vinho **corrige** isso em vez de quebrar; se alguém já tiver contornado localmente, respeitar.

Adicionar ao `src/index.css` duas animações que só existem no projeto novo e são usadas pelas
seções que vêm junto:

- `@keyframes marquee` + `.animate-marquee` (faixa de parceiros)
- `@keyframes cloud-float` + `.animate-cloud-float` (mascote do FAQ)

`glow-pulse` já existe no `tailwind.config.ts` do destino — reusar, não duplicar.

---

## 2. Botões

`src/components/ui/button.tsx` (destino) tem `hero` glassy, feito para o escuro:
`backdrop-blur-md bg-primary/20 … text-foreground border border-primary/30`. No claro isso
vira um botão lavado. O design novo usa a versão sólida:

```
hero: "rounded-2xl bg-primary hover:bg-brand-hover text-primary-foreground shadow-md
       hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20 transition-all duration-300"
```

Usar `hover:bg-brand-hover` (token que já existe no destino) em vez do `#5c2340` hardcoded do
mockup.

⚠️ **`hero` não é 100% landing-only, apesar do comentário no topo do arquivo dizer que é.**
`src/pages/Auth.tsx` tem um `variant="hero"` remanescente e `src/components/ui/multistep-form.tsx`
usa `hero`. O multistep é da landing (ok). O do `Auth.tsx` é produto — e o `DESIGN.md` §1
proíbe `backdrop-blur` em App UI, então esse botão já é uma violação hoje. Trocar por
`variant="default"` na mesma passada e atualizar o comentário do topo do `button.tsx`, que
ficou desatualizado.

Manter `glass`, `default`, `outline` etc. como estão — o produto depende deles.

---

## 3. Seções — ordem e conteúdo

Manter a **ordem do projeto original** (`Index.tsx` do destino), com a faixa de parceiros
inserida logo após o hero (ela não tem `id`, então não entra na navegação nem no scroll spy):

```
Header
1. Hero              #inicio
   Parceiros         (sem id)
2. O que somos       #sobre
3. Funcionalidades   #funcionalidades
4. FAQ               #faq
5. Localização       #localizacao
6. Contato           #contato
```

⚠️ Corrigir de passagem: o `navItems` do `Header.tsx` lista `localizacao` **antes** de `faq`,
mas o DOM e o scroll spy têm FAQ primeiro. Alinhar o menu ao DOM.

### Hero — substituição completa, com vídeo de fundo

Portar `HeroSection.tsx` do projeto novo: mascote, wordmark "Plum", H1 *"Do dado à decisão,
em segundos."*, subtítulo, dois CTAs (`hero` size `xl` → `#sobre`, e `outline` → `#contato`),
a linha de números (**+4.800h** economizadas por ano · **R$585 mil** gerados por ano ·
**3.200+** pessoas atendidas) e a nota *"Resultados de soluções de IA construídas pelo time
por trás do Plum."*

**Fundo: vídeo** (`public/hero-fundo.mp4`, 2,7 MB) no lugar dos traços roxos animados. O
`<video>` entra com `autoPlay muted loop playsInline` — `muted` é o que permite o autoplay
nos navegadores, e `playsInline` evita o iOS abrir em tela cheia. Precisa de:

- `aria-hidden` e sem controles: é decoração, não conteúdo;
- uma camada de véu por cima (`bg-background/…`) para o texto continuar legível sobre
  qualquer quadro do vídeo — sem isso o contraste do H1 depende do que estiver passando;
- `@media (prefers-reduced-motion: reduce)`: quem pediu menos movimento não deve receber um
  laço de vídeo. Cair para o primeiro quadro (`poster`) ou esconder o vídeo.

Sai: `src/components/ui/background-paths.tsx` (fundo animado, 130 linhas) — fica órfão,
deletar. O `heroRef`/`scroll-snap-start` do `Index.tsx` precisa apontar para o novo hero.

### Logo — mascote no lugar do logo atual

`src/assets/plum-mascot-transparent.png` substitui `plum-logo.png` **nos arquivos da
landing**: `Header.tsx` e `ContactSection.tsx` (os outros dois usos na landing,
`background-paths.tsx` e `DataPlaygroundSection.tsx`, estão sendo deletados de qualquer
forma). O mascote também é usado pelo Hero e pelo cabeçalho do FAQ novo.

⚠️ **Não trocar nos arquivos de produto** (`DashboardLayout.tsx`, `Auth.tsx`,
`AccessPending.tsx`), que seguem a restrição de não tocar na plataforma logada. Isso deixa
landing e app com marcas diferentes até haver decisão explícita — registrar como pendência,
não resolver por conta própria.

### Parceiros — nova

Portar `PartnersSection.tsx`: título *"Empresas parceiras da Poli Júnior"* e o marquee
infinito. Copiar `src/assets/partners/{accenture,bain,bcg,grupo-safra,hig}.png|webp`. Os
outros quatro parceiros (L'Oréal, McKinsey, Oliver Wyman, Stone) são fallback em texto no
mockup — manter assim.

### O que somos — substituição, menos os 3 cards

Portar o `AboutSection.tsx` novo: eyebrow, H2 *"Mais do que um chatbot."*, o corpo
(*"Dados dispersos custam tempo…"* + a linha em destaque *"Dados viram insights. Insights
viram ação."*) e a lista *"No seu setor:"* (Varejo · Indústria · E-commerce · Financeiro ·
Agências de Marketing · Consultórios).

**Não portar:** os 3 cards (Multi-canal / Níveis de acesso / Automação e alertas) — eles
viram cards de Funcionalidades. **Não portar:** o bloco de depoimento.

Sai: `src/components/ui/database-with-rest-api.tsx` (o "Para quem" animado do About atual)
fica órfão — deletar, junto com as regras `.database` / `.db-light-1..4` no fim do
`src/index.css`. Confirmar que nada mais as usa antes de remover.

### Funcionalidades — 6 cards, sem o "Simule o Plum"

Portar o cabeçalho e o bloco **"Como funciona"** (3 passos numerados) do design novo.

**Não portar** o mockup estático de chat "Simule o Plum" do design novo (badge "EM BREVE").

Os 6 cards:

| Card | Origem da copy |
|---|---|
| Dashboards automáticos em tempo real | **nova** — escrever |
| Proteção de dados | **nova** — escrever |
| Níveis de acesso | card do About novo |
| Multi canal | card do About novo |
| Automação e alertas | card do About novo |
| Agentes de IA | card de Features (existe nos dois) |

As duas copies novas devem descrever o que o produto **de fato** faz, para revisão do usuário:
"Dashboards automáticos" = a Página Inicial (mural de cards que recalcula sozinho);
"Proteção de dados" = RBAC por coluna, cada cargo com `allowed_columns` explícito, e o
executor Python que nunca devolve linha bruta. Nada de promessa que o código não cumpre.

### FAQ — substituição

Trocar as 4 perguntas atuais pelas 6 novas. Portar também o cabeçalho novo (mascote com
`animate-cloud-float` e o balão *"Bateu alguma dúvida?"*). O componente `Accordion` já existe
no destino.

### Localização — só design

**Manter** `src/components/ui/expand-map.tsx` (mapa SVG interativo com tilt 3D, 303 linhas) e
apenas reestilizar a seção para o tema claro. O design novo traz só um placeholder listrado
estático — trocar o que já funciona por um placeholder seria regressão. Endereço é o mesmo
nos dois.

### Contato — só design

Reestilizar o wrapper para o padrão novo (`bg-card border rounded-[20px] p-8 shadow-sm`),
título *"Vamos conversar?"*. `ContactForm` → `MultiStepForm` já existem no destino e são
praticamente idênticos ao do projeto novo — **não substituir**, só ajustar o entorno.

### Header

Portar o visual novo (altura 72px, pílulas `rounded-[10px]`, barra de progresso de scroll no
rodapé do header). Manter o comportamento do destino: o CTA "Entrar no Plum" vai para `/auth`
(`window.location.href`), **não** rola para `#contato` como no mockup — no destino existe app
de verdade atrás desse botão.

---

## 4. Remover o "Simule o Plum" e a Edge Function `plum-chat`

Fora de qualquer ambiguidade: `plum-chat` é a demo da landing. `ai-plum-chat` é o chat real do
produto. **Não confundir.**

| Arquivo | Ação |
|---|---|
| `src/components/sections/DataPlaygroundSection.tsx` | deletar (550 linhas) |
| `src/components/sections/FeaturesSection.tsx` | remover o import e o bloco "Simule o Plum" |
| `supabase/functions/plum-chat/` | deletar o diretório |
| `supabase/functions/README.md` | remover a linha da tabela e o comando de deploy |
| `CLAUDE.md` | remover a linha do mapa (§2) |

Não mexer: `ContactForm`, `multistep-form.tsx`, `plum-logo.png` (usados em outros lugares),
e **não** remover `GEMINI_API_KEY` (o `ai-agents` e o `ai-plum-chat` dependem dela).

Nada muda na navegação: o "Simule o Plum" não tem `id`, não está no `navItems` nem no scroll
spy — ele vive inteiro dentro de `#funcionalidades`.

Depois do merge, deletar a função publicada:
`npx supabase functions delete plum-chat --project-ref rjwidarrsykufuifzunu`

Menções em documentação para atualizar por higiene: `organizar_tudo.md`, `.lovable/plan.md`,
`docs/2026-08-11-formato-da-resposta-do-chat.md`.

---

## 5. Dependências e assets

`framer-motion` já existe no destino — as seções novas dependem dele. `lucide-react` também.
Nenhuma dependência nova é necessária.

Copiar de `New Plum - Landing Page/plataforma_plum/src/assets/`: a pasta `partners/`. O
`plum-logo.png` do destino continua sendo usado pelo `DashboardLayout` e pelo produto — não
substituir.

Do `z_mascot_and_background/` (fornecido pelo usuário):
`plum-mascot-transparent.png` → `src/assets/` (importado, com hash pelo Vite) e
`video_provisorio.mp4` → `public/hero-fundo.mp4` (servido direto, sem passar pelo bundle,
para o navegador poder transmitir em vez de baixar inteiro antes de tocar).

⚠️ **Peso.** O mascote tem **2,01 MB em 1402×1122** — 24× o logo atual (87 kB) — e o vídeo,
2,7 MB. Juntos são ~4,7 MB só de mídia numa página cujo bundle JS já está em 1,46 MB. O
mascote aparece em tamanhos entre 32 px (header) e 150 px (hero), ou seja, ~10× menor do que
o arquivo entregue. Não vou recomprimir por conta própria (é asset de marca, e reduzir
qualidade é decisão de quem desenhou), mas fica registrado: converter o mascote para WebP e
gerar 2–3 tamanhos cortaria a maior parte disso sem diferença visível.

Fontes: o `index.html` do destino já carrega Inter, Bricolage Grotesque, Geist e JetBrains
Mono. O design novo só usa Inter — nada a adicionar.

---

## Arquivos principais

**Editar:** `src/pages/Index.tsx` · `src/pages/NotFound.tsx` · `src/index.css` ·
`src/components/ui/button.tsx` · `src/components/Header.tsx` · `src/pages/Auth.tsx` (1 botão) ·
`supabase/functions/README.md` · `CLAUDE.md`

**Substituir:** as 5 seções em `src/components/sections/` (About, Features, FAQ, Location,
Contact) + novo `HeroSection.tsx` e `PartnersSection.tsx`

**Deletar:** `DataPlaygroundSection.tsx` · `ui/background-paths.tsx` ·
`ui/database-with-rest-api.tsx` · `supabase/functions/plum-chat/`

**Não tocar:** `src/pages/{Inicio,Dashboard,Cfgdatabase,PlumChat}.tsx` ·
`src/layouts/DashboardLayout.tsx` · `src/components/dashboard/*` ·
`src/components/dashboard/cores.ts` (paleta de série é calculada em JS e tem teste de
contraste próprio) · qualquer coisa em `supabase/functions/` além de `plum-chat`

---

## Verificação

1. `npm run build` (inclui typecheck) e `npm run lint`.
2. `npm test` — os 91 testes existentes precisam continuar verdes. Nenhum cobre a landing,
   mas `src/lib/contraste-serie.test.ts` protege a paleta de gráficos, que não deve se mover.
3. **Landing** (`npm run dev`, rota `/`): percorrer as 6 seções na ordem, conferir contraste
   no tema claro, o marquee de parceiros, o accordion do FAQ, o mapa com tilt, e enviar o
   formulário de contato de ponta a ponta (grava em `Leads`).
4. **Regressão do produto** — é aqui que mora o risco real, por causa dos tokens e do
   `button.tsx` compartilhados. Com sessão real, abrir `/auth`, `/inicio`, `/dashboard`,
   `/cfgdatabase` e `/plum` e confirmar que nada mudou de aparência, **em especial**:
   - o logo "Plum" na sidebar (`DashboardLayout`, usa `.text-gradient`);
   - o botão que era `hero` no `Auth.tsx`;
   - diálogos e selects (Radix renderiza em portal no `<body>`, fora da árvore da landing) —
     abrir o "Novo card" na Página Inicial e um `Select` no `/cfgdatabase`.
5. Confirmar que `/plum` (chat real) segue funcionando **depois** de deletar `plum-chat` — são
   funções diferentes, e essa é a confusão mais fácil de cometer aqui.
6. Conferir o 404 (`/rota-inexistente`) no tema claro.

## Pendências assumidas

- Os números do hero (+4.800h, R$585 mil, 3.200+) vêm do mockup e são afirmações públicas
  sobre resultados da Poli Júnior — **precisam de confirmação de quem os produziu** antes de
  ir ao ar.
- A copy dos dois cards novos será escrita por mim e precisa de revisão do usuário.
- `src/components/WhatsAppChat.tsx` (341 linhas) já é código morto hoje — não é importado por
  nada e usa `hero` + `.glass`. Fora do escopo deste merge; vale um `git rm` separado.
