/**
 * A cor de série de um card.
 *
 * REGRA: um card, um matiz. Dentro do card a variação é de LUMINOSIDADE. É a
 * escala sequencial que o `DESIGN.md` §3 prescreve para comparar magnitude, e é
 * o que permite passar de 3 categorias sem cair no limite da paleta categórica
 * (ver o cabeçalho de `VizStackedBar`).
 *
 * Entre cards o matiz muda: o primeiro gráfico é azul, o segundo laranja, e
 * assim por diante, ciclando nos 7 slots. Isso dá identidade e ritmo à grade sem
 * nunca pôr dois matizes lado a lado DENTRO do mesmo gráfico, que é exatamente
 * onde o teste de contraste reprova.
 *
 * O índice vem da posição do card na grade, não de quantos estão em determinada
 * visualização. Se dependesse disso, trocar a forma de um card mudaria a cor de
 * outro — e cor que muda sozinha é lida como significado.
 *
 * ─── RE-DERIVADO PARA SUPERFÍCIE CLARA EM 2026-08-12 ─────────────────────────
 *
 * Até esta data o produto era dark-only e a rampa era UMA faixa global de
 * luminosidade, 82% → 52%, validada contra `#120E1B`. O `DESIGN.md` §11 já
 * avisava que modo claro exigiria *"re-degrau na superfície clara e revalidada,
 * não invertida automaticamente"*. Exigia mesmo. Foi medido, em quatro passos:
 *
 *   1. manter 82→52 na superfície clara ........... pior caso 1,21:1  reprova
 *   2. baixar a faixa global (7 pares testados) ... melhor caso 1,29:1 reprova
 *   3. teto por matiz, amplitude fixa de 20 ....... 2,80:1 no azul   reprova
 *   4. teto por matiz buscado sobre a rampa INTEIRA 3,00:1           passa
 *
 * A causa do 3 falhar depois de o 4 passar é a mesma: a rampa desloca matiz e
 * saturação junto com a luminosidade, e isso muda a luminância dos degraus do
 * meio — então o teto tem de ser buscado avaliando todos os degraus, não só o
 * primeiro.
 *
 * Passar em contraste não bastou. O passo 4 tinha contraste em ordem e a rampa
 * do azul saiu perceptualmente PLANA — ver a nota sobre o sinal do desvio na
 * tabela `MATIZES`. O 5º passo foi inverter os sinais e alargar a amplitude:
 *
 *   5. sinais invertidos, amplitude até o piso L=14 . 3,00:1 e ΔE 9,2  passa
 *
 * E a causa de o par global ser impossível é física, não estética: o verde
 * carrega o coeficiente de luminância 0,7152 na fórmula WCAG, então
 * `hsl(120 100% 50%)` tem 1,37:1 contra o branco. Na superfície escura os 7
 * matizes tinham PISO entre 22% e 43% e a janela acima era larga; na clara eles
 * têm TETO entre 32% (verde) e 65% (vermelho) — 53 pontos de dispersão. Nenhum
 * par único cabe embaixo do teto mais baixo sem achatar os outros seis em
 * quase-preto.
 *
 * A trava agora é executável: `src/lib/contraste-serie.test.ts` recalcula os 7
 * slots × 6 degraus e falha abaixo de 3:1. Antes estes números viviam só aqui em
 * comentário, e nada impedia alguém de mexer numa constante e derrubar a
 * barreira em silêncio.
 */

/** Superfície sobre a qual a rampa foi validada: `--muted`/`--secondary`, #FAF7F8. */
export const SUPERFICIE_DO_CARD = "#FAF7F8";

/** Piso de contraste do `DESIGN.md` §3. */
export const CONTRASTE_MINIMO = 3;

/**
 * Os 7 slots: matiz, saturação, desvio de matiz, e a faixa de luminosidade
 * própria de cada um.
 *
 * **A faixa é por matiz, e é aí que está toda a diferença do tema claro.** O
 * limite de cada linha é o maior valor de luminosidade em que a rampa inteira
 * daquele matiz ainda passa 3:1 sobre a superfície do card. Verde e aqua ficam
 * muito mais escuros que vermelho e magenta porque a luminância percebida de um
 * verde saturado é quase o dobro da de um vermelho de mesma luminosidade HSL.
 *
 * ⚠️ **O SINAL DO DESVIO DE MATIZ INVERTEU, e essa é a parte menos óbvia da
 * conversão.** Na superfície escura cada sinal apontava para o vizinho MAIS
 * luminoso da roda de cores: o azul caminhava para o ciano porque, ao escurecer,
 * ganhar luminância era o que salvava o contraste (puxar para o violeta derrubava
 * o último degrau para 2,48:1).
 *
 * Na superfície clara isso vira um tiro no pé. O degrau crítico de contraste
 * agora é o mais CLARO, e nele o desvio nem acumulou (t = 0) — então o desvio
 * deixou de pagar contraste. O que ele passou a fazer foi CANCELAR a rampa:
 * enquanto a luminosidade HSL caía, o matiz caminhava para um vizinho mais
 * luminoso e devolvia o brilho de volta. Medido com os sinais antigos, o azul
 * ficou perceptualmente PLANO — L* 58 no maior valor contra 57 no menor — e o
 * pior ΔE entre degraus vizinhos caiu para 4,7. Uma escala sequencial que não
 * ordena por tamanho não é uma escala, é decoração.
 *
 * Com os sinais invertidos, o matiz caminha para o vizinho MENOS luminoso e
 * reforça o escurecimento em vez de anulá-lo. O contraste no degrau claro não
 * muda (lá o desvio é zero) e o degrau escuro só fica mais escuro, ou seja mais
 * contrastado contra o branco. O ΔE mínimo entre vizinhos subiu de 4,7 para 9,2.
 */
