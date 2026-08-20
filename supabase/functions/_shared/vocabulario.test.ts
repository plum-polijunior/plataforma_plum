/**
 * Testes do pedido `vocabulario`.
 *
 * Ele é a **única porta do sistema para valor literal de texto** — o B02 fechou
 * o `group_by` de alta cardinalidade e o B03 recusou `min`/`max` sobre texto no
 * `metadados`. Então os testes de permissão aqui são de privacidade, não de
 * ergonomia.
 *
 * ⚠️ A terceira trava — teto de 200 valores distintos — **não é testada aqui**,
 * porque não mora aqui: só o executor conhece a cardinalidade real. Ela está em
 * `query_engine/tests/test_privacidade.py`.
 */

import { describe, expect, it } from "vitest";

import {
  ALIAS_CONTAGEM,
  lerVocabulario,
  planoDeVocabulario,
  podeExporVocabulario,
  TETO_DE_VOCABULARIO,
} from "./vocabulario.ts";

describe("o plano é um Query Plan comum", () => {
  it("compila para group_by + count + order desc + limit", () => {
    // ⭐ Se isto deixar de ser um plano comum, o sistema ganhou um segundo
    // caminho de execução — e um segundo lugar onde uma coluna pode escapar do
    // RBAC. A forma é o contrato.
    expect(planoDeVocabulario("cliente")).toEqual({
      from: "producao",
      select: [{ expr: { agg: "count", col: "cliente" }, as: ALIAS_CONTAGEM }],
      group_by: ["cliente"],
      order_by: [{ col: ALIAS_CONTAGEM, dir: "desc" }],
      limit: TETO_DE_VOCABULARIO,
    });
  });

  it("pede os mais frequentes primeiro", () => {
    // Se o teto cortar, o que sobra é o que mais aparece na base — que é também
    // o que o usuário mais provavelmente citou.
    expect(planoDeVocabulario("x").order_by[0].dir).toBe("desc");
  });

  it("o limite é o mesmo teto do executor", () => {
    expect(TETO_DE_VOCABULARIO).toBe(200);
  });
});

describe("as duas travas que a Edge Function aplica", () => {
  it("recusa coluna fora do allowed_columns do cargo", () => {
    expect(podeExporVocabulario("margem", ["cliente", "receita"], true)).toEqual({
      permitido: false,
      motivo: "coluna_proibida",
    });
  });

  it("recusa quando a base não liberou vocabulário", () => {
    expect(podeExporVocabulario("cliente", ["cliente"], false)).toEqual({
      permitido: false,
      motivo: "vocabulario_desligado",
    });
  });

  it("⭐ o RBAC é conferido ANTES da flag da base", () => {
    // Ordem importa para o motivo devolvido: uma coluna proibida numa base com
    // vocabulário desligado tem de sair como `coluna_proibida`. Reportar
    // "vocabulário desligado" sugeriria que ligar a flag resolveria — e daria a
    // quem lê a impressão errada sobre o que o cargo alcança.
    expect(podeExporVocabulario("margem", ["cliente"], false).motivo).toBe(
      "coluna_proibida",
    );
  });

  it("permite só quando as duas passam", () => {
    expect(podeExporVocabulario("cliente", ["cliente"], true)).toEqual({
      permitido: true,
    });
  });
});

describe("leitura do resultado", () => {
  it("converte as linhas do executor para o resolvedor", () => {
    expect(
      lerVocabulario("cliente", [
        { cliente: "ACME LTDA", [ALIAS_CONTAGEM]: 400 },
        { cliente: "BETA SA", [ALIAS_CONTAGEM]: 30 },
      ]),
    ).toEqual([
      { valor: "ACME LTDA", linhas: 400 },
      { valor: "BETA SA", linhas: 30 },
    ]);
  });

  it("descarta linha sem valor em vez de propagar undefined", () => {
    // Célula vazia vira `""` no Sheets. Sem o descarte, o resolvedor receberia
    // um candidato vazio e o erro apareceria longe da causa.
    expect(
      lerVocabulario("cliente", [
        { cliente: null, [ALIAS_CONTAGEM]: 5 },
        { cliente: "", [ALIAS_CONTAGEM]: 3 },
        { cliente: "ACME", [ALIAS_CONTAGEM]: 1 },
      ]),
    ).toEqual([{ valor: "ACME", linhas: 1 }]);
  });

  it("aguenta contagem ausente e resultado que não é lista", () => {
    expect(lerVocabulario("cliente", [{ cliente: "ACME" }])).toEqual([
      { valor: "ACME", linhas: 0 },
    ]);
    expect(lerVocabulario("cliente", null)).toEqual([]);
    expect(lerVocabulario("cliente", { erro: "x" })).toEqual([]);
  });

  it("converte valor numérico para texto", () => {
    // Coluna de código guardada como número na planilha. O resolvedor compara
    // string; sem isto, `normalizar` receberia um número e o casamento por
    // contenção quebraria.
    expect(lerVocabulario("codigo", [{ codigo: 42, [ALIAS_CONTAGEM]: 7 }])).toEqual([
      { valor: "42", linhas: 7 },
    ]);
  });
});
