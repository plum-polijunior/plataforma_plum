-- =========================================================================
-- TESTES — ENDURECIMENTO DO CONTROL PLANE (migration 20260722130000)
-- =========================================================================
-- Como rodar: cole no SQL Editor do Supabase e clique Run.
--
-- Roda inteiro em transação com ROLLBACK: NADA é persistido.
-- Qualquer asserção que falhe aborta com mensagem nomeando o cenário.
-- Se tudo passar, retorna uma linha de confirmação ao final.
-- =========================================================================

BEGIN;

DO $$
DECLARE
  org_a      UUID;
  org_b      UUID;
  org_dom    UUID;
  role_a     UUID;
  role_b     UUID;
  ds_b       UUID;
  u_a        UUID := gen_random_uuid();
  u_b        UUID := gen_random_uuid();
  u_pend     UUID := gen_random_uuid();
  u_dom      UUID := gen_random_uuid();
  u_cod      UUID := gen_random_uuid();
  u_pos      UUID := gen_random_uuid();
  code_a     TEXT;
  code_b     TEXT;
  code_dom   TEXT;
  v_count    INT;
  v_status   TEXT;
  v_org      UUID;
  v_erro     BOOLEAN;
  v_saidas   INT;
BEGIN
  -- ==================================================================
  -- FIXTURES
  -- ==================================================================
  INSERT INTO public.organizations (name, share_id, join_code, join_mode)
  VALUES ('Org A', 'XQA1', public.gerar_join_code(), 'share_id')
  RETURNING id, join_code INTO org_a, code_a;

  INSERT INTO public.organizations (name, share_id, join_code, join_mode)
  VALUES ('Org B', 'XQB1', public.gerar_join_code(), 'share_id')
  RETURNING id, join_code INTO org_b, code_b;

  INSERT INTO public.organizations (name, share_id, join_code, join_mode)
  VALUES ('Org Dominio', 'XQD1', public.gerar_join_code(), 'dominio')
  RETURNING id, join_code INTO org_dom, code_dom;

  INSERT INTO public.organization_domains
      (organization_id, domain, verified, verification_method, verified_at)
  VALUES (org_dom, 'org-dominio-teste.com', true, 'admin', now());

  INSERT INTO public.roles (organization_id, name) VALUES (org_a, 'Admin')
  RETURNING id INTO role_a;
  INSERT INTO public.roles (organization_id, name) VALUES (org_b, 'Admin')
  RETURNING id INTO role_b;
  INSERT INTO public.datasets (organization_id, name) VALUES (org_b, 'Dados B')
  RETURNING id INTO ds_b;

  -- Admin ativo da org A
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (u_a, 'admin@org-a-teste.com',
          jsonb_build_object('join_code', code_a), '{}'::jsonb);
  UPDATE public.profiles SET status = 'ativo', role_id = role_a WHERE id = u_a;

  -- Admin ativo da org B
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (u_b, 'admin@org-b-teste.com',
          jsonb_build_object('join_code', code_b), '{}'::jsonb);
  UPDATE public.profiles SET status = 'ativo', role_id = role_b WHERE id = u_b;

  -- Membro pendente da org A
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (u_pend, 'pendente@org-a-teste.com',
          jsonb_build_object('join_code', code_a), '{}'::jsonb);

  -- ==================================================================
  -- (1) Membro pendente NAO se auto-promove
  -- ==================================================================
  -- RLS que nega UPDATE nao levanta erro: afeta 0 linhas.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', u_pend::text, 'role', 'authenticated',
                       'organization_id', org_a::text,
                       'profile_status', 'pendente')::text, true);

  UPDATE public.profiles SET status = 'ativo' WHERE id = u_pend;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RESET ROLE;

  IF v_count <> 0 THEN
    RAISE EXCEPTION '(1) FALHOU: membro pendente alterou % linha(s)', v_count;
  END IF;

  SELECT status::text INTO v_status FROM public.profiles WHERE id = u_pend;
  IF v_status <> 'pendente' THEN
    RAISE EXCEPTION '(1) FALHOU: status virou %', v_status;
  END IF;
  RAISE NOTICE '(1) OK - membro pendente nao se auto-promove';

  -- ==================================================================
  -- (2) Ninguem altera o proprio role_id, nem admin
  -- ==================================================================
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', u_a::text, 'role', 'authenticated',
                       'organization_id', org_a::text,
                       'profile_status', 'ativo')::text, true);

  UPDATE public.profiles SET role_id = NULL WHERE id = u_a;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RESET ROLE;

  IF v_count <> 0 THEN
    RAISE EXCEPTION '(2) FALHOU: usuario alterou o proprio role_id';
  END IF;
  RAISE NOTICE '(2) OK - ninguem altera o proprio cargo';

  -- ==================================================================
  -- (3) organizations escopada por tenant
  -- ==================================================================
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', u_a::text, 'role', 'authenticated',
                       'organization_id', org_a::text,
                       'profile_status', 'ativo')::text, true);

  SELECT count(*) INTO v_count FROM public.organizations WHERE id = org_b;
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION '(3) FALHOU: org A enxergou a org B';
  END IF;

  SELECT count(*) INTO v_count FROM public.organizations;
  RESET ROLE;

  IF v_count <> 1 THEN
    RAISE EXCEPTION '(3) FALHOU: org A deveria ver 1 organizacao, viu %', v_count;
  END IF;
  RAISE NOTICE '(3) OK - organizations escopada por tenant';

  -- ==================================================================
  -- (4) S-02: anonimo nao le organizations
  -- ==================================================================
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('role', 'anon')::text, true);

  SELECT count(*) INTO v_count FROM public.organizations;
  RESET ROLE;

  IF v_count <> 0 THEN
    RAISE EXCEPTION '(4) FALHOU S-02: anon leu % organizacao(oes)', v_count;
  END IF;
  RAISE NOTICE '(4) OK - leitura publica de organizations fechada';

  -- ==================================================================
  -- (5) Escrita cross-tenant barrada
  -- ==================================================================
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', u_a::text, 'role', 'authenticated',
                       'organization_id', org_a::text,
                       'profile_status', 'ativo')::text, true);

  v_erro := false;
  BEGIN
    INSERT INTO public.roles (organization_id, name) VALUES (org_b, 'Invasor');
  EXCEPTION WHEN OTHERS THEN v_erro := true;
  END;
  IF NOT v_erro THEN
    RESET ROLE;
    RAISE EXCEPTION '(5) FALHOU: criou cargo na org B';
  END IF;

  v_erro := false;
  BEGIN
    INSERT INTO public.datasets (organization_id, name) VALUES (org_b, 'Invasor');
  EXCEPTION WHEN OTHERS THEN v_erro := true;
  END;
  IF NOT v_erro THEN
    RESET ROLE;
    RAISE EXCEPTION '(5) FALHOU: criou dataset na org B';
  END IF;

  v_erro := false;
  BEGIN
    INSERT INTO public.role_permissions
        (organization_id, role_id, dataset_id, allowed_columns)
    VALUES (org_b, role_b, ds_b, ARRAY['x']);
  EXCEPTION WHEN OTHERS THEN v_erro := true;
  END;
  RESET ROLE;

  IF NOT v_erro THEN
    RAISE EXCEPTION '(5) FALHOU: criou permissao na org B';
  END IF;
  RAISE NOTICE '(5) OK - escrita cross-tenant barrada';

  -- ==================================================================
  -- (6) resolver_codigo_organizacao devolve so {org_id, org_name}
  -- ==================================================================
  SELECT org_id INTO v_org FROM public.resolver_codigo_organizacao(code_a);
  IF v_org IS DISTINCT FROM org_a THEN
    RAISE EXCEPTION '(6) FALHOU: codigo resolveu para % em vez de %', v_org, org_a;
  END IF;

  -- Conta as colunas de SAIDA da funcao (proargmodes 't' = TABLE).
  SELECT count(*) INTO v_saidas
  FROM pg_proc p, unnest(p.proargmodes) m
  WHERE p.proname = 'resolver_codigo_organizacao' AND m = 't';

  IF v_saidas <> 2 THEN
    RAISE EXCEPTION '(6) FALHOU: funcao expoe % campos, esperado 2', v_saidas;
  END IF;

  -- Codigo inexistente nao deve devolver nada.
  SELECT count(*) INTO v_count
  FROM public.resolver_codigo_organizacao('ZZZZZZZZZZZZ');
  IF v_count <> 0 THEN
    RAISE EXCEPTION '(6) FALHOU: codigo inexistente devolveu linha';
  END IF;
  RAISE NOTICE '(6) OK - resolucao de codigo nao vaza a linha inteira';

  -- ==================================================================
  -- (7) As duas portas produzem 'pendente'
  -- ==================================================================
  -- Porta 1: codigo de convite (ja exercitada em u_pend).
  SELECT status::text INTO v_status FROM public.profiles WHERE id = u_pend;
  IF v_status <> 'pendente' THEN
    RAISE EXCEPTION '(7) FALHOU: entrada por codigo gerou status %', v_status;
  END IF;

  -- Porta 2: dominio verificado de org em modo 'dominio'.
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (u_dom, 'alguem@org-dominio-teste.com', '{}'::jsonb, '{}'::jsonb);

  SELECT organization_id, status::text INTO v_org, v_status
  FROM public.profiles WHERE id = u_dom;

  IF v_org IS DISTINCT FROM org_dom THEN
    RAISE EXCEPTION '(7) FALHOU: dominio verificado nao vinculou a org correta';
  END IF;
  IF v_status <> 'pendente' THEN
    RAISE EXCEPTION '(7) FALHOU: entrada por dominio gerou status %', v_status;
  END IF;
  RAISE NOTICE '(7) OK - ambas as portas produzem pendente';

  -- ==================================================================
  -- (8) join_mode isola as duas portas
  -- ==================================================================
  -- (8a) join_code de org em modo 'dominio' NAO funciona.
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (u_cod, 'tentativa@dominio-nao-mapeado.com',
          jsonb_build_object('join_code', code_dom), '{}'::jsonb);

  SELECT organization_id INTO v_org FROM public.profiles WHERE id = u_cod;
  IF v_org IS NOT NULL THEN
    RAISE EXCEPTION '(8a) FALHOU: codigo de org em modo dominio foi aceito';
  END IF;

  -- (8b) dominio verificado NAO roteia se a org estiver em modo 'share_id'.
  UPDATE public.organizations SET join_mode = 'share_id' WHERE id = org_dom;

  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (u_pos, 'outro@org-dominio-teste.com', '{}'::jsonb, '{}'::jsonb);

  SELECT organization_id INTO v_org FROM public.profiles WHERE id = u_pos;
  IF v_org IS NOT NULL THEN
    RAISE EXCEPTION '(8b) FALHOU: dominio roteou para org em modo share_id';
  END IF;
  RAISE NOTICE '(8) OK - join_mode isola as duas portas';

  -- ==================================================================
  -- (9) Auditoria e append-only
  -- ==================================================================
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', u_a::text, 'role', 'authenticated',
                       'organization_id', org_a::text,
                       'profile_status', 'ativo')::text, true);

  v_erro := false;
  BEGIN
    INSERT INTO public.profile_changes_audit (profile_id, field, old_value, new_value)
    VALUES (u_a, 'status', 'pendente', 'ativo');
  EXCEPTION WHEN OTHERS THEN v_erro := true;
  END;
  IF NOT v_erro THEN
    RESET ROLE;
    RAISE EXCEPTION '(9) FALHOU: usuario comum inseriu na auditoria';
  END IF;

  v_erro := false;
  BEGIN
    DELETE FROM public.profile_changes_audit;
  EXCEPTION WHEN OTHERS THEN v_erro := true;
  END;
  RESET ROLE;

  IF NOT v_erro THEN
    RAISE EXCEPTION '(9) FALHOU: usuario comum apagou a auditoria';
  END IF;
  RAISE NOTICE '(9) OK - auditoria e append-only';

  -- ==================================================================
  -- (10) Trigger de auditoria grava de -> para
  -- ==================================================================
  UPDATE public.profiles SET status = 'ativo' WHERE id = u_pend;

  SELECT count(*) INTO v_count
  FROM public.profile_changes_audit
  WHERE profile_id = u_pend
    AND field     = 'status'
    AND old_value = 'pendente'
    AND new_value = 'ativo';

  IF v_count <> 1 THEN
    RAISE EXCEPTION '(10) FALHOU: auditoria gravou % linha(s), esperado 1', v_count;
  END IF;
  RAISE NOTICE '(10) OK - trilha de auditoria grava de -> para';

  RAISE NOTICE '=== TODOS OS CENARIOS PASSARAM ===';
END $$;

ROLLBACK;

-- Só alcançada se nenhuma asserção abortou.
SELECT
  'TODOS OS 10 CENARIOS DE ENDURECIMENTO PASSARAM' AS resultado,
  'Nenhum dado foi gravado (ROLLBACK)'             AS observacao;
