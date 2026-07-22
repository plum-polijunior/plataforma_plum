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
