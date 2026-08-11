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
 * O `gid` identifica a ABA dentro da planilha. Aparece como `#gid=123` (o mais
 * comum) ou `?gid=123`, e a URL real do Google costuma trazer os dois.
 */
const PADRAO_GID = /[?#&]gid=(\d+)/;

/** Planilha + aba. `gid` é null quando o texto não carrega essa informação. */
export interface SheetRef {
  id: string;
  gid: number | null;
}

/**
 * Devolve `{id, gid}`, ou null quando o texto não é um link de planilha
 * reconhecível. Nunca lança: quem chama decide o que fazer com o null, e a
 * decisão é diferente no onboarding e na tela de edição.
 *
 * Por que o `gid` importa, e por que ele é gravado em vez do nome da aba: a
 * API do Google exige o NOME da aba no range (`'Vendas'!A2:A`), mas o nome é
 * apelido mutável. Guardar o nome funciona até alguém renomear a aba, e aí a
 * base quebra sem ninguém mexer nela. O `gid` é atribuído na criação da aba e
 * não muda com rename, então é ele que a gente guarda; o executor traduz para
 * o nome no momento da leitura.
 *
 * Antes desta função, o `gid` era simplesmente descartado aqui. A consequência
 * medida em produção: `datasets.google_sheet_tab` nunca saía do default
 * `'Sheet1'`, e toda base cujos dados não estivessem numa aba com esse nome
 * exato falhava na primeira pergunta — com "Nao consegui ler a planilha agora",
 * que não dizia nada sobre a causa. Ver
 * `supabase/migrations/20260811000000_google_sheet_gid.sql`.
 */
export function extrairSheetRef(entrada: string | null | undefined): SheetRef | null {
  if (!entrada) return null;
  const texto = entrada.trim();
  if (!texto) return null;

  const gidCasou = texto.match(PADRAO_GID);
  // `gid=0` é a primeira aba, e é um valor legítimo. Comparar com null (e não
  // testar a verdade do número) é o que impede a primeira aba de toda planilha
  // de ser tratada como "sem aba definida".
  const gid = gidCasou?.[1] != null ? Number.parseInt(gidCasou[1], 10) : null;

  const casou = texto.match(PADRAO_ID);
  if (casou?.[1]) return { id: casou[1], gid };

  // Alguém pode colar só o ID. Aceitar é mais gentil que recusar — mas aí não
  // há aba nenhuma na entrada, e a base vai depender de `google_sheet_tab`.
  if (PADRAO_ID_CRU.test(texto)) return { id: texto, gid: null };

  return null;
}

/**
 * Só o ID. Mantida porque é o que a maior parte do código pede, e porque
 * trocar todos os chamadores de uma vez seria mudança maior que a necessária.
 */
export function extrairSheetId(entrada: string | null | undefined): string | null {
  return extrairSheetRef(entrada)?.id ?? null;
}

/** Mensagem única para as duas telas, para o usuário não ver textos diferentes. */
export const ERRO_LINK_INVALIDO =
  "Esse link não parece ser de uma planilha do Google. " +
  "Copie o endereço da barra do navegador com a planilha aberta " +
  "(ele contém /spreadsheets/d/...).";
