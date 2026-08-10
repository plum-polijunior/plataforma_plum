-- =========================================================================
-- SSO POR DOMÍNIO — liga polijunior.com.br → organização "Machado Lmtd"
-- =========================================================================
-- Data: 2026-08-08 (nome da organização corrigido em 2026-08-10)
--
-- ⚠️ CORREÇÃO 2026-08-10. A primeira versão deste arquivo procurava a
-- organização "Bernardo Lmtd", que não existe — o nome no banco é
-- "Machado Lmtd". O bloco DO falhava alto (como projetado), a aplicação
-- real foi feita com o nome certo, mas o bloco de verificação repetia o
-- literal errado em três lugares e acusava FALTANDO num banco correto:
-- passavam só os itens que não tocam em `organizations.name`. O nome agora
-- vive em UM lugar de cada lado (`v_nome_org` e o CTE `alvo`).
--
-- Pré-requisito: 20260722120000 (control plane de SSO) e 20260722130000
-- (join_mode) já aplicadas.
--
-- CONTEXTO
-- A migration 20260722130000 deixou TODAS as organizações em
-- `join_mode = 'share_id'` de propósito (linhas 143-147), com este motivo
-- registrado no próprio SQL:
--
--     "polijunior.com.br aparece em 4 organizações distintas e
--      organization_domains.domain e UNIQUE — colocar qualquer uma em
--      'dominio' quebraria as outras tres."
--
-- Ou seja: a Porta 2 do `handle_new_user` nunca chegou a rotear ninguém.
-- Esta migration é a decisão de produto que destrava isso, escolhendo a
-- "Machado Lmtd" como a organização dona do domínio.
--
-- ⚠️ SUPERSEDE UMA ASSERÇÃO ANTERIOR. O bloco de verificação da
-- 20260722130000 (linha 449) afirma "Todas as orgs em join_mode = share_id".
-- A partir daqui essa asserção passa a falhar de propósito — é esperado, e
-- não indica migration mal aplicada.
--
-- ⚠️ TRÊS CONSEQUÊNCIAS QUE PRECISAM ESTAR CLARAS ANTES DE RODAR
--
--   1. A "Machado Lmtd" DEIXA de aceitar código de convite. A Porta 1 do
--      `handle_new_user` (20260722130000:294) exige `join_mode='share_id'`.
--      Com a org em 'dominio', o `join_code` dela para de funcionar para
--      cadastros novos. As outras organizações seguem intactas.
--
--   2. TODO cadastro novo com e-mail @polijunior.com.br passa a cair na
--      "Machado Lmtd" — inclusive pessoas que deveriam entrar nas outras
--      três organizações que usam esse mesmo domínio. Era exatamente isso
--      que a 20260722130000 evitava. Só faz sentido se as outras três
--      estiverem inativas ou em consolidação (R-05, isolamento de tenant).
--
--   3. NÃO conserta nenhuma conta que já existe. O roteamento por domínio
--      roda no trigger `on_auth_user_created`, ou seja, só na CRIAÇÃO da
--      conta. Perfis já criados com `organization_id = NULL` continuam
--      assim e precisam de UPDATE manual, à parte desta migration.
--
-- Idempotente (UPDATE convergente + ON CONFLICT DO UPDATE) e não destrutiva:
-- não apaga linha nenhuma. Falha alto (RAISE EXCEPTION) se o nome da
-- organização não bater, em vez de não fazer nada em silêncio.
-- =========================================================================

DO $$
DECLARE
  -- Se o nome no banco estiver grafado diferente, edite AQUI e no CTE
  -- `alvo` do bloco de verificação, lá embaixo — são os dois únicos pontos.
  v_nome_org  CONSTANT TEXT := 'Machado Lmtd';
  v_dominio   CONSTANT TEXT := 'polijunior.com.br';

  v_org_id    UUID;
  v_qtd       INT;
  v_org_atual UUID;
