/**
 * Parsing defensivo de resposta do Gemini.
 *
 * Mesmo com `response_mime_type: "application/json"`, o Gemini às vezes
 * devolve o JSON envolto em fences de markdown (```json ... ```) ou com lixo
 * sobrando depois do objeto (ex: uma "}" extra, quebras de linha soltas).
 * `JSON.parse` é estrito e rejeita o texto inteiro por causa disso, mesmo
 * quando o objeto em si está correto.
 *
 * Usado por `ai-plum-chat` (Agente Z/A) e `ai-agents` (Agentes 1/2/3/3.1) —
 * um interpretador só, para não ter dois pontos de aplicação divergindo
 * silenciosamente sobre o que "JSON válido do Gemini" significa.
 */

/** Remove fences de markdown (```json ... ``` ou ``` ... ```) ao redor do texto. */
export function stripMarkdownFences(text: string): string {
  return text.replace(/```json\n?|\n?```/g, "").trim();
}

/**
 * Isola só o primeiro objeto JSON balanceado (da primeira "{" até a "}" que
 * fecha ela) e ignora qualquer coisa depois. Em vez de exigir que a resposta
 * inteira seja JSON puro, tolera lixo à direita sem inventar dado.
 */
export function extractJsonObject(text: string): string {
  const inicio = text.indexOf("{");
  if (inicio === -1) return text.trim();
  let profundidade = 0;
  for (let i = inicio; i < text.length; i++) {
    if (text[i] === "{") profundidade++;
    else if (text[i] === "}") {
      profundidade--;
      if (profundidade === 0) return text.slice(inicio, i + 1);
    }
  }
  return text.slice(inicio).trim();
}

/** Encadeia os dois: tira fences, isola o objeto balanceado, faz o parse. */
export function parseGeminiJson(text: string): unknown {
  return JSON.parse(extractJsonObject(stripMarkdownFences(text)));
}
