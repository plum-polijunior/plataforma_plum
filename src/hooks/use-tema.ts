import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

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
 *
 * ⚠️ Usado uma vez só, dentro de `DashboardLayout` — isso é o que faz o
 * `return` de limpeza abaixo funcionar como "saída do produto": este hook só
 * desmonta quando `DashboardLayout` desmonta, e isso só acontece navegando
 * para fora do grupo de rotas protegidas (`/`, `/auth`, 404). Sem essa
 * limpeza, a classe `tema-escuro` ficava presa em `document.documentElement`
 * depois do logout, e a landing (que não tem opinião própria sobre tema)
 * herdava por cascata a paleta escura — bug real, registrado em
 * `contexto/31-incidentes-e-licoes.md` I-06.
 */
export function useTema() {
  const [tema, setTema] = useState<Tema>(lerTemaSalvo);

  useEffect(() => {
    document.documentElement.classList.toggle(CLASSE_ESCURO, tema === "escuro");
    return () => document.documentElement.classList.remove(CLASSE_ESCURO);
  }, [tema]);

  // Fonte de verdade é o servidor (`profiles.tema`); o localStorage só evita
  // flash no primeiro paint (é por isso que o useState acima já lê de lá,
  // de forma síncrona). NULL no servidor = "nunca salvou" — não sobrescreve
  // a escolha que já está no localStorage, para não apagar a preferência de
  // quem está usando o produto pela primeira vez neste navegador.
  useEffect(() => {
    let cancelado = false;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session || cancelado) return;

      const { data } = await supabase
        .from("profiles")
        .select("tema")
        .eq("id", session.user.id)
        .maybeSingle();

      const doServidor = data?.tema;
      if (!cancelado && (doServidor === "claro" || doServidor === "escuro")) {
        setTema((atual) => (atual === doServidor ? atual : doServidor));
        window.localStorage.setItem(CHAVE_STORAGE, doServidor);
      }
    });

    return () => {
      cancelado = true;
    };
  }, []);

  const alternarTema = useCallback(() => {
    setTema((atual) => {
      const proximo: Tema = atual === "claro" ? "escuro" : "claro";
      window.localStorage.setItem(CHAVE_STORAGE, proximo);

      // Best-effort: a troca visual já aconteceu de forma otimista acima.
      // Falha de rede aqui não é erro de UX — a próxima leitura tenta de novo.
      void supabase.rpc("definir_tema", { p_tema: proximo }).then(({ error }) => {
        if (error) console.error("[use-tema] falha ao persistir tema:", error.message);
      });

      return proximo;
    });
  }, []);

  return { tema, alternarTema };
}
