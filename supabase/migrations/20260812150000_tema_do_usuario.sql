-- =========================================================================
-- PERSISTÊNCIA DO TEMA (claro/escuro) POR USUÁRIO
-- =========================================================================
-- Data: 2026-08-12
--
-- POR QUE ESTA MIGRATION EXISTE
--
-- O alternador de tema do produto (`src/hooks/use-tema.ts`, botão em
-- `DashboardLayout.tsx`) guarda a escolha só em `localStorage["plum-tema"]`.
-- Limpar o cache do navegador — ou trocar de máquina — perde a preferência, e
-- o usuário precisa escolher escuro de novo toda vez (`pendencias_e_dividas_
-- tecnicas.md`, "parte 2", problema 1).
--
-- A solução óbvia — deixar o cliente dar `UPDATE profiles SET tema = ...
-- WHERE id = auth.uid()` — não existe hoje e não deveria existir: a ÚNICA
-- policy de UPDATE em `profiles` (20260722120000_sso_dominio_control_plane.sql,
-- "admin gerencia perfis da org") exige `id <> auth.uid()` DE PROPÓSITO —
-- CLAUDE.md §4 regra 5: "Nenhuma policy de UPDATE em profiles pode alcançar o
-- próprio registro. Sem isso o usuário se autopromove." Abrir uma policy
-- genérica de self-UPDATE reabriria exatamente a brecha que
-- 20260722110000_hotfix_escalonamento_privilegio.sql fechou (um membro
-- pendente virando ativo sozinho).
--
-- Por isso a escrita é uma RPC estreita, no mesmo molde de
-- `criar_organizacao()`/`resolver_codigo_organizacao()`: `SECURITY DEFINER`,
-- e só sabe fazer UMA coisa — gravar `tema` na própria linha de quem chamou.
-- Não abre nenhuma policy nova em `profiles`, e não chega perto de
-- `role_id`/`status`/`organization_id`, então não é candidata a vetor de
-- autopromoção.
--
-- Valores: `'claro'`/`'escuro'`, os mesmos literais que `use-tema.ts` já usa
-- (tipo `Tema`) — não os nomes em inglês do enunciado original. Inventar um
-- segundo vocabulário para o mesmo conceito é o tipo de divergência que
-- CLAUDE.md §7 já registra como problema para `join_mode` (dois literais para
-- a mesma coisa, um deles errado por escrita).
--
-- `tema` fica NULLABLE, sem default. NULL é "nunca salvou uma preferência no
-- servidor" — distinto de `'claro'` (escolheu claro explicitamente) — e essa
-- distinção importa no lado do cliente: `use-tema.ts` só sobrescreve o que já
-- está no `localStorage` quando o servidor devolve um valor não-nulo, para não
-- apagar a escolha de alguém que abriu o produto pela primeira vez.
--
-- Não aciona `auditar_mudanca_perfil()` (20260722130000_endurecimento_rls.sql):
-- aquele trigger só compara `status`/`role_id`/`organization_id` entre
-- OLD/NEW. `tema` não entra em nenhuma das três condições — conferido lendo a
-- função, não é suposição.
-- =========================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tema TEXT CHECK (tema IN ('claro', 'escuro'));

COMMENT ON COLUMN public.profiles.tema IS
  'Preferência de tema do produto logado (claro/escuro), escrita só via RPC definir_tema(). NULL = nunca salvou; ver 20260812150000_tema_do_usuario.sql.';

CREATE OR REPLACE FUNCTION public.definir_tema(p_tema TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
-- `pg_temp` obrigatoriamente por último (CLAUDE.md §4.6).
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF p_tema NOT IN ('claro', 'escuro') THEN
    RAISE EXCEPTION 'TEMA_INVALIDO: % nao e "claro" nem "escuro".', p_tema
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.profiles SET tema = p_tema WHERE id = auth.uid();
END;
$$;

COMMENT ON FUNCTION public.definir_tema(TEXT) IS
  'Grava a preferencia de tema (claro/escuro) da PROPRIA sessao (auth.uid()). Unico caminho de escrita de profiles.tema — nao existe policy de self-UPDATE em profiles, de proposito (CLAUDE.md §4 regra 5). Ver 20260812150000_tema_do_usuario.sql.';

REVOKE ALL ON FUNCTION public.definir_tema(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.definir_tema(TEXT) TO authenticated;


-- =========================================================================
-- VERIFICAÇÃO
-- =========================================================================
-- O bloco DO abaixo chama a função de verdade, como usuário autenticado (via
-- `set_config` simulando `auth.uid()`), e falha alto se ela não gravar ou não
-- recusar um valor inválido. Mesmo padrão de 20260812120000_dominios_guard.sql.

DO $verificacao$
DECLARE
  v_user   uuid;
  v_tema   text;
  v_barrou boolean;
BEGIN
  SELECT id INTO v_user FROM public.profiles LIMIT 1;

  IF v_user IS NULL THEN
    RAISE NOTICE 'Sem profile no banco: testes vivos de definir_tema pulados.';
    RETURN;
  END IF;

  -- Simula auth.uid() = v_user para o teste, sem depender de sessão real —
  -- mesma técnica de supabase/tests/endurecimento_rls_test.sql. Sem troca de
  -- ROLE: a função é SECURITY DEFINER, então o UPDATE interno dela já roda
  -- como o dono da função (bypassa RLS por definição); o que falta simular é
  -- só o auth.uid() que ela lê.
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

  -- (1) valor inválido tem de ser recusado
  BEGIN
    PERFORM public.definir_tema('invalido');
    v_barrou := false;
  EXCEPTION WHEN check_violation THEN
    v_barrou := true;
  END;

  IF NOT v_barrou THEN
    RAISE EXCEPTION
      'DEFINIR_TEMA NAO RECUSOU valor invalido — a validacao do enum nao esta ativa.';
  END IF;

  -- (2) valor válido tem de gravar na própria linha
  PERFORM public.definir_tema('escuro');
  SELECT tema INTO v_tema FROM public.profiles WHERE id = v_user;

  IF v_tema IS DISTINCT FROM 'escuro' THEN
    RAISE EXCEPTION
      'DEFINIR_TEMA NAO GRAVOU: profiles.tema ficou "%", esperado "escuro".', v_tema;
  END IF;

  -- Desfaz o efeito colateral do teste (volta ao estado anterior: sem preferência).
  UPDATE public.profiles SET tema = NULL WHERE id = v_user;

  RAISE NOTICE 'Testes vivos de definir_tema: OK (recusa invalido, grava valido).';
END
$verificacao$;

SELECT item, CASE WHEN ok THEN 'OK' ELSE 'FALTANDO' END AS situacao
FROM (VALUES
  ('Coluna profiles.tema existe',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'tema')),

  ('CHECK de tema (claro/escuro) existe',
   EXISTS (SELECT 1 FROM pg_constraint
            WHERE conrelid = 'public.profiles'::regclass
              AND pg_get_constraintdef(oid) ILIKE '%tema%claro%escuro%')),

  ('Funcao definir_tema existe',
   EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'definir_tema')),

  ('Funcao e SECURITY DEFINER',
   coalesce((SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'definir_tema'), false)),

  ('search_path termina em pg_temp',
   coalesce((SELECT array_to_string(p.proconfig, ',') LIKE '%pg_temp'
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'definir_tema'), false)),

  ('anon nao pode executar definir_tema',
   NOT has_function_privilege('anon', 'public.definir_tema(text)', 'EXECUTE'))
) AS t(item, ok)
ORDER BY t.ok, t.item;
