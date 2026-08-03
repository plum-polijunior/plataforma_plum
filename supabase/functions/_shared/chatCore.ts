// =========================================================================
// CHAT CORE — núcleo channel-agnostic da conversa
// =========================================================================
// Uma única função de orquestração usada por TODOS os canais. Hoje é chamada
// pela casca web (chat-core/index.ts). Amanhã, o webhook do WhatsApp resolve
// o Principal por telefone e chama ESTA MESMA função — sem reescrita.
//
// Passos: persiste entrada -> resolve RBAC -> monta contexto -> chama cérebro
//         -> persiste saída. Toda escrita usa service_role (single-writer).
// =========================================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { type Brain } from "./brain.ts";
import { type Principal, resolveAllowedSchema } from "./rbac.ts";

export interface HandleInput {
  admin: SupabaseClient;
  brain: Brain;
  principal: Principal;
  message: string;
  canal: "web" | "whatsapp" | "email";
  conversationId?: string | null;
}

export interface HandleResult {
  conversationId: string;
  answer: string;
}

const MAX_TITLE = 80;

/** Garante uma conversa válida e pertencente ao principal; cria se preciso. */
async function ensureConversation(
  admin: SupabaseClient,
  principal: Principal,
  message: string,
  conversationId?: string | null,
): Promise<string> {
  if (conversationId) {
    const { data, error } = await admin
      .from("conversations")
      .select("id, profile_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.profile_id !== principal.profileId) {
      throw new Error("forbidden_conversation");
    }
    return conversationId;
  }

  const title = message.trim().slice(0, MAX_TITLE);
  const { data, error } = await admin
    .from("conversations")
    .insert({
      organization_id: principal.organizationId,
      profile_id: principal.profileId,
      title,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function loadHistory(admin: SupabaseClient, conversationId: string) {
  const { data, error } = await admin
    .from("messages")
    .select("direcao, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(24);
  if (error) throw error;
  return (data ?? []).map((m) => ({
    direcao: m.direcao as "in" | "out",
    content: m.content as string,
  }));
}

async function insertMessage(
  admin: SupabaseClient,
  principal: Principal,
  conversationId: string,
  canal: HandleInput["canal"],
  direcao: "in" | "out",
  content: string,
  meta?: Record<string, unknown>,
) {
  const { error } = await admin.from("messages").insert({
    conversation_id: conversationId,
    organization_id: principal.organizationId,
    profile_id: principal.profileId,
    canal,
    direcao,
    content,
    meta: meta ?? null,
  });
  if (error) throw error;
}

export async function handle(input: HandleInput): Promise<HandleResult> {
  const { admin, brain, principal, canal } = input;
  const message = (input.message ?? "").trim();
  if (!message) throw new Error("empty_message");
  if (principal.status !== "ativo") throw new Error("inactive_profile");

  const conversationId = await ensureConversation(
    admin,
    principal,
    message,
    input.conversationId,
  );

  // Persiste a entrada ANTES de resolver — histórico fiel mesmo se o cérebro falhar.
  await insertMessage(admin, principal, conversationId, canal, "in", message);

  const history = await loadHistory(admin, conversationId);

  // Enforcement de RBAC: o cérebro só recebe o que o cargo pode ver.
  const allowedSchema = await resolveAllowedSchema(admin, principal);

  const { text, meta } = await brain.answer({
    message,
    allowedSchema,
    // O histórico já inclui a mensagem atual (foi inserida acima); remove-a do contexto.
    history: history.slice(0, -1),
  });

  await insertMessage(admin, principal, conversationId, canal, "out", text, {
    ...meta,
    canal,
  });

  // Bump em updated_at para a conversa subir na lista (ordenada por updated_at).
  await admin
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("profile_id", principal.profileId);

  return { conversationId, answer: text };
}
