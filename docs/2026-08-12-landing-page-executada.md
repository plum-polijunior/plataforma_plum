# Landing page: execução, ajustes finos e o incidente de commit concorrente

**Data:** 2026-08-12 · **Branch:** `plataforma` · **Commit:** `97148f0` (forçado como ponta do
branch — ver §3). **Estado:** no ar em `/`, produto logado intocado.

Este documento é o registro do que aconteceu de fato, complementando
`docs/2026-08-12-PLANO-merge-landing-page.md` (o plano aprovado antes de codar). A maior parte
saiu como planejado; o que segue são os desvios, os ajustes pedidos depois do plano, e um
incidente que não tinha como estar no plano.

---

## 1. Execução do plano — o que saiu diferente

O plano previa 6 cards fixos em Funcionalidades, tema retunado de roxo para vinho, remoção do
"Simule o Plum"/`plum-chat`, mapa real e painel lateral do `/auth` — tudo isso foi implementado
como descrito no PLANO. Três coisas surgiram só durante a execução, pedidas pelo usuário depois
de ver o resultado:

1. **Vídeo de fundo e mascote**, em vez de token novo. O usuário forneceu os arquivos em
   `z_mascot_and_background/` (`plum-mascot-transparent.png`, `video_provisorio.mp4`) depois do
   plano estar escrito — o plano original não previa vídeo nenhum no hero. Atualizado o próprio
   arquivo do plano antes de codar essa parte (não só a execução), para o documento continuar
   sendo a fonte de verdade de "o que foi decidido", não só "o que foi feito".
2. **Rótulo "Funcionalidades" removido e depois devolvido.** O pedido original era "deixe apenas
   os 6 cards" — interpretei literalmente e tirei também o rótulo pequeno em maiúsculas que abre
   a seção. O usuário nos alertou que faltou, comparando com "O que somos"/"FAQ"/"Localização",
   que sempre abrem com esse mesmo rótulo. Devolvido só o `<p>` do rótulo — título (`h2`),
   subtítulo e os 3 passos continuam fora.
3. **Logo da H.I.G. Capital trocado no meio do trabalho.** O usuário substituiu
   `z_mascot_and_background/hig.webp` por `hig_capital.png` (mais nítido, sem moldura solta)
   depois que a seção de Parceiros já tinha sido implementada — recortado e trocado sem refazer
   o resto da seção.

## 2. Bug real encontrado na verificação, não no pedido original

O loop do marquee de parceiros tinha uma descontinuidade de **32px a cada volta** — não é uma
frescura de pixel, é a metade exata de um `gap-16` (64px). Causa: `gap` no container flex conta
só N-1 espaçamentos para N itens; duplicando a lista para o loop (18 itens), a metade exata da
largura total fica meio `gap` à frente de onde a segunda cópia realmente começa. Corrigido
trocando `gap` do container por `mr-16` em cada item — inclusive no último item da segunda cópia,
que nunca fica visível, mas é o que fecha a conta.

**Como foi pego:** um teste ingênuo (ler a posição do primeiro logo, avançar o relógio real do
navegador em exatamente um período via `animationDelay`, reler a posição) deu uma diferença de
~3.5px e por pouco passou como "seamless o suficiente". A causa daquele resíduo era só o tempo
real decorrido durante a própria medição (drift de ~50ms), não o bug — o teste certo foi pausar
a animação e comparar `getBoundingClientRect()` nos dois extremos exatos do keyframe
(`translateX(0)` vs `translateX(-50%)`), sem depender do relógio. Só aí os 32px apareceram,
consistentes e exatos. Fica como lição de método: medir animação CSS por *tempo decorrido* é
ruído; medir por *estado do keyframe* é determinístico.

## 3. Incidente: commit concorrente com a branch `rafaela`, sobrescrito por decisão do usuário

Ao tentar dar push do commit `97148f0`, o `git fetch` revelou que `origin/plataforma` tinha
avançado para `16d4747` — um commit de **Alexandre Delbim**, feito horas antes
(`2026-08-11 23:17:09`), que também fazia merge de um redesign de landing, mas a partir de uma
fonte diferente (branch `rafaela`) e com decisões de conteúdo **opostas** às tomadas aqui:

| | Este commit (`97148f0`) | `16d4747` (sobrescrito) |
|---|---|---|
| "O que somos" | Sem os 3 cards, sem depoimento | Mantinha os 3 cards + bloco de depoimento |
| Funcionalidades | Só 6 cards | 3 cards + "Simule o Plum" mantido |
| Produto logado | Intocado | Alterava `Dashboard.tsx`, `Cfgdatabase.tsx`, `DashboardLayout.tsx` (alternador de tema) |

