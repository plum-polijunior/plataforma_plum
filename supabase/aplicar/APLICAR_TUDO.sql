-- #########################################################################
-- #                                                                       #
-- #   PLUM 2.0 — SCRIPT ÚNICO DE APLICAÇÃO                                #
-- #                                                                       #
-- #   Cole ESTE ARQUIVO INTEIRO no SQL Editor do Supabase e clique RUN.   #
-- #   Não precisa rodar em pedaços. Não precisa entender o conteúdo.      #
-- #                                                                       #
-- #########################################################################
--
-- O QUE ESTE SCRIPT FAZ, EM ORDEM:
--
--   PARTE 1 — Fecha a falha de segurança que permitia qualquer pessoa
--             entrar em qualquer organização já como membro ativo.
--
--   PARTE 2 — Cria o SSO por domínio: tabelas de domínio, denylist de
--             provedores públicos, auditoria, e o roteamento automático
--             para a organização certa.
--
--   PARTE 3 — Mostra uma tabela confirmando que tudo foi criado.
--
-- É SEGURO RODAR EM PRODUÇÃO:
--   * Não apaga nenhuma tabela, coluna ou dado.
--   * Pode ser rodado mais de uma vez sem quebrar nada.
--   * Se qualquer linha falhar, o Supabase desfaz tudo automaticamente.
--
-- NÃO cria dados de teste. Os dados de teste estão em outro arquivo
-- (supabase/seed/dev_seed_dominios.sql) e são um passo separado.
--
-- =========================================================================
--   ANTES DE CLICAR RUN: faça o backup do banco.
--   Database → Backups → Ver o passo 2 do arquivo
--   docs/PASSO-A-PASSO-APLICAR.md
-- =========================================================================



-- #########################################################################
-- #  PARTE 1 de 3 - HOTFIX DE SEGURANCA                                   #
-- #########################################################################

-- =========================================================================
-- HOTFIX DE SEGURANÇA — ESCALONAMENTO DE PRIVILÉGIO VIA raw_user_meta_data
-- =========================================================================
-- Severidade: ALTA · OWASP A01 (Broken Access Control)
-- Data do fix: 2026-07-22
--
-- VULNERABILIDADE
-- ---------------
-- `public.handle_new_user()` lia `organization_id` E `status` de
-- `new.raw_user_meta_data`, que é preenchido pelo cliente na chamada de
-- signUp. Qualquer pessoa com o console do navegador aberto podia executar:
--
--   supabase.auth.signUp({
--     email, password,
--     options: { data: { organization_id: '<uuid alvo>', status: 'ativo' } }
--   })
--
-- ...e entrar em QUALQUER organização já como membro ATIVO, sem aprovação.
--
-- Agravante: a policy de UPDATE em `profiles` permitia que qualquer membro
-- alterasse qualquer perfil da mesma org — inclusive o próprio status.
-- Um membro 'pendente' se auto-promovia a 'ativo'.
--
-- CORREÇÃO
-- --------
--  1. `status` NUNCA mais é lido do cliente. É definido no servidor:
--     'ativo' apenas para quem cria a própria organização; 'pendente'
--     em todos os demais casos.
--  2. `organization_id` vindo do cliente passa a ser tratado como org
--     CANDIDATA e é validado contra `organizations` — nunca confiado.
--  3. Policy de UPDATE em `profiles` restrita a admins, e proibida sobre
--     o próprio registro (impede auto-promoção).
--
-- ESCOPO: apenas o fechamento da brecha. O roteamento por domínio (SSO)
-- vai na migration seguinte, deliberadamente separado.
--
-- Idempotente e não destrutivo. Aplicar ANTES da migration de SSO.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Helper: identifica admin sem depender de RLS (evita recursão)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE v_ok BOOLEAN;
BEGIN
  SELECT (p.status::text = 'ativo' AND r.name = 'Admin')
    INTO v_ok
  FROM public.profiles p
  LEFT JOIN public.roles r ON r.id = p.role_id
  WHERE p.id = auth.uid();
  RETURN COALESCE(v_ok, false);
