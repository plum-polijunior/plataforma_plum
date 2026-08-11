/**
 * Quais representações fazem sentido para um resultado.
 *
 * A pergunta que isto responde não é "quais tipos existem", é "quais NÃO
 * mentem sobre este dado". Oferecer parte-do-todo para uma média desenharia
 * uma barra cujo comprimento não significa nada; oferecer barras para um
 * número único desenharia uma barra de 100% que não compara com nada.
 *
 * `table` está sempre disponível, para qualquer resultado — é a exigência de
 * acessibilidade do `DESIGN.md` §9, e também a única visão que nunca distorce.
 */

import type { CardNaTela, TipoViz } from "./tipos";

export const ROTULO_VIZ: Record<TipoViz, string> = {
  kpi: "Número",
  bar: "Barras",
  stacked_bar: "Parte do todo",
  line: "Linha",
  meter: "Medidor",
  table: "Tabela",
};

const SOMAVEIS = new Set(["sum", "count"]);

export function formasCompativeis(card: CardNaTela): TipoViz[] {
  const temCategorias = card.colunas.length > 1 && card.linhas.length > 1;

  if (!temCategorias) {
    // Um número só: comparar com o quê? Barras e parte-do-todo ficariam de fora.
    return ["kpi", "table"];
  }

  const formas: TipoViz[] = ["bar"];
  // Parte-do-todo exige que as partes somem um todo. Média por categoria não
  // soma nada — ver o comentário em VizStackedBar.
  if (SOMAVEIS.has(card.agregacao ?? "")) formas.push("stacked_bar");
  formas.push("table");
  return formas;
}
