import { chamarClaude } from "./llm/claude.ts";
import { chamarGemini } from "./llm/gemini.ts";
import { falha, type PedidoLLM, type RespostaLLM, resolver } from "./llm_core.ts";

/**
 * Ponto único de chamada de LLM do `ai-plum-chat`.
 *
 * Este arquivo é só o fio: descobre para onde o papel vai, pega a credencial e
 * entrega ao adaptador. A tabela papel→modelo, a resolução e a leitura de token
 * vivem em `llm_core.ts`, onde são testadas — o motivo da separação está no
 * cabeçalho daquele arquivo.
 */

export {
  MODELO_POR_PAPEL,
  MODELOS,
  type Papel,
  type PedidoLLM,
  type Provedor,
  type RespostaLLM,
  resolver,
  tokensDaAnthropic,
  tokensDoGemini,
  type UsoDeTokens,
} from "./llm_core.ts";

export async function chamar(pedido: PedidoLLM): Promise<RespostaLLM> {
  const chaveGoogle = Deno.env.get("GEMINI_API_KEY");
  const chaveAnthropic = Deno.env.get("ANTHROPIC_API_KEY");

  const destino = resolver(pedido.papel, Boolean(chaveAnthropic));

  if (destino.degradado) {
    // ⚠️ Uma linha por chamada, de propósito: o planejador rodando em Flash é
    // uma cadeia mais fraca que a projetada, e silêncio aqui viraria "o remake
    // não ficou tão bom quanto esperávamos" sem ninguém saber por quê. O log
    // também registra, via `modelo`/`provedor`.
    console.warn(
      `[llm] '${pedido.papel}' deveria rodar na Anthropic e caiu no Gemini: ` +
        `ANTHROPIC_API_KEY nao configurada.`,
    );
  }

  if (destino.provedor === "anthropic") {
    return await chamarClaude(pedido, destino, chaveAnthropic!);
  }

  if (!chaveGoogle) {
    return falha(destino, "sem_api_key", "GEMINI_API_KEY is not configured");
  }

  return await chamarGemini(pedido, destino, chaveGoogle);
}
