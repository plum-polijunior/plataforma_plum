/**
 * O registro de agentes — um dono, dois consumidores.
 *
 * ⭐ O teste que dá nome ao arquivo é `TestRegistroEDonoUnico`: acrescentar um
 * agente muda o prompt **e** o despacho sem editar mais nada. Se algum dia
 * exigir uma segunda edição, é aqui que se descobre — e a resposta certa é
 * consertar o acoplamento, não relaxar o teste.
 */

import { describe, expect, it } from "vitest";

import {
  A3_PLANEJADOR,
  A3_TENDENCIA_DE_TESTE,
  type Agente,
  paraPrompt,
  REGISTRO,
  REGISTRO_DE_TESTE,
  resolver,
} from "./agentes.ts";

describe("o registro é o dono único", () => {
  it("acrescentar um agente muda o PROMPT sem editar prompt", () => {
    const inventado: Agente = {
      id: "a3_inventado",
      papel: "planejador",
      quandoUsar: "uma frase que só existe neste teste",
      capacidades: ["capacidade inventada"],
    };
    const texto = paraPrompt([...REGISTRO, inventado]);

    expect(texto).toContain("a3_inventado");
    expect(texto).toContain("uma frase que só existe neste teste");
    expect(texto).toContain("capacidade inventada");
  });

  it("acrescentar um agente muda o DESPACHO sem editar switch", () => {
    const inventado: Agente = {
      id: "a3_inventado",
      papel: "planejador",
      quandoUsar: "x",
      capacidades: [],
    };
    const { agente, caiuNoPadrao } = resolver(
      "a3_inventado",
      [...REGISTRO, inventado],
    );
    expect(agente.id).toBe("a3_inventado");
    expect(caiuNoPadrao).toBe(false);
  });

  it("o prompt lista todo agente do registro, sem exceção", () => {
    const texto = paraPrompt(REGISTRO_DE_TESTE);
    for (const a of REGISTRO_DE_TESTE) {
      // Um agente que existe no despacho e não no prompt nunca seria escolhido:
      // o modelo não sabe que ele existe.
      expect(texto).toContain(a.id);
    }
  });
});

describe("resolver nunca derruba o chat", () => {
  it("id desconhecido cai no generalista, e AVISA que caiu", () => {
    const { agente, caiuNoPadrao } = resolver("a3_que_nao_existe");
    expect(agente.id).toBe(A3_PLANEJADOR);
    // ⚠️ O aviso é o ponto. Um fallback que ninguém mede é um roteador que
    // parou de funcionar sem avisar — sobe como `codigo_erro` no `plum_logs`.
    expect(caiuNoPadrao).toBe(true);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["número", 7],
    ["objeto", { id: "a3_planejador" }],
    ["string vazia", ""],
    ["array", ["a3_planejador"]],
  ])("%s cai no generalista em vez de levantar", (_rotulo, entrada) => {
    expect(() => resolver(entrada)).not.toThrow();
    expect(resolver(entrada).agente.id).toBe(A3_PLANEJADOR);
  });

  it("tolera espaço em volta do id", () => {
    // O modelo às vezes devolve `" a3_planejador "`. Recusar por isso seria
    // trocar uma resposta boa por um fallback logado como erro.
    const { caiuNoPadrao } = resolver("  a3_planejador  ");
    expect(caiuNoPadrao).toBe(false);
  });

  it("⛔ LEVANTA quando o registro não tem o generalista", () => {
    // Este é erro de programação, não de modelo: não há para onde cair. Falhar
    // alto aqui é certo — o oposto de todos os casos acima.
    const semPadrao: Agente[] = [{
      id: "a3_so_especialista",
      papel: "planejador",
      quandoUsar: "x",
      capacidades: [],
    }];
    expect(() => resolver("qualquer", semPadrao)).toThrow(/sem o padrao/);
  });
});

describe("o registro de produção", () => {
  it("tem o generalista", () => {
    expect(REGISTRO.some((a) => a.id === A3_PLANEJADOR)).toBe(true);
  });

  it("⛔ NÃO contém nenhuma entrada de teste", () => {
    // ⚠️ O `a3_tendencia` de mentira existe para falsificar o roteamento na
    // suíte. Vazar para produção faria o A2 encaminhar perguntas de tendência
    // para um agente que não existe — e o fallback esconderia isso.
    expect(REGISTRO.some((a) => a.soParaTeste)).toBe(false);
    expect(REGISTRO.some((a) => a.id === A3_TENDENCIA_DE_TESTE)).toBe(false);
  });

  it("ids são ASCII, sem acento e sem espaço", () => {
    // `a3_tendência` com acento em nome de arquivo/id é a armadilha; o repo usa
    // ASCII. E id com espaço não sobrevive a um `trim` do modelo.
    for (const a of REGISTRO_DE_TESTE) {
      expect(a.id).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("nenhum id repetido", () => {
    const ids = REGISTRO_DE_TESTE.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todo agente diz QUANDO usar — é o que o A2 lê para decidir", () => {
    for (const a of REGISTRO_DE_TESTE) {
      expect(a.quandoUsar.length).toBeGreaterThan(20);
    }
  });
});
