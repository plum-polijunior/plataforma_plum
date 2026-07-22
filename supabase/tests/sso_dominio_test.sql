-- =========================================================================
-- TESTES — SSO POR DOMÍNIO
-- =========================================================================
-- Como rodar:
--   psql "$DATABASE_URL" -f supabase/tests/sso_dominio_test.sql
--   ou colar no SQL Editor do painel do Supabase.
--
-- O script roda inteiro dentro de uma transação e faz ROLLBACK no final:
-- NADA é persistido. Se qualquer asserção falhar, a execução aborta com
-- a mensagem do cenário correspondente.
-- =========================================================================

BEGIN;

DO $$
DECLARE
  org_a        UUID;
  org_b        UUID;
  u_ok         UUID := gen_random_uuid();  -- domínio verificado
  u_gmail      UUID := gen_random_uuid();  -- provedor público
  u_nomatch    UUID := gen_random_uuid();  -- domínio não mapeado
  u_unverified UUID := gen_random_uuid();  -- domínio cadastrado, verified=false
  u_b          UUID := gen_random_uuid();  -- membro ativo da org B
  v_org        UUID;
  v_status     TEXT;
  v_result     TEXT;
  v_count      INT;
BEGIN
  -- ------------------------------------------------------------------
  -- Fixtures
  -- ------------------------------------------------------------------
  INSERT INTO public.organizations (name, share_id) VALUES ('Empresa A', 'EMPA') RETURNING id INTO org_a;
  INSERT INTO public.organizations (name, share_id) VALUES ('Empresa B', 'EMPB') RETURNING id INTO org_b;

  INSERT INTO public.organization_domains (organization_id, domain, verified, verification_method, verified_at)
  VALUES (org_a, 'empresa-a.com', true, 'admin', now());

  -- Domínio cadastrado mas NÃO verificado.
  INSERT INTO public.organization_domains (organization_id, domain, verified)
  VALUES (org_b, 'naoverificado.com', false);

  INSERT INTO public.organization_domains (organization_id, domain, verified, verification_method, verified_at)
  VALUES (org_b, 'empresa-b.com', true, 'admin', now());

  -- ------------------------------------------------------------------
  -- (a) domínio verificado entra na org correta, como 'pendente'
  -- ------------------------------------------------------------------
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (u_ok, 'alguem@empresa-a.com', '{}'::jsonb, '{}'::jsonb);

  SELECT organization_id, status::text INTO v_org, v_status
  FROM public.profiles WHERE id = u_ok;

  IF v_org IS DISTINCT FROM org_a THEN
    RAISE EXCEPTION '(a) FALHOU: esperava org_a, veio %', v_org;
  END IF;
  IF v_status <> 'pendente' THEN
    RAISE EXCEPTION '(a) FALHOU: status deveria nascer pendente, veio %', v_status;
  END IF;
  RAISE NOTICE '(a) OK — dominio verificado -> org correta, status pendente';

  -- ------------------------------------------------------------------
  -- (b) domínio público (gmail) é barrado e fica sem org
  -- ------------------------------------------------------------------
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (u_gmail, 'pessoa@gmail.com', '{}'::jsonb, '{}'::jsonb);

  SELECT organization_id INTO v_org FROM public.profiles WHERE id = u_gmail;
  IF v_org IS NOT NULL THEN
    RAISE EXCEPTION '(b) FALHOU: gmail nao deveria receber org, veio %', v_org;
  END IF;

  SELECT result INTO v_result FROM public.domain_binding_audit WHERE user_id = u_gmail;
  IF v_result <> 'denylisted' THEN
    RAISE EXCEPTION '(b) FALHOU: auditoria deveria registrar denylisted, veio %', v_result;
  END IF;
  RAISE NOTICE '(b) OK — provedor publico barrado antes do lookup';

  -- ------------------------------------------------------------------
  -- (c) domínio não mapeado fica sem org
  -- ------------------------------------------------------------------
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (u_nomatch, 'alguem@desconhecido.com', '{}'::jsonb, '{}'::jsonb);

  SELECT organization_id INTO v_org FROM public.profiles WHERE id = u_nomatch;
  IF v_org IS NOT NULL THEN
    RAISE EXCEPTION '(c) FALHOU: dominio nao mapeado nao deveria receber org';
  END IF;

  SELECT result INTO v_result FROM public.domain_binding_audit WHERE user_id = u_nomatch;
  IF v_result <> 'no_match' THEN
    RAISE EXCEPTION '(c) FALHOU: auditoria deveria registrar no_match, veio %', v_result;
  END IF;
  RAISE NOTICE '(c) OK — dominio nao mapeado fica sem org';

  -- ------------------------------------------------------------------
  -- (d) domínio cadastrado mas verified=false NÃO roteia
  -- ------------------------------------------------------------------
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (u_unverified, 'alguem@naoverificado.com', '{}'::jsonb, '{}'::jsonb);

  SELECT organization_id INTO v_org FROM public.profiles WHERE id = u_unverified;
  IF v_org IS NOT NULL THEN
    RAISE EXCEPTION '(d) FALHOU: dominio nao verificado roteou para %', v_org;
  END IF;

  SELECT result INTO v_result FROM public.domain_binding_audit WHERE user_id = u_unverified;
  IF v_result <> 'unverified_domain' THEN
    RAISE EXCEPTION '(d) FALHOU: auditoria deveria registrar unverified_domain, veio %', v_result;
  END IF;
  RAISE NOTICE '(d) OK — verified=false nao roteia';

  -- ------------------------------------------------------------------
  -- (e) membro 'pendente' não lê dados
  -- ------------------------------------------------------------------
  INSERT INTO public.datasets (organization_id, name) VALUES (org_a, 'Vendas A');
  INSERT INTO public.datasets (organization_id, name) VALUES (org_b, 'Vendas B');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_ok::text, 'role', 'authenticated',
                      'organization_id', org_a::text,
                      'profile_status', 'pendente')::text, true);

  SELECT count(*) INTO v_count FROM public.datasets;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '(e) FALHOU: membro pendente leu % dataset(s)', v_count;
  END IF;
  RESET ROLE;
  RAISE NOTICE '(e) OK — membro pendente nao le dados';

  -- ------------------------------------------------------------------
  -- (f) prova de isolamento: orgs diferentes não se enxergam
  -- ------------------------------------------------------------------
  -- Ativa o usuário da org A e cria um membro ativo na org B.
  UPDATE public.profiles SET status = 'ativo' WHERE id = u_ok;

  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (u_b, 'alguem@empresa-b.com', '{}'::jsonb, '{}'::jsonb);
  UPDATE public.profiles SET status = 'ativo' WHERE id = u_b;

  -- Usuário da org A: só enxerga o dataset da org A.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_ok::text, 'role', 'authenticated',
                      'organization_id', org_a::text,
                      'profile_status', 'ativo')::text, true);

  SELECT count(*) INTO v_count FROM public.datasets WHERE organization_id = org_b;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '(f) FALHOU: usuario da org A enxergou % dataset(s) da org B', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.datasets;
  IF v_count <> 1 THEN
    RAISE EXCEPTION '(f) FALHOU: usuario da org A deveria ver exatamente 1 dataset, viu %', v_count;
  END IF;

  -- Não pode enxergar perfis da outra org.
  SELECT count(*) INTO v_count FROM public.profiles WHERE organization_id = org_b;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '(f) FALHOU: usuario da org A enxergou perfis da org B';
  END IF;
  RESET ROLE;

  -- Espelho: usuário da org B não enxerga a org A.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_b::text, 'role', 'authenticated',
                      'organization_id', org_b::text,
                      'profile_status', 'ativo')::text, true);

  SELECT count(*) INTO v_count FROM public.datasets WHERE organization_id = org_a;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '(f) FALHOU: usuario da org B enxergou dataset da org A';
  END IF;
  RESET ROLE;
  RAISE NOTICE '(f) OK — isolamento multitenant comprovado nos dois sentidos';

  -- ------------------------------------------------------------------
  -- (g) EXTRA: cliente não consegue forjar org nem status via metadata
  -- ------------------------------------------------------------------
  DECLARE
    u_forja UUID := gen_random_uuid();
  BEGIN
    INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
    VALUES (u_forja, 'invasor@gmail.com',
            json_build_object('organization_id', org_a::text, 'status', 'ativo')::jsonb,
            '{}'::jsonb);

    SELECT organization_id, status::text INTO v_org, v_status
    FROM public.profiles WHERE id = u_forja;

    IF v_status = 'ativo' THEN
      RAISE EXCEPTION '(g) FALHOU: cliente conseguiu forjar status=ativo via metadata';
    END IF;
    RAISE NOTICE '(g) OK — status forjado pelo cliente foi ignorado (veio %)', v_status;
  END;

  -- ------------------------------------------------------------------
  -- (h) EXTRA: claim `hd` do Google tem precedência e é auditada
  -- ------------------------------------------------------------------
  DECLARE
    u_hd UUID := gen_random_uuid();
  BEGIN
    INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
    VALUES (u_hd, 'pessoa@gmail.com',
            json_build_object('hd', 'empresa-a.com')::jsonb, '{}'::jsonb);

    SELECT organization_id INTO v_org FROM public.profiles WHERE id = u_hd;
    IF v_org IS DISTINCT FROM org_a THEN
      RAISE EXCEPTION '(h) FALHOU: claim hd deveria rotear para org_a, veio %', v_org;
    END IF;

    SELECT signal INTO v_result FROM public.domain_binding_audit WHERE user_id = u_hd;
    IF v_result <> 'google_hd' THEN
      RAISE EXCEPTION '(h) FALHOU: auditoria deveria registrar sinal google_hd, veio %', v_result;
    END IF;
    RAISE NOTICE '(h) OK — claim hd usada como sinal primario e auditada';
  END;

  -- ------------------------------------------------------------------
  -- (i) FAIL-CLOSED: sem claim de org, o RLS deve NEGAR, nunca permitir.
  -- ------------------------------------------------------------------
  -- Um erro de nomenclatura entre o hook e as policies faz a claim não
  -- casar. Este teste garante que o modo de falha é negar acesso.
  DECLARE
    u_orfao UUID := gen_random_uuid();
  BEGIN
    SET LOCAL ROLE authenticated;

    -- Claims presentes, mas SEM organization_id/profile_status (simula
    -- hook não registrado ou claim renomeada).
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', u_orfao::text, 'role', 'authenticated')::text, true);

    SELECT count(*) INTO v_count FROM public.datasets;
    IF v_count <> 0 THEN
      RAISE EXCEPTION '(i) FALHOU FAIL-OPEN: sem claim de org leu % dataset(s)', v_count;
    END IF;

    SELECT count(*) INTO v_count FROM public.role_permissions;
    IF v_count <> 0 THEN
      RAISE EXCEPTION '(i) FALHOU FAIL-OPEN: sem claim de org leu % permissao(oes)', v_count;
    END IF;

    SELECT count(*) INTO v_count FROM public.profiles;
    IF v_count <> 0 THEN
      RAISE EXCEPTION '(i) FALHOU FAIL-OPEN: sem claim de org leu % perfil(is)', v_count;
    END IF;

    RESET ROLE;
    RAISE NOTICE '(i) OK — ausencia de claim falha NEGANDO acesso';
  END;

  -- ------------------------------------------------------------------
  -- (j) GUARD ANTI-DRIFT: as chaves emitidas pelo Custom Access Token
  -- Hook precisam ser exatamente as que as policies leem. Se alguém
  -- renomear de um lado só, este teste quebra — em vez de o RLS
  -- silenciosamente parar de casar em produção.
  -- ------------------------------------------------------------------
  DECLARE
    v_event  JSONB;
    v_claims JSONB;
  BEGIN
    v_event := public.custom_access_token_hook(
      jsonb_build_object('user_id', u_ok::text, 'claims', '{}'::jsonb)
    );
    v_claims := v_event -> 'claims';

    IF NOT (v_claims ? 'organization_id') THEN
      RAISE EXCEPTION '(j) FALHOU: hook nao emite a claim `organization_id` lida por current_org_id()';
    END IF;
    IF NOT (v_claims ? 'profile_status') THEN
      RAISE EXCEPTION '(j) FALHOU: hook nao emite a claim `profile_status` lida por current_profile_status()';
    END IF;

    -- O valor precisa bater com o profile real, não só existir.
    IF (v_claims ->> 'organization_id') IS DISTINCT FROM org_a::text THEN
      RAISE EXCEPTION '(j) FALHOU: claim organization_id = %, esperado %',
        v_claims ->> 'organization_id', org_a::text;
    END IF;
    IF (v_claims ->> 'profile_status') <> 'ativo' THEN
      RAISE EXCEPTION '(j) FALHOU: claim profile_status = %, esperado ativo',
        v_claims ->> 'profile_status';
    END IF;

    RAISE NOTICE '(j) OK — chaves do hook batem com as lidas pelo RLS';
  END;

  RAISE NOTICE '=====================================';
  RAISE NOTICE 'TODOS OS CENARIOS PASSARAM';
  RAISE NOTICE '=====================================';
END $$;

ROLLBACK;