END;
$$;


-- -------------------------------------------------------------------------
-- 2. handle_new_user — versão sem confiança no cliente
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_meta     JSONB := COALESCE(new.raw_user_meta_data, '{}'::jsonb);
  v_org_id   UUID;
  v_role_id  UUID;
  v_share_id TEXT;
BEGIN
  -- FLUXO A: criação explícita de organização.
  IF v_meta ->> 'is_admin_setup' = 'true' THEN
    INSERT INTO public.organizations (name, share_id)
    VALUES (v_meta ->> 'org_name', upper(v_meta ->> 'org_share_id'))
    RETURNING id INTO v_org_id;

    INSERT INTO public.roles (organization_id, name)
    VALUES (v_org_id, 'Admin')
    RETURNING id INTO v_role_id;

    -- 'ativo' aqui é decisão do servidor: quem cria a org é o dono dela.
    INSERT INTO public.profiles (id, email, organization_id, role_id, status)
    VALUES (new.id, new.email, v_org_id, v_role_id, 'ativo');

    RETURN new;
  END IF;

  -- FLUXO B: entrada em organização existente.
  -- O identificador vindo do cliente é apenas CANDIDATO e é validado.
  v_share_id := upper(nullif(v_meta ->> 'org_share_id', ''));

  IF v_share_id IS NOT NULL THEN
    SELECT id INTO v_org_id FROM public.organizations WHERE share_id = v_share_id;
  ELSIF nullif(v_meta ->> 'organization_id', '') IS NOT NULL THEN
    BEGIN
      SELECT id INTO v_org_id
      FROM public.organizations
      WHERE id = (v_meta ->> 'organization_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_org_id := NULL;
    END;
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organizacao invalida ou nao informada no cadastro'
      USING ERRCODE = 'check_violation';
  END IF;

  -- status IGNORADO do metadata: sempre 'pendente'. Entrar na organização
  -- não concede acesso — depende de aprovação do admin.
  INSERT INTO public.profiles (id, email, organization_id, status)
  VALUES (new.id, new.email, v_org_id, 'pendente')
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- -------------------------------------------------------------------------
-- 3. Fecha a auto-promoção via UPDATE em profiles
-- -------------------------------------------------------------------------
-- ANTES: qualquer membro da org podia dar UPDATE em qualquer perfil da org.
DROP POLICY IF EXISTS "Users can update profiles in their organization" ON public.profiles;

DROP POLICY IF EXISTS "admin gerencia perfis da org" ON public.profiles;
CREATE POLICY "admin gerencia perfis da org" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    AND public.is_org_admin()
    AND id <> auth.uid()          -- ninguém altera o próprio status
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );


-- -------------------------------------------------------------------------
-- 4. Remove INSERT arbitrário em organizations
-- -------------------------------------------------------------------------
-- A criação de organização passa a ser exclusividade do trigger
-- (SECURITY DEFINER), não da API.
DROP POLICY IF EXISTS "Allow authenticated users to insert organizations" ON public.organizations;

-- anon não precisa de escrita em nenhuma tabela do control plane.
REVOKE ALL ON public.organizations    FROM anon;
REVOKE ALL ON public.roles            FROM anon;
REVOKE ALL ON public.profiles         FROM anon;
REVOKE ALL ON public.datasets         FROM anon;
REVOKE ALL ON public.role_permissions FROM anon;

-- ...exceto o SELECT em organizations, usado para resolver o share_id
-- na tela de acesso antes do login.
GRANT SELECT ON public.organizations TO anon;


-- #########################################################################
-- #  PARTE 2 de 3 - SSO POR DOMINIO                                       #
-- #########################################################################

