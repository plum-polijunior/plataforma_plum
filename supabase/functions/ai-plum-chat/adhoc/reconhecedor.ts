/**
 * ⛔⛔ **DESLIGADO NO B15 — VOLTA NA ETAPA 3. NÃO APAGAR.**
 *
 * Este módulo não é mais chamado por ninguém. Quem diz o que a base significa
 * passou a ser o **dicionário** escrito no cadastro (`_shared/dicionario.ts`),
 * conferido por uma pessoa antes de ser salvo.
 *
 * ⭐ **Por que fica no repositório:** com UMA planilha, o trabalho que o V7 dá
 * ao A2 é vazio — *"que tabelas importam"* é constante, *"que colunas importam"*
 * o A3 resolve melhor porque é ele que tem a pergunta, e *"de quais preciso
 * vocabulário"* é determinístico. Na Etapa 3, com várias planilhas, escolher
 * entre elas volta a ser problema de verdade, e é este agente que o resolve.
 * Apagar seria jogar fora um bloco inteiro já testado para reescrevê-lo igual.
 *
 * Ver §A3 do `zz_remake_implementation/PLANO-etapa-2.md` e `30-decisoes.md`
 * D-005. A tabela `plum_reconhecimento` fica pelo mesmo motivo.
 */

import { chamar, type RespostaLLM } from "../../_shared/llm.ts";
import { parseGeminiJson } from "../../_shared/gemini_parsing.ts";
import {
  digitalDoDicionario,
  normalizarReconhecimento,
  type Reconhecimento,
} from "../../_shared/reconhecimento.ts";
import { PROMPT_RECONHECEDOR } from "./prompts/a2_reconhecedor.ts";

/**
 * A2 · Reconhecedor — a leitura semântica da base, com cache.
 *
 * ⭐ **Não recebe a pergunta.** É o que torna o resultado cacheável por
 * `(dataset, digital do dicionário)` e vale para qualquer pergunta depois — ver
 * o cabeçalho de `20260820130000_plum_reconhecimento.sql`, onde a contradição do
 * V7 sobre isto está registrada e resolvida.
 */

/** O mínimo que este módulo precisa do client. Existe para o teste dublar. */
export interface ClienteDeCache {
  from(tabela: string): {
    select(cols: string): {
      eq(c: string, v: unknown): {
        eq(c: string, v: unknown): {
          maybeSingle(): PromiseLike<{
            data: { reconhecimento: unknown } | null;
            error?: { message: string } | null;
          }>;
        };
      };
    };
    upsert(
      linha: Record<string, unknown>,
      opcoes: { onConflict: string },
    ): PromiseLike<{ error: { message: string } | null }>;
  };
}

export interface ResultadoDoReconhecedor {
  reconhecimento: Reconhecimento;
  digital: string;
  /** ⭐ Vai para `plum_logs.cache_hit_a2` — o critério de pronto do V7 §8. */
  cacheHit: boolean;
  /** Ausente quando veio do cache: não houve chamada. */
  llm?: RespostaLLM;
  /**
   * ⚠️ A gravação do cache falhou — mensagem crua do banco.
   *
   * Engolir o erro está certo para a PERGUNTA (cache é otimização, nunca motivo
   * de falha) e errado para o DIAGNÓSTICO: sem isto, "o cache nunca acerta"
   * aparece só no `console.error` da função, e o `plum_logs` diz *não acertou*
   * sem dizer *não consegui escrever* — que são causas diferentes com o mesmo
   * sintoma. Aconteceu em 2026-08-21: a migration morreu antes de criar a
   * policy de INSERT, e sem policy a RLS negava todo `upsert`, em silêncio.
   */
  erroDeCache?: string;
}

