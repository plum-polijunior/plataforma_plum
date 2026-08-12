import { describe, expect, it } from "vitest";

import {
  REPETICOES_PARA_REUSAR,
  canonicalizarPlano,
  escolherPlanoDominante,
  planoTemData,
} from "./plano-cache";

describe("canonicalizarPlano", () => {
  it("dá a mesma string para o mesmo plano com as chaves em outra ordem", () => {
    // É o caso que motiva a função existir: `plan_query` roda sem
    // `response_schema`, então a ordem das chaves do Gemini não é estável.
    const a = { from: "producao", limit: 10, select: [{ expr: { agg: "sum", col: "x" } }] };
    const b = { limit: 10, select: [{ expr: { col: "x", agg: "sum" } }], from: "producao" };
    expect(canonicalizarPlano(a)).toBe(canonicalizarPlano(b));
  });

  it("distingue planos que são de fato diferentes", () => {
    expect(canonicalizarPlano({ limit: 10 })).not.toBe(canonicalizarPlano({ limit: 20 }));
  });

  it("NÃO reordena arrays — a ordem do order_by é semântica", () => {
    const asc = { order_by: [{ col: "a", dir: "asc" }, { col: "b", dir: "asc" }] };
    const inv = { order_by: [{ col: "b", dir: "asc" }, { col: "a", dir: "asc" }] };
    expect(canonicalizarPlano(asc)).not.toBe(canonicalizarPlano(inv));
  });

  it("ordena chaves em objetos aninhados dentro de arrays", () => {
    const a = { select: [{ as: "total", expr: { agg: "sum", col: "v" } }] };
    const b = { select: [{ expr: { col: "v", agg: "sum" }, as: "total" }] };
    expect(canonicalizarPlano(a)).toBe(canonicalizarPlano(b));
  });

  it("aguenta null e tipos primitivos sem quebrar", () => {
    expect(canonicalizarPlano(null)).toBe("null");
    expect(canonicalizarPlano({ x: null, y: 1, z: "s" })).toBe('{"x":null,"y":1,"z":"s"}');
  });
});

describe("planoTemData", () => {
  it("acha data ISO no where — o caso de 'quanto faturei hoje'", () => {
    const plano = {
      from: "producao",
      where: { left: "data_venda", op: "between", right: ["2026-08-12", "2026-08-12"] },
    };
    expect(planoTemData(plano)).toBe(true);
  });

  it("acha data em formato pt-BR", () => {
    expect(planoTemData({ where: { left: "d", op: "=", right: "12/08/2026" } })).toBe(true);
  });

  it("acha data aninhada dentro de and/or", () => {
    const plano = {
      where: {
        op: "and",
        args: [
          { left: "loja", op: "=", right: "Centro" },
          { left: "data", op: ">", right: "2026-01-01" },
        ],
      },
    };
    expect(planoTemData(plano)).toBe(true);
  });

  it("acha data mesmo fora do where", () => {
    // Conservador de propósito: onde quer que a data esteja, o plano envelhece.
    expect(planoTemData({ select: [{ as: "vendas_2026-01-01" }] })).toBe(true);
  });

  it("não marca plano sem data nenhuma", () => {
    const plano = {
      from: "producao",
      target_columns: ["loja", "quantidade", "preco"],
      select: [{ expr: { agg: "sum", col: { op: "mul", args: ["quantidade", "preco"] } }, as: "receita" }],
      group_by: ["loja"],
    };
    expect(planoTemData(plano)).toBe(false);
  });

  it("não confunde número solto com data", () => {
    expect(planoTemData({ limit: 20260812 })).toBe(false);
    expect(planoTemData({ where: { left: "cep", op: "=", right: "05508030" } })).toBe(false);
  });
});

describe("escolherPlanoDominante", () => {
  const plano = { from: "producao", select: [{ expr: { agg: "count", col: "id" } }] };
  const outro = { from: "producao", select: [{ expr: { agg: "sum", col: "v" } }] };

  it("devolve o plano quando ele bate o limiar", () => {
    const historico = Array(REPETICOES_PARA_REUSAR).fill(plano);
    expect(escolherPlanoDominante(historico)).toEqual(plano);
  });

  it("não devolve nada com uma repetição a menos", () => {
    const historico = Array(REPETICOES_PARA_REUSAR - 1).fill(plano);
    expect(escolherPlanoDominante(historico)).toBeNull();
  });

  it("conta planos equivalentes com chaves fora de ordem como o mesmo", () => {
    const embaralhado = { select: [{ expr: { col: "id", agg: "count" } }], from: "producao" };
    const historico = [plano, embaralhado, plano, embaralhado, plano];
    expect(escolherPlanoDominante(historico)).not.toBeNull();
  });

  it("não atinge o limiar quando o Agente A divergiu", () => {
    // 4 iguais + 1 diferente, com limiar 5: não reusa. Divergência é sinal de
    // que o planejador não está determinístico para aquela pergunta.
    const historico = [plano, plano, plano, plano, outro];
    expect(escolherPlanoDominante(historico)).toBeNull();
  });

  it("IGNORA planos datados, mesmo repetidos além do limiar", () => {
    const datado = { where: { left: "d", op: "=", right: "2026-08-12" } };
    const historico = Array(REPETICOES_PARA_REUSAR + 3).fill(datado);
    expect(escolherPlanoDominante(historico)).toBeNull();
  });

  it("ignora nulos no histórico sem quebrar", () => {
    const historico = [null, plano, null, plano, plano, plano, plano];
    expect(escolherPlanoDominante(historico)).toEqual(plano);
  });

  it("respeita um limiar customizado", () => {
    expect(escolherPlanoDominante([plano, plano], 2)).toEqual(plano);
    expect(escolherPlanoDominante([plano], 2)).toBeNull();
  });

  it("devolve null para histórico vazio", () => {
    expect(escolherPlanoDominante([])).toBeNull();
  });
});
