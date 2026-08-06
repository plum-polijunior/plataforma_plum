


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."chat_canal" AS ENUM (
    'web',
    'whatsapp',
    'email'
);


ALTER TYPE "public"."chat_canal" OWNER TO "postgres";


CREATE TYPE "public"."chat_direcao" AS ENUM (
    'in',
    'out'
);


ALTER TYPE "public"."chat_direcao" OWNER TO "postgres";


CREATE TYPE "public"."profile_status" AS ENUM (
    'pendente',
    'ativo',
    'rejeitado'
);


ALTER TYPE "public"."profile_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auditar_mudanca_perfil"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE
  v_autor UUID := auth.uid();
BEGIN
  IF new.status IS DISTINCT FROM old.status THEN
    INSERT INTO public.profile_changes_audit
        (profile_id, organization_id, changed_by, field, old_value, new_value)
    VALUES (new.id, new.organization_id, v_autor, 'status',
            old.status::text, new.status::text);
  END IF;

  IF new.role_id IS DISTINCT FROM old.role_id THEN
    INSERT INTO public.profile_changes_audit
        (profile_id, organization_id, changed_by, field, old_value, new_value)
    VALUES (new.id, new.organization_id, v_autor, 'role_id',
            old.role_id::text, new.role_id::text);
  END IF;

  IF new.organization_id IS DISTINCT FROM old.organization_id THEN
    INSERT INTO public.profile_changes_audit
        (profile_id, organization_id, changed_by, field, old_value, new_value)
    VALUES (new.id, new.organization_id, v_autor, 'organization_id',
            old.organization_id::text, new.organization_id::text);
  END IF;

  RETURN new;
END;
$$;


