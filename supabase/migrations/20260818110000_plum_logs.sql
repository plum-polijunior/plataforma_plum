-- =========================================================================
-- plum_logs — observabilidade do chat, e a linha de base do remake
-- =========================================================================
-- Data: 2026-08-18
-- Plano: zz_remake_implementation/PLANO-implementacao-remake_V3.md, Etapa 0 §0.1
-- Pré-requisito: 20260818100000_remake_habilitado.sql
--
-- POR QUE ESTA TABELA EXISTE, E POR QUE AGORA
--
-- O remake substitui a cadeia de agentes do chat. Para dizer depois que ele
-- ficou melhor é preciso ter medido o que existe HOJE — custo por pergunta,
-- latência por etapa, e em que forma as coisas falham. Por isso ela é o
-- primeiro item da Etapa 0, antes de qualquer linha de remake: a linha de base
-- só pode ser colhida enquanto o caminho antigo ainda é o único que roda.
--
-- ⚠️ E ela carrega um peso extra nesta plataforma. Como não há usuário real
-- aqui (os clientes usam a 🔧 implementação, deploy separado), não existirá
-- sinal de satisfação vindo do uso. O que este log mede — custo, latência,
-- formato da falha — é a única evidência quantitativa que o remake vai ter.
-- Ver o §0-ter do plano V3.
--
-- ⚠️ A PERGUNTA CRUA NÃO ENTRA (D-022). Registra-se a FORMA da pergunta
-- (quantos pedidos, de que tipos, quantas linhas), nunca o texto. A D-022
-- decidiu isso para o log da `dashboard-agent` e vale igual aqui: texto livre
-- digitado sem pensar não deve ser persistido, e um log é persistência.
--
-- ── DUAS DECISÕES DE DESENHO QUE O PLANO NÃO TRAZIA ──────────────────────
--
-- O schema herdado do V7 pedia `sessao_id` e `turno_id` NOT NULL sem dizer de
-- onde viriam — e não vinham de lugar nenhum: o chat não tem conceito de
-- sessão, `plum_chat` é uma lista plana de mensagens.
--
--   • `sessao_id` — uuid gerado NO CLIENTE, renovado a cada carga da página e
--     a cada troca de dataset. Agrupa "esta conversa".
--   • `turno_id`  — uuid por mensagem do usuário. Agrupa as 4+ linhas que UMA
--     pergunta produz. É a chave de "quanto custou esta pergunta".
--
-- ⚠️ O ORÇAMENTO DE LINHAS DO B10 NÃO DEVE USAR `sessao_id`. O plano define o
-- orçamento como `usuário × dataset × janela de tempo`, resolvida no servidor.
-- Amarrá-lo a este uuid daria orçamento novo a cada F5 — que é exatamente o
-- modo de falha a evitar. São dois conceitos com o mesmo nome; não unifique
-- achando que está limpando o código.
--
-- ── DUAS DIVERGÊNCIAS DELIBERADAS DO SPEC ────────────────────────────────
--
--   1. `created_at`, não `criado_em`. O V7 escreveu em português, mas TODAS as
--      tabelas deste banco usam `created_at`/`updated_at` (`profiles`,
--      `plum_chat`, `datasets`…). Consistência de coluna vale mais aqui que
--      consistência de idioma — quem escreve query não deve ter de lembrar
--      qual tabela fala português.
--   2. `etapa` aceita DOIS vocabulários. O V7 listou só as etapas do remake
--      (porteiro, reconhecedor, …), mas a Etapa 0 instrumenta o caminho ATUAL,
--      cujas etapas são outras (`guard`, `plan_query`, …). Um CHECK só com os
--      nomes novos rejeitaria a primeira linha da linha de base.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.plum_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ⭐ IDENTIDADE VEM DO JWT, NÃO DO CHAMADOR. O default resolve `auth.uid()` e
  -- `current_org_id()` dentro do banco, então a Edge Function nem precisa
  -- enviar esses campos — e um cliente que tente enviá-los diferentes esbarra
  -- no WITH CHECK da policy de INSERT, abaixo.
  --
  -- É a regra 1 do CLAUDE.md §4 aplicada a uma tabela de log: identificador
  -- vindo do cliente é candidato, nunca verdade. Aqui ele simplesmente não
  -- precisa vir. Bônus: economiza a ida ao banco que a função teria de fazer
  -- só para descobrir a própria organização.
  organization_id  UUID NOT NULL DEFAULT public.current_org_id()
                     REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL DEFAULT auth.uid()
                     REFERENCES auth.users(id)           ON DELETE CASCADE,
  dataset_id       UUID          REFERENCES public.datasets(id)      ON DELETE SET NULL,

  -- Ver o bloco de decisões acima.
  sessao_id        UUID NOT NULL,
  turno_id         UUID NOT NULL,

  -- Qual cadeia respondeu. Redundante com `etapa` em teoria; explícito porque
  -- o critério de pronto da Etapa 0 é literalmente "o log mostra por qual
  -- caminho a pergunta passou", e inferir isso por nome de etapa é frágil.
  caminho          TEXT NOT NULL
                     CHECK (caminho IN ('legado', 'ad_hoc')),

  etapa            TEXT NOT NULL
                     CHECK (etapa IN (
                       -- caminho 'legado' (o que existe hoje)
                       'guard', 'plan_query', 'execute_plan', 'synthesize_answer',
                       -- caminho 'ad_hoc' (o remake)
                       'porteiro', 'reconhecedor', 'planejador', 'resolvedor',
                       'autorizador', 'executor', 'interprete'
                     )),

  status           TEXT NOT NULL
                     CHECK (status IN (
                       'ok', 'bloqueado', 'negado', 'inviavel', 'desambiguacao', 'erro'
                     )),
  codigo_erro      TEXT,

  modelo           TEXT,
  provedor         TEXT,
  tokens_entrada   INT,
  tokens_saida     INT,
  latencia_ms      INT,

  -- A FORMA da pergunta, nunca o texto (D-022).
  pedidos_qtd      INT,
  tipos_pedido     TEXT[],
  linhas_origem            INT,
  linhas_brutas_entregues  INT,
  presuncoes_qtd   INT,
  rodada_extra     BOOLEAN,
  cache_hit_a2     BOOLEAN,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plum_logs IS
  'Observabilidade do chat: uma linha por etapa de cada pergunta. A pergunta CRUA nunca entra (D-022). Ver 20260818110000_plum_logs.sql.';
