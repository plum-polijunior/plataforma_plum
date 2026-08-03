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
import { type DataConnector } from "./connectors.ts";

export interface HandleInput {
  admin: SupabaseClient;
  brain: Brain;
  principal: Principal;
  message: string;
  canal: "web" | "whatsapp" | "email";
  conversationId?: string | null;
  /** Conector opcional; se ausente, o cérebro responde só pela semântica. */
  connector?: DataConnector | null;
}

/** Teto total de linhas enviadas ao cérebro numa consulta (custo/latência). */
const MAX_TOTAL_ROWS = 600;

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

  // Busca as linhas reais (só das bases/colunas permitidas), se houver conector.
  // Best-effort: falha de uma base não derruba a resposta — vira nota de diagnóstico.
  let data: Record<string, unknown[]> | null = null;
  const dataNotes: string[] = [];
  if (input.connector && allowedSchema.length > 0) {
    data = {};
    let total = 0;
    for (const ds of allowedSchema) {
      if (total >= MAX_TOTAL_ROWS) {
        dataNotes.push(`Base "${ds.name}" não carregada (limite de ${MAX_TOTAL_ROWS} linhas atingido).`);
        continue;
      }
      try {
        const cols = ds.columns.map((c) => c.name);
        const res = await input.connector.fetchRows(ds.datasetId, cols);
        data[ds.name] = res.rows;
        total += res.rows.length;
        if (res.rows.length === 0) {
          dataNotes.push(`Base "${ds.name}" sem dados conectados (respondendo só pela estrutura).`);
        }
        if (res.truncated) {
          dataNotes.push(`Base "${ds.name}" truncada em ${res.rows.length} linhas (amostra).`);
        }
        if (res.missingColumns.length > 0) {
          dataNotes.push(`Base "${ds.name}": colunas sem dados na fonte: ${res.missingColumns.join(", ")}.`);
        }
      } catch (e) {
        const m = e instanceof Error ? e.message : "erro";
        dataNotes.push(`Base "${ds.name}" indisponível (${m}).`);
      }
    }
  }

  const { text, meta } = await brain.answer({
    message,
    allowedSchema,
    // O histórico já inclui a mensagem atual (foi inserida acima); remove-a do contexto.
    history: history.slice(0, -1),
    data,
    dataNotes,
  });

  await insertMessage(admin, principal, conversationId, canal, "out", text, {
    ...meta,
    canal,
    dataNotes: dataNotes.length > 0 ? dataNotes : undefined,
  });

  // Bump em updated_at para a conversa subir na lista (ordenada por updated_at).
  await admin
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("profile_id", principal.profileId);

  return { conversationId, answer: text };
}
