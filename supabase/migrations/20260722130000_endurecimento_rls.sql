-- =========================================================================
-- ENDURECIMENTO DO CONTROL PLANE — S-02, S-10, join_mode e auditoria
-- =========================================================================
-- Projeto: PLUM 2.0 · branch `fix/escalonamento-privilegio-sso`
-- Data: 2026-07-22
--
-- Pré-requisito: 20260722110000 e 20260722120000 já aplicadas.
-- Estas NÃO são editadas. Esta migration redefine o que precisa mudar via
-- CREATE OR REPLACE — o histórico permanece auditável.
--
-- O QUE MUDA:
--   1. search_path de TODAS as funções SECURITY DEFINER passa a fixar
--      pg_temp por último (vetor de sequestro de função).
--   2. S-02: `organizations` deixa de ser legível publicamente. A tela de
--      acesso passa a usar uma função SECURITY DEFINER que devolve apenas
--      {org_id, org_name}.
--   3. S-10: criação de organização sai do raw_user_meta_data e vira RPC
--      autenticada.
--   4. D-07/D-12: `join_mode` e `join_code` por organização.
--   5. Trilha de auditoria: profiles.updated_at + tabela append-only.
--
-- NÃO TOCA em `Leads` (decisão D-13).
--
-- Idempotente. Não destrutivo. Roda contra base populada (9 perfis,
-- 6 organizações).
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- -------------------------------------------------------------------------
-- 1. Correção de search_path — pg_temp por último
-- -------------------------------------------------------------------------
-- O Postgres pesquisa o schema temporário ANTES dos listados quando pg_temp
-- não aparece explicitamente. Como estas funções rodam como o dono (postgres),
-- um usuário poderia criar pg_temp.profiles e sequestrar a leitura.
-- Referência: CREATE FUNCTION / "Writing SECURITY DEFINER Functions Safely".

-- Percorre TODAS as funções SECURITY DEFINER de `public` e reescreve o
-- search_path acrescentando pg_temp ao final, preservando os schemas que já
-- estavam listados.
--
-- Feito em laço, e não com ALTER FUNCTION nominal, por dois motivos:
--   * `get_user_org_id()` existe no banco mas não em nenhuma migration —
--     um ALTER nominal quebraria numa instalação limpa;
--   * qualquer função SECURITY DEFINER criada no futuro é coberta
--     automaticamente ao reexecutar esta migration.
DO $$
DECLARE
  r          RECORD;
  v_atual    TEXT;
  v_novo     TEXT;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.oid::regprocedure AS assinatura,
           p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    SELECT c INTO v_atual
    FROM unnest(COALESCE(r.proconfig, ARRAY[]::text[])) c
    WHERE c LIKE 'search_path=%'
    LIMIT 1;

    -- Já termina em pg_temp? nada a fazer.
    CONTINUE WHEN v_atual IS NOT NULL AND v_atual LIKE '%pg_temp';

    v_novo := CASE
                WHEN v_atual IS NULL THEN 'public, pg_temp'
                ELSE substr(v_atual, length('search_path=') + 1) || ', pg_temp'
              END;

    EXECUTE format('ALTER FUNCTION %s SET search_path = %s', r.assinatura, v_novo);
    RAISE NOTICE 'search_path corrigido: % -> %', r.assinatura, v_novo;
  END LOOP;
END $$;


-- -------------------------------------------------------------------------
-- 2. join_mode e join_code (D-07 / D-12)
-- -------------------------------------------------------------------------
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS join_mode TEXT NOT NULL DEFAULT 'share_id',
    ADD COLUMN IF NOT EXISTS join_code TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_join_mode_check') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_join_mode_check
      CHECK (join_mode IN ('share_id', 'dominio'));
  END IF;
END $$;

COMMENT ON COLUMN public.organizations.join_mode IS
  'Como novos membros entram: share_id = codigo de convite; dominio = roteamento por dominio verificado. Definido APENAS server-side, por admin da org.';
COMMENT ON COLUMN public.organizations.join_code IS
  'Codigo de convite de 12 caracteres, aleatorio criptografico. Substitui o share_id de 4 chars, que fica preenchido por compatibilidade (D-09).';

