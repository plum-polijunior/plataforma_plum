import { chamar, type RespostaLLM } from "../../_shared/llm.ts";
import type { Presuncao } from "../../_shared/pedidos.ts";
import { PROMPT_INTERPRETE } from "./prompts/a4_interprete.ts";

/**
 * A4 · Intérprete — resultado agregado vira resposta em português.
 *
 * ⭐ Recebe os NEGADOS junto com os resultados, e é o que diferencia o remake do
 * caminho atual: hoje um pedido negado por RBAC derruba a pergunta inteira. Aqui
 * ele vira uma frase — "não incluí a margem porque seu cargo não tem acesso" —
 * e o resto da resposta continua valendo.
 */

export interface ResultadoDePedido {
  id: string;
  porque: string;
  status: "ok" | "negado" | "erro";
  /** Presente quando `ok`. O vetor agregado que o executor devolveu. */
  dados?: unknown;
  /** Presente quando não `ok`. Por que este recorte não veio. */
  motivo?: string;
}

export interface ResultadoDoInterprete {
  texto: string;
  llm: RespostaLLM;
}

export async function interpretar(
  pergunta: string,
  resultados: ResultadoDePedido[],
  presuncoes: Presuncao[],
): Promise<ResultadoDoInterprete> {
  const ok = resultados.filter((r) => r.status === "ok");
  const negados = resultados.filter((r) => r.status !== "ok");

  const partes = [
    `PERGUNTA ORIGINAL: "${pergunta}"`,
    "",
    "RESULTADOS:",
    JSON.stringify(ok.map((r) => ({ porque: r.porque, dados: r.dados }))),
  ];

  if (presuncoes.length) {
    partes.push("", "PRESUNÇÕES DO PLANEJADOR:", JSON.stringify(presuncoes));
  }
  if (negados.length) {
    partes.push(
      "",
      "PEDIDOS NEGADOS (diga o que ficou de fora, em uma frase):",
      JSON.stringify(negados.map((r) => ({ porque: r.porque, motivo: r.motivo }))),
    );
  }

  const llm = await chamar({
    papel: "interprete",
    sistema: PROMPT_INTERPRETE,
    prompt: partes.join("\n"),
    // Não é JSON: a saída é Markdown restrito, lido por gente.
    json: false,
    // ⚠️ Acima de zero, ao contrário do planejador. Aqui variação pequena é
    // boa — texto com temperatura 0 sai robótico e repetitivo entre respostas.
    // O que não pode variar é o NÚMERO, e ele não é escolha do modelo: vem
    // pronto nos resultados.
    temperatura: 0.2,
  });

  return { texto: llm.ok ? llm.texto : "", llm };
}
