import { FORMATTING_TYPES } from "./tipos_de_formatacao.ts";
import { LINHAS_NO_ANTES_DEPOIS } from "./agente3_formatacao.ts";

/**
 * Agente 3.1 · Refinador de formatação — altera UMA regra e preserva as outras.
 *
 * ⭐ **A preservação é o requisito, não a alteração.** A pessoa pediu para
 * mudar uma coluna; um modelo que reescreve o objeto inteiro desfaz em silêncio
 * as decisões que ela já tinha aprovado nas outras colunas. O prompt insiste
 * nisso porque o modo de falha é invisível na tela: as outras regras continuam
 * existindo, só mudaram.
 *
 * Papel `formatador`, o mesmo do Agente 3 — é a mesma decisão, revisada.
 */

export const PROMPT_REFINO_DE_FORMATACAO =
  `Você é um Engenheiro de Dados Especialista. O usuário solicitou uma alteração pontual nas regras de formatação. As regras atuais (formattingRules) já vêm no formato estruturado {type, params, explicacao} por coluna. Sua tarefa é alterar APENAS o objeto {type, params, explicacao} da coluna ou solicitação mencionada pelo usuário, MANTENDO TODOS OS OUTROS OBJETOS INTACTOS, sem modificar o que não foi pedido.

'type' DEVE continuar sendo EXATAMENTE um destes valores, e NUNCA outro: ${
    FORMATTING_TYPES.join(", ")
  }. Se a alteração pedida não se encaixar em nenhum deles, use 'nenhuma' e explique o motivo em 'explicacao'.

Em seguida, aplique esse conjunto completo de regras atualizado às amostras de dados originais (dataSamples). Você DEVE retornar ESTRITAMENTE um JSON com duas chaves: 'formattedSamples' (uma array com as PRIMEIRAS ${LINHAS_NO_ANTES_DEPOIS} linhas transformadas, na ordem em que chegaram) e 'formattingRules' (o objeto completo, mesmo formato estruturado, com apenas a coluna solicitada modificada).`;

/** A entrada do 3.1: as regras de agora, as amostras e o pedido da pessoa. */
export function entradaDoRefinoDeFormatacao(
  regrasAtuais: unknown,
  dataSamples: unknown,
  pedido: string,
): string {
  return [
    `Regras de Formatação Atuais (formattingRules): ${JSON.stringify(regrasAtuais)}`,
    `Amostras de Dados Originais (dataSamples): ${JSON.stringify(dataSamples)}`,
    `Solicitação de Alteração do Usuário: "${pedido}"`,
    "Altere APENAS o que o usuário solicitou nas regras e retorne o JSON com " +
    "'formattedSamples' e 'formattingRules'.",
  ].join("\n");
}
