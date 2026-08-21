/**
 * A saída do A3 — `pedidos[]` e `presuncoes[]` — e a validação dela.
 *
 * Puro, sem Deno: é aqui que mora tudo que dá para testar sem subir modelo.
 *
 * ── ⭐ POR QUE VALIDAR A SAÍDA DE UM AGENTE QUE JÁ SEGUE UM PROMPT ───────
 *
 * Porque prompt não é contrato. O A3 escreve o Query Plan que o executor vai
 * rodar, e cada campo que passa daqui sem conferência é um lugar onde uma
 * pergunta vira número errado — ou onde o `authorizePlan` recebe algo que não
 * sabe percorrer e devolve "nenhuma coluna", que o executor lê como base vazia.
 *
 * ⚠️ Isto **não é** a trava de segurança. Quem autoriza coluna é o
 * `authorizePlan` (`query_plan.ts`) e a barreira 4 do Lambda, e nada aqui os
 * substitui. Isto é higiene de forma: recusar cedo o que quebraria longe.
 */

/**
 * ⚠️ `registro` e `amostra` devolvem LINHA BRUTA — são a exceção ao P1.3, e a
 * única razão de poderem existir é que o `orcamento.ts` os conta antes de
 * executar e o `linhas.py` corta em 5. Acrescentar um terceiro tipo aqui sem
 * passar pelos dois reabriria a porta.
 */
export type TipoDePedido =
  | "agregado"
  | "serie"
  | "vocabulario"
  | "registro"
  | "amostra";

export interface Pedido {
  /** Identificador local do turno. Vira `card_id` no payload do executor. */
  id: string;
  tipo: TipoDePedido;
  /** O Query Plan. A gramática é a do `pandas_executor.py`, não uma nova. */
  plano: Record<string, unknown>;
  /** Uma frase: o que este pedido responde. Vai para o A4 e para o log. */
  porque: string;
}

/**
 * O que o A3 assumiu sem o usuário ter dito.
 *
 * ⭐ **É o entregável mais importante do remake para o usuário**, e o V7 o
 * chama assim: sem o bloco de presunções, a resposta é um número sem procedência
 * — e um número sem procedência que está errado é indistinguível de um certo.
 */
export interface Presuncao {
  /** O que foi presumido: "receita", "período", "quais lojas". */
  campo: string;
  /** A escolha feita: "receita_liquida", "últimos 12 meses". */
  presumido: string;
  /** Por quê, em linguagem de negócio. Vai para a tela. */
  porque: string;
}

export interface PlanoDoA3 {
  pedidos: Pedido[];
  presuncoes: Presuncao[];
  /**
   * Termos que o A3 quer casar contra o vocabulário antes de executar
   * ("João Silva" → o literal da base). Resolvidos por `entidade.ts`, sem LLM.
   */
  entidades: { termo: string; coluna: string }[];
  /**
   * ⭐ O A3 concluiu que a base não responde a pergunta. Não é erro: é a
   * resposta certa, e chega ao usuário como frase, não como falha.
   */
  inviavel?: string;
}

const TIPOS = new Set<TipoDePedido>([
  "agregado",
  "serie",
  "vocabulario",
  "registro",
  "amostra",
]);

/** Teto de pedidos por turno. Ver o comentário em `normalizarPlanoDoA3`. */
export const MAX_PEDIDOS = 6;

/**
 * Valida e normaliza a saída bruta do A3.
 *
 * Descarta o malformado em vez de lançar: um pedido inválido entre cinco não é
 * motivo para perder os outros quatro, e o A4 sabe responder com o que veio.
 * ⚠️ Mas se **nenhum** sobrar, o chamador tem de tratar como falha — daí o
 * `pedidos` vazio ser um estado que o tipo permite e o código de cima confere.
 */