export async function reconhecer(
  cliente: ClienteDeCache,
  datasetId: string,
  schemaMetadata: unknown,
  metadados: unknown,
  colunasReais: readonly string[],
): Promise<ResultadoDoReconhecedor> {
  const digital = await digitalDoDicionario(schemaMetadata);

  // ⚠️ Defesa em profundidade: o chamador já filtra, mas ESTE módulo é o que
  // grava cache, e aceitar entrada inválida é o caminho para cachear lixo.
  //
  // ⭐ Aconteceu em 2026-08-20: o objeto de erro do executor chegou aqui como
  // "descrição da base" e o A2 o descreveu como se fosse a planilha. Sem
  // colunas reais não há reconhecimento possível — e chamar o modelo assim
  // gasta token para produzir texto que só confunde quem for ler depois.
  if (!colunasReais.length) {
    console.error("[a2] descricao sem colunas — nao ha o que reconhecer");
    return {
      reconhecimento: normalizarReconhecimento(null, colunasReais),
      digital,
      cacheHit: false,
    };
  }

  const guardado = await buscar(cliente, datasetId, digital);
  if (guardado) {
    return {
      reconhecimento: normalizarReconhecimento(guardado, colunasReais),
      digital,
      cacheHit: true,
    };
  }

  const llm = await chamar({
    papel: "reconhecedor",
    sistema: PROMPT_RECONHECEDOR,
    prompt: `Descrição estrutural da base:\n${JSON.stringify(metadados)}`,
    json: true,
    temperatura: 0,
  });

  if (!llm.ok) {
    // ⚠️ Sem reconhecimento não há o que cachear e não há o que entregar ao A3.
    // Devolve vazio em vez de lançar: quem decide se dá para seguir é o
    // chamador, que sabe se existe caminho legado para cair.
    console.error("[a2] reconhecedor falhou:", llm.erro?.codigo);
    return {
      reconhecimento: normalizarReconhecimento(null, colunasReais),
      digital,
      cacheHit: false,
      llm,
    };
  }

  let bruto: unknown = null;
  try {
    bruto = parseGeminiJson(llm.texto);
  } catch {
    console.error("[a2] resposta nao parseou:", llm.texto.slice(0, 200));
  }

  const reconhecimento = normalizarReconhecimento(bruto, colunasReais);

  // ⚠️ Não cacheia reconhecimento vazio. Uma falha de parse gravada viraria
  // cache permanente do erro: toda pergunta seguinte naquela base acertaria o
  // cache e receberia nada, sem nunca tentar de novo. É o modo de falha mais
  // caro que um cache pode ter — silencioso e definitivo.
  let erroDeCache: string | undefined;
  if (Object.keys(reconhecimento.colunas).length > 0) {
    erroDeCache = await guardar(cliente, datasetId, digital, reconhecimento, llm);
  }

  return { reconhecimento, digital, cacheHit: false, llm, erroDeCache };
}

async function buscar(
  cliente: ClienteDeCache,
  datasetId: string,
  digital: string,
): Promise<unknown | null> {
  try {
    const { data, error } = await cliente
      .from("plum_reconhecimento")
      .select("reconhecimento")
      .eq("dataset_id", datasetId)
      .eq("digital_dicionario", digital)
      .maybeSingle();

    // ⚠️ Ler o `error` não é zelo. O supabase-js NÃO lança em erro de banco: ele
    // devolve `{data: null, error}`. Destruturar só o `data` — como este código
    // fazia até 2026-08-21 — transforma "permission denied" em "não achei no
    // cache", que é indistinguível do caso normal. Foi metade do motivo de a
    // falha de GRANT ter passado despercebida: nem a escrita nem a LEITURA
    // avisavam.
    if (error) {
      console.error("[a2] leitura do cache falhou:", error.message);
      return null;
    }
    return data?.reconhecimento ?? null;
  } catch (e) {
    // Cache indisponível não pode derrubar a pergunta: segue e chama o A2.
    console.error("[a2] leitura do cache falhou:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function guardar(
  cliente: ClienteDeCache,
  datasetId: string,
  digital: string,
  reconhecimento: Reconhecimento,
  llm: RespostaLLM,
): Promise<string | undefined> {
  try {
    const { error } = await cliente.from("plum_reconhecimento").upsert(
      {
        dataset_id: datasetId,
        digital_dicionario: digital,
        reconhecimento,
        modelo: llm.modelo,
        tokens_entrada: llm.tokens.entrada,
        tokens_saida: llm.tokens.saida,
      },
      // Duas perguntas simultâneas na mesma base geram duas chamadas ao A2
      // (aceitável, acontece uma vez por base) mas nunca duas linhas.
      { onConflict: "dataset_id,digital_dicionario" },
    );
    if (error) {
      console.error("[a2] gravacao do cache falhou:", error.message);
      return error.message;
    }
  } catch (e) {
    // Mesma postura do log: o cache é otimização, nunca motivo de falha. Mas o
    // chamador recebe a mensagem para registrá-la — silêncio aqui já custou uma
    // sessão de investigação.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[a2] excecao ao gravar cache:", msg);
    return msg;
  }
}
