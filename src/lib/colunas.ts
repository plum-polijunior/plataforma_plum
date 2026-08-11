/**
 * Normalização de nome de coluna — a REFERÊNCIA de um contrato entre linguagens.
 *
 * Esta função batiza as colunas do usuário durante a importação
 * (`DatabasePipeline.tsx`), e o nome que sai dela é o que vai para
 * `datasets.schema_metadata`, para `role_permissions.allowed_columns` e para os
 * Query Plans que os agentes emitem. Ou seja: é o vocabulário do sistema.
 *
 * O executor Python precisa da MESMA transformação, porque ele lê o cabeçalho
 * original da planilha — o Plum nunca escreve na planilha do cliente (R-01),
 * então `NATUREZA DA AQUISIÇÃO` continua `NATUREZA DA AQUISIÇÃO` lá. A
 * contraparte é `normalizar_coluna` em `query_engine/sheets.py`.
 *
 * Estava inline em `DatabasePipeline.tsx` como um helper de componente, e o
 * Python simplesmente não normalizava nada — comparava string crua, apesar de o
 * docstring dele afirmar o contrário. Consequência medida em 2026-08-11:
 * nenhuma base cuja planilha tivesse cabeçalho legível por humano conseguia ser
 * lida. O erro dizia "A planilha nao tem a(s) coluna(s): estudo" numa planilha
 * cuja coluna C se chama `ESTUDO`.
 *
 * Duas implementações da mesma função é dívida assumida: não há como
 * compartilhar código entre o browser e o Lambda. A defesa é a tabela de casos
 * em `colunas.test.ts`, replicada em `tests/test_sheets.py` — divergir deixa um
 * dos dois testes vermelho. Ao mudar QUALQUER passo aqui, mude nos dois lugares
 * e nas duas tabelas.
 */

/**
 * Combining Diacritical Marks. A faixa importa: o Python remove exatamente
 * esta, e não `unicodedata.combining()`, que é mais amplo e divergiria.
 *
 * Escrita como escape (`̀`) e nunca como o caractere literal: marca
 * combinante solta no fonte é invisível no editor e não sobrevive a um
 * copiar-e-colar descuidado — sumiria em silêncio e a normalização passaria a
 * deixar acento passar, sem nada ficar vermelho.
 */
const MARCAS_COMBINANTES = /[̀-ͯ]/g;

/**
 * `NATUREZA DA AQUISIÇÃO` → `natureza_da_aquisicao`.
 *
 * Cabeçalho vazio (ou só pontuação) devolve string vazia. Quem chama decide o
 * que fazer com isso — inventar um nome seria adivinhar qual coluna é qual.
 */
export function normalizarNomeDeColuna(entrada: string): string {
  return entrada
    .normalize("NFD")
    .replace(MARCAS_COMBINANTES, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_") // caracteres especiais viram _
    .replace(/_+/g, "_") // multiplos _ viram um só
    .replace(/^_|_$/g, ""); // remove _ do começo e fim
}
