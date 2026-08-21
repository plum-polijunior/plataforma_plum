import { chamar, type RespostaLLM } from "../../_shared/llm.ts";
import { parseGeminiJson } from "../../_shared/gemini_parsing.ts";
import {
  normalizarPlanoDoA3,
  type PlanoDoA3,
} from "../../_shared/pedidos.ts";
import type { Reconhecimento } from "../../_shared/reconhecimento.ts";
import type { ValorDoVocabulario } from "../../_shared/entidade.ts";
import { PROMPT_PLANEJADOR } from "./prompts/a3_planejador.ts";

/**
 * A3 · Planejador — a pergunta vira `pedidos[]` + `presuncoes[]`.
 *
 * ⚠️ **É a primeira coisa do sistema que roda em Claude.** O adaptador
 * (`_shared/llm/claude.ts`) foi escrito no B05 e nunca executado até aqui — se
 * algo estranho acontecer, suspeite dele antes de suspeitar deste prompt.
 */

export interface EntradaDoPlanejador {
  pergunta: string;
  reconhecimento: Reconhecimento;
  /** `{coluna: valores}` — só das colunas que o A2 marcou e a base liberou. */
  vocabularios: Record<string, ValorDoVocabulario[]>;
}

export interface ResultadoDoPlanejador {
  plano: PlanoDoA3;
  llm: RespostaLLM;
}

export async function planejar(
  entrada: EntradaDoPlanejador,
): Promise<ResultadoDoPlanejador> {
  const llm = await chamar({
    papel: "planejador",
    sistema: PROMPT_PLANEJADOR,
    prompt: montarEntrada(entrada),
    json: true,
    // Zero: o mesmo par (pergunta, base) deve produzir o mesmo plano. Metade da
    // razão de o planejador existir é a resposta ser reproduzível — variação
    // aqui viraria "por que hoje deu diferente?" sem ninguém saber responder.
    temperatura: 0,
  });

  if (!llm.ok) {
    return { plano: normalizarPlanoDoA3(null), llm };
  }

  let bruto: unknown = null;
  try {
    bruto = parseGeminiJson(llm.texto);
  } catch {
    console.error("[a3] resposta nao parseou:", llm.texto.slice(0, 300));
  }

  return { plano: normalizarPlanoDoA3(bruto), llm };
}

/**
 * Monta a entrada do A3.
 *
 * ⚠️ **O vocabulário entra com a contagem de linhas, não só os valores.** Sem
 * ela o A3 não distingue "SP com 4.000 linhas" de "SP  com 2" (o duplicado com
 * espaço a mais) e trata os dois como categorias iguais. A contagem é o que
 * deixa a sujeira visível para quem planeja.
 */
function montarEntrada({ pergunta, reconhecimento, vocabularios }: EntradaDoPlanejador): string {
  const partes = [
    `PERGUNTA DO USUÁRIO: "${pergunta}"`,
    "",
    "RECONHECIMENTO DA BASE:",
    JSON.stringify(reconhecimento),
  ];

  const comVocabulario = Object.entries(vocabularios).filter(([, v]) => v.length);
  if (comVocabulario.length) {
    partes.push(
      "",
      "VOCABULÁRIO (valores que existem, com quantas linhas cada um):",
      JSON.stringify(Object.fromEntries(comVocabulario)),
    );
  } else {
    // ⭐ Dizer que não há, em vez de omitir. Silêncio faria o A3 presumir que a
    // coluna de texto não tem valor conhecido e evitar filtrar por ela — quando
    // o motivo real pode ser só a flag `vocabulario_exposto` desligada.
    partes.push(
      "",
      "VOCABULÁRIO: nenhum disponível para esta base. Escreva os termos do usuário",
      "como ele os disse; o sistema tentará casá-los com a base depois.",
    );
  }

  return partes.join("\n");
}
