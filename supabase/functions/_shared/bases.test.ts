/**
 * O nome da base e a resolução do `from`.
 *
 * ⚠️ **A tabela de `resolverBase` é a RÉPLICA da de `resolver_nome_da_tabela` em
 * `query_engine/pandas_executor.py`**, testada lá em `tests/test_multibase.py`.
 * Não há como compartilhar código entre Deno e Python (D-017); a defesa é os dois
 * lados terem os mesmos casos. Mudou um, muda o outro.
 */

import { describe, expect, it } from "vitest";

import {
  BASE_PADRAO,
  nomeDaBase,
  nomearBases,
  resolverBase,
} from "./bases.ts";

describe("nomeDaBase", () => {
  it("vira snake_case sem acento", () => {
    expect(nomeDaBase({ id: "x", name: "Vendas Região Sul" })).toBe("vendas_regiao_sul");
  });

  it("colapsa pontuação e apara as bordas", () => {
    expect(nomeDaBase({ id: "x", name: " -- Vendas / 2026 -- " })).toBe("vendas_2026");
  });

  it("cai no id quando não há nome", () => {
    const n = nomeDaBase({ id: "3bf8596f-7a4d-4b91-8fd5-bdb78a512251", name: null });
    expect(n).toBe("b_3bf8596f7a4d");
  });

  it("⚠️ nome que normaliza para vazio também cai no id", () => {
    // Só emoji ou só pontuação daria string vazia, e um `from: ""` casaria com
    // nada — o turno morreria por causa do nome que alguém deu à base.
    expect(nomeDaBase({ id: "abcdef123456", name: "🎉 —— !!" })).toBe("b_abcdef123456");
  });

  it("⚠️ o fallback começa com letra, nunca com dígito", () => {
    // Identificador começando com número faz o modelo "consertar" o nome no
    // `from`, e uuid começa com dígito com frequência.
    expect(nomeDaBase({ id: "9f000000-0000-0000-0000-000000000000" })).toMatch(/^b_/);
  });

  it("é estável: o mesmo dataset dá o mesmo nome", () => {
    const ds = { id: "x", name: "Estoque" };
    expect(nomeDaBase(ds)).toBe(nomeDaBase(ds));
  });
});

describe("nomearBases", () => {
  it("desempata nomes que normalizam igual", () => {
    // O executor recusa payload com nome repetido (400); desempatar aqui é
    // melhor que perder o turno por detalhe de cadastro.
    const m = nomearBases([
      { id: "1", name: "Vendas 2026" },
      { id: "2", name: "vendas-2026" },
    ]);
    expect([...m.keys()]).toEqual(["vendas_2026", "vendas_2026_2"]);
  });

  it("preserva a ordem recebida", () => {
    const m = nomearBases([
      { id: "1", name: "Zebra" },
      { id: "2", name: "Alfa" },
    ]);
    expect([...m.keys()]).toEqual(["zebra", "alfa"]);
  });

  it("cada nome aponta para o dataset certo", () => {
    const m = nomearBases([
      { id: "1", name: "Vendas" },
      { id: "2", name: "RH" },
    ]);
    expect(m.get("vendas")?.id).toBe("1");
    expect(m.get("rh")?.id).toBe("2");
  });
});

describe("resolverBase — a réplica da regra do Python", () => {
  it("nome exato ganha", () => {
    expect(resolverBase({ from: "vendas" }, ["vendas", "rh"]))
      .toEqual({ nome: "vendas", viaPonte: false });
  });

  it("uma base só aceita `from` ausente", () => {
    expect(resolverBase({}, ["qualquer_nome"]))
      .toEqual({ nome: "qualquer_nome", viaPonte: true });
  });

  it("⭐ uma base só aceita o apelido `producao`", () => {
    // O card salvo diz "producao", a base real tem outro nome, e há uma só.
    expect(resolverBase({ from: BASE_PADRAO }, ["vendas"]))
      .toEqual({ nome: "vendas", viaPonte: true });
  });

  it("⛔ com duas bases o apelido NÃO vale", () => {
    // Adivinhar devolveria o número de uma base com o rótulo de outra — e
    // autorizaria contra o `allowed_columns` da errada.
    expect(resolverBase({ from: BASE_PADRAO }, ["vendas", "rh"])).toBeNull();
  });

  it("nome inexistente devolve null em vez de levantar", () => {
    // Quem chama nega AQUELE pedido; os outros do lote seguem.
    expect(resolverBase({ from: "estoque" }, ["vendas", "rh"])).toBeNull();
  });

  it("tolera espaço em volta do nome", () => {
    expect(resolverBase({ from: "  vendas  " }, ["vendas"])?.nome).toBe("vendas");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["string", "vendas"],
    ["array", ["vendas"]],
    ["from numérico", { from: 7 }],
  ])("plano inválido (%s) não levanta", (_r, plano) => {
    expect(() => resolverBase(plano, ["vendas", "rh"])).not.toThrow();
  });

  it("⚠️ plano inválido com UMA base cai na ponte", () => {
    // `from` que não é string é tratado como ausente — e com uma base só, isso
    // é o caso legado, não erro.
    expect(resolverBase({ from: 7 }, ["vendas"])?.nome).toBe("vendas");
  });

  it("sem base nenhuma devolve null", () => {
    expect(resolverBase({ from: "vendas" }, [])).toBeNull();
  });
});
