-- =========================================================================
-- MIGRAÇÃO: TABELA RELACIONAL DE PERMISSÕES POR COLUNA (RBAC)
-- =========================================================================

-- 1. Remove a coluna JSONB antiga da tabela 'roles' se ela existir
ALTER TABLE public.roles DROP COLUMN IF EXISTS permissions;

-- 2. Cria a tabela de junção relacional 'role_permissions'
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    dataset_id UUID NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
    allowed_columns TEXT[] NOT NULL DEFAULT '{}',
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_role_dataset UNIQUE (role_id, dataset_id)
);

COMMENT ON TABLE public.role_permissions IS 'Armazena permissões de acesso por cargo (role) e base (dataset), incluindo a lista exata das colunas liberadas (allowed_columns).';

-- 3. Habilita Row Level Security (RLS)
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS
-- 4.1. Usuários podem visualizar permissões da sua organização
DROP POLICY IF EXISTS "Users can view role_permissions in their organization" ON public.role_permissions;
CREATE POLICY "Users can view role_permissions in their organization"
ON public.role_permissions FOR SELECT
USING ( organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
));

-- 4.2. Usuários autenticados podem inserir permissões para a sua organização
DROP POLICY IF EXISTS "Users can insert role_permissions" ON public.role_permissions;
CREATE POLICY "Users can insert role_permissions"
ON public.role_permissions FOR INSERT
TO authenticated
WITH CHECK (true);

-- 4.3. Usuários podem atualizar permissões da sua organização
DROP POLICY IF EXISTS "Users can update role_permissions" ON public.role_permissions;
CREATE POLICY "Users can update role_permissions"
ON public.role_permissions FOR UPDATE
TO authenticated
USING ( organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
));

-- 4.4. Usuários podem deletar permissões da sua organização
DROP POLICY IF EXISTS "Users can delete role_permissions" ON public.role_permissions;
CREATE POLICY "Users can delete role_permissions"
ON public.role_permissions FOR DELETE
TO authenticated
USING ( organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
));

-- 5. Conceder permissões para a API do Supabase
GRANT ALL ON TABLE public.role_permissions TO anon, authenticated, service_role;
