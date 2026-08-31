/**
 * O NOME de uma base — o valor que o `from` do Query Plan casa.
 *
 * ── ⭐⭐ POR QUE ISTO EXISTE COMO MÓDULO ────────────────────────────────────
 *
 * Com multi-base, três lugares precisam concordar sobre como uma base se chama:
 *
 *   1. o prompt do A3 (invocação 2), que mostra os nomes disponíveis;
 *   2. a barreira 3 (`handleExecutePlan`), que escolhe contra qual
 *      `allowed_columns` autorizar o pedido;
 *   3. o payload do executor, cujo `bases[].nome` o Python casa com o `from`.
 *
 * ⛔ Se os três derivarem o nome por conta própria, eles divergem em silêncio —
 * e a divergência entre (1) e (2) não é "coluna não encontrada", é **autorizar
 * contra a base A e executar sobre a base B**. É a classe do D-017, com
 * consequência de vazamento em vez de erro.
 *
 * ⇒ Um dono. Os três importam daqui.
 *
 * ── ⚠️ E A REGRA DO `from` VIVE EM DOIS IDIOMAS ─────────────────────────────
 *
 * `query_engine/pandas_executor.py` tem `resolver_nome_da_tabela`, que é a
 * barreira 4. Não há como compartilhar código entre Deno e Python — é a mesma
 * situação da normalização de nome de coluna (D-017), e a defesa é a mesma:
 * **a tabela de casos abaixo está replicada nos dois lados**, em
 * `bases_core.test.ts` e em `tests/test_multibase.py`.
 *
 * ⭐ Mas há uma proteção melhor que a réplica, e ela é o motivo de
 * `resolverBase` devolver o nome CANÔNICO: a Edge Function **reescreve**
 * `plan.from` com o nome que resolveu antes de mandar ao executor. Assim o
 * Python sempre acha correspondência exata e a ponte de compatibilidade dele
 * nunca é exercitada no caminho `ad_hoc`. Uma decisão, tomada num lugar,
 * verificada no outro — em vez de duas decisões que precisam coincidir.
 */

/**
 * ⭐ O nome que o caminho de UMA base sempre usou, e que todo card salvo carrega.
 *
 * Espelha `TABELA_PADRAO` de `pandas_executor.py`.
 */
export const BASE_PADRAO = "producao";

export interface DatasetParaNome {
  id: string;
  name?: string | null;
}

/**
 * `nome_da_base` em snake_case, estável e legível para o modelo.
 *
 * ⚠️ **Estável não é o mesmo que bonito.** O nome vai no prompt do A3 e volta no
 * `from`; se ele mudasse quando alguém renomeasse a base no painel, um card
 * salvo apontaria para um nome que não existe mais. Por isso o fallback é o
 * `id`, e por isso um `name` que normaliza para vazio (só emoji, só pontuação)
 * também cai no `id` em vez de virar string vazia.
 *
 * ⚠️ O prefixo `b_` no fallback existe porque uuid começa com dígito em ~40% dos
 * casos, e um identificador que começa com número confunde o modelo a ponto de
 * ele "consertar" o nome no `from`.
 */
export function nomeDaBase(dataset: DatasetParaNome): string {
  // ⛔ **NÃO reusa `normalizar` de `texto.ts`, e é de propósito.** Aquela função
  // existe para ser *idêntica* ao `_strip_accents` do executor, porque casa
  // VALOR de célula — o comentário dela diz isso. Amarrar o nome da base àquele
  // contrato significa que um ajuste na comparação de valores renomearia as
  // bases, e todo card salvo passaria a apontar para um nome inexistente.
  //
  // Três linhas duplicadas valem menos que esse acoplamento.
  const cru = String(dataset.name ?? "")
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    // O `slice` pode ter deixado um `_` na borda.
    .replace(/_+$/g, "");

  if (cru) return cru;
  return `b_${dataset.id.replace(/-/g, "").slice(0, 12)}`;
}