-- Gerador criptográfico. Alfabeto de 32 símbolos sem I/O/0/1 (ambiguidade
-- visual). 256 % 32 = 0, portanto não há viés de módulo.
CREATE OR REPLACE FUNCTION public.gerar_join_code()
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SET search_path = public, pg_temp
AS $$
DECLARE
  c_alfabeto CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes    BYTEA;
  v_code     TEXT := '';
  i          INT;
BEGIN
  LOOP
    v_bytes := gen_random_bytes(12);
    v_code  := '';
    FOR i IN 0..11 LOOP
      v_code := v_code || substr(c_alfabeto, 1 + (get_byte(v_bytes, i) % 32), 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.organizations WHERE join_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;

-- Backfill das organizações existentes ANTES de aplicar o UNIQUE.
UPDATE public.organizations
   SET join_code = public.gerar_join_code()
 WHERE join_code IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_join_code_key') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_join_code_key UNIQUE (join_code);
  END IF;
END $$;

-- As 6 organizações existentes ficam em 'share_id'.
-- Motivo documentado: polijunior.com.br aparece em 4 organizações distintas
-- e organization_domains.domain e UNIQUE — colocar qualquer uma em 'dominio'
-- quebraria as outras tres.
UPDATE public.organizations SET join_mode = 'share_id' WHERE join_mode IS NULL;


-- -------------------------------------------------------------------------
-- 3. S-02 — fecha a leitura pública de `organizations`
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public read of organizations" ON public.organizations;

DROP POLICY IF EXISTS "membro ve a propria org" ON public.organizations;
CREATE POLICY "membro ve a propria org" ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.current_org_id());

REVOKE ALL ON public.organizations FROM anon;