-- =========================================================================
-- SSO POR DOMÍNIO — CONTROL PLANE
-- =========================================================================
-- Projeto: PLUM 2.0 · branch `plataforma`
-- Escopo: organizações, domínios, membros (profiles), auditoria.
--         NÃO toca no data plane (dados dos clientes).
--
-- Idempotente: pode ser reexecutado com segurança.
-- Não destrutivo: nenhum DROP TABLE / DROP COLUMN.
--
-- NOTA DE NOMENCLATURA: a spec descreve as colunas FK como `org_id`. Este
-- script usa `organization_id` para manter consistência com TODAS as tabelas
-- já existentes (roles, datasets, role_permissions, profiles). Desvio
-- deliberado e documentado.
--
-- NOTA SOBRE O ENUM DE STATUS: o repo tem duas versões divergentes
-- (`profile_status` em login_supabase.sql, `user_status` em types.ts). Este
-- script NUNCA nomeia o tipo — usa literais sem cast e comparações via
-- ::text, funcionando com qualquer um dos dois.
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------------------------
-- 0. Pré-requisitos defensivos no schema existente
-- -------------------------------------------------------------------------

-- `profiles.email` existe em login_supabase.sql mas está ausente de types.ts.
-- Garante a coluna para que o trigger abaixo nunca quebre o login.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- `profiles.organization_id` é NOT NULL no schema atual, o que impede o
-- estado "usuário autenticado SEM organização" exigido pela spec
-- (domínio não verificado / não mapeado ⇒ fica sem org).
ALTER TABLE public.profiles ALTER COLUMN organization_id DROP NOT NULL;


-- -------------------------------------------------------------------------
-- 1. organization_domains — mapeamento domínio → organização
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_domains (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    domain              TEXT NOT NULL,
    verified            BOOLEAN NOT NULL DEFAULT false,
    verification_method TEXT CHECK (verification_method IN ('admin', 'dns_txt')),
    verified_at         TIMESTAMPTZ,
    verified_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ms_tenant_id        TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT organization_domains_domain_key UNIQUE (domain),
    CONSTRAINT organization_domains_domain_lowercase CHECK (domain = lower(btrim(domain))),
    CONSTRAINT organization_domains_verified_coerente
        CHECK (verified = false OR verification_method IS NOT NULL)
);

COMMENT ON TABLE public.organization_domains IS
  'Domínios de e-mail corporativo que roteiam para uma organização. Só verified=true roteia.';
COMMENT ON COLUMN public.organization_domains.verification_method IS
  'admin = verificação administrativa (MVP). dns_txt = reservado para verificação por DNS (futuro, sem migration).';
COMMENT ON COLUMN public.organization_domains.ms_tenant_id IS
  'Tenant ID do Microsoft Entra ID (claim `tid`). Sinal forte, preferido ao parsing de e-mail.';

CREATE INDEX IF NOT EXISTS idx_org_domains_lookup
    ON public.organization_domains (domain) WHERE verified = true;
CREATE INDEX IF NOT EXISTS idx_org_domains_ms_tenant
    ON public.organization_domains (ms_tenant_id) WHERE verified = true AND ms_tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_domains_org
    ON public.organization_domains (organization_id);


-- -------------------------------------------------------------------------
-- 2. public_email_domains — denylist de provedores públicos
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.public_email_domains (
    domain TEXT PRIMARY KEY
);

COMMENT ON TABLE public.public_email_domains IS
  'Denylist versionada: domínios de provedores públicos que NUNCA viram domínio de organização.';

INSERT INTO public.public_email_domains (domain) VALUES
    ('gmail.com'), ('googlemail.com'), ('outlook.com'), ('hotmail.com'),
    ('live.com'), ('yahoo.com'), ('yahoo.com.br'), ('icloud.com'),
    ('me.com'), ('aol.com'), ('proton.me'), ('protonmail.com'),
    ('bol.com.br'), ('uol.com.br'), ('terra.com.br')
ON CONFLICT (domain) DO NOTHING;


