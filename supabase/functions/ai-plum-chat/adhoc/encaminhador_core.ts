/**
 * O miolo puro do A2 encaminhador — sem Deno, sem import de URL.
 *
 * ⭐ Mesma divisão do `llm_core.ts` e do `log_core.ts`, e pelo mesmo motivo: o
 * `_shared/llm.ts` importa o SDK da Anthropic de uma URL `npm:`, que o vitest
 * sob Node não resolve. A normalização da saída do modelo e a montagem da
 * entrada vivem aqui, onde são testadas; a chamada de rede fica no
 * `encaminhador.ts`.
 *
 * ⚠️ **Nada neste arquivo levanta**, com uma exceção documentada em
 * `agentes.resolver`. O A2 está no caminho crítico de toda pergunta: um `throw`
 * por causa de um id com um caractere a mais transformaria uma pergunta
 * respondível em chat morto.
 */

import { dataDeHoje } from "../../_shared/hoje.ts";
import {
  type Agente,
  paraPrompt as agentesParaPrompt,
  REGISTRO,
  resolver as resolverAgente,
} from "../../_shared/agentes.ts";
import { type BaseNoIndice, paraIndice } from "../../_shared/dicionario.ts";

export interface EntradaDoEncaminhador {
  pergunta: string;
  /** As bases da organização, já lidas do `schema_metadata`. */
  bases: readonly BaseNoIndice[];
  /**
   * ⚠️ Injetável **só** para a suíte de avaliação poder falsificar o
   * roteamento. Ver `REGISTRO_DE_TESTE` em `_shared/agentes.ts`: com um agente
   * só, o A2 sempre acerta e não há como distinguir roteador funcionando de
   * roteador quebrado.
   */
  registro?: readonly Agente[];
}

export interface Encaminhamento {
  /** O agente resolvido contra o registro — nunca um id cru do modelo. */
  agente: Agente;
  /** Nomes de base, **filtrados** contra o índice. Vazio ⇒ ver `inviavel`. */
  bases: string[];
  /** ⭐ Chega ao usuário. "Respondi olhando só a planilha de Vendas." */
  presuncao: string;
  /** Preenchido quando nenhuma base responde. `bases` vem vazio. */
  inviavel: string;
  /**
   * ⚠️ O modelo pediu um agente que não existe e caiu no generalista.
   *
   * ⛔ Não é erro para o usuário — é `codigo_erro` no `plum_logs`. Um fallback
   * que ninguém mede é um roteador que parou de funcionar sem avisar.
   */
  agenteInvalido: boolean;
  /** Nomes que o modelo pediu e não existem no índice. Vai para o log. */
  basesDescartadas: string[];
}

/**
 * O encaminhamento quando o A2 não conseguiu opinar.
 *
 * ⚠️ **Todas as bases, generalista.** É o comportamento de antes do A2 existir:
 * mais caro e mais ruidoso, mas correto. Degradar para "uma base qualquer"
 * responderia sobre os dados errados, que é pior que responder caro.
 *
 * ⭐⭐ **E a presunção é DECLARADA aqui também.** Achado em revisão: devolver
 * `presuncao: ""` no fallback deixaria o usuário sem saber que ninguém escolheu
 * base nenhuma — exatamente a informação que a presunção existe para dar. Uma
 * resposta que olhou seis planilhas quando duas bastavam é uma resposta
 * diferente, e ele é a única pessoa capaz de perceber.
 *
 * ⚠️ Com **uma** base a frase seria ruído: não houve escolha a declarar.
 */
export function aoPadrao(
  entrada: EntradaDoEncaminhador,
  registro: readonly Agente[] = REGISTRO,
): Encaminhamento {
  const { agente } = resolverAgente(undefined, registro);
  const nomes = entrada.bases.map((b) => b.nome);
  return {
    agente,
    bases: nomes,
    presuncao: nomes.length > 1
      ? `Olhei todas as ${nomes.length} bases desta organização — não consegui ` +
        "escolher entre elas."
      : "",
    inviavel: "",
    agenteInvalido: false,
    basesDescartadas: [],
  };
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * A saída crua do modelo vira um `Encaminhamento` confiável.
 *
 * ⚠️⚠️ **Nada aqui levanta.** O A2 está no caminho crítico de toda pergunta: um
 * `throw` por causa de um id com um caractere a mais transformaria uma pergunta
 * respondível em chat morto. Tudo degrada, e o que degradou vai para o log.
 */
export function normalizar(
  bruto: unknown,
  entrada: EntradaDoEncaminhador,
  registro: readonly Agente[] = REGISTRO,
): Encaminhamento {
  const obj = (bruto && typeof bruto === "object" && !Array.isArray(bruto)
    ? bruto
    : {}) as Record<string, unknown>;

  const { agente, caiuNoPadrao } = resolverAgente(obj.agente, registro);

  // ── As bases, filtradas contra o índice ──────────────────────────────────
  // ⛔ **Filtrar, não confiar.** Um nome de base que o modelo aproximou
  // ("Vendas" em vez de "vendas_2026") viraria `from` inexistente no executor e
  // card vazio. Melhor descartar aqui, onde dá para logar o que foi descartado.
  const existentes = new Set(entrada.bases.map((b) => b.nome));
  const pedidas = Array.isArray(obj.bases) ? obj.bases.map(texto) : [];

  const bases: string[] = [];
  const basesDescartadas: string[] = [];
  for (const nome of pedidas) {
    if (!nome) continue;
    // Deduplica: base repetida no array viraria dicionário duplicado no prompt
    // do A3, e ele contaria a mesma planilha duas vezes.
    if (existentes.has(nome)) {
      if (!bases.includes(nome)) bases.push(nome);
    } else {
      basesDescartadas.push(nome);
    }
  }

  const inviavel = texto(obj.inviavel);

  // ⚠️ Inviável só vale se o modelo declarou. Chegar aqui com zero bases porque
  // todas foram descartadas NÃO é inviável — é erro de nome, e o certo é cair no
  // padrão de todas as bases, não dizer ao usuário que a pergunta é impossível.
  if (inviavel && !bases.length) {
    return {
      agente,
      bases: [],
      presuncao: "",
      inviavel,
      agenteInvalido: caiuNoPadrao,
      basesDescartadas,
    };
  }

  if (!bases.length) {
    const padrao = aoPadrao(entrada, registro);
    return { ...padrao, agente, agenteInvalido: caiuNoPadrao, basesDescartadas };
  }

  return {
    agente,
    bases,
    presuncao: texto(obj.presuncao),
    inviavel: "",
    agenteInvalido: caiuNoPadrao,
    basesDescartadas,
  };
}

/**
 * Monta a entrada do A2.
 *
 * ⚠️ **A DATA DE HOJE É CALCULADA AQUI, POR REQUISIÇÃO** — nunca no escopo do
 * módulo. Um `const HOJE` no topo congelaria no cold start do isolate, que a
 * Edge Function reaproveita por horas. Ver `_shared/hoje.ts` e D-053.
 *
 * ⭐ O bloco dos agentes é **gerado** de `_shared/agentes.ts`. É a metade do
 * valor daquele arquivo: acrescentar um A3 muda este prompt sem editar prompt.
 */
export function montarEntrada(
  entrada: EntradaDoEncaminhador,
  registro: readonly Agente[],
): string {
  return [
    `PERGUNTA DO USUÁRIO: "${entrada.pergunta}"`,
    "",
    `DATA DE HOJE: ${dataDeHoje()}`,
    "",
    paraIndice(entrada.bases),
    "",
    agentesParaPrompt(registro),
  ].join("\n");
}