const MATIZES: [
  matiz: number,
  saturacao: number,
  desvio: number,
  lClaro: number,
  lEscuro: number,
][] = [
  [212, 78, +24, 59, 25], // azul     → violeta
  [16, 70, -24, 57, 23], //  laranja  → vermelho
  [162, 72, +24, 37, 14], // aqua     → azul-petróleo
  [40, 100, -18, 38, 14], // amarelo  → âmbar
  [340, 58, -34, 64, 30], // magenta  → púrpura
  [120, 100, +20, 32, 14], // verde   → verde-pinho
  [0, 71, -30, 65, 31], //   vermelho → magenta
];

/**
 * A mesma tabela, derivada para o cartão ESCURO (`.tema-escuro --card`, L 10%).
 *
 * ── Por que uma segunda tabela, e não a mesma com ajuste ─────────────────────
 * A restrição inverte de lado. Sobre superfície clara o contraste vem de
 * ESCURECER, e o teto de cada matiz é o que aperta — o verde não pode passar de
 * L 32 por causa do coeficiente 0,7152 da luminância WCAG. Sobre superfície
 * escura o contraste vem de CLAREAR, e o piso é que manda. Nenhum par de
 * luminosidades serve aos dois: a paleta clara medida no escuro dava 5,5:1 (folga
 * desperdiçada, cor mais escura do que precisava ser), e a escura no claro
 * reprovaria.
 *
 * ⭐ **A rampa também inverte de sentido.** No claro `t = 1` (o MAIOR valor) recebe
 * o tom mais escuro; aqui recebe o mais CLARO. É a mesma ideia — "maior valor,
 * mais contraste contra o fundo" — e ela exige direções opostas em fundos opostos.
 * O `corDaSerie` não precisou mudar: a fórmula interpola do 4º para o 5º elemento
 * da tupla, sem supor qual é maior.
 *
 * ── Como estes sete números foram obtidos ────────────────────────────────────
 * Busca numérica sobre matiz, sinal do desvio e o par de luminosidades, com os
 * MESMOS três critérios que `src/lib/contraste-serie.test.ts` aplica ao claro:
 * contraste ≥ 3:1 em todo degrau de toda rampa de 1 a 6, ΔE76 ≥ 8 entre degraus
 * vizinhos, e amplitude de L ≥ 26 (o claro tem 34 no azul). Entre os candidatos
 * válidos, escolhido o de maior croma — é o que preserva a identidade do matiz e
 * responde à revisão visual que reprovou "cor sem diferença em relação ao fundo".
 *
 * ⚠️ A saturação é CLAMPADA em 100% pelo navegador, e `DERIVA_SATURACAO` soma 14.
 * Verde e amarelo têm base 100, então no topo da rampa a saturação já está no
 * teto. A derivação clampa igual — sem isso os números sairiam de gamut e a
 * medição não descreveria o que a tela mostra.
 *
 * Medido: contraste mínimo por slot entre 3,01:1 (magenta) e 5,94:1 (verde);
 * ΔE mínimo entre 8,1 e 12,5.
 */
const MATIZES_ESCURO: typeof MATIZES = [
  [212, 78, -24, 42, 68], // azul     → ciano
  [16, 70, -24, 40, 66], //  laranja  → rosa
  [162, 72, -24, 26, 52], // aqua     → verde
  [40, 100, +18, 39, 65], // amarelo  → amarelo-limão
  [340, 58, -34, 45, 72], // magenta  → violeta
  [120, 100, -20, 34, 64], // verde   → verde-limão
  [0, 71, -30, 45, 71], //   vermelho → rosa
];

/** Em que superfície a cor vai aparecer. Decide qual tabela vale. */
export type TemaDaSerie = "claro" | "escuro";

function tabelaDo(tema: TemaDaSerie) {
  return tema === "escuro" ? MATIZES_ESCURO : MATIZES;
}

/** Superfície do cartão no tema escuro (`.tema-escuro --card`). */
export const SUPERFICIE_DO_CARD_ESCURO = "#1E151B";

/** Quantidade de slots — exportada para o teste percorrer todos. */
export const QUANTOS_SLOTS = MATIZES.length;

