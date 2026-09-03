import { describe, expect, it } from "vitest";

import { ehLinkPublicado, extrairSheetId, extrairSheetRef } from "./google-sheets";

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


/**
 * ⭐ **A identidade da base, e é o que o B21 passou a usar para não duplicar.**
 *
 * Estes dois blocos existem porque o `google_sheet_id` deixou de ser só um
 * parâmetro de leitura: desde o B21 ele decide se a planilha que a pessoa está
 * colando **já é** uma base cadastrada. Duas propriedades passam a importar, e
 * nenhuma das duas estava coberta:
 *
 *   1. o mesmo documento, colado de formas diferentes, dá o **mesmo** id;
 *   2. documentos diferentes dão ids **diferentes**.
 *
 * A (2) parece óbvia demais para testar. Não era: o link de "Publicar na web"
 * quebrava exatamente ela.
 */
describe("o id como identidade de base (B21)", () => {
  const ID = "1BxiMVs0XRA5nFMdKvBdxyz12345";

  it("os formatos de link do MESMO documento dão o mesmo id", () => {
    const formas = [
      `https://docs.google.com/spreadsheets/d/${ID}/edit`,
      `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`,
      `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`,
      `https://docs.google.com/spreadsheets/d/${ID}/edit?gid=991333939#gid=991333939`,
      `https://docs.google.com/spreadsheets/d/${ID}`,
      ID,
    ];

    // ⭐ É esta igualdade que torna desnecessário comparar o CONJUNTO DE
    // COLUNAS para detectar base repetida — a heurística que o B13 abandonou
    // de propósito, porque duas planilhas diferentes com as mesmas colunas se
    // confundiam.
    for (const forma of formas) {
      expect(extrairSheetRef(forma)?.id).toBe(ID);
    }
  });

  it("⛔ o link de 'Publicar na web' não vira id: TODA planilha publicada dava 'e'", () => {
    // A regex do id para no primeiro `/`, então `/spreadsheets/d/e/2PACX-...`
    // devolvia `{ id: "e" }`. Enquanto o id era só parâmetro de leitura, isso
    // era uma falha isolada; com ele virando chave de identidade, DUAS
    // planilhas publicadas diferentes viravam "a mesma base".
    const a = "https://docs.google.com/spreadsheets/d/e/2PACX-1vAAAAAAAAAAAA/pubhtml";
    const b = "https://docs.google.com/spreadsheets/d/e/2PACX-1vBBBBBBBBBBBB/pubhtml";

    expect(extrairSheetRef(a)).toBeNull();
    expect(extrairSheetRef(b)).toBeNull();
    expect(extrairSheetId(a)).toBeNull();
  });

  it("o link publicado é reconhecível, para a tela dar a mensagem certa", () => {
    // Recusar não basta: sem distinguir, a pessoa recebe "copie o endereço da
    // barra" — exatamente o que ela acha que fez.
    expect(ehLinkPublicado(
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vAAA/pubhtml",
    )).toBe(true);
    expect(ehLinkPublicado(
      `https://docs.google.com/spreadsheets/d/${ID}/edit`,
    )).toBe(false);
    expect(ehLinkPublicado("qualquer coisa")).toBe(false);
    expect(ehLinkPublicado(null)).toBe(false);
  });

  it("uma planilha cujo id COMEÇA com 'e' continua passando", () => {
    // ⚠️ A guarda é `/d/e/` com barra depois, não `/d/e`. Sem a barra, todo id
    // iniciado por `e` seria recusado — e ids são atribuídos pelo Google, então
    // isso aconteceria com uma base real, sem aviso.
    const idComE = "eBxiMVs0XRA5nFMdKvBdxyz12345";
    expect(extrairSheetRef(
      `https://docs.google.com/spreadsheets/d/${idComE}/edit`,
    )?.id).toBe(idComE);
  });
});
