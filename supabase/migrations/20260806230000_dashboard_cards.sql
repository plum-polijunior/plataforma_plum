-- =========================================================================
-- DASHBOARD: cards, snapshots, configuração por organização e sheet_id
-- =========================================================================
-- Projeto: PLUM 2.0 · branch `plataforma`
-- Data: 2026-08-06
--
-- Pré-requisito: 20260722120000 aplicada (é de lá que vêm os helpers
-- current_org_id(), is_active_member() e is_org_admin()).
--
-- O QUE ESTA MIGRATION FAZ:
--   1. dashboard_cards — um card é um Query Plan salvo.
--   2. dashboard_card_snapshots — o histórico de execuções. A chave usa a
--      IMPRESSÃO DIGITAL DA PERMISSÃO, não o role_id. Ver bloco 2.
--   3. Configuração por organização: k_min e max_rows.
--   4. datasets.google_sheet_id passa a ser a fonte da verdade, com backfill
--      a partir da URL que o onboarding vinha gravando.
--
-- Idempotente. Não destrutiva: nenhum DROP TABLE, nenhum DROP COLUMN.
-- =========================================================================


-- -------------------------------------------------------------------------
-- 1. dashboard_cards
-- -------------------------------------------------------------------------
-- Um card do dashboard é um Query Plan (o mesmo JSON que o Agente A gera para
-- o chat) guardado e re-executado. Não existe segundo motor: a tela e a
-- conversa passam pelo mesmo executor, pelo mesmo ponto de RBAC e pela mesma
-- auditoria.

