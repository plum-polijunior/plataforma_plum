// =========================================================================
// chat-core — casca WEB do núcleo de conversa
// =========================================================================
// Responsabilidade única desta casca: autenticar o usuário pelo JWT, montar
// o Principal a partir do profile e delegar para chatCore.handle(). Nenhuma
// regra de negócio mora aqui — o WhatsApp terá a sua própria casca chamando
// o mesmo handle().
//
// Segurança: org/role/status vêm SEMPRE do profile no banco (derivado do
// auth.uid() do token verificado), nunca do corpo da requisição.
// =========================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { GeminiBrain } from "../_shared/brain.ts";
import { handle } from "../_shared/chatCore.ts";
import { GoogleSheetCsvConnector } from "../_shared/connectors.ts";
import type { Principal } from "../_shared/rbac.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Usa a chave dedicada GEMINI_API_KEY2 se existir (cota própria, separada do
// playground plum-chat); senão cai na GEMINI_API_KEY compartilhada.
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY2") ??
  Deno.env.get("GEMINI_API_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing_authorization" }, 401);

    // Client vinculado ao JWT do usuário: valida o token e devolve o user.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "invalid_token" }, 401);
    }
    const userId = userData.user.id;

    // Client com service_role para leituras/escritas privilegiadas (ignora RLS;
    // o recorte de segurança é explícito no núcleo/RBAC).
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Principal derivado do profile — a fonte da verdade de org/role/status.
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("id, organization_id, role_id, status, roles(name)")
      .eq("id", userId)
      .maybeSingle();
    if (profErr) throw profErr;
    if (!profile || !profile.organization_id) {
      return json({ error: "sem_organizacao" }, 403);
    }
    if (profile.status !== "ativo") {
      return json({ error: "acesso_pendente", status: profile.status }, 403);
    }

    const principal: Principal = {
      profileId: profile.id as string,
      organizationId: profile.organization_id as string,
      roleId: (profile.role_id as string | null) ?? null,
      roleName:
        (profile as unknown as { roles?: { name?: string } })?.roles?.name ??
        null,
      status: profile.status as string,
    };

    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message : "";
    const conversationId =
      typeof body.conversation_id === "string" ? body.conversation_id : null;
    if (!message.trim()) return json({ error: "empty_message" }, 400);

    const brain = new GeminiBrain(GEMINI_KEY);
    const connector = new GoogleSheetCsvConnector(admin);
    const result = await handle({
      admin,
      brain,
      principal,
      message,
      canal: "web",
      conversationId,
      connector,
    });

    return json({
      conversation_id: result.conversationId,
      answer: result.answer,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro_desconhecido";
    // Erros de autorização de conversa viram 403; o resto, 500.
    const status = msg === "forbidden_conversation" ? 403 : 500;
    console.error("chat-core error:", msg);
    return json({ error: msg }, status);
  }
});
