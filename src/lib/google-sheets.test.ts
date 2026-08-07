import { describe, expect, it } from "vitest";

import { extrairSheetId } from "./google-sheets";

describe("extrairSheetId", () => {
  it("extrai da URL que o Google entrega ao clicar em Compartilhar", () => {
    expect(
      extrairSheetId(
        "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBd/edit#gid=0",
      ),
    ).toBe("1BxiMVs0XRA5nFMdKvBd");
  });

  it("funciona sem o sufixo /edit", () => {
    expect(
      extrairSheetId("https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBd"),
    ).toBe("1BxiMVs0XRA5nFMdKvBd");
  });

  it("aceita ID com hífen e underscore", () => {
    expect(
      extrairSheetId("https://docs.google.com/spreadsheets/d/1a-b_c2D3e4F5g6H7i8J/edit"),
    ).toBe("1a-b_c2D3e4F5g6H7i8J");
  });

  it("aceita o ID colado sozinho, sem URL em volta", () => {
    expect(extrairSheetId("1BxiMVs0XRA5nFMdKvBdxyz12345")).toBe(
      "1BxiMVs0XRA5nFMdKvBdxyz12345",
    );
  });

  it("ignora espaço em volta", () => {
    expect(
      extrairSheetId("  https://docs.google.com/spreadsheets/d/1AbC_efGh-123/edit  "),
    ).toBe("1AbC_efGh-123");
  });

  it("devolve null para o que não é planilha", () => {
    // Cada um destes gravaria uma base quebrada se passasse.
    expect(extrairSheetId("https://docs.google.com/document/d/1AbC/edit")).toBeNull();
    expect(extrairSheetId("https://example.com")).toBeNull();
    expect(extrairSheetId("minha planilha")).toBeNull();
    expect(extrairSheetId("")).toBeNull();
    expect(extrairSheetId(null)).toBeNull();
    expect(extrairSheetId(undefined)).toBeNull();
  });

  it("não confunde ID curto demais com ID válido", () => {
    expect(extrairSheetId("abc123")).toBeNull();
  });
});
