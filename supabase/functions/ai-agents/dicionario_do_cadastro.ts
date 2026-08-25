/**
 * A entrada e a saída do Agente 1 — o dicionário v2 nascendo.
 *
 * ⭐ As regras determinísticas (papel, vocabulário) vivem em `_shared/perfil.ts`,
 * porque o `ai-plum-chat` precisa da mesma resposta para decidir de quais
 * colunas pedir vocabulário ao executor. Ver o cabeçalho de lá.
 */

import {
  PAPEIS_ANALITICOS,
  type PapelAnalitico,
  type Perfil,
  type SugestaoDeColuna,
} from "../_shared/perfil.ts";

export type { PapelAnalitico, SugestaoDeColuna };

const numero = (v: unknown): number | null =>
  typeof v === "number" && isFinite(v) ? v : null;

export interface EntradaDaSemantica {
  colunas: string[];
  perfil: unknown;
  dataSamples: unknown;
  vocabularios: Record<string, unknown>;
  sugestoes: Record<string, SugestaoDeColuna>;
}

/**
 * Monta a mensagem do Agente 1.
 *
 * ⚠️ **Bloco ausente é dito, não omitido** — mesma regra do A3 com o vocabulário.
 * Silêncio faria o modelo presumir que a base não tem perfil e escrever
 * definição mais vaga sem dizer por quê; "não disponível" faz ele saber que está
 * trabalhando com menos evidência. O caso é real: perfil e vocabulário dependem
 * de o executor responder, e o cadastro tem de seguir se eles falharem.
 */
export function entradaDaSemantica(e: EntradaDaSemantica): string {
  const partes = [`COLUNAS DA BASE: ${e.colunas.join(", ")}`];

  const perfil = (e.perfil ?? null) as Perfil | null;
  if (perfil?.colunas && Object.keys(perfil.colunas).length) {
    partes.push(
      "",
      `PERFIL DA BASE (${numero(perfil.n_linhas) ?? "?"} linhas no total):`,
      JSON.stringify(perfil.colunas),
    );
  } else {
    partes.push(
      "",
      "PERFIL DA BASE: não disponível (a leitura falhou). Trabalhe com os nomes e as amostras.",
    );
  }

  const amostras = Array.isArray(e.dataSamples) ? e.dataSamples : [];
  partes.push(
    "",
    amostras.length
      ? `LINHAS DE EXEMPLO (${amostras.length}): ${JSON.stringify(amostras)}`
      : "LINHAS DE EXEMPLO: nenhuma disponível.",
  );

  const comVoc = Object.entries(e.vocabularios).filter(([, v]) =>
    Array.isArray(v) && v.length
  );
  partes.push(
    "",
    comVoc.length
      ? "VOCABULÁRIO (valores que existem, com quantas linhas cada um):\n" +
        JSON.stringify(Object.fromEntries(comVoc))
      : "VOCABULÁRIO: nenhum disponível para esta base.",
  );

  partes.push(
    "",
    "SUGESTÕES DETERMINÍSTICAS (calculadas sobre a base inteira — repita quando concordar):",
    JSON.stringify(e.sugestoes),
  );

  return partes.join("\n");
}

export interface ColunaDoDicionarioDoCadastro {
  semantic_definition: string;
  papel_analitico: PapelAnalitico;
  vocabulario_util: boolean;
}

export interface DicionarioDoCadastro {
  columns: Record<string, ColunaDoDicionarioDoCadastro>;
  grao: string;
  observacoes: string[];
}

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** No máximo três, uma frase cada — o que o prompt pede e o que a tela mostra. */
const MAX_OBSERVACOES = 3;

/**
 * A saída do Agente 1, com forma garantida.
 *
 * ⚠️ **Toda coluna pedida sai daqui, inclusive as que o modelo esqueceu.** O
 * front monta a tela de revisão a partir desta chave: coluna ausente
 * desapareceria da etapa 4, ninguém escreveria a definição dela, e a base
 * nasceria com uma coluna muda — o mesmo modo de falha que a C11 tinha, por
 * outra porta.
 *
 * ⚠️ E é aqui que `papel_analitico` inválido cai de volta na sugestão, em vez de
 * entrar no `schema_metadata`. Um papel inventado não quebra nada na hora: o
 * `lerDicionario` o descarta na leitura e usa o default dele, então o efeito
 * seria o A3 recebendo um papel pior para sempre, sem sintoma.
 */
export function normalizarDicionarioDoAgente1(
  bruto: unknown,
  colunas: string[],
  sugestoes: Record<string, SugestaoDeColuna>,
): DicionarioDoCadastro {
  const raiz = (bruto ?? {}) as Record<string, unknown>;
  const cruas = (raiz.columns && typeof raiz.columns === "object" && !Array.isArray(raiz.columns)
    ? raiz.columns
    : {}) as Record<string, unknown>;

  const columns: Record<string, ColunaDoDicionarioDoCadastro> = {};
  for (const col of colunas) {
    const c = (cruas[col] && typeof cruas[col] === "object"
      ? cruas[col]
      : {}) as Record<string, unknown>;

    const sugerido = sugestoes[col];
    const papelDito = texto(c.papel_analitico) as PapelAnalitico;

    columns[col] = {
      semantic_definition: texto(c.semantic_definition),
      papel_analitico: PAPEIS_ANALITICOS.has(papelDito)
        ? papelDito
        : sugerido?.papel_analitico ?? "dimensao",
      vocabulario_util: typeof c.vocabulario_util === "boolean"
        ? c.vocabulario_util
        : sugerido?.vocabulario_util ?? false,
    };
  }

  const observacoes = Array.isArray(raiz.observacoes)
    ? raiz.observacoes.map(texto).filter(Boolean).slice(0, MAX_OBSERVACOES)
    : [];

  return { columns, grao: texto(raiz.grao), observacoes };
}
