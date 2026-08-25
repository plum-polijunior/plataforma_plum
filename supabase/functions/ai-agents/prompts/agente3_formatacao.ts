import { GLOSSARIO_DE_TIPOS, FORMATTING_TYPES } from "./tipos_de_formatacao.ts";

/**
 * Agente 3 · Formatação — decide como cada coluna vira número, data ou texto.
 *
 * ⭐ **A saída dele é o que o executor Python obedece.** O `type` que sai daqui
 * entra no `schema_metadata.formatting_rule` e vira o despachante de
 * `apply_formatting_rules`: escolher `numero_inteiro` numa coluna com data
 * completa apaga o registro das contagens, e escolher `data` num ano puro cria
 * uma data de 1905. Nada disso aparece como erro — aparece como número errado
 * meses depois. É o motivo de ele estar no modelo de raciocínio.
 *
 * ⭐ **A ordem 3 → 4 tem um motivo que não é estético:** o `papel` que o perfil
 * devolve para o Agente 1 sai do `column_roles`, que vem desta `formatting_rule`.
 * Perfilar depois de a formatação estar decidida dá um perfil melhor.
 *
 * Papel `formatador`.
 */

/**
 * Quantas linhas ele devolve TRANSFORMADAS — e por que não é o número da amostra.
 *
 * Ele **vê** as 20 linhas de `amostra_do_cadastro` (`TETO_DE_CADASTRO`, em
 * `query_engine/linhas.py`), porque é vendo variedade que se acerta a regra:
 * cinco linhas de uma coluna de texto parecem iguais tendo ela 12 valores
 * distintos ou 12.000. Mas quem revisa é humano, e uma tabela antes-vs-depois de
 * 20 linhas não se lê — 10 é o que cabe na tela do passo 2.
 *
 * ⚠️ **O prompt dizia "5 linhas" cravado enquanto recebia 20**, desde que o B12
 * subiu a amostra. Ninguém mexeu no texto, e o agente devolvia 5 de 20 sem nada
 * apontando a contradição. Por isso o número vive aqui, é interpolado, e a
 * contagem real da amostra vai junto na mensagem: o prompt não tem como
 * discordar da realidade sozinho.
 */
export const LINHAS_NO_ANTES_DEPOIS = 10;

export const PROMPT_FORMATACAO =
  `Você é um Engenheiro de Dados Especialista. Sua tarefa é analisar amostras de dados de uma planilha e formatá-las corretamente para um banco de dados relacional. Você deve retornar um JSON ESTRITO com duas chaves: 'formattedSamples' (uma array com as PRIMEIRAS ${LINHAS_NO_ANTES_DEPOIS} linhas transformadas, na ordem em que chegaram e mantendo a estrutura de objetos originais — analise TODAS as linhas recebidas para decidir a regra, mas transforme somente essas ${LINHAS_NO_ANTES_DEPOIS}) e 'formattingRules' (um objeto JSON onde a chave é o nome da coluna e o valor é OUTRO OBJETO com exatamente três campos: 'type', 'params' e 'explicacao'.

'type' DEVE ser EXATAMENTE um destes valores, e NUNCA outro: ${FORMATTING_TYPES.join(", ")}.
${GLOSSARIO_DE_TIPOS}

'params' é um objeto com parâmetros específicos do type (ex.: {"dayfirst": true} para 'data'; a maioria dos types usa {} vazio).
'explicacao' é uma frase curta em português explicando a regra para um humano revisor — é o único campo que ele vai ler.

Exemplo de valor para uma coluna: {"type": "moeda_brl", "params": {}, "explicacao": "Remove 'R$', separador de milhar e converte vírgula decimal para número."}`;

/** A entrada do Agente 3. A contagem vai junto para o prompt não poder mentir. */
export function entradaDaFormatacao(dataSamples: unknown): string {
  const n = Array.isArray(dataSamples) ? dataSamples.length : 0;
  return `Amostras de dados originais (${n} linhas): ${JSON.stringify(dataSamples)}\n` +
    `Use TODAS elas para decidir as regras. Retorne 'formattingRules' para todas as colunas e ` +
    `'formattedSamples' com as primeiras ${LINHAS_NO_ANTES_DEPOIS} linhas transformadas.`;
}
