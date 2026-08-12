/**
 * De que lado do ponto o rótulo é desenhado.
 *
 * A regra dos EXTREMOS foi pedida em revisão visual e é geométrica: o rótulo vai
 * para o lado OPOSTO ao que a linha ocupa, para nunca ficar sobre o traço. Vive
 * aqui porque a simetria entre primeiro e último ponto é contraintuitiva e é
 * exatamente o tipo de coisa que alguém "corrige" invertendo um dos dois.
 *
 * Em `src/lib/` porque o `vitest.config.ts` só coleta `supabase/functions/**` e
 * `src/lib/**`.
 */

import { describe, expect, it } from "vitest";
import {
  ladoAlternado,
  ladoDoExtremo,
} from "../components/dashboard/rotulos";

describe("ladoDoExtremo — primeiro ponto", () => {
  it("gráfico SOBE a partir do primeiro ponto → rótulo ABAIXO", () => {
    // A linha sai subindo, então o traço ocupa o espaço acima do ponto.
    expect(ladoDoExtremo(100, 150)).toBe("abaixo");
  });

  it("gráfico DESCE a partir do primeiro ponto → rótulo ACIMA", () => {
    expect(ladoDoExtremo(150, 100)).toBe("acima");
  });
});

describe("ladoDoExtremo — último ponto, MESMA fórmula", () => {
  it("linha chegou DESCENDO (penúltimo maior) → rótulo ABAIXO", () => {
    // ⭐ A simetria é o ponto: o que decide é onde está o segmento vizinho, e
    // "vizinho maior" significa "segmento acima do ponto" nos DOIS extremos.
    expect(ladoDoExtremo(100, 150)).toBe("abaixo");
  });

  it("linha chegou SUBINDO (penúltimo menor) → rótulo ACIMA", () => {
    expect(ladoDoExtremo(150, 100)).toBe("acima");
  });
});

describe("ladoDoExtremo — casos de borda", () => {
  it("valores iguais ficam ACIMA, a preferência geral", () => {
    expect(ladoDoExtremo(100, 100)).toBe("acima");
  });

  it("funciona com valores negativos", () => {
    // Prejuízo diminuindo: -100 -> -50 é a linha SUBINDO.
    expect(ladoDoExtremo(-100, -50)).toBe("abaixo");
    expect(ladoDoExtremo(-50, -100)).toBe("acima");
  });

  it("⚠️ NÃO é 'primeiro sempre acima, último sempre abaixo'", () => {
    // Este teste existe para quebrar a simplificação errada. Se alguém trocar a
    // implementação por uma regra fixa por posição, os dois casos abaixo passam
    // a dar o mesmo resultado para o mesmo par de valores.
    expect(ladoDoExtremo(100, 150)).not.toBe(ladoDoExtremo(150, 100));
  });
});

describe("ladoAlternado — pontos do meio", () => {
  it("alterna pela ORDEM entre os rótulos exibidos", () => {
    expect(ladoAlternado(0)).toBe("acima");
    expect(ladoAlternado(1)).toBe("abaixo");
    expect(ladoAlternado(2)).toBe("acima");
    expect(ladoAlternado(3)).toBe("abaixo");
  });

  it("⚠️ vizinhos na ordem nunca caem do mesmo lado", () => {
    // É a propriedade que dobra o espaço horizontal por rótulo. Se ela cair, a
    // densidade adaptável volta a amontoar texto.
    for (let ordem = 0; ordem < 10; ordem++) {
      expect(ladoAlternado(ordem)).not.toBe(ladoAlternado(ordem + 1));
    }
  });
});
