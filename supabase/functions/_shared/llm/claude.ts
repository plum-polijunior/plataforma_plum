import Anthropic from "npm:@anthropic-ai/sdk@0.120.0";

import {
  type Destino,
  falha,
  type PedidoLLM,
  type RespostaLLM,
  tokensDaAnthropic,
} from "../llm_core.ts";

/**
 * Adaptador da Anthropic, para o planejador e o intérprete.
 *
 * ⚠️⚠️ **NUNCA FOI EXECUTADO, E HOJE É INALCANÇÁVEL.** Em 2026-08-21 uma análise
 * de custo trocou `claude-opus-5` por `gemini-3.1-pro-preview` no planejador e no
 * intérprete, então **nenhum papel da tabela aponta para a Anthropic**.
 *
 * ⭐ **Fica no repositório de propósito.** O ponto do B05 é que trocar de
 * provedor seja uma linha em `MODELO_POR_PAPEL`; apagar o adaptador desfaria
 * isso e a próxima troca viraria um bloco de trabalho. A chave já está nos
 * secrets, então voltar é editar a tabela e republicar.
 *
 * ⚠️ Continue tratando-o como **não testado**: nenhuma linha daqui jamais rodou.
 *
 * ── DIFERENÇAS QUE VALEM CONHECER ANTES DE MEXER ─────────────────────────
 *
 * ⚠️ `max_tokens` é **obrigatório** aqui, ao contrário do Gemini. 16000 é o
 * padrão recomendado para requisição não-streaming: baixo demais trunca a
 * resposta no meio e exige retentativa; alto demais esbarra no timeout HTTP do
 * SDK, e aí a saída teria de virar streaming.
 *
 * ⚠️ **Sem saída estruturada.** O `pedido.schema` é ignorado de propósito: só o
 * porteiro usa schema, e o porteiro roda no Gemini. Quando o planejador precisar
 * de garantia de forma, o caminho é `output_config.format` — mas o Query Plan
 * tem união de tipos em `select` e recursão em `where`, e prendê-lo num schema
 * distorceria o plano. A disciplina de JSON continua no prompt mais a
 * retentativa do chamador, igual ao `plan_query` de hoje.
 *
 * ⚠️ **Pensamento fica no padrão.** No Opus 5 ele já vem ligado quando o
 * parâmetro é omitido, e é justamente o que o planejador precisa.
 *
 * ⚠️ **Recusa não é exceção.** Uma decisão de política devolve HTTP 200 com
 * `stop_reason: "refusal"`. O `fallbacks: "default"` faz a própria API repetir
 * o pedido em outro modelo na mesma chamada; se a cadeia inteira recusar, isto
 * vira erro `recusa` no log em vez de uma resposta vazia sem explicação.
 */

const MAX_TOKENS = 16000;

export async function chamarClaude(
  pedido: PedidoLLM,
  destino: Destino,
  chave: string,
): Promise<RespostaLLM> {
  const cliente = new Anthropic({ apiKey: chave });

  let resp: Awaited<ReturnType<typeof cliente.beta.messages.create>>;
  try {
    resp = await cliente.beta.messages.create({
      model: destino.modelo,
      max_tokens: MAX_TOKENS,
      system: pedido.sistema,
      messages: [{ role: "user", content: pedido.prompt }],
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return falha(destino, "anthropic_429", "Limite de requisicoes atingido.");
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return falha(destino, "anthropic_401", "ANTHROPIC_API_KEY invalida.");
    }
    if (e instanceof Anthropic.APIError) {
      return falha(destino, `anthropic_${e.status}`, e.message);
    }
    return falha(destino, "rede", e instanceof Error ? e.message : String(e));
  }

  const tokens = tokensDaAnthropic(resp);

  if (resp.stop_reason === "refusal") {
    const categoria = (resp.stop_details as { category?: string } | null)?.category;
    return {
      ...falha(destino, "recusa", `Pedido recusado por politica: ${categoria ?? "sem categoria"}.`),
      tokens,
      // O modelo efetivamente usado pode não ser o pedido, se o fallback rodou.
      modelo: resp.model ?? destino.modelo,
    };
  }

  return {
    ok: true,
    // `content` é união discriminada: só os blocos de texto interessam aqui.
    texto: resp.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join(""),
    tokens,
    modelo: resp.model ?? destino.modelo,
    provedor: "anthropic",
  };
}
