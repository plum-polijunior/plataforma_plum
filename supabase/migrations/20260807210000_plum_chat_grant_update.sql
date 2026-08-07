-- =========================================================================
-- plum_chat: falta policy e GRANT de UPDATE
-- =========================================================================
-- Data: 2026-08-07
--
-- `create_plum_chat_table.sql` só previu SELECT e INSERT. `PlumChat.tsx`
-- grava o "assunto" da conversa com um UPDATE em segundo plano depois que o
-- Agente Z classifica a pergunta — sem policy nem GRANT para UPDATE, isso
-- falha com 42501 "permission denied for table plum_chat" para qualquer
-- usuário, Admin incluso: é a tabela que nunca foi liberada para esse
-- comando, não uma questão de cargo.
--
-- Idempotente (DROP POLICY IF EXISTS antes de CREATE POLICY; GRANT é sempre
-- seguro de repetir). Não destrutivo.
-- =========================================================================

DROP POLICY IF EXISTS "Usuários podem atualizar próprias mensagens" ON public.plum_chat;
CREATE POLICY "Usuários podem atualizar próprias mensagens"
    ON public.plum_chat
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

GRANT UPDATE ON TABLE public.plum_chat TO authenticated;


-- -------------------------------------------------------------------------
-- Verificação
-- -------------------------------------------------------------------------
SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END AS situacao
FROM (VALUES
  ('authenticated tem UPDATE em plum_chat',
   has_table_privilege('authenticated', 'public.plum_chat', 'UPDATE')),
  ('Policy de UPDATE existe em plum_chat',
   EXISTS (SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'plum_chat'
              AND cmd = 'UPDATE'))
) AS t(item, ok)
ORDER BY ok, item;
