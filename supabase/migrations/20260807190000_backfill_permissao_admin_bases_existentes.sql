-- =========================================================================
-- BACKFILL: cargo Admin sem acesso às bases conectadas antes de hoje
-- =========================================================================
-- Data: 2026-08-07
--
-- `role_permissions` nunca ganha uma linha automaticamente quando uma base
-- é conectada (CLAUDE.md §3: permissão default é nada, sempre explícita por
-- par cargo/dataset). O cargo Admin nem aparece no formulário de permissões
-- em Dashboard.tsx — a tela assume que ele "possui acesso irrestrito", mas
-- nada no backend (ai-plum-chat, dashboard-execute, a query de
-- PlumChat.tsx) implementa esse bypass: todos leem allowed_columns de
-- role_permissions, e sem linha o resultado é [] (zero acesso).
--
-- A partir de agora, `DatabasePipeline.tsx` cria essa linha para o Admin no
-- momento em que a base fica "active" (ver handleFinalizeAndSave). Esta
-- migration só cobre o passado: toda base já "active" antes dessa mudança
-- existir, para todas as organizações.
--
-- Idempotente. Não destrutivo: só cria a linha se ela não existir, ou
-- atualiza uma linha já existente sem colunas liberadas (nunca sobrescreve
-- uma restrição que alguém já tenha configurado manualmente para o Admin).
-- =========================================================================

INSERT INTO public.role_permissions (organization_id, role_id, dataset_id, allowed_columns, created_by)
SELECT
  d.organization_id,
  r.id,
  d.id,
  COALESCE(
    (SELECT array_agg(k) FROM jsonb_object_keys(d.schema_metadata -> 'columns') AS k),
    '{}'
  ),
  NULL
FROM public.datasets d
JOIN public.roles r
  ON r.organization_id = d.organization_id
  AND lower(btrim(r.name)) = 'admin'
WHERE d.status = 'active'
  AND d.schema_metadata IS NOT NULL
ON CONFLICT (role_id, dataset_id)
DO UPDATE SET allowed_columns = excluded.allowed_columns
WHERE role_permissions.allowed_columns = '{}';


-- -------------------------------------------------------------------------
-- Verificação
-- -------------------------------------------------------------------------
SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END AS situacao
FROM (VALUES
  ('Toda base active tem permissao do Admin',
   NOT EXISTS (
     SELECT 1
     FROM public.datasets d
     JOIN public.roles r
       ON r.organization_id = d.organization_id
       AND lower(btrim(r.name)) = 'admin'
     LEFT JOIN public.role_permissions rp
       ON rp.role_id = r.id AND rp.dataset_id = d.id
     WHERE d.status = 'active' AND rp.id IS NULL
   ))
) AS t(item, ok)
ORDER BY ok, item;
