-- =========================================================================
-- INTEGRAÇÃO COM A BRANCH `plataforma` — coluna `sketch` e caixa de 'Admin'
-- =========================================================================
-- Projeto: PLUM 2.0 · branch `fix/escalonamento-privilegio-sso`
-- Data: 2026-07-22
--
-- Surgiu ao mesclar o commit 941856d ("repaginada em /dashboard/database"),
-- que trouxe o rascunho automático do pipeline de base de dados.
--
-- Idempotente. Não destrutivo.
-- =========================================================================


-- -------------------------------------------------------------------------
-- 1. Coluna `datasets.sketch`
-- -------------------------------------------------------------------------
-- O commit 941856d adicionou `sketch jsonb` ao bloco CREATE TABLE de
-- `login_supabase.sql`. Aquele bloco usa CREATE TABLE IF NOT EXISTS: num
-- banco onde `datasets` já existe, ele é ignorado por completo e a coluna
-- NÃO é criada.
--
-- Resultado: a coluna passou a ser usada pelo front (DatabasePipeline.tsx
-- grava e lê `sketch`) sem nenhuma migration que a crie. Se ela existe hoje
-- em produção, foi adicionada à mão pelo painel — sem rastro.
--
-- Este ALTER resolve os dois casos: cria se faltar, não faz nada se já
-- existir, e passa a existir no histórico versionado.
ALTER TABLE public.datasets
    ADD COLUMN IF NOT EXISTS sketch JSONB;

COMMENT ON COLUMN public.datasets.sketch IS
  'Rascunho do pipeline de importacao: passo atual, colunas originais e normalizadas, amostras. Limpo (NULL) quando o dataset e finalizado.';


-- -------------------------------------------------------------------------
-- 2. `is_org_admin()` deixa de ser sensível à caixa
-- -------------------------------------------------------------------------
-- Divergência encontrada no merge:
--
--   RLS  (110000)          -> r.name = 'Admin'                    (exato)
--   Front (Database.tsx:46)-> roleData.name.toLowerCase() === 'admin'
--
-- Um cargo chamado 'admin' ou 'ADMIN' liberaria a tela do pipeline e
-- falharia na gravação — o usuário veria o formulário e a escrita seria
-- negada pela RLS, sem explicação óbvia.
--
-- O trigger cria o cargo como 'Admin', que continua valendo. Isto apenas
-- amplia a aceitação para bater com o front.
CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $$
DECLARE v_ok BOOLEAN;
BEGIN
  SELECT (p.status::text = 'ativo' AND lower(btrim(r.name)) = 'admin')
    INTO v_ok
  FROM public.profiles p
  LEFT JOIN public.roles r ON r.id = p.role_id
  WHERE p.id = auth.uid();
  RETURN COALESCE(v_ok, false);
END;
$$;


-- -------------------------------------------------------------------------
-- 3. Verificação
-- -------------------------------------------------------------------------
SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END AS situacao
FROM (VALUES
  ('Coluna datasets.sketch existe',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'datasets'
              AND column_name = 'sketch')),
  ('is_org_admin aceita qualquer caixa',
   EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname = 'is_org_admin'
              AND p.prosrc ILIKE '%lower(btrim(r.name))%')),
  ('is_org_admin mantem pg_temp por ultimo',
   EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
                unnest(p.proconfig) c
            WHERE n.nspname = 'public'
              AND p.proname = 'is_org_admin'
              AND c LIKE 'search_path=%pg_temp'))
) AS t(item, ok)
ORDER BY ok, item;
