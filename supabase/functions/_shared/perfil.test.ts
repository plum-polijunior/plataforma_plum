/**
 * Testes das regras determinísticas do perfil (B14).
 *
 * ⭐ **O que mais importa aqui é a precedência de `identificador`.** Ela é o
 * único caso em que a regra contraria o tipo da coluna, e é o caso que estraga
 * resposta se sair errado: uma coluna de CPF marcada como dimensão faz o
 * planejador agrupar por ela e devolver uma linha por pessoa — resultado
 * plausível, tamanho absurdo, e nenhum erro no caminho.
 *
 * O segundo grupo cobre a concordância entre os dois consumidores: o
 * `ai-plum-chat` decide de quais colunas pedir vocabulário e o `ai-agents`
 * sugere `vocabulario_util` ao Agente 1. Divergir faria o dicionário afirmar que
 * uma coluna tem vocabulário útil sem que ninguém tivesse visto os valores dela.
 */

import { describe, expect, it } from "vitest";

import {
  colunasComVocabularioDoPerfil,
  papelPeloPerfil,
  sugerirDoPerfil,
  vocabularioPeloPerfil,
} from "./perfil.ts";

const PERFIL = {
  n_linhas: 1200,
  colunas: {
    // Texto com poucos valores: dimensão de verdade, e a única que ganha
    // vocabulário.
    regiao: { existe: true, papel: "text", distintos: 5, linhas_por_valor: 240 },
    // ⭐ Texto com quase um valor por linha: identificador, não categoria.
    pedido_id: { existe: true, papel: "text", distintos: 1180, linhas_por_valor: 1.017 },
    faturamento: { existe: true, papel: "number", distintos: 900, linhas_por_valor: 1.33 },
    data_venda: { existe: true, papel: "date", distintos: 30, linhas_por_valor: 40 },
    margem: { existe: true, papel: "percent", distintos: 400, linhas_por_valor: 3 },
    safra: { existe: true, papel: "ano", distintos: 4, linhas_por_valor: 300 },
    // Acima do teto de 200: o executor recusaria a lista.
    cliente: { existe: true, papel: "text", distintos: 640, linhas_por_valor: 1.87 },
  },
};

describe("papelPeloPerfil", () => {
  it("⭐ identificador vence o tipo da coluna", () => {
    // `linhas_por_valor` perto de 1 é evidência mais forte que "é texto".
    // Sem esta precedência, `pedido_id` seria dimensão e o planejador tentaria
    // agrupar por ela.
    expect(papelPeloPerfil(PERFIL.colunas.pedido_id)).toBe("identificador");
  });

  it("não exige linhas_por_valor exatamente 1 — base real tem duplicata", () => {
    // 1.017 já é identificador. Um limite de `=== 1` deixaria passar toda
    // coluna de id de uma base com qualquer repetição.
    expect(papelPeloPerfil({ papel: "text", distintos: 1180, linhas_por_valor: 1.017 }))
      .toBe("identificador");
    // E 1.33 não é: uma coluna de valor monetário repete o suficiente.
    expect(papelPeloPerfil({ papel: "number", distintos: 900, linhas_por_valor: 1.33 }))
      .toBe("medida");
  });

  it("data e ano são temporais; número e percentual são medida", () => {
    expect(papelPeloPerfil(PERFIL.colunas.data_venda)).toBe("temporal");
    expect(papelPeloPerfil(PERFIL.colunas.safra)).toBe("temporal");
    expect(papelPeloPerfil(PERFIL.colunas.faturamento)).toBe("medida");
    expect(papelPeloPerfil(PERFIL.colunas.margem)).toBe("medida");
  });

  it("coluna ausente do perfil vira dimensão, não estoura", () => {
    // Acontece de verdade: o perfil pode falhar e o cadastro segue sem ele.
    // `dimensao` é o default menos destrutivo — no pior caso o planejador
    // agrupa por algo que não valia agrupar, em vez de somar texto.
    expect(papelPeloPerfil(undefined)).toBe("dimensao");
    expect(papelPeloPerfil({})).toBe("dimensao");
  });
});

