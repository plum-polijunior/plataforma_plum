-- =========================================================================
-- plum_logs.etapa aceita 'encaminhador' — o slot 2 volta com nome próprio
-- =========================================================================
-- Data: 2026-08-27 · Bloco B20 da Etapa 3 · contexto/30-decisoes.md D-054
--
-- O `a2_encaminhador` grava uma linha por pergunta: qual agente escolheu, quais
-- bases, e o motivo. O CHECK de `etapa` é um enum fechado, então o valor novo
-- precisa entrar antes de o código publicar — é par indivisível.
--
-- ⭐⭐ ACRESCENTA. NÃO RENOMEIA. E a diferença não é estilo.
--
-- 'reconhecedor' FICA no enum. O A2 antigo rodou de 2026-08-20 (B06) a
-- 2026-08-25 (B15) e existem linhas com aquele valor: tirá-lo do CHECK as
-- coloca em violação, e um `ALTER ... ADD CONSTRAINT` sobre dado que não passa
-- **falha na hora**, deixando a tabela sem constraint nenhuma se alguém dropar
-- a antiga primeiro.
--
-- ⚠️ O tipo `Papel` do `_shared/llm_core.ts` NÃO tem mais 'reconhecedor', e isso
-- é coerente, não divergência: aquele tipo diz **quem pode ser chamado**; este
-- enum diz **o que existe no banco**. São perguntas diferentes, e a segunda
-- inclui o passado.
--
-- ⚠️ Depois de aplicar: `src/integrations/supabase/types.ts` (§4 do CLAUDE.md
-- desta pasta) — o enum de `etapa` aparece lá e é gerado deste CHECK.
--
-- =========================================================================

-- Idempotente: dropa a constraint por nome antes de recriar. O Postgres não tem
-- `ADD CONSTRAINT IF NOT EXISTS`, e sem o DROP reexecutar morre em 42710.
--
-- ⚠️ Os dois passos ficam na MESMA transação de propósito. Entre o DROP e o ADD
-- a tabela aceita qualquer string em `etapa`; num painel, uma janela dessas pode
-- durar o tempo de alguém ler o erro do passo seguinte.
BEGIN;

ALTER TABLE public.plum_logs
  DROP CONSTRAINT IF EXISTS plum_logs_etapa_check;

ALTER TABLE public.plum_logs
  ADD CONSTRAINT plum_logs_etapa_check CHECK (etapa IN (
    -- caminho 'legado'
    'guard', 'plan_query', 'execute_plan', 'synthesize_answer',
    -- caminho 'ad_hoc'
    'porteiro',
    -- ⛔ Histórico: o A2 Reconhecedor, que rodou de 2026-08-20 a 2026-08-25.
    -- Não remova — há linhas com este valor. Ver D-049 e D-054.
    'reconhecedor',
    -- ⭐ O A2 de verdade, desde a Etapa 3.
    'encaminhador',
    'planejador', 'resolvedor', 'autorizador', 'executor', 'interprete'
  ));

COMMIT;

-- =========================================================================
-- Verificação
-- =========================================================================
-- ⚠️ A segunda linha é a que importa: ela prova que a migration NÃO ficou
-- destrutiva. Um 'FALTANDO' ali significa que as linhas de agosto viraram dado
-- em violação de constraint.

SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END AS resultado
FROM (VALUES
  ('etapa aceita ''encaminhador''',
   EXISTS (SELECT 1 FROM pg_constraint
            WHERE conname = 'plum_logs_etapa_check'
              AND conrelid = 'public.plum_logs'::regclass
              AND pg_get_constraintdef(oid) LIKE '%encaminhador%')),

  ('etapa AINDA aceita ''reconhecedor'' (linhas historicas)',
   EXISTS (SELECT 1 FROM pg_constraint
            WHERE conname = 'plum_logs_etapa_check'
              AND conrelid = 'public.plum_logs'::regclass
              AND pg_get_constraintdef(oid) LIKE '%reconhecedor%')),

  ('a constraint existe (nao ficou dropada)',
   EXISTS (SELECT 1 FROM pg_constraint
            WHERE conname = 'plum_logs_etapa_check'
              AND conrelid = 'public.plum_logs'::regclass)),

  ('nenhuma linha existente violaria o enum novo',
   NOT EXISTS (SELECT 1 FROM public.plum_logs WHERE etapa NOT IN (
     'guard', 'plan_query', 'execute_plan', 'synthesize_answer',
     'porteiro', 'reconhecedor', 'encaminhador',
     'planejador', 'resolvedor', 'autorizador', 'executor', 'interprete')))
) AS t(item, ok)
ORDER BY t.ok, t.item;
