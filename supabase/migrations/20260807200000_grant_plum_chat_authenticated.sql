-- =========================================================================
-- GRANT: authenticated não tinha privilégio de tabela em plum_chat
-- =========================================================================
-- Data: 2026-08-07
--
-- `create_plum_chat_table.sql` criou a RLS e as duas policies (SELECT e
-- INSERT), mas nunca concedeu o GRANT de tabela ao role `authenticated`.
-- Sem o GRANT, o Postgres nega o acesso ANTES de avaliar qualquer policy de
-- RLS — erro 42501 "permission denied for table plum_chat", visto em
-- produção mesmo com a policy `auth.uid() = user_id` correta.
--
-- Só `authenticated` recebe privilégio: plum_chat é o histórico de chat de
-- cada usuário (CLAUDE.md: "Chat é 100% privado por usuário"), não há caso
-- de uso para `anon` aqui. UPDATE/DELETE ficam de fora porque não existe
-- policy para eles — conceder o privilégio sem a policy correspondente não
-- abriria acesso (RLS ainda bloquearia), só seria uma concessão sem efeito.
--
-- Idempotente: GRANT é sempre seguro de repetir. Não destrutivo.
-- =========================================================================

GRANT SELECT, INSERT ON TABLE public.plum_chat TO authenticated;


-- -------------------------------------------------------------------------
-- Verificação
-- -------------------------------------------------------------------------
SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END AS situacao
FROM (VALUES
  ('authenticated tem SELECT em plum_chat',
   has_table_privilege('authenticated', 'public.plum_chat', 'SELECT')),
  ('authenticated tem INSERT em plum_chat',
   has_table_privilege('authenticated', 'public.plum_chat', 'INSERT'))
) AS t(item, ok)
ORDER BY ok, item;
