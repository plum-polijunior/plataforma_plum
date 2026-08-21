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
  MODELOS,
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

  it("⭐ planejador e intérprete usam o modelo de raciocínio", () => {
    // Eles carregam a parte difícil: o Query Plan e a prosa que não pode fazer
    // conta. Se algum deles cair para o Flash, a cadeia ficou mais fraca que a
    // projetada — e o `plum_logs.modelo` é onde isso aparece.
    for (const papel of ["planejador", "interprete"] as Papel[]) {
      expect(resolver(papel, true), papel).toMatchObject({
        modelo: MODELOS.RACIOCINIO,
        degradado: false,
      });
    }
  });

  it("⚠️ o modelo de raciocínio NÃO é o mesmo do porteiro", () => {
    // Guarda contra uma economia acidental: apontar tudo para o Flash faria o
    // custo cair e a qualidade também, e nada quebraria para avisar.
    expect(MODELOS.RACIOCINIO).not.toBe(MODELOS.FLASH);
  });

  it("nenhum papel depende da chave da Anthropic hoje", () => {
    // ⚠️ Desde 2026-08-21 a tabela inteira aponta para o Google. A degradação
    // por falta de chave continua implementada e inalcançável — de propósito:
    // voltar um papel para a Anthropic é editar uma linha, e a rede tem de estar
    // lá quando isso acontecer.
    for (const papel of Object.keys(MODELO_POR_PAPEL) as Papel[]) {
      expect(resolver(papel, false).degradado, papel).toBe(false);
    }
  });

  it("a degradação continua funcionando para quem apontar à Anthropic", () => {
    // Exercita o caminho que a tabela hoje não usa. Sem este teste, ele
    // apodreceria — e o dia em que alguém voltasse um papel para a Anthropic
    // descobriria na produção.
    const anthropic = { provedor: "anthropic" as const, modelo: "claude-opus-5" };
    const tabela = { ...MODELO_POR_PAPEL, planejador: anthropic };
    const destino = tabela.planejador;

    expect(destino.provedor).toBe("anthropic");
    // A regra em si: papel da Anthropic sem chave cai no Gemini, marcado.
    expect(resolver("plan_query", false).provedor).toBe("google");
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

  it("⭐ as duas cadeias usam exatamente o mesmo Flash", () => {
    // A Etapa 1 compara o `ad_hoc` com o `legado`. Se as duas cadeias rodassem
    // em modelos diferentes, a comparação ficaria contaminada: não daria para
    // saber se o remake ficou melhor ou se só ganhou um modelo mais novo.
    const legado: Papel[] = ["guard", "plan_query", "synthesize_answer"];
    const novo: Papel[] = ["porteiro", "reconhecedor"];

    for (const papel of [...legado, ...novo]) {
      expect(resolver(papel, true), papel).toMatchObject({
        provedor: "google",
        modelo: MODELOS.FLASH,
      });
    }
  });

  it("nenhum identificador de modelo aparece solto na tabela", () => {
    // ⚠️ O literal `gemini-3.5-flash` aparecia cinco vezes aqui, e subir de
    // versão era cinco edições com quatro chances de esquecer uma. Este teste
    // é o que impede a repetição de voltar.
    const conhecidos: string[] = Object.values(MODELOS);
    for (const [papel, destino] of Object.entries(MODELO_POR_PAPEL)) {
      expect(conhecidos, papel).toContain(destino.modelo);
    }
  });
});
