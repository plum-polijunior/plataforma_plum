/**
 * Cards de exemplo para a REVISÃO VISUAL, com números reais do gabarito.
 *
 * Só existe para a parada obrigatória do plano (§5, antes da Etapa 4): permite
 * julgar o layout, a densidade e os textos dos estados **sem** Supabase, sem
 * Lambda e sem gastar cota do Gemini.
 *
 * Os valores NÃO são inventados: saem de `testes/chat/teste-chat-vendas-roupas.md`
 * §2, conferidos à mão sobre a base sintética. Usar número de mentira aqui
 * esconderia justamente o que a revisão precisa ver — se `R$ 9.229,27` cabe na
 * figura herói, se "Loja Shopping Norte" trunca feio, se a pílula de idade
 * compete com o número.
 *
 * NÃO VAI PARA PRODUÇÃO: carregado por `import()` dinâmico, sob
 * `import.meta.env.DEV` e com `?preview=1` na URL. No build de produção o
 * `DEV` vira `false` e este módulo nunca é pedido.
 *
 * Removível junto com a linha correspondente em `Inicio.tsx` no fim da Etapa 3.
 */

import type { CardNaTela } from "./tipos";

const MINUTO = 60_000;

export function cardsDeExemplo(agora = Date.now()): CardNaTela[] {
  const iso = (msAtras: number) => new Date(agora - msAtras).toISOString();

  return [
    {
      id: "exemplo-kpi",
      titulo: "Faturamento total",
      viz: "kpi",
      maiorEhMelhor: true,
      estado: "ok",
      colunas: ["valor_total"],
      linhas: [{ valor_total: 9229.27 }],
      totalLinhas: 1,
      calculadoEm: iso(4 * MINUTO),
    },
    {
      id: "exemplo-bar",
      titulo: "Faturamento por status do pedido",
      viz: "bar",
      maiorEhMelhor: null,
      estado: "ok",
      colunas: ["status_do_pedido", "valor_total"],
      linhas: [
        { status_do_pedido: "Concluído", valor_total: 7070.96 },
        { status_do_pedido: "Pendente", valor_total: 1188.81 },
        { status_do_pedido: "Trocado", valor_total: 599.7 },
        { status_do_pedido: "Cancelado", valor_total: 369.8 },
      ],
      totalLinhas: 4,
      calculadoEm: iso(4 * MINUTO),
    },
    {
      // Degradado: número em peso total, pílula com a idade. Nada de vermelho.
      id: "exemplo-stale",
      titulo: "Ticket médio",
      viz: "kpi",
      maiorEhMelhor: true,
      estado: "stale",
      colunas: ["ticket_medio"],
      linhas: [{ ticket_medio: 230.73 }],
      totalLinhas: 1,
      calculadoEm: iso(187 * MINUTO),
    },
    {
      id: "exemplo-forbidden",
      titulo: "Margem por vendedor",
      viz: "bar",
      maiorEhMelhor: true,
      estado: "forbidden",
      colunas: [],
      linhas: [],
      totalLinhas: 0,
      erro: "Seu cargo não tem acesso a uma das colunas deste card.",
    },
    {
      id: "exemplo-erro",
      titulo: "Peças vendidas",
      viz: "kpi",
      maiorEhMelhor: true,
      estado: "error",
      colunas: [],
      linhas: [],
      totalLinhas: 0,
      erro: "Não consegui calcular este card agora. Tente de novo em instantes.",
    },
    {
      id: "exemplo-carregando",
      titulo: "Desconto médio",
      viz: "kpi",
      maiorEhMelhor: false,
      estado: "carregando",
      colunas: [],
      linhas: [],
      totalLinhas: 0,
    },
  ];
}
