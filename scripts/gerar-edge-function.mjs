#!/usr/bin/env node
/**
 * Gera o arquivo único da Edge Function `dashboard-execute`, para colar no
 * painel do Supabase.
 *
 * POR QUE ISTO EXISTE
 *
 * A convenção deste projeto é colar o `index.ts` no painel. Arquivo colado não
 * pode ter import local, então a função precisa ser um arquivo só.
 *
 * Mas a peça que essa função importa (`_shared/query_plan.ts`) é justamente a
 * que aplica o RBAC de coluna: ela percorre o Query Plan e recusa o card quando
 * o cargo não pode ver alguma coluna referenciada. Se ela deixar passar uma
 * coluna em qualquer posição do plano, um cargo lê dado que não deveria, e
 * nenhuma camada abaixo pega, porque todas confiam no conjunto que sai dali.
 * Código assim não pode viver sem teste, e teste precisa de módulo importável.
 *
 * A saída seria copiar à mão e rezar. Em vez disso, este script GERA o arquivo
 * colável a partir dos dois fontes, e `query_plan.test.ts` tem um teste que
 * falha se o gerado estiver desatualizado. Ou seja: o que você cola é sempre o
 * mesmo código que os 28 testes exercitam.
 *
 * Uso:
 *   npm run gen:edge          gera
 *   npm run gen:edge -- --check   só confere se está atualizado (usado no teste)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

const COMPARTILHADO = join(raiz, "supabase/functions/_shared/query_plan.ts");
const FUNCAO = join(raiz, "supabase/functions/dashboard-execute/index.ts");
const SAIDA = join(
  raiz,
  "supabase/edge-functions/supabase_edge_function_dashboard_execute.ts",
);

const CABECALHO = `// =============================================================================
// ARQUIVO GERADO. NÃO EDITE ESTE ARQUIVO DIRETAMENTE.
// =============================================================================
//
// Este é o \`index.ts\` da Edge Function \`dashboard-execute\`, montado num arquivo
// só para poder ser colado no painel do Supabase (convenção deste projeto: ver
// supabase/edge-functions/README.md).
//
// Ele é gerado a partir de:
//   supabase/functions/_shared/query_plan.ts        (o único interpretador de
//                                                    Query Plan do sistema)
//   supabase/functions/dashboard-execute/index.ts   (a função em si)
//
// Para mudar qualquer coisa, edite os fontes acima e rode:
//
//     npm run gen:edge
//
// Se você editar aqui direto, a mudança some na próxima geração E deixa de ser
// coberta pelos testes. \`npm test\` falha quando este arquivo está
// desatualizado em relação aos fontes, justamente para isso não passar batido.
// =============================================================================

`;

/**
 * Normaliza para LF antes de qualquer coisa.
 *
 * O Git deste repositório converte para CRLF ao gravar no Windows. Uma regex
 * que termine em `\n` para de casar quando o arquivo tem `\r\n`, e o efeito é
 * silencioso: o import local sobrevive no arquivo gerado, e só se descobre
 * quando o painel do Supabase recusa a função. Normalizar aqui torna a
 * geração igual no Windows, no Mac e no Linux.
 */
function paraLF(codigo) {
  return codigo.replace(/\r\n/g, "\n");
}

/** Remove o import relativo: o conteúdo importado vem inline logo acima. */
function tiraImportLocal(codigo) {
  const semImport = codigo.replace(
    /import\s*\{[^}]*\}\s*from\s*["']\.\.\/_shared\/query_plan\.ts["'];?[ \t]*\n/,
    "",
  );
  // Procura um IMPORT de verdade, não qualquer menção ao caminho: o cabeçalho
  // do index.ts cita `_shared/query_plan.ts` em prosa, e uma checagem por
  // substring simples dava falso positivo e quebrava a geração.
  if (/from\s*["']\.{1,2}\//.test(semImport)) {
    // Falhar alto: um arquivo colável com import local é recusado pelo painel,
    // e descobrir isso lá é caro. Melhor quebrar a geração aqui.
    throw new Error(
      "Nao consegui remover o import local de dashboard-execute/index.ts.\n" +
        "A forma do import mudou? O gerador espera:\n" +
        '  import { ... } from "../_shared/query_plan.ts";',
    );
  }
  return semImport;
}

/** Tira o cabeçalho de docstring do módulo compartilhado, já explicado acima. */
function corpoDoCompartilhado(codigo) {
  return codigo.replace(/^\/\*\*[\s\S]*?\*\/\n/, "");
}

function montar() {
  const compartilhado = paraLF(readFileSync(COMPARTILHADO, "utf8"));
  const funcao = paraLF(readFileSync(FUNCAO, "utf8"));

  const separador =
    "\n// " + "=".repeat(75) + "\n" +
    "// Trecho vindo de supabase/functions/_shared/query_plan.ts\n" +
    "// Testado por supabase/functions/_shared/query_plan.test.ts (28 testes).\n" +
    "// " + "=".repeat(75) + "\n\n";

  const separador2 =
    "\n// " + "=".repeat(75) + "\n" +
    "// Trecho vindo de supabase/functions/dashboard-execute/index.ts\n" +
    "// " + "=".repeat(75) + "\n";

  return (
    CABECALHO +
    separador +
    corpoDoCompartilhado(compartilhado).trimEnd() +
    "\n" +
    separador2 +
    tiraImportLocal(funcao).trimEnd() +
    "\n"
  );
}

const conteudo = montar();

if (process.argv.includes("--check")) {
  let atual = "";
  try {
    atual = paraLF(readFileSync(SAIDA, "utf8"));
  } catch {
    console.error("Arquivo gerado não existe. Rode: npm run gen:edge");
    process.exit(1);
  }
  if (atual !== conteudo) {
    console.error(
      "O arquivo colável está DESATUALIZADO em relação aos fontes.\n" +
        "Rode: npm run gen:edge\n" +
        "Sem isso, o que você cola no painel não é o código que os testes cobrem.",
    );
    process.exit(1);
  }
  console.log("Arquivo colável está em dia com os fontes.");
} else {
  writeFileSync(SAIDA, conteudo, "utf8");
  const linhas = conteudo.split("\n").length;
  console.log(`Gerado: ${SAIDA.replace(raiz, ".")} (${linhas} linhas)`);
}
