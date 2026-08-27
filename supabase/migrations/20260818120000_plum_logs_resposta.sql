-- =========================================================================
-- plum_logs.resposta_agente — o que cada agente devolveu
-- =========================================================================
-- Data: 2026-08-18
-- Pré-requisito: 20260818110000_plum_logs.sql (já aplicada)
--
-- POR QUE UMA MIGRATION SEPARADA
--
-- A 20260818110000 já foi aplicada em produção. Editar migration aplicada não
-- é opção — o histórico é a ordem em que o banco chegou onde está.
--
-- POR QUE A COLUNA
--
-- O log registrava a FORMA da resposta (status, latência, tokens) e não o
-- conteúdo. Isso responde "quanto custou" e "falhou?", mas não responde
-- **"por que a resposta ficou ruim?"** — que é a pergunta que a Etapa 1 vai
-- fazer toda semana, e a única que importa para sintonizar prompt.
--
-- ⚠️ O QUE MUDOU NO RACIOCÍNIO SOBRE A D-022
--
-- A migration anterior invocava a D-022 ("a pergunta crua nunca vai para o
-- log") para justificar guardar só a forma. **Isso foi aplicar a D-022 por
-- analogia onde ela não vale.**
--
-- A D-022 é sobre `dashboard_cards.origin_question`, e o racional dela é
-- explícito: *"já foi decidido não guardar isso no banco; reintroduzir pelo log
-- seria contornar a própria decisão"*. No fluxo de card, a pergunta realmente
-- não é persistida em lugar nenhum.
--
-- No CHAT é o contrário: `plum_chat.content` guarda a pergunta **por design** —
-- é o histórico que o usuário lê na tela. Não há decisão a contornar.
--
-- ⭐ **Consequência:** guardar a pergunta aqui seria REDUNDANTE (já está no
-- `plum_chat`, e o `turno_id` não faz a ponte com ele — mas o `user_id` +
-- `created_at` fazem). Guardar a SAÍDA dos agentes não é redundante, porque
-- hoje ela se perde:
--
--   • o veredito do Agente Z (e a mensagem dele) não é gravado em lugar nenhum
--   • o Query Plan só vai para `plum_chat.plan_query` quando é cacheável —
--     ⭐ plano com data é descartado (D-024), e é justamente o mais provável
--     de estar errado
--   • quando o fluxo FALHA, o `plum_chat` fica com a pergunta e sem resposta;
--     o que o agente produziu antes de quebrar não existe em lugar nenhum
--
-- ⚠️ O RESULTADO DO EXECUTOR FICA DE FORA, DE PROPÓSITO
--
-- O `execute_plan` não é agente — é o Python, e a saída dele é **dado de
-- negócio agregado do cliente**. Guardá-lo aqui criaria uma segunda cópia dos
-- números do cliente, numa tabela com outra retenção e outra policy, para
-- responder uma pergunta ("o número saiu certo?") que a linha do
-- `synthesize_answer` já ajuda a responder.
--
-- Se em algum momento fizer falta, a saída barata é gravar a FORMA do resultado
-- (nº de linhas, nomes de coluna) em vez dos valores. Não fiz agora porque não
-- há demanda — e coluna criada "por via das dúvidas" é o que produz vestigial.
-- =========================================================================

ALTER TABLE public.plum_logs
  ADD COLUMN IF NOT EXISTS resposta_agente JSONB;

COMMENT ON COLUMN public.plum_logs.resposta_agente IS
  'Saida do agente naquela etapa: veredito do Z, Query Plan do A, texto do C. NAO recebe resultado do executor (dado de negocio) nem a pergunta (ja esta em plum_chat.content). Ver 20260818120000_plum_logs_resposta.sql.';


-- =========================================================================
-- VERIFICAÇÃO
-- =========================================================================

SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END AS situacao
FROM (VALUES
  ('Coluna plum_logs.resposta_agente existe',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'plum_logs'
              AND column_name = 'resposta_agente')),

  ('E jsonb e aceita NULL (etapa sem saida estruturada)',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'plum_logs'
              AND column_name = 'resposta_agente'
              AND data_type = 'jsonb' AND is_nullable = 'YES')),

  ('Tabela continua append-only',
   NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'plum_logs'
                AND cmd IN ('UPDATE', 'DELETE')))
) AS t(item, ok)
ORDER BY t.ok, t.item;