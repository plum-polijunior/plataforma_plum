-- =========================================================================
-- ROLLBACK — desfaz a migration 20260803120000_chat_core
-- =========================================================================
-- Use SÓ se quiser reverter o chat. Remove exatamente o que a migration criou.
-- NÃO toca em nenhuma tabela pré-existente (organizations, profiles, datasets,
-- roles, role_permissions continuam intactas).
--
-- Como rodar: cole no SQL Editor do Supabase e clique Run (ou psql).
-- Idempotente: pode rodar mais de uma vez sem erro.
-- =========================================================================

-- Dropar as tabelas remove em cascata: políticas RLS, índices, triggers e a
-- entrada no publication supabase_realtime (não precisa de ALTER PUBLICATION).
DROP TABLE IF EXISTS public.messages      CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;
DROP TABLE IF EXISTS public.assistants    CASCADE;

-- Função utilitária criada pela migration.
DROP FUNCTION IF EXISTS public.touch_updated_at() CASCADE;

-- Enums criados pela migration (só caem se nenhuma coluna ainda os usar — as
-- tabelas acima já foram removidas).
DROP TYPE IF EXISTS public.chat_direcao;
DROP TYPE IF EXISTS public.chat_canal;

-- Fim do rollback chat_core.