-- -------------------------------------------------------------------------
-- 3. domain_binding_audit — auditoria de todo vínculo domínio → org
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.domain_binding_audit (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID,
    email_domain    TEXT,
    organization_id UUID,
    signal          TEXT NOT NULL,
    result          TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON COLUMN public.domain_binding_audit.signal IS
  'ms_tid | google_hd | email_domain | share_id | admin_setup';
COMMENT ON COLUMN public.domain_binding_audit.result IS
  'bound | denylisted | no_match | unverified_domain | no_email | org_created';

CREATE INDEX IF NOT EXISTS idx_audit_user ON public.domain_binding_audit (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_org  ON public.domain_binding_audit (organization_id);


-- -------------------------------------------------------------------------
-- 4. Helpers de contexto (SECURITY DEFINER — evitam recursão de RLS)
-- -------------------------------------------------------------------------
-- Lê o claim do JWT; se ausente (sessão antiga, antes do hook), cai para a
-- consulta direta em profiles. Isso permite rollout sem invalidar sessões.

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_claim TEXT;
  v_org   UUID;
BEGIN
  v_claim := nullif(auth.jwt() ->> 'organization_id', '');
  IF v_claim IS NOT NULL THEN
    RETURN v_claim::uuid;
  END IF;

  SELECT organization_id INTO v_org FROM public.profiles WHERE id = auth.uid();
  RETURN v_org;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_profile_status()
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_claim  TEXT;
  v_status TEXT;
BEGIN
  v_claim := nullif(auth.jwt() ->> 'profile_status', '');
  IF v_claim IS NOT NULL THEN
    RETURN v_claim;
  END IF;

  SELECT status::text INTO v_status FROM public.profiles WHERE id = auth.uid();
  RETURN v_status;
END;
$$;

-- `ativo` é o único status que concede leitura de dados.
CREATE OR REPLACE FUNCTION public.is_active_member()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.current_profile_status() = 'ativo' $$;

-- Admin = membro ativo cujo cargo se chama 'Admin' na própria organização.
CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE v_ok BOOLEAN;
BEGIN
  SELECT (p.status::text = 'ativo' AND r.name = 'Admin')
    INTO v_ok
  FROM public.profiles p
  LEFT JOIN public.roles r ON r.id = p.role_id
  WHERE p.id = auth.uid();
  RETURN COALESCE(v_ok, false);
END;
$$;


-- -------------------------------------------------------------------------
-- 5. Resolução de organização a partir de sinais do IdP
-- -------------------------------------------------------------------------
-- Precedência (spec): tid (Microsoft) > hd (Google) > domínio do e-mail.
-- A denylist é checada ANTES de qualquer lookup.

CREATE OR REPLACE FUNCTION public.resolve_org_from_identity(
    p_email      TEXT,
    p_google_hd  TEXT DEFAULT NULL,
    p_ms_tid     TEXT DEFAULT NULL,
    OUT o_org_id UUID,
    OUT o_domain TEXT,
    OUT o_signal TEXT,
    OUT o_result TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_domain TEXT;
BEGIN
  o_org_id := NULL;

  -- Domínio candidato: hd do Google tem prioridade sobre o parsing do e-mail.
  v_domain := lower(btrim(COALESCE(
      nullif(p_google_hd, ''),
      split_part(lower(btrim(COALESCE(p_email, ''))), '@', 2)
  )));
  o_domain := nullif(v_domain, '');

  IF o_domain IS NULL THEN
    o_signal := 'email_domain';
    o_result := 'no_email';
    RETURN;
  END IF;

  -- 1) Denylist ANTES do lookup (não-negociável).
  IF EXISTS (SELECT 1 FROM public.public_email_domains WHERE domain = o_domain) THEN
    o_signal := CASE WHEN nullif(p_google_hd,'') IS NOT NULL THEN 'google_hd' ELSE 'email_domain' END;
    o_result := 'denylisted';
    RETURN;
  END IF;

  -- 2) Sinal forte: tenant id da Microsoft.
  IF nullif(p_ms_tid, '') IS NOT NULL THEN
    SELECT od.organization_id INTO o_org_id
    FROM public.organization_domains od
    WHERE od.ms_tenant_id = p_ms_tid AND od.verified = true
    LIMIT 1;

    IF o_org_id IS NOT NULL THEN
      o_signal := 'ms_tid';
      o_result := 'bound';
      RETURN;
    END IF;
  END IF;

  -- 3) Lookup por domínio verificado.
  SELECT od.organization_id INTO o_org_id
  FROM public.organization_domains od
  WHERE od.domain = o_domain AND od.verified = true
  LIMIT 1;

  o_signal := CASE WHEN nullif(p_google_hd,'') IS NOT NULL THEN 'google_hd' ELSE 'email_domain' END;

  IF o_org_id IS NOT NULL THEN
    o_result := 'bound';
  ELSIF EXISTS (SELECT 1 FROM public.organization_domains WHERE domain = o_domain) THEN
    -- Cadastrado porém verified = false ⇒ NÃO roteia.
    o_result := 'unverified_domain';
  ELSE
    o_result := 'no_match';
  END IF;
