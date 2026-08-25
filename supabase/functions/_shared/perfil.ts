/**
 * O perfil da base virando sugestão — a parte determinística do dicionário v2.
 *
 * ── ⭐ POR QUE ESTAS REGRAS SÃO CÓDIGO, E NÃO PROMPT ────────────────────────
 *
 * `papel_analitico` e `vocabulario_util` saem do perfil por regra fechada:
 * `linhas_por_valor ≈ 1` é identificador, texto com poucos distintos tem
 * vocabulário útil, número é medida, data é temporal. O cálculo viu a **base
 * inteira**; o modelo vê 20 linhas.
 *
 * ⛔ Então o modelo não é a fonte desses dois campos — ele é o **revisor** deles.
 * O valor dele é discordar com motivo (*"`cep` tem cardinalidade de dimensão,
 * mas é identificador"*), e é por isso que a sugestão vai no prompt e o
 * `normalizarDicionarioDoAgente1` cai de volta nela sempre que a resposta não
 * traz um valor válido. Pedir do zero trocaria uma conta certa por um palpite.
 *
 * ── ⚠️ POR QUE ESTE ARQUIVO ESTÁ EM `_shared/` ─────────────────────────────
 *
 * Dois consumidores precisam concordar sobre **quais colunas têm vocabulário**:
 * o `ai-plum-chat`, que decide de quais pedir a lista de valores ao executor, e
 * o `ai-agents`, que sugere `vocabulario_util` ao Agente 1. Se divergirem, o
 * Agente 1 marca uma coluna como útil sem nunca ter visto os valores dela — e o
 * dicionário nasce afirmando algo que ninguém conferiu, em silêncio.
 *
 * É a mesma razão de `query_plan.ts` e `dicionario.ts` existirem: um
 * interpretador, vários pontos de aplicação.
 *
 * ⚠️ **Isto é o lado do CADASTRO da mesma pergunta que `dicionario.ts` responde
 * na LEITURA.** Lá, base v1 sem `papel_analitico` cai no `PAPEL_POR_FORMATACAO`;
 * aqui, base nova sem resposta do modelo cai no perfil. Defaults diferentes
 * porque a evidência disponível é diferente — o cadastro tem cardinalidade, o
 * leitor do chat só tem a `formatting_rule`.
 */

import { TETO_DE_VOCABULARIO } from "./vocabulario.ts";

export type PapelAnalitico = "medida" | "dimensao" | "identificador" | "temporal";

export const PAPEIS_ANALITICOS = new Set<PapelAnalitico>([
  "medida",
  "dimensao",
  "identificador",
  "temporal",
]);

/**
 * `linhas_por_valor` abaixo disto significa que quase toda linha tem um valor
 * próprio — é identificador, não categoria.
 *
 * ⚠️ Não é `= 1`: base real tem duplicata. Uma coluna de `pedido_id` com 1.200
 * linhas e 1.180 distintos dá 1,017, e é identificador do mesmo jeito.
 */
const LIMITE_DE_IDENTIFICADOR = 1.2;

export interface SugestaoDeColuna {
  papel_analitico: PapelAnalitico;
  vocabulario_util: boolean;
}

export interface ColunaDoPerfil {
  existe?: boolean;
  papel?: unknown;
  distintos?: unknown;
  vazios_pct?: unknown;
  min?: unknown;
  max?: unknown;
  linhas_por_valor?: unknown;
}

export interface Perfil {
  n_linhas?: unknown;
  colunas?: Record<string, ColunaDoPerfil>;
}

const numero = (v: unknown): number | null =>
  typeof v === "number" && isFinite(v) ? v : null;

/**
 * O papel provável de uma coluna, a partir do perfil.
 *
 * A ordem das checagens é o que importa: **identificador vence tipo**, porque
 * `linhas_por_valor` é evidência mais forte. Uma coluna de CPF é texto e não é
 * dimensão; agrupar por ela devolveria uma linha por pessoa.
 */
export function papelPeloPerfil(c: ColunaDoPerfil | undefined): PapelAnalitico {
  const papel = typeof c?.papel === "string" ? c.papel : "text";
  const porValor = numero(c?.linhas_por_valor);

  if (porValor !== null && porValor < LIMITE_DE_IDENTIFICADOR) return "identificador";
  if (papel === "date" || papel === "ano") return "temporal";
  if (papel === "number" || papel === "percent") return "medida";
  return "dimensao";
}

/**
 * Vale buscar os valores distintos desta coluna?
 *
 * ⭐ Só faz sentido para dimensão de texto dentro do teto: é o que o resolvedor
 * de entidade usa para casar *"joão silva"* com o literal da base. Número, data
 * e identificador não se resolvem por lista.
 */
export function vocabularioPeloPerfil(c: ColunaDoPerfil | undefined): boolean {
  if (papelPeloPerfil(c) !== "dimensao") return false;
  const distintos = numero(c?.distintos);
  return distintos !== null && distintos > 0 && distintos <= TETO_DE_VOCABULARIO;
}

/** As sugestões determinísticas, por coluna — o que o Agente 1 revisa. */
export function sugerirDoPerfil(
  colunas: string[],
  perfil: unknown,
): Record<string, SugestaoDeColuna> {
  const doPerfil = ((perfil ?? {}) as Perfil).colunas ?? {};

  const out: Record<string, SugestaoDeColuna> = {};
  for (const col of colunas) {
    const c = doPerfil[col];
    out[col] = {
      papel_analitico: papelPeloPerfil(c),
      vocabulario_util: vocabularioPeloPerfil(c),
    };
  }
  return out;
}

/**
 * As colunas de que vale pedir vocabulário ao executor, em ordem estável.
 *
 * ⚠️ Perfil ausente devolve lista **vazia**, não a lista toda: pedir vocabulário
 * de coluna numérica é gastar uma chamada para o executor recusar.
 *
 * Ordem alfabética porque o chamador corta as primeiras N — sem ordem estável,
 * qual coluna ganha vocabulário mudaria entre execuções.
 */
export function colunasComVocabularioDoPerfil(
  perfil: unknown,
  permitidas: string[],
): string[] {
  const doPerfil = ((perfil ?? {}) as Perfil).colunas ?? null;
  if (!doPerfil) return [];

  const liberadas = new Set(permitidas);
  return Object.keys(doPerfil)
    .filter((nome) => liberadas.has(nome) && vocabularioPeloPerfil(doPerfil[nome]))
    .sort();
}
