/**
 * Variação entre períodos: o número, o sinal e a COR.
 *
 * A parte que mais importa aqui é `leituraDoDelta`, e não a aritmética: a regra
 * de cor do `DESIGN.md` §7 é contraintuitiva de propósito (num card de custo,
 * subir é vermelho) e é o tipo de coisa que alguém "simplifica" para
 * `subiu ? verde : vermelho` sem perceber o que perdeu.
 *
 * Vive em `src/lib/` porque o `vitest.config.ts` só coleta
 * `supabase/functions/**` e `src/lib/**`. Mesmo arranjo de
 * `contraste-serie.test.ts` e `rotulo-periodo.test.ts`.
 */

import { describe, expect, it } from "vitest";
import {
  formatarVariacao,
  leituraDoDelta,
  sentidoDaVariacao,
  variacaoPercentual,
} from "../components/dashboard/formato";

describe("variacaoPercentual", () => {
  it("calcula a fração de aumento e de queda", () => {
    expect(variacaoPercentual(100, 135)).toBeCloseTo(0.35);
    expect(variacaoPercentual(100, 89)).toBeCloseTo(-0.11);
    expect(variacaoPercentual(200, 100)).toBeCloseTo(-0.5);
    expect(variacaoPercentual(50, 100)).toBeCloseTo(1);
  });

  it("valor igual dá zero", () => {
    expect(variacaoPercentual(100, 100)).toBe(0);
  });

  it("anterior zero devolve null, NÃO infinito nem +100%", () => {
    // ⚠️ "Saiu de 0 e foi para 100" é um começo, não um crescimento. Qualquer
    // número aqui seria inventado — e `Infinity` ainda quebraria a formatação.
    expect(variacaoPercentual(0, 100)).toBeNull();
    expect(variacaoPercentual(0, 0)).toBeNull();
    expect(variacaoPercentual(0, -50)).toBeNull();
  });

  it("⚠️ base negativa: melhorar de -100 para -50 é +50%, não -50%", () => {
    // O denominador é `Math.abs(anterior)`. Sem o `abs`, o denominador negativo
    // inverteria a fração: o prejuízo diminuiu (bom) e o sinal diria que piorou.
    // Acontece de verdade em coluna de lucro/saldo.
    expect(variacaoPercentual(-100, -50)).toBeCloseTo(0.5);
    expect(variacaoPercentual(-100, -150)).toBeCloseTo(-0.5);
    expect(variacaoPercentual(-100, 0)).toBeCloseTo(1);
  });

  it("valor ausente ou não finito devolve null", () => {
    expect(variacaoPercentual(null, 100)).toBeNull();
    expect(variacaoPercentual(100, null)).toBeNull();
    expect(variacaoPercentual(undefined, 100)).toBeNull();
    expect(variacaoPercentual(NaN, 100)).toBeNull();
    expect(variacaoPercentual(100, Infinity)).toBeNull();
  });
});

describe("formatarVariacao", () => {
  it("usa o menos tipográfico, não o hífen", () => {
    expect(formatarVariacao(-0.11)).toBe("−11%");
    expect(formatarVariacao(-0.11).startsWith("-")).toBe(false);
  });

  it("aumento leva sinal de mais explícito", () => {
    expect(formatarVariacao(0.35)).toBe("+35%");
    expect(formatarVariacao(1.15)).toBe("+115%");
  });

  it("abaixo de 1% mostra uma casa decimal; acima, nenhuma", () => {
    expect(formatarVariacao(0.073)).toBe("+7,3%");
    expect(formatarVariacao(0.35)).toBe("+35%");
  });

  it("variação desprezível é '0%' sem sinal", () => {
    // "+0%" e "−0%" leem como erro de cálculo.
    expect(formatarVariacao(0)).toBe("0%");
    expect(formatarVariacao(0.001)).toBe("0%");
    expect(formatarVariacao(-0.002)).toBe("0%");
  });

  it("null não imprime nada", () => {
    expect(formatarVariacao(null)).toBe("");
  });
});

describe("sentidoDaVariacao", () => {
  it("classifica subiu, desceu e igual", () => {
    expect(sentidoDaVariacao(0.35)).toBe("subiu");
    expect(sentidoDaVariacao(-0.11)).toBe("desceu");
    expect(sentidoDaVariacao(0)).toBe("igual");
    expect(sentidoDaVariacao(0.001)).toBe("igual");
  });

  it("null continua null", () => {
    expect(sentidoDaVariacao(null)).toBeNull();
  });
});

describe("leituraDoDelta — DESIGN.md §7", () => {
  it("card em que subir é BOM: sobe verde, desce vermelho", () => {
    expect(leituraDoDelta("subiu", true)).toBe("bom");
    expect(leituraDoDelta("desceu", true)).toBe("ruim");
  });

  it("⚠️ card em que subir é RUIM: sobe VERMELHO, desce VERDE", () => {
    // É o caso de custo, refugo, cancelamento, desconto. O DESIGN.md é
    // explícito: "um card de custo subindo 30% em verde é lido antes do número
    // e faz a pessoa seguir o dia tranquila".
    expect(leituraDoDelta("subiu", false)).toBe("ruim");
    expect(leituraDoDelta("desceu", false)).toBe("bom");
  });

  it("⚠️ null (padrão de card novo) NÃO ganha cor", () => {
    // "Cor errada é pior que ausência de cor." O triângulo e o texto carregam a
    // direção mesmo sem cor, então nada se perde em preto e branco nem sob
    // daltonismo severo.
    expect(leituraDoDelta("subiu", null)).toBe("neutro");
    expect(leituraDoDelta("desceu", null)).toBe("neutro");
    expect(leituraDoDelta("subiu", undefined)).toBe("neutro");
  });

  it("sem variação, ou variação desprezível, não ganha cor", () => {
    expect(leituraDoDelta(null, true)).toBe("neutro");
    expect(leituraDoDelta("igual", true)).toBe("neutro");
    expect(leituraDoDelta("igual", false)).toBe("neutro");
  });

  it("a cor NUNCA sai de 'subiu' sozinho — sempre do par com higher_is_better", () => {
    // Este teste existe para travar a simplificação errada. Se alguém trocar a
    // implementação por `subiu ? "bom" : "ruim"`, os dois casos abaixo passam a
    // dar o mesmo resultado e o teste quebra.
    expect(leituraDoDelta("subiu", true)).not.toBe(leituraDoDelta("subiu", false));
    expect(leituraDoDelta("desceu", true)).not.toBe(leituraDoDelta("desceu", false));
  });
});
