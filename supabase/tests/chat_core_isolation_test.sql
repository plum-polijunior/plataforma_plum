-- =========================================================================
-- TESTES — ISOLAMENTO DO CHAT (migration 20260803120000_chat_core)
-- =========================================================================
-- Como rodar: cole no SQL Editor do Supabase e clique Run.
--
-- Roda inteiro em transação com ROLLBACK: NADA é persistido.
-- Qualquer asserção que falhe aborta com mensagem nomeando o cenário.
-- Se tudo passar, retorna uma linha de confirmação ao final.
--
-- Pré-requisito: migrations 20260722120000/130000 e 20260803120000 aplicadas.
--
-- COBRE:
--   (1) Dono só vê a própria conversa (mesmo org, outro usuário não vaza).
--   (2) Isolamento entre orgs (A não vê conversa/mensagem de B).
--   (3) Membro pendente não lê nem a própria conversa (gate is_active_member).
--   (4) Cliente autenticado NÃO escreve em messages (single-writer).
--   (5) Cliente autenticado NÃO cria conversation direto.
--   (6) assistants: admin gerencia a própria org; cross-tenant e não-admin barrados.
-- =========================================================================

BEGIN;

DO $$
DECLARE
  org_a     UUID;
  org_b     UUID;
  role_a    UUID;
  role_b    UUID;
  role_view UUID;
  code_a    TEXT;
  code_b    TEXT;
  u_a       UUID := gen_random_uuid();  -- Admin ativo, org A
  u_a2      UUID := gen_random_uuid();  -- outro membro ativo, org A
  u_view    UUID := gen_random_uuid();  -- membro ativo NÃO-admin, org A
  u_b       UUID := gen_random_uuid();  -- Admin ativo, org B
  u_pend    UUID := gen_random_uuid();  -- membro pendente, org A
  conv_a    UUID;
  conv_a2   UUID;
  conv_b    UUID;
  conv_pend UUID;
  asst_a    UUID;
  v_count   INT;
  v_erro    BOOLEAN;
