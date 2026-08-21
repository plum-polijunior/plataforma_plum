/**
 * O orçamento de linhas brutas — puro, sem Deno.
 *
 * ⭐ **O teto por pedido não protege nada sozinho.** O executor corta em 5 linhas
 * por `registro`/`amostra`, e 200 pedidos de 5 linhas é a base inteira sem
 * violar teto nenhum. O orçamento existe exatamente para esse erro, e é ele que
 * transforma um limite cosmético num limite de verdade.
 *
 * ── ⚠️ A CHAVE NÃO É `sessao_id`, E ISSO JÁ ESTAVA AVISADO EM TRÊS LUGARES ──
 *
 * `sessao_id` é uuid gerado no cliente, renovado a cada carga de página. Amarrar
 * o orçamento a ele daria cota nova a cada F5 — o modo de falha óbvio, e o
 * motivo de o aviso ter sido escrito na migration do `plum_logs`, no `log.ts` e
 * no `PlumChat.tsx` desde a Etapa 0.
 *
 * A chave é **usuário × base × janela de tempo**, resolvida no servidor.
 *
 * ── DE ONDE SAI O SALDO ─────────────────────────────────────────────────────
 *
 * De `SUM(plum_logs.linhas_brutas_entregues)`. Sem tabela nova: a coluna existe
 * desde a Etapa 0, a tabela é append-only e tem RLS por organização.
 *
 * ⚠️ **Mas o log engole os próprios erros de propósito** — é a regra que o
 * `log_core.ts` protege. Um orçamento apoiado numa escrita best-effort é um
 * orçamento que se contorna fazendo o log falhar. Por isso o débito é uma
 * escrita **verificada**, separada: se ela não gravar, o pedido falha. Todo o
 * resto do log continua best-effort. São duas posturas na mesma tabela, e a
 * diferença está escrita nos dois lugares.
 */

/** Linhas brutas por janela, por usuário, por base. Sugestão do V7 §3. */
export const TETO_DE_LINHAS_BRUTAS = 200;

/** A janela. 24h é longa o bastante para não irritar e curta para significar algo. */
export const JANELA_HORAS = 24;

export interface Gasto {
  /** Quanto já foi entregue na janela. */
  gasto: number;
  /** O que ainda cabe. Nunca negativo. */
  saldo: number;
}

export function calcularSaldo(linhasJaEntregues: readonly (number | null)[]): Gasto {
  const gasto = linhasJaEntregues.reduce<number>(
    (t, n) => t + (typeof n === "number" && n > 0 ? n : 0),
    0,
  );
  return { gasto, saldo: Math.max(0, TETO_DE_LINHAS_BRUTAS - gasto) };
}

export type Pedido = { id: string; tipo?: string };

export interface Veredito {
  /** Pedidos que cabem no saldo, na ordem em que vieram. */
  aprovados: Pedido[];
  /** Os que não couberam, com o motivo pronto para o A4. */
  negados: { id: string; motivo: string }[];
  /** Quanto este lote pode consumir, no pior caso. */
  reservado: number;
}

/**
 * Decide o lote inteiro contra o saldo, **antes** de executar.
 *
 * ⭐ Reserva pelo **pior caso** (5 linhas por pedido que consome), não pelo que
 * vier. Conferir depois seria conferir tarde: as linhas já teriam sido lidas da
 * planilha e devolvidas à Edge Function, e "estourou, mas já entreguei" não é
 * um orçamento.
 *
 * ⚠️ Corta **por pedido**, não o lote inteiro. Um pedido que não cabe não é
 * motivo para negar os outros — a negação parcial do B07 já sabe explicar o que
 * ficou de fora, e responder o que dá vale mais que recusar tudo.
 */
export function aprovarLote(
  pedidos: readonly Pedido[],
  saldo: number,
  custoPorPedido: number,
): Veredito {
  const aprovados: Pedido[] = [];
  const negados: { id: string; motivo: string }[] = [];
  let reservado = 0;

  for (const p of pedidos) {
    // ⭐ Quem não consome orçamento passa direto, sempre. `agregado`, `serie`,
    // `metadados` e `vocabulario` não devolvem linha — cobrar por eles
    // empurraria o planejador a agregar MENOS para caber, que é o contrário do
    // que o orçamento quer.
    if (!consomeOrcamento(p.tipo)) {
      aprovados.push(p);
      continue;
    }

    if (reservado + custoPorPedido > saldo) {
      negados.push({
        id: p.id,
        // Acentuada: chega ao A4 e vira texto na tela.
        motivo:
          "o limite de linhas detalhadas desta base foi atingido nas últimas " +
          `${JANELA_HORAS} horas`,
      });
      continue;
    }

    reservado += custoPorPedido;
    aprovados.push(p);
  }

  return { aprovados, negados, reservado };
}

/**
 * ⚠️ A lista canônica, espelhada em `query_engine/linhas.py`
 * (`tipos_que_consomem_orcamento`). Mudou um lado, mude o outro — divergir aqui
 * faz o executor entregar linha que o orçamento não contou.
 */
export function consomeOrcamento(tipo: string | undefined): boolean {
  return tipo === "registro" || tipo === "amostra";
}
