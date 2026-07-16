-- 1. Habilitar a extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Criar ENUM para o status do perfil (Seguro contra re-execução)
DO $$ BEGIN
    CREATE TYPE public.profile_status AS ENUM ('pendente', 'ativo', 'rejeitado');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Criar a tabela de Organizações
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    share_id VARCHAR(4) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Criar a tabela de Cargos (Roles)
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Criar a tabela de Perfis (Profiles), linkada ao auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    role_id UUID REFERENCES public.roles(id) ON DELETE SET NULL,
    status public.profile_status DEFAULT 'pendente'::public.profile_status NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Trigger para criar o perfil automaticamente quando um usuário se cadastra no Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_org_id UUID;
  v_role_id UUID;
BEGIN
  -- Verifica se é o fluxo de criação de uma nova Organização (Admin Setup)
  IF new.raw_user_meta_data->>'is_admin_setup' = 'true' THEN
    
    -- 1. Cria a Organização
    INSERT INTO public.organizations (name, share_id)
    VALUES (
      new.raw_user_meta_data->>'org_name',
      new.raw_user_meta_data->>'org_share_id'
    ) RETURNING id INTO v_org_id;

    -- 2. Cria o Cargo de Admin
    INSERT INTO public.roles (organization_id, name)
    VALUES (v_org_id, 'Admin')
    RETURNING id INTO v_role_id;

    -- 3. Cria o Perfil linkando o usuário à organização e ao cargo de Admin
    INSERT INTO public.profiles (id, email, organization_id, role_id, status)
    VALUES (new.id, new.email, v_org_id, v_role_id, 'ativo'::public.profile_status);

  ELSE
    -- Fluxo normal: usuário entrando em uma organização que já existe
    INSERT INTO public.profiles (id, email, organization_id, status)
    VALUES (
      new.id,
      new.email,
      (new.raw_user_meta_data->>'organization_id')::uuid,
      COALESCE((new.raw_user_meta_data->>'status')::public.profile_status, 'pendente'::public.profile_status)
    );
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 7. Configuração Básica de Row Level Security (RLS)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 7.1. Qualquer um (anônimo ou logado) pode ler as organizações (necessário para checar se o ID "CALI" existe no input)
DROP POLICY IF EXISTS "Allow public read of organizations" ON public.organizations;
CREATE POLICY "Allow public read of organizations"
ON public.organizations FOR SELECT
USING (true);

-- 7.2. Apenas usuários autenticados podem inserir organizações (Trigger bypassa isso via SECURITY DEFINER)
DROP POLICY IF EXISTS "Allow authenticated users to insert organizations" ON public.organizations;
CREATE POLICY "Allow authenticated users to insert organizations"
ON public.organizations FOR INSERT
TO authenticated
WITH CHECK (true);

-- 7.3. Usuários podem ver perfis da sua própria organização
DROP POLICY IF EXISTS "Users can view profiles in their organization" ON public.profiles;
CREATE POLICY "Users can view profiles in their organization"
ON public.profiles FOR SELECT
USING ( organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
));

-- 7.4. Usuários podem atualizar perfis da sua organização (na prática, apenas Admins farão isso via UI)
DROP POLICY IF EXISTS "Users can update profiles in their organization" ON public.profiles;
CREATE POLICY "Users can update profiles in their organization"
ON public.profiles FOR UPDATE
USING ( organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
));

-- 7.5. Usuários podem ver cargos na sua própria organização
DROP POLICY IF EXISTS "Users can view roles in their organization" ON public.roles;
CREATE POLICY "Users can view roles in their organization"
ON public.roles FOR SELECT
USING (true); -- Permitimos leitura global para simplificar o login

-- 7.6. Apenas usuários logados podem criar cargos
DROP POLICY IF EXISTS "Users can create roles" ON public.roles;
CREATE POLICY "Users can create roles"
ON public.roles FOR INSERT
TO authenticated
WITH CHECK (true);

-- =========================================================================
-- 8. PERMISSÕES DE ROLE DO POSTGRES (CRÍTICO PARA A API FUNCIONAR)
-- =========================================================================
-- Como as tabelas foram criadas via script, o Postgres pode não ter
-- concedido acesso de leitura/escrita para a API automaticamente.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.organizations TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.roles TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.profiles TO anon, authenticated, service_role;


-- =========================================================================
-- 9. TABELA DATASETS (BASE DE DADOS DO USUÁRIO)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.datasets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    google_sheet_id text,
    schema_metadata jsonb,
    status text DEFAULT 'processing',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view datasets in their organization" ON public.datasets;
CREATE POLICY "Users can view datasets in their organization"
ON public.datasets FOR SELECT
USING ( organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
));

DROP POLICY IF EXISTS "Users can insert datasets" ON public.datasets;
CREATE POLICY "Users can insert datasets"
ON public.datasets FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update their datasets" ON public.datasets;
CREATE POLICY "Users can update their datasets"
ON public.datasets FOR UPDATE
TO authenticated
USING ( organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
));

GRANT ALL ON TABLE public.datasets TO anon, authenticated, service_role;
