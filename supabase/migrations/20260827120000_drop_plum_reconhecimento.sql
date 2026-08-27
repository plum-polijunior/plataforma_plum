-- =========================================================================
-- DROP plum_reconhecimento — o cache do A2 Reconhecedor, que não volta
-- =========================================================================
-- Data: 2026-08-27 · Etapa 3 do remake · contexto/30-decisoes.md D-054
--
-- ⛔⛔ ESTA MIGRATION É DESTRUTIVA, E É EXCEÇÃO DECLARADA À D-005
--
-- O §3 do `CLAUDE.md` desta pasta manda **aposentar, não dropar**, e o repo
-- honrou isso duas vezes: `organizations.dashboard_k_min` e `plum_chat.assunto`
-- ficaram vestigiais em vez de cair.
--
-- ⭐ A diferença que justifica a exceção: aquelas duas guardam uma **IDEIA que
-- continua boa** — a `assunto` é o registro de que sugerir perguntas frequentes
-- vale a pena (D-026), e a `dashboard_k_min` é o registro histórico do
-- k-anonimato (D-012). Esta tabela guarda um **MECANISMO SUBSTITUÍDO**, e o
-- mecanismo novo não pode reusá-la. Não é a mesma classe.
--
-- ⚠️ A regra da D-005 continua valendo para COLUNA. O que muda aqui é o caso de
-- tabela inteira cujo consumidor foi apagado no mesmo commit.
--
-- POR QUE O CONSUMIDOR FOI APAGADO
--
-- ⭐⭐ A resposta está no cabeçalho da migration que criou esta tabela, e ela
-- envelheceu de um jeito que vale ler:
--
--   "O V7 se contradiz sobre o A2, e a contradição decide esta tabela. A §1
--    lista a entrada dele como 'pergunta + metadados', mas a nota logo abaixo
--    diz que 'A2 depende só de (dataset, versão do dicionário) e vale para
--    qualquer pergunta'. As duas coisas não podem ser verdade. […] Resolvido em
--    favor da nota: o A2 NÃO recebe a pergunta."
--
-- ⚠️ Em 2026-08-27 o 👤 definiu o escopo do A2 que volta, e ele **reabre a §1**:
-- o `a2_encaminhador` escolhe **quais bases** entram no prompt do A3 **e qual
-- A3** planeja — e as duas escolhas dependem da PERGUNTA.
--
-- ⇒ A premissa que tornava esta tabela cacheável caiu. Um A2 que vê a pergunta
-- cacheado por `(dataset, digital)` devolveria a escolha de UMA pergunta para
-- OUTRA pergunta, em silêncio — a classe de bug mais caro deste produto.
--
-- ⭐ E não sobra o que cachear: o índice de bases que o `a2_encaminhador` precisa
-- para escolher (nome, grão, uma linha, os nomes das colunas) sai de um `select`
-- no `schema_metadata`. Deixou de ser chamada de LLM.
--
-- ⛔ O QUE **NÃO** SE APAGA, E PARECE APAGÁVEL
--
--   1. O valor 'reconhecedor' no CHECK de `plum_logs.etapa` FICA. O A2 rodou de
--      2026-08-20 (B06) a 2026-08-25 (B15) e há linhas com aquele valor —
--      tirá-lo do CHECK as coloca em violação. O tipo em `log_core.ts` fica pelo
--      mesmo motivo: ele descreve o que EXISTE no banco, não quem pode ser
--      chamado.
--   2. A action `ad_hoc_reconhecer` FICA. É o nome do PRIMEIRO TURNO do chat e
--      está viva: o B15 manteve o nome e trocou o conteúdo (A1 → dicionário →
--      vocabulário, um LLM só). Apagá-la junto derruba o chat.
--
-- ⚠️ Depois de aplicar: atualize `src/integrations/supabase/types.ts` (§4 do
-- `CLAUDE.md` desta pasta). ⛔ Mas NÃO mexa no enum de `plum_logs.etapa` lá — ele
-- é gerado do CHECK, que não muda.
--
-- =========================================================================

-- Idempotente: `IF EXISTS` em tudo, como manda o §3.
-- As policies caem com a tabela; o DROP explícito existe para o caso de alguém
-- ter recriado a tabela à mão sem elas.
DROP POLICY IF EXISTS plum_reconhecimento_select ON public.plum_reconhecimento;
DROP POLICY IF EXISTS plum_reconhecimento_insert ON public.plum_reconhecimento;
DROP POLICY IF EXISTS plum_reconhecimento_update ON public.plum_reconhecimento;

DROP TABLE IF EXISTS public.plum_reconhecimento;

-- =========================================================================
-- Verificação
-- =========================================================================
-- ⚠️ As três últimas linhas são o ponto: elas provam que a limpeza NÃO passou do
-- alvo. Um 'FALTANDO' ali significa que o log perdeu a capacidade de descrever o
-- que já aconteceu.

SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END AS resultado
FROM (VALUES
  ('plum_reconhecimento nao existe mais',
   NOT EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'plum_reconhecimento')),

  ('nenhum grant orfao sobrou',
   NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                WHERE table_schema = 'public' AND table_name = 'plum_reconhecimento')),

  ('plum_logs.etapa AINDA aceita ''reconhecedor'' (linhas historicas)',
   EXISTS (SELECT 1 FROM pg_constraint
            WHERE conname LIKE '%etapa%'
              AND conrelid = 'public.plum_logs'::regclass
              AND pg_get_constraintdef(oid) LIKE '%reconhecedor%')),

  ('plum_logs continua de pe',
   EXISTS (SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'plum_logs')),

  ('schema_metadata continua de pe (e a fonte do indice de bases)',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'datasets'
              AND column_name = 'schema_metadata'))
) AS t(item, ok)
ORDER BY t.ok, t.item;