CREATE TABLE IF NOT EXISTS public.dashboard_cards (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    dataset_id               uuid NOT NULL REFERENCES public.datasets(id)      ON DELETE CASCADE,
    created_by               uuid REFERENCES public.profiles(id)               ON DELETE SET NULL,

    title                    text NOT NULL,
    -- 'pinned'    = nasceu de uma pergunta que alguém realmente fez
    -- 'suggested' = proposto pelo gerador a partir do dicionário de dados
    source                   text NOT NULL DEFAULT 'pinned'
                             CHECK (source IN ('pinned', 'suggested')),
    origin_question          text,
    query_plan               jsonb NOT NULL,

    -- 'donut' NÃO existe aqui de propósito. Rosca é forma de todos-os-pares:
    -- com 4 categorias o par amarelo/laranja fica a ΔE 10,6 em visão normal,
    -- abaixo do piso 15, ou seja, indistinguível antes mesmo de considerar
    -- daltonismo. Parte-do-todo é barra empilhada horizontal, com no máximo
    -- 3 segmentos e o excedente agrupado em "Outros". Ver DESIGN.md seção 3.
    viz                      text NOT NULL
                             CHECK (viz IN ('kpi','line','bar','stacked_bar','meter','table')),

    -- Direção do delta. NULL = neutro, o delta sai sem cor.
    -- O padrão é NULL de propósito: pintar toda subida de verde faz um card de
    -- custo subindo 30%% parecer boa notícia, e cor é lida antes do número.
    higher_is_better         boolean,

    refresh_interval_minutes int NOT NULL DEFAULT 15
                             CHECK (refresh_interval_minutes BETWEEN 1 AND 1440),
    position                 int NOT NULL DEFAULT 0,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.dashboard_cards IS
    'Um card do dashboard e um Query Plan salvo, re-executado periodicamente.';
COMMENT ON COLUMN public.dashboard_cards.higher_is_better IS
    'true=subir e bom, false=subir e ruim, NULL=neutro (delta sem cor). Padrao NULL.';

CREATE INDEX IF NOT EXISTS dashboard_cards_dataset_idx
    ON public.dashboard_cards (dataset_id, position);


-- -------------------------------------------------------------------------
-- 2. dashboard_card_snapshots
-- -------------------------------------------------------------------------
-- POR QUE A CHAVE USA A IMPRESSÃO DIGITAL DA PERMISSÃO E NÃO role_id:
--
-- O RBAC de coluna muda o resultado, mas o que muda o resultado é o CONJUNTO
-- de colunas permitidas, não o identificador do cargo. E allowed_columns é
-- mutável.
--
-- Com role_id na chave havia um vazamento real: o admin revoga margem_lucro do
-- cargo de vendedor às 10h05, e o snapshot calculado às 10h00 continua sendo o
-- mais recente daquele (card, cargo). O vendedor segue vendo a margem até o TTL
-- expirar, e o admin acredita que revogou.
--
-- Com fingerprint = sha256(allowed_columns ordenadas), mudar a permissão gera
-- uma digital nova, o snapshot antigo deixa de ser encontrado e o sistema
-- recalcula. Três ganhos: invalidação automática sem trigger, dedup entre
-- cargos de permissão idêntica, e vazamento impossível por construção.
--
-- Custo aceito: a série histórica passa a ser por digital, então mudar a
-- permissão inicia uma série nova. Isso é correto, não é bug: a métrica mudou
-- de definição quando o conjunto de colunas mudou.

CREATE TABLE IF NOT EXISTS public.dashboard_card_snapshots (
    card_id                 uuid NOT NULL REFERENCES public.dashboard_cards(id) ON DELETE CASCADE,
    permissions_fingerprint text NOT NULL,
    organization_id         uuid NOT NULL REFERENCES public.organizations(id)   ON DELETE CASCADE,
    -- Fora da chave. Existe para auditoria e depuração, não para busca.
    role_id                 uuid REFERENCES public.roles(id)                    ON DELETE SET NULL,

    payload                 jsonb NOT NULL,
    row_count               int  NOT NULL DEFAULT 0,
    suppressed_groups       int  NOT NULL DEFAULT 0,
    computed_at             timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (card_id, permissions_fingerprint, computed_at)
);

COMMENT ON TABLE public.dashboard_card_snapshots IS
    'Historico de execucoes por card e por conjunto de permissoes. O acumulo '
    'destes snapshots E a serie temporal que o motor de insights vai usar, '
    'sem precisar varrer a planilha de novo e sem tocar em linha bruta.';

-- A leitura quente é "último snapshot de (card, digital)". Sem este índice
-- todo carregamento de dashboard vira varredura sequencial conforme a tabela
-- cresce, e ela cresce a cada execução.
CREATE INDEX IF NOT EXISTS dashboard_card_snapshots_latest_idx
    ON public.dashboard_card_snapshots (card_id, permissions_fingerprint, computed_at DESC);


-- -------------------------------------------------------------------------
-- 3. Configuração por organização
-- -------------------------------------------------------------------------
-- k_min e max_rows moravam em variável de ambiente do serviço, o que é global.
-- Uma base de 40 clientes B2B com k=5 suprime quase tudo; uma base de varejo
-- com 200 mil linhas por mês precisa de outro teto. A decisão é do admin da
-- organização e precisa de trilha.

ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS dashboard_k_min    int NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS dashboard_max_rows int NOT NULL DEFAULT 200000;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'organizations_k_min_sensato'
    ) THEN
        ALTER TABLE public.organizations
            ADD CONSTRAINT organizations_k_min_sensato
            CHECK (dashboard_k_min BETWEEN 1 AND 1000);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'organizations_max_rows_sensato'
    ) THEN
        ALTER TABLE public.organizations
            ADD CONSTRAINT organizations_max_rows_sensato
            CHECK (dashboard_max_rows BETWEEN 1000 AND 5000000);
    END IF;
END $$;

COMMENT ON COLUMN public.organizations.dashboard_k_min IS
    'Minimo de linhas por grupo para o resultado poder sair. Abaixo disso o '
    'grupo e suprimido. Baixar isto reduz a protecao de privacidade.';


-- -------------------------------------------------------------------------
-- 4. datasets.google_sheet_id como fonte da verdade
-- -------------------------------------------------------------------------
-- A tabela tinha dois campos concorrentes. O onboarding gravava a URL
-- (DatabasePipeline.tsx:395) e o executor esperava o ID. Como types.ts só
-- conhecia google_sheet_id, o TypeScript não acusava nada e todo card falharia
-- no primeiro dia com "planilha nula".
--
-- Decisão: o ID é a verdade, porque a API do Google exige o ID e não a URL.
-- Extrair uma vez na escrita é melhor que extrair em toda leitura.
-- A URL fica como campo secundário, só para exibir na tela de configuração.

ALTER TABLE public.datasets
    ADD COLUMN IF NOT EXISTS google_sheet_id  text,
    ADD COLUMN IF NOT EXISTS google_sheet_url text,
    ADD COLUMN IF NOT EXISTS google_sheet_tab text NOT NULL DEFAULT 'Sheet1';