END;
$$;


-- -------------------------------------------------------------------------
-- 6. handle_new_user — substitui a versão insegura
-- -------------------------------------------------------------------------
-- MUDANÇA DE SEGURANÇA (OWASP A01): `organization_id` e `status` deixam de
-- ser lidos do raw_user_meta_data (controlado pelo cliente).
--   * organização  ⇒ resolvida no servidor pelo domínio verificado;
--   * status       ⇒ SEMPRE 'pendente', exceto para quem cria a própria org.
-- O fluxo de share_id continua funcionando (não quebra o login atual), mas
-- agora só define a org candidata — nunca o status.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_meta        JSONB := COALESCE(new.raw_user_meta_data, '{}'::jsonb);
  v_app_meta    JSONB := COALESCE(new.raw_app_meta_data, '{}'::jsonb);
  v_org_id      UUID;
  v_role_id     UUID;
  v_google_hd   TEXT;
  v_ms_tid      TEXT;
  v_res         RECORD;
  v_share_id    TEXT;
BEGIN
  v_google_hd := COALESCE(v_meta ->> 'hd',  v_app_meta ->> 'hd');
  v_ms_tid    := COALESCE(v_meta ->> 'tid', v_app_meta ->> 'tid');

  -- ---------------------------------------------------------------------
  -- FLUXO A: criação explícita de organização (tab "Nova Organização").
  -- Continua permitido — é intencional e explícito, não é criação
  -- automática a partir de um login qualquer.
  -- ---------------------------------------------------------------------
  IF v_meta ->> 'is_admin_setup' = 'true' THEN
    INSERT INTO public.organizations (name, share_id)
    VALUES (v_meta ->> 'org_name', upper(v_meta ->> 'org_share_id'))
    RETURNING id INTO v_org_id;

    INSERT INTO public.roles (organization_id, name)
    VALUES (v_org_id, 'Admin')
    RETURNING id INTO v_role_id;

    INSERT INTO public.profiles (id, email, organization_id, role_id, status)
    VALUES (new.id, new.email, v_org_id, v_role_id, 'ativo');

    -- Vincula o domínio do fundador à org, mas NÃO verificado:
    -- a verificação é ato administrativo consciente (D-02).
    IF new.email IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.public_email_domains
         WHERE domain = split_part(lower(btrim(new.email)), '@', 2)
       )
    THEN
      INSERT INTO public.organization_domains (organization_id, domain, verified)
      VALUES (v_org_id, split_part(lower(btrim(new.email)), '@', 2), false)
      ON CONFLICT (domain) DO NOTHING;
    END IF;

    INSERT INTO public.domain_binding_audit (user_id, email_domain, organization_id, signal, result)
    VALUES (new.id, split_part(lower(btrim(COALESCE(new.email,''))), '@', 2),
            v_org_id, 'admin_setup', 'org_created');

    RETURN new;
  END IF;

  -- ---------------------------------------------------------------------
  -- FLUXO B: roteamento por domínio verificado (SSO). 100% servidor.
  -- ---------------------------------------------------------------------
  SELECT * INTO v_res
  FROM public.resolve_org_from_identity(new.email, v_google_hd, v_ms_tid);

  v_org_id := v_res.o_org_id;

  -- ---------------------------------------------------------------------
  -- FLUXO C: fallback por share_id (fluxo legado da tela de acesso).
  -- Só é consultado quando o domínio NÃO resolveu. Define apenas a org
  -- candidata; o status permanece 'pendente' e depende de aprovação.
  -- ---------------------------------------------------------------------
  IF v_org_id IS NULL THEN
    v_share_id := upper(nullif(v_meta ->> 'org_share_id', ''));

    IF v_share_id IS NOT NULL THEN
      SELECT id INTO v_org_id FROM public.organizations WHERE share_id = v_share_id;
    ELSIF nullif(v_meta ->> 'organization_id', '') IS NOT NULL THEN
      -- Compatibilidade com o front atual, que envia o uuid da org.
      SELECT id INTO v_org_id
      FROM public.organizations
      WHERE id = (v_meta ->> 'organization_id')::uuid;
    END IF;

    IF v_org_id IS NOT NULL THEN
      v_res.o_signal := 'share_id';
      v_res.o_result := 'bound';
    END IF;
  END IF;

  -- Cria o perfil. status SEMPRE 'pendente' — entrar na org não dá acesso.
  -- Sem org resolvida ⇒ perfil com organization_id NULL (estado de pendência).
  INSERT INTO public.profiles (id, email, organization_id, status)
  VALUES (new.id, new.email, v_org_id, 'pendente')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.domain_binding_audit (user_id, email_domain, organization_id, signal, result)
  VALUES (new.id, v_res.o_domain, v_org_id, v_res.o_signal, v_res.o_result);

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- -------------------------------------------------------------------------
-- 7. Custom Access Token Hook — injeta claims no JWT
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_claims JSONB;
  v_row    RECORD;
