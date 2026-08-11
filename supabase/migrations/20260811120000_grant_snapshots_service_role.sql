-- =========================================================================
-- dashboard_card_snapshots: devolver o GRANT de escrita ao service_role
-- =========================================================================
-- Projeto: PLUM 2.0 · branch `plataforma`
-- Data: 2026-08-11
--
-- O SINTOMA, medido em produção durante a bateria de verificação da Fase 4:
-- toda execução de card logava, na Edge Function `dashboard-execute`:
--
--     Falha ao gravar snapshot: permission denied for table dashboard_card_snapshots
--
-- E, por decisão deliberada de `dashboard-execute`, essa falha **não** derruba
-- a resposta — o número já calculado continua chegando na tela. Por isso o
-- defeito ficou invisível: o dashboard funcionava, só que sem cache nenhum.
--
-- POR QUE ISSO IMPORTA MAIS DO QUE PARECE, e não é só performance:
--
--   1. Sem snapshot, TODA abertura de dashboard vai ao Google Sheets. É
--      exatamente o que a invariante de "um batchGet por dataset" e o TTL de
--      `refresh_interval_minutes` existem para evitar — a cota de 60 req/min
--      da API do Sheets é o teto real aqui.
--
--   2. Sem snapshot, o estado DEGRADADO nunca acontece. `dashboard-execute`
--      cai para o último snapshot quando o executor falha; sem linha gravada
--      não há para onde cair, e o card mostra erro em vez do número antigo com
--      selo de idade.
--
--   3. **A série histórica nunca começa.** O comentário da migration
--      20260806230000 diz, em voz alta, que o acúmulo destes snapshots É a
--      série temporal do futuro motor de insights (delta, tendência, alerta de
--      variação). Enquanto o INSERT falha, esse histórico não existe — e
--      histórico não se recupera depois: o dado de ontem não volta.
--
-- A CAUSA: a migration 20260806230000 fez `REVOKE ALL ... FROM anon` e
-- `GRANT SELECT ... TO authenticated`, e não mencionou `service_role`. Numa
-- tabela criada depois que os privilégios padrão do projeto já estavam
-- aplicados, isso deixa o `service_role` sem privilégio de tabela — e RLS não
-- tem nada a ver com o caso: `service_role` ignora RLS, mas GRANT de tabela
-- ele não ignora. São duas camadas diferentes, e só a segunda faltava.
--
-- O DESENHO ORIGINAL CONTINUA VALENDO, e esta migration não o afrouxa:
-- ninguém além do servidor escreve aqui. `authenticated` continua com SELECT e
-- nada mais; `anon` continua sem nada. Se o navegador pudesse inserir snapshot,
-- fabricaria um resultado com qualquer digital de permissão e contornaria o
-- RBAC inteiro.
--
-- Idempotente. Não destrutiva.
-- =========================================================================

GRANT SELECT, INSERT ON public.dashboard_card_snapshots TO service_role;

-- `dashboard_cards` não apresentou o sintoma, mas está no mesmo caminho e foi
-- criada pela mesma migration. Conceder aqui evita descobrir o gêmeo do bug
-- daqui a três semanas, com outro sintoma.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_cards TO service_role;

-- Reafirma o que já era para valer. Idempotente: repetir GRANT não acumula.
GRANT SELECT ON public.dashboard_card_snapshots TO authenticated;
REVOKE ALL ON public.dashboard_card_snapshots FROM anon;


-- -------------------------------------------------------------------------
-- Verificação
-- -------------------------------------------------------------------------
SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END AS situacao
FROM (VALUES
  ('service_role pode INSERT em dashboard_card_snapshots',
   has_table_privilege('service_role', 'public.dashboard_card_snapshots', 'INSERT')),
  ('service_role pode SELECT em dashboard_card_snapshots',
   has_table_privilege('service_role', 'public.dashboard_card_snapshots', 'SELECT')),
  ('authenticated pode SELECT em dashboard_card_snapshots',
   has_table_privilege('authenticated', 'public.dashboard_card_snapshots', 'SELECT')),
  ('authenticated NAO pode INSERT em dashboard_card_snapshots',
   NOT has_table_privilege('authenticated', 'public.dashboard_card_snapshots', 'INSERT')),
  ('anon NAO pode SELECT em dashboard_card_snapshots',
   NOT has_table_privilege('anon', 'public.dashboard_card_snapshots', 'SELECT'))
) AS t(item, ok);
