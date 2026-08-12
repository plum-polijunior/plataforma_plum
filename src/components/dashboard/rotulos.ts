/**
 * Onde cada rótulo do gráfico de linha é desenhado, e quais pontos ganham rótulo.
 *
 * Módulo separado do `VizLinha.tsx` por dois motivos:
 *
 *   1. **É lógica pura, e a parte mais errada até aqui.** Quatro regras de seleção
 *      de valor e três de posicionamento foram reprovadas em revisão visual antes
 *      de chegar nestas. Cada docstring guarda o que caiu e por quê, para ninguém
 *      refazer a mesma tentativa.
 *   2. **Para poder ser testada.** O `vitest.config.ts` só coleta
 *      `supabase/functions/**` e `src/lib/**`, e é estreito de propósito. Um teste
 *      que importasse o `VizLinha.tsx` puxaria `@/hooks/use-mobile` e o recharts
 *      para um ambiente `node` — este arquivo não importa nada.
 *
 * O par é `src/lib/lado-do-rotulo.test.ts`.
 */

export type Lado = "acima" | "abaixo";

/**
 * Largura aproximada de um texto, para centralizar um grupo de SVG.
 *
 * Dentro do SVG não há fluxo: para centrar "▲ +35%" como uma unidade é preciso
 * saber quanto ela mede, e medir de verdade exigiria `getComputedTextLength()`,
 * que só existe depois de renderizar. A aproximação por contagem de caracteres
 * basta porque o conteúdo é sempre curto e de alfabeto conhecido (dígitos,
 * sinal, "%"), e um erro de 2 ou 3px não desalinha nada visível.
 */
export function larguraAproximada(texto: string, tamanhoFonte: number): number {
  return texto.length * tamanhoFonte * 0.56;
}

/**
 * O lado PREFERIDO de um ponto do meio: alternando.
 *
 * Alternar **dobra o espaço disponível para cada rótulo**, porque cada fileira
 * imaginária passa a ter metade deles: num card de ~460px com 12 meses, o
 * orçamento por rótulo sai de ~38px para ~76px.
 *
 * ⚠️ `ordem` é a posição entre os rótulos EXIBIDOS, não o índice do ponto. Com a
 * densidade adaptável os rótulos ficam esparsos (de 2 em 2, de 3 em 3), e alternar
 * pelo índice cru jogaria TODOS para o mesmo lado — de 2 em 2 todos os índices
 * exibidos têm a mesma paridade. Isso desfaria em silêncio a alternância.
 */
export function ladoAlternado(ordem: number): "acima" | "abaixo" {
  return ordem % 2 === 0 ? "acima" : "abaixo";
}

/**
 * O lado preferido de um EXTREMO: o oposto ao que a linha ocupa.
 *
 * Regra pedida na revisão visual, e é geometricamente correta: no primeiro ponto,
 * se o gráfico SOBE o rótulo vai ABAIXO; se DESCE, vai ACIMA. O rótulo fica sempre
 * do lado de fora da curva, nunca sobre o traço.
 *
 * ⭐ A mesma fórmula serve para os DOIS extremos, e a simetria não é coincidência:
 * o que decide é onde está o segmento vizinho, e em ambos os casos "o vizinho tem
 * valor maior" significa "o segmento ocupa o espaço acima do ponto".
 *
 *   - **primeiro ponto**, vizinho é o segundo. Segundo maior → a linha sai
 *     subindo → o traço fica acima → rótulo abaixo.
 *   - **último ponto**, vizinho é o penúltimo. Penúltimo maior → a linha chegou
 *     descendo → o traço fica acima → rótulo abaixo.
 *
 * Valores iguais deixam o segmento horizontal e qualquer lado serve; fica "acima",
 * a preferência geral do componente.
 */
export function ladoDoExtremo(proprio: number, vizinho: number): "acima" | "abaixo" {
  return vizinho > proprio ? "abaixo" : "acima";
}

/**
 * Confirma se o lado preferido CABE; se não couber, usa o outro.
 *
 * Texto cortado é pior que texto do lado "errado" — um pico quase no topo não tem
 * espaço acima, por mais que a regra prefira. Quando não cabe em nenhum dos dois
 * (série muito achatada), fica no preferido e o recorte é aceito: é o caso em que
 * qualquer escolha perde.
 */
export function ladoQueCabe(
  preferido: "acima" | "abaixo",
  y: number,
  alturaBloco: number,
  yTopo: number,
  yBase: number,
): "acima" | "abaixo" {
  const cabeAcima = y - alturaBloco >= yTopo;
  const cabeAbaixo = y + alturaBloco <= yBase;
  if (preferido === "acima") return cabeAcima || !cabeAbaixo ? "acima" : "abaixo";
  return cabeAbaixo || !cabeAcima ? "abaixo" : "acima";
}

