/**
 * A normalização da saída do A2 encaminhador, e o índice que ele lê.
 *
 * ⚠️ Testa `normalizar` e `paraIndice`, não `encaminhar` — este último chama
 * modelo de verdade. A regra do repo é a mesma do `llm_core`/`log_core`: o miolo
 * puro é testado, a chamada de rede fica para a suíte de avaliação.
 *
 * ⭐ O invariante que atravessa o arquivo: **nada aqui levanta.** O A2 está no
 * caminho crítico de toda pergunta, e um `throw` por causa de um id com um
 * caractere a mais transformaria pergunta respondível em chat morto.
 */

import { describe, expect, it } from "vitest";

import { normalizar } from "./encaminhador_core.ts";
import {
  A3_PLANEJADOR,
  A3_TENDENCIA_DE_TESTE,
  REGISTRO_DE_TESTE,
} from "../../_shared/agentes.ts";
import {
  type BaseNoIndice,
  lerDicionario,
  paraIndice,
} from "../../_shared/dicionario.ts";

function base(nome: string, cru: Record<string, unknown>): BaseNoIndice {
  return { nome, dicionario: lerDicionario(cru) };
}

const VENDAS = base("vendas_2026", {
  versao: 2,
  grao: "uma venda",
  columns: {
    data_venda: { papel_analitico: "temporal", formatting_rule: { type: "data" } },
    faturamento: {
      papel_analitico: "medida",
      semantic_definition: "receita bruta, sem impostos",
      formatting_rule: { type: "moeda_brl" },
    },
    regiao: { papel_analitico: "dimensao" },
  },
});

const ESTOQUE = base("estoque", {
  versao: 2,
  grao: "um produto em um depósito",
  columns: {
    produto: { papel_analitico: "dimensao" },
    quantidade: { papel_analitico: "medida" },
  },
});

const ENTRADA = { pergunta: "quanto vendi?", bases: [VENDAS, ESTOQUE] };

describe("paraIndice — o insumo BARATO do A2", () => {
  const texto = paraIndice([VENDAS, ESTOQUE]);

  it("traz o nome e o grão de cada base", () => {
    expect(texto).toContain("vendas_2026");
    expect(texto).toContain("uma venda");
    expect(texto).toContain("um produto em um depósito");
  });

  it("agrupa as colunas por papel — é o que decide se um especialista cabe", () => {
    // "tem coluna temporal?" é a pergunta que diz se um `a3_tendencia`
    // conseguiria trabalhar naquela base.
    expect(texto).toMatch(/temporal:\s*data_venda/);
    expect(texto).toMatch(/medida:\s*faturamento/);
  });

  it("⛔ NÃO traz o conceito das colunas — e é o ponto do índice", () => {
    // ⚠️ Se o conceito entrasse aqui, o custo do dicionário completo teria sido
    // MOVIDO para o A2 em vez de resolvido, e o A2 seria gasto puro.
    expect(texto).not.toContain("receita bruta, sem impostos");
  });

  it("é bem menor que o dicionário completo", () => {
    // Guarda-corpo contra alguém "enriquecer" o índice até ele empatar com o
    // dicionário — momento em que o A2 deixa de economizar qualquer coisa.
    expect(texto.length).toBeLessThan(700);
  });

  it("ordem das colunas é estável, não a de inserção", () => {
    // Sem isto o mesmo índice sairia diferente entre execuções, e a escolha do
    // A2 mudaria sem nada ter mudado na base.
    const invertida = base("x", {
      versao: 2,
      columns: { zebra: { papel_analitico: "dimensao" }, alfa: { papel_analitico: "dimensao" } },
    });
    expect(paraIndice([invertida])).toMatch(/dimensao:\s*alfa, zebra/);
  });

  it("marca base não conferida em vez de esconder", () => {
    // Esconder faria a pergunta parecer impossível em vez de arriscada.
    const v1 = base("antiga", { columns: { a: {} } });
    expect(paraIndice([v1])).toContain("não conferido");
    expect(paraIndice([v1])).toContain("antiga");
  });

  it("nenhuma base não quebra", () => {
    expect(paraIndice([])).toContain("nenhuma base");
  });
});

describe("normalizar — a escolha das bases", () => {
  it("aceita as bases que existem", () => {
    const r = normalizar(
      { agente: A3_PLANEJADOR, bases: ["vendas_2026"], presuncao: "só Vendas." },
      ENTRADA,
      REGISTRO_DE_TESTE,
    );
    expect(r.bases).toEqual(["vendas_2026"]);
    expect(r.presuncao).toBe("só Vendas.");
    expect(r.inviavel).toBe("");
  });

  it("⛔ DESCARTA nome de base aproximado, e registra o descarte", () => {
    // "Vendas" em vez de "vendas_2026" viraria `from` inexistente no executor e
    // card vazio. Descartar aqui é o que permite logar o que foi descartado.
    const r = normalizar(
      { agente: A3_PLANEJADOR, bases: ["Vendas", "estoque"] },
      ENTRADA,
      REGISTRO_DE_TESTE,
    );
    expect(r.bases).toEqual(["estoque"]);
    expect(r.basesDescartadas).toEqual(["Vendas"]);
  });

  it("deduplica base repetida", () => {
    // Repetida viraria dicionário duplicado no prompt do A3, e ele contaria a
    // mesma planilha duas vezes.
    const r = normalizar(
      { agente: A3_PLANEJADOR, bases: ["estoque", "estoque"] },
      ENTRADA,
      REGISTRO_DE_TESTE,
    );
    expect(r.bases).toEqual(["estoque"]);
  });

  it("respeita a escolha de DUAS bases", () => {
    const r = normalizar(
      { agente: A3_PLANEJADOR, bases: ["vendas_2026", "estoque"] },
      ENTRADA,
      REGISTRO_DE_TESTE,
    );
    expect(r.bases).toHaveLength(2);
  });

  it("todas as bases descartadas ⇒ cai em TODAS, não em inviável", () => {
    // ⚠️ Zero bases por erro de NOME não é "a pergunta é impossível". Dizer
    // inviável aqui mentiria para o usuário sobre a base dele.
    const r = normalizar(
      { agente: A3_PLANEJADOR, bases: ["nada", "nem_isso"] },
      ENTRADA,
      REGISTRO_DE_TESTE,
    );
    expect(r.bases).toEqual(["vendas_2026", "estoque"]);
    expect(r.inviavel).toBe("");
    expect(r.basesDescartadas).toEqual(["nada", "nem_isso"]);
  });
});

