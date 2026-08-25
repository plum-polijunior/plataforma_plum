-- ============================================================================
-- B16 · `ad_hoc` COMO PADRAO — organizations.remake_habilitado nasce true
-- ============================================================================
--
-- ⭐ O QUE MUDA: a chave criada na Etapa 0 (`20260818100000_remake_habilitado.sql`)
-- nasceu `false` porque nao havia caminho novo para ligar. Agora ha: o `ad_hoc`
-- responde de ponta a ponta, o dicionario v2 sai do cadastro (B14) e o A3 o le
-- em vez do reconhecimento do A2 (B15). Esta migration inverte o default e liga
-- as organizacoes existentes.
--
-- ⚠️ A CHAVE NAO DEIXA DE EXISTIR — ela troca de papel. Era conveniencia de
-- desenvolvimento; passa a ser ESCAPE HATCH de emergencia. Voltar para o
-- caminho legado e um UPDATE, sem deploy, com efeito imediato:
--
--     update public.organizations set remake_habilitado = false;
--
-- ⭐ E e justamente esse rollback de uma linha que torna defensavel a ordem
-- escolhida pelo 👤: virar o padrao ANTES da suite de avaliacao (B17). Apontar o
-- chat para um caminho que ninguem mediu e um risco real; o que o limita e o
-- custo de desfazer ser proximo de zero. Ver §B3 do PLANO-etapa-2.md.
--
-- ⚠️⚠️ ISTO NAO ALCANCA OS QUATRO CLIENTES PAGANTES. Eles usam a 🔧
-- implementacao, que e um deploy Supabase totalmente separado com o proprio
-- banco. Confundir a plataforma com a implementacao e "o erro mais comum e mais
-- caro" deste projeto — ver `contexto/02-plataforma-vs-implementacao.md`.
--
-- ⚠️ A PRE-CONDICAO REAL E O B11, NAO O B15. As bases da demo continuam em
-- `schema_metadata` v1 e nao serao recadastradas (recadastrar cria uuid novo e
-- orfa os cards — C13). Se o leitor unico (`_shared/dicionario.ts`) nao tolerasse
-- a v1, virar o padrao transformaria toda base esquecida em chat quebrado. Ele
-- tolera, com default por campo, e `versao: 1` faz o A3 declarar mais presuncao
-- em vez de errar calado.
--
-- ⛔ NAO EDITAR `20260818100000_remake_habilitado.sql`: migration aplicada e
-- imutavel. O default velho fica no historico, que e onde ele pertence.
--
-- ROLLBACK COMPLETO (default e dados):
--   ALTER TABLE public.organizations ALTER COLUMN remake_habilitado SET DEFAULT false;
--   UPDATE public.organizations SET remake_habilitado = false;
-- ============================================================================

ALTER TABLE public.organizations
  ALTER COLUMN remake_habilitado SET DEFAULT true;

-- Idempotente por construcao: `SET true WHERE NOT true` nao tem o que fazer na
-- segunda execucao. O `WHERE` existe para nao gerar escrita inutil nem tocar
-- `updated_at` de quem ja esta ligado.
UPDATE public.organizations
   SET remake_habilitado = true
 WHERE remake_habilitado IS DISTINCT FROM true;

COMMENT ON COLUMN public.organizations.remake_habilitado IS
  'Chave de EMERGENCIA: desligar volta para o caminho legado (Agente Z/A/C), sem deploy e com efeito imediato. Nasce true desde a Etapa 2 (B16). Era conveniencia de desenvolvimento com default false — ver 20260818100000_remake_habilitado.sql.';

-- ── Verificacao ─────────────────────────────────────────────────────────────
SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END AS resultado
FROM (VALUES
  ('Coluna remake_habilitado existe',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'organizations'
              AND column_name = 'remake_habilitado')),

  -- ⭐ O item central: o DEFAULT, nao os dados. Sem ele, organizacao criada
  -- amanha nasceria no caminho legado e ninguem notaria — o chat responderia,
  -- so pela cadeia antiga, e a unica pista seria a ausencia de linhas `ad_hoc`
  -- no `plum_logs` daquela organizacao.
  ('DEFAULT da coluna e true',
   (SELECT column_default = 'true'
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'organizations'
       AND column_name = 'remake_habilitado')),

  ('Nenhuma organizacao ficou com a chave desligada',
   NOT EXISTS (SELECT 1 FROM public.organizations
                WHERE remake_habilitado IS DISTINCT FROM true)),

  -- A coluna e NOT NULL desde a Etapa 0; se deixasse de ser, `IS DISTINCT FROM`
  -- acima passaria a esconder NULL como se fosse desligado.
  ('Coluna continua NOT NULL',
   (SELECT is_nullable = 'NO'
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'organizations'
       AND column_name = 'remake_habilitado')),

  ('Comentario da coluna diz que e chave de emergencia',
   (SELECT col_description('public.organizations'::regclass, ordinal_position)
             ILIKE '%EMERGENCIA%'
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'organizations'
       AND column_name = 'remake_habilitado'))
) AS t(item, ok)
ORDER BY t.ok, t.item;