COMMENT ON COLUMN public.plum_logs.sessao_id IS
  'uuid do cliente, por carga de pagina/troca de dataset. NAO usar como janela de orcamento — ver o cabecalho da migration.';
COMMENT ON COLUMN public.plum_logs.turno_id IS
  'uuid por mensagem do usuario. Agrupa as linhas de UMA pergunta; e a chave de "quanto custou esta pergunta".';

-- Índices para as duas perguntas que este log existe para responder:
-- "quanto custou este turno" e "como foi o custo/latência ao longo do tempo".
CREATE INDEX IF NOT EXISTS plum_logs_turno_idx
  ON public.plum_logs (turno_id);
CREATE INDEX IF NOT EXISTS plum_logs_org_tempo_idx
  ON public.plum_logs (organization_id, created_at DESC);


-- -------------------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------------------
-- ⚠️ ESCRITA COM O JWT DO USUÁRIO, NÃO COM service_role — e é decisão, não
-- descuido. O `ai-plum-chat` monta o client com o JWT de quem perguntou, e o
-- código diz por quê: "service role aqui transformaria um bug de filtro em
-- vazamento entre organizações, em vez de resultado vazio". Abrir service_role
-- ali só para gravar log contrariaria essa postura numa função que já foi
-- palco do I-01.
--
-- O que esta escolha aceita: um usuário pode inserir linha de log falsa no
-- PRÓPRIO log. Não é dado de autorização, não atravessa organização, e não
-- vale trocar por uma credencial de bypass total na função mais exposta.

ALTER TABLE public.plum_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "membro ativo le o log da org" ON public.plum_logs;
CREATE POLICY "membro ativo le o log da org" ON public.plum_logs
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND public.is_active_member()
  );

DROP POLICY IF EXISTS "usuario grava o proprio log" ON public.plum_logs;
CREATE POLICY "usuario grava o proprio log" ON public.plum_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_org_id()
    AND user_id = auth.uid()
  );

-- Sem UPDATE e sem DELETE para `authenticated`, de propósito: log é
-- append-only. Mesmo padrão de `profile_changes_audit`.
REVOKE ALL    ON public.plum_logs FROM anon, authenticated;
GRANT  SELECT, INSERT ON public.plum_logs TO authenticated;
GRANT  ALL    ON public.plum_logs TO service_role;


