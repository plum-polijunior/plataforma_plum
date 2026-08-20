import { chamar, type RespostaLLM } from "../../_shared/llm.ts";
import { parseGeminiJson } from "../../_shared/gemini_parsing.ts";
import { PROMPT_PORTEIRO, SCHEMA_PORTEIRO } from "./prompts/a1_porteiro.ts";

/**
 * A1 · Porteiro — a pergunta é sobre os dados desta empresa?
 *
 * Devolve o veredito **e** a resposta crua do LLM, para o chamador registrar
 * modelo, provedor e tokens sem que este módulo precise conhecer o log. Mesma
 * divisão do `handleAgente`.
 */

export interface VeredictoDoPorteiro {
  permitido: boolean;
  /** Só quando bloqueado. Vai direto para a tela. */
  mensagem: string | null;
  llm: RespostaLLM;
}

export async function passarPeloPorteiro(
  pergunta: string,
): Promise<VeredictoDoPorteiro> {
  const llm = await chamar({
    papel: "porteiro",
    sistema: PROMPT_PORTEIRO,
    prompt: `Pergunta do usuário: "${pergunta}"`,
    json: true,
    temperatura: 0,
    schema: SCHEMA_PORTEIRO,
  });

  // ⚠️ Falha de provedor NÃO bloqueia. O porteiro é um filtro de escopo, não
  // uma trava de segurança: quem protege dado é o RBAC de coluna, que roda
  // depois e não depende de LLM nenhum. Fechar aqui por erro de rede
  // transformaria uma indisponibilidade do Gemini em "sua pergunta é
  // inválida" — mentira, e a pessoa reformularia uma pergunta que estava certa.
  //
  // É a mesma postura fail-open do Z-dash (D-023), pelo mesmo motivo: economia
  // de custo, não controle de acesso.
  if (!llm.ok) {
    console.error("[a1] porteiro indisponivel, seguindo:", llm.erro?.codigo);
    return { permitido: true, mensagem: null, llm };
  }

  try {
    const v = parseGeminiJson(llm.texto) as { status?: string; mensagem?: string };
    const bloqueado = v?.status === "BLOQUEADO";
    return {
      permitido: !bloqueado,
      mensagem: bloqueado ? (v.mensagem ?? MENSAGEM_PADRAO) : null,
      llm,
    };
  } catch {
    // JSON inválido também não bloqueia, pela mesma razão.
    console.error("[a1] resposta do porteiro nao parseou:", llm.texto.slice(0, 200));
    return { permitido: true, mensagem: null, llm };
  }
}

const MENSAGEM_PADRAO =
  "Sou o assistente da Plataforma Plum, especialista nas suas bases de dados e " +
  "indicadores. Posso te ajudar a analisar suas planilhas. Como posso ajudar com " +
  "seus dados hoje?";