BEGIN
  -- -----------------------------------------------------------------------
  -- 1. Resolve a organização pelo nome, sem ambiguidade.
  --    `organizations.name` não tem UNIQUE — por isso a contagem antes.
  -- -----------------------------------------------------------------------
  SELECT count(*) INTO v_qtd
  FROM public.organizations
  WHERE lower(btrim(name)) = lower(btrim(v_nome_org));

  IF v_qtd = 0 THEN
    RAISE EXCEPTION
      'Organizacao "%" nao encontrada. Nomes existentes: %',
      v_nome_org,
      (SELECT string_agg(name, ' | ' ORDER BY name) FROM public.organizations);
  ELSIF v_qtd > 1 THEN
    RAISE EXCEPTION
      'Nome "%" e ambiguo: % organizacoes correspondem. Use o id direto.',
      v_nome_org, v_qtd;
  END IF;

  SELECT id INTO v_org_id
  FROM public.organizations
  WHERE lower(btrim(name)) = lower(btrim(v_nome_org));

  -- -----------------------------------------------------------------------
  -- 2. A denylist tem precedência sobre TUDO em resolve_org_from_identity
  --    (20260722120000:212). Se o domínio estiver lá, nada abaixo teria
  --    efeito — melhor falhar agora do que deixar um vínculo morto no banco.
  -- -----------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.public_email_domains WHERE domain = v_dominio) THEN
    RAISE EXCEPTION
      'Dominio "%" esta em public_email_domains (denylist): o roteamento nunca ocorreria.',
      v_dominio;
  END IF;

  -- -----------------------------------------------------------------------
  -- 3. Só esta organização passa a entrar por domínio. As demais seguem
  --    em 'share_id' — nenhuma linha delas é tocada.
  -- -----------------------------------------------------------------------
  UPDATE public.organizations
  SET join_mode = 'dominio'
  WHERE id = v_org_id;

  -- -----------------------------------------------------------------------
  -- 4. Vincula o domínio. `domain` é UNIQUE: se já existir apontando para
  --    outra organização, este passo REDIRECIONA o vínculo. Avisa alto.
  -- -----------------------------------------------------------------------
  SELECT organization_id INTO v_org_atual
  FROM public.organization_domains
  WHERE domain = v_dominio;

  IF v_org_atual IS NOT NULL AND v_org_atual <> v_org_id THEN
    RAISE NOTICE
      'ATENCAO: dominio % estava vinculado a organizacao %. Sera redirecionado para % (%).',
      v_dominio, v_org_atual, v_nome_org, v_org_id;
  END IF;

  INSERT INTO public.organization_domains
      (organization_id, domain, verified, verification_method, verified_at)
  VALUES
      (v_org_id, v_dominio, true, 'admin', timezone('utc', now()))
  ON CONFLICT (domain) DO UPDATE SET
      organization_id     = excluded.organization_id,
      verified            = true,
      verification_method = 'admin',
      -- Preserva a data da primeira verificação em re-execuções.
      verified_at         = COALESCE(organization_domains.verified_at, excluded.verified_at);

  RAISE NOTICE 'OK: % (%) agora entra por dominio verificado %.',
    v_nome_org, v_org_id, v_dominio;
END $$;


-- -------------------------------------------------------------------------
-- Verificação
-- -------------------------------------------------------------------------
-- O alvo (nome + domínio) aparece UMA vez, na subquery `a` abaixo, e alimenta
-- tanto os testes quanto os rótulos. Antes da correção de 2026-08-10 o nome estava
-- repetido em três literais que ninguém sincronizou com `v_nome_org`, e a
-- verificação acusava FALTANDO num banco correto.
--
-- LEITURA DO RESULTADO: se falharem SÓ os três itens que citam o nome da
-- organização e passarem os outros quatro, o vínculo está funcionando — o
-- errado é o literal aqui, não o banco. Se falhar "Dominio ... verificado"
-- ou "resolve_org_from_identity devolve bound", aí sim o roteamento não
-- acontece.
SELECT t.item, CASE WHEN t.ok THEN 'OK' ELSE 'FALTANDO' END AS situacao
FROM (
  SELECT 'Machado Lmtd'::text      AS nome,   -- ← o outro ponto a editar
         'polijunior.com.br'::text AS dominio
) AS a
CROSS JOIN LATERAL (VALUES
  ('Organizacao ' || a.nome || ' em join_mode = dominio',
   EXISTS (SELECT 1 FROM public.organizations o
            WHERE lower(btrim(o.name)) = lower(btrim(a.nome))
              AND o.join_mode = 'dominio')),

  ('Dominio ' || a.dominio || ' cadastrado e verificado',
   EXISTS (SELECT 1 FROM public.organization_domains od
            WHERE od.domain = a.dominio AND od.verified = true)),

  ('Dominio aponta para a ' || a.nome,
   EXISTS (SELECT 1 FROM public.organization_domains od
             JOIN public.organizations o ON o.id = od.organization_id
            WHERE od.domain = a.dominio
              AND lower(btrim(o.name)) = lower(btrim(a.nome)))),

  ('Dominio fora da denylist',
   NOT EXISTS (SELECT 1 FROM public.public_email_domains p
                WHERE p.domain = a.dominio)),

  ('Exatamente uma organizacao em modo dominio',
   (SELECT count(*) FROM public.organizations WHERE join_mode = 'dominio') = 1),

  -- Exercita a função de verdade, com o mesmo `hd` que o Google manda.
  ('resolve_org_from_identity devolve bound',
   (SELECT r.o_result FROM public.resolve_org_from_identity(
       'alguem@' || a.dominio, a.dominio, NULL) AS r) = 'bound'),

  -- lower(btrim()) e não ILIKE: o ILIKE de antes deixava passar despercebido
  -- um espaço nas pontas do nome, ao contrário dos outros dois testes.
  ('resolve_org_from_identity aponta para a ' || a.nome,
   (SELECT lower(btrim(o.name))
      FROM public.resolve_org_from_identity(
             'alguem@' || a.dominio, a.dominio, NULL) AS res
      JOIN public.organizations o ON o.id = res.o_org_id) = lower(btrim(a.nome)))
) AS t(item, ok)
ORDER BY t.ok, t.item;