ALTER FUNCTION "public"."auditar_mudanca_perfil"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."criar_organizacao"("p_nome" "text") RETURNS TABLE("org_id" "uuid", "org_join_code" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_nome     TEXT := btrim(COALESCE(p_nome, ''));
  v_org_id   UUID;
  v_role_id  UUID;
  v_code     TEXT;
  v_org_atual UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF length(v_nome) < 2 THEN
    RAISE EXCEPTION 'Nome da organizacao invalido' USING ERRCODE = 'check_violation';
  END IF;
  SELECT organization_id INTO v_org_atual FROM public.profiles WHERE id = v_uid;
  IF v_org_atual IS NOT NULL THEN
    RAISE EXCEPTION 'Usuario ja pertence a uma organizacao'
      USING ERRCODE = 'check_violation';
  END IF;
  v_code := public.gerar_join_code();
  INSERT INTO public.organizations (name, join_code, join_mode)
  VALUES (v_nome, v_code, 'codigo')
  RETURNING id INTO v_org_id;
  INSERT INTO public.roles (organization_id, name)
  VALUES (v_org_id, 'Admin')
  RETURNING id INTO v_role_id;
  -- Quem cria a organizacao e o dono dela: unico caso de 'ativo' na criacao.
  UPDATE public.profiles
     SET organization_id = v_org_id,
         role_id         = v_role_id,
         status          = 'ativo'
   WHERE id = v_uid;
  INSERT INTO public.domain_binding_audit
      (user_id, email_domain, organization_id, signal, result)
  VALUES (v_uid, NULL, v_org_id, 'admin_setup', 'org_created');
  RETURN QUERY SELECT v_org_id, v_code;
END;
$$;


ALTER FUNCTION "public"."criar_organizacao"("p_nome" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_org_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE
  v_claim TEXT;
  v_org   UUID;
BEGIN
  v_claim := nullif(auth.jwt() ->> 'organization_id', '');
  IF v_claim IS NOT NULL THEN
    RETURN v_claim::uuid;
  END IF;

  SELECT organization_id INTO v_org FROM public.profiles WHERE id = auth.uid();
  RETURN v_org;
END;
$$;


ALTER FUNCTION "public"."current_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_profile_status"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE
  v_claim  TEXT;
  v_status TEXT;
BEGIN
  v_claim := nullif(auth.jwt() ->> 'profile_status', '');
  IF v_claim IS NOT NULL THEN
    RETURN v_claim;
  END IF;

  SELECT status::text INTO v_status FROM public.profiles WHERE id = auth.uid();
  RETURN v_status;
END;
$$;


ALTER FUNCTION "public"."current_profile_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."custom_access_token_hook"("event" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_claims JSONB;
  v_row    RECORD;
BEGIN
  v_claims := COALESCE(event -> 'claims', '{}'::jsonb);

  SELECT p.organization_id, p.role_id, p.status::text AS status, r.name AS role_name
    INTO v_row
  FROM public.profiles p
  LEFT JOIN public.roles r ON r.id = p.role_id
  WHERE p.id = (event ->> 'user_id')::uuid;

  IF FOUND THEN
    v_claims := jsonb_set(v_claims, '{organization_id}',
                          COALESCE(to_jsonb(v_row.organization_id::text), 'null'::jsonb));
    v_claims := jsonb_set(v_claims, '{profile_status}', to_jsonb(v_row.status));
    v_claims := jsonb_set(v_claims, '{role_id}',
                          COALESCE(to_jsonb(v_row.role_id::text), 'null'::jsonb));
    v_claims := jsonb_set(v_claims, '{role_name}',
                          COALESCE(to_jsonb(v_row.role_name), 'null'::jsonb));
  ELSE
    -- Usuário sem perfil: claims explicitamente nulas.
    v_claims := jsonb_set(v_claims, '{organization_id}', 'null'::jsonb);
    v_claims := jsonb_set(v_claims, '{profile_status}', '"sem_org"'::jsonb);
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;


ALTER FUNCTION "public"."custom_access_token_hook"("event" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gerar_join_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  c_alfabeto CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes    BYTEA;
  v_code     TEXT := '';
  i          INT;
BEGIN
  LOOP
    v_bytes := gen_random_bytes(12);
    v_code  := '';
    FOR i IN 0..11 LOOP
      v_code := v_code || substr(c_alfabeto, 1 + (get_byte(v_bytes, i) % 32), 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.organizations WHERE join_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;


ALTER FUNCTION "public"."gerar_join_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_org_id"() RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_user_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE
  v_meta      JSONB := COALESCE(new.raw_user_meta_data, '{}'::jsonb);
  v_app_meta  JSONB := COALESCE(new.raw_app_meta_data, '{}'::jsonb);
  v_org_id    UUID;
  v_google_hd TEXT;
  v_ms_tid    TEXT;
  v_codigo    TEXT;
  v_res       RECORD;
  v_signal    TEXT := 'email_domain';
  v_result    TEXT := 'no_match';
  v_dominio   TEXT;
BEGIN
  v_google_hd := COALESCE(v_meta ->> 'hd',  v_app_meta ->> 'hd');
  v_ms_tid    := COALESCE(v_meta ->> 'tid', v_app_meta ->> 'tid');
  v_dominio   := nullif(split_part(lower(btrim(COALESCE(new.email, ''))), '@', 2), '');
  -- ---------------------------------------------------------------------
  -- PORTA 1 — código de convite (organizações com join_mode = 'codigo').
  -- O código é um segredo portador digitado pelo usuário, não uma
  -- declaração de identidade: legítimo vir do cliente. `status` e
  -- `join_mode` continuam sendo decisão exclusiva do servidor.
  -- ---------------------------------------------------------------------
  v_codigo := upper(btrim(COALESCE(
      nullif(v_meta ->> 'join_code', '')
  )));
  IF v_codigo IS NOT NULL AND v_codigo <> '' THEN
    SELECT id INTO v_org_id
    FROM public.organizations
    WHERE join_mode = 'codigo'
      AND (join_code = v_codigo OR join_code = v_codigo)
    LIMIT 1;
    IF v_org_id IS NOT NULL THEN
      v_signal := 'join_code';
      v_result := 'bound';
    END IF;
  END IF;
  -- ---------------------------------------------------------------------
  -- PORTA 2 — roteamento por domínio (organizações com join_mode='dominio').
  -- ---------------------------------------------------------------------
  IF v_org_id IS NULL THEN
    SELECT * INTO v_res
    FROM public.resolve_org_from_identity(new.email, v_google_hd, v_ms_tid);
    v_signal := v_res.o_signal;
    v_result := v_res.o_result;
    IF v_res.o_org_id IS NOT NULL THEN
      -- Só roteia se a organização estiver realmente em modo domínio.
      IF EXISTS (SELECT 1 FROM public.organizations
                  WHERE id = v_res.o_org_id AND join_mode = 'dominio') THEN
        v_org_id := v_res.o_org_id;
      ELSE
        v_result := 'modo_incompativel';
      END IF;
    END IF;
  END IF;
  -- Sem org resolvida ⇒ perfil sem organização (estado de pendência).
  -- status SEMPRE 'pendente'. Nunca lido do cliente.
  INSERT INTO public.profiles (id, email, organization_id, status)
  VALUES (new.id, new.email, v_org_id, 'pendente')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.domain_binding_audit
      (user_id, email_domain, organization_id, signal, result)
  VALUES (new.id, v_dominio, v_org_id, v_signal, v_result);
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_member"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ SELECT public.current_profile_status() = 'ativo' $$;


ALTER FUNCTION "public"."is_active_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_admin"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE v_ok BOOLEAN;
BEGIN
  SELECT (p.status::text = 'ativo' AND lower(btrim(r.name)) = 'admin')
    INTO v_ok
  FROM public.profiles p
  LEFT JOIN public.roles r ON r.id = p.role_id
  WHERE p.id = auth.uid();
  RETURN COALESCE(v_ok, false);
END;
$$;


ALTER FUNCTION "public"."is_org_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_org_from_identity"("p_email" "text", "p_google_hd" "text" DEFAULT NULL::"text", "p_ms_tid" "text" DEFAULT NULL::"text", OUT "o_org_id" "uuid", OUT "o_domain" "text", OUT "o_signal" "text", OUT "o_result" "text") RETURNS "record"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_domain TEXT;
BEGIN
  o_org_id := NULL;

  -- Domínio candidato: hd do Google tem prioridade sobre o parsing do e-mail.
  v_domain := lower(btrim(COALESCE(
      nullif(p_google_hd, ''),
      split_part(lower(btrim(COALESCE(p_email, ''))), '@', 2)
  )));
  o_domain := nullif(v_domain, '');

  IF o_domain IS NULL THEN
    o_signal := 'email_domain';
    o_result := 'no_email';
    RETURN;
  END IF;

  -- 1) Denylist ANTES do lookup (não-negociável).
  IF EXISTS (SELECT 1 FROM public.public_email_domains WHERE domain = o_domain) THEN
    o_signal := CASE WHEN nullif(p_google_hd,'') IS NOT NULL THEN 'google_hd' ELSE 'email_domain' END;
    o_result := 'denylisted';
    RETURN;
  END IF;

  -- 2) Sinal forte: tenant id da Microsoft.
  IF nullif(p_ms_tid, '') IS NOT NULL THEN
    SELECT od.organization_id INTO o_org_id
    FROM public.organization_domains od
    WHERE od.ms_tenant_id = p_ms_tid AND od.verified = true
    LIMIT 1;

    IF o_org_id IS NOT NULL THEN
      o_signal := 'ms_tid';
      o_result := 'bound';
      RETURN;
    END IF;
  END IF;

  -- 3) Lookup por domínio verificado.
  SELECT od.organization_id INTO o_org_id
  FROM public.organization_domains od
  WHERE od.domain = o_domain AND od.verified = true
  LIMIT 1;

  o_signal := CASE WHEN nullif(p_google_hd,'') IS NOT NULL THEN 'google_hd' ELSE 'email_domain' END;

  IF o_org_id IS NOT NULL THEN
    o_result := 'bound';
  ELSIF EXISTS (SELECT 1 FROM public.organization_domains WHERE domain = o_domain) THEN
    -- Cadastrado porém verified = false ⇒ NÃO roteia.
    o_result := 'unverified_domain';
  ELSE
    o_result := 'no_match';
  END IF;
END;
$$;


ALTER FUNCTION "public"."resolve_org_from_identity"("p_email" "text", "p_google_hd" "text", "p_ms_tid" "text", OUT "o_org_id" "uuid", OUT "o_domain" "text", OUT "o_signal" "text", OUT "o_result" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolver_codigo_organizacao"("p_codigo" "text") RETURNS TABLE("org_id" "uuid", "org_name" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_codigo TEXT := upper(btrim(COALESCE(p_codigo, '')));
BEGIN
  IF length(v_codigo) < 4 THEN
    RETURN;   -- nada encontrado; nao vaza se existe ou nao
  END IF;
  RETURN QUERY
  SELECT o.id, o.name
  FROM public.organizations o
  WHERE o.join_mode = 'codigo'
    AND o.join_code = v_codigo
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."resolver_codigo_organizacao"("p_codigo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tocar_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  new.updated_at := timezone('utc', now());
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."tocar_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."Leads" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "Nome" "text",
    "Telefone" "text",
    "Email" "text"
);


ALTER TABLE "public"."Leads" OWNER TO "postgres";


ALTER TABLE "public"."Leads" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Leads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."assistants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "persona" "text",
    "system_prompt" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."assistants" OWNER TO "postgres";


COMMENT ON TABLE "public"."assistants" IS 'Persona/configuração de um chatbot por organização. Os dados/dicionário vêm de datasets; aqui fica só o tom/instrução do bot.';



CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "assistant_id" "uuid",
    "title" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


COMMENT ON TABLE "public"."conversations" IS 'Thread de conversa pertencente a um único profile dentro de uma organização.';



CREATE TABLE IF NOT EXISTS "public"."datasets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "name" "text" NOT NULL,
    "google_sheet_id" "text",
    "schema_metadata" "jsonb",
    "status" "text" DEFAULT 'processing'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "sketch" "jsonb"
);


ALTER TABLE "public"."datasets" OWNER TO "postgres";


COMMENT ON COLUMN "public"."datasets"."sketch" IS 'Rascunho do pipeline de importacao: passo atual, colunas originais e normalizadas, amostras. Limpo (NULL) quando o dataset e finalizado.';



CREATE TABLE IF NOT EXISTS "public"."domain_binding_audit" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "email_domain" "text",
    "organization_id" "uuid",
    "signal" "text" NOT NULL,
    "result" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."domain_binding_audit" OWNER TO "postgres";


COMMENT ON COLUMN "public"."domain_binding_audit"."signal" IS 'ms_tid | google_hd | email_domain | share_id | admin_setup';



COMMENT ON COLUMN "public"."domain_binding_audit"."result" IS 'bound | denylisted | no_match | unverified_domain | no_email | org_created';



CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "canal" "public"."chat_canal" DEFAULT 'web'::"public"."chat_canal" NOT NULL,
    "direcao" "public"."chat_direcao" NOT NULL,
    "content" "text" NOT NULL,
    "meta" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."messages" IS 'Mensagens de todas as conversas e canais. meta guarda plano DSL/colunas usadas/debug.';



COMMENT ON COLUMN "public"."messages"."canal" IS 'Canal de origem/destino. web hoje; whatsapp/email plugam depois sem mudar schema.';



CREATE TABLE IF NOT EXISTS "public"."organization_domains" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "domain" "text" NOT NULL,
    "verified" boolean DEFAULT false NOT NULL,
    "verification_method" "text",
    "verified_at" timestamp with time zone,
    "verified_by" "uuid",
    "ms_tenant_id" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "organization_domains_domain_lowercase" CHECK (("domain" = "lower"("btrim"("domain")))),
    CONSTRAINT "organization_domains_verification_method_check" CHECK (("verification_method" = ANY (ARRAY['admin'::"text", 'dns_txt'::"text"]))),
    CONSTRAINT "organization_domains_verified_coerente" CHECK ((("verified" = false) OR ("verification_method" IS NOT NULL)))
);


