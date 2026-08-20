import type { ValorDoVocabulario } from "./entidade.ts";

/**
 * O pedido `vocabulario` — os valores distintos de uma coluna, com contagem.
 *
 * ⭐ **Zero mudança no executor.** Ele compila para um Query Plan comum —
 * `group_by [col] + count + order desc + limit` — e passa pelo mesmo caminho de
 * qualquer agregado. Isso não é economia de trabalho: é o que mantém **um**
 * interpretador de Query Plan no sistema. Um endpoint próprio para vocabulário
 * seria um segundo lugar onde uma coluna pode escapar do RBAC.
 *
 * ── ⚠️ ESTA É A ÚNICA PORTA PARA VALOR LITERAL DE TEXTO ──────────────────
 *
 * O B02 fechou o `group_by` de alta cardinalidade e o B03 recusou `min`/`max`
 * sobre texto no `metadados`. Sobrou este pedido — e ele existe porque sem
 * vocabulário não há resolução de entidade, e sem resolução de entidade
 * "quanto o Fulano vendeu" devolve zero para sempre.
 *
 * Três travas, e nenhuma delas é opcional:
 *
 *  1. **A coluna está em `allowed_columns`** — o RBAC de cargo, como sempre.
 *  2. **`datasets.vocabulario_exposto`** — a base foi liberada para isto.
 *  3. ⭐ **Teto de cardinalidade**, aplicado pelo executor (B02). Acima de 200
 *     valores distintos a coluna é **identificador, não categoria**, e listá-la
 *     é entregar a base. O pedido é recusado — e a recusa é a resposta certa,
 *     não uma falha a contornar.
 *
 * A trava 3 não mora aqui de propósito: só o executor sabe a cardinalidade
 * real, porque só ele tem o dado em mãos. É o mesmo teto, a mesma constante e o
 * mesmo número dos dois lados (`TETO_DE_CARDINALIDADE` em `pandas_executor.py`).
 */

/** O mesmo 200 do `TETO_DE_CARDINALIDADE` do executor. Ver o cabeçalho. */
export const TETO_DE_VOCABULARIO = 200;

export interface QueryPlanDeVocabulario {
  from: string;
  select: { expr: { agg: "count"; col: string }; as: string }[];
  group_by: string[];
  order_by: { col: string; dir: "desc" }[];
  limit: number;
}

/** O alias da contagem. Nome fixo para o leitor não precisar adivinhar. */
export const ALIAS_CONTAGEM = "linhas";

export function planoDeVocabulario(coluna: string): QueryPlanDeVocabulario {
  return {
    from: "producao",
    select: [{ expr: { agg: "count", col: coluna }, as: ALIAS_CONTAGEM }],
    group_by: [coluna],
    // Mais frequentes primeiro: se o teto cortar, o que sobra é o que mais
    // aparece na base — que é também o que o usuário mais provavelmente citou.
    order_by: [{ col: ALIAS_CONTAGEM, dir: "desc" }],
    limit: TETO_DE_VOCABULARIO,
  };
}

export type MotivoDeRecusa = "coluna_proibida" | "vocabulario_desligado";

export interface PermissaoDeVocabulario {
  permitido: boolean;
  motivo?: MotivoDeRecusa;
}

/**
 * As duas travas que a Edge Function consegue aplicar sozinha.
 *
 * ⚠️ A terceira — cardinalidade — **não é conferível aqui**, e tentar seria
 * pior que não tentar: nada nesta camada sabe quantos valores distintos a
 * coluna tem, e um palpite viraria ora recusa indevida, ora falsa segurança.
 * Quem recusa é o executor, com o dado na mão.
 */
export function podeExporVocabulario(
  coluna: string,
  colunasPermitidas: readonly string[],
  vocabularioExposto: boolean,
): PermissaoDeVocabulario {
  if (!colunasPermitidas.includes(coluna)) {
    return { permitido: false, motivo: "coluna_proibida" };
  }
  if (!vocabularioExposto) {
    return { permitido: false, motivo: "vocabulario_desligado" };
  }
  return { permitido: true };
}

/**
 * Lê o resultado do executor de volta para a forma que o resolvedor espera.
 *
 * ⚠️ Tolerante: linha sem o valor ou sem a contagem é descartada em vez de
 * virar `undefined` dentro do resolvedor, onde o erro apareceria longe da causa.
 */
export function lerVocabulario(
  coluna: string,
  linhas: unknown,
): ValorDoVocabulario[] {
  if (!Array.isArray(linhas)) return [];

  return linhas.flatMap((linha) => {
    const bruto = (linha as Record<string, unknown>)?.[coluna];
    if (bruto == null || bruto === "") return [];

    const contagem = (linha as Record<string, unknown>)?.[ALIAS_CONTAGEM];
    return [{
      valor: String(bruto),
      linhas: typeof contagem === "number" ? contagem : 0,
    }];
  });
}
