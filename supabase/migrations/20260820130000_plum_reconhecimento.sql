-- =========================================================================
-- plum_reconhecimento — o cache do Agente A2 (Reconhecedor)
-- =========================================================================
-- Data: 2026-08-20 · Bloco B06 do remake
--
-- O QUE É
--
-- O A2 lê os `metadados` da base (B03) e produz uma **leitura semântica
-- reutilizável**: o que cada coluna parece significar, quais são categóricas e
-- valem buscar vocabulário, qual é o grão. O A3 depois escolhe, dessa leitura, o
-- que serve para a pergunta do momento.
--
-- ⭐ POR QUE ISSO É CACHEÁVEL, E POR QUE A DEFINIÇÃO IMPORTA
--
-- ⚠️ **O V7 se contradiz sobre o A2, e a contradição decide esta tabela.** A §1
-- lista a entrada dele como *"pergunta + metadados"*, mas a nota logo abaixo diz
-- que *"A2 depende só de (dataset, versão do dicionário) e vale para qualquer
-- pergunta"* — e é essa nota que justifica A1 e A2 serem agentes separados.
--
-- As duas coisas não podem ser verdade. Se o A2 recebe a pergunta, o cache só
-- acerta quando a mesma pergunta se repete, e a separação A1/A2 perde o motivo
-- de existir.
--
-- **Resolvido em favor da nota:** o A2 **não recebe a pergunta**. Ele descreve a
-- base, não responde nada. Quem cruza a base com a pergunta é o A3. Assim o
-- cache acerta a partir da 2ª pergunta em qualquer base já vista — que é o
-- critério de pronto do V7 §8 item 4.
--
-- A CHAVE
--
-- `(dataset_id, digital_dicionario)`. A digital é um SHA-256 do
-- `schema_metadata` canonicalizado — não existe coluna de versão do dicionário,
-- e criar uma exigiria lembrar de incrementá-la em todo lugar que edita o
-- schema. A digital não pode ser esquecida: ela muda porque o conteúdo mudou.
--
-- ⚠️ **Entrada velha não é apagada, fica inalcançável.** Quando o dicionário
-- muda, a digital muda e a linha antiga deixa de ser encontrada. Acumula, e é o
-- comportamento desejado: é histórico de como o A2 lia a base antes da edição,
-- útil para investigar "por que a resposta piorou depois que mexi no schema".
-- Limpeza, se um dia fizer falta, é `DELETE` por idade — nunca automática.
--
-- ⚠️ NÃO É CONTROLE DE ACESSO
--
-- O reconhecimento guarda **nomes e descrições de coluna**, não valores da base.
-- Ainda assim a RLS é por organização, pela mesma razão de sempre: nome de
-- coluna já diz o que a empresa mede.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.plum_reconhecimento (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Mesma postura de `plum_logs`: a identidade vem do JWT, não do chamador.
  -- Ver 20260818110000_plum_logs.sql.
  organization_id    UUID NOT NULL DEFAULT public.current_org_id()
                       REFERENCES public.organizations(id) ON DELETE CASCADE,

  dataset_id         UUID NOT NULL
                       REFERENCES public.datasets(id) ON DELETE CASCADE,

  -- SHA-256 do schema_metadata canonicalizado. 64 caracteres hex.
  digital_dicionario TEXT NOT NULL CHECK (digital_dicionario ~ '^[0-9a-f]{64}$'),

  -- A saída do A2. Estrutura definida em `adhoc/reconhecedor.ts`.
  reconhecimento     JSONB NOT NULL,

  -- Custo da chamada que gerou esta linha. O `plum_logs` também registra, mas
  -- aqui fica junto do artefato: responde "quanto custou construir este cache"
  -- sem precisar cruzar tabela.
  modelo             TEXT,
  tokens_entrada     INTEGER,
  tokens_saida       INTEGER,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ⭐ A chave do cache. É o UNIQUE que faz o `upsert` funcionar: duas perguntas
  -- simultâneas na mesma base geram duas chamadas ao A2 (aceitável, acontece
  -- uma vez por base) mas nunca duas linhas.
  UNIQUE (dataset_id, digital_dicionario)
);

ALTER TABLE public.plum_reconhecimento ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer membro ativo da organização. É o que permite a 2ª pergunta
-- de OUTRA pessoa aproveitar o cache da primeira.
CREATE POLICY "membros ativos leem o reconhecimento da sua organizacao"
  ON public.plum_reconhecimento FOR SELECT
  USING (organization_id = public.current_org_id());

CREATE POLICY "membros ativos gravam reconhecimento da sua organizacao"
  ON public.plum_reconhecimento FOR INSERT
  WITH CHECK (organization_id = public.current_org_id());

-- ⚠️ UPDATE existe aqui, ao contrário de `plum_logs`, e por um motivo: o
-- `upsert` do cache precisa dele quando duas chamadas concorrem na mesma chave.
-- Não é edição de histórico — é a reescrita do mesmo artefato derivado.
CREATE POLICY "membros ativos atualizam reconhecimento da sua organizacao"
  ON public.plum_reconhecimento FOR UPDATE
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

CREATE INDEX IF NOT EXISTS plum_reconhecimento_busca
  ON public.plum_reconhecimento (dataset_id, digital_dicionario);


-- =========================================================================
-- VERIFICAÇÃO
-- =========================================================================

SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END AS situacao
FROM (VALUES
  ('Tabela plum_reconhecimento existe',
   EXISTS (SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'plum_reconhecimento')),

  ('RLS ligada',
   EXISTS (SELECT 1 FROM pg_class
            WHERE relname = 'plum_reconhecimento' AND relrowsecurity)),

  -- Sem esta, o upsert grava linha duplicada e o cache nunca acerta de verdade.
  ('Chave unica (dataset_id, digital_dicionario)',
   EXISTS (SELECT 1 FROM pg_indexes
            WHERE tablename = 'plum_reconhecimento' AND indexdef LIKE '%UNIQUE%'
              AND indexdef LIKE '%dataset_id%'
              AND indexdef LIKE '%digital_dicionario%')),

  ('Identidade tem default vindo do JWT',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'plum_reconhecimento'
              AND column_name = 'organization_id'
              AND column_default LIKE '%current_org_id%')),

  ('Ha policy de SELECT, INSERT e UPDATE',
   (SELECT count(DISTINCT cmd) = 3 FROM pg_policies
     WHERE tablename = 'plum_reconhecimento'
       AND cmd IN ('SELECT', 'INSERT', 'UPDATE'))),

  -- Cache derivado nao se apaga: entrada velha fica inalcancavel e vira
  -- historico de como o A2 lia a base antes da edicao do dicionario.
  ('Sem policy de DELETE',
   NOT EXISTS (SELECT 1 FROM pg_policies
                WHERE tablename = 'plum_reconhecimento' AND cmd = 'DELETE')),

  ('A digital so aceita sha256 em hex',
   EXISTS (SELECT 1 FROM pg_constraint
            WHERE conrelid = 'public.plum_reconhecimento'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%64%'))
) AS t(item, ok)
ORDER BY t.ok, t.item;