ALTER TABLE "public"."organization_domains" OWNER TO "postgres";


COMMENT ON TABLE "public"."organization_domains" IS 'Domínios de e-mail corporativo que roteiam para uma organização. Só verified=true roteia.';



COMMENT ON COLUMN "public"."organization_domains"."verification_method" IS 'admin = verificação administrativa (MVP). dns_txt = reservado para verificação por DNS (futuro, sem migration).';



COMMENT ON COLUMN "public"."organization_domains"."ms_tenant_id" IS 'Tenant ID do Microsoft Entra ID (claim `tid`). Sinal forte, preferido ao parsing de e-mail.';



CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "join_mode" "text" DEFAULT 'codigo'::"text" NOT NULL,
    "join_code" "text",
    CONSTRAINT "organizations_join_mode_check" CHECK (("join_mode" = ANY (ARRAY['codigo'::"text", 'dominio'::"text"])))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."organizations"."join_mode" IS 'Como novos membros entram: share_id = codigo de convite; dominio = roteamento por dominio verificado. Definido APENAS server-side, por admin da org.';



COMMENT ON COLUMN "public"."organizations"."join_code" IS 'Codigo de convite de 12 caracteres, aleatorio criptografico. Substitui o share_id de 4 chars, que fica preenchido por compatibilidade (D-09).';



