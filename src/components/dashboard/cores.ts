/**
 * A cor de série de um card.
 *
 * REGRA: um card, um matiz. Dentro do card a variação é de LUMINOSIDADE — mais
 * claro é maior. É a escala sequencial que o `DESIGN.md` §3 prescreve para
 * comparar magnitude, e é o que permite passar de 3 categorias sem cair no
 * limite da paleta categórica (ver o cabeçalho de `VizStackedBar`).
 *
 * Entre cards o matiz muda: o primeiro gráfico é azul, o segundo laranja, e
 * assim por diante, ciclando nos 7 slots validados. Isso dá identidade e ritmo
 * à grade sem nunca pôr dois matizes lado a lado DENTRO do mesmo gráfico, que é
 * exatamente onde o teste de contraste reprova.
 *
 * O índice vem da posição do card na grade, não de quantos estão em determinada
 * visualização. Se dependesse disso, trocar a forma de um card mudaria a cor de
 * outro — e cor que muda sozinha é lida como significado.
 */

/**
 * Matiz, saturação e DESVIO de matiz dos 7 slots (`DESIGN.md` §3, `index.css`).
 *
 * O desvio é o quanto o matiz caminha do degrau mais claro ao mais escuro, e o
 * SINAL de cada um não é escolha estética: ele aponta para o vizinho mais
 * luminoso da roda de cores.
 *
 * Isso importa porque a superfície do card é quase preta. Puxar o azul (212°)
 * na direção do violeta o escurece, e o último degrau perde contraste — foi
 * medido: caía para 2,48:1, abaixo do piso de 3:1. Puxando para o ciano (−24°)
 * ele ganha luminância conforme escurece, e a rampa inteira passa.
 */
const MATIZES: [matiz: number, saturacao: number, desvio: number][] = [
  [212, 78, -24], // azul     #3987E5 → ciano
  [16, 70, +24], //  laranja  #D95926 → âmbar
  [162, 72, -24], // aqua     #199E70 → verde
  [40, 100, +18], // amarelo  #C98500 → amarelo puro
  [340, 58, +34], // magenta  #D55181 → coral
  [120, 100, -20], // verde   #008300 → verde-lima
  [0, 71, +30], //   vermelho #E66767 → laranja
];

/**
 * Faixa de luminosidade da rampa.
 *
 * O piso de 52% existe para o último degrau continuar visível contra a
 * superfície do card (`#120E1B`, quase preto): a 48% o azul já cai para 2,70:1,
 * abaixo do piso de 3:1 da §3, e a última fatia some no fundo. Por isso a faixa
 * só pode crescer para CIMA — o teto de 82% é onde a cor ainda não vira
 * quase-branco e passa a competir com o texto.
 *
 * Sobram 30 pontos para repartir. É pouco, e é a razão de a rampa não poder
 * depender só de luminosidade — ver `DERIVA_SATURACAO` abaixo.
 */
const CLARO = 82;
const ESCURO = 52;

/**
 * Quanto a saturação sobe do degrau mais claro ao mais escuro.
 *
 * POR QUE A RAMPA VARIA TRÊS COISAS, e é um desvio consciente do `DESIGN.md` §3:
 *
 * O documento manda *"sequencial: um hue só"*. Com 3 ou 4 degraus isso funciona.
 * Com 6, não: a faixa de luminosidade utilizável neste tema é estreita, porque
 * a superfície do card é quase preta e abaixo de ~52% a cor perde o piso de
 * contraste de 3:1. Sobram ~30 pontos para 6 degraus — 6 pontos cada, que na
 * prática são indistinguíveis no meio da faixa. Foi o que apareceu na tela.
 *
 * A saída é a escala sequencial MULTI-MATIZ, padrão consagrado para rampas
 * longas — é o que faz `viridis` e as escalas sequenciais do ColorBrewer
 * continuarem legíveis com muitos passos. Luminosidade, matiz e saturação
 * caminham juntos, então o olho tem três sinais em vez de um.
 *
 * Continua sendo UMA família de cor, não paleta categórica: o passeio de ~20°
 * mantém o conjunto lendo como "tons do mesmo azul", e a ordem por tamanho
 * segue legível. O que muda é dar para diferenciar o quarto degrau do quinto.
 *
 * VERIFICADO por cálculo de contraste WCAG contra `#120E1B`, os 7 slots, 6
 * degraus: o pior caso é o magenta a 4,91:1, bem acima do piso de 3:1 da §3.
 */
const DERIVA_SATURACAO = 14;

/**
 * Cor do degrau `i` de uma rampa de `quantos` degraus, no matiz do card.
 *
 * `quantos <= 1` devolve o tom mais claro: uma barra sozinha não precisa de
 * rampa, e dividir por zero produziria `NaN` no meio de um `style`.
 */
export function corDaSerie(slot: number, i: number, quantos: number): string {
  const indice = ((slot % MATIZES.length) + MATIZES.length) % MATIZES.length;
  const [matiz, saturacao, desvio] = MATIZES[indice];

  // Fração do caminho entre o primeiro e o último degrau, de 0 a 1.
  const t = quantos > 1 ? Math.min(i, quantos - 1) / (quantos - 1) : 0;

  return `hsl(${matiz + t * desvio} ${saturacao + t * DERIVA_SATURACAO}% ${
    CLARO - t * (CLARO - ESCURO)
  }%)`;
}
