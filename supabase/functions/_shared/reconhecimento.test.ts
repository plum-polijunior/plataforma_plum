/**
 * Testes do reconhecimento (A2) — a forma e a chave do cache.
 *
 * ⭐ Dois modos de falha silenciosa mandam aqui, e nenhum dos dois quebra nada
 * quando acontece:
 *
 *  1. **Digital instável.** O `schema_metadata` vem do banco como JSONB, cuja
 *     ordem de chave não é garantida. Se a canonicalização não ordenar, a mesma
 *     base produz digitais diferentes entre duas leituras, o cache nunca acerta
 *     e o A2 é chamado em toda pergunta. Parece custo alto; é bug.
 *  2. **Coluna inventada.** O A2 pode alucinar um nome que não existe na base.
 *     Chegando ao A3, viraria um Query Plan que morre em `MissingColumnError`
 *     longe da causa.
 */

import { describe, expect, it, vi } from "vitest";

import {
  canonicalizar,
  colunasComVocabularioUtil,
  digitalDoDicionario,
  normalizarReconhecimento,
} from "./reconhecimento.ts";

describe("digital do dicionário", () => {
  it("⭐ não depende da ordem das chaves, em nenhuma profundidade", async () => {
    const a = { columns: { receita: { type: "moeda_brl" }, cliente: { type: "texto" } } };
    const b = { columns: { cliente: { type: "texto" }, receita: { type: "moeda_brl" } } };

    expect(canonicalizar(a)).toBe(canonicalizar(b));
    expect(await digitalDoDicionario(a)).toBe(await digitalDoDicionario(b));
  });

  it("muda quando o conteúdo muda", async () => {
    // É a razão de ser uma digital e não uma coluna de versão: versão precisa
    // ser lembrada em todo lugar que edita o schema, e esquecer serviria
    // reconhecimento velho para uma base nova.
    const antes = await digitalDoDicionario({ columns: { a: { type: "texto" } } });
    const depois = await digitalDoDicionario({ columns: { a: { type: "moeda_brl" } } });

    expect(antes).not.toBe(depois);
  });

  it("preserva a ordem de array, que é significativa", () => {
    expect(canonicalizar([1, 2])).not.toBe(canonicalizar([2, 1]));
  });

  it("sai no formato que o CHECK da tabela aceita", async () => {
    // A migration tem `CHECK (digital_dicionario ~ '^[0-9a-f]{64}$')`. Formato
    // diferente aqui faria todo insert do cache falhar — e o `guardar()` engole
    // o erro, então o sintoma seria "o cache nunca acerta", sem nenhum aviso.
    expect(await digitalDoDicionario({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("aguenta dicionário nulo", async () => {
    expect(await digitalDoDicionario(null)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("normalização da saída do A2", () => {
  const REAIS = ["cliente", "receita", "data_venda"];

  const BOM = {
    colunas: {
      cliente: {
        conceito: "nome do cliente",
        papel_analitico: "dimensao",
        vocabulario_util: true,
        confianca: "alta",
      },
      receita: {
        conceito: "valor faturado",
        papel_analitico: "medida",
        vocabulario_util: false,
        confianca: "alta",
      },
    },
    grao: "uma venda",
    observacoes: ["margem está 50% vazia"],
  };

  it("passa adiante o que veio bem formado", () => {
    const r = normalizarReconhecimento(BOM, REAIS);
    expect(r.grao).toBe("uma venda");
    expect(r.colunas.receita.papel_analitico).toBe("medida");
    expect(r.observacoes).toEqual(["margem está 50% vazia"]);
  });

  it("⭐ descarta coluna que não existe na base", () => {
    const bruto = {
      ...BOM,
      colunas: { ...BOM.colunas, lucro_liquido: BOM.colunas.receita },
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(Object.keys(normalizarReconhecimento(bruto, REAIS).colunas)).toEqual([
      "cliente",
      "receita",
    ]);
    vi.restoreAllMocks();
  });

  it("⚠️ confiança ausente vira `baixa`, não `alta`", () => {
    // Confiança desconhecida é desconhecida, e o lado seguro do desconhecido é
    // perguntar. O default oposto faria o A3 presumir — e presumir errado
    // devolve um número certo sobre a coisa errada.
    const r = normalizarReconhecimento(
      { colunas: { cliente: { conceito: "x", papel_analitico: "dimensao" } } },
      REAIS,
    );
    expect(r.colunas.cliente.confianca).toBe("baixa");
  });

  it("papel inválido vira `dimensao`, o mais inofensivo", () => {
    const r = normalizarReconhecimento(
      { colunas: { cliente: { papel_analitico: "chute" } } },
      REAIS,
    );
    // Dimensão só agrupa e filtra. `medida` faria o A3 somar uma coluna que
    // talvez não seja somável.
    expect(r.colunas.cliente.papel_analitico).toBe("dimensao");
  });

  it("conceito vazio cai para o nome da coluna", () => {
    const r = normalizarReconhecimento({ colunas: { cliente: {} } }, REAIS);
    expect(r.colunas.cliente.conceito).toBe("cliente");
  });

  it("corta observações em três", () => {
    const r = normalizarReconhecimento(
      { ...BOM, observacoes: ["a", "b", "c", "d", "e"] },
      REAIS,
    );
    expect(r.observacoes).toHaveLength(3);
  });

  it("não estoura com lixo — devolve reconhecimento vazio", () => {
    // ⭐ O chamador usa `Object.keys(colunas).length` para decidir se cacheia.
    // Se isto lançasse, um JSON malformado do A2 derrubaria o turno inteiro.
    for (const lixo of [null, undefined, "texto", 42, { colunas: "x" }]) {
      const r = normalizarReconhecimento(lixo, REAIS);
      expect(r.colunas).toEqual({});
      expect(r.grao).toBe("desconhecido");
    }
  });

  it("lista as colunas que valem vocabulário, ordenadas", () => {
    const r = normalizarReconhecimento(
      {
        colunas: {
          receita: { vocabulario_util: false },
          data_venda: { vocabulario_util: true },
          cliente: { vocabulario_util: true },
        },
      },
      REAIS,
    );
    expect(colunasComVocabularioUtil(r)).toEqual(["cliente", "data_venda"]);
  });
});
