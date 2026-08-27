import { chamar, type RespostaLLM } from "../../_shared/llm.ts";
import { parseGeminiJson } from "../../_shared/gemini_parsing.ts";
import {
  normalizarPlanoDoA3,
  type PlanoDoA3,
} from "../../_shared/pedidos.ts";
import { type Dicionario, paraPrompt } from "../../_shared/dicionario.ts";
import type { ValorDoVocabulario } from "../../_shared/entidade.ts";
import { PROMPT_PLANEJADOR } from "./prompts/a3_planejador.ts";
import { dataDeHoje } from "../../_shared/hoje.ts";

/**
 * A3 · Planejador — a pergunta vira `pedidos[]` + `presuncoes[]`.
 *
 * ⭐ **Desde o B15 ele recebe o DICIONÁRIO, não o reconhecimento do A2.** É a
 * troca que dá sentido à etapa: o reconhecimento era um modelo deduzindo o
 * significado das colunas a cada base nova, sem nunca ver linha e sem ninguém
 * conferir; o dicionário foi escrito no cadastro, com 20 linhas e o perfil na
 * mesa, e **revisado por quem conhece o negócio**. *"Lucro não inclui
 * impostos"* não é derivável de cardinalidade nenhuma.
 *
 * ⚠️ **A troca foi mecânica de propósito.** `Dicionario` espelha os campos de
 * `Reconhecimento` (menos `confianca`) exatamente para isto — ver o cabeçalho de
 * `_shared/dicionario.ts`.
 *
 * ⚠️ O adaptador da Anthropic (`_shared/llm/claude.ts`) segue no repositório e
 * inalcançável: a análise de custo de 2026-08-21 trouxe este papel para o Gemini
 * Pro. Voltar é uma linha em `MODELO_POR_PAPEL`.
 */

export interface EntradaDoPlanejador {
  pergunta: string;
  /** ⭐ Lido do `schema_metadata` por `lerDicionario`. Sem LLM no caminho. */
  dicionario: Dicionario;
  /** `{coluna: valores}` — das colunas que o dicionário marcou e a base liberou. */
  vocabularios: Record<string, ValorDoVocabulario[]>;
}

export interface ResultadoDoPlanejador {
  plano: PlanoDoA3;
  llm: RespostaLLM;
}

export async function planejar(
  entrada: EntradaDoPlanejador,
): Promise<ResultadoDoPlanejador> {
  const llm = await chamar({
    papel: "planejador",
    sistema: PROMPT_PLANEJADOR,
    prompt: montarEntrada(entrada),
    json: true,
    // Zero: o mesmo par (pergunta, base) deve produzir o mesmo plano. Metade da
    // razão de o planejador existir é a resposta ser reproduzível — variação
    // aqui viraria "por que hoje deu diferente?" sem ninguém saber responder.
    temperatura: 0,
  });

  if (!llm.ok) {
    return { plano: normalizarPlanoDoA3(null), llm };
  }

  let bruto: unknown = null;
  try {
    bruto = parseGeminiJson(llm.texto);
  } catch {
    console.error("[a3] resposta nao parseou:", llm.texto.slice(0, 300));
  }

  return { plano: normalizarPlanoDoA3(bruto), llm };
}

/**
 * Monta a entrada do A3.
 *
 * ⚠️ **O vocabulário entra com a contagem de linhas, não só os valores.** Sem
 * ela o A3 não distingue "SP com 4.000 linhas" de "SP  com 2" (o duplicado com
 * espaço a mais) e trata os dois como categorias iguais. A contagem é o que
 * deixa a sujeira visível para quem planeja.
 *
 * ⚠️⚠️ **A DATA DE HOJE É CALCULADA AQUI, POR REQUISIÇÃO — nunca no escopo do
 * módulo.** Um `const HOJE = new Date()` no topo do arquivo seria congelado no
 * cold start do isolate, e isolates de Edge Function são reaproveitados por
 * horas ou dias: o chat passaria a filtrar "este mês" pelo mês em que a função
 * subiu, e a defasagem cresceria em silêncio até alguém republicar. É o tipo de
 * erro que não aparece em teste nenhum, porque em teste o processo é novo.
 */
function montarEntrada({ pergunta, dicionario, vocabularios }: EntradaDoPlanejador): string {
  // ⚠️ `dataDeHoje()`, não `toISOString()`: aquele devolve UTC, e das 21h à
  // meia-noite o Brasil ainda é ontem lá. Ver `_shared/hoje.ts`.
  const hoje = dataDeHoje();

  const partes = [
    `PERGUNTA DO USUÁRIO: "${pergunta}"`,
    "",
    `DATA DE HOJE: ${hoje}`,
    "",
    // ⭐ `paraPrompt` em vez de `JSON.stringify`, e a diferença não é estética:
    // ele escreve o dicionário em prosa curta, diz "(sem descrição)" onde
    // ninguém descreveu — omitir faria a coluna parecer inexistente — e
    // acrescenta o aviso de dicionário não conferido, que é o que substituiu a
    // `confianca` por coluna. Toda essa lógica vive num lugar só.
    paraPrompt(dicionario),
  ];

  const comVocabulario = Object.entries(vocabularios).filter(([, v]) => v.length);
  if (comVocabulario.length) {
    partes.push(
      "",
      "VOCABULÁRIO (valores que existem, com quantas linhas cada um):",
      JSON.stringify(Object.fromEntries(comVocabulario)),
    );
  } else {
    // ⭐ Dizer que não há, em vez de omitir. Silêncio faria o A3 presumir que a
    // coluna de texto não tem valor conhecido e evitar filtrar por ela — quando
    // o motivo real pode ser só a flag `vocabulario_exposto` desligada.
    partes.push(
      "",
      "VOCABULÁRIO: nenhum disponível para esta base. Escreva os termos do usuário",
      "como ele os disse; o sistema tentará casá-los com a base depois.",
    );
  }

  return partes.join("\n");
}
