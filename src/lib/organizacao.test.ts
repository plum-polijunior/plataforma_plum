import { describe, expect, it } from "vitest";

import { dominioTemFormatoValido, normalizarDominio } from "./organizacao";

/**
 * O contrato que estes testes protegem: a saída de `normalizarDominio` tem de
 * ser exatamente o que `resolve_org_from_identity` procura no login
 * (`lower(btrim(split_part(email,'@',2)))`, busca por igualdade). Um domínio
 * cadastrado fora desse formato fica na tabela e nunca casa com ninguém — sem
 * erro nenhum, o que é o pior tipo de falha aqui.
 */
describe("normalizarDominio", () => {
  it("deixa passar o que já está certo", () => {
    expect(normalizarDominio("empresa.com.br")).toBe("empresa.com.br");
  });

  it("baixa a caixa e apara os espaços", () => {
    expect(normalizarDominio("  Empresa.COM.BR  ")).toBe("empresa.com.br");
  });

  it("extrai o domínio do e-mail inteiro colado", () => {
    expect(normalizarDominio("bernardo@polijunior.com.br")).toBe("polijunior.com.br");
  });

  it("aceita o @ solto na frente", () => {
    expect(normalizarDominio("@empresa.com")).toBe("empresa.com");
  });

  it("tira o esquema da URL", () => {
    expect(normalizarDominio("https://empresa.com")).toBe("empresa.com");
    expect(normalizarDominio("http://empresa.com")).toBe("empresa.com");
  });

  it("tira o www", () => {
    expect(normalizarDominio("www.empresa.com")).toBe("empresa.com");
  });

  it("tira caminho e barra final", () => {
    expect(normalizarDominio("https://www.empresa.com/sobre")).toBe("empresa.com");
    expect(normalizarDominio("empresa.com/")).toBe("empresa.com");
  });

  it("resolve a URL completa que alguém cola da barra do navegador", () => {
    expect(normalizarDominio("https://www.Empresa.COM.br/time/ ")).toBe("empresa.com.br");
  });

  it("não confunde subdomínio com www no meio", () => {
    expect(normalizarDominio("www.sub.empresa.com")).toBe("sub.empresa.com");
    expect(normalizarDominio("mail.empresa.com")).toBe("mail.empresa.com");
  });
});

describe("dominioTemFormatoValido", () => {
  it("aceita domínio comum e composto", () => {
    expect(dominioTemFormatoValido("empresa.com")).toBe(true);
    expect(dominioTemFormatoValido("empresa.com.br")).toBe(true);
    expect(dominioTemFormatoValido("sub.empresa.com.br")).toBe(true);
    expect(dominioTemFormatoValido("empresa-teste.com")).toBe(true);
  });

  it("recusa o que não tem TLD", () => {
    expect(dominioTemFormatoValido("empresa")).toBe(false);
  });

  it("recusa vazio e espaço", () => {
    expect(dominioTemFormatoValido("")).toBe(false);
    expect(dominioTemFormatoValido("empresa .com")).toBe(false);
  });

  it("recusa hífen nas pontas de um rótulo", () => {
    expect(dominioTemFormatoValido("-empresa.com")).toBe(false);
    expect(dominioTemFormatoValido("empresa-.com")).toBe(false);
  });

  it("recusa o que sobrou de uma normalização malfeita", () => {
    // Se um destes passar, é sinal de que `normalizarDominio` não rodou antes.
    expect(dominioTemFormatoValido("https://empresa.com")).toBe(false);
    expect(dominioTemFormatoValido("alguem@empresa.com")).toBe(false);
    expect(dominioTemFormatoValido("Empresa.com")).toBe(false);
  });

  it("recusa domínio absurdamente longo", () => {
    expect(dominioTemFormatoValido("a".repeat(250) + ".com")).toBe(false);
  });
});