-- Substituto do SELECT público: devolve SOMENTE {org_id, org_name}.
-- Aceita o join_code novo e, por compatibilidade, o share_id antigo.
CREATE OR REPLACE FUNCTION public.resolver_codigo_organizacao(p_codigo TEXT)
RETURNS TABLE (org_id UUID, org_name TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_codigo TEXT := upper(btrim(COALESCE(p_codigo, '')));
BEGIN
  IF length(v_codigo) < 4 THEN
    RETURN;   -- nada encontrado; nao vaza se existe ou nao
  END IF;

  RETURN QUERY
  SELECT o.id, o.name
  FROM public.organizations o
  WHERE o.join_mode = 'share_id'
    AND (o.join_code = v_codigo OR o.share_id = v_codigo)
  LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolver_codigo_organizacao(TEXT) FROM public;
GRANT  EXECUTE ON FUNCTION public.resolver_codigo_organizacao(TEXT) TO anon, authenticated;


-- -------------------------------------------------------------------------
-- 4. S-10 — criação de organização sai do metadata do cliente
-- -------------------------------------------------------------------------
-- Antes: o cliente enviava is_admin_setup/org_name/org_share_id no signUp e
-- o trigger criava a organização. Agora a criação é uma chamada autenticada,
-- explícita, e só funciona para quem ainda não tem organização.

CREATE OR REPLACE FUNCTION public.criar_organizacao(p_nome TEXT)
RETURNS TABLE (org_id UUID, org_join_code TEXT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_nome     TEXT := btrim(COALESCE(p_nome, ''));
  v_org_id   UUID;
  v_role_id  UUID;
  v_code     TEXT;
  v_share    TEXT;
  v_org_atual UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF length(v_nome) < 2 THEN
    RAISE EXCEPTION 'Nome da organizacao invalido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id INTO v_org_atual FROM public.profiles WHERE id = v_uid;
  IF v_org_atual IS NOT NULL THEN
    RAISE EXCEPTION 'Usuario ja pertence a uma organizacao'
      USING ERRCODE = 'check_violation';
  END IF;

  v_code := public.gerar_join_code();

  -- share_id de 4 chars continua sendo preenchido (D-09), derivado do code.
  v_share := substr(v_code, 1, 4);
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE share_id = v_share) LOOP
    v_share := substr(public.gerar_join_code(), 1, 4);
  END LOOP;

  INSERT INTO public.organizations (name, share_id, join_code, join_mode)
  VALUES (v_nome, v_share, v_code, 'share_id')
  RETURNING id INTO v_org_id;

  INSERT INTO public.roles (organization_id, name)
  VALUES (v_org_id, 'Admin')
  RETURNING id INTO v_role_id;

  -- Quem cria a organizacao e o dono dela: unico caso de 'ativo' na criacao.
  UPDATE public.profiles
     SET organization_id = v_org_id,
         role_id         = v_role_id,
         status          = 'ativo'
   WHERE id = v_uid;

  INSERT INTO public.domain_binding_audit
      (user_id, email_domain, organization_id, signal, result)
  VALUES (v_uid, NULL, v_org_id, 'admin_setup', 'org_created');

  RETURN QUERY SELECT v_org_id, v_code;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.criar_organizacao(TEXT) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.criar_organizacao(TEXT) TO authenticated;


-- -------------------------------------------------------------------------
-- 5. handle_new_user v3 — respeita join_mode, sem criação de org
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_meta      JSONB := COALESCE(new.raw_user_meta_data, '{}'::jsonb);
  v_app_meta  JSONB := COALESCE(new.raw_app_meta_data, '{}'::jsonb);
  v_org_id    UUID;
  v_google_hd TEXT;
  v_ms_tid    TEXT;
  v_codigo    TEXT;
  v_res       RECORD;
  v_signal    TEXT := 'email_domain';
  v_result    TEXT := 'no_match';
  v_dominio   TEXT;
BEGIN
  v_google_hd := COALESCE(v_meta ->> 'hd',  v_app_meta ->> 'hd');
  v_ms_tid    := COALESCE(v_meta ->> 'tid', v_app_meta ->> 'tid');
  v_dominio   := nullif(split_part(lower(btrim(COALESCE(new.email, ''))), '@', 2), '');

  -- ---------------------------------------------------------------------
  -- PORTA 1 — código de convite (organizações com join_mode = 'share_id').
  -- O código é um segredo portador digitado pelo usuário, não uma
  -- declaração de identidade: legítimo vir do cliente. `status` e
  -- `join_mode` continuam sendo decisão exclusiva do servidor.
  -- ---------------------------------------------------------------------
  v_codigo := upper(btrim(COALESCE(
      nullif(v_meta ->> 'join_code', ''),
      nullif(v_meta ->> 'org_share_id', '')
  )));

  IF v_codigo IS NOT NULL AND v_codigo <> '' THEN
    SELECT id INTO v_org_id
    FROM public.organizations
    WHERE join_mode = 'share_id'
      AND (join_code = v_codigo OR share_id = v_codigo)
    LIMIT 1;

    IF v_org_id IS NOT NULL THEN
      v_signal := 'share_id';
      v_result := 'bound';
    END IF;
  END IF;

  -- ---------------------------------------------------------------------
  -- PORTA 2 — roteamento por domínio (organizações com join_mode='dominio').
  -- ---------------------------------------------------------------------
  IF v_org_id IS NULL THEN
    SELECT * INTO v_res
    FROM public.resolve_org_from_identity(new.email, v_google_hd, v_ms_tid);

    v_signal := v_res.o_signal;
    v_result := v_res.o_result;

    IF v_res.o_org_id IS NOT NULL THEN
      -- Só roteia se a organização estiver realmente em modo domínio.
      IF EXISTS (SELECT 1 FROM public.organizations
                  WHERE id = v_res.o_org_id AND join_mode = 'dominio') THEN
        v_org_id := v_res.o_org_id;
      ELSE
        v_result := 'modo_incompativel';
      END IF;
    END IF;
  END IF;

  -- Sem org resolvida ⇒ perfil sem organização (estado de pendência).
  -- status SEMPRE 'pendente'. Nunca lido do cliente.
  INSERT INTO public.profiles (id, email, organization_id, status)
  VALUES (new.id, new.email, v_org_id, 'pendente')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.domain_binding_audit
      (user_id, email_domain, organization_id, signal, result)
  VALUES (new.id, v_dominio, v_org_id, v_signal, v_result);

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- -------------------------------------------------------------------------
-- 6. Trilha de auditoria
-- -------------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL
    DEFAULT timezone('utc', now());

CREATE OR REPLACE FUNCTION public.tocar_updated_at()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  new.updated_at := timezone('utc', now());
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();


CREATE TABLE IF NOT EXISTS public.profile_changes_audit (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id      UUID NOT NULL,
    organization_id UUID,
    changed_by      UUID,
    field           TEXT NOT NULL,
    old_value       TEXT,
    new_value       TEXT,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.profile_changes_audit IS
  'Append-only. Registra alteracoes de status, role_id e organization_id em profiles: quem, o que, de -> para, quando.';

CREATE INDEX IF NOT EXISTS idx_pca_profile ON public.profile_changes_audit (profile_id);
CREATE INDEX IF NOT EXISTS idx_pca_org     ON public.profile_changes_audit (organization_id);

CREATE OR REPLACE FUNCTION public.auditar_mudanca_perfil()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_autor UUID := auth.uid();
BEGIN
  IF new.status IS DISTINCT FROM old.status THEN
    INSERT INTO public.profile_changes_audit
        (profile_id, organization_id, changed_by, field, old_value, new_value)
    VALUES (new.id, new.organization_id, v_autor, 'status',
            old.status::text, new.status::text);
  END IF;

  IF new.role_id IS DISTINCT FROM old.role_id THEN
    INSERT INTO public.profile_changes_audit
        (profile_id, organization_id, changed_by, field, old_value, new_value)
    VALUES (new.id, new.organization_id, v_autor, 'role_id',
            old.role_id::text, new.role_id::text);
  END IF;

  IF new.organization_id IS DISTINCT FROM old.organization_id THEN
    INSERT INTO public.profile_changes_audit
        (profile_id, organization_id, changed_by, field, old_value, new_value)
    VALUES (new.id, new.organization_id, v_autor, 'organization_id',
            old.organization_id::text, new.organization_id::text);
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_audit ON public.profiles;
CREATE TRIGGER trg_profiles_audit
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.auditar_mudanca_perfil();

-- Append-only: apenas SELECT para admin. Sem INSERT/UPDATE/DELETE para
-- authenticated — só o trigger (SECURITY DEFINER) escreve.
ALTER TABLE public.profile_changes_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin le auditoria de perfis" ON public.profile_changes_audit;
CREATE POLICY "admin le auditoria de perfis" ON public.profile_changes_audit
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

REVOKE ALL     ON public.profile_changes_audit FROM anon, authenticated;
GRANT  SELECT  ON public.profile_changes_audit TO authenticated;
GRANT  ALL     ON public.profile_changes_audit TO service_role;


-- -------------------------------------------------------------------------
-- 7. Verificação
-- -------------------------------------------------------------------------
SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END AS situacao
FROM (VALUES
  ('Coluna organizations.join_mode',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_name='organizations' AND column_name='join_mode')),
  ('Coluna organizations.join_code',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_name='organizations' AND column_name='join_code')),
  ('Todas as orgs com join_code preenchido',
   NOT EXISTS (SELECT 1 FROM public.organizations WHERE join_code IS NULL)),
  ('Todas as orgs em join_mode = share_id',
   NOT EXISTS (SELECT 1 FROM public.organizations WHERE join_mode <> 'share_id')),
  ('Leitura publica de organizations REMOVIDA',
   NOT EXISTS (SELECT 1 FROM pg_policies
                WHERE tablename='organizations'
                  AND policyname='Allow public read of organizations')),
  ('Funcao resolver_codigo_organizacao criada',
   EXISTS (SELECT 1 FROM pg_proc WHERE proname='resolver_codigo_organizacao')),
  ('Funcao criar_organizacao criada',
   EXISTS (SELECT 1 FROM pg_proc WHERE proname='criar_organizacao')),
  ('Coluna profiles.updated_at',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_name='profiles' AND column_name='updated_at')),
  ('Tabela profile_changes_audit',
   to_regclass('public.profile_changes_audit') IS NOT NULL),
  ('Auditoria sem policy de INSERT/UPDATE/DELETE',
   NOT EXISTS (SELECT 1 FROM pg_policies
                WHERE tablename='profile_changes_audit' AND cmd <> 'SELECT')),
  ('Todas as funcoes SECURITY DEFINER com pg_temp por ultimo',
   NOT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prosecdef
        AND (p.proconfig IS NULL
             OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c
                             WHERE c LIKE 'search_path=%pg_temp')))),
  ('Leads intocada (D-13)',
   EXISTS (SELECT 1 FROM pg_policies
            WHERE tablename='Leads' AND policyname='Allow authenticated all on Leads'))
) AS t(item, ok)
ORDER BY ok, item;
