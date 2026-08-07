import { defineConfig } from "vitest/config";

// Escopo deliberadamente estreito por enquanto: só o código compartilhado das
// Edge Functions. É lá que mora a peça que aplica o RBAC de coluna, que é a
// única parte do TypeScript onde um bug vira vazamento entre empresas.
//
// Componentes de React entram quando houver o que testar neles: hoje a tela do
// dashboard ainda não existe.
export default defineConfig({
  test: {
    include: ["supabase/functions/**/*.test.ts", "src/lib/**/*.test.ts"],
    environment: "node", // crypto.subtle vem do Node 18+, igual ao Deno
    reporters: "dot",
  },
});