export function normalizarPlanoDoA3(bruto: unknown): PlanoDoA3 {
  const obj = (bruto ?? {}) as Partial<PlanoDoA3>;

  const inviavel = typeof obj.inviavel === "string" && obj.inviavel.trim()
    ? obj.inviavel.trim()
    : undefined;

  const pedidos: Pedido[] = [];
  for (const [i, p] of (Array.isArray(obj.pedidos) ? obj.pedidos : []).entries()) {
    const d = (p ?? {}) as Partial<Pedido>;

    // ⚠️ Plano tem de ser objeto. String aqui viraria `authorizePlan("...")`,
    // que devolve "nenhuma coluna" — e o executor descreveria uma base vazia
    // sem ninguém saber que a causa foi um tipo errado.
    if (!d.plano || typeof d.plano !== "object" || Array.isArray(d.plano)) {
      console.warn(`[a3] pedido ${i} sem plano utilizável — descartado`);
      continue;
    }
    if (!TIPOS.has(d.tipo as TipoDePedido)) {
      console.warn(`[a3] pedido ${i} com tipo '${d.tipo}' — descartado`);
      continue;
    }

    pedidos.push({
      // ⚠️ Id gerado aqui, não aceito do modelo: ele vira `card_id` no payload
      // e é a chave pela qual o resultado volta. Id repetido faria dois pedidos
      // colidirem e um sumir em silêncio.
      id: `p${i}`,
      tipo: d.tipo as TipoDePedido,
      plano: d.plano as Record<string, unknown>,
      porque: String(d.porque ?? "").trim() || "sem justificativa",
    });

    // ⭐ Teto por turno. Não é sobre custo: é sobre o A3 "resolvendo" uma
    // pergunta difícil pedindo tudo que existe e deixando o A4 achar a resposta
    // no meio. Seis é folgado para qualquer pergunta legítima; acima disso o
    // planejamento falhou e responder com o que veio é melhor que executar
    // vinte consultas.
    if (pedidos.length >= MAX_PEDIDOS) {
      console.warn(`[a3] mais de ${MAX_PEDIDOS} pedidos — o excedente foi cortado`);
      break;
    }
  }

  const presuncoes: Presuncao[] = (Array.isArray(obj.presuncoes) ? obj.presuncoes : [])
    .map((p) => {
      const d = (p ?? {}) as Partial<Presuncao>;
      return {
        campo: String(d.campo ?? "").trim(),
        presumido: String(d.presumido ?? "").trim(),
        porque: String(d.porque ?? "").trim(),
      };
    })
    .filter((p) => p.campo && p.presumido)
    .slice(0, 5);

  const entidades = (Array.isArray(obj.entidades) ? obj.entidades : [])
    .map((e) => {
      const d = (e ?? {}) as { termo?: unknown; coluna?: unknown };
      return { termo: String(d.termo ?? "").trim(), coluna: String(d.coluna ?? "").trim() };
    })
    .filter((e) => e.termo && e.coluna)
    .slice(0, 5);

  return { pedidos, presuncoes, entidades, inviavel };
}

/**
 * Troca o termo do usuário pelo literal da base dentro do plano.
 *
 * ⭐ Substituição **por valor exato**, em qualquer profundidade do `where`. O A3
 * escreveu `{"left":"cliente","op":"=","right":"João Silva"}` e o resolvedor
 * descobriu que o literal é `JOAO DA SILVA`; sem esta troca o filtro casaria
 * zero, que é justamente o sintoma que o B04 existe para matar.
 *
 * ⚠️ Compara o termo cru, não normalizado: o que está no plano é o que o A3
 * escreveu, e é ele que precisa ser trocado.
 */
export function aplicarLiterais(
  valor: unknown,
  de: ReadonlyMap<string, string>,
): unknown {
  if (typeof valor === "string") return de.get(valor) ?? valor;
  if (Array.isArray(valor)) return valor.map((v) => aplicarLiterais(v, de));
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .map(([k, v]) => [k, aplicarLiterais(v, de)]),
    );
  }
  return valor;
}