CREATE TABLE IF NOT EXISTS "public"."profile_changes_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "changed_by" "uuid",
    "field" "text" NOT NULL,
    "old_value" "text",
    "new_value" "text",
    "changed_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."profile_changes_audit" OWNER TO "postgres";


COMMENT ON TABLE "public"."profile_changes_audit" IS 'Append-only. Registra alteracoes de status, role_id e organization_id em profiles: quem, o que, de -> para, quando.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "organization_id" "uuid",
    "role_id" "uuid",
    "status" "public"."profile_status" DEFAULT 'pendente'::"public"."profile_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."public_email_domains" (
    "domain" "text" NOT NULL
);


ALTER TABLE "public"."public_email_domains" OWNER TO "postgres";


COMMENT ON TABLE "public"."public_email_domains" IS 'Denylist versionada: domínios de provedores públicos que NUNCA viram domínio de organização.';



CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "dataset_id" "uuid" NOT NULL,
    "allowed_columns" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."role_permissions" IS 'Armazena permissões de acesso por cargo (role) e base (dataset), incluindo a lista exata das colunas liberadas (allowed_columns).';



CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."Leads"
    ADD CONSTRAINT "Leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assistants"
    ADD CONSTRAINT "assistants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."datasets"
    ADD CONSTRAINT "datasets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."domain_binding_audit"
    ADD CONSTRAINT "domain_binding_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_domains"
    ADD CONSTRAINT "organization_domains_domain_key" UNIQUE ("domain");



