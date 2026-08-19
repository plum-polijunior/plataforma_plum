/**
 * Testes do registro em `plum_logs`.
 *
 * ⭐ **O que estes testes existem para provar: o log nunca derruba a pergunta.**
 *
 * Esse caminho — o de falha — não roda em operação normal. Ele só executa
 * quando o banco recusa o insert, e portanto é exatamente o tipo de garantia
 * que apodrece sem ninguém notar: `registrar()` é chamado em toda pergunta do
 * chat, então uma exceção não engolida aqui não degrada a observabilidade, tira
 * o chat do ar.
 *
 * O manual da Etapa 0 tentava verificar isso à mão, revogando o INSERT dentro
 * de uma transação. Não funcionava (REVOKE não commitado é invisível para a
 * conexão da Edge Function) e, mesmo que funcionasse, seria uma verificação
 * feita uma vez. Aqui roda a cada `npm test`.
 *
 * O segundo grupo cobre o mapeamento camelCase → snake_case, onde um nome
 * errado não dá erro: vira coluna nula, silenciosamente.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type ClienteDeLog,
  criarRegistradorCom,
  extrairUsoDeTokens,
  type LinhaDeLog,
  montarLinha,
} from "./log_core.ts";

const TURNO = {
  sessaoId: "11111111-1111-1111-1111-111111111111",
  turnoId: "22222222-2222-2222-2222-222222222222",
  datasetId: "33333333-3333-3333-3333-333333333333",
};

const LINHA: LinhaDeLog = { etapa: "guard", status: "ok" };

/** Client que se comporta como o supabase-js: devolve `{ error }`, não lança. */
function clienteQueDevolveErro(mensagem: string): ClienteDeLog {
  return {
    from: () => ({ insert: async () => ({ error: { message: mensagem } }) }),
  };
}

/** Client que estoura — rede caída, JWT expirado, objeto malformado. */
function clienteQueLanca(erro: unknown): ClienteDeLog {
  return {
    from: () => ({
      insert: async () => {
        throw erro;
      },
    }),
  };
}

describe("o log nunca derruba a pergunta", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("engole erro devolvido pelo banco (INSERT revogado, RLS, CHECK)", async () => {
    const registrar = criarRegistradorCom(
      clienteQueDevolveErro('permission denied for table plum_logs'),
      TURNO,
    );

    await expect(registrar(LINHA)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      "[log] insert falhou:",
      "permission denied for table plum_logs",
    );
  });

  it("engole exceção lançada pelo client (rede, JWT expirado)", async () => {
    const registrar = criarRegistradorCom(
      clienteQueLanca(new Error("fetch failed")),
      TURNO,
    );

    await expect(registrar(LINHA)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("[log] excecao engolida:", "fetch failed");
  });

  it("engole o que for lançado, mesmo não sendo Error", async () => {
    // `throw "string"` e `throw {}` acontecem em código de terceiro. Um
    // `e.message` cru aqui viraria um TypeError DENTRO do catch — e aí a
    // exceção escaparia mesmo com try/catch.
    const registrar = criarRegistradorCom(clienteQueLanca("caiu"), TURNO);

    await expect(registrar(LINHA)).resolves.toBeUndefined();
  });

  it("vira no-op silencioso sem client, sem tocar em nada", async () => {
    const registrar = criarRegistradorCom(null, TURNO);

    await expect(registrar(LINHA)).resolves.toBeUndefined();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("grava de fato quando o client funciona — o no-op não é o comportamento padrão", async () => {
    // Sem este caso, os quatro acima passariam com uma implementação que nunca
    // escreve nada.
    const inserido: Record<string, unknown>[] = [];
    const registrar = criarRegistradorCom(
      { from: () => ({ insert: async (l) => (inserido.push(l), { error: null }) }) },
      TURNO,
    );

    await registrar(LINHA);
    expect(inserido).toHaveLength(1);
    expect(inserido[0].turno_id).toBe(TURNO.turnoId);
  });
});

describe("montarLinha", () => {
  it("mapeia os campos para as colunas da tabela", () => {
    const linha = montarLinha(TURNO, "legado", {
      etapa: "plan_query",
      status: "ok",
      tokensEntrada: 1200,
      tokensSaida: 340,
      latenciaMs: 812,
      cacheHitA2: true,
      respostaAgente: { from: "producao" },
    });

    expect(linha).toMatchObject({
      sessao_id: TURNO.sessaoId,
      turno_id: TURNO.turnoId,
      dataset_id: TURNO.datasetId,
      caminho: "legado",
      etapa: "plan_query",
      status: "ok",
      tokens_entrada: 1200,
      tokens_saida: 340,
      latencia_ms: 812,
      cache_hit_a2: true,
      resposta_agente: { from: "producao" },
    });
  });

  it("preenche com null o que não veio, e nunca com undefined", () => {
    // `undefined` não vira NULL no PostgREST: vira campo ausente, e a coluna
    // pega o DEFAULT. Para `resposta_agente` daria no mesmo; para uma coluna
    // com default não-nulo, não daria.
    const linha = montarLinha(TURNO, "ad_hoc", LINHA);

    for (const chave of ["codigo_erro", "modelo", "tokens_entrada", "resposta_agente"]) {
      expect(linha[chave], chave).toBeNull();
    }
    expect(Object.values(linha)).not.toContain(undefined);
  });

  it("não carrega a pergunta do usuário — só o que o chamador entregou", () => {
    // Guarda contra alguém acrescentar um campo de texto livre vindo do
    // usuário. A pergunta mora em `plum_chat.content`; duplicá-la aqui seria
    // uma segunda cópia com outra retenção e outra policy.
    const chaves = Object.keys(montarLinha(TURNO, "legado", LINHA));
    expect(chaves).not.toContain("pergunta");
    expect(chaves).not.toContain("prompt");
  });
});

describe("extrairUsoDeTokens", () => {
  it("lê o usageMetadata do Gemini", () => {
    expect(
      extrairUsoDeTokens({
        usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120 },
      }),
    ).toEqual({ entrada: 900, saida: 120 });
  });

  it("devolve null em vez de estourar quando o formato muda", () => {
    // Formato de terceiro: pode mudar sem aviso, e nenhuma mudança dele pode
    // derrubar uma resposta que já foi gerada.
    for (const corpo of [null, undefined, {}, { usageMetadata: {} }, "texto", 42]) {
      expect(extrairUsoDeTokens(corpo)).toEqual({ entrada: null, saida: null });
    }
  });
});
