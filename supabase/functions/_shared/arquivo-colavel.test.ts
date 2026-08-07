/**
 * O arquivo que se cola no painel precisa ser o MESMO código que os testes
 * cobrem.
 *
 * `supabase/edge-functions/supabase_edge_function_dashboard_execute.ts` é
 * gerado a partir de `_shared/query_plan.ts` e `dashboard-execute/index.ts`.
 * Se alguém editar um dos fontes e esquecer de rodar `npm run gen:edge`, o
 * arquivo colado no Supabase passa a ser uma versão antiga.
 *
 * Isso é perigoso justamente porque falha em silêncio: o painel continua
 * rodando, os testes continuam verdes, e a peça que aplica o RBAC de coluna em
 * produção é uma cópia velha da que foi testada.
 *
 * Estes testes fecham essa porta.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const COLAVEL = join(
  raiz,
  "supabase/edge-functions/supabase_edge_function_dashboard_execute.ts",
);

describe("arquivo colável da Edge Function", () => {
  it("está em dia com os fontes", () => {
    // O gerador sai com código 1 e explica o que fazer quando está velho.
    expect(() =>
      execFileSync(
        process.execPath,
        [join(raiz, "scripts/gerar-edge-function.mjs"), "--check"],
        { stdio: "pipe" },
      )
    ).not.toThrow();
  });

  it("não tem import local, porque arquivo colado não resolve caminho relativo", () => {
    const conteudo = readFileSync(COLAVEL, "utf8");
    const importsLocais = conteudo.match(/from\s+["']\.{1,2}\//g) ?? [];
    expect(importsLocais).toEqual([]);
  });

  it("é texto puro, sem byte nulo nem caractere de controle", () => {
    // Ele vai ser colado num campo de texto do navegador. Byte nulo não
    // sobrevive a copiar e colar, e sumiria em silêncio: a impressão digital
    // calculada no painel passaria a ser outra, e nenhum snapshot já gravado
    // seria encontrado. O sintoma seria "o cache nunca acerta", sem nada
    // apontando para a causa.
    const bytes = readFileSync(COLAVEL);
    const proibidos = [...bytes].filter(
      (b) => b < 32 && b !== 9 && b !== 10 && b !== 13,
    );
    expect(proibidos).toEqual([]);
  });

  it("carrega as quatro peças que aplicam segurança", () => {
    const conteudo = readFileSync(COLAVEL, "utf8");
    for (const peca of [
      "function extractColumns", // percorre as 6 posições do plano
      "function authorizePlan", // recusa coluna fora da permissão
      "function permissionsFingerprint", // chave do cache, invalida sozinha
      "function signPayload", // HMAC do payload para o executor
    ]) {
      expect(conteudo, `faltou: ${peca}`).toContain(peca);
    }
  });

  it("avisa em letras garrafais que não deve ser editado à mão", () => {
    const conteudo = readFileSync(COLAVEL, "utf8");
    expect(conteudo).toContain("ARQUIVO GERADO");
    expect(conteudo).toContain("npm run gen:edge");
  });
});
