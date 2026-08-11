/**
 * Formatação de número e de idade para os cards.
 *
 * O executor devolve número cru. Quem decide como ele aparece é a tela — e
 * `DESIGN.md` §5 pede compacto automático (1.284 · 12,9 mil · R$ 4,2 mi),
 * porque um valor grande por extenso rouba a largura do card e some no celular.
 */

/**
 * Heurística de unidade pelo nome da coluna. O executor manda o número já
 * limpo, sem dizer se era R$ ou %.
 *
 * ⚠️ **Usar a coluna de ORIGEM, nunca o alias.** O resultado vem batizado pelo
 * `as` do Query Plan — `ticket`, `total`, `pecas` — e nenhum desses nomes diz o
 * que o número é. Foi por isso que "Ticket médio" apareceu como `230,73` em vez
 * de `R$ 230,73`: a heurística estava olhando o alias.
 *
 * Errar para menos é o certo: um valor sem "R$" continua legível; um "R$"
 * indevido é informação falsa.
 *
 * Isto é a mesma dívida de keyword-match que o `query_engine/urgent.md`
 * registra — a diferença é que aqui ela só afeta a exibição, nunca o cálculo.
 */
const PISTAS_MOEDA = [
  "valor", "faturamento", "receita", "preco", "preço",
  "custo", "total", "ticket", "lucro", "margem_r",
];

const PISTAS_PERCENTUAL = ["percent", "desconto", "taxa", "_pct", "%"];

export type Unidade = "moeda" | "percentual" | "nenhuma";

export function unidadeDaColuna(nomeColuna: string | undefined): Unidade {
  if (!nomeColuna) return "nenhuma";
  const n = nomeColuna.toLowerCase();
  if (PISTAS_PERCENTUAL.some((p) => n.includes(p))) return "percentual";
  if (PISTAS_MOEDA.some((p) => n.includes(p))) return "moeda";
  return "nenhuma";
}

/**
 * Compacto acima de mil, para caber na figura herói sem quebrar linha.
 * Abaixo disso, o número inteiro — arredondar 847 para "0,8 mil" seria perder
 * precisão que cabia na tela.
 */
export function formatarValor(valor: number, unidade: Unidade): string {
  if (unidade === "percentual") {
    // Percentual nunca é compactado: "12,9 mil %" não existe.
    return `${valor.toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    })}%`;
  }

  const abs = Math.abs(valor);
  const prefixo = unidade === "moeda" ? "R$ " : "";

  if (abs >= 1_000_000) {
    return `${prefixo}${(valor / 1_000_000).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })} mi`;
  }
  if (abs >= 10_000) {
    return `${prefixo}${(valor / 1_000).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })} mil`;
  }
  return `${prefixo}${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: unidade === "moeda" ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * "há 4 min", "há 3 h", "há 2 d".
 *
 * A pílula é SEMPRE visível (decisão D5), não só quando o dado está velho: o
 * número pode ter até 15 min de TTL mais 15 min de cache no executor, e a
 * expectativa de "tempo real" precisa virar informação na tela em vez de
 * surpresa.
 */
export function idadeLegivel(iso: string | undefined, agora = Date.now()): string {
  if (!iso) return "";
  const ms = agora - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";

  const min = Math.floor(ms / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;

  const horas = Math.floor(min / 60);
  if (horas < 24) return `há ${horas} h`;

  return `há ${Math.floor(horas / 24)} d`;
}
