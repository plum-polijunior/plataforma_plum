/**
 * Conversão entre link e ID de planilha do Google.
 *
 * Por que isto existe: a tabela `datasets` tinha dois campos concorrentes.
 * O onboarding gravava `google_sheet_url` e o executor lia `google_sheet_id`.
 * Como o arquivo de tipos só conhecia o segundo, o TypeScript não acusava
 * nada, e todo card falharia no primeiro dia com "planilha nula".
 *
 * Decisão: o ID é a fonte da verdade, porque a API do Google exige o ID e não
 * a URL. Extrair uma vez na escrita é melhor que extrair em toda leitura, e
 * torna o erro visível no momento em que a pessoa cola o link, e não semanas
 * depois quando um card quebra. A URL continua sendo gravada, mas só para
 * exibição na tela de configuração.
 */

/** Aceita as formas de URL que o Google entrega ao clicar em Compartilhar. */
const PADRAO_ID = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;

/** Um ID colado direto, sem URL em volta. */
const PADRAO_ID_CRU = /^[a-zA-Z0-9_-]{20,}$/;

/**
 * Devolve o ID, ou null quando o texto não é um link de planilha reconhecível.
 * Nunca lança: quem chama decide o que fazer com o null, e a decisão é
 * diferente no onboarding e na tela de edição.
 */
export function extrairSheetId(entrada: string | null | undefined): string | null {
  if (!entrada) return null;
  const texto = entrada.trim();
  if (!texto) return null;

  const casou = texto.match(PADRAO_ID);
  if (casou?.[1]) return casou[1];

  // Alguém pode colar só o ID. Aceitar é mais gentil que recusar.
  if (PADRAO_ID_CRU.test(texto)) return texto;

  return null;
}

/** Mensagem única para as duas telas, para o usuário não ver textos diferentes. */
export const ERRO_LINK_INVALIDO =
  "Esse link não parece ser de uma planilha do Google. " +
  "Copie o endereço da barra do navegador com a planilha aberta " +
  "(ele contém /spreadsheets/d/...).";
