import { useEffect, useState } from "react";

/** Os dois temas do app logado. A landing usa `.dark`, que não entra aqui. */
export type TemaAtivo = "claro" | "escuro";

/** A classe que `use-tema.ts` aplica em `<html>`. Não é `.dark`, de propósito. */
const CLASSE_ESCURO = "tema-escuro";

function lerDoDocumento(): TemaAtivo {
  if (typeof document === "undefined") return "claro";
  return document.documentElement.classList.contains(CLASSE_ESCURO)
    ? "escuro"
    : "claro";
}

/**
 * Qual tema está ativo AGORA, com re-render quando ele muda.
 *
 * ⚠️ Não é `useTema()`. A diferença é o papel de cada um, e confundi-los quebra
 * em silêncio:
 *
 *   - `use-tema.ts` **controla** o tema: guarda a escolha no `localStorage` e
 *     aplica/remove a classe. É usado uma vez, pelo `DashboardLayout`, que tem o
 *     botão.
 *   - este hook **observa** o tema. Serve a quem precisa CALCULAR uma cor em JS,
 *     e não apenas herdar uma CSS variable — hoje só os gráficos, cujas rampas de
 *     série são computadas (`cores.ts`) e não podem sair de `var(--serie-N)`.
 *
 * Chamar `useTema()` dentro de um gráfico pareceria funcionar e não funcionaria: o
 * estado dele é local por instância, então o gráfico leria o `localStorage` na
 * montagem e **nunca seria notificado** quando o botão do layout alterna a classe.
 * O gráfico ficaria com a paleta do tema anterior até a próxima remontagem.
 *
 * Daí o `MutationObserver` na classe do `<html>`: ele funciona independente de
 * quem alterou a classe, inclusive se um dia a troca vier de outro lugar (uma
 * preferência do sistema, um atalho de teclado, um teste).
 */
export function useTemaAtivo(): TemaAtivo {
  const [tema, setTema] = useState<TemaAtivo>(lerDoDocumento);

  useEffect(() => {
    const alvo = document.documentElement;
    // Só a mudança de `class` interessa; observar o resto acordaria o callback a
    // cada alteração de atributo do `<html>`.
    const observador = new MutationObserver(() => setTema(lerDoDocumento()));
    observador.observe(alvo, { attributes: true, attributeFilter: ["class"] });

    // Reconciliação na montagem: entre o `useState` inicial e o `observe` acima
    // cabe uma alternância, e sem esta linha ela passaria batida.
    setTema(lerDoDocumento());

    return () => observador.disconnect();
  }, []);

  return tema;
}