BEGIN
  v_claims := COALESCE(event -> 'claims', '{}'::jsonb);

  SELECT p.organization_id, p.role_id, p.status::text AS status, r.name AS role_name
    INTO v_row
  FROM public.profiles p
  LEFT JOIN public.roles r ON r.id = p.role_id
  WHERE p.id = (event ->> 'user_id')::uuid;

  IF FOUND THEN
    v_claims := jsonb_set(v_claims, '{organization_id}',
                          COALESCE(to_jsonb(v_row.organization_id::text), 'null'::jsonb));
    v_claims := jsonb_set(v_claims, '{profile_status}', to_jsonb(v_row.status));
    v_claims := jsonb_set(v_claims, '{role_id}',
                          COALESCE(to_jsonb(v_row.role_id::text), 'null'::jsonb));
    v_claims := jsonb_set(v_claims, '{role_name}',
                          COALESCE(to_jsonb(v_row.role_name), 'null'::jsonb));
  ELSE
    -- Usuário sem perfil: claims explicitamente nulas.
    v_claims := jsonb_set(v_claims, '{organization_id}', 'null'::jsonb);
    v_claims := jsonb_set(v_claims, '{profile_status}', '"sem_org"'::jsonb);
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

-- O hook roda como supabase_auth_admin, não como o usuário.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(JSONB) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(JSONB) FROM authenticated, anon, public;
GRANT SELECT ON public.profiles TO supabase_auth_admin;
GRANT SELECT ON public.roles    TO supabase_auth_admin;

DROP POLICY IF EXISTS "auth_admin_le_profiles" ON public.profiles;
CREATE POLICY "auth_admin_le_profiles" ON public.profiles
  AS PERMISSIVE FOR SELECT TO supabase_auth_admin USING (true);

