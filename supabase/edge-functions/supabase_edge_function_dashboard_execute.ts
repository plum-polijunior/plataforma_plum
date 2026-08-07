// =============================================================================
// ARQUIVO GERADO. NÃO EDITE ESTE ARQUIVO DIRETAMENTE.
// =============================================================================
//
// Este é o `index.ts` da Edge Function `dashboard-execute`, montado num arquivo
// só para poder ser colado no painel do Supabase (convenção deste projeto: ver
// supabase/edge-functions/README.md).
//
// Ele é gerado a partir de:
//   supabase/functions/_shared/query_plan.ts        (o único interpretador de
//                                                    Query Plan do sistema)
//   supabase/functions/dashboard-execute/index.ts   (a função em si)
//
// Para mudar qualquer coisa, edite os fontes acima e rode:
//
//     npm run gen:edge
//
// Se você editar aqui direto, a mudança some na próxima geração E deixa de ser
// coberta pelos testes. `npm test` falha quando este arquivo está
// desatualizado em relação aos fontes, justamente para isso não passar batido.
// =============================================================================


// ===========================================================================
// Trecho vindo de supabase/functions/_shared/query_plan.ts
// Testado por supabase/functions/_shared/query_plan.test.ts (28 testes).
// ===========================================================================


// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export type WhereNode =
  | { op: "and" | "or"; args?: unknown[] }
  | { left?: unknown; op?: string; right?: unknown };

