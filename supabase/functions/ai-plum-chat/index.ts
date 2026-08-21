/**
 * ai-plum-chat — Agente Z, Agente A, Agente C, e a ponte para o executor real.
 *
 * Três ações continuam sendo só um proxy para o Gemini: `guard` (Agente Z),
 * `plan_query` (Agente A) e `synthesize_answer` (Agente C). A quarta,
 * `execute_plan`, é nova (2026-08-07): fecha o
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
 * ⚠️ DEPLOY É MANUAL. Este cabeçalho dizia "automático, via integração
 * GitHub↔Supabase" até 2026-08-20 — foi medido e é falso (I-03), e a integração
 * foi desconectada. Publique à mão e confirme pelo `ezbr_sha256`; a receita está
 * em `supabase/functions/README.md`.
 *
 * ⭐ TODA CHAMADA DE LLM DESTA FUNÇÃO PASSA POR `_shared/llm.ts` (B05). A URL do
 * provedor não aparece mais aqui, e qual modelo atende cada papel é uma linha da
 * tabela em `_shared/llm_core.ts`.
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
import {
  criarRegistrador,
  type DadosDoTurno,
  type StatusLog,
} from "../_shared/log.ts";
import { chamar, type UsoDeTokens } from "../_shared/llm.ts";
import {
  colunasComVocabularioUtil,
  type Reconhecimento,
} from "../_shared/reconhecimento.ts";
import { passarPeloPorteiro } from "./adhoc/porteiro.ts";
import { reconhecer } from "./adhoc/reconhecedor.ts";

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

/**
 * Opções do caminho `ad_hoc`. Ausentes, o comportamento é exatamente o de
 * antes do B06 — que é o que mantém o `execute_plan` do chat atual intocado.
 */
interface OpcoesDeExecucao {
  /** `metadados` dispensa Query Plan: não há o que planejar nem o que autorizar
   *  por plano. As colunas pedidas passam a ser TODAS as que o cargo já pode
   *  ver, e a barreira 4 do Lambda continua conferindo isso. */
  tipo?: "metadados";
  caminho?: "legado" | "ad_hoc";
}