-- Extrai o ID de uma URL do Google Sheets. Imutável: serve em índice e em
-- coluna gerada, se um dia for preciso.
CREATE OR REPLACE FUNCTION public.extract_google_sheet_id(url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT substring(url FROM '/spreadsheets/d/([a-zA-Z0-9_-]+)')
$$;

COMMENT ON FUNCTION public.extract_google_sheet_id(text) IS
    'Extrai o ID de uma URL https://docs.google.com/spreadsheets/d/<ID>/...';

-- Backfill: datasets que já existem e só têm a URL.
UPDATE public.datasets
   SET google_sheet_id = public.extract_google_sheet_id(google_sheet_url)
 WHERE google_sheet_id IS NULL
   AND google_sheet_url IS NOT NULL
   AND public.extract_google_sheet_id(google_sheet_url) IS NOT NULL;

-- Diagnóstico, não bloqueio: um dataset ativo sem sheet_id é um card que vai
-- falhar. Melhor descobrir aqui do que em produção.
DO $$
DECLARE
    orfaos int;
BEGIN
    SELECT count(*) INTO orfaos
      FROM public.datasets
     WHERE status = 'active' AND (google_sheet_id IS NULL OR google_sheet_id = '');
    IF orfaos > 0 THEN
        RAISE WARNING
            'ATENCAO: % dataset(s) ativo(s) sem google_sheet_id. Eles precisam '
            'ser reconectados na tela de bases antes de qualquer card funcionar.',
            orfaos;
    END IF;
END $$;


-- -------------------------------------------------------------------------
-- 5. RLS — mesmo padrão de role_permissions na 20260722120000
-- -------------------------------------------------------------------------
-- Membro ativo da organização lê. Admin da organização gerencia.
-- Ninguém enxerga nada de outra organização, em nenhum caminho.

ALTER TABLE public.dashboard_cards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_card_snapshots   ENABLE ROW LEVEL SECURITY;

-- 5.1 cards
DROP POLICY IF EXISTS "membro ativo ve cards da org" ON public.dashboard_cards;
CREATE POLICY "membro ativo ve cards da org" ON public.dashboard_cards
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_active_member());

-- Criar card é ato de uso normal, não de administração: quem tem acesso à base
-- pode fixar uma pergunta. A checagem de coluna acontece na execução, não aqui.
DROP POLICY IF EXISTS "membro ativo cria card na org" ON public.dashboard_cards;
CREATE POLICY "membro ativo cria card na org" ON public.dashboard_cards
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_org_id()
    AND public.is_active_member()
    AND created_by = auth.uid()
  );

-- Editar e apagar: o dono do card ou um admin.
DROP POLICY IF EXISTS "dono ou admin edita card" ON public.dashboard_cards;
CREATE POLICY "dono ou admin edita card" ON public.dashboard_cards
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND (created_by = auth.uid() OR public.is_org_admin())
  )
  WITH CHECK (organization_id = public.current_org_id());

DROP POLICY IF EXISTS "dono ou admin apaga card" ON public.dashboard_cards;
CREATE POLICY "dono ou admin apaga card" ON public.dashboard_cards
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND (created_by = auth.uid() OR public.is_org_admin())
  );

-- 5.2 snapshots
-- Somente leitura para o cliente. Quem ESCREVE snapshot é a Edge Function, com
-- a service role, depois de validar o plano contra allowed_columns. Se o
-- navegador pudesse inserir snapshot, ele poderia fabricar um resultado com
-- qualquer digital de permissão e contornar o RBAC inteiro.
DROP POLICY IF EXISTS "membro ativo ve snapshots da org" ON public.dashboard_card_snapshots;
CREATE POLICY "membro ativo ve snapshots da org" ON public.dashboard_card_snapshots
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_active_member());

-- Nenhuma policy de INSERT/UPDATE/DELETE para `authenticated`. Com RLS ligada
-- e sem policy, a operação é negada. A service role passa por cima de RLS por
-- definição, que é exatamente o que queremos: só o servidor escreve aqui.

REVOKE ALL ON public.dashboard_cards          FROM anon;
REVOKE ALL ON public.dashboard_card_snapshots FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_cards          TO authenticated;
GRANT SELECT                          ON public.dashboard_card_snapshots TO authenticated;


-- -------------------------------------------------------------------------
-- 6. updated_at automático nos cards
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_dashboard_card_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS dashboard_cards_touch_updated_at ON public.dashboard_cards;
CREATE TRIGGER dashboard_cards_touch_updated_at
    BEFORE UPDATE ON public.dashboard_cards
    FOR EACH ROW EXECUTE FUNCTION public.touch_dashboard_card_updated_at();
