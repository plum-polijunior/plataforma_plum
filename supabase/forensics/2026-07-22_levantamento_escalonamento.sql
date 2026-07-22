-- =========================================================================
-- LEVANTAMENTO FORENSE — escalonamento de privilégio via raw_user_meta_data
-- =========================================================================
-- Rodar ANTES de aplicar as migrations. Somente leitura: nenhum INSERT,
-- UPDATE ou DELETE. Pode ser executado no SQL Editor do Supabase.
--
-- OBJETIVO: responder "alguém já explorou isso?" — não "a porta está
-- fechada?".
--
-- LIMITAÇÃO IMPORTANTE, LEIA ANTES DE CONCLUIR QUALQUER COISA:
-- não existe tabela de auditoria no schema atual, e `public.profiles` não
-- tem coluna `updated_at`. Portanto NÃO é possível saber quando um status
-- mudou, nem quem mudou. As consultas abaixo detectam ANOMALIAS, não
-- provam exploração. Resultado vazio na Consulta 1 é evidência forte de
-- que ninguém passou; resultado não-vazio exige conferência linha a linha.
-- =========================================================================


-- -------------------------------------------------------------------------
-- CONSULTA 1 — PRINCIPAL: metadata contendo campos que o cliente não
-- deveria controlar. Este é o rastro histórico direto da exploração.
-- -------------------------------------------------------------------------
SELECT
    u.email,
    p.organization_id,
    o.name  AS organizacao,
    p.status,
    u.created_at,
    u.raw_user_meta_data,
    -- Classificação rápida para triagem:
    CASE
      WHEN u.raw_user_meta_data ->> 'is_admin_setup' = 'true'
        THEN 'ESPERADO — criacao de organizacao'
      WHEN u.raw_user_meta_data ->> 'status' = 'pendente'
        THEN 'ESPERADO — fluxo de cadastro normal do front'
      WHEN u.raw_user_meta_data ->> 'status' = 'ativo'
        THEN '>>> INVESTIGAR — status ativo forjado pelo cliente'
      WHEN u.raw_user_meta_data ? 'organization_id'
        THEN 'CONFERIR — org enviada pelo cliente'
      ELSE 'CONFERIR'
    END AS triagem
FROM public.profiles p
JOIN auth.users u          ON u.id = p.id
LEFT JOIN public.organizations o ON o.id = p.organization_id
WHERE u.raw_user_meta_data ? 'status'
   OR u.raw_user_meta_data ? 'organization_id'
ORDER BY
  (u.raw_user_meta_data ->> 'status' = 'ativo') DESC NULLS LAST,
  u.created_at DESC;


-- -------------------------------------------------------------------------
-- CONSULTA 2 — Membros ATIVOS cujo domínio de e-mail difere do domínio
-- de quem criou a organização. Sinal clássico de entrada indevida.
-- -------------------------------------------------------------------------
WITH fundador AS (
    -- Assume-se fundador = perfil mais antigo com cargo Admin na org.
    SELECT DISTINCT ON (p.organization_id)
           p.organization_id,
           split_part(lower(u.email), '@', 2) AS dominio_fundador
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    LEFT JOIN public.roles r ON r.id = p.role_id
    WHERE r.name = 'Admin'
    ORDER BY p.organization_id, p.created_at ASC
)
SELECT
    o.name AS organizacao,
    u.email,
    split_part(lower(u.email), '@', 2) AS dominio_membro,
    f.dominio_fundador,
    p.status,
    u.created_at
FROM public.profiles p
JOIN auth.users u          ON u.id = p.id
JOIN public.organizations o ON o.id = p.organization_id
LEFT JOIN fundador f        ON f.organization_id = p.organization_id
WHERE p.status::text = 'ativo'
  AND f.dominio_fundador IS NOT NULL
  AND split_part(lower(u.email), '@', 2) <> f.dominio_fundador
ORDER BY o.name, u.created_at DESC;


-- -------------------------------------------------------------------------
-- CONSULTA 3 — Quantos domínios distintos existem por organização.
-- Uma org saudável tende a 1 (ou poucos). Muitos domínios = investigar.
-- -------------------------------------------------------------------------
SELECT
    o.name AS organizacao,
    count(*)                                                  AS total_membros,
    count(*) FILTER (WHERE p.status::text = 'ativo')           AS ativos,
    count(DISTINCT split_part(lower(u.email), '@', 2))         AS dominios_distintos,
    array_agg(DISTINCT split_part(lower(u.email), '@', 2))     AS dominios
FROM public.profiles p
JOIN auth.users u           ON u.id = p.id
JOIN public.organizations o ON o.id = p.organization_id
GROUP BY o.name
HAVING count(DISTINCT split_part(lower(u.email), '@', 2)) > 1
ORDER BY dominios_distintos DESC;


-- -------------------------------------------------------------------------
-- CONSULTA 4 — Membros ATIVOS com e-mail de provedor público.
-- Nenhum deveria existir num produto B2B.
-- -------------------------------------------------------------------------
SELECT
    o.name AS organizacao,
    u.email,
    p.status,
    u.created_at,
    u.raw_user_meta_data
FROM public.profiles p
JOIN auth.users u           ON u.id = p.id
LEFT JOIN public.organizations o ON o.id = p.organization_id
WHERE split_part(lower(u.email), '@', 2) IN (
    'gmail.com','googlemail.com','outlook.com','hotmail.com','live.com',
    'yahoo.com','yahoo.com.br','icloud.com','me.com','aol.com',
    'proton.me','protonmail.com','bol.com.br','uol.com.br','terra.com.br'
)
ORDER BY (p.status::text = 'ativo') DESC, u.created_at DESC;


-- -------------------------------------------------------------------------
-- CONSULTA 5 — Membros ATIVOS que NÃO passaram pelo fluxo de criação de
-- org. Como o front só envia status 'ativo' no admin setup, qualquer
-- 'ativo' sem `is_admin_setup` merece explicação.
-- -------------------------------------------------------------------------
SELECT
    o.name AS organizacao,
    u.email,
    r.name AS cargo,
    u.created_at,
    u.raw_user_meta_data
FROM public.profiles p
JOIN auth.users u           ON u.id = p.id
LEFT JOIN public.organizations o ON o.id = p.organization_id
LEFT JOIN public.roles r        ON r.id = p.role_id
WHERE p.status::text = 'ativo'
  AND COALESCE(u.raw_user_meta_data ->> 'is_admin_setup', '') <> 'true'
ORDER BY u.created_at DESC;


-- -------------------------------------------------------------------------
-- CONSULTA 6 — Contexto: volume total, para dimensionar o esforço de
-- conferência manual.
-- -------------------------------------------------------------------------
SELECT
    (SELECT count(*) FROM auth.users)                                        AS usuarios,
    (SELECT count(*) FROM public.profiles)                                   AS perfis,
    (SELECT count(*) FROM public.profiles WHERE status::text = 'ativo')      AS perfis_ativos,
    (SELECT count(*) FROM public.organizations)                              AS organizacoes,
    (SELECT count(*) FROM public.datasets)                                   AS datasets;
