-- =========================================================================
-- TRAVA DE SERVIDOR PARA organization_domains
-- =========================================================================
-- Data: 2026-08-12
--
-- Pré-requisito: 20260722120000 (control plane de SSO) já aplicada.
--
-- POR QUE ESTA MIGRATION EXISTE
--
-- A policy `"admin gerencia dominios"` (20260722120000, linhas 433-437) é
-- `FOR ALL` direto no PostgREST. Isso é o que torna a UI de domínios possível
-- sem RPC nenhuma — e é também um buraco, porque hoje TRÊS decisões que
-- deveriam ser do servidor chegam como declaração do cliente:
--
--   1. `verified` — nada impede um admin de inserir `gmail.com` com
--      `verified = true`. A denylist (`public_email_domains`) só é consultada
--      dentro de `resolve_org_from_identity`, ou seja, no LOGIN. Na escrita
--      não existe constraint nem trigger. O efeito prático de reivindicar um
--      provedor público: todo mundo que criar conta com aquele e-mail cai na
--      organização de quem reivindicou, como membro pendente. É captura de
--      cadastro alheio, e contraria o R-05 (isolamento de tenant é
--      invariante, não feature — CLAUDE.md §5).
--
--   2. `verified_by` — o cliente escolhe quem "verificou". Nada amarra ao
--      usuário autenticado.
--
--   3. `domain` em maiúsculas/com espaço — existe o CHECK
--      `organization_domains_domain_lowercase`, mas ele REJEITA em vez de
--      normalizar, então o erro sobra para a interface tratar.
--
-- A regra 1 do CLAUDE.md §4 é explícita: nenhuma decisão de autorização pode
-- depender de dado enviado pelo cliente. Estas três dependem.
--
-- POR QUE TRIGGER, E NÃO RPC
--
-- O custo operacional é o mesmo — uma colagem no SQL Editor, porque migrations
-- neste projeto não são aplicadas por CLI (CLAUDE.md §1). A diferença está no
-- cliente: RPCs mudariam a forma de acesso (três funções novas em
-- `types.ts.Functions`) e criariam o par indivisível do §4.12 no pior formato
-- — front novo publicado + migration não aplicada = "função não existe" na
-- tela inteira. Um trigger BEFORE é invisível para o cliente: a UI segue
-- usando `insert`/`update` do PostgREST, e se esta colagem atrasar, a tela
-- continua funcionando, só sem a trava do servidor.
--
-- O trigger também cobre um caminho que RPCs não cobririam: o `insert` direto
-- via PostgREST, que a policy `FOR ALL` continuaria permitindo mesmo que as
-- RPCs existissem.
--
-- ⚠️ QUEM MAIS DISPARA ESTE TRIGGER, E POR QUE É BENIGNO
--
--   • `handle_new_user()` (20260722130000, FLUXO A) insere o domínio do
--     fundador ao criar a organização. Ele já filtra a denylist antes
--     (20260722120000:300-303) e insere com `verified = false`, então não
--     bate em nenhuma das travas. Note que `auth.uid()` é NULL dentro do
--     trigger de `auth.users` — é por isso que `verified_by` só é sobrescrito
--     quando `verified` é true.
--
--   • A migration 20260808120000 insere `polijunior.com.br` com
--     `verified = true`. Ela roda com o papel do painel (`auth.uid()` NULL),
--     então `verified_by` viraria NULL. A FK aceita (`ON DELETE SET NULL`), e
--     `coalesce` abaixo preserva um `verified_by` explícito quando ele vier —
--     o que mantém aquela migration reaplicável sem perder a autoria.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.guardar_dominio_da_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
-- `pg_temp` obrigatoriamente por último (CLAUDE.md §4.6): sem isso, um
-- `pg_temp.public_email_domains` forjado sequestraria a checagem de denylist.
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  -- Normalizar em vez de rejeitar. O CHECK de lowercase continua lá como
  -- segunda barreira, mas quem chega aqui com "  Empresa.COM " sai válido.
  NEW.domain := lower(btrim(NEW.domain));

  IF NEW.domain IS NULL OR NEW.domain = '' THEN
    RAISE EXCEPTION 'DOMINIO_VAZIO: informe um dominio.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Sem ponto não é domínio ("empresa" em vez de "empresa.com.br"). Barato de
  -- checar aqui, e evita uma linha que nunca casaria com nada no login.
  IF position('.' IN NEW.domain) = 0 THEN
    RAISE EXCEPTION 'DOMINIO_INVALIDO: % nao parece um dominio (falta o ponto).', NEW.domain
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.domain ~ '\s' THEN
    RAISE EXCEPTION 'DOMINIO_INVALIDO: % contem espaco.', NEW.domain
      USING ERRCODE = 'check_violation';
  END IF;

  -- A trava que importa. Mesma fonte que `resolve_org_from_identity` consulta
  -- no login — a diferença é que agora ela vale também na ESCRITA.
  --
  -- ⚠️ SÓ BARRA QUANDO A ESCRITA HABILITARIA ROTEAMENTO: em INSERT (não deixa
  -- entrar linha nova de provedor público) e em UPDATE que deixe `verified`
  -- true. REVOGAR (`verified` → false) e DELETE passam sempre.
  --
  -- Isto não é preciosismo. Um domínio pode entrar na denylist DEPOIS de já
  -- estar cadastrado e verificado — foi o que aconteceu com `polijunior.com.br`
  -- em 2026-08-12, adicionado à denylist para destravar a criação de
  -- organização com e-mail corporativo. Com a checagem incondicional, a linha
  -- remanescente daquele domínio viraria imexível: o botão "Revogar" da tela
  -- falharia com DOMINIO_PUBLICO, e a única saída seria apagar a linha. Ou
  -- seja: a trava impediria justamente a ação que DESLIGA o roteamento, que é
  -- sempre a direção segura.
  IF (TG_OP = 'INSERT' OR NEW.verified)
     AND EXISTS (SELECT 1 FROM public.public_email_domains p WHERE p.domain = NEW.domain) THEN
    RAISE EXCEPTION 'DOMINIO_PUBLICO: % e um provedor de e-mail publico e nao pode ser reivindicado por uma organizacao.', NEW.domain
      USING ERRCODE = 'check_violation';
  END IF;

  -- Verificação é ato do servidor, não declaração do cliente.
  IF NEW.verified THEN
    NEW.verification_method := coalesce(NEW.verification_method, 'admin');
    NEW.verified_at         := coalesce(NEW.verified_at, timezone('utc', now()));
    -- `coalesce` e não atribuição direta: preserva um `verified_by` explícito
    -- vindo de migration, e cai para `auth.uid()` no caminho normal da UI.
    -- Quando os dois são NULL (migration rodada no painel), a FK aceita.
    NEW.verified_by := coalesce(auth.uid(), NEW.verified_by);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guardar_dominio_da_org() IS
  'Normaliza o dominio, recusa provedor publico (public_email_domains) e obriga o servidor a decidir verified_by/verified_at. Ver o cabecalho de 20260812120000_dominios_guard.sql.';

