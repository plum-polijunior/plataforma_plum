# Plum — Landing Page

Aplicação single-page em React + Vite + TypeScript, com Tailwind CSS, shadcn/ui, Framer Motion e integração com Supabase (formulário de leads + edge function de chat).

## Requisitos

- Node.js 18+ (recomendado 20+)
- npm (ou pnpm/bun/yarn)

## Setup local

```sh
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# edite .env com as credenciais do seu projeto Supabase

# 3. Rodar em modo dev (http://localhost:8080)
npm run dev
```

## Scripts

- `npm run dev` — servidor de desenvolvimento (Vite) na porta 8080
- `npm run build` — build de produção em `dist/`
- `npm run build:dev` — build em modo development (source maps completos)
- `npm run preview` — servir o build localmente
- `npm run lint` — ESLint

## Variáveis de ambiente

Ver `.env.example`. Todas prefixadas com `VITE_` (expostas ao bundle do cliente — a segurança dos dados depende das políticas RLS no Supabase).

## Estrutura

- `src/pages/` — rotas (`Index`, `NotFound`)
- `src/components/sections/` — seções da landing (Hero, About, Playground, Features, FAQ, Location, Contact)
- `src/components/ui/` — componentes shadcn/ui
- `src/integrations/supabase/` — cliente Supabase e tipos gerados
- `supabase/functions/plum-chat/` — edge function do chat (deploy via Supabase CLI)
- `supabase/migrations/` — migrações SQL

## Supabase

O projeto usa uma tabela `Leads` (formulário de contato) e a edge function `plum-chat` (chat inteligente, requer o secret `LOVABLE_API_KEY` ou `GEMINI_API_KEY` configurado no projeto Supabase).

Para aplicar as migrações e deployar a edge function localmente:

```sh
npx supabase link --project-ref <seu-project-ref>
npx supabase db push
npx supabase functions deploy plum-chat
```

## Stack

Vite · React 18 · TypeScript · Tailwind CSS · shadcn/ui · Framer Motion · React Router · TanStack Query · Supabase JS
