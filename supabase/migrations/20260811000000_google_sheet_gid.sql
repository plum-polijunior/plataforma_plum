-- ============================================================================
-- datasets.google_sheet_gid — a identidade ESTÁVEL da aba
--
-- O problema que isto resolve, medido em produção em 2026-08-10: as duas bases
-- existentes tinham `google_sheet_tab = 'Sheet1'` (o DEFAULT da coluna) e as
-- duas apontavam, na URL, para uma aba com `gid` diferente de zero. Ou seja:
-- nenhuma das duas estava na primeira aba, e o executor pedia ao Google um
-- range `'Sheet1'!...` que não existe. O Google responde 400, e o chat
-- devolvia "Nao consegui ler a planilha agora."
--
-- A causa era o caminho de escrita: `src/lib/google-sheets.ts` extraía o ID da
-- planilha e DESCARTAVA o `gid`, e nenhum código do front jamais escrevia
-- `google_sheet_tab`. O campo nunca saía do default.
--
-- Por que `gid` e não o nome da aba: o nome é apelido mutável. Guardar
-- 'tabela-de-estudos' conserta hoje e quebra no dia em que alguém renomear a
-- aba para 'Dados 2026' — e quebra do mesmo jeito silencioso. O `gid` é
-- atribuído pelo Google na criação da aba e NÃO muda com rename. É a única
-- referência estável que a URL nos dá.
--
-- `google_sheet_tab` continua existindo e continua sendo usada quando o `gid`
-- é nulo (linhas antigas que o backfill não alcançou, ou alguém que colou um
-- ID puro sem URL). O executor dá precedência ao `gid` quando os dois existem.
--
-- Idempotente e não destrutiva. Nenhuma linha perde dado: o backfill só
-- PREENCHE onde está nulo, e nunca sobrescreve um valor já gravado.
-- ============================================================================

ALTER TABLE public.datasets
  ADD COLUMN IF NOT EXISTS google_sheet_gid integer;

COMMENT ON COLUMN public.datasets.google_sheet_gid IS
  'Identificador numerico da aba dentro da planilha (o gid da URL). Estavel a '
  'rename, diferente de google_sheet_tab que guarda o nome. NULL = usar '
  'google_sheet_tab. Ver 20260811000000_google_sheet_gid.sql.';

-- ── Backfill a partir da URL já gravada ─────────────────────────────────────
-- Aceita as duas formas que o Google entrega: `?gid=123` (query) e `#gid=123`
-- (fragmento). A URL real costuma ter as duas, e o regex pega a primeira
-- ocorrência — que é a mesma aba nos dois lugares.
--
-- `WHERE google_sheet_gid IS NULL` faz a migration poder rodar de novo sem
-- desfazer correção manual feita depois dela.
UPDATE public.datasets
   SET google_sheet_gid = (substring(google_sheet_url FROM '[?#&]gid=([0-9]+)'))::integer
 WHERE google_sheet_gid IS NULL
   AND google_sheet_url IS NOT NULL
   AND google_sheet_url ~ '[?#&]gid=[0-9]+';

-- ── Verificação ─────────────────────────────────────────────────────────────
-- Padrão do projeto: a migration se autoverifica, em vez de exigir que alguém
-- lembre de conferir depois. Ver CLAUDE.md §4.9.
--
-- Atenção ao ler `gid_backfilled`: `gid = 0` é uma aba VÁLIDA (a primeira da
-- planilha), então a contagem usa `IS NOT NULL`, nunca `> 0`. Um `> 0` aqui
-- reportaria FALTANDO justamente para quem está na primeira aba, que é o caso
-- mais comum.
SELECT item,
       CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END AS resultado,
       detalhe
  FROM (
    SELECT 'coluna google_sheet_gid existe' AS item,
           EXISTS (
             SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name   = 'datasets'
                AND column_name  = 'google_sheet_gid'
           ) AS ok,
           '' AS detalhe

    UNION ALL

    SELECT 'toda base com gid na URL foi preenchida' AS item,
           NOT EXISTS (
             SELECT 1 FROM public.datasets
              WHERE google_sheet_gid IS NULL
                AND google_sheet_url ~ '[?#&]gid=[0-9]+'
           ) AS ok,
           (SELECT coalesce(string_agg(name, ', '), '-')
              FROM public.datasets
             WHERE google_sheet_gid IS NULL
               AND google_sheet_url ~ '[?#&]gid=[0-9]+') AS detalhe

    UNION ALL

    -- Não é falha: só mostra quem vai continuar dependendo de
    -- `google_sheet_tab` porque não há gid na URL (ID colado sozinho, por
    -- exemplo). Essas bases seguem funcionando pelo nome da aba.
    SELECT 'bases sem gid (seguem pelo nome da aba)' AS item,
           true AS ok,
           (SELECT coalesce(string_agg(name || ' [' || coalesce(google_sheet_tab, '?') || ']', ', '), '-')
              FROM public.datasets
             WHERE google_sheet_gid IS NULL) AS detalhe
  ) t;