export interface QueryPlan {
  from?: string;
  target_columns?: unknown[];
  select?: unknown[];
  where?: unknown;
  group_by?: unknown[];
  order_by?: unknown[];
  limit?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extração
// ─────────────────────────────────────────────────────────────────────────────

/** `tabela.coluna` vira `coluna`, igual ao `_strip_table` do executor. */
export function stripTable(col: string): string {
  const i = col.indexOf(".");
  return i === -1 ? col : col.slice(i + 1);
}

function addCol(into: Set<string>, raw: unknown): void {
  if (typeof raw !== "string") return;
  const c = stripTable(raw.trim());
  if (c) into.add(c);
}

/**
 * Percorre um nó de `where`, incluindo `and`/`or` aninhados em qualquer
 * profundidade. `maxDepth` existe para que um plano malformado ou hostil
 * (auto-referência, aninhamento absurdo) não vire estouro de pilha na função
 * que aplica o RBAC.
 */
function walkWhere(node: unknown, into: Set<string>, depth = 0): void {
  if (!node || typeof node !== "object" || depth > 32) return;

  const n = node as Record<string, unknown>;
  const op = typeof n.op === "string" ? n.op.toLowerCase() : "";

  if (op === "and" || op === "or") {
    const args = Array.isArray(n.args) ? n.args : [];
    for (const a of args) walkWhere(a, into, depth + 1);
    return;
  }

  // Folha. `left` é o nome da coluna; `right` é valor e nunca é coluna.
  addCol(into, n.left);

  // Alguns planos usam `col` no lugar de `left`. Aceitar os dois é mais seguro
  // que ignorar: ignorar significaria deixar passar uma referência de coluna.
  addCol(into, n.col);
}

/**
 * Todas as colunas que um Query Plan referencia, em qualquer posição.
 *
 * As seis posições possíveis: `target_columns`, `select` (expressão string),
 * `select` (expressão objeto com `col`), `where` (recursivo), `group_by` e
 * `order_by`. Se alguma escapar, uma coluna proibida atravessa a checagem.
 */
export function extractColumns(plan: QueryPlan | null | undefined): Set<string> {
  const cols = new Set<string>();
  if (!plan || typeof plan !== "object") return cols;

  for (const c of plan.target_columns ?? []) addCol(cols, c);

  for (const item of plan.select ?? []) {
    if (!item || typeof item !== "object") {
      addCol(cols, item);
      continue;
    }
    const expr = (item as Record<string, unknown>).expr;
    if (expr && typeof expr === "object") {
      addCol(cols, (expr as Record<string, unknown>).col);
    } else {
      addCol(cols, expr);
    }
  }

  walkWhere(plan.where, cols);

  for (const c of plan.group_by ?? []) addCol(cols, c);

  for (const o of plan.order_by ?? []) {
    if (o && typeof o === "object") addCol(cols, (o as Record<string, unknown>).col);
    else addCol(cols, o);
  }

  return cols;
}

// ─────────────────────────────────────────────────────────────────────────────
// Autorização
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthorizationResult {
  allowed: boolean;
  /** Colunas que o plano usa e o cargo não pode ver. Vazio quando allowed. */
  forbidden: string[];
  /** Conjunto a carregar da planilha. Só preenchido quando allowed. */
  required: string[];
}

/**
 * O plano só pode usar colunas que o cargo enxerga.
 *
 * Recusa em vez de filtrar em silêncio. Tirar uma coluna do `where` muda o
 * significado do resultado: o card continuaria aparecendo, com um número
 * calculado sobre outro recorte, e ninguém notaria.
 */
export function authorizePlan(
  plan: QueryPlan,
  allowedColumns: readonly string[],
): AuthorizationResult {
  const used = extractColumns(plan);
  const allowed = new Set(allowedColumns.map((c) => c.trim()).filter(Boolean));

  const forbidden: string[] = [];
  for (const c of used) if (!allowed.has(c)) forbidden.push(c);
  forbidden.sort();

  return {
    allowed: forbidden.length === 0,
    forbidden,
    required: [...used].sort(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Impressão digital da permissão
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Identidade do CONJUNTO de colunas que um cargo enxerga num dataset.
 *
 * É esta digital, e não o role_id, que entra na chave do cache de snapshots.
 * O que muda o resultado de um card é o conjunto de colunas, e esse conjunto
 * é mutável: quando o admin revoga uma coluna, a digital muda, o snapshot
 * antigo deixa de ser encontrado e o sistema recalcula. Vazamento de dado
 * revogado deixa de depender de alguém lembrar de invalidar cache.
 *
 * Ordenação e separador nulo importam: sem ordenar, a mesma permissão geraria
 * digitais diferentes conforme a ordem de leitura do banco, e o cache nunca
 * acertaria. Sem separador fora do alfabeto de nomes de coluna, os conjuntos
 * ["ab","c"] e ["a","bc"] colidiriam.
 */
export async function permissionsFingerprint(
  allowedColumns: readonly string[],
): Promise<string> {
  const normalizadas = [...new Set(allowedColumns.map((c) => c.trim()).filter(Boolean))]
    .sort();
  // O separador e o caractere NUL, escrito como ESCAPE e nunca como o
  // caractere literal. Este arquivo e inlinado num arquivo que se cola
  // num campo de texto do navegador, e byte nulo literal nao sobrevive
  // a copiar e colar: sumiria em silencio, a digital calculada no
  // painel passaria a ser outra, e nenhum snapshot ja gravado seria
  // encontrado. O sintoma seria "o cache nunca acerta".
  const canonico = normalizadas.join("\u0000");
  const bytes = new TextEncoder().encode(canonico);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// Assinatura do payload para o executor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HMAC-SHA256 sobre o corpo cru, com um segredo diferente da credencial da AWS.
 *
 * Duas camadas com segredos independentes: quem tiver a chave da AWS alcança o
 * endpoint mas não consegue forjar payload; quem tiver o segredo do HMAC não
 * alcança o endpoint. Vazar um não basta.
 */
export async function signPayload(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ===========================================================================
// Trecho vindo de supabase/functions/dashboard-execute/index.ts
// ===========================================================================
/**
 * dashboard-execute — a peça que decide.
 *
 * Toda autorização do dashboard vive aqui, e só aqui. É o único lugar do
 * caminho onde o JWT do usuário e o RLS do Postgres existem ao mesmo tempo. O
 * serviço em Python do outro lado é um Motorista Cego: ele obedece um payload
 * assinado e nunca consulta o Supabase.
 *
 * Isso importa por um motivo concreto: a service account que lê as planilhas
 * (`plum-polijunior@plataforma-plum.iam.gserviceaccount.com`) tem acesso de leitura à planilha
 * de TODOS os clientes. O isolamento entre empresas neste caminho não é
 * garantido pelo banco, porque este caminho nunca toca o banco do lado do
 * executor. Ele é garantido por este arquivo.
 *
 * ORDEM DAS VERIFICAÇÕES (nenhuma pode ser reordenada sem pensar):
 *
 *   1. JWT válido, perfil ativo, cargo definido.
 *   2. O dataset pertence à organização do usuário.
 *   3. Os cards pedidos pertencem à mesma organização.
 *   4. allowed_columns do cargo para aquele dataset.
 *   5. Impressão digital da permissão (chave do cache).
 *   6. Por card: extrair colunas do plano e conferir contra allowed_columns.
 *   7. Cache: último snapshot dentro do TTL.
 *   8. Só o que sobrou vai para o executor, num payload assinado.
 *
 * DEGRADAÇÃO: se o executor falhar ou estourar o tempo, cada card sem
 * resultado busca o snapshot mais recente IGNORANDO o TTL e volta com
 * `status: "stale"` mais o `computed_at`. A tela mostra o número com um selo
 * de idade em vez de um erro. Um dashboard que às vezes mostra erro é pior que
 * uma planilha, porque planilha sempre abre.
 *
 * DEPLOY — duas formas, e ESTE arquivo não é o que se cola.
 *
 * Este é o fonte. Ele importa `_shared/query_plan.ts`, que é código coberto
 * por 28 testes, e a peça que aplica o RBAC é justamente a que não pode viver
 * sem teste.
 *
 *   a) Pelo painel (convenção do projeto): cole o arquivo GERADO
 *      `supabase/edge-functions/supabase_edge_function_dashboard_execute.ts`,
 *      que é este mesmo código com o módulo compartilhado embutido. Gere com
 *      `npm run gen:edge`. Um teste falha se ele estiver desatualizado, então
 *      o que você cola é sempre o que os testes cobrem.
 *
 *   b) Pela CLI: `supabase functions deploy dashboard-execute`.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";


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

type CardStatus = "ok" | "stale" | "forbidden" | "error";

interface CardResult {
  card_id: string;
  status: CardStatus;
  columns?: string[];
  rows?: unknown[];
  row_count?: number;
  suppressed_groups?: number;
  computed_at?: string;
  error?: string;
}

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

  // ── 1. Quem é ────────────────────────────────────────────────────────────
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
    // types.ts permite role_id nulo. Sem cargo não existe allowed_columns, e
    // "sem permissão" nunca pode ser interpretado como "todas as permissões".
    return json({ error: "seu usuario ainda nao tem um cargo definido" }, 403);
  }

  let body: { dataset_id?: string; card_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "corpo invalido" }, 400);
  }
  if (!body.dataset_id) return json({ error: "dataset_id obrigatorio" }, 400);

  // ── 2. O dataset é desta organização? ────────────────────────────────────
  const { data: dataset } = await supabase
    .from("datasets")
    .select("id, organization_id, google_sheet_id, google_sheet_tab, schema_metadata")
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

  // ── 3. Cards ─────────────────────────────────────────────────────────────
  let cardQuery = supabase
    .from("dashboard_cards")
    .select("id, title, query_plan, viz, refresh_interval_minutes, position")
    .eq("dataset_id", dataset.id)
    .eq("organization_id", profile.organization_id)
    .order("position");

  if (body.card_ids?.length) cardQuery = cardQuery.in("id", body.card_ids);

  const { data: cards } = await cardQuery;
  if (!cards?.length) return json({ results: [] });

  // ── 4. O que este cargo enxerga nesta base ───────────────────────────────
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

  // ── 5. Impressão digital = chave do cache ────────────────────────────────
  const fingerprint = await permissionsFingerprint(allowedColumns);

  // ── 6 e 7. Autorização por card, e cache ─────────────────────────────────
  const results: CardResult[] = [];
  const paraExecutar: { card: typeof cards[number]; required: string[] }[] = [];
  const requiredColumns = new Set<string>();

  for (const card of cards) {
    const veredito = authorizePlan(card.query_plan, allowedColumns);
    if (!veredito.allowed) {
      // Recusa, nunca filtra em silêncio: tirar uma coluna do `where` mudaria
      // o significado do número e ninguém notaria.
      results.push({
        card_id: card.id,
        status: "forbidden",
        error: "Seu cargo nao tem acesso a uma das colunas deste card.",
      });
      continue;
    }

    const limite = new Date(
      Date.now() - card.refresh_interval_minutes * 60_000,
    ).toISOString();

    const { data: fresco } = await supabase
      .from("dashboard_card_snapshots")
      .select("payload, row_count, suppressed_groups, computed_at")
      .eq("card_id", card.id)
      .eq("permissions_fingerprint", fingerprint)
      .gte("computed_at", limite)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fresco) {
      results.push({
        card_id: card.id,
        status: "ok",
        ...(fresco.payload as Record<string, unknown>),
        row_count: fresco.row_count,
        suppressed_groups: fresco.suppressed_groups,
        computed_at: fresco.computed_at,
      });
      continue;
    }

    paraExecutar.push({ card, required: veredito.required });
    for (const c of veredito.required) requiredColumns.add(c);
  }

  if (paraExecutar.length === 0) return json({ results });

  // ── 8. Uma chamada ao executor, com tudo que faltou ──────────────────────
  const { data: org } = await supabase
    .from("organizations")
    .select("dashboard_k_min, dashboard_max_rows")
    .eq("id", profile.organization_id)
    .maybeSingle();

  const payload = {
    sheet_id: dataset.google_sheet_id,
    tab: dataset.google_sheet_tab ?? "Sheet1",
    plans: paraExecutar.map(({ card, required }) => ({
      card_id: card.id,
      plan: card.query_plan,
      resolved_columns: required,
    })),
    allowed_columns: allowedColumns,
    column_roles: papeisDeColuna(dataset.schema_metadata, requiredColumns),
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

  let executorResults: CardResult[] | null = null;
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
    executorResults = (await resp.json()).results ?? [];
  } catch (err) {
    console.error("Executor indisponivel:", err);
    executorResults = null;
  }

  // ── Sucesso: grava snapshot e devolve ────────────────────────────────────
  if (executorResults) {
    // Escrita de snapshot usa service role: o navegador não pode inserir aqui,
    // senão fabricaria um resultado com qualquer digital e contornaria o RBAC.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const novos = executorResults
      .filter((r) => r.status === "ok")
      .map((r) => ({
        card_id: r.card_id,
        permissions_fingerprint: fingerprint,
        organization_id: profile.organization_id,
        role_id: profile.role_id,
        payload: { columns: r.columns ?? [], rows: r.rows ?? [] },
        row_count: r.row_count ?? 0,
        suppressed_groups: r.suppressed_groups ?? 0,
      }));

    if (novos.length) {
      const { error } = await admin.from("dashboard_card_snapshots").insert(novos);
      // Falhar ao gravar o cache não pode impedir o usuário de ver o número
      // que já foi calculado corretamente.
      if (error) console.error("Falha ao gravar snapshot:", error.message);
    }

    return json({ results: [...results, ...executorResults] });
  }

  // ── Falha: degrada para o último snapshot, com selo de idade ─────────────
  for (const { card } of paraExecutar) {
    const { data: velho } = await supabase
      .from("dashboard_card_snapshots")
      .select("payload, row_count, suppressed_groups, computed_at")
      .eq("card_id", card.id)
      .eq("permissions_fingerprint", fingerprint)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (velho) {
      results.push({
        card_id: card.id,
        status: "stale",
        ...(velho.payload as Record<string, unknown>),
        row_count: velho.row_count,
        suppressed_groups: velho.suppressed_groups,
        computed_at: velho.computed_at,
      });
    } else {
      results.push({
        card_id: card.id,
        status: "error",
        error: "Nao consegui calcular este card agora. Tente de novo em instantes.",
      });
    }
  }

  return json({ results });
});

/**
 * Papéis das colunas, derivados da `cleaning_rule` que o Agente 3 escreveu no
 * onboarding e que já vive em `schema_metadata`.
 *
 * O executor precisa disto para não somar coluna de percentual. A informação
 * não pode ser constante global no Python: a coluna de percentual da Poli
 * Júnior tem um nome e a do laticínio tem outro.
 */
function papeisDeColuna(
  schemaMetadata: unknown,
  apenas: Set<string>,
): Record<string, string> {
  const roles: Record<string, string> = {};
  const cols = (schemaMetadata as { columns?: Record<string, { cleaning_rule?: string }> })
    ?.columns;
  if (!cols) return roles;

  for (const [nome, def] of Object.entries(cols)) {
    if (!apenas.has(nome)) continue;
    const r = (def?.cleaning_rule ?? "").toLowerCase();
    if (/percent|porcent|%|taxa/.test(r)) roles[nome] = "percent";
    else if (/data|date/.test(r)) roles[nome] = "date";
    else if (/r\$|moeda|float|int|numero|número|decimal/.test(r)) roles[nome] = "number";
    else roles[nome] = "text";
  }
  return roles;
}