DROP TRIGGER IF EXISTS trg_guardar_dominio ON public.organization_domains;
CREATE TRIGGER trg_guardar_dominio
  BEFORE INSERT OR UPDATE ON public.organization_domains
  FOR EACH ROW EXECUTE FUNCTION public.guardar_dominio_da_org();


-- =========================================================================
-- VERIFICAÇÃO
-- =========================================================================
-- O bloco DO abaixo EXERCITA o trigger de verdade e FALHA ALTO se ele não
-- barrar — mesmo padrão de 20260808120000. Verificar só se a função "existe"
-- deixaria passar um trigger criado no lugar errado ou que não bloqueia nada.
--
-- Cada teste vive numa subtransação própria (`BEGIN ... EXCEPTION ... END`),
-- então o INSERT que dá certo é desfeito explicitamente no fim. Nada sobra.
--
-- ⚠️ Não tente acumular os resultados numa tabela temporária dentro de um
-- bloco que depois faz `RAISE` para desfazer: em PL/pgSQL o `EXCEPTION` é uma
-- subtransação, e o rollback levaria junto os próprios resultados.

DO $verificacao$
DECLARE
  v_org    uuid;
  v_barrou boolean;
  v_normal text;
BEGIN
  SELECT id INTO v_org FROM public.organizations LIMIT 1;

  IF v_org IS NULL THEN
    RAISE NOTICE 'Sem organizacao no banco: testes vivos do trigger pulados.';
    RETURN;
  END IF;

  -- (1) a denylist tem de barrar
  BEGIN
    INSERT INTO public.organization_domains (organization_id, domain, verified)
    VALUES (v_org, 'gmail.com', false);
    v_barrou := false;
  EXCEPTION WHEN check_violation THEN
    v_barrou := true;
  END;

  IF NOT v_barrou THEN
    RAISE EXCEPTION
      'TRIGGER NAO BARROU gmail.com — a trava de denylist nao esta ativa.';
  END IF;

  -- (2) a normalização tem de acontecer
  INSERT INTO public.organization_domains (organization_id, domain, verified)
  VALUES (v_org, '  TESTE-GuArD.EXEMPLO.COM  ', false)
  RETURNING domain INTO v_normal;

  IF v_normal IS DISTINCT FROM 'teste-guard.exemplo.com' THEN
    DELETE FROM public.organization_domains WHERE domain = v_normal;
    RAISE EXCEPTION
      'TRIGGER NAO NORMALIZOU: gravou "%" em vez de "teste-guard.exemplo.com".', v_normal;
  END IF;

  -- (3) revogar tem de funcionar MESMO se o domínio estiver na denylist.
  -- Simula o caso real do `polijunior.com.br`: domínio já cadastrado que entra
  -- na denylist depois. Se a checagem fosse incondicional, a linha ficaria
  -- imexível e o botão "Revogar" da tela quebraria.
  INSERT INTO public.public_email_domains (domain) VALUES ('teste-guard.exemplo.com');

  BEGIN
    UPDATE public.organization_domains
       SET verified = false
     WHERE domain = 'teste-guard.exemplo.com';
    v_barrou := false;
  EXCEPTION WHEN check_violation THEN
    v_barrou := true;
  END;

  DELETE FROM public.public_email_domains WHERE domain = 'teste-guard.exemplo.com';
  DELETE FROM public.organization_domains WHERE domain = 'teste-guard.exemplo.com';

  IF v_barrou THEN
    RAISE EXCEPTION
      'TRIGGER BLOQUEOU UMA REVOGACAO — a denylist so deve barrar quando a escrita HABILITA roteamento.';
  END IF;

  RAISE NOTICE 'Testes vivos do trigger: OK (denylist barra insert, normaliza, e deixa revogar).';
