/**
 * O enum fechado de `type` de formatação — o vocabulário que os prompts falam.
 *
 * ⚠️ **Ele é espelhado em Python.** `_FORMATTERS` e `TYPE_TO_ROLE` em
 * `query_engine/pandas_executor.py` têm a mesma lista, e é o Python que de fato
 * transforma o dado; aqui só se pede e se valida. Mexer em um lado sem o outro
 * **quebra o dispatcher em silêncio**: o `type` novo passa pela validação da
 * Edge Function, entra no `schema_metadata`, e o executor não sabe aplicá-lo.
 * Trate os dois como uma unidade.
 *
 * ⭐ Está aqui, e não no `index.ts`, porque tem dois consumidores que precisam
 * concordar: o prompt que **pede** o enum ao modelo e o `sanitizeFormattingRules`
 * que **recusa** o que sair dele. Duas listas seriam um prompt pedindo algo que
 * a validação rejeita — erro que só aparece como "a IA sugeriu um type
 * inválido" para um type que o prompt mandou usar.
 *
 * Esta é a terceira dívida de duplicação TS×Python do repositório, junto com o
 * nome de coluna (D-017) e o valor de texto (B04). O B14 passa perto e **não**
 * conserta, por decisão do plano da Etapa 2 (§A6).
 */
export const FORMATTING_TYPES = [
  "moeda_brl",
  "numero_decimal",
  "numero_inteiro",
  "percentual",
  "data",
  "ano",
  "texto_trim_maiusculas",
  "texto_trim_minusculas",
  "documento_cpf_cnpj",
  "booleano_sim_nao",
  "nenhuma",
] as const;

/**
 * A descrição de cada `type` para o modelo — o que o prompt do Agente 3 e do
 * 3.1 mostram.
 *
 * ⭐ Fica ao lado do enum de propósito: `type` novo sem linha aqui é um `type`
 * que o modelo nunca vai escolher, porque ele não sabe o que significa. Enum e
 * glossário andam juntos ou o enum cresce sem efeito.
 */
export const GLOSSARIO_DE_TIPOS = `- moeda_brl: valor monetário escrito como "R$ 1.234,56".
- numero_decimal: número com vírgula decimal, sem moeda (ex.: "8,5").
- numero_inteiro: contagem/quantidade inteira (ex.: "1.000").
- percentual: percentual escrito como texto com "%" (ex.: "15%"). Não use este type se a coluna já for um número puro representando fração.
- data: qualquer data escrita como texto, quando o dia e o mes importam.
- ano: coluna que representa um ANO (ex.: "2005", "Ano de conclusao", "Safra", "Exercicio"). Prefira 'ano' a 'numero_inteiro' e a 'data' sempre que os valores forem anos de 4 digitos, INCLUSIVE se algumas poucas celulas vierem como data completa ("01/12/2005") — este type extrai o ano das duas formas. Usar 'numero_inteiro' faz a data completa virar vazio e o registro sumir das contagens por ano; usar 'data' faz o ano puro virar uma data de 1905.
- texto_trim_maiusculas / texto_trim_minusculas: texto que precisa só de padronização de caixa e espaços.
- documento_cpf_cnpj: CPF ou CNPJ com pontuação.
- booleano_sim_nao: valores como "Sim"/"Não", "Verdadeiro"/"Falso", "1"/"0".
- nenhuma: nada da lista se aplica. Use isto sempre que tiver dúvida — NUNCA invente um type fora desta lista.`;