describe("vocabularioPeloPerfil", () => {
  it("só dimensão de texto dentro do teto", () => {
    expect(vocabularioPeloPerfil(PERFIL.colunas.regiao)).toBe(true);
    // Acima de 200 distintos o executor recusaria: pedir é gastar chamada.
    expect(vocabularioPeloPerfil(PERFIL.colunas.cliente)).toBe(false);
    // Identificador não se resolve por lista.
    expect(vocabularioPeloPerfil(PERFIL.colunas.pedido_id)).toBe(false);
    // Nem número, nem data.
    expect(vocabularioPeloPerfil(PERFIL.colunas.faturamento)).toBe(false);
    expect(vocabularioPeloPerfil(PERFIL.colunas.data_venda)).toBe(false);
  });

  it("exatamente 200 distintos ainda cabe; 201 não", () => {
    // O teto é inclusivo dos dois lados do sistema — o executor recusa ACIMA de
    // 200. Um off-by-one aqui pediria uma lista que sempre volta recusada.
    const base = { papel: "text", linhas_por_valor: 6 };
    expect(vocabularioPeloPerfil({ ...base, distintos: 200 })).toBe(true);
    expect(vocabularioPeloPerfil({ ...base, distintos: 201 })).toBe(false);
  });

  it("zero distintos é false — coluna vazia não tem vocabulário", () => {
    expect(vocabularioPeloPerfil({ papel: "text", distintos: 0, linhas_por_valor: 0 }))
      .toBe(false);
  });
});

describe("sugerirDoPerfil", () => {
  it("devolve uma sugestão para TODA coluna pedida", () => {
    // ⚠️ Inclusive as que não estão no perfil. O Agente 1 recebe esta lista e o
    // `normalizarDicionarioDoAgente1` cai de volta nela: coluna sem sugestão
    // deixaria o fallback `undefined` e a coluna sairia do dicionário.
    const s = sugerirDoPerfil(["regiao", "faturamento", "coluna_fantasma"], PERFIL);

    expect(Object.keys(s)).toEqual(["regiao", "faturamento", "coluna_fantasma"]);
    expect(s.regiao).toEqual({ papel_analitico: "dimensao", vocabulario_util: true });
    expect(s.faturamento).toEqual({ papel_analitico: "medida", vocabulario_util: false });
    expect(s.coluna_fantasma).toEqual({ papel_analitico: "dimensao", vocabulario_util: false });
  });

  it("perfil nulo não estoura — sugere dimensão sem vocabulário", () => {
    const s = sugerirDoPerfil(["a", "b"], null);
    expect(s.a).toEqual({ papel_analitico: "dimensao", vocabulario_util: false });
    expect(s.b.vocabulario_util).toBe(false);
  });
});

describe("colunasComVocabularioDoPerfil", () => {
  it("⭐ concorda com `vocabularioPeloPerfil`, coluna por coluna", () => {
    // Este é o teste que existe por causa dos DOIS consumidores. Se alguém
    // otimizar um dos lados, é aqui que aparece.
    const todas = Object.keys(PERFIL.colunas);
    const pedidas = colunasComVocabularioDoPerfil(PERFIL, todas);

    for (const col of todas) {
      const esperado = vocabularioPeloPerfil(
        PERFIL.colunas[col as keyof typeof PERFIL.colunas],
      );
      expect(pedidas.includes(col), col).toBe(esperado);
    }
  });

  it("filtra pelo que o cargo pode ver", () => {
    // `allowed_columns` é a trava 1 do B04. Pedir vocabulário de coluna que o
    // cargo não vê seria o executor recusando — mas por RBAC, o que polui o
    // diagnóstico de "por que essa coluna não tem vocabulário".
    expect(colunasComVocabularioDoPerfil(PERFIL, ["faturamento"])).toEqual([]);
    expect(colunasComVocabularioDoPerfil(PERFIL, ["regiao"])).toEqual(["regiao"]);
  });

  it("perfil ausente devolve vazio, não a lista toda", () => {
    // ⚠️ O oposto seria pior que inútil: sem perfil não há cardinalidade, e
    // pedir vocabulário de tudo faria uma chamada por coluna para o executor
    // recusar quase todas.
    expect(colunasComVocabularioDoPerfil(null, ["regiao", "cliente"])).toEqual([]);
    expect(colunasComVocabularioDoPerfil({}, ["regiao"])).toEqual([]);
  });

  it("ordem é estável, porque o chamador corta as primeiras N", () => {
    const perfil = {
      colunas: {
        zona: { papel: "text", distintos: 4, linhas_por_valor: 300 },
        alvo: { papel: "text", distintos: 4, linhas_por_valor: 300 },
        meio: { papel: "text", distintos: 4, linhas_por_valor: 300 },
      },
    };
    expect(colunasComVocabularioDoPerfil(perfil, ["zona", "alvo", "meio"]))
      .toEqual(["alvo", "meio", "zona"]);
  });
});