DROP POLICY IF EXISTS "auth_admin_le_roles" ON public.roles;
CREATE POLICY "auth_admin_le_roles" ON public.roles
  AS PERMISSIVE FOR SELECT TO supabase_auth_admin USING (true);


-- -------------------------------------------------------------------------
-- 8. RLS
-- -------------------------------------------------------------------------
ALTER TABLE public.organization_domains  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_email_domains  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_binding_audit  ENABLE ROW LEVEL SECURITY;

-- 8.1 organization_domains: visível para membros ativos; escrita só por admin.
DROP POLICY IF EXISTS "membros veem dominios da org" ON public.organization_domains;
CREATE POLICY "membros veem dominios da org" ON public.organization_domains
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

DROP POLICY IF EXISTS "admin gerencia dominios" ON public.organization_domains;
CREATE POLICY "admin gerencia dominios" ON public.organization_domains
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_admin())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());

-- 8.2 denylist: leitura pública, escrita apenas service_role.
DROP POLICY IF EXISTS "denylist leitura" ON public.public_email_domains;
CREATE POLICY "denylist leitura" ON public.public_email_domains
  FOR SELECT TO anon, authenticated USING (true);

-- 8.3 auditoria: somente admin da org lê. Ninguém escreve via API
-- (só o trigger, que é SECURITY DEFINER).
DROP POLICY IF EXISTS "admin le auditoria" ON public.domain_binding_audit;
CREATE POLICY "admin le auditoria" ON public.domain_binding_audit
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

-- 8.4 profiles: fecha a escalação de privilégio.
-- ANTES: qualquer membro podia dar UPDATE em qualquer perfil da org,
-- inclusive no próprio status ('pendente' → 'ativo').
DROP POLICY IF EXISTS "Users can update profiles in their organization" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their organization"   ON public.profiles;

DROP POLICY IF EXISTS "usuario ve o proprio perfil" ON public.profiles;
CREATE POLICY "usuario ve o proprio perfil" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "membro ativo ve perfis da org" ON public.profiles;
CREATE POLICY "membro ativo ve perfis da org" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_org_id()
    AND public.is_active_member()
  );

-- Só admin altera perfis, e NUNCA o próprio (impede auto-promoção).
DROP POLICY IF EXISTS "admin gerencia perfis da org" ON public.profiles;
CREATE POLICY "admin gerencia perfis da org" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND public.is_org_admin()
    AND id <> auth.uid()
  )
  WITH CHECK (organization_id = public.current_org_id());

-- 8.5 organizations: leitura pública mantida (a tela de acesso precisa
-- resolver o share_id antes do login). Escrita passa a ser exclusiva do
-- trigger — remove a policy que permitia INSERT arbitrário.
DROP POLICY IF EXISTS "Allow authenticated users to insert organizations" ON public.organizations;

DROP POLICY IF EXISTS "admin atualiza a propria org" ON public.organizations;
CREATE POLICY "admin atualiza a propria org" ON public.organizations
  FOR UPDATE TO authenticated
  USING (id = public.current_org_id() AND public.is_org_admin())
  WITH CHECK (id = public.current_org_id());

-- 8.6 roles: deixa de ser legível globalmente.
DROP POLICY IF EXISTS "Users can view roles in their organization" ON public.roles;
DROP POLICY IF EXISTS "Users can create roles" ON public.roles;

DROP POLICY IF EXISTS "membros veem cargos da org" ON public.roles;
CREATE POLICY "membros veem cargos da org" ON public.roles
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

DROP POLICY IF EXISTS "admin gerencia cargos" ON public.roles;
CREATE POLICY "admin gerencia cargos" ON public.roles
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_admin())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());

-- 8.7 datasets: exige membro ATIVO (pendente não lê dados).
DROP POLICY IF EXISTS "Users can view datasets in their organization" ON public.datasets;
DROP POLICY IF EXISTS "Users can insert datasets"                     ON public.datasets;
DROP POLICY IF EXISTS "Users can update their datasets"               ON public.datasets;

