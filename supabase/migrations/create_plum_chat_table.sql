-- Criação da tabela de conversas PLUM CHAT
CREATE TABLE IF NOT EXISTS public.plum_chat (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    assunto VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Adicionar índices para acelerar a renderização do histórico
CREATE INDEX IF NOT EXISTS plum_chat_org_user_idx ON public.plum_chat(organization_id, user_id);
CREATE INDEX IF NOT EXISTS plum_chat_created_at_idx ON public.plum_chat(created_at);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.plum_chat ENABLE ROW LEVEL SECURITY;

-- Política de RLS: O usuário só pode ver as próprias mensagens
CREATE POLICY "Usuários podem ler o próprio histórico"
    ON public.plum_chat
    FOR SELECT
    USING (auth.uid() = user_id);

-- Política de RLS: O usuário só pode inserir mensagens como si mesmo
CREATE POLICY "Usuários podem inserir próprias mensagens"
    ON public.plum_chat
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
