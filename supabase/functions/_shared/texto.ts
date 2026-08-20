/**
 * Normalização de valor de texto — o espelho em TypeScript do `_strip_accents`
 * do executor.
 *
 * ⭐ **Esta é a armadilha que decide o B04, e ela não avisa.** O resolvedor de
 * entidade escolhe um literal do `vocabulario`; o executor depois filtra por
 * aquele literal com `where`. Se os dois normalizarem de jeitos diferentes, o
 * resolvedor acerta o valor e o `where` não casa — e a pergunta volta **com
 * zero**, que é exatamente o sintoma que o bloco existe para matar. Nada
 * quebra, nada erra: só devolve nada.
 *
 * O executor normaliza os dois lados de `=`, `!=`, `contains` e `in` com
 * `_strip_accents` (`query_engine/pandas_executor.py`): **trim → maiúsculas →
 * sem acento**, nessa ordem, via NFD descartando as marcas combinantes. Este
 * arquivo faz o mesmo, e `texto.test.ts` compara os dois numa tabela de casos.
 *
 * ⚠️ **É a segunda dívida de normalização do projeto, e é de outra natureza.**
 * A primeira é a de *nome de coluna* (`src/lib/colunas.ts` × `query_engine/
 * sheets.py`, D-017), onde divergir vira "coluna não encontrada" — barulhento.
 * Aqui divergir vira **resultado vazio**, que é silencioso. Por isso a tabela de
 * casos não é zelo: é a única coisa que segura as duas implementações juntas.
 *
 * ⚠️ **`normalizarNomeDeColuna` (`src/lib/colunas.ts`) NÃO serve.** É para
 * cabeçalho — troca espaço por underscore, entre outras coisas — e `src/` nem é
 * empacotado nas Edge Functions.
 *
 * ── O QUE ESTA NORMALIZAÇÃO NÃO FAZ ──────────────────────────────────────
 *
 * Não remove pontuação, não colapsa espaço interno, não tira palavra curta.
 * `"JOAO  SILVA"` (dois espaços) e `"JOAO SILVA"` continuam **diferentes** —
 * porque é assim que o executor se comporta, e o objetivo aqui é ser igual a
 * ele, não ser esperto. O que cobre a diferença de grafia é a distância de
 * edição do resolvedor, que roda **em cima** disto.
 */

/** `trim` → maiúsculas → sem acento. Espelha `_strip_accents` do executor. */
export function normalizar(valor: unknown): string {
  return String(valor ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "");
}

/**
 * Distância de Levenshtein entre duas strings já normalizadas.
 *
 * Implementação de duas linhas em vez de matriz completa: os candidatos são no
 * máximo 200 e as strings são nomes, mas isto roda por termo × candidato dentro
 * de uma Edge Function, e alocar 200 matrizes por pergunta é desperdício sem
 * ganho de clareza.
 */
export function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  let atual = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    atual[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(
        anterior[j] + 1, // remoção
        atual[j - 1] + 1, // inserção
        anterior[j - 1] + custo, // substituição
      );
    }
    [anterior, atual] = [atual, anterior];
  }

  return anterior[b.length];
}
