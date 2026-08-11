/**
 * Os cards de uma base, prontos para a tela.
 *
 * SÃO DUAS LEITURAS, e é de propósito:
 *
 *   1. `dashboard_cards` direto, via RLS — dá título, viz, posição.
 *   2. `dashboard-execute` (Edge Function) — dá os números.
 *
 * A Edge Function **não devolve título nem viz** (ver a interface `CardResult`
 * em `dashboard-execute/index.ts`): ela responde por `card_id`, e o casamento
 * acontece aqui. Descobrir isso com a tela meio pronta custa caro, então está
 * escrito.
 *
 * Toda decisão de autorização vive na Edge Function, nunca aqui. Este hook não
 * filtra coluna, não decide permissão e não interpreta Query Plan — ele pede e
 * exibe. Se um dia precisar decidir algo, é sinal de que a decisão vazou do
 * lugar certo.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CardNaTela, EstadoCard, LinhaResultado, TipoViz } from "@/components/dashboard/tipos";

/** Respostas de corpo inteiro, que não são "card com erro" e precisam de
 *  tratamento próprio na página — senão viram tela quebrada. */
export type EstadoGrade =
  | "carregando"
  | "pronto"
  | "sem-coluna-liberada" // 403: o cargo não vê nenhuma coluna desta base
  | "base-desconectada" // 409: dataset sem google_sheet_id
  | "falhou"; // rede, ou erro inesperado

interface ResultadoExecutor {
  card_id: string;
  status: Exclude<EstadoCard, "carregando">;
  columns?: string[];
  rows?: LinhaResultado[];
  row_count?: number;
  computed_at?: string;
  error?: string;
}

/**
 * A coluna de origem da primeira agregação do plano — `select[0].expr.col`.
 *
 * O executor devolve o resultado com o nome do `as`, não com o da coluna lida.
 * Para a tela decidir se mostra `R$` ou `%`, ela precisa do nome original.
 * Leitura defensiva: `query_plan` é `jsonb` e pode ter qualquer forma; qualquer
 * desvio devolve `undefined` e o número sai sem unidade, que é o erro seguro.
 */
function primeiraAgregacao(
  plano: unknown,
): { coluna?: string; agg?: string } {
  const select = (plano as { select?: unknown[] })?.select;
  if (!Array.isArray(select)) return {};
  for (const item of select) {
    const expr = (item as { expr?: { col?: unknown; agg?: unknown } })?.expr;
    if (expr && typeof expr.col === "string" && expr.col.trim()) {
      return {
        coluna: expr.col.trim(),
        agg: typeof expr.agg === "string" ? expr.agg.toLowerCase() : undefined,
      };
    }
  }
  return {};
}

export function useDashboardCards(datasetId: string | null) {
  const [cards, setCards] = useState<CardNaTela[]>([]);
  const [estado, setEstado] = useState<EstadoGrade>("carregando");

  const carregar = useCallback(async (force = false) => {
    if (!datasetId) return;
    setEstado("carregando");

    try {
      // ── 1. Metadados dos cards ────────────────────────────────────────────
      const { data: salvos, error: erroCards } = await supabase
        .from("dashboard_cards")
        .select("id, title, viz, higher_is_better, position, query_plan")
        .eq("dataset_id", datasetId)
        .order("position");

      if (erroCards) throw erroCards;

      if (!salvos?.length) {
        setCards([]);
        setEstado("pronto");
        return;
      }

      // Enquanto os números não chegam, os cards já aparecem com título e
      // esqueleto. A alternativa — tela vazia até tudo voltar — faz um
      // dashboard de 6 cards parecer quebrado por 3 segundos.
      const base: CardNaTela[] = salvos.map((c) => {
        const { coluna, agg } = primeiraAgregacao(c.query_plan);
        return {
        id: c.id,
        titulo: c.title,
        viz: c.viz as TipoViz,
        maiorEhMelhor: c.higher_is_better,
        colunaOrigem: coluna,
        agregacao: agg,
        estado: "carregando",
        colunas: [],
        linhas: [],
        totalLinhas: 0,
        };
      });
      setCards(base);

      // ── 2. Os números ─────────────────────────────────────────────────────
      const { data, error } = await supabase.functions.invoke("dashboard-execute", {
        // `force` pula o cache de snapshot na Edge Function. Sem ele, dentro
        // do TTL o botão de recalcular devolveria o mesmo número e pareceria
        // quebrado — o navegador não pode apagar snapshot, de propósito.
        body: { dataset_id: datasetId, force },
      });

      if (error) {
        // `functions.invoke` não expõe o status HTTP nem o corpo do erro, então
        // o texto é a única pista. Preferir um estado nomeado a um "algo deu
        // errado" genérico: são situações com ação diferente para o usuário.
        const texto = (error.message ?? "").toLowerCase();
        if (texto.includes("nao tem acesso") || texto.includes("não tem acesso")) {
          setEstado("sem-coluna-liberada");
        } else if (texto.includes("reconectada")) {
          setEstado("base-desconectada");
        } else {
          setEstado("falhou");
        }
        return;
      }

      // `dashboard-execute` só devolve `computed_at` quando o resultado veio do
      // cache de snapshot. Num cálculo fresco o campo não existe — e sem um
      // horário o rótulo da tela ficava preso em "calculado agora" para sempre,
      // porque não havia de que envelhecer.
      //
      // Carimbar o instante da resposta é honesto: o número foi produzido no
      // servidor segundos antes de chegar aqui. O erro é de segundos, e a
      // alternativa (não dizer nada) é pior — a pessoa fica sem saber se está
      // olhando um dado de agora ou de três horas atrás.
      const recebidoEm = new Date().toISOString();

      const porId = new Map<string, ResultadoExecutor>(
        ((data?.results ?? []) as ResultadoExecutor[]).map((r) => [r.card_id, r]),
      );

      setCards(
        base.map((card) => {
          const r = porId.get(card.id);
          if (!r) {
            // Card salvo que o executor não mencionou. Não inventar sucesso.
            return {
              ...card,
              estado: "error" as EstadoCard,
              erro: "Não consegui calcular este card agora.",
            };
          }
          return {
            ...card,
            estado: r.status,
            colunas: r.columns ?? [],
            linhas: r.rows ?? [],
            totalLinhas: r.row_count ?? 0,
            calculadoEm: r.computed_at ?? recebidoEm,
            erro: r.error,
          };
        }),
      );
      setEstado("pronto");
    } catch (erro) {
      console.error("Falha ao carregar os cards do dashboard:", erro);
      setEstado("falhou");
    }
  }, [datasetId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return { cards, estado, recarregar: carregar };
}
