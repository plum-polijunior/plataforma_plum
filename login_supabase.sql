-- 1. Habilitar a extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Criar ENUM para o status do perfil
CREATE TYPE public.profile_status AS ENUM ('pendente', 'ativo', 'rejeitado');

-- 3. Criar a tabela de Organizações
CREATE TABLE public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    share_id VARCHAR(4) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Criar a tabela de Cargos (Roles)
CREATE TABLE public.roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Criar a tabela de Perfis (Profiles), linkada ao auth.users
CREATE TABLE public.profiles (
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
BEGIN
  INSERT INTO public.profiles (id, email, organization_id, status)
  VALUES (
    new.id,
    new.email,
    -- Pega o organization_id que o frontend mandou no raw_user_meta_data durante o signUp
    (new.raw_user_meta_data->>'organization_id')::uuid,
    -- Se o frontend enviou um status (ex: o admin criando a org já entra como 'ativo'), usamos. Senão, 'pendente'
    COALESCE((new.raw_user_meta_data->>'status')::public.profile_status, 'pendente'::public.profile_status)
  );
  
  -- (Opcional) Se o frontend mandar a role_id no metadado (ex: Admin criando a org)
  IF new.raw_user_meta_data->>'role_id' IS NOT NULL THEN
    UPDATE public.profiles 
    SET role_id = (new.raw_user_meta_data->>'role_id')::uuid
    WHERE id = new.id;
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 7. Configuração Básica de Row Level Security (RLS)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 7.1. Qualquer um (anônimo ou logado) pode ler as organizações (necessário para checar se o ID "CALI" existe no input)
CREATE POLICY "Allow public read of organizations"
ON public.organizations FOR SELECT
USING (true);

-- 7.2. Qualquer usuário logado pode criar uma organização
CREATE POLICY "Allow authenticated users to insert organizations"
ON public.organizations FOR INSERT
TO authenticated
WITH CHECK (true);

-- 7.3. Usuários podem ver perfis da sua própria organização
CREATE POLICY "Users can view profiles in their organization"
ON public.profiles FOR SELECT
USING ( organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
));

-- 7.4. Usuários podem atualizar perfis da sua organização (na prática, apenas Admins farão isso via UI)
CREATE POLICY "Users can update profiles in their organization"
ON public.profiles FOR UPDATE
USING ( organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
));

-- 7.5. Usuários podem ver e criar cargos na sua própria organização
CREATE POLICY "Users can view roles in their organization"
ON public.roles FOR SELECT
USING ( organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can create roles in their organization"
ON public.roles FOR INSERT
TO authenticated
WITH CHECK (true);
