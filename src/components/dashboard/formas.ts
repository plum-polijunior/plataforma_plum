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

import type { CardNaTela, FormaVisual, TipoViz } from "./tipos";

export const ROTULO_VIZ: Record<FormaVisual, string> = {
  kpi: "Número",
  bar: "Barras",
  stacked_bar: "Parte do todo",
  line: "Linha",
  meter: "Medidor",
  table: "Tabela",
  pie: "Pizza",
};

const SOMAVEIS = new Set(["sum", "count"]);

export function formasCompativeis(card: CardNaTela): FormaVisual[] {
  const temCategorias = card.colunas.length > 1 && card.linhas.length > 1;

  if (!temCategorias) {
    // Um número só: comparar com o quê? Barras e parte-do-todo ficariam de fora.
    return ["kpi", "table"];
  }

  const formas: FormaVisual[] = ["bar"];

  // ⭐ Linha SÓ quando o agrupamento é de período.
  //
  // É a regra mais importante desta função, e não é preciosismo: ligar Sul,
  // Norte e Centro com um traço sugere uma progressão entre eles que não existe.
  // A linha comunica "isto evoluiu nesta ordem", e categoria não tem ordem.
  //
  // `card.periodo` só vem preenchido quando o `group_by` usou a forma objeto com
  // `trunc` (ver `truncDoPlano` em `use-dashboard-cards.ts`). Agrupar pela
  // coluna de data crua NÃO conta: são ~250 pontos num ano, um por dia, que é
  // ruído e não evolução — foi justamente o que a Fase 5b existiu para resolver.
  //
  // Vem depois de `bar` de propósito: mesmo num card de período, barras
  // continuam uma leitura legítima, e a ordem desta lista é a ordem do menu.
  if (card.periodo) formas.push("line");

  // Parte-do-todo exige que as partes somem um todo. Média por categoria não
  // soma nada — ver o comentário em VizStackedBar.
  if (SOMAVEIS.has(card.agregacao ?? "")) formas.push("stacked_bar", "pie");
  formas.push("table");
  return formas;
}


// ─────────────────────────────────────────────────────────────────────────────
// Persistência da preferência de leitura
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A forma escolhida em "Ver como" fica no NAVEGADOR, não no banco.
 *
 * Por quê não no banco: o card é da organização, mas o jeito de ler é de cada
 * um. Gravar em `dashboard_cards` faria a escolha de uma pessoa mudar a tela de
 * todo mundo — e quem depende de tabela por leitor de tela não deveria ter que
 * impor isso ao time.
 *
 * Por quê não só em memória, como era antes: a página recarrega o tempo todo,
 * inclusive sem o usuário pedir — publicar, apagar, mover e recalcular todos
 * chamam `recarregar()`. A escolha voltava ao padrão a cada ação, o que na
 * prática fazia o recurso não existir.
 *
 * A chave inclui o id do usuário porque duas pessoas usam o mesmo navegador com
 * frequência (um computador compartilhado no escritório é o caso comum deste
 * produto). Sem isso, a preferência de uma vazaria para a sessão da outra.
 */
const PREFIXO = "plum:dashboard:formas:";

export function lerFormasSalvas(userId: string | undefined): Record<string, FormaVisual> {
  if (!userId) return {};
  try {
    const bruto = localStorage.getItem(PREFIXO + userId);
    return bruto ? (JSON.parse(bruto) as Record<string, FormaVisual>) : {};
  } catch {
    // Modo privado, cota estourada, JSON corrompido. Preferência de leitura não
    // vale derrubar a página: cai no padrão e segue.
    return {};
  }
}

/**
 * `idsValidos` poda cards que não existem mais — apagados, ou de outra base.
 * Sem a poda o mapa cresce para sempre com entradas que nunca mais são lidas.
 */
export function salvarFormas(
  userId: string | undefined,
  formas: Record<string, FormaVisual>,
  idsValidos: Set<string>,
): void {
  if (!userId) return;
  try {
    const podado = Object.fromEntries(
      Object.entries(formas).filter(([id]) => idsValidos.has(id)),
    );
    localStorage.setItem(PREFIXO + userId, JSON.stringify(podado));
  } catch {
    // Idem: falhar em salvar preferência não pode quebrar nada.
  }
}