ALTER TABLE ONLY "public"."organization_domains"
    ADD CONSTRAINT "organization_domains_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_join_code_key" UNIQUE ("join_code");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_changes_audit"
    ADD CONSTRAINT "profile_changes_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."public_email_domains"
    ADD CONSTRAINT "public_email_domains_pkey" PRIMARY KEY ("domain");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "unique_role_dataset" UNIQUE ("role_id", "dataset_id");



CREATE INDEX "assistants_org_idx" ON "public"."assistants" USING "btree" ("organization_id");



CREATE INDEX "conversations_owner_idx" ON "public"."conversations" USING "btree" ("profile_id", "updated_at" DESC);



CREATE INDEX "idx_audit_org" ON "public"."domain_binding_audit" USING "btree" ("organization_id");



CREATE INDEX "idx_audit_user" ON "public"."domain_binding_audit" USING "btree" ("user_id");



CREATE INDEX "idx_org_domains_lookup" ON "public"."organization_domains" USING "btree" ("domain") WHERE ("verified" = true);



CREATE INDEX "idx_org_domains_ms_tenant" ON "public"."organization_domains" USING "btree" ("ms_tenant_id") WHERE (("verified" = true) AND ("ms_tenant_id" IS NOT NULL));



CREATE INDEX "idx_org_domains_org" ON "public"."organization_domains" USING "btree" ("organization_id");



