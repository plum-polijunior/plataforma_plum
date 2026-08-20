/**
 * Testes do resolvedor de entidade e da normalização que ele usa.
 *
 * ⭐ **O grupo que mais importa é o primeiro: a paridade com o executor.**
 *
 * O resolvedor escolhe um literal; o executor depois filtra por ele. Se as duas
 * normalizações divergirem, o resolvedor acerta e o `where` não casa — e a
 * pergunta volta **com zero**, sem erro nenhum. É a mesma dívida das duas
 * implementações de normalização de nome de coluna (D-017), mas com um modo de
 * falha pior: aquela é barulhenta ("coluna não encontrada"), esta é muda.
 *
 * A tabela de casos abaixo é espelhada em `query_engine/tests/test_privacidade.py`
 * (`test_normalizacao_bate_com_o_typescript`). ⚠️ **Mudou um lado, mude o outro
 * e os dois casos.**
 *
 * O segundo grupo é a regra que organiza o resolvedor: dois candidatos
 * plausíveis viram pergunta, nunca escolha. Escolher errado devolve um número
 * certo sobre a pessoa errada.
 */

import { describe, expect, it } from "vitest";

import { resolverEntidade, type ValorDoVocabulario } from "./entidade.ts";
import { distancia, normalizar } from "./texto.ts";

/** ⚠️ Espelhada no pytest. Mudou aqui, mude lá. */
export const CASOS_DE_NORMALIZACAO: [string, string][] = [
  ["João Silva", "JOAO SILVA"],
  ["  joao silva  ", "JOAO SILVA"],
  ["JOÃO DA SILVA", "JOAO DA SILVA"],
  ["ação", "ACAO"],
  ["Ünïcôdé", "UNICODE"],
  ["ACME LTDA", "ACME LTDA"],
  ["", ""],
  ["   ", ""],
  // ⚠️ Espaço interno NÃO é colapsado — porque o executor também não colapsa.
  // Ser igual a ele vale mais que ser esperto.
  ["JOAO  SILVA", "JOAO  SILVA"],
  // Pontuação fica. Idem.
  ["ACME, LTDA.", "ACME, LTDA."],
  ["12.345.678/0001-90", "12.345.678/0001-90"],
];

describe("normalização — paridade com o `_strip_accents` do executor", () => {
  it.each(CASOS_DE_NORMALIZACAO)("%j → %j", (entrada, esperado) => {
    expect(normalizar(entrada)).toBe(esperado);
  });

  it("não estoura com null nem com número", () => {
    expect(normalizar(null)).toBe("");
    expect(normalizar(undefined)).toBe("");
    expect(normalizar(42)).toBe("42");
  });
});

describe("distância de edição", () => {
  it("conta as edições, não as diferenças", () => {
    expect(distancia("ANA", "ANA")).toBe(0);
    expect(distancia("ANA", "ANAS")).toBe(1);
    expect(distancia("JOAO", "JOAP")).toBe(1);
    expect(distancia("", "ABC")).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const CARTEIRA: ValorDoVocabulario[] = [
  { valor: "JOAO DA SILVA", linhas: 120 },
  { valor: "João Silva", linhas: 8 },
  { valor: "MARIA SOUZA", linhas: 60 },
  { valor: "ACME LTDA", linhas: 400 },
  { valor: "ACME LTDA ME", linhas: 2 },
  { valor: "BETA SA", linhas: 30 },
];

describe("resolução de entidade", () => {
  it("casa igualdade normalizada, ignorando caixa e acento", () => {
    // O executor faria isto sozinho no `where`; o resolvedor só não pode
    // atrapalhar.
    expect(resolverEntidade("joão silva", CARTEIRA)).toEqual({
      tipo: "exato",
      literal: "João Silva",
    });
  });

  it("casa por contenção quando há um candidato só", () => {
    expect(resolverEntidade("BETA", CARTEIRA)).toEqual({
      tipo: "exato",
      literal: "BETA SA",
    });
  });

  it("⭐ dois candidatos plausíveis viram PERGUNTA, não escolha", () => {
    // "ACME" está contido em "ACME LTDA" e em "ACME LTDA ME". Escolher o mais
    // frequente daria a resposta certa aqui e errada no próximo caso — e o
    // usuário não teria como saber qual dos dois aconteceu.
    const r = resolverEntidade("ACME", CARTEIRA);

    expect(r.tipo).toBe("ambiguo");
    expect(r).toMatchObject({ opcoes: ["ACME LTDA", "ACME LTDA ME"] });
  });

  it("ordena as opções pela contagem de linhas, sem decidir por ela", () => {
    // A frequência ordena a pergunta; quem responde é o usuário.
    const r = resolverEntidade("ACME", CARTEIRA);
    expect(r).toMatchObject({ opcoes: expect.arrayContaining(["ACME LTDA"]) });
    if (r.tipo === "ambiguo") expect(r.opcoes[0]).toBe("ACME LTDA");
  });

  it("corrige erro de digitação por distância de edição", () => {
    expect(resolverEntidade("MARIA SOUSA", CARTEIRA)).toEqual({
      tipo: "exato",
      literal: "MARIA SOUZA",
    });
  });

  it("não compete distância 1 com distância 3", () => {
    // Sem o corte pelo MENOR valor, "BETA SA" e "MARIA SOUZA" disputariam a
    // mesma pergunta só por caberem no teto.
    const r = resolverEntidade("BETA S", CARTEIRA);
    expect(r).toEqual({ tipo: "exato", literal: "BETA SA" });
  });

  it("⚠️ o teto é proporcional: termo curto não casa com qualquer coisa", () => {
    // Com teto absoluto de 3, "ANA" casaria com meia carteira. Com 40% de 3 → 1,
    // não casa com nada aqui — e devolver `nenhum` é a resposta honesta.
    expect(resolverEntidade("ANA", CARTEIRA)).toEqual({ tipo: "nenhum" });
  });

  it("devolve `nenhum` em vez de chutar o menos ruim", () => {
    expect(resolverEntidade("ZZZZZZZZZZ", CARTEIRA)).toEqual({ tipo: "nenhum" });
  });

  it("aguenta vocabulário vazio, sujo e termo em branco", () => {
    expect(resolverEntidade("ACME", [])).toEqual({ tipo: "nenhum" });
    expect(resolverEntidade("   ", CARTEIRA)).toEqual({ tipo: "nenhum" });
    expect(
      resolverEntidade("ACME", [
        { valor: null as unknown as string, linhas: 1 },
        { valor: "ACME LTDA", linhas: 5 },
      ]),
    ).toEqual({ tipo: "exato", literal: "ACME LTDA" });
  });

  it("não devolve mais de 5 opções — pergunta com vinte é uma lista", () => {
    const muitos = Array.from({ length: 20 }, (_, i) => ({
      valor: `CLIENTE X${i}`,
      linhas: i,
    }));
    const r = resolverEntidade("CLIENTE X", muitos);

    expect(r.tipo).toBe("ambiguo");
    if (r.tipo === "ambiguo") expect(r.opcoes).toHaveLength(5);
  });

  it("⭐ o literal devolvido é o da BASE, com a grafia original", () => {
    // O `where` do executor normaliza os dois lados, então grafia não importa
    // para o casamento — mas importa para a resposta mostrar ao usuário o nome
    // como ele está escrito na planilha dele.
    const r = resolverEntidade("joao da silva", CARTEIRA);
    expect(r).toEqual({ tipo: "exato", literal: "JOAO DA SILVA" });
  });
});
