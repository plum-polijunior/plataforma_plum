/**
 * Testes do único interpretador de Query Plan do sistema.
 *
 * Esta é a peça que aplica o RBAC de coluna. Se ela deixar passar uma
 * referência de coluna em qualquer posição do plano, um cargo lê dado que não
 * deveria, e nenhuma outra camada pega, porque as camadas abaixo confiam no
 * conjunto que sai daqui.
 *
 * Por isso o foco dos testes é cobertura de POSIÇÃO: as seis posições em que
 * um nome de coluna pode aparecer, mais aninhamento profundo no `where`.
 */

import { describe, expect, it } from "vitest";

import {
  authorizePlan,
  extractColumns,
  papeisDeColuna,
  papelPorPalavraChave,
  permissionsFingerprint,
  signPayload,
  stripTable,
} from "./query_plan";

// ─────────────────────────────────────────────────────────────────────────────
// As seis posições
// ─────────────────────────────────────────────────────────────────────────────

describe("extractColumns — cobertura de posição", () => {
  it("acha coluna em target_columns", () => {
    expect(extractColumns({ target_columns: ["faturamento"] })).toEqual(
      new Set(["faturamento"]),
    );
  });

  it("acha coluna em select com expressão string", () => {
    expect(extractColumns({ select: [{ expr: "regiao" }] })).toEqual(
      new Set(["regiao"]),
    );
  });

  it("acha coluna em select com expressão objeto", () => {
    const plan = { select: [{ expr: { agg: "sum", col: "margem_lucro" }, as: "m" }] };
    expect(extractColumns(plan)).toEqual(new Set(["margem_lucro"]));
  });

  it("acha coluna em where simples", () => {
    const plan = { where: { left: "data_venda", op: "between", right: ["a", "b"] } };
    expect(extractColumns(plan)).toEqual(new Set(["data_venda"]));
  });

  it("acha coluna em group_by", () => {
    expect(extractColumns({ group_by: ["vendedor"] })).toEqual(new Set(["vendedor"]));
  });

  it("acha coluna em order_by", () => {
    expect(extractColumns({ order_by: [{ col: "total", dir: "desc" }] })).toEqual(
      new Set(["total"]),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Recursão do where
// ─────────────────────────────────────────────────────────────────────────────

describe("extractColumns — where recursivo", () => {
  it("desce em and/or aninhado em três níveis", () => {
    const plan = {
      where: {
        op: "and",
        args: [
          { left: "regiao", op: "=", right: "Sul" },
          {
            op: "or",
            args: [
              { left: "canal", op: "=", right: "online" },
              {
                op: "and",
                args: [
                  { left: "salario", op: ">", right: 1000 },
                  { left: "cargo", op: "=", right: "diretor" },
                ],
              },
            ],
          },
        ],
      },
    };
    expect(extractColumns(plan)).toEqual(
      new Set(["regiao", "canal", "salario", "cargo"]),
    );
  });

  it("não confunde o valor de `right` com nome de coluna", () => {
    const plan = { where: { left: "regiao", op: "=", right: "margem_lucro" } };
    // "margem_lucro" aqui é um VALOR, não uma coluna.
    expect(extractColumns(plan)).toEqual(new Set(["regiao"]));
  });

  it("aceita a forma alternativa com `col` no lugar de `left`", () => {
    // Ignorar esta forma significaria deixar passar uma referência de coluna.
    expect(extractColumns({ where: { col: "salario", op: ">", right: 1 } })).toEqual(
      new Set(["salario"]),
    );
  });

  it("não estoura a pilha com aninhamento absurdo", () => {
    let node: Record<string, unknown> = { left: "fundo", op: "=", right: 1 };
    for (let i = 0; i < 500; i++) node = { op: "and", args: [node] };
    expect(() => extractColumns({ where: node })).not.toThrow();
  });

  it("sobrevive a plano vazio, nulo e malformado", () => {
    expect(extractColumns(null)).toEqual(new Set());
    expect(extractColumns({})).toEqual(new Set());
    expect(extractColumns({ where: "isso nao e um no" } as never)).toEqual(new Set());
    expect(extractColumns({ select: [null, 42, {}] } as never)).toEqual(new Set());
  });
});

describe("stripTable", () => {
  it("remove o prefixo de tabela, igual ao executor em Python", () => {
    expect(stripTable("producao.faturamento")).toBe("faturamento");
    expect(stripTable("faturamento")).toBe("faturamento");
  });

  it("normaliza prefixo também dentro do plano", () => {
    const plan = { group_by: ["producao.regiao"], target_columns: ["regiao"] };
    expect(extractColumns(plan)).toEqual(new Set(["regiao"]));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Autorização
// ─────────────────────────────────────────────────────────────────────────────

describe("authorizePlan", () => {
  const permitidas = ["faturamento", "regiao", "data_venda"];

  it("aprova plano que só usa coluna permitida", () => {
    const plan = {
      select: [{ expr: { agg: "sum", col: "faturamento" } }],
      group_by: ["regiao"],
    };
    const r = authorizePlan(plan, permitidas);
    expect(r.allowed).toBe(true);
    expect(r.forbidden).toEqual([]);
    expect(r.required).toEqual(["faturamento", "regiao"]);
  });

  it("barra coluna proibida escondida no where aninhado", () => {
    const plan = {
      select: [{ expr: { agg: "sum", col: "faturamento" } }],
      where: {
        op: "and",
        args: [
          { left: "regiao", op: "=", right: "Sul" },
          { op: "or", args: [{ left: "margem_lucro", op: ">", right: 0 }] },
        ],
      },
    };
    const r = authorizePlan(plan, permitidas);
    expect(r.allowed).toBe(false);
    expect(r.forbidden).toEqual(["margem_lucro"]);
  });

  it("barra coluna proibida em cada uma das seis posições", () => {
    const posicoes = [
      { target_columns: ["margem_lucro"] },
      { select: [{ expr: "margem_lucro" }] },
      { select: [{ expr: { agg: "sum", col: "margem_lucro" } }] },
      { where: { left: "margem_lucro", op: ">", right: 0 } },
      { group_by: ["margem_lucro"] },
      { order_by: [{ col: "margem_lucro", dir: "desc" }] },
    ];
    for (const plan of posicoes) {
      const r = authorizePlan(plan, permitidas);
      expect(r.allowed, `posicao ${JSON.stringify(plan)} deveria ser barrada`).toBe(
        false,
      );
      expect(r.forbidden).toContain("margem_lucro");
    }
  });

  it("cargo sem nenhuma coluna não recebe nada", () => {
    const plan = { select: [{ expr: { agg: "sum", col: "faturamento" } }] };
    expect(authorizePlan(plan, []).allowed).toBe(false);
  });

  it("lista todas as proibidas, não só a primeira", () => {
    const plan = {
      select: [{ expr: { agg: "sum", col: "custo" } }],
      group_by: ["cpf"],
    };
    expect(authorizePlan(plan, permitidas).forbidden).toEqual(["cpf", "custo"]);
  });

  it("plano vazio é aprovado e não exige nada", () => {
    // O bloqueio de plano sem agregação é responsabilidade do executor, não
    // desta camada. Aqui só se decide sobre coluna.
    const r = authorizePlan({}, permitidas);
    expect(r.allowed).toBe(true);
    expect(r.required).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Impressão digital
// ─────────────────────────────────────────────────────────────────────────────

describe("permissionsFingerprint", () => {
  it("independe da ordem em que o banco devolveu as colunas", async () => {
    const a = await permissionsFingerprint(["b", "a", "c"]);
    const b = await permissionsFingerprint(["c", "b", "a"]);
    expect(a).toBe(b);
  });

  it("muda quando uma coluna é revogada — é isto que invalida o cache", async () => {
    const antes = await permissionsFingerprint(["faturamento", "margem_lucro"]);
    const depois = await permissionsFingerprint(["faturamento"]);
    expect(antes).not.toBe(depois);
  });

  it("dois cargos com a mesma permissão compartilham a digital", async () => {
    const vendedor = await permissionsFingerprint(["faturamento", "regiao"]);
    const estagiario = await permissionsFingerprint(["regiao", "faturamento"]);
    expect(vendedor).toBe(estagiario);
  });

  it("não colide entre conjuntos que concatenam igual", async () => {
    // Sem separador fora do alfabeto de nomes, ["ab","c"] e ["a","bc"] dariam
    // a mesma digital e um cargo leria o cache do outro.
    const x = await permissionsFingerprint(["ab", "c"]);
    const y = await permissionsFingerprint(["a", "bc"]);
    expect(x).not.toBe(y);
  });

  it("ignora duplicata e espaço em volta", async () => {
    const a = await permissionsFingerprint(["faturamento", " faturamento ", ""]);
    const b = await permissionsFingerprint(["faturamento"]);
    expect(a).toBe(b);
  });

  it("é hexadecimal de 64 caracteres", async () => {
    expect(await permissionsFingerprint(["a"])).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Assinatura — precisa casar com o hmac.new(...).hexdigest() do Python
// ─────────────────────────────────────────────────────────────────────────────

describe("signPayload", () => {
  it("bate com o vetor de referência do HMAC-SHA256", async () => {
    // Vetor conhecido: HMAC-SHA256("key", "The quick brown fox jumps over the lazy dog")
    const sig = await signPayload(
      "The quick brown fox jumps over the lazy dog",
      "key",
    );
    expect(sig).toBe(
      "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
    );
  });

  it("muda quando o corpo muda — é isto que protege o sheet_id", async () => {
    const a = await signPayload('{"sheet_id":"empresa-A"}', "s");
    const b = await signPayload('{"sheet_id":"empresa-B"}', "s");
    expect(a).not.toBe(b);
  });

  it("muda quando o segredo muda", async () => {
    const corpo = '{"sheet_id":"x"}';
    expect(await signPayload(corpo, "s1")).not.toBe(await signPayload(corpo, "s2"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Papéis de coluna
// ─────────────────────────────────────────────────────────────────────────────
//
// O papel decide se `sum` vira `avg` numa coluna percentual e se o executor
// coage texto para número. Errar aqui devolve número errado com cara de certo,
// que é o modo de falha que o produto promete não ter.

const contrato = (colunas: Record<string, string>) => ({
  versao: 1,
  colunas: Object.fromEntries(
    Object.entries(colunas).map(([c, tipo]) => [c, { tipo, params: {} }]),
  ),
});

describe("papeisDeColuna — caminho do contrato", () => {
  it("traduz cada tipo do enum para o papel do executor", () => {
    const { roles, legado } = papeisDeColuna(
      null,
      contrato({
        faturamento: "moeda_brl",
        preco: "numero_decimal",
        quantidade: "numero_inteiro",
        margem: "percentual",
        data_venda: "data",
        cliente: "texto_trim_maiusculas",
        cidade: "texto_trim_minusculas",
        cpf: "documento_cpf_cnpj",
        ativo: "booleano_sim_nao",
        obs: "nenhuma",
      }),
      new Set([
        "faturamento", "preco", "quantidade", "margem", "data_venda",
        "cliente", "cidade", "cpf", "ativo", "obs",
      ]),
    );

    expect(roles).toEqual({
      faturamento: "number",
      preco: "number",
      quantidade: "number",
      margem: "percent",
      data_venda: "date",
      cliente: "text",
      cidade: "text",
      cpf: "text",
      ativo: "text",
      obs: "text",
    });
    expect(legado).toEqual([]);
  });

  it("devolve só as colunas pedidas", () => {
    const { roles } = papeisDeColuna(
      null,
      contrato({ a: "percentual", b: "data", c: "moeda_brl" }),
      new Set(["b"]),
    );
    expect(Object.keys(roles)).toEqual(["b"]);
  });

  it("o contrato vence a frase, quando os dois existem e discordam", () => {
    // A frase diz "texto"; o contrato diz percentual. Quem manda é o contrato.
    const { roles, legado } = papeisDeColuna(
      { columns: { margem: { cleaning_rule: "Manter como texto" } } },
      contrato({ margem: "percentual" }),
      new Set(["margem"]),
    );
    expect(roles.margem).toBe("percent");
    expect(legado).toEqual([]);
  });

  it("tipo fora do enum não é aceito: cai no legado em vez de virar papel inválido", () => {
    const { roles, legado } = papeisDeColuna(
      { columns: { x: { cleaning_rule: "Converter para percentual" } } },
      { versao: 1, colunas: { x: { tipo: "moeda_em_dolar" } } },
      new Set(["x"]),
    );
    expect(roles.x).toBe("percent"); // veio do fallback, não do tipo inventado
    expect(legado).toEqual(["x"]);
  });
});

describe("papeisDeColuna — fallback de base legada", () => {
  it("sem contrato, adivinha pela frase e reporta como legado", () => {
    const { roles, legado } = papeisDeColuna(
      {
        columns: {
          margem: { cleaning_rule: "Converter para percentual com 2 casas" },
          data_venda: { cleaning_rule: "Converter para data dd/mm/aaaa" },
          faturamento: { cleaning_rule: "Retirar o R$ e converter para float" },
          cliente: { cleaning_rule: "Manter como texto" },
        },
      },
      null,
      new Set(["margem", "data_venda", "faturamento", "cliente"]),
    );

    expect(roles).toEqual({
      margem: "percent",
      data_venda: "date",
      faturamento: "number",
      cliente: "text",
    });
    // Todas adivinhadas: quem chama precisa saber para poder avisar.
    expect(legado.sort()).toEqual(
      ["cliente", "data_venda", "faturamento", "margem"],
    );
  });

  it("contrato parcial: só a coluna que falta entra em legado", () => {
    const { roles, legado } = papeisDeColuna(
      { columns: { antiga: { cleaning_rule: "Retirar o R$" } } },
      contrato({ nova: "percentual" }),
      new Set(["nova", "antiga"]),
    );
    expect(roles).toEqual({ nova: "percent", antiga: "number" });
    expect(legado).toEqual(["antiga"]);
  });

  it("coluna sem nenhuma informação vira text, nunca undefined", () => {
    const { roles, legado } = papeisDeColuna(null, null, new Set(["fantasma"]));
    expect(roles.fantasma).toBe("text");
    expect(legado).toEqual(["fantasma"]);
  });
});

describe("papelPorPalavraChave — o grep que o contrato aposenta", () => {
  // Estes casos são a razão de o contrato existir. Ficam registrados como
  // comportamento conhecido do fallback, não como comportamento desejável.
  it("erra em regra que não usa o vocabulário esperado", () => {
    expect(papelPorPalavraChave("converter Sim/Não para booleano")).toBe("text");
    expect(papelPorPalavraChave("remover pontos e traços do CPF")).toBe("text");
    expect(papelPorPalavraChave("padronizar em caixa alta")).toBe("text");
  });

  it("percentual só é reconhecido com as palavras certas", () => {
    expect(papelPorPalavraChave("taxa de conversao")).toBe("percent");
    // Mesma coluna, outra redação: perde a proteção de nunca-somar.
    expect(papelPorPalavraChave("razao entre vendas e visitas")).toBe("text");
  });
});
