/**
 * dashboard-agent — cria card a partir de uma pergunta, e calcula a prévia.
 *
 * Função NOVA e independente (Fase 4, `docs/fases dashboard/`). Não importa
 * nada de `ai-plum-chat` e não altera nenhuma função existente: o agente daqui
 * tem prompt próprio, propósito próprio e um enum de saída mais estreito que o
 * do chat. Foi decisão explícita não reaproveitar os agentes do chat (D1).
 *
 * DUAS AÇÕES:
 *
 *   gerar_card      — {pergunta, schemaMetadata} → {title, viz, query_plan,
 *                     higher_is_better}. Só fala com o Gemini. Não toca banco.
 *
 *   executar_previa — {datasetId, plan} → resultado do executor. Autoriza,
 *                     assina e chama o Lambda. **NÃO GRAVA NADA.** É o que
 *                     permite ver o número antes de publicar o card (D1b).
 *
 * ── SOBRE A DUPLICAÇÃO DAS CHECAGENS, QUE FOI CONSCIENTE ────────────────────
 *
 * `execute_plan` em `ai-plum-chat` já faz exatamente o que `executar_previa`
 * faz. Reusar custaria zero linha alterada no chat. A decisão foi DUPLICAR,
 * pelo isolamento — e o preço é uma terceira cópia das checagens de
 * autorização numa camada que não tem teste automatizado.
 *
 * Por isso esta cópia não é "escrever de novo": é TRANSCREVER, na mesma ordem,
 * a partir de `ai-plum-chat/index.ts` (handleExecutePlan). As cinco checagens
 * abaixo estão numeradas. Se alguma sumir num refactor futuro, a duplicação
 * virou o buraco que ela deveria evitar.
 *
 * O que NÃO é duplicado, de propósito: `authorizePlan`, `signPayload` e
 * `formattingRulesFromSchema` continuam vindo de `_shared/query_plan.ts` — a
 * parte onde um bug vira vazamento entre empresas tem um dono só, e é testada.
 *
 * DEPLOY: automático a partir de `plataforma`. Nesta branch, publicar à mão:
 *   npx supabase functions deploy dashboard-agent --project-ref rjwidarrsykufuifzunu
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

import {
  authorizePlan,
  formattingRulesFromSchema,
  signPayload,
  type QueryPlan,
} from "../_shared/query_plan.ts";
import { parseGeminiJson } from "../_shared/gemini_parsing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

// Os mesmos cinco segredos que `ai-plum-chat` e `dashboard-execute` usam — é o
// mesmo Lambda do outro lado. `supabase secrets` é por projeto, então nada
// novo precisa ser provisionado para esta função.
const EXECUTOR_URL = Deno.env.get("PLUM_EXECUTOR_URL");
const EXECUTOR_HMAC_SECRET = Deno.env.get("PLUM_EXECUTOR_HMAC_SECRET");
const AWS_REGION = Deno.env.get("PLUM_AWS_REGION") ?? "sa-east-1";
const AWS_ACCESS_KEY_ID = Deno.env.get("PLUM_AWS_ACCESS_KEY_ID");
const AWS_SECRET_ACCESS_KEY = Deno.env.get("PLUM_AWS_SECRET_ACCESS_KEY");

const EXECUTOR_TIMEOUT_MS = 20_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// gerar_card — o agente
// ─────────────────────────────────────────────────────────────────────────────

const INSTRUCAO_CARD = `Você é o Planejador de Cards do dashboard da Plataforma Plum.

Recebe uma pergunta de negócio e o schema_metadata de uma base, e devolve a
especificação de UM card: título, tipo de visualização e o Query Plan que o
executor determinístico (Pandas) vai rodar.

Você NUNCA calcula. Você planeja; o Python executa.

RETORNE ESTRITAMENTE um JSON com estas quatro chaves:

"title"  — título curto em português, sem ponto final, no máximo 45 caracteres.
           Nomeia o indicador, não repete a pergunta. Ex.: "Faturamento por loja".
"viz"    — "kpi" ou "bar", APENAS. "kpi" quando o plano não tem group_by (um
           número só). "bar" quando tem group_by (uma linha por categoria).
"higher_is_better" — true se subir é bom, false se subir é ruim (custo, refugo,
           cancelamento, desconto), null se for neutro ou ambíguo.
"query_plan" — o plano, no formato abaixo.

FORMATO DO QUERY PLAN:
- "from": "producao"
- "target_columns": array com os nomes EXATOS das colunas que o executor precisa
  carregar (as do select, do where e do group_by).
- "select": array. Cada item é {"expr": {"agg": "sum"|"avg"|"min"|"max"|"count",
  "col": "nome_da_coluna"}, "as": "alias"}.
- "where": (opcional) {"left": "coluna", "op": "="|">"|"<"|"between"|"contains"|"in",
  "right": valor} ou {"op": "and"|"or", "args": [...]}.
- "group_by": (opcional) array com UMA coluna categórica.
- "order_by": (opcional) array de {"col": "alias_ou_coluna", "dir": "asc"|"desc"}.
- "limit": (opcional) inteiro.

REGRAS QUE NÃO PODEM SER QUEBRADAS:

1. Use SOMENTE nomes de coluna que existem em schema_metadata.columns. Nunca
   invente, nunca traduza, nunca adivinhe um nome parecido. Se a pergunta exige
   uma coluna que não existe, devolva {"erro": "..."} explicando em português o
   que falta — e nada mais.

2. Todo plano PRECISA ter pelo menos uma agregação no "select". O executor
   recusa devolver linhas brutas, sem exceção. "Liste os pedidos" é impossível.

3. NUNCA agrupe por data ou por período. O executor não sabe derivar mês,
   semana ou trimestre de uma coluna de data — agrupar por uma coluna de data
   produziria uma linha POR DIA. Se a pergunta pedir "por mês", devolva
   {"erro": "Ainda não sei agrupar por período. Posso calcular o total de um
   intervalo de datas, se você disser qual."}. FILTRAR por intervalo de datas
   no "where" funciona normalmente.

4. group_by aceita UMA coluna, e ela precisa ser categórica (texto com poucos
   valores distintos: loja, categoria, status, forma de pagamento).

5. Não some colunas de percentual — para elas use "avg".

6. INTERVALO DE DATAS É INCLUSIVO NOS DOIS EXTREMOS. Em português, "entre 12 e
   16 de janeiro", "de 12 a 16" e "da segunda à sexta" INCLUEM o primeiro e o
   último dia. Use {"left": "coluna_de_data", "op": "between", "right":
   ["2026-01-12", "2026-01-16"]} — nunca ">" e "<", que descartariam os dois
   extremos em silêncio.

   Isto não é preciosismo: num teste real com esta regra ausente, o plano
   perdeu o primeiro dia do intervalo e devolveu R$ 1.626,57 no lugar de
   R$ 2.387,92. O número saiu errado com cara de certo, que é o pior tipo de
   erro que este produto pode cometer.`;

async function gerarCard(pergunta: unknown, schemaMetadata: unknown): Promise<Response> {
  if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY nao configurada." }, 500);
  if (typeof pergunta !== "string" || !pergunta.trim()) {
    return json({ error: "pergunta obrigatoria" }, 400);
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY.trim()}`;

  const userPrompt =
    `Pergunta: "${pergunta}"\nschema_metadata: ${JSON.stringify(schemaMetadata ?? {})}`;

  // Duas tentativas, mesmo padrão de `ai-plum-chat`: perder a pergunta porque o
  // modelo emitiu uma vírgula a mais é caro, e a retentativa não relaxa
  // checagem nenhuma — pede o mesmo conteúdo como JSON válido.
  let textoInvalido = "";
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const correcao = tentativa === 1 ? "" : [
      "\n\nA resposta anterior foi DESCARTADA por não ser JSON válido:",
      textoInvalido,
      "Devolva o mesmo conteúdo como JSON válido, sem markdown e sem texto fora do objeto.",
    ].join("\n");

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: INSTRUCAO_CARD }] },
        contents: [{ parts: [{ text: userPrompt + correcao }] }],
        generationConfig: {
          temperature: 0.0,
          response_mime_type: "application/json",
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("[gerar_card] erro do Gemini:", JSON.stringify(data));
      // Cota estourada chega aqui. Vale uma mensagem que diga o que fazer, em
      // vez de repassar o texto do Google cru para o usuário final.
      const msg = String(data?.error?.message ?? "");
      const cota = /quota|exhaust|rate|RESOURCE_EXHAUSTED/i.test(msg) || data?.error?.code === 429;

      // 200 com `card.erro`, e NÃO 5xx: `functions.invoke` no front trata
      // qualquer não-2xx como falha de transporte e mostra uma mensagem
      // genérica, jogando fora a explicação que importa. Aconteceu no teste —
      // a cota estourou e o usuário leu "Não consegui montar o card agora"
      // em vez de "o limite de uso da IA foi atingido".
      //
      // Isto não é um erro de servidor: o servidor funcionou e a resposta é
      // "não deu, por este motivo". O status certo para isso é 200.
      const espera = String(data?.error?.details?.find?.(
        (d: { retryDelay?: string }) => d?.retryDelay,
      )?.retryDelay ?? "");

      return json({
        card: {
          erro: cota
            ? `O limite diário de uso da IA foi atingido${espera ? ` (tente de novo em ~${espera})` : ""}. Os cards já publicados continuam funcionando normalmente — eles não usam IA para recalcular.`
            : "Não consegui interpretar a pergunta agora. Tente reescrevê-la.",
        },
      });
    }

    const texto: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    try {
      const card = parseGeminiJson(texto);
      console.log("[gerar_card]", JSON.stringify(card));
      return json({ card });
    } catch {
      textoInvalido = texto;
      console.error(`[gerar_card] JSON invalido (tentativa ${tentativa}/2):`, texto);
    }
  }

  return json({ card: { erro: "Não consegui montar um cálculo para essa pergunta. Tente ser mais específico sobre qual número você quer." } });
}

// ─────────────────────────────────────────────────────────────────────────────
// executar_previa — RBAC de coluna + chamada assinada, SEM gravar nada
// ─────────────────────────────────────────────────────────────────────────────

async function executarPrevia(
  req: Request,
  datasetId: unknown,
  plan: unknown,
): Promise<Response> {
  if (!EXECUTOR_URL || !EXECUTOR_HMAC_SECRET || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    console.error("executar_previa: segredos do executor nao configurados.");
    return json({ error: "Executor nao configurado." }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "sem credencial" }, 401);

  // ── CHECAGEM 1: JWT válido ───────────────────────────────────────────────
  // Cliente com a ANON key e o Authorization do chamador: toda leitura abaixo
  // passa por RLS. Service role aqui transformaria um bug de filtro em
  // vazamento entre organizações, em vez de resultado vazio.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return json({ error: "sessao invalida" }, 401);

  // ── CHECAGEM 2: perfil com organização, ativo, e com cargo ───────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role_id, status")
    .eq("id", auth.user.id)
    .single();

  if (!profile?.organization_id) return json({ error: "perfil sem organizacao" }, 403);
  if (profile.status !== "ativo") return json({ error: "perfil nao ativo" }, 403);
  // Sem cargo não existe allowed_columns, e "sem permissão" nunca pode virar
  // "todas as permissões".
  if (!profile.role_id) return json({ error: "seu usuario ainda nao tem um cargo" }, 403);

  if (typeof datasetId !== "string" || !datasetId) {
    return json({ error: "datasetId obrigatorio" }, 400);
  }
  if (!plan || typeof plan !== "object") {
    return json({ error: "plan obrigatorio" }, 400);
  }

  // ── CHECAGEM 3: o dataset é desta organização ────────────────────────────
  const { data: dataset } = await supabase
    .from("datasets")
    .select(
      "id, name, organization_id, google_sheet_id, google_sheet_tab, google_sheet_gid, schema_metadata",
    )
    .eq("id", datasetId)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  if (!dataset) return json({ error: "base nao encontrada" }, 403);
  if (!dataset.google_sheet_id) {
    return json({ error: "Esta base precisa ser reconectada: falta o link da planilha." }, 409);
  }

  // ── CHECAGEM 4: allowed_columns do par (cargo, dataset) ──────────────────
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
      },
    });
  }

  // ── CHECAGEM 5: authorizePlan — recusa o plano inteiro, nunca filtra ─────
  const veredito = authorizePlan(plan as QueryPlan, allowedColumns);
  if (!veredito.allowed) {
    const colunasDoSchema = Object.keys(
      (dataset.schema_metadata as { columns?: Record<string, unknown> } | null)?.columns ?? {},
    );
    // Mesma separação de causas que `ai-plum-chat` faz: coluna que existe mas o
    // cargo não vê é RBAC de verdade; coluna que não existe no schema é o
    // agente inventando nome. Sem distinguir, um erro de planejamento fica
    // indistinguível de um erro de permissão no log.
    console.error("[executar_previa] RBAC negou colunas", JSON.stringify({
      datasetId: dataset.id,
      datasetName: dataset.name,
      roleId: profile.role_id,
      colunasNegadas: veredito.forbidden,
      inexistentesNoSchema: veredito.forbidden.filter((c) => !colunasDoSchema.includes(c)),
      existemMasSemPermissao: veredito.forbidden.filter((c) => colunasDoSchema.includes(c)),
    }));
    return json({
      result: {
        status: "forbidden",
        error: "Esse card usa uma coluna que seu cargo nao pode ver.",
      },
    });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("dashboard_max_rows")
    .eq("id", profile.organization_id)
    .maybeSingle();

  const payload = {
    sheet_id: dataset.google_sheet_id,
    tab: dataset.google_sheet_tab ?? "Sheet1",
    // `?? null` e não `|| null`: gid 0 é a PRIMEIRA aba, valor legítimo.
    tab_gid: dataset.google_sheet_gid ?? null,
    // "previa" no lugar de um id de card: não existe card salvo ainda — é
    // exatamente esse o ponto desta ação.
    plans: [{ card_id: "previa", plan, resolved_columns: veredito.required }],
    allowed_columns: allowedColumns,
    formatting_rules: formattingRulesFromSchema(
      dataset.schema_metadata,
      new Set(veredito.required),
    ),
    max_rows: org?.dashboard_max_rows ?? 200_000,
    issued_at: Math.floor(Date.now() / 1000),
  };

  const raw = JSON.stringify(payload);
  const assinatura = await signPayload(raw, EXECUTOR_HMAC_SECRET);

  // Duas camadas independentes: SigV4 fecha o endpoint na infraestrutura (a
  // Function URL está em AWS_IAM), e o HMAC acima usa OUTRO segredo. Vazar um
  // não basta para forjar o outro.
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
    const resultado = (corpo.results ?? [])[0] ?? {
      status: "error",
      error: "Executor nao devolveu resultado.",
    };
    console.log("[executar_previa]", JSON.stringify(resultado));
    return json({ result: resultado });
  } catch (err) {
    // Sem degradação para snapshot antigo: uma prévia nunca teve resultado
    // anterior, por definição.
    console.error("Executor indisponivel (previa):", err);
    return json({
      result: {
        status: "error",
        error: "Nao consegui calcular isso agora. Tente novamente em instantes.",
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { action, pergunta, schemaMetadata, datasetId, plan } = await req.json();

    if (action === "gerar_card") return await gerarCard(pergunta, schemaMetadata);
    if (action === "executar_previa") return await executarPrevia(req, datasetId, plan);

    return json({ error: "Acao invalida para dashboard-agent." }, 400);
  } catch (error) {
    console.error("ERRO INTERNO (dashboard-agent):", error);
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido" }, 500);
  }
});