/**
 * Quais pontos ganham o VALOR escrito.
 *
 * ── A regra: os DOIS EXTREMOS sempre, mais poucos espaçados no meio ──────────
 * `0` e `n - 1` entram sempre — de onde a série partiu e onde chegou. Os do meio
 * são poucos e em espaçamento REGULAR, num total que cresce devagar com `n`.
 *
 * ⚠️ Quarta regra para isto. O histórico importa porque três tentativas foram
 * reprovadas em revisão visual, cada uma por motivo diferente:
 *
 *   1ª — "pico, fundo e atual". Não é auditável a olho: com o pico no índice 1, o
 *        segundo ponto ganhava número e de fora parecia escolha ao acaso.
 *   2ª — "extremos + 4 no meio". Poluição: quatro valores num card cabem, mas o
 *        gráfico passa a ler como tabela torta.
 *   3ª — extremos FORA do SVG, numa linha de resumo em HTML. Resolvia a colisão e
 *        não gastava plotagem, mas foi revertida por decisão de produto: os
 *        valores de início e fim devem estar NO gráfico.
 *
 * Consequência assumida da 4ª: como todo rótulo interno, os extremos ficam sobre
 * a área plotada. O que os mantém legíveis é a `FOLGA_PONTA` (espaço horizontal
 * reservado nas duas pontas) e a alternância acima/abaixo, que os põe em fileira
 * diferente da do vizinho.
 *
 * `densidadeCheia` (visão ampliada) mostra MAIS valores, não todos: a revisão foi
 * explícita em que ali "tem que ter todas as variações mas não precisa ter todos
 * os valores". Variação e valor têm regras separadas de propósito.
 */
export function indicesComValor(n: number, densidadeCheia: boolean): Set<number> {
  if (n === 0) return new Set();
  if (n <= 3) return new Set(Array.from({ length: n }, (_, i) => i));

  // Os extremos, sempre.
  const escolhidos = new Set<number>([0, n - 1]);

  // ── Quantos no MEIO: adaptativo e esparso ─────────────────────────────────
  // Um valor entre os extremos é o padrão, crescendo devagar. Um valor mede
  // ~62px e o que importa não é caber, é sobrar ar: com 4 num card de ~372px de
  // plotagem eles cabem e ainda assim poluem.
  //
  // A variação tem outra regra (`passoDaVariacao`) porque mede ~34px, quase
  // metade — é a informação que a revisão pediu para densificar.
  const interiores = n - 2;
  const alvo = Math.min(
    interiores,
    densidadeCheia
      ? Math.max(2, Math.floor(n / 5))
      : Math.max(1, Math.floor(n / 8)),
  );

  const passo = (n - 1) / (alvo + 1);
  for (let k = 1; k <= alvo; k++) {
    const i = Math.round(k * passo);
    // Nunca colar num extremo: rótulo de valor grudado no do extremo é o
    // amontoado que a 2ª regra produzia.
    if (i > 0 && i < n - 1) escolhidos.add(i);
  }
  return escolhidos;
}

/**
 * De quantos em quantos pontos a VARIAÇÃO aparece — a densidade adaptável.
 *
 * ⚠️ Mostrar variação em todo ponto funciona até ~8 períodos e desmonta depois.
 * Foi o que a revisão visual pegou num gráfico de 18 meses: "muita informação e
 * não dá pra ver nada". E o caso não é exótico — empresa com dois anos de
 * histórico é o caso COMUM, não a exceção.
 *
 * A conta é a mesma de sempre, largura por ponto. Uma variação ("+35%") mede
 * ~34px. Com a alternância acima/abaixo, cada lado dispõe do dobro do passo
 * horizontal. Então o passo precisa ser tal que `passo × largura_por_ponto × 2`
 * fique acima de ~40px — daí a escala abaixo, calibrada para um card de ~460px.
 *
 * O último ponto está sempre incluído: ele mora à direita do marcador, fora do
 * caminho de qualquer outro rótulo, então nunca é o que polui.
 */
export function passoDaVariacao(n: number): number {
  if (n <= 8) return 1; // todos
  if (n <= 14) return 2;
  if (n <= 24) return 3;
  return 4;
}

/**
 * Os índices que ganham rótulo de variação, já raleados.
 *
 * Ancorado no FIM da série (`iUltimo - k × passo`) e não no começo: o que
 * interessa numa série temporal é o trecho recente, e ancorar no início deixaria
 * o último bloco de pontos sem marcação sempre que `n` não fosse múltiplo do
 * passo.
 */
export function indicesComVariacao(n: number, passo: number): Set<number> {
  const escolhidos = new Set<number>();
  for (let i = n - 1; i >= 1; i -= passo) escolhidos.add(i);
  return escolhidos;
}
