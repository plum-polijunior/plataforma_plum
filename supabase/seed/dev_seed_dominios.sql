-- =========================================================================
-- SEED DE TESTE — roteamento por domínio
-- =========================================================================
-- Cria duas organizações com domínios em estados diferentes, para exercitar
-- o trigger sem precisar de OAuth configurado.
--
-- ⚠️ AMBIENTE DE DESENVOLVIMENTO/STAGING. Não rodar em produção.
--
-- Pré-requisito: as duas migrations já aplicadas
--   20260722110000_hotfix_escalonamento_privilegio.sql
--   20260722120000_sso_dominio_control_plane.sql
-- =========================================================================

BEGIN;

-- Org A — domínio VERIFICADO. Deve rotear.
INSERT INTO public.organizations (name, share_id)
VALUES ('Empresa Teste A', 'TSTA')
ON CONFLICT (share_id) DO NOTHING;

INSERT INTO public.organization_domains
    (organization_id, domain, verified, verification_method, verified_at)
SELECT id, 'empresa-teste-a.com', true, 'admin', now()
FROM public.organizations WHERE share_id = 'TSTA'
ON CONFLICT (domain) DO UPDATE
    SET verified = true, verification_method = 'admin', verified_at = now();

-- Org B — domínio cadastrado mas NÃO verificado. NÃO deve rotear.
INSERT INTO public.organizations (name, share_id)
VALUES ('Empresa Teste B', 'TSTB')
ON CONFLICT (share_id) DO NOTHING;

INSERT INTO public.organization_domains
    (organization_id, domain, verified)
SELECT id, 'empresa-teste-b.com', false
FROM public.organizations WHERE share_id = 'TSTB'
ON CONFLICT (domain) DO UPDATE SET verified = false;

-- Cargos, para poder ativar alguém depois.
INSERT INTO public.roles (organization_id, name)
SELECT id, 'Admin' FROM public.organizations WHERE share_id IN ('TSTA','TSTB')
  AND NOT EXISTS (
    SELECT 1 FROM public.roles r
    WHERE r.organization_id = organizations.id AND r.name = 'Admin'
  );

INSERT INTO public.roles (organization_id, name)
SELECT id, 'Analista' FROM public.organizations WHERE share_id = 'TSTA'
  AND NOT EXISTS (
    SELECT 1 FROM public.roles r
    WHERE r.organization_id = organizations.id AND r.name = 'Analista'
  );

COMMIT;


-- =========================================================================
-- COMO TESTAR (sem OAuth)
-- =========================================================================
-- Cadastre-se pela tela /auth, aba "Entrar" → "Cadastrar", usando:
--
--   1. algo@empresa-teste-a.com  → deve cair na Empresa Teste A, 'pendente'
--   2. algo@empresa-teste-b.com  → deve ficar SEM org (verified = false)
--   3. algo@gmail.com            → deve ficar SEM org (denylist)
--   4. algo@dominio-qualquer.com → deve ficar SEM org (não mapeado)
--
-- Depois confira o resultado:

/*
SELECT u.email,
       o.name   AS organizacao,
       p.status,
       a.signal,
       a.result
FROM auth.users u
LEFT JOIN public.profiles p        ON p.id = u.id
LEFT JOIN public.organizations o   ON o.id = p.organization_id
LEFT JOIN public.domain_binding_audit a ON a.user_id = u.id
ORDER BY u.created_at DESC
LIMIT 20;
*/

-- Para promover alguém a 'ativo' e ver o dashboard liberar:

/*
UPDATE public.profiles
   SET status = 'ativo',
       role_id = (SELECT r.id FROM public.roles r
                  WHERE r.organization_id = profiles.organization_id
                    AND r.name = 'Analista' LIMIT 1)
 WHERE id = (SELECT id FROM auth.users WHERE email = 'algo@empresa-teste-a.com');
*/

-- ⚠️ Depois de mudar o status, é preciso RENOVAR O TOKEN para as claims
-- atualizarem: faça logout/login, ou aguarde o refresh automático.


-- =========================================================================
-- LIMPEZA
-- =========================================================================
/*
DELETE FROM auth.users WHERE email LIKE '%@empresa-teste-a.com'
                          OR email LIKE '%@empresa-teste-b.com';
DELETE FROM public.organizations WHERE share_id IN ('TSTA','TSTB');
*/