Os dois concordavam em remover `DataPlaygroundSection.tsx`/`plum-chat` e tirar a landing do
`.dark`. Divergiam em praticamente todo o resto — inclusive em decisões que o usuário tinha
acabado de tomar explicitamente nesta sessão (ex.: "deixe o depoimento de fora, não existe
vídeo").

**Resolução:** o usuário confirmou por duas vezes que o commit do colega estava errado e devia
ser sobrescrito ("esse commit tá errado, é pra sobrescrever ele"). Feito
`git push --force-with-lease origin plataforma` — a variante segura do force push, que falha em
vez de sobrescrever às cegas se o remoto tiver avançado de novo entre a checagem e o push.
`origin/plataforma` foi de `16d4747` para `97148f0`.

⚠️ **O commit `16d4747e4cd47c06641c555eb43746ad2feedc8e` não está mais na ponta do `plataforma`,
mas não foi apagado.** Continua acessível pelo SHA (GitHub mantém commits órfãos por um bom
tempo antes de coletar lixo), e o trabalho original provavelmente ainda existe na branch
`rafaela`, de onde foi portado. Se algo de lá precisar ser recuperado — especialmente o
alternador de tema claro/escuro em `Dashboard.tsx`/`Cfgdatabase.tsx`/`DashboardLayout.tsx`, que
não tem equivalente na versão que ficou —, é esse SHA que interessa.

**Isto não foi comunicado ao Alexandre por mim.** Quem decide como avisar o colega que o commit
dele saiu da branch é o usuário, não o agente — fica registrado aqui para que, na próxima vez
que ele der `git pull` em `plataforma`, o "sumiço" do commit dele tenha uma explicação por
escrito em vez de parecer um acidente.

**Lição prática para quem mexer na landing de novo:** antes de dar push num período em que mais
de uma pessoa pode estar redesenhando a mesma superfície, um `git fetch` + `git log
origin/plataforma` sem pressa é mais barato que descobrir a divergência só no momento do push.

---

## Resumo estruturado

### Task: merge do novo design da landing page

1. **O que foi feito** — landing (`/`) inteira redesenhada: Hero com vídeo de fundo, Parceiros
   (9 logos, loop de marquee), O que somos, Funcionalidades (6 cards), FAQ (6 perguntas),
   Localização (mapa real do Google Maps), Contato. `/auth` perdeu o painel lateral e centralizou
   o login. Removidos "Simule o Plum" e a Edge Function `plum-chat`.
2. **Decisão técnica** — tema: a landing saiu do `.dark` porque o produto já é claro desde a
   Direção A e usa o mesmo brand; reusar o `:root` existente evitou criar um segundo conjunto de
   tokens. Mapa: embed clássico do Google sem chave de API, por não haver chave provisionada —
   ver a pendência abaixo. Ver `docs/2026-08-12-PLANO-merge-landing-page.md` para o raciocínio
   completo de cada seção.
3. **Integrações tocadas** — nenhuma nova. `Leads` (via `ContactForm`, inalterado) e o embed
   público do Google Maps (sem chave, sem autenticação).
4. **Safeguard** — o bug do marquee (§2) tem safeguard implícito: a técnica de duplicar a lista e
   deslizar 50% só funciona se o espaçamento for margem por item, não `gap` do container. Deixado
   comentado no próprio `PartnersSection.tsx` para não se repetir se alguém "simplificar" de volta
   para `gap` no futuro.
5. **Como validar** — `npm run build`, `npm test` (96 testes), e visualmente: `/` (as 6 seções,
   loop do marquee sem salto, mapa carregando de verdade) e `/auth` (login centralizado, sem
   painel lateral). Testado com Playwright ao longo da sessão; sem cobertura automatizada nova.
6. **Lacunas e pendências** — [LACUNA: os números do hero (+4.800h, R$585 mil, 3.200+) são
   afirmações públicas sobre resultado de cliente — quem resolve: quem os produziu na Poli
   Júnior — D.O.D.: confirmação de que podem ir ao ar como estão.] [LACUNA: marca dividida —
   landing usa o mascote novo, produto logado (`DashboardLayout`, `Auth`, `AccessPending`) segue
   com `plum-logo.png` — quem resolve: não atribuído — D.O.D.: decisão de unificar ou manter
   deliberadamente diferentes.] [LACUNA: mapa sem chave de API — quem resolve: quem tiver acesso
   ao Google Cloud da organização — D.O.D.: gerar chave da Maps Embed API e trocar a URL do
   `iframe` em `LocationSection.tsx`.] [LACUNA: peso de mídia alto (mascote 2 MB, vídeo 2,7 MB,
   sem compressão) — quem resolve: não atribuído — D.O.D.: recomprimir/gerar WebP do mascote em
   2–3 tamanhos.]

### Task: correção do loop do marquee de parceiros

1. **O que foi feito** — trocado `gap-16` no container flex por `mr-16` em cada item.
2. **Decisão técnica** — ver §2 acima. Resumo: `gap` dá N-1 espaçamentos para N itens; margem por
   item dá N, o que faz a metade exata da lista duplicada cair matematicamente no início da
   segunda cópia.
3. **Integrações tocadas** — N/A.
4. **Safeguard** — o defeito era um salto visível de 32px a cada ~32s (uma volta do loop). O
   código novo impede porque a matemática deixa de depender de quantos espaçamentos "sobram" —
   funciona para qualquer número par de itens duplicados, não só para os 9 atuais.
5. **Como validar** — pausar a animação via DevTools e comparar `getBoundingClientRect()` do
   primeiro item em `translateX(0)` contra o primeiro item da segunda cópia em
   `translateX(-50%)`: a diferença tem que ser 0.
6. **Lacunas e pendências** — N/A.

### Task: incidente de commit concorrente (`16d4747` vs `97148f0`)

1. **O que foi feito** — `git push --force-with-lease` substituiu `16d4747` (merge da branch
   `rafaela`, de outro autor) por `97148f0` na ponta de `plataforma`, por decisão explícita do
   usuário, confirmada duas vezes.
2. **Decisão técnica** — `--force-with-lease`, não `--force` puro: falha em vez de sobrescrever
   às cegas se o remoto tivesse avançado de novo entre a checagem (`git fetch`) e o push. Conferido
   imediatamente antes que `origin/plataforma` ainda era `16d4747`.
3. **Integrações tocadas** — N/A (só histórico do Git).
4. **Safeguard** — nenhum código impede a recorrência; é um problema de coordenação de equipe, não
   de software. O registro em §3 acima é o safeguard possível: próxima pessoa que mexer na landing
   sabe que já aconteceu uma vez.
5. **Como validar** — `git log --oneline -1 origin/plataforma` deve mostrar `97148f0`.
6. **Lacunas e pendências** — [LACUNA: Alexandre Delbim não foi avisado por mim que o commit dele
   saiu da branch — quem resolve: o usuário — D.O.D.: comunicação direta com o colega, e decisão
   sobre se algo do alternador de tema claro/escuro que ficou só em `16d4747`/`rafaela` deve
   voltar em um commit separado.]

### Task: mascote animado com fundo transparente (chroma key)

1. **O que foi feito** — o mascote do hero e do FAQ passou a ser um vídeo com fundo
   transparente de verdade (`public/mascote-animado.webm`, 562 kB). O arquivo de origem
   (`z_mascot_and_background/plum_mascot_2.mp4`) vinha com **fundo verde**, e o verde foi
   removido na origem, não em runtime. O recorte circular que existia antes **saiu**: ele só
   existia para esconder o fundo preto opaco do vídeo anterior, e teria cortado as pontas
   irregulares deste mascote.
2. **Decisão técnica** — MP4/H.264 não tem canal alfa e o navegador não faz chroma key
   sozinho, então havia duas saídas: chroma key por `<canvas>` a cada quadro (JS manipulando
   ~920k pixels por frame) ou converter para **WebM VP9 com canal alfa**, que o navegador
   decodifica nativamente. A segunda ganha por não ter custo de runtime nenhum. Três
   parâmetros foram MEDIDOS, não escolhidos no olho:
   - `chromakey` (YUV) em vez de `colorkey` (RGB): em RGB, a `similarity` que limpava o fundo
     já comia os tons azulados do mascote — o corpo ficava semitransparente sobre fundo
     colorido. Resíduo verde: 1,45% (RGB) contra 0,87% (YUV).
   - `despill=type=green` depois do key: derrubou o resíduo de 0,87% para **zero**, sem mudar
     a cor do mascote a olho nu.
   - `scale=480`: o maior uso na tela é 172px, então 480px cobre tela 2x. Sem isso o arquivo
     sairia ~4x maior sem ganho visível. O comando completo está no cabeçalho de
     `src/components/sections/MascoteAnimado.tsx`, para quem precisar refazer.
3. **Integrações tocadas** — N/A. Nenhuma rede, nenhum backend.
4. **Safeguard** — o defeito, achado na verificação e não no pedido: a primeira versão do
   fallback **empilhava** o PNG estático atrás do vídeo. Como o PNG é a arte ANTIGA (blob
   liso) e o vídeo é a nova (com pontas), o mascote velho vazava por baixo formando um halo.
   Corrigido para renderizar por **troca** (`onError`), nunca os dois ao mesmo tempo — e o
   comentário no componente registra que empilhar só seria seguro se as duas artes fossem
   iguais.
5. **Como validar** — abrir `/`, conferir hero e FAQ: fundo do mascote transparente, sem
   franja verde e sem halo de outro desenho por trás. Para testar o fallback, apontar o `src`
   do vídeo para um arquivo inexistente e confirmar que o PNG aparece sozinho.
6. **Lacunas e pendências** — [LACUNA: o fallback nunca foi exercitado num Safari real —
   quem resolve: quem tiver um Mac/iPhone à mão — D.O.D.: abrir a landing no Safari e
   confirmar se o WebM com alfa toca (Safari 16+ lê WebM, mas o suporte a canal alfa é
   historicamente irregular); se não tocar, o PNG estático deve aparecer no lugar.]
   [LACUNA: `public/hero-fundo.mp4` (2,7 MB) continua sem compressão — quem resolve: não
   atribuído — D.O.D.: o vídeo de fundo não foi tocado nesta leva, a pedido do usuário.]
