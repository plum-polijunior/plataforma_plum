/**
 * A forma do reconhecimento e a chave do cache — puro, sem Deno.
 *
 * Mesma divisão de `log_core.ts` e `llm_core.ts`: o que dá para testar sob
 * vitest mora aqui; o que fala com Supabase e com LLM mora no `adhoc/`.
 */

export type PapelAnalitico = "medida" | "dimensao" | "identificador" | "temporal";

export interface ColunaReconhecida {
  conceito: string;
  papel_analitico: PapelAnalitico;
  /** Conhecer os valores distintos ajudaria? Vira pedido `vocabulario` (B04). */
  vocabulario_util: boolean;
  /**
   * ⚠️ `baixa` significa que o A2 deduziu, não leu. O A3 usa isto para
   * perguntar em vez de presumir — presumir errado devolve um número certo
   * sobre a coisa errada, que é o pior formato de falha deste produto.
   */
  confianca: "alta" | "baixa";
}

export interface Reconhecimento {
  colunas: Record<string, ColunaReconhecida>;
  /** O que UMA LINHA representa. Sai de `n_linhas ÷ distintos` (B03). */
  grao: string;
  observacoes: string[];
}

/**
 * Canonicaliza o dicionário para a digital do cache.
 *
 * ⭐ Chaves ordenadas em toda profundidade. `JSON.stringify` preserva a ordem de
 * inserção do objeto, e o `schema_metadata` vem do banco como JSONB — cuja
 * ordem de chave **não é estável**. Sem isto, a mesma base produziria digitais
 * diferentes entre duas leituras e o cache nunca acertaria: o sintoma seria "o
 * A2 é chamado toda vez", que parece custo e é bug.
 */
export function canonicalizar(valor: unknown): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor) ?? "null";
  if (Array.isArray(valor)) return `[${valor.map(canonicalizar).join(",")}]`;

  const pares = Object.keys(valor as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalizar((valor as Record<string, unknown>)[k])}`);
  return `{${pares.join(",")}}`;
}

/**
 * SHA-256 do dicionário canonicalizado — a chave do cache junto com o dataset.
 *
 * Digital em vez de coluna de versão porque versão precisa ser lembrada em todo
 * lugar que edita o schema, e esquecer serviria reconhecimento velho para uma
 * base nova — falha silenciosa. A digital não pode ser esquecida: ela muda
 * porque o conteúdo mudou.
 */
export async function digitalDoDicionario(schemaMetadata: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizar(schemaMetadata ?? null));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Valida e normaliza a saída do A2.
 *
 * ⚠️ Campo faltando vira default em vez de exceção, mas **coluna inventada é
 * descartada**: o A2 pode alucinar um nome que não existe na base, e um nome
 * inventado chegando ao A3 viraria um Query Plan que morre em
 * `MissingColumnError` longe da causa.
 */
export function normalizarReconhecimento(
  bruto: unknown,
  colunasReais: readonly string[],
): Reconhecimento {
  const obj = (bruto ?? {}) as Partial<Reconhecimento>;
  const permitidas = new Set(colunasReais);
  const colunas: Record<string, ColunaReconhecida> = {};

  for (const [nome, def] of Object.entries(obj.colunas ?? {})) {
    if (!permitidas.has(nome)) {
      console.warn(`[a2] coluna inventada descartada: ${nome}`);
      continue;
    }
    const d = (def ?? {}) as Partial<ColunaReconhecida>;
    colunas[nome] = {
      conceito: String(d.conceito ?? "").trim() || nome,
      papel_analitico: PAPEIS.has(d.papel_analitico as PapelAnalitico)
        ? (d.papel_analitico as PapelAnalitico)
        : "dimensao",
      vocabulario_util: d.vocabulario_util === true,
      // ⭐ Default `baixa`, não `alta`. Confiança ausente é confiança
      // desconhecida, e o lado seguro do desconhecido é perguntar.
      confianca: d.confianca === "alta" ? "alta" : "baixa",
    };
  }

  return {
    colunas,
    grao: String(obj.grao ?? "").trim() || "desconhecido",
    observacoes: Array.isArray(obj.observacoes)
      ? obj.observacoes.map(String).filter(Boolean).slice(0, 3)
      : [],
  };
}

const PAPEIS = new Set<PapelAnalitico>([
  "medida",
  "dimensao",
  "identificador",
  "temporal",
]);

/** As colunas que o A2 marcou como valendo vocabulário. Entrada do B04. */
export function colunasComVocabularioUtil(r: Reconhecimento): string[] {
  return Object.entries(r.colunas)
    .filter(([, def]) => def.vocabulario_util)
    .map(([nome]) => nome)
    .sort();
}
