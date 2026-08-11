/**
 * O tema da Direção Vidro é local à rota `/vidro` e não tem relação com o
 * `.dark` do produto.
 *
 * ⚠️ Importante que continue assim: o `.dark` do `src/index.css` é opt-in da
 * landing e mora no `className` da raiz de `Index.tsx`/`NotFound.tsx`. Se o
 * alternador daqui mexesse em `document.documentElement`, trocaria o tema do
 * app inteiro por causa de um botão de protótipo — e o `CLAUDE.md` §7 é
 * explícito em não inverter esse mecanismo.
 *
 * Por isso o valor vive num atributo `data-tema` na raiz da própria rota, e a
 * cascata do `vidro.css` toda pendura nele.
 */
export type Tema = "claro" | "escuro";

/** O protótipo abre no escuro — é onde o vidro tem mais o que mostrar. */
export const TEMA_INICIAL: Tema = "escuro";

export function alternar(tema: Tema): Tema {
  return tema === "escuro" ? "claro" : "escuro";
}