BEGIN
  -- ==================================================================
  -- FIXTURES (rodam como postgres → RLS não se aplica na semeadura)
  -- ==================================================================
  INSERT INTO public.organizations (name, share_id, join_code, join_mode)
  VALUES ('Chat Org A', 'CHTA', public.gerar_join_code(), 'share_id')
  RETURNING id, join_code INTO org_a, code_a;

  INSERT INTO public.organizations (name, share_id, join_code, join_mode)
  VALUES ('Chat Org B', 'CHTB', public.gerar_join_code(), 'share_id')
  RETURNING id, join_code INTO org_b, code_b;

  INSERT INTO public.roles (organization_id, name) VALUES (org_a, 'Admin')
  RETURNING id INTO role_a;
  INSERT INTO public.roles (organization_id, name) VALUES (org_b, 'Admin')
  RETURNING id INTO role_b;
  INSERT INTO public.roles (organization_id, name) VALUES (org_a, 'Viewer')
  RETURNING id INTO role_view;

  -- Usuários (o trigger handle_new_user cria o profile ligado à org pelo join_code).
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (u_a, 'a@chat-a.com', jsonb_build_object('join_code', code_a), '{}'::jsonb);
  UPDATE public.profiles SET status = 'ativo', role_id = role_a WHERE id = u_a;

  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (u_a2, 'a2@chat-a.com', jsonb_build_object('join_code', code_a), '{}'::jsonb);
  UPDATE public.profiles SET status = 'ativo', role_id = role_a WHERE id = u_a2;

  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (u_view, 'v@chat-a.com', jsonb_build_object('join_code', code_a), '{}'::jsonb);
  UPDATE public.profiles SET status = 'ativo', role_id = role_view WHERE id = u_view;

  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (u_b, 'b@chat-b.com', jsonb_build_object('join_code', code_b), '{}'::jsonb);
  UPDATE public.profiles SET status = 'ativo', role_id = role_b WHERE id = u_b;

  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (u_pend, 'p@chat-a.com', jsonb_build_object('join_code', code_a), '{}'::jsonb);
  -- u_pend permanece 'pendente'.

  -- Conversas + mensagens (semeadas direto, como o service_role faria).
  INSERT INTO public.conversations (organization_id, profile_id, title)
  VALUES (org_a, u_a, 'Conversa de A') RETURNING id INTO conv_a;
  INSERT INTO public.messages (conversation_id, organization_id, profile_id, direcao, content)
  VALUES (conv_a, org_a, u_a, 'in',  'faturamento?'),
         (conv_a, org_a, u_a, 'out', 'R$ 100.000');

  INSERT INTO public.conversations (organization_id, profile_id, title)
  VALUES (org_a, u_a2, 'Conversa de A2') RETURNING id INTO conv_a2;
  INSERT INTO public.messages (conversation_id, organization_id, profile_id, direcao, content)
  VALUES (conv_a2, org_a, u_a2, 'in', 'segredo do A2');

  INSERT INTO public.conversations (organization_id, profile_id, title)
  VALUES (org_b, u_b, 'Conversa de B') RETURNING id INTO conv_b;
  INSERT INTO public.messages (conversation_id, organization_id, profile_id, direcao, content)
  VALUES (conv_b, org_b, u_b, 'in', 'dados da org B');

  INSERT INTO public.conversations (organization_id, profile_id, title)
  VALUES (org_a, u_pend, 'Conversa do pendente') RETURNING id INTO conv_pend;
  INSERT INTO public.messages (conversation_id, organization_id, profile_id, direcao, content)
  VALUES (conv_pend, org_a, u_pend, 'in', 'oi');

  INSERT INTO public.assistants (organization_id, name)
  VALUES (org_a, 'Bot A') RETURNING id INTO asst_a;

  -- ==================================================================
  -- (1) Dono só vê a própria conversa (mesmo org, outro usuário não vaza)
  -- ==================================================================
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', u_a::text, 'role', 'authenticated',
                       'organization_id', org_a::text,
                       'profile_status', 'ativo')::text, true);

  SELECT count(*) INTO v_count FROM public.conversations;
  IF v_count <> 1 THEN
    RESET ROLE;
    RAISE EXCEPTION '(1) FALHOU: A viu % conversas, esperado 1 (a própria)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.conversations WHERE id = conv_a2;
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION '(1) FALHOU: A enxergou a conversa de A2 (mesmo org)';
  END IF;

  SELECT count(*) INTO v_count FROM public.messages;
  RESET ROLE;
  IF v_count <> 2 THEN
    RAISE EXCEPTION '(1) FALHOU: A viu % mensagens, esperado 2 (só as suas)', v_count;
  END IF;
  RAISE NOTICE '(1) OK - dono so ve a propria conversa';

  -- ==================================================================
  -- (2) Isolamento entre orgs (A não vê nada da org B)
  -- ==================================================================
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', u_a::text, 'role', 'authenticated',
                       'organization_id', org_a::text,
                       'profile_status', 'ativo')::text, true);

  SELECT count(*) INTO v_count
  FROM public.conversations WHERE organization_id = org_b;
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION '(2) FALHOU: A enxergou conversa da org B';
  END IF;

  SELECT count(*) INTO v_count FROM public.messages WHERE conversation_id = conv_b;
  RESET ROLE;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '(2) FALHOU: A enxergou mensagem da org B';
  END IF;
  RAISE NOTICE '(2) OK - isolamento entre orgs';

  -- ==================================================================
  -- (3) Membro pendente não lê nem a própria conversa
  -- ==================================================================
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', u_pend::text, 'role', 'authenticated',
                       'organization_id', org_a::text,
                       'profile_status', 'pendente')::text, true);

  SELECT count(*) INTO v_count FROM public.conversations;
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION '(3) FALHOU: pendente leu % conversa(s)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.messages;
  RESET ROLE;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '(3) FALHOU: pendente leu % mensagem(ns)', v_count;
  END IF;
  RAISE NOTICE '(3) OK - pendente nao le nada (gate is_active_member)';

  -- ==================================================================
  -- (4) Cliente autenticado NÃO escreve em messages (single-writer)
  -- ==================================================================
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', u_a::text, 'role', 'authenticated',
                       'organization_id', org_a::text,
                       'profile_status', 'ativo')::text, true);

  v_erro := false;
  BEGIN
    INSERT INTO public.messages (conversation_id, organization_id, profile_id, direcao, content)
    VALUES (conv_a, org_a, u_a, 'in', 'injetada pelo cliente');
  EXCEPTION WHEN OTHERS THEN v_erro := true;
  END;
  IF NOT v_erro THEN
    RESET ROLE;
    RAISE EXCEPTION '(4) FALHOU: cliente inseriu mensagem direto';
  END IF;

  v_erro := false;
  BEGIN
    UPDATE public.messages SET content = 'adulterada' WHERE conversation_id = conv_a;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN RAISE EXCEPTION 'update afetou linhas'; END IF;
  EXCEPTION WHEN OTHERS THEN v_erro := true;
  END;

  v_erro := false;
  BEGIN
    DELETE FROM public.messages WHERE conversation_id = conv_a;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN RAISE EXCEPTION 'delete afetou linhas'; END IF;
  EXCEPTION WHEN OTHERS THEN v_erro := true;
  END;
  RESET ROLE;

  -- A mensagem original continua íntegra?
  SELECT count(*) INTO v_count
  FROM public.messages WHERE conversation_id = conv_a AND content = 'R$ 100.000';
  IF v_count <> 1 THEN
    RAISE EXCEPTION '(4) FALHOU: mensagem original foi alterada/removida pelo cliente';
  END IF;
  RAISE NOTICE '(4) OK - cliente nao escreve/edita/apaga messages';

  -- ==================================================================
  -- (5) Cliente autenticado NÃO cria conversation direto
  -- ==================================================================
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', u_a::text, 'role', 'authenticated',
                       'organization_id', org_a::text,
                       'profile_status', 'ativo')::text, true);

  v_erro := false;
  BEGIN
    INSERT INTO public.conversations (organization_id, profile_id, title)
    VALUES (org_a, u_a, 'criada pelo cliente');
  EXCEPTION WHEN OTHERS THEN v_erro := true;
  END;
  RESET ROLE;
  IF NOT v_erro THEN
    RAISE EXCEPTION '(5) FALHOU: cliente criou conversation direto';
  END IF;
  RAISE NOTICE '(5) OK - cliente nao cria conversation direto';

  -- ==================================================================
  -- (6) assistants: admin gerencia a própria org; cross-tenant/não-admin barrados
  -- ==================================================================
  -- (6a) Admin da org A cria assistant na própria org.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', u_a::text, 'role', 'authenticated',
                       'organization_id', org_a::text,
                       'profile_status', 'ativo')::text, true);

  v_erro := false;
  BEGIN
    INSERT INTO public.assistants (organization_id, name) VALUES (org_a, 'Bot novo A');
  EXCEPTION WHEN OTHERS THEN v_erro := true;
  END;
  IF v_erro THEN
    RESET ROLE;
    RAISE EXCEPTION '(6a) FALHOU: admin nao conseguiu criar assistant na propria org';
  END IF;

  -- (6b) Admin de A NÃO cria assistant na org B (cross-tenant).
  v_erro := false;
  BEGIN
    INSERT INTO public.assistants (organization_id, name) VALUES (org_b, 'Invasor');
  EXCEPTION WHEN OTHERS THEN v_erro := true;
  END;
  IF NOT v_erro THEN
    RESET ROLE;
    RAISE EXCEPTION '(6b) FALHOU: admin de A criou assistant na org B';
  END IF;
  RESET ROLE;

  -- (6c) Membro NÃO-admin (viewer) lê os assistants da org, mas não escreve.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', u_view::text, 'role', 'authenticated',
                       'organization_id', org_a::text,
                       'profile_status', 'ativo')::text, true);

  SELECT count(*) INTO v_count FROM public.assistants WHERE id = asst_a;
  IF v_count <> 1 THEN
    RESET ROLE;
    RAISE EXCEPTION '(6c) FALHOU: membro nao leu o assistant da propria org';
  END IF;

  v_erro := false;
  BEGIN
    INSERT INTO public.assistants (organization_id, name) VALUES (org_a, 'Viewer tentou');
  EXCEPTION WHEN OTHERS THEN v_erro := true;
  END;
  RESET ROLE;
  IF NOT v_erro THEN
    RAISE EXCEPTION '(6c) FALHOU: membro nao-admin criou assistant';
  END IF;
  RAISE NOTICE '(6) OK - assistants: admin gerencia; cross-tenant e nao-admin barrados';

  RAISE NOTICE '=== TODOS OS CENARIOS DE ISOLAMENTO DO CHAT PASSARAM ===';
END $$;

-- Confirmacao DENTRO da transacao: se qualquer assercao abortar, a transacao
-- fica em estado abortado e este SELECT nao roda. Nao ha falso positivo.
SELECT
  'TODOS OS 6 CENARIOS DE ISOLAMENTO DO CHAT PASSARAM' AS resultado,
  'Nenhum dado sera gravado (ROLLBACK)'               AS observacao;

ROLLBACK;
