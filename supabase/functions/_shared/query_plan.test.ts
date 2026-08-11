/**
 * Testes do único interpretador de Query Plan do sistema.
 *
 * Esta é a peça que aplica o RBAC de coluna. Se ela deixar passar uma
 * referência de coluna em qualquer posição do plano, um cargo lê dado que não
 * deveria, e nenhuma outra camada pega, porque as camadas abaixo confiam no
 * conjunto que sai daqui.
 *
 * Por isso o foco dos testes é cobertura de POSIÇÃO: as sete posições em que
 * um nome de coluna pode aparecer, mais aninhamento profundo no `where` e na
 * expressão aritmética.
 */

import { describe, expect, it } from "vitest";

import {
  authorizePlan,
  extractColumns,
  formattingRulesFromSchema,
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

  it("acha AS DUAS colunas de uma expressão aritmética em select", () => {
    const plan = {
      select: [{
        expr: { agg: "sum", col: { op: "mul", args: ["vendas_mes", "preco_unitario"] } },
        as: "receita_total",
      }],
    };
    expect(extractColumns(plan)).toEqual(new Set(["vendas_mes", "preco_unitario"]));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Expressão aritmética derivada
//
// `addCol` descarta calado tudo que não é string. Quando `col` deixou de ser
// sempre uma string, isso virou um buraco de verdade: um nó aritmético em `col`
// não contribuía com NENHUMA coluna, e o plano era autorizado sem que ninguém
// olhasse os operandos contra o allowed_columns do cargo.
//
// Estes testes existem para que esse buraco não volte em silêncio.
// ─────────────────────────────────────────────────────────────────────────────

describe("extractColumns — expressão aritmética", () => {
  it("recolhe operandos aninhados em qualquer profundidade", () => {
    const plan = {
      select: [{
        expr: {
          agg: "sum",
          col: {
            op: "mul",
            args: [
              { op: "sub", args: ["preco_unitario", { op: "add", args: ["custo", "frete"] }] },
              "vendas_mes",
            ],
          },
        },
        as: "margem",
      }],
    };
    expect(extractColumns(plan)).toEqual(
      new Set(["preco_unitario", "custo", "frete", "vendas_mes"]),
    );
  });

  it("aceita a forma com agg ao lado do operador", () => {
    const plan = {
      select: [{
        expr: { agg: "sum", op: "mul", args: ["vendas_mes", "preco_unitario"] },
        as: "receita",
      }],
    };
    expect(extractColumns(plan)).toEqual(new Set(["vendas_mes", "preco_unitario"]));
  });

  it("literal numérico não vira coluna", () => {
    const plan = {
      select: [{ expr: { agg: "sum", col: { op: "mul", args: ["preco_unitario", 0.9] } } }],
    };
    expect(extractColumns(plan)).toEqual(new Set(["preco_unitario"]));
  });

  it("recolhe operandos mesmo com operador desconhecido", () => {
    // Fail-closed. O executor recusa `pow`, mas a extração não pode APOSTAR
    // nisso: se um dia um operador novo entrar no Python e não aqui, a
    // consequência tem que ser plano barrado, nunca coluna não checada.
    const plan = {
      select: [{ expr: { agg: "sum", col: { op: "pow", args: ["base", "expoente"] } } }],
    };
    expect(extractColumns(plan)).toEqual(new Set(["base", "expoente"]));
  });

  it("aninhamento absurdo não estoura a pilha", () => {
    let no: Record<string, unknown> = { op: "mul", args: ["folha", 2] };
    for (let i = 0; i < 500; i++) no = { op: "mul", args: [no, 2] };
    const plan = { select: [{ expr: { agg: "sum", col: no } }] };
    expect(() => extractColumns(plan)).not.toThrow();
  });

  it("expressão aritmética que aparece dentro do where também é checada", () => {
    const plan = { where: { op: "mul", args: ["qtd", "preco"] } };
    expect(extractColumns(plan)).toEqual(new Set(["qtd", "preco"]));
  });
});

describe("authorizePlan — expressão aritmética", () => {
  it("barra o plano quando UM operando é proibido", () => {
    // O caso que importa: `vendas_mes` liberada, `preco_unitario` não. Antes da
    // extração enxergar dentro do nó, este plano passava inteiro.
    const plan = {
      select: [{
        expr: { agg: "sum", col: { op: "mul", args: ["vendas_mes", "preco_unitario"] } },
        as: "receita",
      }],
    };
    const veredito = authorizePlan(plan, ["vendas_mes"]);
    expect(veredito.allowed).toBe(false);
    expect(veredito.forbidden).toEqual(["preco_unitario"]);
  });

  it("libera quando o cargo vê os dois operandos", () => {
    const plan = {
      select: [{
        expr: { agg: "sum", col: { op: "mul", args: ["vendas_mes", "preco_unitario"] } },
        as: "receita",
      }],
    };
    const veredito = authorizePlan(plan, ["vendas_mes", "preco_unitario", "categoria"]);
    expect(veredito.allowed).toBe(true);
    // `required` vira o que o executor carrega da planilha: os operandos, e
    // nunca o alias — nenhuma planilha tem coluna chamada `receita`.
    expect(veredito.required).toEqual(["preco_unitario", "vendas_mes"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// order_by sobre alias do select
//
// `order_by` roda depois da agregação, sobre o frame de saída, então ali um nome
// pode ser um alias criado pelo próprio `select` em vez de coluna de origem.
// Exigir esse alias em `allowed_columns` barrava plano legítimo: era a causa de
// `investigacao-rbac-admin-colunas-negadas.md`, que procurou desalinhamento de
// dado por quatro hipóteses sem achar, porque o problema estava aqui.
// ─────────────────────────────────────────────────────────────────────────────

describe("extractColumns — alias de agregação em order_by", () => {
  // O plano exato que o Agente A gerou para "quais estudos tem?" em 2026-08-10.
  const planoReal = {
    from: "producao",
    target_columns: ["estudo"],
    select: ["estudo", { expr: { agg: "count", col: "estudo" }, as: "quantidade" }],
    group_by: ["estudo"],
    order_by: [{ col: "quantidade", dir: "desc" }],
    limit: 200,
  };

  it("não exige o alias do count como coluna de origem", () => {
    expect(extractColumns(planoReal)).toEqual(new Set(["estudo"]));
  });

  it("aprova o plano real com as colunas que o Admin tem de fato", () => {
    // As 7 colunas reais de `tabela-de-estudos.csv` em produção.
    const r = authorizePlan(planoReal, [
      "nome_do_estudo",
      "bacia",
      "estudo",
      "empresa",
      "natureza_da_aquisicao",
      "data_conclusao",
      "titularidade",
    ]);
    expect(r.allowed).toBe(true);
    expect(r.forbidden).toEqual([]);
    // `required` é o que o executor vai pedir ao sheets.py. Um alias aqui seria
    // MissingColumnError mesmo com o RBAC liberado — não existe na planilha.
    expect(r.required).toEqual(["estudo"]);
  });

  it("também dispensa o alias na forma string de order_by", () => {
    const plan = {
      select: [{ expr: { agg: "sum", col: "faturamento" }, as: "total" }],
      order_by: ["total"],
    };
    expect(extractColumns(plan)).toEqual(new Set(["faturamento"]));
  });

  it("alias que repete o nome de uma coluna real não some do required", () => {
    // O `as` coincide com a coluna de origem. Ela continua exigida, porque o
    // `expr.col` a referencia de verdade — quem manda é o conjunto, não a ordem.
    const plan = {
      select: [{ expr: { agg: "sum", col: "faturamento" }, as: "faturamento" }],
      order_by: [{ col: "faturamento", dir: "desc" }],
    };
    expect(extractColumns(plan)).toEqual(new Set(["faturamento"]));
  });
});

describe("extractColumns — o alias NÃO é atalho para coluna proibida", () => {
  const permitidas = ["faturamento", "regiao", "data_venda"];

  it("alias declarado no select não libera group_by pela mesma palavra", () => {
    // `group_by` é aplicado ANTES da agregação, sobre o frame de origem: ali
    // `margem_lucro` é leitura de coluna real, não referência ao resultado.
    // Se a dispensa de alias vazasse para cá, seria bypass de RBAC.
    const plan = {
      select: [{ expr: { agg: "count", col: "regiao" }, as: "margem_lucro" }],
      group_by: ["margem_lucro"],
    };
    const r = authorizePlan(plan, permitidas);
    expect(r.allowed).toBe(false);
    expect(r.forbidden).toContain("margem_lucro");
  });

  it("order_by por coluna proibida continua barrado quando não é alias", () => {
    const plan = {
      select: [{ expr: { agg: "count", col: "regiao" }, as: "quantidade" }],
      order_by: [{ col: "margem_lucro", dir: "desc" }],
    };
    const r = authorizePlan(plan, permitidas);
    expect(r.allowed).toBe(false);
    expect(r.forbidden).toEqual(["margem_lucro"]);
  });

  it("alias não libera a mesma palavra em target_columns nem no where", () => {
    const posicoes = [
      {
        select: [{ expr: { agg: "count", col: "regiao" }, as: "margem_lucro" }],
        target_columns: ["margem_lucro"],
      },
      {
        select: [{ expr: { agg: "count", col: "regiao" }, as: "margem_lucro" }],
        where: { left: "margem_lucro", op: ">", right: 0 },
      },
    ];
    for (const plan of posicoes) {
      const r = authorizePlan(plan, permitidas);
      expect(r.allowed, `${JSON.stringify(plan)} deveria ser barrada`).toBe(false);
      expect(r.forbidden).toContain("margem_lucro");
    }
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
// formattingRulesFromSchema — usado por dashboard-execute E ai-plum-chat
// ─────────────────────────────────────────────────────────────────────────────

describe("formattingRulesFromSchema", () => {
  const schema = {
    columns: {
      margem_lucro: {
        formatting_rule: { type: "percentual", params: {}, explicacao: "..." },
      },
      data_venda: {
        formatting_rule: { type: "data", params: { dayfirst: true }, explicacao: "..." },
      },
      faturamento: {
        formatting_rule: { type: "moeda_brl", params: {}, explicacao: "..." },
      },
      regiao: {
        formatting_rule: { type: "nenhuma", params: {}, explicacao: "..." },
      },
      cliente_antigo: { cleaning_rule: "Manter como texto" },
    },
  };

  it("extrai type e params de cada coluna pedida", () => {
    const regras = formattingRulesFromSchema(
      schema,
      new Set(["margem_lucro", "data_venda", "faturamento"]),
    );
    expect(regras).toEqual({
      margem_lucro: { type: "percentual", params: {} },
      data_venda: { type: "data", params: { dayfirst: true } },
      faturamento: { type: "moeda_brl", params: {} },
    });
  });

  it("só devolve regra para as colunas pedidas, mesmo com mais no schema", () => {
    const regras = formattingRulesFromSchema(schema, new Set(["margem_lucro"]));
    expect(Object.keys(regras)).toEqual(["margem_lucro"]);
  });

  it("cai em 'nenhuma' quando a coluna ainda está no formato antigo (cleaning_rule)", () => {
    const regras = formattingRulesFromSchema(schema, new Set(["cliente_antigo"]));
    expect(regras).toEqual({ cliente_antigo: { type: "nenhuma", params: {} } });
  });

  it("não quebra com schema_metadata sem 'columns' (base ainda não finalizada)", () => {
    expect(formattingRulesFromSchema({}, new Set(["x"]))).toEqual({});
    expect(formattingRulesFromSchema(null, new Set(["x"]))).toEqual({});
    expect(formattingRulesFromSchema(undefined, new Set(["x"]))).toEqual({});
  });
});
