-- =========================================================================
-- MIGRAÇÃO SUPABASE: PERMISSÕES DE CARGO POR COLUNA (RBAC)
-- =========================================================================
-- Execute este script diretamente no SQL Editor do seu painel do Supabase
-- caso o seu banco já possua a tabela 'roles' criada.

-- 1. Adiciona a coluna JSONB permissions na tabela roles
ALTER TABLE public.roles 
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{"allowed_datasets": [], "columns_access": {}}'::jsonb;

-- 2. Adiciona um comentário explicativo no banco
COMMENT ON COLUMN public.roles.permissions IS 'Armazena a lista de IDs de datasets permitidos (allowed_datasets) e as colunas liberadas por dataset (columns_access).';

-- 3. Exemplo de estrutura que será armazenada no campo permissions:
/*
{
  "allowed_datasets": ["uuid-do-dataset-1", "uuid-do-dataset-2"],
  "columns_access": {
    "uuid-do-dataset-1": ["nome_cliente", "valor_venda", "data"],
    "uuid-do-dataset-2": ["codigo_projeto", "status"]
  }
}
*/
