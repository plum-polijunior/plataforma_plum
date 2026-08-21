/**
 * Testes do orçamento de linhas brutas.
 *
 * ⭐ **O erro que este módulo existe para impedir é o teto por pedido.** O
 * executor corta em 5 linhas por `registro`/`amostra`, e 200 pedidos de 5 linhas
 * é a base inteira sem violar teto nenhum. Se algum destes ficar vermelho, o
 * limite voltou a ser cosmético.
 */

import { describe, expect, it } from "vitest";

import {
  aprovarLote,
  calcularSaldo,
  consomeOrcamento,
  JANELA_HORAS,
  TETO_DE_LINHAS_BRUTAS,
} from "./orcamento.ts";

const CUSTO = 5;
const reg = (id: string) => ({ id, tipo: "registro" });
const agr = (id: string) => ({ id, tipo: "agregado" });

describe("saldo", () => {
  it("soma o que já foi entregue na janela", () => {
    expect(calcularSaldo([5, 5, 3])).toEqual({ gasto: 13, saldo: 187 });
  });

  it("ignora nulo e negativo em vez de estourar a conta", () => {
    // A coluna é nullable e a maioria das linhas do log tem `null` ali.
    expect(calcularSaldo([null, 5, null, -2]).gasto).toBe(5);
  });

  it("saldo nunca é negativo", () => {
    // Concorrência pode ter deixado o gasto passar do teto. Saldo negativo
    // faria a aritmética de reserva se comportar de formas estranhas.
    expect(calcularSaldo([500]).saldo).toBe(0);
  });
});

describe("aprovação do lote", () => {
  it("⭐ corta o lote quando a SOMA passa do saldo, não o pedido", () => {
    // O caso que dá nome ao módulo. Com saldo 12 e custo 5, cabem dois — o
    // terceiro é negado mesmo respeitando o teto por pedido.
    const r = aprovarLote([reg("a"), reg("b"), reg("c")], 12, CUSTO);

    expect(r.aprovados.map((p) => p.id)).toEqual(["a", "b"]);
    expect(r.negados.map((n) => n.id)).toEqual(["c"]);
    expect(r.reservado).toBe(10);
  });

  it("⭐ reserva pelo PIOR caso, antes de executar", () => {
    // Conferir depois seria conferir tarde: as linhas já teriam sido lidas da
    // planilha e devolvidas. "Estourou, mas já entreguei" não é um orçamento.
    expect(aprovarLote([reg("a")], 5, CUSTO).reservado).toBe(CUSTO);
  });

  it("nega por pedido, nunca o lote inteiro", () => {
    // A negação parcial do B07 sabe explicar o que ficou de fora; recusar tudo
    // por causa de um pedido perderia os outros de graça.
    const r = aprovarLote([agr("a"), reg("b"), agr("c")], 0, CUSTO);

    expect(r.aprovados.map((p) => p.id)).toEqual(["a", "c"]);
    expect(r.negados.map((n) => n.id)).toEqual(["b"]);
  });

  it("⭐ quem não devolve linha passa mesmo com saldo zero", () => {
    // Cobrar de `agregado` empurraria o planejador a agregar MENOS para caber —
    // o contrário do que o orçamento quer.
    const tipos = ["agregado", "serie", "metadados", "vocabulario", undefined];
    const lote = tipos.map((t, i) => ({ id: `p${i}`, tipo: t }));

    expect(aprovarLote(lote, 0, CUSTO).negados).toEqual([]);
  });

  it("o motivo da negação é frase de gente, não código", () => {
    // Ele chega ao A4 e vira texto na tela.
    const [n] = aprovarLote([reg("a")], 0, CUSTO).negados;

    expect(n.motivo).toContain("linhas detalhadas");
    expect(n.motivo).toContain(String(JANELA_HORAS));
  });

  it("lote vazio não quebra", () => {
    expect(aprovarLote([], 200, CUSTO)).toEqual({
      aprovados: [], negados: [], reservado: 0,
    });
  });
});

describe("quem consome", () => {
  it("⚠️ a lista bate com a do executor", () => {
    // Espelhada em `query_engine/linhas.py::tipos_que_consomem_orcamento`.
    // Divergir faz o executor entregar linha que o orçamento não contou.
    expect(consomeOrcamento("registro")).toBe(true);
    expect(consomeOrcamento("amostra")).toBe(true);

    for (const t of ["agregado", "serie", "metadados", "vocabulario", undefined, ""]) {
      expect(consomeOrcamento(t), String(t)).toBe(false);
    }
  });

  it("o teto é o do V7 §3", () => {
    expect(TETO_DE_LINHAS_BRUTAS).toBe(200);
  });
});