END
$verificacao$;

SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END AS situacao
FROM (VALUES
  ('Funcao guardar_dominio_da_org existe',
   EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'guardar_dominio_da_org')),

  ('Funcao e SECURITY DEFINER',
   coalesce((SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'guardar_dominio_da_org'), false)),

  ('search_path termina em pg_temp',
   coalesce((SELECT array_to_string(p.proconfig, ',') LIKE '%pg_temp'
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'guardar_dominio_da_org'), false)),

  ('Trigger trg_guardar_dominio existe em organization_domains',
   EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
            WHERE c.relname = 'organization_domains'
              AND t.tgname = 'trg_guardar_dominio' AND NOT t.tgisinternal)),

  -- tgtype: bit 0 = ROW, bit 1 = BEFORE, bit 2 = INSERT, bit 4 = UPDATE
  ('Trigger e BEFORE INSERT OR UPDATE, por linha',
   coalesce((SELECT (t.tgtype & 1) > 0 AND (t.tgtype & 2) > 0
                AND (t.tgtype & 4) > 0 AND (t.tgtype & 16) > 0
               FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
              WHERE c.relname = 'organization_domains'
                AND t.tgname = 'trg_guardar_dominio'), false)),

  ('Denylist tem os provedores publicos semeados',
   (SELECT count(*) FROM public.public_email_domains) >= 10),

  ('Nenhum dominio de teste sobrou',
   NOT EXISTS (SELECT 1 FROM public.organization_domains
                WHERE domain = 'teste-guard.exemplo.com'))
) AS t(item, ok)
ORDER BY t.ok, t.item;
