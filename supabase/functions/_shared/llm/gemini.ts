import {
  type Destino,
  falha,
  type PedidoLLM,
  type RespostaLLM,
  tokensDoGemini,
} from "../llm_core.ts";

/**
 * Adaptador do Gemini. Move para cá o que estava inline no `ai-plum-chat`.
 *
 * Sem SDK: o Google não tem cliente oficial para Deno, e a chamada é um POST
 * com um corpo JSON. Era `fetch` antes e continua sendo — o que muda é o lugar.
 */

const URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export async function chamarGemini(
  pedido: PedidoLLM,
  destino: Destino,
  chave: string,
): Promise<RespostaLLM> {
  const url = `${URL_BASE}/${destino.modelo}:generateContent?key=${chave.trim()}`;

  // ⭐ A queda do `response_schema` é tratada AQUI, e não no chamador.
  //
  // Antes ela vivia no laço de retentativa do `handleAgente`, com um
  // `tentativa--` para não consumir tentativa — o pedido nem chegou a ser
  // avaliado, então não era uma retentativa de verdade. Trazer para cá mantém
  // a semântica exata e tira do chamador uma peculiaridade que só o Gemini tem:
  // `response_schema` é endurecimento, não pode ser o que derruba o guard.
  for (const comSchema of pedido.schema ? [true, false] : [false]) {
    const corpo = {
      system_instruction: { parts: [{ text: pedido.sistema }] },
      contents: [{ parts: [{ text: pedido.prompt }] }],
      generationConfig: {
        temperature: pedido.temperatura ?? 0.2,
        response_mime_type: pedido.json ? "application/json" : "text/plain",
        ...(comSchema ? { response_schema: pedido.schema } : {}),
      },
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
    } catch (e) {
      // Rede caída. Não adianta tentar de novo sem schema — o pedido não chegou.
      return falha(destino, "rede", e instanceof Error ? e.message : String(e));
    }

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      if (comSchema && res.status === 400) {
        console.error(
          "Gemini recusou o response_schema; repetindo sem ele:",
          JSON.stringify(data),
        );
        continue;
      }
      console.error("ERRO DA API DO GEMINI:", JSON.stringify(data, null, 2));
      return {
        ...falha(
          destino,
          `gemini_${res.status}`,
          (data as { error?: { message?: string } })?.error?.message ??
            "Erro na API do Google Gemini",
        ),
        // O erro também é cobrado, e o log precisa saber quanto.
        tokens: tokensDoGemini(data),
      };
    }

    return {
      ok: true,
      // ⚠️ Resposta sem candidato (bloqueio de safety, corte de token) não pode
      // virar TypeError: vira texto vazio e cai no mesmo caminho de falha que o
      // chamador já trata.
      texto:
        (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
          ?.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
      tokens: tokensDoGemini(data),
      modelo: destino.modelo,
      provedor: "google",
    };
  }

  return falha(destino, "gemini_400", "Gemini recusou o pedido com e sem schema.");
}