-- =========================================================================
-- VERIFICAÇÃO
-- =========================================================================
-- Os CHECKs são exercitados de verdade: um enum que aceita valor fora da lista
-- é um enum que não existe, e descobrir isso quando o log já tem mil linhas
-- sujas é tarde. Cada teste roda em subtransação e é desfeito.

DO $verificacao$
DECLARE
  v_org    uuid;
  v_user   uuid;
  v_barrou boolean;
BEGIN
  SELECT id INTO v_org  FROM public.organizations LIMIT 1;
  SELECT id INTO v_user FROM public.profiles      LIMIT 1;

  IF v_org IS NULL OR v_user IS NULL THEN
    RAISE NOTICE 'Sem organizacao/profile: testes vivos dos CHECK pulados.';
    RETURN;
  END IF;

  -- (1) etapa fora do enum tem de ser recusada
  BEGIN
    INSERT INTO public.plum_logs
      (organization_id, user_id, sessao_id, turno_id, caminho, etapa, status)
    VALUES (v_org, v_user, gen_random_uuid(), gen_random_uuid(),
            'legado', 'etapa_que_nao_existe', 'ok');
    v_barrou := false;
  EXCEPTION WHEN check_violation THEN
    v_barrou := true;
  END;
  IF NOT v_barrou THEN
    RAISE EXCEPTION 'CHECK de `etapa` NAO barrou valor fora do enum.';
  END IF;

  -- (2) caminho fora do enum tem de ser recusado
  BEGIN
    INSERT INTO public.plum_logs
      (organization_id, user_id, sessao_id, turno_id, caminho, etapa, status)
    VALUES (v_org, v_user, gen_random_uuid(), gen_random_uuid(),
            'caminho_inventado', 'guard', 'ok');
    v_barrou := false;
  EXCEPTION WHEN check_violation THEN
    v_barrou := true;
  END;
  IF NOT v_barrou THEN
    RAISE EXCEPTION 'CHECK de `caminho` NAO barrou valor fora do enum.';
  END IF;

  -- (3) as etapas do caminho ATUAL têm de passar — é a linha de base, e um
  -- enum só com os nomes do remake rejeitaria a primeira linha dela
  INSERT INTO public.plum_logs
    (organization_id, user_id, sessao_id, turno_id, caminho, etapa, status)
  VALUES (v_org, v_user, gen_random_uuid(), gen_random_uuid(),
          'legado', 'synthesize_answer', 'ok');

  DELETE FROM public.plum_logs WHERE etapa = 'synthesize_answer' AND status = 'ok';

  RAISE NOTICE 'Testes vivos: OK (enums barram invalido e aceitam o caminho legado).';
END
$verificacao$;

SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END AS situacao
FROM (VALUES
  ('Tabela plum_logs existe',
   EXISTS (SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'plum_logs')),

  ('RLS habilitada',
   coalesce((SELECT relrowsecurity FROM pg_class
              WHERE oid = 'public.plum_logs'::regclass), false)),

  ('Policy de SELECT existe',
   EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'plum_logs'
            AND policyname = 'membro ativo le o log da org' AND cmd = 'SELECT')),

  ('Policy de INSERT existe',
   EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'plum_logs'
            AND policyname = 'usuario grava o proprio log' AND cmd = 'INSERT')),

  ('⭐ Append-only: sem policy de UPDATE nem DELETE',
   NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'plum_logs'
                AND cmd IN ('UPDATE', 'DELETE'))),

  ('Os dois indices existem',
   (SELECT count(*) FROM pg_indexes WHERE tablename = 'plum_logs'
     AND indexname IN ('plum_logs_turno_idx', 'plum_logs_org_tempo_idx')) = 2),

  ('anon nao alcanca a tabela',
   NOT has_table_privilege('anon', 'public.plum_logs', 'SELECT')),

  ('⭐ Identidade tem default vindo do JWT (nao do chamador)',
   (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'plum_logs'
       AND ((column_name = 'user_id'         AND column_default LIKE '%auth.uid()%')
         OR (column_name = 'organization_id' AND column_default LIKE '%current_org_id()%'))) = 2),

  ('Nenhuma linha de teste sobrou',
   NOT EXISTS (SELECT 1 FROM public.plum_logs))
) AS t(item, ok)
ORDER BY t.ok, t.item;
