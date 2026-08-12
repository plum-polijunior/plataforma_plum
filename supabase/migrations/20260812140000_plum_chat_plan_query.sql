-- =========================================================================
-- plum_chat: guardar o Query Plan e a base de cada pergunta
-- =========================================================================
-- Data: 2026-08-12
--
-- Pré-requisito: create_plum_chat_table.sql já aplicada.
--
-- POR QUE
--
-- Duas coisas, que são a mesma decisão vista de dois ângulos.
--
-- 1. O QUE SAI DE USO: a coluna `assunto`.
--    O Agente Z tentava classificar o assunto de cada pergunta a partir de
--    uma lista aberta de exemplos no prompt ("Faturamento / Receita", "RH",
--    "Vendas"…). Sendo lista aberta e `STRING` livre no `response_schema`,
--    nada restringia o valor — a mesma pergunta saía como "Vendas" numa
--    execução e "Venda" ou "Estudos Técnicos" na seguinte. Previsão de
--    assunto não escala em multi-tenant sem jogar essa complexidade para o
--    usuário, e o `TODOS.md` #7 já registrava que o campo "nunca foi
--    consultado" por nada.
--
-- 2. O QUE ENTRA: `plan_query` e `dataset_id`.
--    Hoje o Query Plan que o Agente A gera é usado uma vez e descartado — é
--    variável local em `PlumChat.tsx`. Guardá-lo permite reusar o plano
--    quando a MESMA pergunta se repete, pulando o Agente A.
--
-- ⚠️ SÃO DUAS COLUNAS, NÃO UMA. `dataset_id` é tão necessário quanto o
-- plano: a mesma frase perguntada contra outra base é outra pergunta, com
-- outro plano. Sem essa coluna, o lookup casaria perguntas de bases
-- diferentes e serviria o plano errado — que falharia no RBAC, no melhor
-- caso, ou devolveria o número de outra planilha, no pior.
--
-- ⚠️ ISTO NÃO É CACHE DE RESULTADO. O que se guarda é o PLANO. Ele continua
-- entrando por `execute_plan`, que resolve `allowed_columns` do cargo de quem
-- pergunta AGORA e roda `authorizePlan` de novo — mesmo modelo que os
-- `dashboard_cards` operam desde a Fase 4. Cachear o número pulado o RBAC por
-- definição, e exigiria `permissions_fingerprint` na chave, como
-- `dashboard_card_snapshots` faz.
--
-- ── POR QUE `assunto` NÃO É DROPADA ──────────────────────────────────────
--
-- O `CLAUDE.md` §4.9 exige migrations **não destrutivas**, e há precedente
-- direto: `organizations.dashboard_k_min` continua no banco como vestigial
-- desde a remoção do k-anonimato (2026-08-08). A coluna fica, deixa de ser
-- escrita e lida, e o comentário abaixo registra isso para quem for ler o
-- schema depois. Dropar é uma linha, se um dia houver decisão para isso —
-- mas é irreversível, e os valores antigos são o único registro de que essa
-- tentativa existiu.
--
-- A policy de UPDATE e o `GRANT UPDATE` de `plum_chat` (migration
-- 20260807210000) foram criados só para gravar o `assunto` em background.
-- Continuam necessários: `plan_query` também é gravado num segundo momento,
-- depois que o Agente A responde.
-- =========================================================================

ALTER TABLE public.plum_chat
  ADD COLUMN IF NOT EXISTS plan_query jsonb,
  ADD COLUMN IF NOT EXISTS dataset_id uuid REFERENCES public.datasets(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.plum_chat.plan_query IS
  'Query Plan que o Agente A gerou para esta pergunta. Guardado para reuso quando a mesma pergunta se repete (ver src/lib/plano-cache.ts). NULL em mensagens do assistente e em perguntas bloqueadas pelo Agente Z.';

COMMENT ON COLUMN public.plum_chat.dataset_id IS
  'Base contra a qual a pergunta foi feita. Faz parte da chave de reuso do plano: a mesma frase contra outra base e outra pergunta.';

COMMENT ON COLUMN public.plum_chat.assunto IS
  'VESTIGIAL desde 2026-08-12: nao e mais escrita nem lida. O Agente Z classificava o assunto a partir de uma lista aberta, e o resultado era inconsistente para a mesma pergunta. Mantida por nao ser destrutiva (CLAUDE.md 4.9); os valores antigos sao o unico registro da tentativa.';

-- Índice do lookup de reuso: "minhas perguntas, nesta base, que têm plano".
--
-- ⚠️ `content` fica FORA do índice de propósito. Ele é TEXT sem limite, e o
-- índice btree do Postgres recusa entrada acima de ~2704 bytes — uma pergunta
-- longa faria o INSERT falhar, quebrando o chat inteiro por causa de um
-- índice de otimização. O histórico de um usuário numa base tem dezenas de
-- linhas; filtrar `content` em memória depois do índice é barato.
CREATE INDEX IF NOT EXISTS plum_chat_reuso_plano_idx
  ON public.plum_chat (user_id, dataset_id)
  WHERE plan_query IS NOT NULL;


-- =========================================================================
-- VERIFICAÇÃO
-- =========================================================================

SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END AS situacao
FROM (VALUES
  ('Coluna plan_query existe e e jsonb',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'plum_chat'
              AND column_name = 'plan_query' AND data_type = 'jsonb')),

  ('Coluna dataset_id existe e e uuid',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'plum_chat'
              AND column_name = 'dataset_id' AND data_type = 'uuid')),

  ('dataset_id tem FK para datasets com ON DELETE SET NULL',
   EXISTS (SELECT 1
             FROM pg_constraint c
             JOIN pg_class t ON t.oid = c.conrelid
            WHERE t.relname = 'plum_chat' AND c.contype = 'f'
              AND c.confdeltype = 'n'
              AND pg_get_constraintdef(c.oid) LIKE '%dataset_id%datasets%')),

  ('Indice de reuso existe',
   EXISTS (SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = 'plum_chat'
              AND indexname = 'plum_chat_reuso_plano_idx')),

  -- A coluna velha CONTINUA existindo: a migration é não destrutiva.
  ('Coluna assunto preservada (vestigial, nao dropada)',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'plum_chat'
              AND column_name = 'assunto')),

  -- A policy de UPDATE segue necessária: `plan_query` é gravado num segundo
  -- momento, depois que o Agente A responde.
  ('Policy de UPDATE de plum_chat preservada',
   EXISTS (SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'plum_chat'
              AND cmd = 'UPDATE'))
) AS t(item, ok)
ORDER BY t.ok, t.item;
