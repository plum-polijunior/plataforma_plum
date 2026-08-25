/**
 * Testes do leitor único do dicionário.
 *
 * ⭐ **O caso que mais importa é o v1.** As bases da demo não serão
 * recadastradas, então elas vão passar por aqui para sempre — e uma delas
 * lendo mal significa chat pior sem ninguém saber por quê.
 */

import { describe, expect, it } from "vitest";

import { colunasComVocabulario, lerDicionario, paraPrompt } from "./dicionario.ts";

/** O formato que está gravado hoje, exatamente como o cadastro o escreve. */
const V1 = {
  columns: {
    faturamento: {
      semantic_definition: "receita líquida da venda",
      formatting_rule: { type: "moeda_brl", params: {} },
    },
    regiao: {
      semantic_definition: "região comercial",
      formatting_rule: { type: "texto_trim_maiusculas", params: {} },
    },
    data_venda: {
      semantic_definition: "data em que a venda ocorreu",
      formatting_rule: { type: "data", params: {} },
    },
    cpf_cliente: {
      semantic_definition: "documento do cliente",
      formatting_rule: { type: "documento_cpf_cnpj", params: {} },
    },
  },
};

describe("v1 — o formato que já está no banco", () => {
  it("lê sem perder nada e marca versão 1", () => {
    const d = lerDicionario(V1);

    expect(d.versao).toBe(1);
    expect(d.conferido).toBe(false);
    expect(d.colunas.faturamento.conceito).toBe("receita líquida da venda");
    expect(d.colunas.faturamento.formatacao).toBe("moeda_brl");
  });

  it("⭐ deduz o papel a partir do tipo de formatação", () => {
    // Sem isto tudo viraria `dimensao` e o A3 tentaria agrupar por faturamento.
    const { colunas } = lerDicionario(V1);

    expect(colunas.faturamento.papel_analitico).toBe("medida");
    expect(colunas.regiao.papel_analitico).toBe("dimensao");
    expect(colunas.data_venda.papel_analitico).toBe("temporal");
    expect(colunas.cpf_cliente.papel_analitico).toBe("identificador");
  });

  it("⭐ liga vocabulário só nas dimensões, e o erro é assimétrico", () => {
    // Falso positivo custa um pedido (o teto de 200 do executor recusa).
    // Falso negativo quebra "quanto o joão vendeu" — devolve vazio, que parece
    // um fato. Por isso a dimensão assume `true`.
    expect(colunasComVocabulario(lerDicionario(V1))).toEqual(["regiao"]);
  });

  it("grão e observações vêm vazios, não indefinidos", () => {
    const d = lerDicionario(V1);
    expect(d.grao).toBe("");
    expect(d.observacoes).toEqual([]);
  });
});

describe("v2 — o que o cadastro passa a gravar", () => {
  const V2 = {
    versao: 2,
    grao: "uma venda",
    observacoes: ["custo_produto está 40% vazia", "  ", ""],
    columns: {
      cod_produto: {
        semantic_definition: "código do produto",
        formatting_rule: { type: "numero_inteiro" },
        papel_analitico: "identificador",
        vocabulario_util: false,
      },
      vendedor: {
        semantic_definition: "quem fechou a venda",
        formatting_rule: { type: "texto_trim_maiusculas" },
        papel_analitico: "dimensao",
        vocabulario_util: true,
      },
    },
  };

  it("⭐ o declarado vence a dedução por formatação", () => {
    // `numero_inteiro` deduziria `medida`. A pessoa disse que é identificador,
    // e é ela quem sabe — somar código de produto é absurdo.
    const d = lerDicionario(V2);

    expect(d.colunas.cod_produto.papel_analitico).toBe("identificador");
    expect(d.versao).toBe(2);
    expect(d.conferido).toBe(true);
  });

  it("o vocabulário declarado vence o padrão", () => {
    expect(colunasComVocabulario(lerDicionario(V2))).toEqual(["vendedor"]);
  });

  it("descarta observação vazia em vez de repassar", () => {
    expect(lerDicionario(V2).observacoes).toEqual(["custo_produto está 40% vazia"]);
  });

  it("papel inventado cai na dedução, não passa", () => {
    const d = lerDicionario({
      versao: 2,
      columns: { x: { formatting_rule: { type: "data" }, papel_analitico: "chutometro" } },
    });
    expect(d.colunas.x.papel_analitico).toBe("temporal");
  });
});

describe("⚠️ nada aqui pode lançar", () => {
  // Ele roda no caminho da pergunta: schema estranho tem de virar dicionário
  // pobre, não turno perdido.
  const lixos: unknown[] = [
    null,
    undefined,
    {},
    { columns: null },
    { columns: "lixo" },
    { columns: [] },
    { columns: { a: null } },
    { columns: { a: "nao sou objeto" } },
    { columns: { "": { semantic_definition: "sem nome" } } },
    { versao: "duas", columns: {} },
    { versao: -3, columns: {} },
    { observacoes: "nao sou lista" },
  ];

  for (const [i, lixo] of lixos.entries()) {
    it(`caso ${i}: ${JSON.stringify(lixo)?.slice(0, 40) ?? "undefined"}`, () => {
      const d = lerDicionario(lixo);

      expect(() => paraPrompt(d)).not.toThrow();
      expect(d.versao).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(d.observacoes)).toBe(true);
      expect(typeof d.grao).toBe("string");
    });
  }

  it("coluna sem descrição continua sendo coluna", () => {
    // O nome dela está no cabeçalho da planilha. Some a descrição, não a coluna
    // — apagá-la aqui faria o A3 planejar sem uma coluna que existe.
    const d = lerDicionario({ columns: { a: null, b: "lixo" } });
    expect(Object.keys(d.colunas)).toEqual(["a", "b"]);
  });

  it("coluna de nome vazio é descartada", () => {
    expect(lerDicionario({ columns: { "": {} } }).colunas).toEqual({});
  });
});

describe("paraPrompt", () => {
  it("leva o nome técnico junto — o A3 precisa dele para o Query Plan", () => {
    const texto = paraPrompt(lerDicionario(V1));

    expect(texto).toContain("faturamento");
    expect(texto).toContain("receita líquida da venda");
    expect(texto).toContain("medida");
  });

  it("diz que a coluna não tem descrição em vez de omiti-la", () => {
    const texto = paraPrompt(lerDicionario({ columns: { orfa: {} } }));

    expect(texto).toContain("orfa");
    expect(texto).toContain("sem descrição");
  });

  it("⭐ avisa quando o dicionário não passou por gente", () => {
    // É o que substitui a `confianca` por coluna: em vez de saber ONDE
    // desconfiar, o A3 sabe QUANDO desconfiar de tudo.
    expect(paraPrompt(lerDicionario(V1))).toContain("NÃO foi conferido");
  });

  it("não avisa quando foi conferido", () => {
    const conferido = paraPrompt(lerDicionario({ versao: 2, columns: {} }));
    expect(conferido).not.toContain("NÃO foi conferido");
  });

  it("só cita grão e observações quando existem", () => {
    expect(paraPrompt(lerDicionario(V1))).not.toContain("GRÃO");

    const comGrao = paraPrompt(
      lerDicionario({ versao: 2, grao: "uma venda", observacoes: ["x"], columns: {} }),
    );
    expect(comGrao).toContain("GRÃO");
    expect(comGrao).toContain("uma venda");
    expect(comGrao).toContain("OBSERVAÇÕES");
  });
});
