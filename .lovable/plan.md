# Trocar conexão Supabase

Novo projeto: `rjwidarrsykufuifzunu` · publishable key: `sb_publishable_qIWV_YR3bixpsC09Y7-arg_TEHX-tY2`

## 1. Atualizar credenciais do frontend
Editar `.env`:
- `VITE_SUPABASE_PROJECT_ID="rjwidarrsykufuifzunu"`
- `VITE_SUPABASE_URL="https://rjwidarrsykufuifzunu.supabase.co"`
- `VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_qIWV_YR3bixpsC09Y7-arg_TEHX-tY2"`

Nenhuma outra alteração no client — `src/integrations/supabase/client.ts` já lê essas envs.

## 2. Recriar tabela `Leads` no novo projeto
Rodar migração no novo Supabase criando `public."Leads"` (id bigint identity PK, created_at timestamptz default now(), Nome text, Telefone text, Email text) com os GRANTs equivalentes ao projeto atual: `INSERT` para `anon` (form público de contato), `SELECT/INSERT/UPDATE/DELETE` para `authenticated`, `ALL` para `service_role`. Manter RLS desabilitado (igual estado atual) para não quebrar o formulário público — ou, se preferir, já habilitar RLS com policy `FOR INSERT TO anon WITH CHECK (true)` (mais seguro; me avise se quiser essa opção).

## 3. Redeployar edge function `plum-chat`
O código de `supabase/functions/plum-chat/index.ts` não muda — ele lê `LOVABLE_API_KEY` do ambiente. Após a troca de projeto, o Lovable redeploya automaticamente no novo Supabase.

**Ação sua depois do deploy:** confirmar/reconfigurar no novo projeto os secrets `LOVABLE_API_KEY` (auto-provisionado pelo Lovable) e, se você quiser manter o fallback Gemini, `GEMINI_API_KEY`. Vou verificar pós-deploy e te avisar o que falta.

## 4. Verificação
- Abrir preview, submeter o formulário de contato → checar que o lead aparece na tabela `Leads` do novo projeto.
- Enviar uma pergunta no chat inteligente → confirmar resposta (logs da função `plum-chat` no novo projeto).

## Observações
- O `.env` antigo referenciava `hdxzcfdcovydzjcwkugc`; nenhum lead existente será migrado — a nova base começa vazia.
- `src/integrations/supabase/types.ts` é regerado automaticamente após a migração.
- Confirme se quer RLS habilitado na `Leads` (recomendado) ou manter igual ao estado atual (desabilitado).
