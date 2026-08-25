import { defineConfig } from "vitest/config";

/**
 * A suíte de avaliação do `ad_hoc` (B17) — config SEPARADA, de propósito.
 *
 * ⛔ Ela chama modelo de verdade e o executor real. No `npm test` ficaria cara e
 * instável, e o I-10 já mostrou o custo de um teste que falha por motivo alheio
 * ao código: some a confiança na suíte inteira, não só naquele teste.
 *
 * ⭐ **O isolamento é por DOIS mecanismos, não um.** O `vitest.config.ts` inclui
 * `*.test.ts`, e este arquivo é `*.eval.ts` — então nem um config alcança o
 * outro por acidente. Depender só do `include` do outro arquivo deixaria a suíte
 * cara a um rename de distância de entrar no CI.
 *
 *     npm run avaliacao
 *
 * Precisa de PLUM_URL, PLUM_ANON_KEY, PLUM_JWT e PLUM_DATASET_ID no ambiente —
 * sem eles a suíte se pula com um aviso, em vez de falhar. Ver o cabeçalho de
 * `testes/avaliacao/avaliacao.eval.ts`.
 */
export default defineConfig({
  test: {
    include: ["testes/avaliacao/**/*.eval.ts"],
    environment: "node",
    // ⚠️ Sequencial: as perguntas compartilham a cota do Gemini e o orçamento de
    // linhas brutas do B10 (200 por pessoa, por base, por dia). Em paralelo, uma
    // pergunta reprovaria por falta de saldo que outra gastou, e o diagnóstico
    // apontaria para o prompt errado.
    fileParallelism: false,
    sequence: { concurrent: false },
    // O planejador é modelo de raciocínio: lento por construção.
    testTimeout: 120_000,
    // `verbose` porque a metade de JULGAMENTO é o que sai no console — um
    // reporter compacto esconderia justamente o que o humano tem de ler.
    reporters: "verbose",
  },
});
