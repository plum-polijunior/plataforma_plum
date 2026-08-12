import { useCallback, useEffect, useState } from "react";

export type Tema = "claro" | "escuro";

const CHAVE_STORAGE = "plum-tema";
const CLASSE_ESCURO = "tema-escuro";

function lerTemaSalvo(): Tema {
  if (typeof window === "undefined") return "claro";
  const salvo = window.localStorage.getItem(CHAVE_STORAGE);
  return salvo === "escuro" ? "escuro" : "claro";
}

/**
 * Alternador de tema do app interno — Parte C do merge de 2026-08-12.
 *
 * Aplica a classe em `document.documentElement` (o `<html>`), não num
 * wrapper dentro da árvore: é o que faz diálogos/selects do Radix, que
 * renderizam em portal dentro de `<body>`, herdarem o tema por cascata.
 * Não usa `.dark` — essa classe é opt-in exclusivo da landing (ver
 * `src/index.css` e `CLAUDE.md` §7) e não deve ser reaberta aqui.
 */
export function useTema() {
  const [tema, setTema] = useState<Tema>(lerTemaSalvo);

  useEffect(() => {
    document.documentElement.classList.toggle(CLASSE_ESCURO, tema === "escuro");
  }, [tema]);

  const alternarTema = useCallback(() => {
    setTema((atual) => {
      const proximo: Tema = atual === "claro" ? "escuro" : "claro";
      window.localStorage.setItem(CHAVE_STORAGE, proximo);
      return proximo;
    });
  }, []);

  return { tema, alternarTema };
}
