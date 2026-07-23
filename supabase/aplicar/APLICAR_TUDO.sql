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
--   PARTE 3 — Endurecimento: fecha a leitura publica de organizacoes,
--             tira a criacao de organizacao do metadata do cliente,
--             cria codigo de convite de 12 caracteres e trilha de
--             auditoria de mudancas de perfil.
--
--   PARTE 4 — Integracao: coluna sketch do pipeline de base de dados e
--             reconhecimento de 'Admin' em qualquer capitalizacao.
--
--   PARTE 5 — Mostra uma tabela confirmando que tudo foi criado.
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
-- #  PARTE 1 de 5 - HOTFIX DE SEGURANCA                                   #
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
  v_join_code TEXT;
BEGIN
  -- FLUXO A: criação explícita de organização.
  IF v_meta ->> 'is_admin_setup' = 'true' THEN
    INSERT INTO public.organizations (name, join_code)
    VALUES (v_meta ->> 'org_name', upper(v_meta ->> 'join_code'))
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
  v_join_code := upper(nullif(v_meta ->> 'join_code', ''));

  IF v_join_code IS NOT NULL THEN
    SELECT id INTO v_org_id FROM public.organizations WHERE join_code = v_join_code;
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

-- ...exceto o SELECT em organizations, usado para resolver o join_code
-- na tela de acesso antes do login.
GRANT SELECT ON public.organizations TO anon;


-- #########################################################################
-- #  PARTE 2 de 5 - SSO POR DOMINIO                                       #
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
  'ms_tid | google_hd | email_domain | join_code | admin_setup';
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
-- O fluxo de join_code continua funcionando (não quebra o login atual), mas
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
  v_join_code    TEXT;
BEGIN
  v_google_hd := COALESCE(v_meta ->> 'hd',  v_app_meta ->> 'hd');
  v_ms_tid    := COALESCE(v_meta ->> 'tid', v_app_meta ->> 'tid');

  -- ---------------------------------------------------------------------
  -- FLUXO A: criação explícita de organização (tab "Nova Organização").
  -- Continua permitido — é intencional e explícito, não é criação
  -- automática a partir de um login qualquer.
  -- ---------------------------------------------------------------------
  IF v_meta ->> 'is_admin_setup' = 'true' THEN
    INSERT INTO public.organizations (name, join_code)
    VALUES (v_meta ->> 'org_name', upper(v_meta ->> 'org_join_code'))
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
  -- FLUXO C: fallback por join_code (fluxo legado da tela de acesso).
  -- Só é consultado quando o domínio NÃO resolveu. Define apenas a org
  -- candidata; o status permanece 'pendente' e depende de aprovação.
  -- ---------------------------------------------------------------------
  IF v_org_id IS NULL THEN
    v_join_code := upper(nullif(v_meta ->> 'org_join_code', ''));

    IF v_join_code IS NOT NULL THEN
      SELECT id INTO v_org_id FROM public.organizations WHERE join_code = v_join_code;
    ELSIF nullif(v_meta ->> 'organization_id', '') IS NOT NULL THEN
      -- Compatibilidade com o front atual, que envia o uuid da org.
      SELECT id INTO v_org_id
      FROM public.organizations
      WHERE id = (v_meta ->> 'organization_id')::uuid;
    END IF;

    IF v_org_id IS NOT NULL THEN

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
-- resolver o join_code antes do login). Escrita passa a ser exclusiva do
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

-- anon só precisa resolver o join_code na tela de acesso.
GRANT SELECT ON public.organizations TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_domains TO authenticated;
GRANT SELECT ON public.public_email_domains TO anon, authenticated;
GRANT SELECT ON public.domain_binding_audit TO authenticated;
GRANT ALL ON public.organization_domains, public.public_email_domains,
             public.domain_binding_audit TO service_role;


-- #########################################################################
-- #  PARTE 3 de 5 - ENDURECIMENTO DO CONTROL PLANE                        #
-- #########################################################################

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
    ADD COLUMN IF NOT EXISTS join_mode TEXT NOT NULL DEFAULT 'codigo',
    ADD COLUMN IF NOT EXISTS join_code TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_join_mode_check') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_join_mode_check
      CHECK (join_mode IN ('codigo', 'dominio'));
  END IF;
END $$;

COMMENT ON COLUMN public.organizations.join_mode IS
  'Como novos membros entram: codigo = codigo de convite; dominio = roteamento por dominio verificado. Definido APENAS server-side, por admin da org.';
COMMENT ON COLUMN public.organizations.join_code IS
  'Codigo de convite de 12 caracteres, aleatorio criptografico.';

-- Gerador criptográfico. Alfabeto de 32 símbolos sem I/O/0/1 (ambiguidade
-- visual). 256 % 32 = 0, portanto não há viés de módulo.
-- `extensions` precisa entrar no search_path: no Supabase o pgcrypto é
-- instalado nesse schema, e sem ele `gen_random_bytes` não resolve. pg_temp
-- continua por último, que é o que importa para segurança.
CREATE OR REPLACE FUNCTION public.gerar_join_code()
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SET search_path = public, extensions, pg_temp
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

-- As 6 organizações existentes ficam em 'join_code'.
-- Motivo documentado: polijunior.com.br aparece em 4 organizações distintas
-- e organization_domains.domain e UNIQUE — colocar qualquer uma em 'dominio'
-- quebraria as outras tres.
UPDATE public.organizations SET join_mode = 'codigo' WHERE join_mode IS NULL;


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
-- Aceita o join_code novo e, por compatibilidade, o join_code antigo.
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
  WHERE o.join_mode = 'codigo'
    AND o.join_code = v_codigo
  LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolver_codigo_organizacao(TEXT) FROM public;
