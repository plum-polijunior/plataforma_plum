import { describe, expect, it } from "vitest";

import { extrairSheetId, extrairSheetRef } from "./google-sheets";

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

// ─────────────────────────────────────────────────────────────────────────────
// extrairSheetRef — o gid da aba
//
// O gid era descartado, e por isso `datasets.google_sheet_tab` nunca saía do
// default 'Sheet1'. Em produção isso deixou as duas bases apontando para uma
// aba com gid diferente de zero enquanto o banco dizia 'Sheet1', e toda
// pergunta falhava com "Nao consegui ler a planilha agora".
// ─────────────────────────────────────────────────────────────────────────────

describe("extrairSheetRef", () => {
  const URL_REAL =
    "https://docs.google.com/spreadsheets/d/1nxcqqpm5fFSMWZsrIJ4C0qpGZQmJvp6ST4AaYCrfknA/edit?gid=991333939#gid=991333939";

  it("extrai id e gid da URL que o Google entrega de verdade", () => {
    // Esta é a URL exata da base `tabela-de-estudos.csv` em produção.
    expect(extrairSheetRef(URL_REAL)).toEqual({
      id: "1nxcqqpm5fFSMWZsrIJ4C0qpGZQmJvp6ST4AaYCrfknA",
      gid: 991333939,
    });
  });

  it("aceita o gid no fragmento, sem query", () => {
    expect(extrairSheetRef("https://docs.google.com/spreadsheets/d/1AbC_efGh-123/edit#gid=42"))
      .toEqual({ id: "1AbC_efGh-123", gid: 42 });
  });

  it("aceita o gid na query, sem fragmento", () => {
    expect(extrairSheetRef("https://docs.google.com/spreadsheets/d/1AbC_efGh-123/edit?gid=42"))
      .toEqual({ id: "1AbC_efGh-123", gid: 42 });
  });

  it("gid=0 é a primeira aba e NÃO pode virar null", () => {
    // O bug mais fácil de introduzir aqui: `gid ? gid : null` ou `if (!gid)`
    // manda a primeira aba de toda planilha para o caminho de "sem gid", que é
    // justamente o caminho que depende do nome e que a gente está consertando.
    const ref = extrairSheetRef(
      "https://docs.google.com/spreadsheets/d/1AbC_efGh-123/edit#gid=0",
    );
    expect(ref).toEqual({ id: "1AbC_efGh-123", gid: 0 });
    expect(ref?.gid).not.toBeNull();
  });

  it("URL sem gid devolve gid null, não zero", () => {
    // Confundir os dois faria uma planilha sem aba na URL ser lida como se
    // fosse a primeira aba — um palpite disfarçado de dado.
    expect(extrairSheetRef("https://docs.google.com/spreadsheets/d/1AbC_efGh-123/edit"))
      .toEqual({ id: "1AbC_efGh-123", gid: null });
  });

  it("ID colado sozinho não tem aba nenhuma", () => {
    expect(extrairSheetRef("1BxiMVs0XRA5nFMdKvBdxyz12345")).toEqual({
      id: "1BxiMVs0XRA5nFMdKvBdxyz12345",
      gid: null,
    });
  });

  it("o que não é planilha continua sendo null inteiro", () => {
    expect(extrairSheetRef("https://docs.google.com/document/d/1AbC/edit#gid=0")).toBeNull();
    expect(extrairSheetRef("")).toBeNull();
    expect(extrairSheetRef(null)).toBeNull();
  });

  it("extrairSheetId continua devolvendo exatamente o mesmo id", () => {
    // O wrapper existe para não mexer em todo chamador; se ele divergir da
    // função nova, metade do código grava um id e a outra metade outro.
    expect(extrairSheetId(URL_REAL)).toBe(extrairSheetRef(URL_REAL)?.id);
    expect(extrairSheetId("nao e planilha")).toBeNull();
  });
});
