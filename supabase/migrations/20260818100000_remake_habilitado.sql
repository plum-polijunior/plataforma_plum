-- =========================================================================
-- CHAVE DE DESENVOLVIMENTO DO REMAKE — organizations.remake_habilitado
-- =========================================================================
-- Data: 2026-08-18
-- Plano: zz_remake_implementation/PLANO-implementacao-remake_V3.md, Etapa 0 §0.2
--
-- POR QUE ESTA COLUNA EXISTE
--
-- O remake acrescenta um caminho novo ao chat (a ação `ad_hoc`, ao lado da
-- `plan_query` de hoje). Ele será construído em pedaços, ao longo de semanas,
-- e durante esse período o caminho novo estará incompleto enquanto o antigo
-- precisa continuar funcionando — a plataforma é a demonstração de vendas
-- (`contexto/02-plataforma-vs-implementacao.md`), e demo quebrada custa venda.
--
-- Esta coluna é a chave que decide qual caminho roda, por organização.
--
-- ⚠️ ELA NÃO É UM CONTROLE DE SEGURANÇA, e a distinção importa. Uma redação
-- anterior do plano a tratava como "fronteira de isolamento" — protegendo os
-- clientes de código em construção. Isso estava errado: os clientes usam a
-- 🔧 implementação, um deploy totalmente separado, e não esta plataforma.
-- Aqui só há devs e demonstração. A chave é conveniência de desenvolvimento,
-- não barreira.
--
-- ⚠️ E ela cobre menos do que parece. Ela decide um caminho DENTRO da Edge
-- Function. Uma função que quebre no import devolve 500 para toda ação,
-- inclusive `plan_query` — a chave nem chega a ser lida. Por isso o deploy de
-- Edge Function continua sendo manual e deliberado (I-03).
--
-- `default false`: o caminho novo nasce desligado para todas as organizações,
-- inclusive as criadas depois desta migration. Ligar é ato explícito.
--
-- ROLLBACK: `update organizations set remake_habilitado = false where id = …`
-- Sem deploy, efeito imediato.
-- =========================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS remake_habilitado BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.remake_habilitado IS
  'Liga o caminho `ad_hoc` do remake para esta organizacao. Conveniencia de desenvolvimento, NAO controle de seguranca — ver 20260818100000_remake_habilitado.sql e o PLANO V3 Etapa 0.';


-- =========================================================================
-- VERIFICAÇÃO
-- =========================================================================
-- Sem bloco DO com teste vivo: não há comportamento a exercitar, só uma
-- coluna. O que importa conferir é que ela nasceu desligada para TODO mundo —
-- uma linha com `true` aqui significaria default mal aplicado, e o caminho
-- novo (ainda inexistente) já estaria ligado para alguém.

SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END AS situacao
FROM (VALUES
  ('Coluna organizations.remake_habilitado existe',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'organizations'
              AND column_name = 'remake_habilitado')),

  ('E boolean NOT NULL',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'organizations'
              AND column_name = 'remake_habilitado'
              AND data_type = 'boolean' AND is_nullable = 'NO')),

  ('Default e false',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'organizations'
              AND column_name = 'remake_habilitado'
              AND column_default LIKE '%false%')),

  ('⭐ NENHUMA organizacao nasceu com a chave ligada',
   NOT EXISTS (SELECT 1 FROM public.organizations WHERE remake_habilitado))
) AS t(item, ok)
ORDER BY t.ok, t.item;
