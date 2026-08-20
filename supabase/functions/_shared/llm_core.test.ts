/**
 * Testes da abstração de provedor.
 *
 * ⭐ **O que mais importa aqui é a leitura de token.** Ela é a métrica principal
 * do `plum_logs` ("custo por pergunta"), e o modo de falha dela é silencioso:
 * campo com nome errado devolve `null`, o insert grava `null`, e ninguém
 * descobre até alguém tentar somar a coluna semanas depois. Já aconteceu uma
 * vez — o `usageMetadata` do Gemini era descartado por todo o repositório.
 *
 * O segundo grupo cobre a degradação por falta de chave, que é a diferença
 * entre "o remake não ficou bom" e "o planejador estava rodando em Flash".
 */

import { describe, expect, it } from "vitest";

import {
  MODELO_POR_PAPEL,
  type Papel,
  resolver,
  tokensDaAnthropic,
  tokensDoGemini,
} from "./llm_core.ts";

describe("leitura de token", () => {
  it("lê o formato do Gemini", () => {
    expect(
      tokensDoGemini({
        usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120 },
      }),
    ).toEqual({ entrada: 900, saida: 120 });
  });

  it("lê o formato da Anthropic, que é outro", () => {
    // ⭐ A razão de a função ter saído do `log_core.ts` no B05: lá ela era
    // `usageMetadata` para todo mundo. No dia em que o planejador virasse
    // Claude, "custo por pergunta" sairia nulo sem nada quebrar.
    expect(
      tokensDaAnthropic({ usage: { input_tokens: 4200, output_tokens: 310 } }),
    ).toEqual({ entrada: 4200, saida: 310 });
  });

  it("não confunde um formato com o outro", () => {
    expect(tokensDoGemini({ usage: { input_tokens: 10 } }).entrada).toBeNull();
    expect(tokensDaAnthropic({ usageMetadata: { promptTokenCount: 10 } }).entrada)
      .toBeNull();
  });

  it("devolve null em vez de estourar quando o formato muda", () => {
    // Formato de terceiro: pode mudar sem aviso, e nenhuma mudança dele pode
    // derrubar uma resposta que já foi gerada.
    for (const corpo of [null, undefined, {}, "texto", 42, { usage: null }]) {
      expect(tokensDoGemini(corpo)).toEqual({ entrada: null, saida: null });
      expect(tokensDaAnthropic(corpo)).toEqual({ entrada: null, saida: null });
    }
  });

  it("ignora contagem que não é número", () => {
    // A API já devolveu string em campo numérico. `Number("abc")` viraria NaN,
    // que o JSON serializa como `null` — mas só depois de passar por soma.
    expect(tokensDoGemini({ usageMetadata: { promptTokenCount: "900" } }).entrada)
      .toBeNull();
  });
});

describe("resolução de papel", () => {
  const PAPEIS = Object.keys(MODELO_POR_PAPEL) as Papel[];

  it("manda planejador e intérprete para a Anthropic quando há chave", () => {
    for (const papel of ["planejador", "interprete"] as Papel[]) {
      expect(resolver(papel, true)).toMatchObject({
        provedor: "anthropic",
        degradado: false,
      });
    }
  });

  it("⭐ marca como degradado quando cai no Gemini por falta de chave", () => {
    // Não é erro: a pergunta continua sendo respondida. Mas a cadeia é mais
    // fraca que a projetada, e a flag é o que faz isso aparecer no console e no
    // `plum_logs` em vez de virar uma suspeita seis semanas depois.
    const r = resolver("planejador", false);

    expect(r.degradado).toBe(true);
    expect(r.provedor).toBe("google");
  });

  it("não marca como degradado o papel que já era do Gemini", () => {
    expect(resolver("guard", false).degradado).toBe(false);
    expect(resolver("porteiro", false).degradado).toBe(false);
  });

  it("todo papel resolve para um destino, com ou sem chave", () => {
    // Papel novo sem linha na tabela devolveria `undefined` e estouraria dentro
    // do adaptador, longe da causa.
    for (const papel of PAPEIS) {
      for (const temChave of [true, false]) {
        const r = resolver(papel, temChave);
        expect(r.modelo, papel).toBeTruthy();
        expect(["google", "anthropic"]).toContain(r.provedor);
      }
    }
  });

  it("as três ações do caminho atual não mudaram de modelo", () => {
    // ⚠️ O B05 não pode alterar o comportamento do chat legado: ele é o que
    // responde as perguntas hoje, e a linha de base do remake foi medida com
    // este modelo.
    for (const papel of ["guard", "plan_query", "synthesize_answer"] as Papel[]) {
      expect(resolver(papel, true)).toMatchObject({
        provedor: "google",
        modelo: "gemini-3.5-flash",
      });
    }
  });
});
