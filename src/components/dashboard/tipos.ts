/**
 * O contrato entre a Página Inicial e as duas fontes que a alimentam.
 *
 * São DUAS leituras, e este arquivo existe para deixar isso explícito:
 *   - `dashboard_cards` (direto, via RLS) dá título, viz, posição.
 *   - `dashboard-execute` (Edge Function) dá os números.
 * Elas se casam por `card_id`. A Edge Function NÃO devolve título nem viz.
 */

/** Estados que `dashboard-execute` pode devolver por card, mais o local. */
export type EstadoCard =
  | "carregando" // só no cliente, enquanto a chamada não voltou
  | "ok"
  | "stale" // executor falhou; este é o último número que deu certo
  | "forbidden" // o cargo não vê alguma coluna do plano
  | "error";

/** O que o banco aceita em `dashboard_cards.viz` (CHECK da migration). */
export type TipoViz = "kpi" | "line" | "bar" | "stacked_bar" | "meter" | "table";

/**
 * O que a TELA sabe desenhar. É maior que `TipoViz` de propósito.
 *
 * `pie` existe só aqui: o `CHECK` do banco não a aceita, e não deve mesmo — o
 * `DESIGN.md` §10 a proíbe como representação PUBLICADA. Mas o alternador
 * "Ver como" não grava nada, então uma pessoa pode olhar de pizza sem que isso
 * vire o padrão da organização.
 *
 * Manter os dois tipos separados é o que impede a pizza de vazar para um
 * `INSERT`: qualquer caminho que escreve no banco exige `TipoViz`, e o
 * compilador recusa `pie` ali.
 */
export type FormaVisual = TipoViz | "pie";

/** Uma linha do resultado: objeto por nome de coluna.
 *  Vem de `df_out.to_dict(orient="records")` (`pandas_executor.py:287`). */
export type LinhaResultado = Record<string, string | number | boolean | null>;

export interface CardNaTela {
  id: string;
  titulo: string;
  viz: TipoViz;
  /** true = subir é bom, false = subir é ruim, null = neutro (delta sem cor). */
  maiorEhMelhor: boolean | null;

  /**
   * A coluna de ORIGEM da primeira agregação do Query Plan (`select[0].expr.col`).
   *
   * Existe porque o executor devolve o resultado batizado pelo `as` — `total`,
   * `ticket`, `pecas` — e nenhum desses nomes diz se o número é R$, % ou
   * contagem. Sem isto, "Ticket médio" aparece como `230,73` em vez de
   * `R$ 230,73`.
   */
  colunaOrigem?: string;

  /**
   * A função de agregação da primeira expressão do `select` (`sum`, `avg`,
   * `count`, `min`, `max`).
   *
   * Decide se "% do total" tem significado. Somar as somas de cada categoria dá
   * o total da base — a parte cabe no todo. Somar as MÉDIAS de cada categoria
   * não dá nada, então percentual sobre esse total seria um número inventado.
   */
  agregacao?: string;

  estado: EstadoCard;
  colunas: string[];
  linhas: LinhaResultado[];
  totalLinhas: number;
  /** ISO. Alimenta a pílula de idade, que é SEMPRE visível (decisão D5). */
  calculadoEm?: string;
  /** Frase humana. Só em `error` e `forbidden`. Nunca um código. */
  erro?: string;
}