/**
 * A cor de uma série ÚNICA — a linha do `VizLinha`.
 *
 * ⚠️ Existe porque reusar a rampa aqui dava a cor errada, e o erro tinha causa
 * clara. `corDaSerie(slot, 0, 1)` cai em `t = 1`, que é o extremo **mais
 * escuro** de cada matiz: azul L=25, aqua e amarelo e verde L=14. Numa rampa
 * multi-categoria esse extremo é correto — é o degrau do MAIOR valor, e a
 * escuridão é o que o distingue dos vizinhos. Numa série única não há vizinho
 * para distinguir: sobra só uma linha quase preta, e a revisão visual reprovou
 * exatamente isso ("o azul tá muito escuro", "o vermelho não tá tão legal").
 *
 * Uma linha sozinha precisa do oposto: o tom mais VIVO que ainda passe no piso
 * de contraste. Esse tom é `lClaro` (o `t = 0` da rampa), e ele já é validado —
 * `src/lib/contraste-serie.test.ts` percorre os 6 degraus de cada slot e falha
 * abaixo de 3:1, então o degrau claro não é uma escolha nova sem medição.
 *
 * Para azul, laranja, magenta e vermelho isso dá L 57–65, que lê como cor viva.
 * Para verde, aqua e amarelo dá L 32–38 — mais escuro do que se gostaria, e não
 * é falta de cuidado: é o coeficiente 0,7152 da luminância WCAG, que obriga o
 * verde a ser escuro para ter contraste sobre superfície clara. O comentário no
 * topo deste arquivo explica a física.
 */
export function corDeSerieUnica(
  slot: number,
  tema: TemaDaSerie = "claro",
): string {
  const tabela = tabelaDo(tema);
  const indice = ((slot % tabela.length) + tabela.length) % tabela.length;
  const [matiz, saturacao, , lClaro, lEscuro] = tabela[indice];
  // O degrau mais VIVO de cada tema, que é o extremo oposto em cada um: no claro
  // é `lClaro` (o t=0 da rampa, o mais leve que passa no piso de contraste); no
  // escuro é `lEscuro` (o t=1, o mais claro). Ver o comentário longo abaixo.
  const luminosidade = tema === "escuro" ? lEscuro : lClaro;
  return `hsl(${matiz} ${saturacao}% ${luminosidade}%)`;
}

/**
 * Quanto a saturação sobe do degrau mais claro ao mais escuro.
 *
 * POR QUE A RAMPA VARIA TRÊS COISAS, e é um desvio consciente do `DESIGN.md` §3:
 *
 * O documento manda *"sequencial: um hue só"*. Com 3 ou 4 degraus isso funciona.
 * Com 6, não: a faixa utilizável de cada matiz é estreita (20 pontos), e 6
 * degraus de ~3 pontos cada são indistinguíveis no meio da faixa.
 *
 * A saída é a escala sequencial MULTI-MATIZ, padrão consagrado para rampas
 * longas — é o que faz `viridis` e as sequenciais do ColorBrewer continuarem
 * legíveis com muitos passos. Luminosidade, matiz e saturação caminham juntos,
 * então o olho tem três sinais em vez de um.
 *
 * Continua sendo UMA família de cor, não paleta categórica: o passeio de ~20°
 * mantém o conjunto lendo como "tons do mesmo azul", e a ordem por tamanho segue
 * legível.
 */
const DERIVA_SATURACAO = 14;

/**
 * Cor do degrau `i` de uma rampa de `quantos` degraus, no matiz do card.
 *
 * ⚠️ **O sentido da rampa inverteu em 2026-08-12, junto com o tema.** Os três
 * consumidores (`VizBar`, `VizStackedBar`, `VizPie`) ordenam por valor
 * decrescente, então `i = 0` é sempre o MAIOR valor. Na superfície escura o
 * maior valor recebia o tom mais claro, porque contra um fundo quase preto quem
 * salta é o claro. Na superfície clara quem salta é o escuro — e é também o que
 * o `DESIGN.md` §3 pede ao pé da letra: *"mais escuro = maior"*.
 *
 * Sem essa inversão a barra maior sairia a mais pálida do card: o gráfico
 * continuaria correto e leria ao contrário.
 *
 * `quantos <= 1` devolve o tom mais FORTE (escuro), não o mais fraco: uma barra
 * sozinha não precisa de rampa, precisa de presença. Também evita divisão por
 * zero produzindo `NaN` no meio de um `style`.
 */
export function corDaSerie(
  slot: number,
  i: number,
  quantos: number,
  tema: TemaDaSerie = "claro",
): string {
  const tabela = tabelaDo(tema);
  const indice = ((slot % tabela.length) + tabela.length) % tabela.length;
  const [matiz, saturacao, desvio, lClaro, lEscuro] = tabela[indice];

  // Fração do caminho, de 0 (degrau mais claro) a 1 (mais escuro). O `1 -`
  // é a inversão descrita acima: i = 0 é o maior valor e vai para t = 1.
  const t = quantos > 1 ? 1 - Math.min(i, quantos - 1) / (quantos - 1) : 1;

  return `hsl(${matiz + t * desvio} ${saturacao + t * DERIVA_SATURACAO}% ${
    lClaro - t * (lClaro - lEscuro)
  }%)`;
}
