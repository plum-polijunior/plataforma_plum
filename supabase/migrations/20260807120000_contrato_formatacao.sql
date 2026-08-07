-- =========================================================================
-- CONTRATO DE FORMATACAO — coluna `datasets.formatting_contract`
-- =========================================================================
-- Projeto: PLUM 2.0 · branch `plataforma`
-- Data: 2026-08-07
-- Contexto: query_engine/urgent.md
--
-- PROBLEMA QUE ESTA MIGRATION RESOLVE
--
-- O Agente 3 escreve a regra de limpeza de cada coluna como frase livre em
-- portugues ("Retirar os R$, converter para float"). Quem consome essa frase
-- e' `papeisDeColuna()`, na Edge Function dashboard-execute, e o que ela faz
-- e' grep de ~12 palavras-chave. Uma regra como "converter Sim/Nao para
-- booleano" nao casa com nenhuma delas e a coluna vira `text` — sem log, sem
-- erro, sem aviso.
--
-- Consequencia concreta: `role = text` faz o executor rodar
-- `to_numeric(errors="coerce").fillna(0)` em soma e media, entao valor que nao
-- converte entra como ZERO na conta. E coluna percentual cuja frase nao tenha
-- "percent|porcent|%|taxa" perde a protecao de nunca-somar: 10% + 20% volta a
-- virar 30. O numero errado chega ao usuario com cara de certo, que e'
-- exatamente o que o produto promete que nao acontece (prd.md §2.2).
--
-- SOLUCAO
--
-- Uma coluna nova, separada de `schema_metadata`, com o que a maquina executa:
-- um `tipo` de enum FECHADO por coluna. A frase em portugues continua
-- existindo em `schema_metadata.columns[col].cleaning_rule`, mas passa a ser
-- so' exibicao para o humano revisor. Quem decide o comportamento e' o `tipo`.
--
-- Formato:
--   {
--     "versao": 1,
--     "colunas": {
--       "faturamento":  { "tipo": "moeda_brl",  "params": {"casas_decimais": 2} },
--       "data_venda":   { "tipo": "data",       "params": {"dayfirst": true} },
--       "desconto_pct": { "tipo": "percentual", "params": {} },
--       "observacoes":  { "tipo": "nenhuma",    "params": {} }
--     }
--   }
--
-- Enum fechado de `tipo` (expandir so' com decisao explicita, nunca em
-- silencio — um tipo desconhecido e' tratado como `nenhuma` e logado):
--   moeda_brl · numero_decimal · numero_inteiro · percentual · data
--   texto_trim_maiusculas · texto_trim_minusculas · documento_cpf_cnpj
--   booleano_sim_nao · nenhuma
--
-- NULL nesta coluna = dataset legado, importado antes do contrato existir. A
-- Edge Function cai no grep antigo nesse caso, e loga que caiu. Migracao e'
-- gradual e nao destrutiva: nenhuma base existente para de funcionar.
--
-- RLS: nada a fazer. A coluna herda as policies de `datasets` (SELECT por
-- organizacao com membro ativo, escrita por admin). Nao ha superficie nova.
--
-- Idempotente. Nao destrutiva.
-- =========================================================================


-- -------------------------------------------------------------------------
-- 1. A coluna
-- -------------------------------------------------------------------------
ALTER TABLE public.datasets
    ADD COLUMN IF NOT EXISTS formatting_contract JSONB;

COMMENT ON COLUMN public.datasets.formatting_contract IS
  'Contrato de formatacao estruturado, lido pela Edge Function para derivar column_roles: {versao, colunas: {coluna: {tipo, params}}}. O tipo vem de um enum fechado. NULL = dataset legado, cuja regra vive como frase livre em schema_metadata.columns[col].cleaning_rule. Ver query_engine/urgent.md.';


-- -------------------------------------------------------------------------
-- 2. Guarda de formato
-- -------------------------------------------------------------------------
-- Impede que um contrato entre com a forma errada. Nao valida o enum de
-- `tipo` — isso e' responsabilidade da Edge Function, que precisa poder
-- CORRIGIR um tipo invalido para 'nenhuma' e avisar, em vez de recusar a
-- gravacao inteira e travar o pipeline de importacao (R-08: validacao alerta,
-- nunca corrige em silencio; aqui o banco so' garante a forma).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'datasets_formatting_contract_formato'
       AND conrelid = 'public.datasets'::regclass
  ) THEN
    ALTER TABLE public.datasets
      ADD CONSTRAINT datasets_formatting_contract_formato
      CHECK (
        formatting_contract IS NULL
        OR (
          jsonb_typeof(formatting_contract) = 'object'
          AND jsonb_typeof(formatting_contract -> 'colunas') = 'object'
        )
      );
  END IF;
END
$$;


-- -------------------------------------------------------------------------
-- 3. Verificacao
-- -------------------------------------------------------------------------
SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END AS situacao
FROM (VALUES
  ('Coluna datasets.formatting_contract existe',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'datasets'
              AND column_name = 'formatting_contract')),
  ('Coluna e do tipo jsonb',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'datasets'
              AND column_name = 'formatting_contract'
              AND data_type = 'jsonb')),
  ('Coluna tem COMMENT explicando o formato',
   COALESCE(length(col_description('public.datasets'::regclass,
     (SELECT ordinal_position FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'datasets'
         AND column_name = 'formatting_contract')::int)) > 0, false)),
  ('Constraint de formato existe',
   EXISTS (SELECT 1 FROM pg_constraint
            WHERE conname = 'datasets_formatting_contract_formato'
              AND conrelid = 'public.datasets'::regclass)),
  ('Nenhum dataset existente foi alterado (todos legados = NULL)',
   NOT EXISTS (SELECT 1 FROM public.datasets
                WHERE formatting_contract IS NOT NULL
                  AND jsonb_typeof(formatting_contract -> 'colunas') IS DISTINCT FROM 'object'))
) AS t(item, ok)
ORDER BY ok, item;
