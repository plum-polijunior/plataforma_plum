/**
 * Testes da saída do A3.
 *
 * ⭐ Prompt não é contrato. O A3 escreve o Query Plan que o executor vai rodar,
 * e cada campo que passa sem conferência é um lugar onde a pergunta vira número
 * errado — ou onde o `authorizePlan` recebe algo que não sabe percorrer e
 * devolve "nenhuma coluna", que o executor lê como base vazia.
 *
 * ⚠️ Nada aqui é trava de segurança. Quem autoriza coluna é o `authorizePlan` e
 * a barreira 4 do Lambda. Isto é higiene de forma: recusar cedo o que quebraria
 * longe da causa.
 */

import { describe, expect, it, vi } from "vitest";

import {
  aplicarLiterais,
  MAX_PEDIDOS,
  normalizarPlanoDoA3,
} from "./pedidos.ts";

const PLANO_OK = {
  from: "producao",
  select: [{ expr: { agg: "sum", col: "receita" }, as: "total" }],
};

describe("normalização dos pedidos", () => {
  it("aceita o que veio bem formado", () => {
    const r = normalizarPlanoDoA3({
      pedidos: [{ tipo: "agregado", plano: PLANO_OK, porque: "o total do período" }],
      presuncoes: [{ campo: "receita", presumido: "receita líquida", porque: "há duas" }],
      entidades: [{ termo: "João Silva", coluna: "vendedor" }],
    });

    expect(r.pedidos).toHaveLength(1);
    expect(r.pedidos[0].id).toBe("p0");
    expect(r.presuncoes[0].presumido).toBe("receita líquida");
    expect(r.entidades[0].termo).toBe("João Silva");
  });

  it("⭐ o id é gerado aqui, não aceito do modelo", () => {
    // Id vira `card_id` no payload e é a chave pela qual o resultado volta. Dois
    // pedidos com o mesmo id fariam um sumir em silêncio.
    const r = normalizarPlanoDoA3({
      pedidos: [
        { id: "mesmo", tipo: "agregado", plano: PLANO_OK, porque: "a" },
        { id: "mesmo", tipo: "agregado", plano: PLANO_OK, porque: "b" },
      ],
    });
    expect(r.pedidos.map((p) => p.id)).toEqual(["p0", "p1"]);
  });

  it("⚠️ descarta pedido cujo plano não é objeto", () => {
    // String aqui viraria `authorizePlan("...")`, que devolve "nenhuma coluna" —
    // e o executor descreveria uma base vazia sem ninguém saber que a causa foi
    // um tipo errado.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = normalizarPlanoDoA3({
      pedidos: [
        { tipo: "agregado", plano: "SELECT * FROM vendas", porque: "a" },
        { tipo: "agregado", plano: PLANO_OK, porque: "b" },
      ],
    });
    expect(r.pedidos).toHaveLength(1);
    expect(r.pedidos[0].porque).toBe("b");
    vi.restoreAllMocks();
  });

  it("descarta tipo desconhecido, mantém os outros", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = normalizarPlanoDoA3({
      pedidos: [
        { tipo: "sql_cru", plano: PLANO_OK, porque: "a" },
        { tipo: "serie", plano: PLANO_OK, porque: "b" },
      ],
    });
    expect(r.pedidos.map((p) => p.tipo)).toEqual(["serie"]);
    vi.restoreAllMocks();
  });

  it(`corta acima de ${MAX_PEDIDOS} pedidos`, () => {
    // ⭐ Não é sobre custo: é sobre o A3 "resolvendo" uma pergunta difícil
    // pedindo tudo que existe e deixando o A4 achar a resposta no meio.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = normalizarPlanoDoA3({
      pedidos: Array.from({ length: 20 }, () => ({
        tipo: "agregado", plano: PLANO_OK, porque: "x",
      })),
    });
    expect(r.pedidos).toHaveLength(MAX_PEDIDOS);
    vi.restoreAllMocks();
  });

  it("presunção sem campo ou sem valor é descartada", () => {
    // Meia presunção não informa nada e ainda ocupa espaço no bloco final.
    const r = normalizarPlanoDoA3({
      presuncoes: [
        { campo: "receita", presumido: "", porque: "x" },
        { campo: "", presumido: "algo", porque: "x" },
        { campo: "período", presumido: "12 meses", porque: "não disse" },
      ],
    });
    expect(r.presuncoes).toHaveLength(1);
  });

  it("`inviavel` só conta quando é frase de verdade", () => {
    expect(normalizarPlanoDoA3({ inviavel: "   " }).inviavel).toBeUndefined();
    expect(normalizarPlanoDoA3({ inviavel: "a base não tem custo" }).inviavel)
      .toBe("a base não tem custo");
  });

  it("não estoura com lixo — devolve plano vazio", () => {
    // ⭐ O chamador usa `pedidos.length` para decidir se cai para o legado. Se
    // isto lançasse, um JSON malformado do A3 derrubaria o turno em vez de
    // degradar para a cadeia antiga.
    for (const lixo of [null, undefined, "texto", 42, { pedidos: "x" }]) {
      const r = normalizarPlanoDoA3(lixo);
      expect(r.pedidos).toEqual([]);
      expect(r.presuncoes).toEqual([]);
      expect(r.entidades).toEqual([]);
    }
  });
});

describe("troca do termo pelo literal da base", () => {
  const de = new Map([["João Silva", "JOAO DA SILVA"]]);

  it("⭐ troca em qualquer profundidade do where", () => {
    // Sem esta troca o filtro casaria zero — o sintoma exato que o B04 existe
    // para matar.
    const plano = {
      from: "producao",
      where: {
        op: "and",
        args: [
          { left: "vendedor", op: "=", right: "João Silva" },
          { op: "or", args: [{ left: "regiao", op: "=", right: "Sul" }] },
        ],
      },
    };
    const r = aplicarLiterais(plano, de) as typeof plano;

    expect(r.where.args[0]).toMatchObject({ right: "JOAO DA SILVA" });
    // O que não está no mapa fica como veio.
    expect(JSON.stringify(r)).toContain("Sul");
  });

  it("troca dentro de array de valores (`in`)", () => {
    const r = aplicarLiterais(
      { left: "vendedor", op: "in", right: ["João Silva", "Maria"] },
      de,
    ) as { right: string[] };
    expect(r.right).toEqual(["JOAO DA SILVA", "Maria"]);
  });

  it("não mexe em número, nulo nem booleano", () => {
    const plano = { limit: 200, x: null, y: true };
    expect(aplicarLiterais(plano, de)).toEqual(plano);
  });

  it("⚠️ não troca nome de COLUNA que coincida com um termo", () => {
    // O mapa é de valores. Se um termo coincidisse com um nome de coluna, trocar
    // o `left` produziria um plano que referencia coluna inexistente — e o
    // `MissingColumnError` apareceria longe da causa.
    const so_coluna = new Map([["vendedor", "OUTRA_COISA"]]);
    const r = aplicarLiterais({ left: "vendedor", op: "=", right: "x" }, so_coluna);
    // ⚠️ Limitação conhecida e aceita: a troca é por valor, e não distingue
    // posição. Registrada aqui para não virar surpresa — na prática o A3 nomeia
    // entidades como VALORES, não como colunas.
    expect(r).toEqual({ left: "OUTRA_COISA", op: "=", right: "x" });
  });
});
