/**
 * chat-execute — a peça que decide, para o caminho do chat.
 *
 * Irmã de `dashboard-execute`. Mesma responsabilidade, mesma ordem de
 * verificações; o que muda é a forma: o dashboard manda N cards de uma vez e
 * guarda snapshot, o chat manda UM plano e não guarda nada (a resposta é de
 * uma pergunta só, feita agora).
 *
 * POR QUE UMA FUNÇÃO NOVA, e não uma `action` dentro de `ai-plum-chat`:
 *
 * `ai-plum-chat` é colada à mão no painel do Supabase e por isso não pode
 * importar `_shared/query_plan.ts`. Colocar a autorização lá significaria uma
 * segunda cópia de `authorizePlan` — e o comentário no topo de `query_plan.ts`
 * é explícito sobre isso: dois interpretadores em dois lugares concordam nos
 * casos simples e divergem num aninhamento, e quando duas travas discordam
 * quem passa é a mais frouxa. É assim que um bypass nasce.
 *
 * Um interpretador. Aqui, testado por vitest.
 *
 * ORDEM DAS VERIFICAÇÕES (nenhuma pode ser reordenada sem pensar):
 *
 *   1. JWT válido, perfil ativo, cargo definido.
 *   2. O dataset pertence à organização do usuário.
 *   3. allowed_columns do cargo para aquele dataset.
 *   4. Extrair colunas do plano e conferir contra allowed_columns.
 *   5. Papéis de coluna a partir do contrato de formatação.
 *   6. Só então o payload assinado vai para o executor.
 *
 * O k-anonimato NÃO é relaxado aqui. Uma pergunta de chat que devolveria um
 * grupo com menos de k linhas é a mesma exposição que um card faria — trocar o
 * envelope não muda o dado. Se o executor recusar por falta de agregação, o
 * Agente C recebe o erro e explica; ele nunca inventa o número.
 *
 * Deploy: `supabase functions deploy chat-execute`.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

import {
  authorizePlan,
  papeisDeColuna,
  signPayload,
  type QueryPlan,
} from "../_shared/query_plan.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXECUTOR_URL = Deno.env.get("PLUM_EXECUTOR_URL")!;
const EXECUTOR_HMAC_SECRET = Deno.env.get("PLUM_EXECUTOR_HMAC_SECRET")!;
const AWS_REGION = Deno.env.get("PLUM_AWS_REGION") ?? "sa-east-1";
const AWS_ACCESS_KEY_ID = Deno.env.get("PLUM_AWS_ACCESS_KEY_ID")!;
const AWS_SECRET_ACCESS_KEY = Deno.env.get("PLUM_AWS_SECRET_ACCESS_KEY")!;

const EXECUTOR_TIMEOUT_MS = 20_000;
const CARD_ID_CHAT = "chat";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "sem credencial" }, 401);

  // Cliente com o JWT do usuário: toda leitura abaixo passa por RLS. Não usar
  // service role aqui é deliberado — se usássemos, um bug de filtro viraria
  // vazamento entre organizações em vez de resultado vazio.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  // ── 1. Quem é ──────────────────────────────────────────────────────────────
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return json({ error: "sessao invalida" }, 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role_id, status")
    .eq("id", auth.user.id)
    .single();

  if (!profile?.organization_id) return json({ error: "perfil sem organizacao" }, 403);
  if (profile.status !== "ativo") return json({ error: "perfil nao ativo" }, 403);
  if (!profile.role_id) {
    // "sem permissão" nunca pode ser interpretado como "todas as permissões".
    return json({ error: "seu usuario ainda nao tem um cargo definido" }, 403);
  }

  let body: { dataset_id?: string; plan?: QueryPlan };
  try {
    body = await req.json();
  } catch {
    return json({ error: "corpo invalido" }, 400);
  }
  if (!body.dataset_id) return json({ error: "dataset_id obrigatorio" }, 400);
  if (!body.plan || typeof body.plan !== "object") {
    return json({ error: "plan obrigatorio" }, 400);
  }
  const plano: QueryPlan = body.plan;

  // ── 2. O dataset é desta organização? ──────────────────────────────────────
  const { data: dataset } = await supabase
    .from("datasets")
    .select(
      "id, organization_id, google_sheet_id, google_sheet_tab, schema_metadata, formatting_contract",
    )
    .eq("id", body.dataset_id)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  if (!dataset) return json({ error: "base nao encontrada" }, 403);
  if (!dataset.google_sheet_id) {
    return json(
      { error: "Esta base precisa ser reconectada: falta o link da planilha." },
      409,
    );
  }

  // ── 3. O que este cargo enxerga nesta base ─────────────────────────────────
  const { data: perm } = await supabase
    .from("role_permissions")
    .select("allowed_columns")
    .eq("role_id", profile.role_id)
    .eq("dataset_id", dataset.id)
    .maybeSingle();

  const allowedColumns: string[] = perm?.allowed_columns ?? [];
  if (allowedColumns.length === 0) {
    return json({ error: "seu cargo nao tem acesso a esta base" }, 403);
  }

  // ── 4. O plano cabe na permissão? ──────────────────────────────────────────
  const veredito = authorizePlan(plano, allowedColumns);
  if (!veredito.allowed) {
    // Recusa, nunca filtra em silêncio: tirar uma coluna do `where` mudaria o
    // significado do número, e o Agente C apresentaria o resultado errado com
    // a mesma confiança do certo.
    return json(
      { error: "Sua pergunta usa uma coluna que o seu cargo nao pode ver." },
      403,
    );
  }

  const requiredColumns = new Set(veredito.required);
  if (requiredColumns.size === 0) {
    return json({ error: "o plano nao referencia nenhuma coluna" }, 400);
  }

  // ── 5. Papéis de coluna ────────────────────────────────────────────────────
  const { roles: columnRoles, legado } = papeisDeColuna(
    dataset.schema_metadata,
    dataset.formatting_contract,
    requiredColumns,
  );

  if (legado.length) {
    console.warn(
      `[chat-execute] dataset ${dataset.id}: ${legado.length} coluna(s) sem contrato de ` +
        `formatacao, papel adivinhado por palavra-chave: ${legado.join(", ")}. ` +
        `Reprocesse a formatacao desta base em /cfgdatabase.`,
    );
  }

  // ── 6. Executor ────────────────────────────────────────────────────────────
  const { data: org } = await supabase
    .from("organizations")
    .select("dashboard_k_min, dashboard_max_rows")
    .eq("id", profile.organization_id)
    .maybeSingle();

  const payload = {
    sheet_id: dataset.google_sheet_id,
    tab: dataset.google_sheet_tab ?? "Sheet1",
    plans: [{
      card_id: CARD_ID_CHAT,
      plan: plano,
      resolved_columns: veredito.required,
    }],
    allowed_columns: allowedColumns,
    column_roles: columnRoles,
    k_min: org?.dashboard_k_min ?? 5,
    max_rows: org?.dashboard_max_rows ?? 200_000,
    issued_at: Math.floor(Date.now() / 1000),
  };

  const raw = JSON.stringify(payload);
  const assinatura = await signPayload(raw, EXECUTOR_HMAC_SECRET);

  // SigV4 fecha o endpoint na infraestrutura: o Function URL está em AWS_IAM,
  // então sem esta credencial a requisição nem chega ao código Python. O HMAC
  // acima usa OUTRO segredo, então vazar um dos dois não basta.
  const aws = new AwsClient({
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    region: AWS_REGION,
    service: "lambda",
  });

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), EXECUTOR_TIMEOUT_MS);
    const resp = await aws.fetch(`${EXECUTOR_URL}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Plum-Signature": assinatura },
      body: raw,
      signal: controller.signal,
    });
    clearTimeout(t);

    if (!resp.ok) throw new Error(`executor respondeu ${resp.status}`);

    const resultado = ((await resp.json()).results ?? [])[0];
    if (!resultado) throw new Error("executor nao devolveu resultado");

    if (resultado.status !== "ok") {
      // Não há snapshot para degradar como no dashboard: a pergunta é nova.
      // Devolver o erro é o comportamento certo — o Agente C explica que não
      // conseguiu calcular, em vez de receber um vetor vazio e inventar.
      return json({ error: resultado.error ?? "nao foi possivel calcular" }, 422);
    }

    return json({
      result: {
        columns: resultado.columns ?? [],
        rows: resultado.rows ?? [],
        row_count: resultado.row_count ?? 0,
        suppressed_groups: resultado.suppressed_groups ?? 0,
      },
    });
  } catch (err) {
    console.error("Executor indisponivel:", err);
    return json(
      { error: "Nao consegui calcular agora. Tente de novo em instantes." },
      503,
    );
  }
});
