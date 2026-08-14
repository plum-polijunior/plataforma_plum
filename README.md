# Plataforma Plum

Plataforma multitenant de *Natural Language Query* sobre planilhas. O usuário conecta um Google
Sheets, a IA gera um dicionário semântico da base, e depois conversa com os dados em português.
**A IA nunca calcula: ela planeja, e o Python executa.** Read-only por construção.

## Comece aqui

| Você é… | Leia |
|---|---|
| 🤖 **um agente** (ou qualquer pessoa nova) | ⭐ **[`contexto/00-LEIA-PRIMEIRO.md`](contexto/00-LEIA-PRIMEIRO.md)** |
| 💻 vai **mexer no código** | [`CLAUDE.md`](CLAUDE.md) + o `CLAUDE.md` da pasta que vai tocar |
| 🧠 quer entender **o produto** | [`contexto/01-o-que-e-o-plum.md`](contexto/01-o-que-e-o-plum.md) |
| ⚠️ quer **não acreditar em coisa errada** | [`contexto/03-erros-comuns.md`](contexto/03-erros-comuns.md) |

⚠️ **Existem duas coisas chamadas "Plum":** a **plataforma** (multi-tenant, plug-and-play — uma
demo) e a **implementação** (vertical, por cliente — é o que se vende). Confundir as duas é o erro
mais caro do projeto: [`contexto/02-plataforma-vs-implementacao.md`](contexto/02-plataforma-vs-implementacao.md).

⚠️ `docs/` e `contexto/90-arquivo/` foram apagados em 2026-08-14. O porquê das decisões está em
[`contexto/30-decisoes.md`](contexto/30-decisoes.md).

## Rodar

```sh
npm install
npm run dev      # Vite em http://localhost:8080
npm run build    # typecheck + build — use como verificação
npm test         # vitest (RBAC de coluna, normalização, extração de URL)
npm run test:py  # pytest do query_engine
```

Detalhe de deploy, migrations e armadilhas: [`CLAUDE.md`](CLAUDE.md).

## Mapa rápido

```
src/                  front (React + Vite + Tailwind + shadcn)     → src/CLAUDE.md
supabase/functions/   Edge Functions (Deno) — chat, agentes        → supabase/functions/CLAUDE.md
supabase/migrations/  ⭐ única fonte de verdade do schema          → supabase/migrations/CLAUDE.md
query_engine/         executor pandas em AWS Lambda                → query_engine/CLAUDE.md
infra/aws/            como subir o executor (fonte única)
contexto/             ⭐ produto, negócio, decisões, pendências    → contexto/CLAUDE.md
skills/contexto-plum/ skill para manter contexto/ atualizado
zz_remake/            rascunhos da discussão do remake (histórico)
```

## Stack

React 18 + Vite 5 + TypeScript + Tailwind + shadcn/ui · Supabase (Postgres + RLS + Edge Functions) ·
Google Gemini · Python + pandas em AWS Lambda · Google Sheets API (`readonly`).
Front na Vercel; executor via GitHub Actions → ECR → Lambda.