CREATE INDEX "idx_pca_org" ON "public"."profile_changes_audit" USING "btree" ("organization_id");



CREATE INDEX "idx_pca_profile" ON "public"."profile_changes_audit" USING "btree" ("profile_id");



CREATE INDEX "messages_conversation_idx" ON "public"."messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "messages_owner_idx" ON "public"."messages" USING "btree" ("profile_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "trg_conversations_updated_at" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_profiles_audit" AFTER UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."auditar_mudanca_perfil"();



CREATE OR REPLACE TRIGGER "trg_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."tocar_updated_at"();



ALTER TABLE ONLY "public"."assistants"
    ADD CONSTRAINT "assistants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_assistant_id_fkey" FOREIGN KEY ("assistant_id") REFERENCES "public"."assistants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."datasets"
    ADD CONSTRAINT "datasets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_domains"
    ADD CONSTRAINT "organization_domains_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_domains"
    ADD CONSTRAINT "organization_domains_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



CREATE POLICY "Allow anon insert on Leads" ON "public"."Leads" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anyone to insert organizations" ON "public"."organizations" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow authenticated all on Leads" ON "public"."Leads" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."Leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin atualiza a propria org" ON "public"."organizations" FOR UPDATE TO "authenticated" USING ((("id" = "public"."current_org_id"()) AND "public"."is_org_admin"())) WITH CHECK (("id" = "public"."current_org_id"()));



CREATE POLICY "admin gerencia cargos" ON "public"."roles" TO "authenticated" USING ((("organization_id" = "public"."current_org_id"()) AND "public"."is_org_admin"())) WITH CHECK ((("organization_id" = "public"."current_org_id"()) AND "public"."is_org_admin"()));



CREATE POLICY "admin gerencia datasets" ON "public"."datasets" TO "authenticated" USING ((("organization_id" = "public"."current_org_id"()) AND "public"."is_org_admin"())) WITH CHECK ((("organization_id" = "public"."current_org_id"()) AND "public"."is_org_admin"()));



CREATE POLICY "admin gerencia dominios" ON "public"."organization_domains" TO "authenticated" USING ((("organization_id" = "public"."current_org_id"()) AND "public"."is_org_admin"())) WITH CHECK ((("organization_id" = "public"."current_org_id"()) AND "public"."is_org_admin"()));



CREATE POLICY "admin gerencia perfis da org" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."current_org_id"()) AND "public"."is_org_admin"() AND ("id" <> "auth"."uid"()))) WITH CHECK (("organization_id" = "public"."current_org_id"()));



CREATE POLICY "admin gerencia permissoes" ON "public"."role_permissions" TO "authenticated" USING ((("organization_id" = "public"."current_org_id"()) AND "public"."is_org_admin"())) WITH CHECK ((("organization_id" = "public"."current_org_id"()) AND "public"."is_org_admin"()));



CREATE POLICY "admin le auditoria" ON "public"."domain_binding_audit" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."current_org_id"()) AND "public"."is_org_admin"()));



