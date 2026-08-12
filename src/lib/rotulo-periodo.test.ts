/**
 * `rotuloDePeriodo` — a metade do front da decisão D3 da Fase 5b.
 *
 * O executor emite ISO para poder ORDENAR como texto; a tradução para português
 * mora no front, depois da ordenação. Estes testes travam os dois lados do
 * contrato: o formato que chega e o texto que sai.
 *
 * O par do outro lado é `query_engine/tests/test_periodo.py`, que garante que o
 * executor emite exatamente estas strings — inclusive
 * `test_rotulo_ordena_cronologicamente_como_texto`, que é o motivo de o ISO
 * existir.
 */

// Vive em `src/lib/` e não ao lado do código porque o `vitest.config.ts` só
// coleta `supabase/functions/**` e `src/lib/**`. Mesmo arranjo de
// `contraste-serie.test.ts`, que testa `components/dashboard/cores.ts` daqui.
import { describe, expect, it } from "vitest";
import { rotuloDePeriodo } from "../components/dashboard/formato";

describe("rotuloDePeriodo", () => {
  it("mês: 2026-01 vira jan/2026", () => {
    expect(rotuloDePeriodo("2026-01", "month")).toBe("jan/2026");
    expect(rotuloDePeriodo("2026-12", "month")).toBe("dez/2026");
  });

  it("mês: os doze meses saem abreviados em português", () => {
    const saidas = Array.from({ length: 12 }, (_, i) =>
      rotuloDePeriodo(`2026-${String(i + 1).padStart(2, "0")}`, "month"),
    );
    expect(saidas).toEqual([
      "jan/2026", "fev/2026", "mar/2026", "abr/2026", "mai/2026", "jun/2026",
      "jul/2026", "ago/2026", "set/2026", "out/2026", "nov/2026", "dez/2026",
    ]);
  });

  it("trimestre: 2026Q1 vira 1º tri/2026", () => {
    expect(rotuloDePeriodo("2026Q1", "quarter")).toBe("1º tri/2026");
    expect(rotuloDePeriodo("2026Q4", "quarter")).toBe("4º tri/2026");
  });

  it("ano: passa igual, já está em português", () => {
    expect(rotuloDePeriodo("2026", "year")).toBe("2026");
  });

  it("semana: a segunda que abre a semana vira dd/mm/aaaa", () => {
    expect(rotuloDePeriodo("2026-01-05", "week")).toBe("05/01/2026");
    expect(rotuloDePeriodo("2026-12-28", "week")).toBe("28/12/2026");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Nunca lança, nunca inventa
  // ───────────────────────────────────────────────────────────────────────────

  it("'Sem data' atravessa intacto", () => {
    // É o rótulo que o executor usa para linha sem data (decisão D6). Ele não
    // casa com nenhum formato ISO e não pode ser mastigado.
    for (const t of ["week", "month", "quarter", "year"] as const) {
      expect(rotuloDePeriodo("Sem data", t)).toBe("Sem data");
    }
  });

  it("sem trunc, devolve o valor cru", () => {
    // Card que agrupa por categoria: o rótulo é "Loja Shopping Norte", não um
    // período, e traduzir seria corromper.
    expect(rotuloDePeriodo("Loja Shopping Norte")).toBe("Loja Shopping Norte");
    expect(rotuloDePeriodo("2026-01")).toBe("2026-01");
  });

  it("formato inesperado volta como veio, sem lançar", () => {
    // Na pior hipótese o usuário lê o ISO: feio, mas verdadeiro. Lançar aqui
    // derrubaria o card inteiro por causa de um rótulo.
    expect(rotuloDePeriodo("2026-13", "month")).toBe("2026-13"); // mês 13
    expect(rotuloDePeriodo("2026-00", "month")).toBe("2026-00"); // mês 0
    expect(rotuloDePeriodo("2026Q5", "quarter")).toBe("2026Q5"); // trimestre 5
    expect(rotuloDePeriodo("janeiro", "month")).toBe("janeiro");
    expect(rotuloDePeriodo("", "month")).toBe("");
  });

  it("a saída em português NÃO ordena — é por isso que o executor manda ISO", () => {
    // ⚠️ Este teste documenta o motivo da decisão D3, e ele é o inverso dos
    // outros: aqui o comportamento "ruim" é o esperado, e está fixado para que
    // ninguém mova a tradução para o executor achando que simplifica.
    const isoOrdenado = ["2026-01", "2026-02", "2026-03", "2026-04"];
    const ptbr = isoOrdenado.map((v) => rotuloDePeriodo(v, "month"));

    expect([...isoOrdenado].sort()).toEqual(isoOrdenado);
    // "abr/2026" vem antes de "fev/2026" no alfabeto: a linha sairia embaralhada.
    expect([...ptbr].sort()).not.toEqual(ptbr);
    expect([...ptbr].sort()[0]).toBe("abr/2026");
  });
});