async function handleExecutePlan(
  req: Request,
  datasetId: unknown,
  plan: unknown,
  opcoes: OpcoesDeExecucao = {},
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

  const { data: dataset, error: datasetErr } = await supabase
    .from("datasets")
    .select(
      "id, name, organization_id, google_sheet_id, google_sheet_tab, google_sheet_gid, schema_metadata",
    )
    .eq("id", datasetId)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  if (!dataset) {
    console.error(
      "execute_plan: base nao encontrada. datasetId recebido=%s profile.organization_id=%s erro=%s",
      datasetId, profile.organization_id, JSON.stringify(datasetErr),
    );
    return json({ error: "base nao encontrada" }, 403);
  }
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
        // Acentuada em 2026-08-11: esta frase é gravada em `plum_chat` e
        // renderizada na bolha do assistente, então ela é lida pelo usuário
        // como se fosse texto do chat. Sem acento, virava erro de ortografia
        // nosso atribuído ao produto. Vale para as outras três deste arquivo
        // que seguem o mesmo caminho (ver as demais marcações desta data).
        error: "Seu cargo não tem acesso liberado a nenhuma coluna desta base.",
      } satisfies ExecutorResult,
    });
  }

  // ⭐ `metadados` não tem plano, então não há o que autorizar por plano: as
  // colunas pedidas são as que o cargo já pode ver, e o RBAC continua sendo o
  // `allowed_columns`. Fingir um veredito aqui, em vez de desviar, faria
  // `authorizePlan` receber `{}` e devolver "nenhuma coluna" — o A2 descreveria
  // uma base vazia e ninguém saberia por quê.
  const veredito = opcoes.tipo === "metadados"
    ? { allowed: true, required: allowedColumns, forbidden: [] as string[] }
    : authorizePlan(plan as QueryPlan, allowedColumns);

  if (!veredito.allowed) {
    // Era o único branch de execute_plan sem log nenhum: a mensagem para o
    // usuário não diz qual coluna faltou nem em qual base, então toda
    // investigação de RBAC tinha que reconstruir isso às cegas.
    //
    // A separação abaixo importa porque este branch tem DUAS causas que o
    // usuário lê com a mesma frase ("uma coluna que seu cargo não pode ver"):
    // a coluna existe na planilha e o cargo não a enxerga (RBAC de verdade),
    // ou o Agente A citou um nome que não existe no schema_metadata — e nome
    // inexistente nunca está em allowed_columns, então cai aqui igual. Sem
    // distinguir as duas no log, um erro de planejamento fica indistinguível
    // de um erro de permissão.
    //
    // Nota de 2026-08-10, depois de `ed3c007`: a segunda causa era, na prática,
    // alias de agregação em `order_by` — e essa não chega mais aqui, porque o
    // `extractColumns` deixou de exigir alias do próprio plano. `inexistentesNoSchema`
    // não perdeu utilidade: ainda pega o Agente A inventando nome de coluna.
    const colunasDoSchema = Object.keys(
      (dataset.schema_metadata as { columns?: Record<string, unknown> } | null)?.columns ?? {},
    );
    console.error("[execute_plan] RBAC negou colunas", JSON.stringify({
      datasetId: dataset.id,
      datasetName: dataset.name,
      roleId: profile.role_id,
      colunasNecessarias: veredito.required,
      colunasNegadas: veredito.forbidden,
      inexistentesNoSchema: veredito.forbidden.filter((c) => !colunasDoSchema.includes(c)),
      existemMasSemPermissao: veredito.forbidden.filter((c) => colunasDoSchema.includes(c)),
      allowedColumns,
      colunasDoSchema,
    }));
    return json({
      result: {
        status: "forbidden",
        // Acentuada em 2026-08-11 (chega à bolha). O comentário 30 linhas acima
        // cita esta frase literalmente — mudou aqui, muda lá.
        error: "Sua pergunta usa uma coluna que seu cargo não pode ver.",
      } satisfies ExecutorResult,
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
    // Qual aba, pelo identificador estável. O executor dá precedência a isto
    // sobre `tab`, porque `tab` é nome (muda com rename) e por muito tempo ficou
    // no default 'Sheet1' sem ninguém escrever nele.
    //
    // `?? null` e não `|| null`: gid 0 é a PRIMEIRA aba, um valor legítimo, e
    // `||` o transformaria em null — mandando toda planilha na primeira aba de
    // volta para o caminho que depende do nome.
    tab_gid: dataset.google_sheet_gid ?? null,
    // "chat" no lugar de um id de card real: não existe card salvo aqui, e o
    // Lambda trata cada item de `plans` de forma independente de qualquer forma.
    plans: [{
      card_id: "chat",
      plan,
      resolved_columns: veredito.required,
      ...(opcoes.tipo ? { tipo: opcoes.tipo } : {}),
    }],
    allowed_columns: allowedColumns,
    // ⭐ Liga o teto de cardinalidade do B02 no executor. `legado` mantém o modo
    // observação, que é o comportamento de sempre.
    caminho: opcoes.caminho ?? "legado",
    formatting_rules: formattingRulesFromSchema(dataset.schema_metadata, new Set(veredito.required)),
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
      error: "Executor não devolveu resultado.", // acentuada em 2026-08-11 (chega à bolha)
    };
    console.log("[execute_plan]", JSON.stringify(resultado));
    return json({ result: resultado });
  } catch (err) {
    // Sem degradação para snapshot antigo aqui, ao contrário de
    // dashboard-execute: não existe "resultado anterior" de uma pergunta ad-hoc.
    console.error("Executor indisponivel (chat):", err);
    return json({
      result: {
        status: "error",
        // acentuada em 2026-08-11 (chega à bolha)
        error: "Não consegui calcular isso agora. Tente novamente em instantes.",
      } satisfies ExecutorResult,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Agentes Z / A / C — proxy para o Gemini
// ─────────────────────────────────────────────────────────────────────────────

// Schema estrito do veredito do Agente Z. Com `response_schema` o Gemini
// decodifica dentro da gramática do schema, então não consegue emitir aspas
// ou vírgulas soltas. Em 2026-08-10 um `{..., "assunto": "Estudos Técnicos" " }`
// derrubou a pergunta inteira no guard — e o veredito nem era de bloqueio,
// era PERMITIDO.
//
// ⚠️ O campo `assunto` saiu em 2026-08-12. Ele era uma `STRING` livre, e o
// prompt oferecia só uma lista ABERTA de exemplos — nada restringia o valor,
// então a mesma pergunta saía como "Vendas" numa execução e "Venda" ou
// "Estudos Técnicos" na seguinte. Previsão de assunto não escala em
// multi-tenant sem empurrar a taxonomia para o usuário, e nada no produto
// chegou a consumir o campo (`contexto/30-decisoes.md` D-026). Note a ironia acima:
// foi justamente o `assunto` que causou o incidente que motivou este schema.
const SCHEMA_GUARD = {
  type: "OBJECT",
  properties: {
    status: { type: "STRING", enum: ["PERMITIDO", "BLOQUEADO", "INVIAVEL"] },
    message: { type: "STRING", nullable: true },
  },
  required: ["status"],
};

async function handleAgente(
  action: "guard" | "plan_query" | "synthesize_answer",
  prompt: string,
  schemaMetadata: unknown,
  executorResult: unknown,
  authHeader: string | null,
  turno: Partial<DadosDoTurno>,
): Promise<Response> {
  // Instrumentação da linha de base (Etapa 0 do remake). O registrador nunca
  // lança e nunca bloqueia a resposta — ver `_shared/log.ts`.
  const registrar = criarRegistrador(authHeader, turno, "legado");
  const inicio = Date.now();

  // Preenchidos pela chamada ao LLM. Ficam fora do laço porque as saídas de
  // erro que acontecem ANTES da chamada também precisam registrar algo.
  let ultimosTokens: UsoDeTokens = { entrada: null, saida: null };
  let ultimoModelo = "";
  let ultimoProvedor = "";

  /**
   * Grava a linha de log e devolve a resposta. Existe porque `handleAgente` tem
   * QUATRO saídas (erro da API, texto puro, JSON parseado, tentativas
   * esgotadas) e uma delas sem log seria um buraco invisível na medição.
   */
  const responder = async (
    resposta: Response,
    status: StatusLog,
    extras: {
      codigoErro?: string;
      /** O que o agente produziu. Ver `LinhaDeLog.respostaAgente`. */
      saida?: unknown;
    } = {},
  ): Promise<Response> => {
    // ⭐ Modelo, provedor e tokens vêm do adaptador, não são constantes daqui.
    // Era `modelo: "gemini-3.5-flash"` cravado — o que passaria a mentir no dia
    // em que a tabela papel→modelo mandasse a ação para outro lugar, e mentir
    // justamente na coluna que serve para comparar custo entre modelos.
    await registrar({
      etapa: action,
      status,
      codigoErro: extras.codigoErro ?? null,
      modelo: ultimoModelo,
      provedor: ultimoProvedor,
      tokensEntrada: ultimosTokens.entrada,
      tokensSaida: ultimosTokens.saida,
      latenciaMs: Date.now() - inicio,
      respostaAgente: extras.saida ?? null,
    });
    return resposta;
  };

  // O adaptador também recusa sem chave, mas conferir aqui evita montar um
  // prompt de dez mil caracteres para descobrir isso depois.
  if (!GEMINI_API_KEY) {
    return await responder(
      json({ error: "GEMINI_API_KEY is not configured" }, 400),
      "erro",
      { codigoErro: "sem_api_key" },
    );
  }

  let systemInstruction = "";
  let userPrompt = "";
  const hoje = new Date().toISOString().slice(0, 10);

  if (action === "guard") {
    systemInstruction = `Você é o Agente Z, Guardião de Segurança, Contexto e Viabilidade da Plataforma Plum.
Sua missão é realizar duas verificações estritas:

1. SEGURANÇA E ESCOPO DO CHAT:
   - Se a pergunta do usuário for sobre assuntos alheios à análise de dados da empresa (ex: história como "Revolução Francesa", receitas, piadas, esportes, bate-papo informal ou comandos de código), você DEVE BLOQUEAR.
   - Para perguntas bloqueadas por escopo, defina status = "BLOQUEADO" e message = "Sou o assistente inteligente da Plataforma Plum especialista nas suas bases de dados e indicadores corporativos. Posso te ajudar a analisar suas planilhas. Como posso ajudar com seus dados hoje?".

2. VIABILIDADE DE DADOS (SCHEMA METADATA):
   - Se a pergunta for sobre dados, analise o schema_metadata fornecido (conceitos e colunas disponíveis).
   - Se o usuário pedir métricas ou dimensões que NÃO existem e não podem ser calculadas a partir das colunas disponíveis no schema_metadata (ex: pedir "lucro" quando só existe "faturamento" sem custo), defina status = "INVIAVEL" e informe amigavelmente na "message" quais colunas faltam.
   - Atenção ao que É calculável: o executor combina colunas com contas linha a linha (multiplicação, soma, subtração, divisão). Logo, "quanto de dinheiro entrou" numa base que tem quantidade vendida e preço unitário é PERMITIDO, mesmo sem coluna de receita — sai de quantidade × preço. O critério de INVIAVEL é falta de DADO, não falta de coluna pronta.
   - Se a pergunta for sobre dados e houver colunas compatíveis no schema_metadata, defina status = "PERMITIDO".

Sempre retorne ESTRITAMENTE um JSON com as chaves:
"status": ("PERMITIDO" | "BLOQUEADO" | "INVIAVEL")
"message": (string com a mensagem amigável para o usuário caso status seja BLOQUEADO ou INVIAVEL, ou null se PERMITIDO)`;

    userPrompt = `Pergunta do Usuário: "${prompt}"\nSchema Metadata (JSON de Contexto): ${JSON.stringify(schemaMetadata || {})}`;
  } else if (action === "plan_query") {
    systemInstruction = `Você é o Agente A, Planejador Semântico de Consultas da Plataforma Plum.
Sua única função é analisar a pergunta do usuário e o schema_metadata (JSON de contexto e definições de colunas) e gerar um Query Plan JSON estrito para o executor determinístico em Python (Pandas Executor).

REGRAS OBRIGATÓRIAS DO QUERY PLAN:
- "from": "producao" (ou nome da tabela principal).
- "target_columns": array contendo os nomes EXATOS das colunas que o executor precisará carregar (ex: ["faturamento", "data_venda"]).
- "select": array de expressões de seleção. Cada item pode ser uma string (coluna direta) ou objeto {"expr": {"agg": "sum"|"avg"|"min"|"max"|"count", "col": "nome_coluna"}, "as": "alias"}.
- CONTA ENTRE COLUNAS: no lugar do nome da coluna, "col" aceita uma expressão aritmética aplicada LINHA A LINHA, antes da agregação:
  {"expr": {"agg": "sum", "col": {"op": "mul", "args": ["quantidade", "preco_unitario"]}}, "as": "receita_total"}
  Operadores: "mul" e "add" (dois ou mais operandos), "sub" e "div" (exatamente dois). Cada item de "args" pode ser um nome de coluna, um número, ou outra expressão aninhada.
- ⚠️ REGRA CRÍTICA — valor monetário a partir de quantidade e preço: se a base NÃO tem coluna de receita/faturamento/valor total, mas tem quantidade e preço unitário, então receita é OBRIGATORIAMENTE {"agg": "sum", "col": {"op": "mul", "args": ["<quantidade>", "<preco>"]}}. NUNCA devolva sum(quantidade) e avg(preco) como duas agregações separadas esperando que alguém multiplique depois: soma de quantidade vezes média de preço NÃO é receita, e só coincide por acaso quando todos os produtos custam o mesmo. A multiplicação é por linha, e quem multiplica é o executor.
- "where": (opcional) objeto de filtro como {"left": "coluna", "op": "="|"between"|">"|"<"|"contains"|"in", "right": valor} ou {"op": "and"|"or", "args": [...]}.
- "group_by": (opcional) array de colunas para agrupamento.
- "order_by": (opcional) array de objetos {"col": "nome_coluna", "dir": "asc"|"desc"}.
- "limit": (opcional) inteiro limite de linhas (padrão 200).
- Todo plano PRECISA ter pelo menos um "select" com função de agregação (sum, avg, min, max, count) — o executor recusa devolver linhas brutas, sem exceção.
- Hoje é ${hoje}. Se o usuário mencionar uma data sem ano (ex: "2 de outubro", "dia 15/03"), assuma o ano atual — nunca infira um ano diferente por conta própria.

Retorne ESTRITAMENTE o JSON do Query Plan sem markdown.`;

    userPrompt = `Pergunta do Usuário: "${prompt}"\nSchema Metadata (JSON de Contexto): ${JSON.stringify(schemaMetadata || {})}`;
  } else {
    // Agente C. Os dois blocos finais — FORMATO DA RESPOSTA e PORTUGUÊS CORRETO
    // — entraram em 2026-08-11, e a ordem importa: eles vêm DEPOIS do bloco
    // "⛔ VOCÊ NÃO FAZ CONTA" de propósito. Aquele é o R-13, escrito depois de
    // um incidente real, e é a regra que não pode perder proeminência para uma
    // instrução de tipografia.
    //
    // Antes disso este prompt não dizia nada sobre estrutura nem sobre
    // acentuação (compare com o Agente A, que termina em "sem markdown"), e as
    // consequências eram três: lista saía como frase corrida separada por
    // vírgula, negrito ia em todo número, e nome técnico de coluna
    // (`receita_total`, `natureza_da_aquisicao`) vazava cru para a prosa — o
    // modelo espelha o registro do JSON que recebe, e as chaves de `rows` são
    // os aliases do Query Plan, todos em snake_case sem acento.
    //
    // ⚠️ Este bloco é par indivisível com `src/components/RespostaMarkdown.tsx`.
    // Pedir Markdown aqui só funciona porque o front passou a renderizar
    // Markdown; com o front antigo, o "- " chega ao usuário como hífen literal.
    // Se reverter um lado, reverta o outro.
    systemInstruction = `Você é o Agente C, Comunicador e Sintetizador de Respostas da Plataforma Plum.
Você receberá a pergunta original do usuário, o schema_metadata de contexto e o resultado exato e determinístico calculado pelo Pandas Executor (vetor de resultados).

Sua tarefa é elaborar uma resposta em português brasileiro executiva, clara, elegante e precisa.
- Utilize os valores exatos retornados pelo executor (respeite moedas R$, percentuais e totais).
- Não invente nem adicione números que não estejam no resultado do executor.

⛔ VOCÊ NÃO FAZ CONTA. Esta é a regra mais importante e não tem exceção.
Você não soma, não subtrai, não multiplica, não divide, não calcula porcentagem, não tira média, não projeta e não converte unidade. Todo número que aparecer na sua resposta precisa estar LITERALMENTE no resultado do executor. Reformatar (1480 → "1.480") pode; derivar um número novo, não.
- Combinar dois números do resultado para produzir um terceiro é proibido mesmo quando os dois estão ali e a conta parece óbvia. Exemplo real do que NÃO fazer: receber "total de unidades: 1.480" e "preço médio: R$ 57,50" e responder "o faturamento foi de R$ 85.100,00". Multiplicar um total por uma média não dá o valor total — dá um número errado com aparência de exato, e o usuário não tem como perceber.
- Se responder à pergunta exigiria um número que não está no resultado, diga com todas as letras que esse valor não foi calculado, apresente o que de fato veio, e sugira a pergunta que traria o número que falta. Uma resposta incompleta e honesta vale mais que uma completa e inventada.
- Se "row_count" for zero, diga que não encontrou dados para o recorte pedido, sem inventar um motivo.
- Responda diretamente à dúvida do usuário de forma profissional.

FORMATO DA RESPOSTA (o chat renderiza Markdown de verdade):
- Comece com UMA frase que responde diretamente à pergunta, com o valor principal em **negrito**. Só esse valor leva negrito.
- Se o resultado tiver mais de uma linha, liste os itens em tópicos, um por linha, começando com "- ", no formato "- Rótulo — valor". NUNCA emende os itens numa frase corrida separados por vírgula. NUNCA use negrito dentro dos tópicos.
- Deixe uma linha em branco entre a frase de abertura e a lista.
- Só estes recursos são permitidos: parágrafo curto, "- " para lista e "**" para o valor principal. NÃO use títulos (#), tabelas, blocos de código, citações, links nem emojis.
- No máximo 3 parágrafos. Se a lista passar de 15 itens, mostre os mais relevantes e diga quantos ficaram de fora.

PORTUGUÊS CORRETO:
- Escreva em português brasileiro com acentuação e cedilha completas: "não", "orçamento", "número", "média", "período", "aquisição".
- Nunca escreva sem acento, mesmo que a palavra apareça sem acento no JSON recebido. Nome técnico de coluna e mensagem interna do sistema vêm sem acento de propósito, e não são modelo de escrita.
- Nome de coluna NUNCA aparece cru na resposta: "preco_unitario" vira "preço unitário", "natureza_da_aquisicao" vira "natureza da aquisição", o alias "receita_total" vira "receita total". Use a definição semântica do schema_metadata para nomear o conceito em linguagem de negócio.
- Revise concordância e regência antes de responder.`;

    userPrompt = `Pergunta Original do Usuário: "${prompt}"\nResultado do Executor Python (Vetor de Dados): ${JSON.stringify(executorResult || {})}\nSchema Metadata: ${JSON.stringify(schemaMetadata || {})}`;
  }

  const esperaJson = action === "guard" || action === "plan_query";

  // Duas tentativas quando a resposta precisa ser JSON. Perder a pergunta
  // inteira porque o modelo emitiu um caractere a mais é caro demais, e a
  // retentativa não relaxa nenhuma checagem — só pede a mesma resposta de novo.
  //
  // ⚠️ A queda do `response_schema` NÃO está mais aqui. Ela virou detalhe do
  // adaptador do Gemini (`_shared/llm/gemini.ts`), que é de quem ela sempre
  // foi: `response_schema` é peculiaridade daquela API, e o laço aqui tinha um
  // `tentativa--` só para não contá-la como retentativa. A semântica é a mesma.
  const maxTentativas = esperaJson ? 2 : 1;
  let textoInvalido = "";

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    const correcao = tentativa === 1 ? undefined : [
      "A resposta anterior foi DESCARTADA por não ser JSON sintaticamente válido:",
      textoInvalido,
      "Devolva exatamente o mesmo conteúdo, agora como JSON válido: sem markdown,",
      "sem texto fora do objeto, sem aspas ou vírgulas sobrando.",
    ].join("\n");

    const resposta = await chamar({
      papel: action,
      sistema: systemInstruction,
      prompt: correcao ? `${userPrompt}\n\n${correcao}` : userPrompt,
      json: esperaJson,
      temperatura: action === "plan_query" ? 0.0 : 0.2,
      // Só o guard usa schema. O Query Plan tem união de tipos em "select" e
      // recursão em "where"; prendê-lo num response_schema distorceria o plano,
      // o que é pior do que uma falha de sintaxe — ali a rede é a retentativa.
      schema: action === "guard" ? SCHEMA_GUARD : undefined,
    });

    ultimosTokens = resposta.tokens;
    ultimoModelo = resposta.modelo;
    ultimoProvedor = resposta.provedor;

    if (!resposta.ok) {
      return await responder(
        json({ error: resposta.erro?.mensagem ?? "Erro no provedor de LLM" }, 400),
        "erro",
        { codigoErro: resposta.erro?.codigo },
      );
    }

    const generatedText: string = resposta.texto;

    if (!esperaJson) {
      console.log(`[${action}]`, JSON.stringify(generatedText));
      return await responder(json({ result: generatedText }), "ok", {
        saida: generatedText,
      });
    }

    try {
      const finalResponse = parseGeminiJson(generatedText);
      if (tentativa > 1) {
        console.log(`[${action}] recuperado na tentativa ${tentativa}.`);
      }
      console.log(`[${action}]`, JSON.stringify(finalResponse));

      // ⭐ O veredito do Agente Z vira status do log. É o que permite medir com
      // que frequência o guardião barra — e, depois, comparar essa taxa com a
      // do porteiro do remake. Sem este mapeamento o log diria só "ok" para uma
      // pergunta que foi recusada.
      const veredito = (finalResponse as { status?: string } | null)?.status;
      const statusLog: StatusLog = action !== "guard"
        ? "ok"
        : veredito === "BLOQUEADO"
        ? "bloqueado"
        : veredito === "INVIAVEL"
        ? "inviavel"
        : "ok";

      // ⭐ `saida` guarda o veredito do Z ou o Query Plan do A. Para o plano
      // isto não é redundante com o `plum_chat.plan_query`: lá só chega o plano
      // **cacheável**, e plano com data é descartado (D-024) — justamente o
      // mais provável de estar errado.
      return await responder(json({ result: finalResponse }), statusLog, {
        saida: finalResponse,
      });
    } catch {
      textoInvalido = generatedText;
      console.error(
        `Falha ao parsear JSON retornado pelo modelo [${action}, tentativa ${tentativa}/${maxTentativas}]:`,
        generatedText,
      );
    }
  }

  // ⭐ Aqui a saída importa MAIS que nas outras: é o texto que não parseou, e
  // sem ele o log diria só "json_invalido" — que não permite corrigir prompt
  // nenhum. Este é o caso em que o `plum_chat` fica com a pergunta e sem
  // resposta, então o log é o único lugar onde a tentativa sobrevive.
  return await responder(
    json({ error: "Resposta do Gemini nao pode ser interpretada." }, 502),
    "erro",
    { codigoErro: "json_invalido", saida: textoInvalido },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ad_hoc_planejar — A1 → metadados → A2. O caminho novo começa aqui.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⭐ **Este é o primeiro consumidor da chave `remake_habilitado`** — a coluna
 * criada na Etapa 0 e deliberadamente deixada sem leitor, porque não havia o que
 * gatear. Agora há.
 *
 * ⚠️ **O bloco NÃO responde perguntas ainda.** Ele vai até o reconhecimento e
 * para: quem transforma reconhecimento em pedidos é o A3, que nasce no B07. Por
 * isso o front chama isto em **modo sombra** — roda ao lado do caminho legado,
 * alimenta o log, e a resposta continua vindo de onde sempre veio.
 *
 * É o mesmo formato do modo observação do B02, e pela mesma razão: sem ele, A1 e
 * A2 ficariam mais duas semanas sem nenhum sinal de realidade.
 */
async function handleAdHocPlanejar(
  req: Request,
  pergunta: unknown,
  datasetId: unknown,
  turno: Partial<DadosDoTurno>,
): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "sem credencial" }, 401);
  if (typeof pergunta !== "string" || !pergunta.trim()) {
    return json({ error: "prompt obrigatorio" }, 400);
  }
  if (typeof datasetId !== "string" || !datasetId) {
    return json({ error: "datasetId obrigatorio" }, 400);
  }

  const registrar = criarRegistrador(authHeader, turno, "ad_hoc");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  // ── A chave ──────────────────────────────────────────────────────────────
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return json({ error: "sessao invalida" }, 401);

  const { data: profile } = await supabase
    .from("profiles").select("organization_id").eq("id", auth.user.id).single();
  if (!profile?.organization_id) return json({ error: "perfil sem organizacao" }, 403);

  const { data: org } = await supabase
    .from("organizations").select("remake_habilitado")
    .eq("id", profile.organization_id).maybeSingle();

  // ⚠️ Sem log quando a chave está desligada. A ausência de linha `ad_hoc` no
  // `plum_logs` É o sinal de que a organização não está no caminho novo —
  // gravar aqui poluiria a comparação entre as duas cadeias com turnos que
  // nunca foram tentados.
  if (!org?.remake_habilitado) return json({ habilitado: false });

  // ── A1 · Porteiro ────────────────────────────────────────────────────────
  const t0 = Date.now();
  const porteiro = await passarPeloPorteiro(pergunta);
  await registrar({
    etapa: "porteiro",
    status: porteiro.permitido ? "ok" : "bloqueado",
    codigoErro: porteiro.llm.erro?.codigo ?? null,
    modelo: porteiro.llm.modelo,
    provedor: porteiro.llm.provedor,
    tokensEntrada: porteiro.llm.tokens.entrada,
    tokensSaida: porteiro.llm.tokens.saida,
    latenciaMs: Date.now() - t0,
    respostaAgente: { permitido: porteiro.permitido, mensagem: porteiro.mensagem },
  });

  if (!porteiro.permitido) {
    return json({ habilitado: true, status: "bloqueado", mensagem: porteiro.mensagem });
  }

  // ── metadados (B03) ──────────────────────────────────────────────────────
  const t1 = Date.now();
  const resposta = await handleExecutePlan(req, datasetId, {}, {
    tipo: "metadados",
    caminho: "ad_hoc",
  });
  const corpo = await resposta.json().catch(() => null);
  const descricao = (corpo as { result?: Record<string, unknown> } | null)?.result;

  // ⚠️⚠️ **Conferir o STATUS DO CARD, não só o HTTP.** O executor devolve falha
  // por card com HTTP **200** — é o desenho dele (`main.py`: "um card ruim não
  // pode derrubar o dashboard inteiro"), e o `handleExecutePlan` repassa isso
  // como `{ result: { status: "error", error: … } }`, também 200.
  //
  // ⭐ Em 2026-08-20 este trecho conferia só `resposta.ok`, e o objeto de erro
  // chegou ao A2 como se fosse a descrição da base. Ele relatou fielmente o que
  // leu — "a leitura falhou, renomeie uma coluna" — e o resultado parecia
  // opinião do modelo sobre a planilha quando era mensagem do `sheets.py`.
  // Erro de infraestrutura vestido de julgamento de agente é o tipo de coisa
  // que faz alguém ajustar o prompt errado por uma semana.
  const colunas = (descricao?.colunas ?? null) as Record<string, unknown> | null;
  const descricaoValida =
    resposta.ok &&
    descricao?.status === "ok" &&
    colunas !== null &&
    Object.keys(colunas).length > 0;

  // ⚠️ Um código por CAUSA, não um código para "deu ruim". A primeira coisa que
  // alguém faz ao investigar é `group by codigo_erro`; com um código só, isso
  // não separa "o executor recusou" de "veio ok e vazio", e a diferença entre
  // as duas é a diferença entre mexer na planilha e mexer no código.
  const codigoDoErro = () => {
    if (!resposta.ok) return `metadados_http_${resposta.status}`;
    if (descricao?.status !== "ok") return "metadados_executor";
    return "metadados_vazio";
  };

  // ⚠️ `executor`, NÃO `reconhecedor`. Esta chamada é uma ida ao Lambda, e
  // rotulá-la com o nome do agente seguinte produzia DUAS linhas `reconhecedor`
  // no mesmo turno — o que corrompe exatamente as medições que a etapa existe
  // para dar: `group by etapa` conta em dobro, a latência do Lambda entra no
  // custo do A2, e a taxa de `cache_hit_a2` sai diluída por linhas que nunca
  // tiveram cache. Visto no primeiro teste real do B06, em 2026-08-21.
  await registrar({
    etapa: "executor",
    status: descricaoValida ? "ok" : "erro",
    codigoErro: descricaoValida ? null : codigoDoErro(),
    latenciaMs: Date.now() - t1,
    // Quantas linhas a base tem. É o que o `linhas_origem` sempre quis dizer, e
    // o `metadados` é o único lugar do caminho que sabe isso de graça.
    linhasOrigem: typeof descricao?.n_linhas === "number" ? descricao.n_linhas : null,
    // O erro do executor vai para cá, que é onde ele sempre deveria ter ido —
    // e não para dentro do reconhecimento, onde parecia opinião do modelo.
    respostaAgente: descricaoValida ? null : descricao ?? null,
  });

  if (!descricaoValida) {
    // ⚠️ Devolve 200 com `erro`, não um código de falha: em modo sombra, um erro
    // aqui não é um erro da PERGUNTA — ela vai ser respondida pelo caminho
    // legado de qualquer jeito. Status HTTP de erro faria o front tratar como
    // falha do chat.
    return json({
      habilitado: true,
      status: "erro",
      etapa: "metadados",
      erro: descricao?.error ?? null,
    });
  }

  // ── A2 · Reconhecedor (com cache) ────────────────────────────────────────
  const { data: dataset } = await supabase
    .from("datasets").select("schema_metadata").eq("id", datasetId).maybeSingle();

  const colunasReais = Object.keys(colunas);

  const t2 = Date.now();
  const r = await reconhecer(
    supabase as never,
    datasetId,
    dataset?.schema_metadata ?? null,
    descricao,
    colunasReais,
  );

  // ⚠️ `codigo_erro` numa linha `ok` não é contradição: o turno funcionou e algo
  // está errado mesmo assim. `cache_nao_gravou` é o caso — a pergunta foi
  // respondida, mas o próximo turno vai pagar o A2 de novo, e sem esta linha o
  // sintoma ("o cache nunca acerta") só existiria no console da função.
  await registrar({
    etapa: "reconhecedor",
    status: Object.keys(r.reconhecimento.colunas).length ? "ok" : "erro",
    codigoErro: r.llm?.erro?.codigo ?? (r.erroDeCache ? "cache_nao_gravou" : null),
    modelo: r.llm?.modelo ?? null,
    provedor: r.llm?.provedor ?? null,
    tokensEntrada: r.llm?.tokens.entrada ?? null,
    tokensSaida: r.llm?.tokens.saida ?? null,
    latenciaMs: Date.now() - t2,
    // ⭐ O critério de pronto do V7 §8 item 4 sai desta coluna: a 2ª pergunta na
    // mesma base tem de vir `true`.
    cacheHitA2: r.cacheHit,
    respostaAgente: r.erroDeCache
      ? { reconhecimento: r.reconhecimento, erro_de_cache: r.erroDeCache }
      : r.reconhecimento,
  });

  return json({
    habilitado: true,
    status: "ok",
    cacheHit: r.cacheHit,
    reconhecimento: r.reconhecimento satisfies Reconhecimento,
    // O que o B04 vai buscar vocabulário quando o A3 existir (B07).
    vocabularios: colunasComVocabularioUtil(r.reconhecimento),
  });
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      action, prompt, schemaMetadata, executorResult, datasetId, plan,
      // Identificam a conversa e a pergunta, para o log costurar as etapas.
      // Gerados no cliente — ver `20260818110000_plum_logs.sql`. Opcionais de
      // propósito: front antigo continua funcionando, só sem registro.
      sessaoId, turnoId,
    } = await req.json();

    const turno = { sessaoId, turnoId, datasetId };
    const authHeader = req.headers.get("Authorization");

    if (action === "execute_plan") {
      // ⭐ Envolvido em vez de instrumentado por dentro. `handleExecutePlan` tem
      // treze saídas (segredo ausente, sem credencial, perfil inativo, sem
      // cargo, base não encontrada, executor 4xx/5xx, sucesso…); espalhar log
      // por todas elas encheria a função de ruído e ainda assim alguém
      // esqueceria uma. Aqui o status sai do código HTTP, que é justamente o
      // que cada uma daquelas saídas já decide.
      const inicio = Date.now();
      const resposta = await handleExecutePlan(req, datasetId, plan);
      const registrar = criarRegistrador(authHeader, turno, "legado");

      let codigoErro: string | null = null;
      if (!resposta.ok) {
        // Clonar porque o corpo só pode ser lido uma vez, e quem chamou ainda
        // precisa dele. A mensagem é nossa, não texto do usuário (D-022).
        try {
          const corpo = await resposta.clone().json();
          codigoErro = typeof corpo?.error === "string" ? corpo.error.slice(0, 120) : null;
        } catch { /* corpo não-JSON: o código HTTP já diz o suficiente */ }
      }

      // ⚠️ Sem `respostaAgente` de propósito. O executor não é agente: a saída
      // dele é dado de negócio agregado do cliente, e gravá-la aqui criaria uma
      // segunda cópia dos números do cliente numa tabela com outra retenção.
      // Ver o cabeçalho de `20260818120000_plum_logs_resposta.sql`.
      await registrar({
        etapa: "execute_plan",
        status: resposta.ok ? "ok" : resposta.status === 403 ? "negado" : "erro",
        codigoErro,
        latenciaMs: Date.now() - inicio,
      });

      return resposta;
    }
    if (action === "ad_hoc_planejar") {
      return await handleAdHocPlanejar(req, prompt, datasetId, turno);
    }
    if (action === "guard" || action === "plan_query" || action === "synthesize_answer") {
      return await handleAgente(
        action, prompt, schemaMetadata, executorResult, authHeader, turno,
      );
    }
    return json({ error: "Ação inválida para ai-plum-chat." }, 400);
  } catch (error) {
    console.error("ERRO INTERNO NA EDGE FUNCTION (ai-plum-chat):", error);
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido" }, 400);
  }
});