CREATE POLICY "admin le auditoria de perfis" ON "public"."profile_changes_audit" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."current_org_id"()) AND "public"."is_org_admin"()));



ALTER TABLE "public"."assistants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assistants_admin_write" ON "public"."assistants" USING ((("organization_id" = "public"."current_org_id"()) AND "public"."is_org_admin"())) WITH CHECK ((("organization_id" = "public"."current_org_id"()) AND "public"."is_org_admin"()));



CREATE POLICY "assistants_select_org" ON "public"."assistants" FOR SELECT USING ((("organization_id" = "public"."current_org_id"()) AND "public"."is_active_member"()));



CREATE POLICY "auth_admin_le_profiles" ON "public"."profiles" FOR SELECT TO "supabase_auth_admin" USING (true);



CREATE POLICY "auth_admin_le_roles" ON "public"."roles" FOR SELECT TO "supabase_auth_admin" USING (true);



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_select_own" ON "public"."conversations" FOR SELECT USING ((("profile_id" = "auth"."uid"()) AND ("organization_id" = "public"."current_org_id"()) AND "public"."is_active_member"()));



ALTER TABLE "public"."datasets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "denylist leitura" ON "public"."public_email_domains" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."domain_binding_audit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "membro ativo ve datasets da org" ON "public"."datasets" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."current_org_id"()) AND "public"."is_active_member"()));



CREATE POLICY "membro ativo ve perfis da org" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("organization_id" IS NOT NULL) AND ("organization_id" = "public"."current_org_id"()) AND "public"."is_active_member"()));



CREATE POLICY "membro ativo ve permissoes da org" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."current_org_id"()) AND "public"."is_active_member"()));



CREATE POLICY "membro ve a propria org" ON "public"."organizations" FOR SELECT TO "authenticated" USING (("id" = "public"."current_org_id"()));



CREATE POLICY "membros veem cargos da org" ON "public"."roles" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."current_org_id"()));



CREATE POLICY "membros veem dominios da org" ON "public"."organization_domains" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."current_org_id"()));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_select_own" ON "public"."messages" FOR SELECT USING ((("profile_id" = "auth"."uid"()) AND ("organization_id" = "public"."current_org_id"()) AND "public"."is_active_member"()));



ALTER TABLE "public"."organization_domains" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_changes_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."public_email_domains" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "usuario ve o proprio perfil" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "supabase_auth_admin";






















































































































































REVOKE ALL ON FUNCTION "public"."criar_organizacao"("p_nome" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."criar_organizacao"("p_nome" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "supabase_auth_admin";



REVOKE ALL ON FUNCTION "public"."resolver_codigo_organizacao"("p_codigo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolver_codigo_organizacao"("p_codigo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolver_codigo_organizacao"("p_codigo" "text") TO "authenticated";


















GRANT INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."Leads" TO "anon";
GRANT ALL ON TABLE "public"."Leads" TO "authenticated";
GRANT ALL ON TABLE "public"."Leads" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."assistants" TO "anon";
GRANT ALL ON TABLE "public"."assistants" TO "authenticated";
GRANT ALL ON TABLE "public"."assistants" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."conversations" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."datasets" TO "authenticated";
GRANT ALL ON TABLE "public"."datasets" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."domain_binding_audit" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."domain_binding_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."domain_binding_audit" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."messages" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organization_domains" TO "anon";
GRANT ALL ON TABLE "public"."organization_domains" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_domains" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."profile_changes_audit" TO "service_role";
GRANT SELECT ON TABLE "public"."profile_changes_audit" TO "authenticated";



GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "supabase_auth_admin";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."public_email_domains" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."public_email_domains" TO "authenticated";
GRANT ALL ON TABLE "public"."public_email_domains" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";
GRANT SELECT ON TABLE "public"."roles" TO "supabase_auth_admin";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";



































