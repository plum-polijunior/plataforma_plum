/**
 * Testes de `dataDeHoje`.
 *
 * ⭐ **O caso que existe por causa de um bug real é o das 21h.** O Brasil está
 * em UTC-3, então das 21h à meia-noite o `toISOString()` — que era o que os dois
 * planejadores usavam — já devolve o dia SEGUINTE. O chat filtrava amanha e
 * respondia zero para "quanto vendi hoje", nas ultimas tres horas de cada dia.
 * Zero parece um fato.
 */

import { describe, expect, it } from "vitest";

import { dataDeHoje } from "./hoje.ts";

describe("dataDeHoje", () => {
  it("⭐ as 21h30 de Sao Paulo ainda e o mesmo dia, nao o seguinte", () => {
    // 2026-08-26T00:30:00Z e 2026-08-25T21:30 em Sao Paulo.
    const noite = new Date("2026-08-26T00:30:00Z");

    expect(dataDeHoje(noite)).toBe("2026-08-25");
    // O que o codigo fazia antes, e que este teste existe para nao voltar:
    expect(noite.toISOString().slice(0, 10)).toBe("2026-08-26");
  });

  it("de manha os dois coincidem", () => {
    const manha = new Date("2026-08-25T13:00:00Z"); // 10h em Sao Paulo
    expect(dataDeHoje(manha)).toBe("2026-08-25");
  });

  it("devolve YYYY-MM-DD, que e o que o executor entende", () => {
    // `pt-BR` daria "25/08/2026", que o `where` do plano nao aceita.
    expect(dataDeHoje(new Date("2026-01-05T15:00:00Z"))).toBe("2026-01-05");
    expect(dataDeHoje(new Date("2026-12-31T15:00:00Z"))).toBe("2026-12-31");
  });

  it("vira o ano na hora certa", () => {
    // 2027-01-01T02:00:00Z ainda e 2026-12-31 23h em Sao Paulo.
    expect(dataDeHoje(new Date("2027-01-01T02:00:00Z"))).toBe("2026-12-31");
    expect(dataDeHoje(new Date("2027-01-01T04:00:00Z"))).toBe("2027-01-01");
  });
});
