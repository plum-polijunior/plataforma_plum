/**
 * A2 · Encaminhador — quais bases o A3 recebe, e QUAL A3 planeja.
 *
 * ⚠️ **A lógica está no `encaminhador_core.ts`.** Aqui fica só a chamada de
 * rede, porque `_shared/llm.ts` importa o SDK da Anthropic de uma URL `npm:` que
 * o vitest sob Node não resolve — mesma divisão do `llm.ts`/`llm_core.ts`.
 *
 * ── ⛔ ESTE NÃO É O `reconhecedor` ADAPTADO ─────────────────────────────────
 *
 * O A2 antigo (`adhoc/reconhecedor.ts`, apagado em 2026-08-27) **não recebia a
 * pergunta**, e era exatamente isso que tornava o resultado dele cacheável por
 * `(dataset, digital do dicionário)`. Este recebe a pergunta — escolher base sem
 * ela é impossível. ⇒ **Não cacheia**, e a tabela `plum_reconhecimento` foi
 * dropada porque o que ela guardava deixou de ser uma chamada de LLM: o índice
 * das bases sai de um `select` no `schema_metadata`.
 *
 * Cachear isto por digital devolveria a escolha de UMA pergunta para OUTRA
 * pergunta, em silêncio — a classe de bug mais caro deste produto. Ver D-054.
 *
 * ── ⭐ AS DUAS ESCOLHAS SAEM NUMA CHAMADA SÓ ────────────────────────────────
 *
 * Elas são acopladas: a capacidade do agente restringe a base elegível (um
 * `a3_tendencia` precisa de coluna temporal). Duas chamadas seriam duas vezes o
 * custo no caminho crítico de toda pergunta, e a segunda decidiria sem saber o
 * que a primeira escolheu.
 */

import { chamar, type RespostaLLM } from "../../_shared/llm.ts";
import { parseGeminiJson } from "../../_shared/gemini_parsing.ts";
import { REGISTRO } from "../../_shared/agentes.ts";
import { PROMPT_ENCAMINHADOR } from "./prompts/a2_encaminhador.ts";
import {
  aoPadrao,
  type Encaminhamento,
  type EntradaDoEncaminhador,
  montarEntrada,
  normalizar,
} from "./encaminhador_core.ts";

export type { Encaminhamento, EntradaDoEncaminhador };
export { normalizar };

export interface ResultadoDoEncaminhador {
  encaminhamento: Encaminhamento;
  llm: RespostaLLM;
}

export async function encaminhar(
  entrada: EntradaDoEncaminhador,
): Promise<ResultadoDoEncaminhador> {
  const registro = entrada.registro ?? REGISTRO;

  const llm = await chamar({
    papel: "encaminhador",
    sistema: PROMPT_ENCAMINHADOR,
    prompt: montarEntrada(entrada, registro),
    json: true,
    // Zero pelo mesmo motivo do A3: a mesma pergunta sobre as mesmas bases tem
    // de escolher a mesma base. Variação aqui viraria "por que hoje ele olhou
    // outra planilha?", sem ninguém saber responder.
    temperatura: 0,
  });

  if (!llm.ok) {
    // ⭐ Falha de LLM NÃO é inviável: a pergunta pode ser perfeitamente
    // respondível. Cai no comportamento pré-A2 — generalista e todas as bases —
    // porque um chat que responde caro é melhor que um chat que não responde.
    return { encaminhamento: aoPadrao(entrada, registro), llm };
  }

  let bruto: unknown = null;
  try {
    bruto = parseGeminiJson(llm.texto);
  } catch {
    console.error("[a2] resposta nao parseou:", llm.texto.slice(0, 300));
  }

  return { encaminhamento: normalizar(bruto, entrada, registro), llm };
}