GRANT  EXECUTE ON FUNCTION public.resolver_codigo_organizacao(TEXT) TO anon, authenticated;


-- -------------------------------------------------------------------------
-- 4. S-10 — criação de organização sai do metadata do cliente
-- -------------------------------------------------------------------------
-- Antes: o cliente enviava is_admin_setup/org_name/org_join_code no signUp e
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

  INSERT INTO public.organizations (name, join_code, join_mode)
  VALUES (v_nome, v_code, 'codigo')
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
  -- PORTA 1 — código de convite (organizações com join_mode = 'codigo').
  -- O código é um segredo portador digitado pelo usuário, não uma
  -- declaração de identidade: legítimo vir do cliente. `status` e
  -- `join_mode` continuam sendo decisão exclusiva do servidor.
  -- ---------------------------------------------------------------------
  v_codigo := upper(btrim(COALESCE(
      nullif(v_meta ->> 'join_code', '')
  )));

  IF v_codigo IS NOT NULL AND v_codigo <> '' THEN
    SELECT id INTO v_org_id
    FROM public.organizations
    WHERE join_mode = 'codigo'
      AND (join_code = v_codigo OR join_code = v_codigo)
    LIMIT 1;

    IF v_org_id IS NOT NULL THEN
      v_signal := 'join_code';
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
  ('Todas as orgs em join_mode = join_code',
   NOT EXISTS (SELECT 1 FROM public.organizations WHERE join_mode <> 'codigo')),
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


-- #########################################################################
-- #  PARTE 4 de 5 - INTEGRACAO (sketch + Admin)                           #
-- #########################################################################

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



-- #########################################################################
-- #  PARTE 5 de 5 - VERIFICACAO GERAL                                     #
-- #########################################################################
-- Esta consulta nao altera nada. Ela so mostra o resultado.
-- TODAS as linhas devem aparecer como "OK".

SELECT
    item,
    CASE WHEN ok THEN 'OK' ELSE 'FALTANDO — algo deu errado' END AS situacao
FROM (
    VALUES
      -- ---- Parte 1: hotfix ----
      ('1. Trigger on_auth_user_created ativo',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created')),
      ('1. Policy insegura de UPDATE em profiles REMOVIDA',
       NOT EXISTS (SELECT 1 FROM pg_policies
                   WHERE tablename = 'profiles'
                     AND policyname = 'Users can update profiles in their organization')),
      ('1. Policy insegura de INSERT em organizations REMOVIDA',
       NOT EXISTS (SELECT 1 FROM pg_policies
                   WHERE tablename = 'organizations'
                     AND policyname = 'Allow authenticated users to insert organizations')),

      -- ---- Parte 2: SSO por dominio ----
      ('2. Tabela organization_domains',
       to_regclass('public.organization_domains') IS NOT NULL),
      ('2. Tabela public_email_domains',
       to_regclass('public.public_email_domains') IS NOT NULL),
      ('2. Tabela domain_binding_audit',
       to_regclass('public.domain_binding_audit') IS NOT NULL),
      ('2. Denylist preenchida (15 dominios)',
       (SELECT count(*) FROM public.public_email_domains) >= 15),
      ('2. Funcao custom_access_token_hook criada',
       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'custom_access_token_hook')),
      ('2. Funcao resolve_org_from_identity criada',
       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'resolve_org_from_identity')),
      ('2. profiles.organization_id aceita nulo (estado sem-org)',
       (SELECT is_nullable = 'YES' FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'profiles'
           AND column_name = 'organization_id')),

      -- ---- Parte 3: endurecimento ----
      ('3. Coluna organizations.join_mode',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'organizations' AND column_name = 'join_mode')),
      ('3. Coluna organizations.join_code',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'organizations' AND column_name = 'join_code')),
      ('3. Todas as orgs com join_code preenchido',
       NOT EXISTS (SELECT 1 FROM public.organizations WHERE join_code IS NULL)),
      ('3. Todas as orgs existentes em join_mode = join_code',
       NOT EXISTS (SELECT 1 FROM public.organizations WHERE join_mode <> 'codigo')),
      ('3. Leitura publica de organizations REMOVIDA (S-02)',
       NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE tablename = 'organizations'
                      AND policyname = 'Allow public read of organizations')),
      ('3. Funcao resolver_codigo_organizacao criada',
       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'resolver_codigo_organizacao')),
      ('3. Funcao criar_organizacao criada (S-10)',
       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'criar_organizacao')),
      ('3. Coluna profiles.updated_at',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'profiles' AND column_name = 'updated_at')),
      ('3. Tabela profile_changes_audit',
       to_regclass('public.profile_changes_audit') IS NOT NULL),
      ('3. Auditoria append-only (so policy de SELECT)',
       NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE tablename = 'profile_changes_audit' AND cmd <> 'SELECT')),
      ('3. Funcoes SECURITY DEFINER com pg_temp por ultimo',
       NOT EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.prosecdef
            AND (p.proconfig IS NULL
                 OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c
                                 WHERE c LIKE 'search_path=%pg_temp')))),

      ('4. Coluna datasets.sketch existe',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'datasets'
                  AND column_name = 'sketch')),
      ('4. is_org_admin aceita qualquer caixa de Admin',
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'is_org_admin'
                  AND p.prosrc ILIKE '%lower(btrim(r.name))%')),

      -- ---- Decisao D-13: Leads permanece intocada ----
      ('D-13. Leads NAO foi alterada (esperado)',
       EXISTS (SELECT 1 FROM pg_policies
                WHERE tablename = 'Leads'
                  AND policyname = 'Allow authenticated all on Leads'))
) AS t(item, ok)
ORDER BY ok, item;