describe("normalizar — inviável", () => {
  it("passa o inviável adiante, com bases vazias", () => {
    const r = normalizar(
      { inviavel: "nenhuma base tem dados de RH." },
      ENTRADA,
      REGISTRO_DE_TESTE,
    );
    expect(r.inviavel).toBe("nenhuma base tem dados de RH.");
    expect(r.bases).toEqual([]);
  });

  it("⚠️ inviável JUNTO com base válida: a base ganha", () => {
    // Contradição do modelo. Escolher a base é a leitura conservadora — dizer
    // "impossível" com uma base boa na mão perderia uma resposta que existia.
    const r = normalizar(
      { agente: A3_PLANEJADOR, bases: ["estoque"], inviavel: "não sei" },
      ENTRADA,
      REGISTRO_DE_TESTE,
    );
    expect(r.bases).toEqual(["estoque"]);
    expect(r.inviavel).toBe("");
  });
});

describe("normalizar — a escolha do agente", () => {
  it("⭐⭐ um especialista É escolhido quando o modelo o pede", () => {
    // Este é o teste que torna o roteamento FALSIFICÁVEL na unidade. Com um
    // agente só em produção, o A2 sempre "acerta" e não haveria como distinguir
    // roteador funcionando de roteador quebrado. Ver I-13.
    const r = normalizar(
      { agente: A3_TENDENCIA_DE_TESTE, bases: ["vendas_2026"] },
      ENTRADA,
      REGISTRO_DE_TESTE,
    );
    expect(r.agente.id).toBe(A3_TENDENCIA_DE_TESTE);
    expect(r.agenteInvalido).toBe(false);
  });

  it("id inventado cai no generalista e marca `agenteInvalido`", () => {
    const r = normalizar(
      { agente: "a3_que_nao_existe", bases: ["estoque"] },
      ENTRADA,
      REGISTRO_DE_TESTE,
    );
    expect(r.agente.id).toBe(A3_PLANEJADOR);
    expect(r.agenteInvalido).toBe(true);
    // ⭐ E o resto da escolha sobrevive: agente errado não invalida a base.
    expect(r.bases).toEqual(["estoque"]);
  });

  it("especialista de teste NÃO é alcançável pelo registro de produção", () => {
    // Sem o registro de teste explícito, pedir o `a3_tendencia` cai no padrão.
    const r = normalizar({ agente: A3_TENDENCIA_DE_TESTE, bases: ["estoque"] }, ENTRADA);
    expect(r.agente.id).toBe(A3_PLANEJADOR);
    expect(r.agenteInvalido).toBe(true);
  });
});

describe("normalizar nunca levanta", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["string", "a3_planejador"],
    ["array", [1, 2]],
    ["número", 42],
    ["objeto vazio", {}],
    ["bases não-array", { bases: "vendas_2026" }],
    ["bases com lixo", { bases: [null, 3, {}, "estoque"] }],
    ["campos com tipo errado", { agente: 1, bases: [2], presuncao: {}, inviavel: [] }],
  ])("%s vira encaminhamento utilizável", (_rotulo, bruto) => {
    expect(() => normalizar(bruto, ENTRADA, REGISTRO_DE_TESTE)).not.toThrow();
    const r = normalizar(bruto, ENTRADA, REGISTRO_DE_TESTE);
    // Sempre dá para seguir: ou há base escolhida, ou há um inviável a mostrar.
    expect(r.bases.length > 0 || r.inviavel.length > 0).toBe(true);
    expect(r.agente.id).toBeTruthy();
  });

  it("⭐ o fallback DECLARA que não escolheu, quando há mais de uma base", () => {
    // Achado em revisão: presunção vazia no fallback esconderia do usuário que
    // ninguém escolheu base — a informação que a presunção existe para dar.
    const r = normalizar({ bases: ["nada"] }, ENTRADA, REGISTRO_DE_TESTE);
    expect(r.bases).toHaveLength(2);
    expect(r.presuncao).toContain("todas as 2 bases");
  });

  it("com UMA base o fallback não declara nada — não houve escolha", () => {
    const r = normalizar({ bases: ["nada"] }, { pergunta: "x", bases: [VENDAS] });
    expect(r.bases).toEqual(["vendas_2026"]);
    expect(r.presuncao).toBe("");
  });

  it("organização sem base nenhuma não quebra", () => {
    const r = normalizar({ agente: A3_PLANEJADOR, bases: [] }, {
      pergunta: "x",
      bases: [],
    });
    expect(r.bases).toEqual([]);
    expect(r.agente.id).toBe(A3_PLANEJADOR);
  });
});
