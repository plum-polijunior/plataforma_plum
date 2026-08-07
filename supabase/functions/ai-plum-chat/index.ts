/**
 * ai-plum-chat — Agente Z, Agente A, Agente C, e a ponte para o executor real.
 *
 * Três ações continuam sendo só um proxy para o Gemini: `guard` (Agente Z),
 * `plan_query` (Agente A) e `synthesize_answer` (Agente C). A quarta,
 * `execute_plan`, é nova (2026-08-07, Fase 2 de `organizar_tudo.md`): fecha o
 * buraco que existia desde sempre entre o Agente A gerar o Query Plan e o
 * Agente C precisar de um resultado de verdade — antes disso, o passo do meio
 * era um vetor fingido (`PlumChat.tsx:143-144`, agora removido).
 *
 * `execute_plan` segue exatamente o mesmo padrão de `dashboard-execute`
 * (`supabase/functions/dashboard-execute/index.ts`), reaproveitando o mesmo
 * módulo compartilhado (`_shared/query_plan.ts`) em vez de reimplementar a
 * extração de colunas — é o mesmo motivo da decisão 8A: dois interpretadores
 * de Query Plan divergem cedo ou tarde, e quando duas travas de segurança
 * discordam, quem passa é a mais frouxa.
 *
 * Diferenças em relação a `dashboard-execute`, e por quê:
 *   - Não há card salvo nem cache de snapshot: cada pergunta do chat é ad-hoc,
 *     então o "card_id" enviado ao executor é sempre o literal "chat".
 *   - Sem degradação para snapshot antigo em caso de falha do executor — não
 *     existe um "resultado antigo" de uma pergunta que nunca foi feita antes.
 *     Falha aqui vira uma mensagem de erro amigável para o usuário, não um
 *     número desatualizado.
 *
 * DEPLOY: automático, via integração GitHub↔Supabase (branch `plataforma`) —
 * ver `supabase/functions/README.md`.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

import {
  authorizePlan,
  columnRolesFromSchema,
  signPayload,
  type QueryPlan,
} from "../_shared/query_plan.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

// Segredos do caminho execute_plan — os mesmos que dashboard-execute usa,
// porque é o mesmo Lambda do outro lado. Ver supabase/functions/README.md.
const EXECUTOR_URL = Deno.env.get("PLUM_EXECUTOR_URL");
const EXECUTOR_HMAC_SECRET = Deno.env.get("PLUM_EXECUTOR_HMAC_SECRET");
const AWS_REGION = Deno.env.get("PLUM_AWS_REGION") ?? "sa-east-1";
const AWS_ACCESS_KEY_ID = Deno.env.get("PLUM_AWS_ACCESS_KEY_ID");
const AWS_SECRET_ACCESS_KEY = Deno.env.get("PLUM_AWS_SECRET_ACCESS_KEY");

const EXECUTOR_TIMEOUT_MS = 20_000;

type ExecutorStatus = "ok" | "forbidden" | "error";

interface ExecutorResult {
  status: ExecutorStatus;
  columns?: string[];
  rows?: unknown[];
  row_count?: number;
  suppressed_groups?: number;
  error?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// execute_plan — RBAC de coluna + chamada assinada ao executor Lambda
// ─────────────────────────────────────────────────────────────────────────────

async function handleExecutePlan(
  req: Request,
  datasetId: unknown,
  plan: unknown,
): Promise<Response> {
  if (!EXECUTOR_URL || !EXECUTOR_HMAC_SECRET || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    console.error("execute_plan: segredos do executor nao configurados nesta funcao.");
    return json({ error: "Executor nao configurado." }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "sem credencial" }, 401);

  // Cliente com o JWT do usuário: toda leitura abaixo passa por RLS. O mesmo
  // motivo de dashboard-execute — service role aqui transformaria um bug de
  // filtro em vazamento entre organizações, em vez de resultado vazio.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

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
    // Sem cargo não existe allowed_columns, e "sem permissão" nunca pode
    // virar "todas as permissões" — mesma regra de dashboard-execute.
    return json({ error: "seu usuario ainda nao tem um cargo definido" }, 403);
  }

  if (typeof datasetId !== "string" || !datasetId) {
    return json({ error: "datasetId obrigatorio" }, 400);
  }
  if (!plan || typeof plan !== "object") {
    return json({ error: "plan obrigatorio" }, 400);
  }

  const { data: dataset } = await supabase
    .from("datasets")
    .select("id, organization_id, google_sheet_id, google_sheet_tab, schema_metadata")
    .eq("id", datasetId)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  if (!dataset) return json({ error: "base nao encontrada" }, 403);
  if (!dataset.google_sheet_id) {
    return json(
      { error: "Esta base precisa ser reconectada: falta o link da planilha." },
      409,
    );
  }

  const { data: perm } = await supabase
    .from("role_permissions")
    .select("allowed_columns")
    .eq("role_id", profile.role_id)
    .eq("dataset_id", dataset.id)
    .maybeSingle();

  const allowedColumns: string[] = perm?.allowed_columns ?? [];
  if (allowedColumns.length === 0) {
    return json({
      result: {
        status: "forbidden",
        error: "Seu cargo nao tem acesso liberado a nenhuma coluna desta base.",
      } satisfies ExecutorResult,
    });
  }

  // Recusa em vez de filtrar em silêncio — mesma regra de dashboard-execute:
  // tirar uma coluna do plano mudaria o significado do número sem ninguém notar.
  const veredito = authorizePlan(plan as QueryPlan, allowedColumns);
  if (!veredito.allowed) {
    return json({
      result: {
        status: "forbidden",
        error: "Sua pergunta usa uma coluna que seu cargo nao pode ver.",
      } satisfies ExecutorResult,
    });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("dashboard_k_min, dashboard_max_rows")
    .eq("id", profile.organization_id)
    .maybeSingle();

  const payload = {
    sheet_id: dataset.google_sheet_id,
    tab: dataset.google_sheet_tab ?? "Sheet1",
    // "chat" no lugar de um id de card real: não existe card salvo aqui, e o
    // Lambda trata cada item de `plans` de forma independente de qualquer forma.
    plans: [{ card_id: "chat", plan, resolved_columns: veredito.required }],
    allowed_columns: allowedColumns,
    column_roles: columnRolesFromSchema(dataset.schema_metadata, new Set(veredito.required)),
    k_min: org?.dashboard_k_min ?? 5,
    max_rows: org?.dashboard_max_rows ?? 200_000,
    issued_at: Math.floor(Date.now() / 1000),
  };

  const raw = JSON.stringify(payload);
  const assinatura = await signPayload(raw, EXECUTOR_HMAC_SECRET);

  // SigV4 fecha o endpoint na infraestrutura (Function URL em AWS_IAM); o HMAC
  // acima usa outro segredo. Vazar um dos dois não basta para forjar payload.
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

    const corpo = await resp.json();
    const resultado: ExecutorResult = (corpo.results ?? [])[0] ?? {
      status: "error",
      error: "Executor nao devolveu resultado.",
    };
    return json({ result: resultado });
  } catch (err) {
    // Sem degradação para snapshot antigo aqui, ao contrário de
    // dashboard-execute: não existe "resultado anterior" de uma pergunta ad-hoc.
    console.error("Executor indisponivel (chat):", err);
    return json({
      result: {
        status: "error",
        error: "Nao consegui calcular isso agora. Tente novamente em instantes.",
      } satisfies ExecutorResult,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Agentes Z / A / C — proxy para o Gemini
// ─────────────────────────────────────────────────────────────────────────────

async function handleAgente(
  action: "guard" | "plan_query" | "synthesize_answer",
  prompt: string,
  schemaMetadata: unknown,
  executorResult: unknown,
): Promise<Response> {
  if (!GEMINI_API_KEY) {
    return json({ error: "GEMINI_API_KEY is not configured" }, 400);
  }

  let systemInstruction = "";
  let userPrompt = "";

  if (action === "guard") {
    systemInstruction = `Você é o Agente Z, Guardião de Segurança, Contexto e Viabilidade da Plataforma Plum.
Sua missão é realizar duas verificações estritas:

1. SEGURANÇA E ESCOPO DO CHAT:
   - Se a pergunta do usuário for sobre assuntos alheios à análise de dados da empresa (ex: história como "Revolução Francesa", receitas, piadas, esportes, bate-papo informal ou comandos de código), você DEVE BLOQUEAR.
   - Para perguntas bloqueadas por escopo, defina status = "BLOQUEADO" e message = "Sou o assistente inteligente da Plataforma Plum especialista nas suas bases de dados e indicadores corporativos. Posso te ajudar a analisar suas planilhas. Como posso ajudar com seus dados hoje?".

2. VIABILIDADE DE DADOS (SCHEMA METADATA):
   - Se a pergunta for sobre dados, analise o schema_metadata fornecido (conceitos e colunas disponíveis).
   - Se o usuário pedir métricas ou dimensões que NÃO existem e não podem ser calculadas a partir das colunas disponíveis no schema_metadata (ex: pedir "lucro" quando só existe "faturamento" sem custo), defina status = "INVIAVEL" e informe amigavelmente na "message" quais colunas faltam.
   - Se a pergunta for sobre dados e houver colunas compatíveis no schema_metadata, defina status = "PERMITIDO".

Sempre retorne ESTRITAMENTE um JSON com as chaves:
"status": ("PERMITIDO" | "BLOQUEADO" | "INVIAVEL")
"message": (string com a mensagem amigável para o usuário caso status seja BLOQUEADO ou INVIAVEL, ou null se PERMITIDO)
"assunto": (string curta categorizando a pergunta corporativa. Ex: "Faturamento / Receita", "RH", "Vendas", "Comparação", "Estoque", "Outros". Null se bloqueado.)`;

    userPrompt = `Pergunta do Usuário: "${prompt}"\nSchema Metadata (JSON de Contexto): ${JSON.stringify(schemaMetadata || {})}`;
  } else if (action === "plan_query") {
    systemInstruction = `Você é o Agente A, Planejador Semântico de Consultas da Plataforma Plum.
Sua única função é analisar a pergunta do usuário e o schema_metadata (JSON de contexto e definições de colunas) e gerar um Query Plan JSON estrito para o executor determinístico em Python (Pandas Executor).

REGRAS OBRIGATÓRIAS DO QUERY PLAN:
- "from": "producao" (ou nome da tabela principal).
- "target_columns": array contendo os nomes EXATOS das colunas que o executor precisará carregar (ex: ["faturamento", "data_venda"]).
- "select": array de expressões de seleção. Cada item pode ser uma string (coluna direta) ou objeto {"expr": {"agg": "sum"|"avg"|"min"|"max"|"count", "col": "nome_coluna"}, "as": "alias"}.
- "where": (opcional) objeto de filtro como {"left": "coluna", "op": "="|"between"|">"|"<"|"contains"|"in", "right": valor} ou {"op": "and"|"or", "args": [...]}.
- "group_by": (opcional) array de colunas para agrupamento.
- "order_by": (opcional) array de objetos {"col": "nome_coluna", "dir": "asc"|"desc"}.
- "limit": (opcional) inteiro limite de linhas (padrão 200).
- Todo plano PRECISA ter pelo menos um "select" com função de agregação (sum, avg, min, max, count) — o executor recusa devolver linhas brutas, sem exceção.

Retorne ESTRITAMENTE o JSON do Query Plan sem markdown.`;

    userPrompt = `Pergunta do Usuário: "${prompt}"\nSchema Metadata (JSON de Contexto): ${JSON.stringify(schemaMetadata || {})}`;
  } else {
    systemInstruction = `Você é o Agente C, Comunicador e Sintetizador de Respostas da Plataforma Plum.
Você receberá a pergunta original do usuário, o schema_metadata de contexto e o resultado exato e determinístico calculado pelo Pandas Executor (vetor de resultados).

Sua tarefa é elaborar uma resposta em português brasileiro executiva, clara, elegante e precisa.
- Utilize os valores exatos retornados pelo executor (respeite moedas R$, percentuais e totais).
- Não invente nem adicione números que não estejam no resultado do executor.
- Se o resultado tiver "suppressed_groups" maior que zero, explique brevemente que parte dos
  grupos foi omitida por ter poucos registros — é proteção de privacidade (k-anonimato), não erro.
  Nunca tente adivinhar ou revelar o que foi omitido.
- Se "row_count" for zero e não houver "suppressed_groups", diga que não encontrou dados para o
  recorte pedido, sem inventar um motivo.
- Responda diretamente à dúvida do usuário de forma profissional.`;

    userPrompt = `Pergunta Original do Usuário: "${prompt}"\nResultado do Executor Python (Vetor de Dados): ${JSON.stringify(executorResult || {})}\nSchema Metadata: ${JSON.stringify(schemaMetadata || {})}`;
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY.trim()}`;

  const res = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: action === "plan_query" ? 0.0 : 0.2,
        response_mime_type: action === "guard" || action === "plan_query"
          ? "application/json"
          : "text/plain",
      },
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("ERRO DA API DO GEMINI (ai-plum-chat):", JSON.stringify(data, null, 2));
    return json({ error: data.error?.message || "Erro na API do Google Gemini" }, 400);
  }

  const generatedText = data.candidates[0].content.parts[0].text;
  let finalResponse: unknown = generatedText;

  if (action === "guard" || action === "plan_query") {
    try {
      const cleaned = generatedText.replace(/```json\n?|\n?```/g, "").trim();
      finalResponse = JSON.parse(cleaned);
    } catch {
      console.error("Falha ao parsear JSON retornado pelo Gemini:", generatedText);
    }
  }

  return json({ result: finalResponse });
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { action, prompt, schemaMetadata, executorResult, datasetId, plan } = await req.json();

    if (action === "execute_plan") {
      return await handleExecutePlan(req, datasetId, plan);
    }
    if (action === "guard" || action === "plan_query" || action === "synthesize_answer") {
      return await handleAgente(action, prompt, schemaMetadata, executorResult);
    }
    return json({ error: "Ação inválida para ai-plum-chat." }, 400);
  } catch (error) {
    console.error("ERRO INTERNO NA EDGE FUNCTION (ai-plum-chat):", error);
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido" }, 400);
  }
});
