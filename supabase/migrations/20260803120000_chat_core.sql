-- =========================================================================
-- CHAT CORE — store de conversas multicanal (web hoje, WhatsApp depois)
-- =========================================================================
-- Projeto: PLUM 2.0 · Fase 0 do plano docs/PLANO-CHAT-PLATAFORMA.md
-- Data: 2026-08-03
--
-- Pré-requisito: 20260722120000_sso_dominio_control_plane.sql aplicada
-- (fornece os helpers SECURITY DEFINER public.current_org_id() e
--  public.is_active_member(), reusados aqui).
--
-- O QUE ESTA MIGRATION CRIA:
--   1. assistants     — persona/bot por organização (doceria vs. tech; N bots).
--   2. conversations  — o "chat pessoal" (dono = profile_id), com assistant_id.
--   3. messages       — fonte da verdade, com canal (web|whatsapp|email) e direcao.
--   4. RLS dono-only dentro da org ativa. Escrita só via service_role (edge fn);
--      o cliente autenticado apenas LÊ (single-writer = chat-core).
--   5. messages publicada no Realtime (front recebe mensagens ao vivo).
--
-- INVARIANTES DE SEGURANÇA:
--   - Uma conversa/mensagem só é legível pelo próprio dono (profile_id = auth.uid())
--     e dentro da sua organização ativa.
--   - O recorte cargo->coluna (RBAC de coluna, R-03) NÃO é feito aqui: é aplicado
--     na edge function chat-core, que monta o contexto do cérebro apenas com as
--     colunas de role_permissions.allowed_columns. Esta migration garante o
--     isolamento entre empresas e a propriedade da conversa.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Enums de canal e direção (idempotentes)
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_canal') THEN
    CREATE TYPE public.chat_canal AS ENUM ('web', 'whatsapp', 'email');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_direcao') THEN
    CREATE TYPE public.chat_direcao AS ENUM ('in', 'out');
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- 2. Trigger utilitário para updated_at
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

-- -------------------------------------------------------------------------
-- 3. assistants — persona/bot por organização
-- -------------------------------------------------------------------------
-- Um mesmo motor serve "chatbots" diferentes: o que muda é a configuração
-- (persona + system_prompt) e, principalmente, os datasets/dicionário da org.
CREATE TABLE IF NOT EXISTS public.assistants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    persona         TEXT,
    system_prompt   TEXT,
    is_default      BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.assistants IS
  'Persona/configuração de um chatbot por organização. Os dados/dicionário vêm de datasets; aqui fica só o tom/instrução do bot.';

CREATE INDEX IF NOT EXISTS assistants_org_idx ON public.assistants (organization_id);

-- -------------------------------------------------------------------------
-- 4. conversations — chat pessoal de cada usuário
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    profile_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assistant_id    UUID REFERENCES public.assistants(id) ON DELETE SET NULL,
    title           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.conversations IS
  'Thread de conversa pertencente a um único profile dentro de uma organização.';

CREATE INDEX IF NOT EXISTS conversations_owner_idx
  ON public.conversations (profile_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON public.conversations;
CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- -------------------------------------------------------------------------
-- 5. messages — fonte da verdade, multicanal desde o dia 1
-- -------------------------------------------------------------------------
-- profile_id é o DONO da conversa (tanto para 'in' quanto para 'out'), o que
-- permite a política de leitura simples profile_id = auth.uid().
CREATE TABLE IF NOT EXISTS public.messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    profile_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    canal           public.chat_canal   NOT NULL DEFAULT 'web',
    direcao         public.chat_direcao NOT NULL,
    content         TEXT NOT NULL,
    meta            JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.messages IS
  'Mensagens de todas as conversas e canais. meta guarda plano DSL/colunas usadas/debug.';
COMMENT ON COLUMN public.messages.canal IS
  'Canal de origem/destino. web hoje; whatsapp/email plugam depois sem mudar schema.';

CREATE INDEX IF NOT EXISTS messages_conversation_idx
  ON public.messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS messages_owner_idx
  ON public.messages (profile_id, created_at DESC);

-- -------------------------------------------------------------------------
-- 6. RLS
-- -------------------------------------------------------------------------
ALTER TABLE public.assistants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages      ENABLE ROW LEVEL SECURITY;

-- 6.1. assistants: membros ativos leem os bots da sua org; só admin gerencia.
DROP POLICY IF EXISTS "assistants_select_org" ON public.assistants;
CREATE POLICY "assistants_select_org"
  ON public.assistants FOR SELECT
  USING (organization_id = public.current_org_id() AND public.is_active_member());

DROP POLICY IF EXISTS "assistants_admin_write" ON public.assistants;
CREATE POLICY "assistants_admin_write"
  ON public.assistants FOR ALL
  USING (organization_id = public.current_org_id() AND public.is_org_admin())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());

-- 6.2. conversations: o cliente só LÊ as próprias. Criação/edição via service_role
--      (edge function chat-core). Sem policy de INSERT/UPDATE/DELETE para
--      authenticated => RLS nega; service_role ignora RLS.
DROP POLICY IF EXISTS "conversations_select_own" ON public.conversations;
CREATE POLICY "conversations_select_own"
  ON public.conversations FOR SELECT
  USING (
    profile_id = auth.uid()
    AND organization_id = public.current_org_id()
    AND public.is_active_member()
  );

-- 6.3. messages: o cliente só LÊ as próprias (in e out). Escrita via service_role.
DROP POLICY IF EXISTS "messages_select_own" ON public.messages;
CREATE POLICY "messages_select_own"
  ON public.messages FOR SELECT
  USING (
    profile_id = auth.uid()
    AND organization_id = public.current_org_id()
    AND public.is_active_member()
  );

-- -------------------------------------------------------------------------
-- 7. Grants (RLS continua valendo para anon/authenticated; service_role ignora)
-- -------------------------------------------------------------------------
-- assistants: admin gerencia pelo client (a RLS assistants_admin_write restringe
-- a escrita a admin da própria org); membros ativos apenas leem.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assistants TO authenticated;
-- conversations/messages: cliente só LÊ (single-writer = edge function chat-core).
GRANT SELECT ON TABLE public.conversations TO authenticated;
GRANT SELECT ON TABLE public.messages      TO authenticated;
GRANT ALL    ON TABLE public.assistants    TO service_role;
GRANT ALL    ON TABLE public.conversations TO service_role;
GRANT ALL    ON TABLE public.messages      TO service_role;

-- -------------------------------------------------------------------------
-- 8. Realtime — o front assina INSERTs de messages para atualização ao vivo
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;
  END IF;
END $$;

-- Fim da migration chat_core (Fase 0).
