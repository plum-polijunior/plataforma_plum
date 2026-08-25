/**
 * Testes da saída do Agente 1 — o dicionário v2 nascendo (B14).
 *
 * ⭐ **O caso que mais importa é a coluna que o modelo esqueceu.** O front monta
 * a tela de revisão a partir de `columns`: coluna ausente desaparece da etapa 4,
 * ninguém escreve a definição dela, e a base nasce com uma coluna muda. É o
 * mesmo modo de falha da C11 — coluna que some calada — por outra porta.
 *
 * O segundo grupo cobre a queda para a sugestão determinística. Um
 * `papel_analitico` inventado não quebra nada na hora: `lerDicionario` o
 * descarta na leitura e usa o default dele, então o efeito seria o A3 recebendo
 * um papel pior para sempre, sem sintoma nenhum.
 */

import { describe, expect, it } from "vitest";

import {
  entradaDaSemantica,
  normalizarDicionarioDoAgente1,
} from "./dicionario_do_cadastro.ts";
import { sugerirDoPerfil } from "../_shared/perfil.ts";

const COLUNAS = ["faturamento", "regiao", "pedido_id"];

const PERFIL = {
  n_linhas: 1200,
  colunas: {
    faturamento: { existe: true, papel: "number", distintos: 900, linhas_por_valor: 1.33 },
    regiao: { existe: true, papel: "text", distintos: 5, linhas_por_valor: 240 },
    pedido_id: { existe: true, papel: "text", distintos: 1180, linhas_por_valor: 1.017 },
  },
};

const SUGESTOES = sugerirDoPerfil(COLUNAS, PERFIL);

describe("normalizarDicionarioDoAgente1", () => {
  it("⭐ toda coluna pedida sai, inclusive a que o modelo esqueceu", () => {
    const d = normalizarDicionarioDoAgente1(
      { columns: { faturamento: { semantic_definition: "receita" } }, grao: "uma venda" },
      COLUNAS,
      SUGESTOES,
    );

    expect(Object.keys(d.columns)).toEqual(COLUNAS);
    // A esquecida vem vazia, mas VEM — a pessoa a vê na tela e escreve.
    expect(d.columns.regiao.semantic_definition).toBe("");
    // E já com o papel do cálculo, que não depende do modelo ter respondido.
    expect(d.columns.regiao.papel_analitico).toBe("dimensao");
    expect(d.columns.pedido_id.papel_analitico).toBe("identificador");
  });

  it("papel fora do enum cai na sugestão do perfil", () => {
    const d = normalizarDicionarioDoAgente1(
      {
        columns: {
          faturamento: { semantic_definition: "receita", papel_analitico: "metrica" },
        },
      },
      COLUNAS,
      SUGESTOES,
    );
    // "metrica" não existe; o perfil diz medida.
    expect(d.columns.faturamento.papel_analitico).toBe("medida");
  });

  it("papel válido do modelo VENCE a sugestão — é o ponto de ter modelo", () => {
    // ⭐ O valor do Agente 1 é discordar com motivo: um CEP tem cardinalidade de
    // dimensão e é identificador. Se a normalização ignorasse a resposta dele,
    // a etapa 4 seria só a regra determinística com um custo de LLM em cima.
    const d = normalizarDicionarioDoAgente1(
      {
        columns: {
          regiao: { semantic_definition: "CEP de entrega", papel_analitico: "identificador" },
        },
      },
      COLUNAS,
      SUGESTOES,
    );
    expect(d.columns.regiao.papel_analitico).toBe("identificador");
  });

  it("`vocabulario_util` só cai na sugestão quando não é booleano", () => {
    // `false` explícito é uma resposta, não ausência — e `?? sugerido` a
    // atropelaria se o teste fosse por falsidade em vez de por tipo.
    const d = normalizarDicionarioDoAgente1(
      {
        columns: {
          regiao: { semantic_definition: "região", vocabulario_util: false },
          faturamento: { semantic_definition: "receita" },
        },
      },
      COLUNAS,
      SUGESTOES,
    );
    expect(d.columns.regiao.vocabulario_util).toBe(false);
    // Ausente cai na sugestão, que para número é false de qualquer forma.
    expect(d.columns.faturamento.vocabulario_util).toBe(false);
  });

  it("corta observações em três e descarta as vazias", () => {
    // O prompt pede no máximo três, uma frase cada, e a tela mostra uma lista
    // editável. Vinte observações viram ruído que ninguém revisa.
    const d = normalizarDicionarioDoAgente1(
      { columns: {}, observacoes: ["a", "", "  ", "b", "c", "d", "e"] },
      [],
      {},
    );
    expect(d.observacoes).toEqual(["a", "b", "c"]);
  });

  it("não lança com nada, e `grao` ausente vira string vazia", () => {
    // `lerDicionario` já trata `grao: ""` como "não declarado". Devolver
    // `undefined` aqui obrigaria o front a lembrar de tratar.
    for (const lixo of [null, undefined, {}, [], "texto", { columns: "nao" }]) {
      expect(() => normalizarDicionarioDoAgente1(lixo, COLUNAS, SUGESTOES)).not.toThrow();
    }
    expect(normalizarDicionarioDoAgente1(null, [], {}).grao).toBe("");
    expect(normalizarDicionarioDoAgente1(null, [], {}).observacoes).toEqual([]);
  });
});

describe("entradaDaSemantica", () => {
  it("⭐ diz que o bloco não veio, em vez de omiti-lo", () => {
    // Silêncio faria o modelo escrever definição mais vaga sem dizer por quê.
    // O caso é real: perfil e vocabulário dependem de o executor responder, e o
    // cadastro segue se eles falharem.
    const texto = entradaDaSemantica({
      colunas: COLUNAS,
      perfil: null,
      dataSamples: [],
      vocabularios: {},
      sugestoes: SUGESTOES,
    });

    expect(texto).toContain("PERFIL DA BASE: não disponível");
    expect(texto).toContain("LINHAS DE EXEMPLO: nenhuma disponível");
    expect(texto).toContain("VOCABULÁRIO: nenhum disponível");
    // As sugestões vão sempre — elas não dependem do executor.
    expect(texto).toContain("SUGESTÕES DETERMINÍSTICAS");
  });

  it("informa quantas linhas de exemplo chegaram", () => {
    // ⚠️ A contagem vai no texto para o prompt não poder discordar da realidade
    // — foi um número cravado no prompt que fez o Agente 3 devolver 5 de 20.
    const texto = entradaDaSemantica({
      colunas: COLUNAS,
      perfil: PERFIL,
      dataSamples: [{ a: 1 }, { a: 2 }, { a: 3 }],
      vocabularios: { regiao: [{ valor: "SUL", linhas: 400 }] },
      sugestoes: SUGESTOES,
    });

    expect(texto).toContain("LINHAS DE EXEMPLO (3)");
    expect(texto).toContain("1200 linhas no total");
    expect(texto).toContain("VOCABULÁRIO (valores que existem");
  });

  it("vocabulário vazio conta como ausente", () => {
    // `{regiao: []}` significa que o executor recusou pelo teto. Mandar a chave
    // com lista vazia faria o modelo achar que a coluna não tem valor nenhum.
    const texto = entradaDaSemantica({
      colunas: COLUNAS,
      perfil: PERFIL,
      dataSamples: [{ a: 1 }],
      vocabularios: { regiao: [] },
      sugestoes: SUGESTOES,
    });
    expect(texto).toContain("VOCABULÁRIO: nenhum disponível");
  });
});
