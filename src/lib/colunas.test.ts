/**
 * Contrato de normalização de nome de coluna — lado TypeScript.
 *
 * ⚠️ A tabela `CASOS_CONTRATO` abaixo é REPLICADA em
 * `query_engine/tests/test_sheets.py` (`_CASOS_CONTRATO`). Ela existe porque a
 * mesma transformação vive em duas linguagens e não há como compartilhar o
 * código entre o browser e o Lambda. Mudou um caso aqui? Mude lá também, ou um
 * dos dois testes fica vermelho — que é exatamente o ponto.
 *
 * Os casos com `ESTUDO`, `NATUREZA DA AQUISIÇÃO` e cabeçalho vazio são a
 * planilha real que expôs o problema em 2026-08-11.
 */

import { describe, expect, it } from "vitest";

import { normalizarNomeDeColuna } from "./colunas";

// [entrada, saida esperada]
const CASOS_CONTRATO: [string, string][] = [
  // A planilha real: cabeçalho em maiúscula, com acento.
  ["BACIA", "bacia"],
  ["ESTUDO", "estudo"],
  ["EMPRESA", "empresa"],
  ["NATUREZA DA AQUISIÇÃO", "natureza_da_aquisicao"],
  ["DATA CONCLUSÃO", "data_conclusao"],
  ["TITULARIDADE", "titularidade"],
  ["NOME DO ESTUDO", "nome_do_estudo"],

  // Acentuação em todas as formas que aparecem em português.
  ["Ação", "acao"],
  ["Preço Médio", "preco_medio"],
  ["Região", "regiao"],
  ["Município", "municipio"],
  ["Área (m²)", "area_m"],

  // Já normalizado: idempotente.
  ["faturamento", "faturamento"],
  ["nome_do_estudo", "nome_do_estudo"],

  // Pontuação e espaços colapsam num único separador.
  ["Faturamento / Receita", "faturamento_receita"],
  ["  espaço  duplo  ", "espaco_duplo"],
  ["A--B__C", "a_b_c"],
  ["Total (R$)", "total_r"],
  ["% de Margem", "de_margem"],

  // Vazio e degenerado: string vazia, nunca um nome inventado.
  ["", ""],
  ["   ", ""],
  ["---", ""],
  ["%", ""],

  // Dígitos sobrevivem; o resto vira separador.
  ["2026", "2026"],
  ["Vendas 2026", "vendas_2026"],
  ["CNPJ/CPF", "cnpj_cpf"],
];

describe("normalizarNomeDeColuna — contrato com o Python", () => {
  for (const [entrada, esperado] of CASOS_CONTRATO) {
    it(`${JSON.stringify(entrada)} -> ${JSON.stringify(esperado)}`, () => {
      expect(normalizarNomeDeColuna(entrada)).toBe(esperado);
    });
  }

  it("é idempotente: normalizar duas vezes não muda", () => {
    // Importa porque o nome normalizado é gravado e depois renormalizado do
    // outro lado; se não fosse idempotente, a segunda passagem divergiria.
    for (const [entrada] of CASOS_CONTRATO) {
      const uma = normalizarNomeDeColuna(entrada);
      expect(normalizarNomeDeColuna(uma)).toBe(uma);
    }
  });

  it("nunca devolve _ nas pontas nem _ repetido", () => {
    for (const [entrada] of CASOS_CONTRATO) {
      const saida = normalizarNomeDeColuna(entrada);
      expect(saida).not.toMatch(/^_|_$/);
      expect(saida).not.toMatch(/__/);
    }
  });
});
