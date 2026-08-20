-- =========================================================================
-- datasets.vocabulario_exposto — a base pode listar valores de texto?
-- =========================================================================
-- Data: 2026-08-20 · Bloco B04 do remake
--
-- O QUE É
--
-- O pedido `vocabulario` devolve os **valores distintos** de uma coluna de
-- texto ("JOAO DA SILVA", "ACME LTDA") para o resolvedor de entidade casar com
-- o que o usuário escreveu. É a única porta do sistema para valor literal de
-- texto: o B02 fechou o `group_by` de alta cardinalidade e o B03 recusou
-- `min`/`max` sobre texto no `metadados`.
--
-- Esta coluna é a segunda das três travas dessa porta:
--
--   1. a coluna está em `role_permissions.allowed_columns` (RBAC de cargo)
--   2. ⬅ ESTA: a base foi liberada para expor vocabulário
--   3. teto de 200 valores distintos, aplicado pelo executor (B02)
--
-- ⭐ POR QUE POR BASE, E NÃO POR COLUNA
--
-- Por coluna seria mais fino e é o que a intuição pede. Foi recusado por dois
-- motivos:
--
--   • Já existe uma lista de colunas por cargo (`allowed_columns`). Uma segunda
--     lista por coluna criaria **dois lugares** para manter em sincronia, e
--     divergência entre listas de permissão é exatamente o formato de bug que
--     este projeto já pagou (I-01).
--   • O caso que a granularidade fina protegeria — CPF, matrícula, telefone —
--     já é pego pela trava 3: identificador tem cardinalidade alta por
--     definição, e o executor recusa acima de 200 distintos.
--
-- ⚠️ O que ESTE desenho não cobre: coluna sensível com **poucos** valores
-- distintos (faixa salarial, motivo de desligamento). Para essa, o controle
-- disponível é tirar a coluna do `allowed_columns` do cargo — o que também a
-- tira das consultas, e pode ser demais. Se aparecer um caso real, aí a
-- granularidade por coluna vira uma decisão informada em vez de especulação.
--
-- ⚠️ NÃO É CONTROLE CONTRA CLIENTE
--
-- Pela mesma razão do `remake_habilitado`: os 4 clientes usam uma implementação
-- separada, e nada daqui os alcança. Isto é higiene de base de teste e o
-- interruptor que evita uma demo listando nome de gente sem querer.
--
-- Default `false`: nenhuma base nasce expondo vocabulário. Ligar é ato
-- deliberado, por base.
-- =========================================================================

ALTER TABLE public.datasets
  ADD COLUMN IF NOT EXISTS vocabulario_exposto BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.datasets.vocabulario_exposto IS
  'Permite ao pedido `vocabulario` listar valores distintos de colunas de texto desta base. Segunda de tres travas: allowed_columns (cargo), esta, e o teto de 200 distintos no executor. Default false. Ver 20260820120000_vocabulario_exposto.sql.';


-- =========================================================================
-- VERIFICAÇÃO
-- =========================================================================

SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END AS situacao
FROM (VALUES
  ('Coluna datasets.vocabulario_exposto existe',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'datasets'
              AND column_name = 'vocabulario_exposto')),

  ('E boolean NOT NULL com default false',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'datasets'
              AND column_name = 'vocabulario_exposto'
              AND data_type = 'boolean'
              AND is_nullable = 'NO'
              AND column_default = 'false')),

  -- A que mais importa. Se falhar, alguma base ja esta expondo valor de texto
  -- sem ninguem ter pedido.
  ('NENHUMA base nasceu com vocabulario exposto',
   NOT EXISTS (SELECT 1 FROM public.datasets WHERE vocabulario_exposto)),

  ('A tabela continua com RLS ligada',
   EXISTS (SELECT 1 FROM pg_class
            WHERE relname = 'datasets' AND relrowsecurity))
) AS t(item, ok)
ORDER BY t.ok, t.item;