DROP POLICY IF EXISTS "membro ativo ve datasets da org" ON public.datasets;
CREATE POLICY "membro ativo ve datasets da org" ON public.datasets
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_active_member());

DROP POLICY IF EXISTS "admin gerencia datasets" ON public.datasets;
CREATE POLICY "admin gerencia datasets" ON public.datasets
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_admin())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());

-- 8.8 role_permissions: idem.
DROP POLICY IF EXISTS "Users can view role_permissions in their organization" ON public.role_permissions;
DROP POLICY IF EXISTS "Users can insert role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Users can update role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Users can delete role_permissions" ON public.role_permissions;

DROP POLICY IF EXISTS "membro ativo ve permissoes da org" ON public.role_permissions;
CREATE POLICY "membro ativo ve permissoes da org" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_active_member());

DROP POLICY IF EXISTS "admin gerencia permissoes" ON public.role_permissions;
CREATE POLICY "admin gerencia permissoes" ON public.role_permissions
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_admin())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());


-- -------------------------------------------------------------------------
-- 9. GRANTs — remove o excesso do schema atual
-- -------------------------------------------------------------------------
-- O schema atual fazia GRANT ALL ... TO anon em tabelas do control plane.
REVOKE ALL ON public.organizations    FROM anon;
REVOKE ALL ON public.roles            FROM anon;
REVOKE ALL ON public.profiles         FROM anon;
REVOKE ALL ON public.datasets         FROM anon;
REVOKE ALL ON public.role_permissions FROM anon;

-- anon só precisa resolver o share_id na tela de acesso.
GRANT SELECT ON public.organizations TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_domains TO authenticated;
GRANT SELECT ON public.public_email_domains TO anon, authenticated;
GRANT SELECT ON public.domain_binding_audit TO authenticated;
GRANT ALL ON public.organization_domains, public.public_email_domains,
             public.domain_binding_audit TO service_role;


-- #########################################################################
-- #  PARTE 3 — VERIFICAÇÃO                                                #
-- #########################################################################
-- Esta consulta não altera nada. Ela só mostra o resultado.
-- Todas as linhas devem aparecer como "OK".

SELECT
    item,
    CASE WHEN ok THEN 'OK' ELSE 'FALTANDO — algo deu errado' END AS situacao
FROM (
    VALUES
      ('Tabela organization_domains',
       to_regclass('public.organization_domains') IS NOT NULL),
      ('Tabela public_email_domains',
       to_regclass('public.public_email_domains') IS NOT NULL),
      ('Tabela domain_binding_audit',
       to_regclass('public.domain_binding_audit') IS NOT NULL),
      ('Denylist preenchida (15 dominios)',
       (SELECT count(*) FROM public.public_email_domains) >= 15),
      ('Funcao handle_new_user atualizada',
       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user')),
      ('Funcao custom_access_token_hook criada',
       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'custom_access_token_hook')),
      ('Funcao resolve_org_from_identity criada',
       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'resolve_org_from_identity')),
      ('Trigger on_auth_user_created ativo',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created')),
      ('Policy insegura de UPDATE em profiles REMOVIDA',
       NOT EXISTS (SELECT 1 FROM pg_policies
                   WHERE tablename = 'profiles'
                     AND policyname = 'Users can update profiles in their organization')),
      ('Policy insegura de INSERT em organizations REMOVIDA',
       NOT EXISTS (SELECT 1 FROM pg_policies
                   WHERE tablename = 'organizations'
                     AND policyname = 'Allow authenticated users to insert organizations')),
      ('profiles.organization_id aceita nulo (estado sem-org)',
       (SELECT is_nullable = 'YES' FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'profiles'
           AND column_name = 'organization_id'))
) AS t(item, ok)
ORDER BY ok, item;