/**
 * Garante nomes únicos, preservando a ordem de entrada.
 *
 * ⚠️ Duas bases chamadas "Vendas 2026" e "vendas-2026" normalizam igual, e o
 * executor recusa payload com nome repetido (400). Desempatar aqui, com sufixo
 * numérico, é melhor que deixar o turno falhar por um detalhe de cadastro.
 *
 * ⛔ O desempate é pela ORDEM RECEBIDA, e o chamador tem de passar ordem
 * estável (ordene por `id`). Sufixo que troca de dono entre requisições é a
 * mesma falha que o `google_sheet_gid` evita: o `allowed_columns` passaria a
 * apontar para a base errada.
 */
export function nomearBases<T extends DatasetParaNome>(
  datasets: readonly T[],
): Map<string, T> {
  const porNome = new Map<string, T>();
  for (const ds of datasets) {
    const base = nomeDaBase(ds);
    let nome = base;
    let n = 2;
    while (porNome.has(nome)) nome = `${base}_${n++}`;
    porNome.set(nome, ds);
  }
  return porNome;
}

export interface BaseResolvida {
  /** O nome canônico. ⭐ Escreva-o de volta em `plan.from` antes de executar. */
  nome: string;
  /** `true` quando caiu na ponte de compatibilidade de uma base só. */
  viaPonte: boolean;
}

/**
 * Qual base o plano quer, ou `null` se ele nomeia uma que não veio.
 *
 * ⚠️⚠️ **A regra de compatibilidade é o ponto, não um detalhe.** Todo card salvo
 * em produção carrega `"from": "producao"`, porque até 2026-08-27 o `main.py`
 * sobrescrevia o `from` antes de executar. Com **exatamente uma** base, um `from`
 * ausente ou igual a `"producao"` cai nela, qualquer que seja o nome real.
 *
 * ⛔ **A ponte NÃO vale com duas ou mais.** Ali "producao" não é apelido de nada:
 * adivinhar qual das N devolveria o número de uma base com o rótulo de outra — e
 * pior, autorizaria contra o `allowed_columns` da errada.
 *
 * ⭐ Devolve `null` em vez de levantar: quem chama nega **aquele pedido** e deixa
 * os outros do lote seguirem. É a negação parcial que o produto promete.
 */
export function resolverBase(
  plan: unknown,
  nomes: Iterable<string>,
): BaseResolvida | null {
  const conjunto = new Set(nomes);
  const pedidaCrua = (plan && typeof plan === "object")
    ? (plan as Record<string, unknown>).from
    : undefined;
  const pedida = typeof pedidaCrua === "string" ? pedidaCrua.trim() : undefined;

  if (pedida && conjunto.has(pedida)) return { nome: pedida, viaPonte: false };

  // ── A ponte do legado, e só ela ──────────────────────────────────────────
  if (conjunto.size === 1 && (!pedida || pedida === BASE_PADRAO)) {
    return { nome: [...conjunto][0], viaPonte: true };
  }

  return null;
}

/**
 * O valor que o seletor do chat manda quando a pessoa escolhe "Todas as minhas
 * bases" — e é o que liga a metade de SELEÇÃO do A2.
 *
 * ⚠️ **Espelhado no front** (`src/pages/PlumChat.tsx`), porque `src/` não é
 * empacotado nas Edge Functions e não há como importar daqui para lá. É uma
 * constante e não um `null`/ausência de propósito: `datasetId` ausente já
 * significa "requisição malformada" em quatro handlers deste arquivo, e
 * reaproveitar isso para "todas" faria um bug de front virar uma consulta a
 * todas as bases da organização.
 *
 * ⭐ Não é uuid, então nunca casa com um `datasets.id` — o `.eq("id", ...)` do
 * caminho de base única devolveria vazio em vez de acertar por acidente.
 */
export const TODAS_AS_BASES = "todas";
