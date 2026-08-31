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
  criarRegistradorVerificado,
  type DadosDoTurno,
  type StatusLog,
} from "../_shared/log.ts";
import {
  aprovarLote,
  calcularSaldo,
  consomeOrcamento,
  type Gasto,
  JANELA_HORAS,
  TETO_DE_LINHAS_BRUTAS,
} from "../_shared/orcamento.ts";
import { chamar, type UsoDeTokens } from "../_shared/llm.ts";
import { nomearBases, resolverBase, TODAS_AS_BASES } from "../_shared/bases.ts";
import { encaminhar } from "./adhoc/encaminhador.ts";
import { resolver as resolverAgente } from "../_shared/agentes.ts";
import { dataDeHoje } from "../_shared/hoje.ts";
// ⭐ O A2 saiu do caminho no B15: quem diz o que a base significa agora é o
// dicionário escrito no cadastro, conferido por gente (D-049).
//
// ⛔ `reconhecimento.ts` e `adhoc/reconhecedor.ts` foram APAGADOS em 2026-08-27.
// O B15 os deixou de lado prevendo que voltariam na Etapa 3 — mas o A2 que volta
// é o `a2_encaminhador`, que escolhe bases E escolhe qual A3 planeja, e as duas
// escolhas dependem da PERGUNTA. O módulo antigo não recebia a pergunta, e era
// exatamente isso que o tornava cacheável por `(dataset, digital)`. Reaproveitá-lo
// devolveria a escolha de uma pergunta para outra, em silêncio. Ver D-054.
//
// ⚠️ O slot 2 está VAZIO hoje: o turno é A1 → dicionário → A3.
import {
  colunasComVocabulario,
  lerDicionario,
} from "../_shared/dicionario.ts";
// ⭐ A mesma regra determinística que o `ai-agents` usa para sugerir
// `vocabulario_util` ao Agente 1. Divergir faria o dicionário afirmar que uma
// coluna tem vocabulário útil sem que ninguém tivesse visto os valores dela.
import { colunasComVocabularioDoPerfil } from "../_shared/perfil.ts";
import {
  aplicarLiterais,
  type Pedido,
  type Presuncao,
} from "../_shared/pedidos.ts";
import { resolverEntidade, type ValorDoVocabulario } from "../_shared/entidade.ts";
import {
  lerVocabulario,
  planoDeVocabulario,
  TETO_DE_VOCABULARIO,
} from "../_shared/vocabulario.ts";
import { passarPeloPorteiro } from "./adhoc/porteiro.ts";
import { planejar } from "./adhoc/planejador.ts";
import { interpretar, type ResultadoDePedido } from "./adhoc/interprete.ts";

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

/**
 * O corpo que o Lambda devolve — sempre `results`, um item por `plans`.
 *
 * ⚠️ **`results` existe mesmo em falha**, e cada item tem o seu próprio
 * `status`: o executor devolve card ruim com HTTP 200, porque "um card ruim não
 * pode derrubar o dashboard inteiro" (`main.py`). Quem lê daqui confere o
 * `status` de cada item, nunca só o HTTP — foi a confusão do B06.
 *
 * Era `Record<string, unknown>`, o que fazia `corpo.results[0]` não compilar.
 * Ninguém viu porque nada typechecava esta pasta.
 */
/**
 * O client do Supabase criado com o JWT do usuário.
 *
 * ⚠️ `ReturnType<typeof createClient>` sem argumento de tipo resolve para
 * `SupabaseClient<unknown, never, …>`, que **não aceita** o client real
 * (`<any, "public", any>`). Eram dois dos erros que apareceram no primeiro
 * `deno check` desta pasta: a anotação existia e descrevia outro tipo.
 */
type ClienteSupabase = ReturnType<typeof createClient<any>>;

interface RespostaDoExecutor {
  results?: Record<string, unknown>[];
  [chave: string]: unknown;
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
  /**
   * Lote de pedidos do A3 (B07). Quando presente, `plan` é ignorado e a resposta
   * sai como `{results, negados}` em vez de `{result}`.
   *
   * ⭐ Cada pedido é autorizado SEPARADAMENTE, e um negado não derruba os
   * outros. É a diferença entre "sua pergunta usa uma coluna que seu cargo não
   * pode ver" (o caminho atual, que perde a pergunta inteira) e "não incluí a
   * margem porque seu cargo não tem acesso" (o A4 diz, e o resto responde).
   */
  lote?: { id: string; plano: unknown; tipo?: string }[];
  /**
   * ⭐ Ids de dataset do turno multi-base (B19), escolhidos pelo A2.
   *
   * Ausente ⇒ UMA base, a do `datasetId`. É o caminho do dashboard e do chat
   * legado, e ele sai daqui idêntico ao que sempre foi.
   *
   * ⚠️ **Chegam pelo cliente** (o turno é partido em três invocações), então são
   * tratados como entrada hostil: filtrados por `organization_id` e por cargo
   * antes de qualquer coisa. Id que não passar é descartado, não recusado — o
   * turno responde com o que sobrou.
   */
  bases?: string[];
}

/**
 * A linha de `datasets` que o turno usa — declarada porque `nomearBases` é
 * genérico e o cliente do Supabase devolve `any` para estas colunas.
 *
 * ⚠️ Sem o tipo explícito, `porNome.get(...)` volta como a **restrição** do
 * genérico (`DatasetParaNome`, que só tem `id` e `name`) e o acesso a
 * `google_sheet_id` deixa de compilar — mas só num `deno check`, que este repo
 * ainda não roda no CI (I-11). Tipar aqui é o que faz o erro aparecer cedo.
 */
interface DatasetDoTurno {
  id: string;
  name: string | null;
  google_sheet_id: string | null;
  google_sheet_tab: string | null;
  google_sheet_gid: number | null;
  schema_metadata: unknown;
}

/** A mesma linha, no que a invocação 1 precisa dela. */
interface DatasetCandidato {
  id: string;
  name: string | null;
  schema_metadata: unknown;
  vocabulario_exposto: boolean | null;
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

  // ── As bases deste turno ─────────────────────────────────────────────────
  //
  // ⭐ `opcoes.bases` é o modo multi-base (B19). Ausente, é UMA base — o caminho
  // do dashboard e do chat legado, que sai daqui idêntico ao que sempre foi.
  const idsPedidos = opcoes.bases?.length ? opcoes.bases : [datasetId];

  const { data: datasetsCrus, error: datasetErr } = await supabase
    .from("datasets")
    .select(
      "id, name, organization_id, google_sheet_id, google_sheet_tab, google_sheet_gid, schema_metadata",
    )
    .in("id", idsPedidos)
    .eq("organization_id", profile.organization_id);

  // ⚠️ Ordem estável por `id`, e não é estética: `nomearBases` desempata nome
  // repetido por ordem de entrada, e um sufixo que troca de dono entre
  // requisições faria o `allowed_columns` apontar para a base errada. O
  // Postgres não promete ordem sem `order by`.
  const datasets = ((datasetsCrus ?? []) as DatasetDoTurno[])
    .filter((d) => d.google_sheet_id)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  if (!datasets.length) {
    console.error(
      "execute_plan: nenhuma base utilizavel. ids=%s org=%s achados=%d erro=%s",
      JSON.stringify(idsPedidos), profile.organization_id,
      datasetsCrus?.length ?? 0, JSON.stringify(datasetErr),
    );
    // ⚠️ A distinção importa para quem lê: base que não existe (ou é de outra
    // organização) é 403; base achada sem `google_sheet_id` é cadastro pela
    // metade, e a frase tem de dizer o que fazer.
    return datasetsCrus?.length
      ? json({ error: "Esta base precisa ser reconectada: falta o link da planilha." }, 409)
      : json({ error: "base nao encontrada" }, 403);
  }

  // ── As permissões, POR BASE ──────────────────────────────────────────────
  //
  // ⛔⛔ **Uma lista por base, nunca uma lista do turno.** Uma lista global seria
  // a união das permissões de bases diferentes: quem pode ver `salario` em RH
  // passaria a poder pedir `salario` de Vendas, e a comparação de conjuntos não
  // veria nada de errado, porque o nome está na lista. O RBAC é por dataset
  // (`role_permissions`) e esta barreira tem de ter a mesma forma.
  const { data: perms } = await supabase
    .from("role_permissions")
    .select("dataset_id, allowed_columns")
    .eq("role_id", profile.role_id)
    .in("dataset_id", datasets.map((d) => d.id));

  const permitidasPorId = new Map<string, string[]>();
  for (const p of perms ?? []) {
    const cols = ((p.allowed_columns ?? []) as string[]).filter(Boolean);
    if (cols.length) permitidasPorId.set(p.dataset_id as string, cols);
  }

  // ⭐ Base sem nenhuma coluna liberada é DESCARTADA, não fatal. Num turno
  // multi-base, derrubar tudo porque uma das seis não foi liberada esconderia as
  // respostas que ainda dão — e o A2 escolheu as bases sem saber do cargo.
  const usaveis = datasets.filter((d) => permitidasPorId.has(d.id));

  if (!usaveis.length) {
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

  // ⭐ O NOME é o que o `from` do plano casa, e sai daqui — nunca do LLM. É o
  // mesmo `nomeDaBase` que a invocação 2 usou para mostrar os nomes ao A3, e é
  // por isso que ele vive em `_shared/bases.ts`: três lugares precisam
  // concordar, e derivar o nome em cada um os fazia divergir em silêncio.
  const porNome = nomearBases<DatasetDoTurno>(usaveis);
  const nomePorId = new Map([...porNome].map(([nome, d]) => [d.id, nome]));

  // A base "principal" — a que os campos do topo do payload descrevem, e a única
  // que existe no caminho de uma base só.
  const dataset = usaveis[0];
  const allowedColumns = permitidasPorId.get(dataset.id)!;

  // ⭐ `metadados` não tem plano, então não há o que autorizar por plano: as
  // colunas pedidas são as que o cargo já pode ver, e o RBAC continua sendo o
  // `allowed_columns`. Fingir um veredito aqui, em vez de desviar, faria
  // `authorizePlan` receber `{}` e devolver "nenhuma coluna" — o A2 descreveria
  // uma base vazia e ninguém saberia por quê.
  // ── Lote do A3: autoriza pedido a pedido ─────────────────────────────────
  const negados: { id: string; motivo: string }[] = [];
  const plansDoLote: Record<string, unknown>[] = [];
  const colunasDoLote = new Set<string>();

  // {nome da base: colunas que o lote precisa dela} — é o que decide quais bases
  // entram no payload. Base que nenhum pedido nomeia não é lida.
  const colunasPorBase = new Map<string, Set<string>>();

  if (opcoes.lote) {
    for (const p of opcoes.lote) {
      // ⭐⭐ **Primeiro QUAL BASE, depois a autorização — nesta ordem.**
      //
      // Autorizar antes de saber a base obrigaria a usar alguma lista "geral", e
      // é exatamente a união de permissões que este bloco existe para não ter.
      const alvo = resolverBase(p.plano, porNome.keys());
      if (!alvo) {
        // ⚠️ NÃO é negação por cargo: o planejador nomeou uma base que não veio.
        // Chamar isso de RBAC mandaria a investigação para o lugar errado, e a
        // frase para o usuário seria mentira.
        console.warn("[ad_hoc] pedido sem base", JSON.stringify({
          id: p.id,
          from: (p.plano as Record<string, unknown> | null)?.from ?? null,
          disponiveis: [...porNome.keys()],
        }));
        negados.push({
          id: p.id,
          motivo: "não consegui identificar de qual base este recorte falava",
        });
        continue;
      }

      const permitidas = permitidasPorId.get(porNome.get(alvo.nome)!.id)!;
      const v = authorizePlan(p.plano as QueryPlan, permitidas);
      if (!v.allowed) {
        console.warn("[ad_hoc] pedido negado por RBAC", JSON.stringify({
          id: p.id, base: alvo.nome, negadas: v.forbidden, roleId: profile.role_id,
        }));
        negados.push({
          id: p.id,
          // Acentuada: esta frase chega ao A4 e vira texto na tela.
          motivo: "seu cargo não tem acesso a uma das colunas deste recorte",
        });
        continue;
      }

      plansDoLote.push({
        card_id: p.id,
        // ⭐⭐ **O `from` é REESCRITO com o nome canônico.**
        //
        // Sem isto o Python teria de reaplicar a mesma regra de resolução —
        // duas implementações da decisão de "qual base", em dois idiomas, que
        // divergiriam em silêncio (D-017). Aqui a decisão é tomada UMA vez,
        // nesta linha, e a barreira 4 do executor só a *verifica* achando
        // correspondência exata. A ponte de compatibilidade dele nunca é
        // exercitada no caminho `ad_hoc`.
        plan: { ...(p.plano as Record<string, unknown>), from: alvo.nome },
        resolved_columns: v.required,
        ...(p.tipo ? { tipo: p.tipo } : {}),
      });

      for (const c of v.required) {
        colunasDoLote.add(c);
        const cols = colunasPorBase.get(alvo.nome) ?? new Set<string>();
        cols.add(c);
        colunasPorBase.set(alvo.nome, cols);
      }
      // ⚠️ Pedido sem coluna nenhuma (`registro` de plano vazio, p. ex.) ainda
      // precisa da base no payload, senão o executor não acha a tabela.
      if (!colunasPorBase.has(alvo.nome)) {
        colunasPorBase.set(alvo.nome, new Set<string>());
      }
    }

    // ⚠️ Todos negados: nada a executar. Devolve 200 com os negados para o A4
    // dizer o que faltou — é o formato honesto, e não uma falha do chat.
    if (!plansDoLote.length) return json({ results: [], negados });
  }

  const veredito = opcoes.tipo === "metadados"
    ? { allowed: true, required: allowedColumns, forbidden: [] as string[] }
    : opcoes.lote
    ? { allowed: true, required: [...colunasDoLote], forbidden: [] as string[] }
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
    plans: opcoes.lote ? plansDoLote : [{
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
    // ── ⭐ MULTI-BASE (B19) ────────────────────────────────────────────────
    //
    // Preenchido, ELE MANDA no executor: os campos do topo passam a ser
    // ignorados, e cada pedido é autorizado contra a base que o `from` nomeia.
    // Vazio, o executor sintetiza uma base dos campos do topo — que é o caminho
    // do dashboard e do chat legado, intocado.
    //
    // ⚠️ Só as bases que o lote de fato nomeou. Mandar as seis faria o executor
    // ler seis planilhas para usar uma — latência e cota do Sheets de graça.
    //
    // ⛔ `allowed_columns` vem do `permitidasPorId`, por base. Repetir
    // `allowedColumns` aqui reintroduziria a lista global pela porta dos fundos.
    ...(opcoes.lote && colunasPorBase.size
      ? {
        bases: [...colunasPorBase.keys()].map((nome) => {
          const ds = porNome.get(nome)!;
          const permitidas = permitidasPorId.get(ds.id)!;
          return {
            nome,
            sheet_id: ds.google_sheet_id,
            tab: ds.google_sheet_tab ?? "Sheet1",
            // `?? null` e não `|| null`, pelo mesmo motivo do campo do topo:
            // gid 0 é a primeira aba, um valor legítimo.
            tab_gid: ds.google_sheet_gid ?? null,
            allowed_columns: permitidas,
            // ⚠️ Regras DESTA base. As de outra limpariam a coluna errada — e
            // "moeda_brl" aplicado a uma coluna de texto não erra alto, erra
            // devolvendo número onde havia nome.
            formatting_rules: formattingRulesFromSchema(
              ds.schema_metadata,
              colunasPorBase.get(nome)!,
            ),
          };
        }),
      }
      : {}),
  };

  try {
    const corpo = await postarNoExecutor(payload);

    if (opcoes.lote) {
      // ⭐ Lote devolve TODOS os resultados, cada um com o seu `card_id`. O A4
      // precisa deles separados: cada pedido responde um recorte diferente, e
      // juntá-los aqui perderia qual número responde o quê.
      return json({ results: corpo.results ?? [], negados });
    }

    const resultado: ExecutorResult = (corpo.results ?? [])[0] as unknown as ExecutorResult ?? {
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

/**
 * As quatro conferências de identidade do cadastro, num lugar só.
 *
 * ⚠️ **O cadastro é o único contexto do sistema que roda antes de existir
 * `allowed_columns`**, então ele não pode se apoiar no RBAC como o resto do
 * arquivo faz. Confere à mão, e o item 4 é o que impede isto de virar leitor de
 * planilha alheia para quem souber um uuid — a forma exata do I-01.
 */
async function exigirAdminDaBase(
  req: Request,
  datasetId: unknown,
): Promise<
  | { erro: Response }
  | {
    supabase: ClienteSupabase;
    roleId: string;
    dataset: {
      id: string;
      status: string | null;
      google_sheet_id: string | null;
      google_sheet_tab: string | null;
      google_sheet_gid: number | null;
      /** `jsonb` — o rascunho do cadastro. `unknown` é o tipo honesto dele. */
      sketch: unknown;
    };
  }
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { erro: json({ error: "sessao invalida" }, 401) };
  if (typeof datasetId !== "string" || !datasetId) {
    return { erro: json({ error: "datasetId obrigatorio" }, 400) };
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { erro: json({ error: "sessao invalida" }, 401) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role_id, status")
    .eq("id", auth.user.id)
    .single();

  if (!profile?.organization_id) return { erro: json({ error: "perfil sem organizacao" }, 403) };
  if (profile.status !== "ativo") return { erro: json({ error: "perfil nao ativo" }, 403) };

  // ⚠️ Admin por NOME do cargo, como o `DatabasePipeline` já faz ao conceder as
  // colunas. Não há flag booleana de admin no schema — se um dia houver, os dois
  // lugares mudam juntos.
  const { data: cargo } = await supabase
    .from("roles")
    .select("name")
    .eq("id", profile.role_id ?? "")
    .maybeSingle();

  if (!/^admin$/i.test(String(cargo?.name ?? ""))) {
    return { erro: json({ error: "apenas administradores cadastram bases" }, 403) };
  }

  // ⭐ O `.eq("organization_id", ...)` é o item 4.
  const { data: dataset } = await supabase
    .from("datasets")
    // ⭐ `sketch` entra no B14: é de lá que o `perfil_do_cadastro` lê as regras
    // de formatação decididas na etapa 3, sem ter de aceitá-las do cliente.
    .select("id, status, google_sheet_id, google_sheet_tab, google_sheet_gid, sketch")
    .eq("id", datasetId)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  if (!dataset) return { erro: json({ error: "base nao encontrada" }, 403) };
  if (!dataset.google_sheet_id) {
    return { erro: json({ error: "Esta base ainda nao tem o link da planilha." }, 409) };
  }

  return { supabase, roleId: String(profile.role_id), dataset };
}

/**
 * `perfil_do_cadastro` — o perfil da base e o vocabulário, para a etapa 4 (B14).
 *
 * ⭐ **É o que torna o Agente 1 melhor que o A2 que ele substitui.** O A2 tinha
 * só o `metadados`; a etapa 4 tem `metadados` **mais** 20 linhas **mais** o
 * vocabulário das colunas de texto — e, diferente do A2, o que ela produz passa
 * por uma pessoa antes de virar dicionário.
 *
 * ⚠️ **Nenhum dos dois pedidos daqui gasta orçamento de linha bruta**, e é
 * deliberado: `metadados` devolve contagem (nunca linha) e `vocabulario` devolve
 * valores distintos com contagem, os dois já com teto próprio no executor. O
 * débito do B10 vive no `handleAdHocExecutar`, no caminho da PERGUNTA. Cadastrar
 * a própria base não consome a cota de perguntar sobre ela — deixado explícito
 * aqui para ninguém "consertar".
 *
 * ⚠️ **Falha parcial é resposta, não erro.** Perfil e vocabulário são evidência
 * *a mais* para o modelo; se o executor recusar um deles, a etapa 4 segue com
 * menos e o prompt diz que está com menos (`entradaDaSemantica`). Derrubar o
 * cadastro porque o vocabulário de uma coluna não veio seria trocar um
 * dicionário um pouco pior por nenhum dicionário.
 */
async function handlePerfilDoCadastro(
  req: Request,
  datasetId: unknown,
): Promise<Response> {
  const acesso = await exigirAdminDaBase(req, datasetId);
  if ("erro" in acesso) return acesso.erro;
  const { supabase, roleId, dataset } = acesso;

  // Mesma trava do `amostra_do_cadastro`: só durante o cadastro. Base `active`
  // já tem dicionário, e reperfilar é assunto da Etapa 5.
  if (dataset.status !== "processing") {
    return json({ error: "O perfil do cadastro e so durante o cadastro." }, 409);
  }

  const { data: perm } = await supabase
    .from("role_permissions")
    .select("allowed_columns")
    .eq("role_id", roleId)
    .eq("dataset_id", dataset.id)
    .maybeSingle();

  const colunas: string[] = ((perm?.allowed_columns ?? []) as string[]).filter(Boolean);
  if (!colunas.length) {
    return json({ error: "Esta base ainda nao teve as colunas liberadas." }, 409);
  }

  // ⭐ **As regras da etapa 3, lidas do `sketch`** — não recebidas do cliente.
  //
  // É o que dá sentido à ordem 3 → 4: o `papel` que o perfil devolve sai do
  // `column_roles`, que vem da `formatting_rule`. Perfilar uma coluna de moeda
  // como texto faria `min`/`max` sumirem dela (o `metadados` os recusa em
  // texto), e o Agente 1 perderia justamente a evidência de que ela é medida.
  //
  // O front já grava `sketch.formattingRules` no fim da etapa 3, então o dado
  // está no banco quando esta ação roda. Ler daqui em vez de aceitar do corpo
  // não é sobre autorização — regra de formatação não autoriza nada — é sobre
  // não ter duas versões da mesma decisão em trânsito.
  const sketch = (dataset.sketch ?? null) as { formattingRules?: unknown } | null;
  const regrasDoSketch = (sketch?.formattingRules ?? {}) as Record<
    string,
    { type?: string; params?: Record<string, unknown> }
  >;
  const formatting_rules: Record<string, { type: string; params: Record<string, unknown> }> = {};
  for (const col of colunas) {
    const r = regrasDoSketch[col];
    formatting_rules[col] = { type: r?.type ?? "nenhuma", params: r?.params ?? {} };
  }

  const base = {
    sheet_id: dataset.google_sheet_id,
    tab: dataset.google_sheet_tab ?? "Sheet1",
    tab_gid: dataset.google_sheet_gid ?? null,
    allowed_columns: colunas,
    formatting_rules,
    // ⚠️ Este `caminho` é o do PAYLOAD DO EXECUTOR, não o do `plum_logs`. Ele
    // liga o teto de cardinalidade do B02 (`aplicar_regras_adhoc` no
    // `main.py`); "legado" deixaria o teto em modo observação, e o vocabulário
    // de uma coluna com 5.000 valores voltaria inteiro. É trava, não rótulo.
    caminho: "ad_hoc",
    issued_at: Math.floor(Date.now() / 1000),
  };

  // ── 1 · O perfil (`metadados` do B03) ────────────────────────────────────
  let perfil: Record<string, unknown> | null = null;
  try {
    const corpo = await postarNoExecutor({
      ...base,
      plans: [{
        card_id: "cadastro",
        plan: {},
        resolved_columns: colunas,
        tipo: "metadados",
      }],
    });
    const r = ((corpo.results ?? []) as Record<string, unknown>[])[0];
    // ⚠️ Conferir o STATUS do card, não só a ausência de exceção: o executor
    // devolve falha por card com HTTP 200. Foi assim que um objeto de erro
    // chegou ao A2 como se fosse a descrição da base, em 2026-08-20.
    if (r?.status === "ok") perfil = r;
    else console.error("[perfil-cadastro] metadados nao veio:", JSON.stringify(r));
  } catch (err) {
    console.error("[perfil-cadastro] executor indisponivel no metadados:", err);
  }

  // ── 2 · O vocabulário das candidatas ─────────────────────────────────────
  // ⭐ Quem escolhe as colunas é o PERFIL, não um LLM: texto, dentro do teto de
  // cardinalidade.
  //
  // ⚠️ **`vocabulario_exposto` NÃO é consultado aqui, de propósito.** A trava 2
  // existe para o CHAT não listar valor de texto de uma base que ninguém
  // liberou. No cadastro ela não protege nada: a etapa 3 já mostrou 20 linhas
  // cruas de todas as colunas na tela da mesma pessoa, que é uma porta maior
  // que a lista de distintos de uma coluna com no máximo 200 deles. Mesma
  // justificativa do `TETO_DE_CADASTRO` (§B8): é o dono da base registrando a
  // própria planilha, com todas as colunas concedidas. As travas 1
  // (`allowed_columns`) e 3 (teto de cardinalidade) continuam valendo.
  const vocabularios: Record<string, ValorDoVocabulario[]> = {};
  const candidatas = colunasComVocabularioDoPerfil(perfil, colunas);

  if (candidatas.length) {
    try {
      const corpo = await postarNoExecutor({
        ...base,
        plans: candidatas.slice(0, TETO_DE_VOCABULARIOS).map((col) => ({
          card_id: col,
          plan: planoDeVocabulario(col),
          resolved_columns: [col],
          tipo: "vocabulario",
        })),
      });
      for (const res of (corpo.results ?? []) as Record<string, unknown>[]) {
        // Coluna recusada pelo teto sai em silêncio: acima de 200 distintos ela
        // é identificador, e a sugestão determinística já a marcou como tal.
        if (res.status !== "ok") continue;
        vocabularios[String(res.card_id)] = lerVocabulario(String(res.card_id), res.rows);
      }
    } catch (err) {
      console.error("[perfil-cadastro] executor indisponivel no vocabulario:", err);
    }
  }

  return json({ status: "ok", perfil, vocabularios });
}

/**
 * Quantas colunas ganham vocabulário no cadastro.
 *
 * ⭐ Mais que as 4 do chat, e por um motivo: o chat pede vocabulário **por
 * pergunta**, para resolver a entidade daquela pergunta; o cadastro pede **uma
 * vez na vida da base**, e o que ele escreve vale para todas as perguntas
 * futuras. Um teto apertado aqui economiza uma chamada e deixa colunas sem
 * `vocabulario_util` conferido para sempre.
 *
 * ⚠️ Não é ilimitado porque um `batchGet` por coluna estouraria o limite de
 * 60 req/min da API do Google numa base larga.
 */
const TETO_DE_VOCABULARIOS = 12;

/**
 * `amostra_do_cadastro` — até 20 linhas, e só enquanto a base está sendo criada.
 *
 * ⭐ **A trava que importa é `status = 'processing'`.** As 20 linhas do
 * `TETO_DE_CADASTRO` existem porque o cadastro precisa ver mais que o chat; se
 * essa porta continuasse aberta depois da base ficar `active`, seria um jeito de
 * ler 20 linhas por chamada de qualquer base — quatro vezes o teto do B10, sem
 * orçamento nenhum contando.
 *
 * ⚠️ Por isso o tipo `amostra_cadastro` **não é alcançável pela ação
 * `execute_plan`**: se o front pudesse escolher o `tipo`, o teto de 5 do chat
 * deixaria de existir na prática.
 *
 * ⚠️ E `allowed_columns` sai do `role_permissions`, não do que o front mandou —
 * a concessão ao Admin já aconteceu no passo 1. Confiar na lista do cliente aqui
 * seria escrever "RBAC" e não ter RBAC.
 */
async function handleAmostraDoCadastro(
  req: Request,
  datasetId: unknown,
): Promise<Response> {
  const acesso = await exigirAdminDaBase(req, datasetId);
  if ("erro" in acesso) return acesso.erro;
  const { supabase, roleId, dataset } = acesso;

  if (dataset.status !== "processing") {
    return json({
      error: "Esta base ja foi finalizada; a amostra ampliada e so do cadastro.",
    }, 409);
  }

  const { data: perm } = await supabase
    .from("role_permissions")
    .select("allowed_columns")
    .eq("role_id", roleId)
    .eq("dataset_id", dataset.id)
    .maybeSingle();

  const colunas: string[] = ((perm?.allowed_columns ?? []) as string[]).filter(Boolean);
  if (!colunas.length) {
    // Falha fechada: sem concessão não há amostra. O passo 1 do cadastro é quem
    // concede — se chegou aqui sem ela, algo pulou o passo.
    return json({ error: "Esta base ainda nao teve as colunas liberadas." }, 409);
  }

  try {
    const corpo = await postarNoExecutor({
      sheet_id: dataset.google_sheet_id,
      tab: dataset.google_sheet_tab ?? "Sheet1",
      tab_gid: dataset.google_sheet_gid ?? null,
      plans: [{
        card_id: "cadastro",
        plan: { select: colunas },
        resolved_columns: colunas,
        tipo: "amostra_cadastro",
      }],
      allowed_columns: colunas,
      formatting_rules: {},
      issued_at: Math.floor(Date.now() / 1000),
    });

    const r = ((corpo.results ?? []) as Record<string, unknown>[])[0];
    if (!r || r.status !== "ok") {
      return json({
        status: "erro",
        mensagem: String(r?.error ?? "Não consegui ler as linhas da planilha."),
      });
    }

    return json({ status: "ok", colunas: r.columns, linhas: r.rows });
  } catch (err) {
    console.error("[amostra-cadastro] executor indisponivel:", err);
    return json({
      status: "erro",
      mensagem: "Não consegui ler a planilha agora. Tente novamente em instantes.",
    });
  }
}

/**
 * `cabecalhos_da_planilha` — o primeiro passo do cadastro (B12).
 *
 * ⭐ **É a única ação desta função que roda antes de existir permissão**, e por
 * isso a única que não pode se apoiar no `role_permissions`. A pergunta é
 * circular: quem quer saber quais colunas a planilha tem ainda não pode ter uma
 * lista de colunas autorizadas. O que ela devolve é justamente o insumo para
 * criar essa lista.
 *
 * ⚠️ **Então a autorização aqui é EXPLÍCITA, não herdada** — ver
 * `exigirAdminDaBase`, que faz as quatro conferências.
 *
 * ⚠️ E nenhuma célula de dado é lida: o executor responde com `sheets.get_meta`,
 * que busca só a linha 1. Nome de coluna não é dado do negócio; é o endereço
 * dele. Há um teste no Lambda garantindo que `load_columns` não é chamado.
 */
async function handleCabecalhos(req: Request, datasetId: unknown): Promise<Response> {
  const acesso = await exigirAdminDaBase(req, datasetId);
  if ("erro" in acesso) return acesso.erro;
  const { dataset } = acesso;

  try {
    const corpo = await postarNoExecutor({
      sheet_id: dataset.google_sheet_id,
      tab: dataset.google_sheet_tab ?? "Sheet1",
      tab_gid: dataset.google_sheet_gid ?? null,
      plans: [{ card_id: "cadastro", plan: {}, resolved_columns: [], tipo: "cabecalhos" }],
      // ⭐ Vazio, e é o cenário inteiro do bloco. O executor tem um desvio para
      // `cabecalhos` que acontece antes da barreira 4 — e recusa o tipo num lote
      // misto, justamente para esse desvio não virar carona.
      allowed_columns: [],
      formatting_rules: {},
      issued_at: Math.floor(Date.now() / 1000),
    });

    const r = ((corpo.results ?? []) as Record<string, unknown>[])[0];
    if (!r || r.status !== "ok") {
      // ⚠️ A frase do executor chega ao usuário: "a planilha não foi
      // compartilhada com o Plum" é acionável, "erro ao ler" não é.
      return json({
        status: "erro",
        mensagem: String(r?.error ?? "Não consegui ler a planilha."),
      });
    }

    return json({
      status: "ok",
      aba: r.aba,
      colunas: r.colunas,
      row_count: r.row_count,
      // ⭐ Vão para a tela do passo 1. A colisão é a C11 deixando de ser
      // silenciosa: hoje a segunda coluna some na importação e ninguém procura.
      colisoes: r.colisoes,
      colunas_sem_titulo: r.colunas_sem_titulo,
    });
  } catch (err) {
    console.error("[cabecalhos] executor indisponivel:", err);
    return json({
      status: "erro",
      mensagem: "Não consegui ler a planilha agora. Tente novamente em instantes.",
    });
  }
}

/**
 * O transporte até o executor: assina, chama, devolve o corpo. Nada de regra.
 *
 * ⭐ Extraído no B12 porque passou a ter **dois** chamadores. Duas cópias da
 * assinatura HMAC + SigV4 seria a forma mais cara possível de divergir: o
 * sintoma de uma delas ficar para trás é `401 assinatura invalida` vindo de um
 * caminho só, e ninguém procura duplicação quando o erro diz "assinatura".
 *
 * ⚠️ Lança em vez de devolver erro. Quem chama sabe o que dizer ao usuário —
 * o chat degrada para uma frase, o cadastro precisa nomear a planilha.
 */
async function postarNoExecutor(payload: unknown): Promise<RespostaDoExecutor> {
  const raw = JSON.stringify(payload);
  const assinatura = await signPayload(raw, EXECUTOR_HMAC_SECRET!);

  // SigV4 fecha o endpoint na infraestrutura (Function URL em AWS_IAM); o HMAC
  // acima usa outro segredo. Vazar um dos dois não basta para forjar payload.
  const aws = new AwsClient({
    // ⚠️ `!` porque o `Deno.env.get` devolve `string | undefined` e a ausência
    // já é tratada: sem credencial a chamada falha no SigV4, com erro do
    // provedor. Fingir um default aqui esconderia secret faltando.
    accessKeyId: AWS_ACCESS_KEY_ID!,
    secretAccessKey: AWS_SECRET_ACCESS_KEY!,
    region: AWS_REGION,
    service: "lambda",
  });

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), EXECUTOR_TIMEOUT_MS);
  try {
    const resp = await aws.fetch(`${EXECUTOR_URL}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Plum-Signature": assinatura },
      body: raw,
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`executor respondeu ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(t);
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
  // ⚠️ Era `new Date().toISOString()`, que é UTC — o Agente A filtrava o dia
  // seguinte das 21h em diante. Ver `_shared/hoje.ts`.
  const hoje = dataDeHoje();

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
// ad_hoc_reconhecer — A1 → dicionário → vocabulário. **Um LLM só, desde o B15.**
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⭐ **O A2 saiu daqui no B15, e o `metadados` saiu com ele.**
 *
 * Era `A1 → metadados → A2 → vocabulário`: uma ida ao Lambda para descrever a
 * base e uma chamada de LLM para interpretar a descrição, em toda pergunta de
 * base fria. Agora é `A1 → ler o dicionário → vocabulário` — a descrição já
 * existe, escrita no cadastro e **conferida por uma pessoa**, e ler o
 * `schema_metadata` é uma query.
 *
 * O turno encurtou de `porteiro → metadados → A2 → vocabulário → A3 → executor
 * → A4` para `porteiro → vocabulário → A3 → executor → A4`.
 *
 * ⚠️ **`etapa: "reconhecedor"` não aparece mais nos turnos `ad_hoc`.** Ela fica
 * no tipo e no CHECK porque o `plum_logs` tem linhas históricas com ela — e a
 * taxa de `cache_hit_a2` congela onde estava, porque não há mais A2 para
 * cachear. O `MANUAL.md` do B07 lista a sequência antiga; foi corrigido junto.
 *
 * ⚠️ **Um sinal se perde, e não é em silêncio (§B5).** O `metadados` era quem
 * devolvia `existe: false` para coluna que desapareceu da planilha. Agora isso
 * vira `MissingColumnError` do executor, que é **erro visível** na resposta — e
 * o dicionário passa a ser um retrato do dia do cadastro. Reperfilar é Etapa 5.
 *
 * ⚠️ A defasagem do `vocabulario_util` já está coberta: se a coluna passou de
 * 200 distintos depois do cadastro, o executor recusa o vocabulário e o A3
 * planeja sem ele — degradado, não errado.
 */
async function handleAdHocReconhecer(
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

  // ⚠️ `role_id` entra aqui desde o B20: o filtro por cargo passou a acontecer
  // NESTA invocação, porque uma base que o cargo não vê não pode nem aparecer no
  // índice que vai ao A2.
  const { data: profile } = await supabase
    .from("profiles").select("organization_id, role_id").eq("id", auth.user.id).single();
  if (!profile?.organization_id) return json({ error: "perfil sem organizacao" }, 403);
  if (!profile.role_id) {
    // Sem cargo não existe `allowed_columns`, e "sem permissão" nunca pode virar
    // "todas as permissões" — mesma regra do `handleExecutePlan`.
    return json({ error: "seu usuario ainda nao tem um cargo definido" }, 403);
  }

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

  // ── As bases candidatas ──────────────────────────────────────────────────
  //
  // ⭐ `datasetId === TODAS_AS_BASES` é o "Todas as minhas bases" do seletor: o
  // A2 escolhe entre tudo que o cargo alcança. Um id específico mantém o
  // comportamento de hoje, e é o que torna o A2 **comparável** com o status quo.
  //
  // ⚠️⚠️ **O filtro por CARGO é aqui, não depois.** Uma base que o cargo não vê
  // não pode nem aparecer no índice que vai ao modelo: o nome da planilha e os
  // nomes das colunas dela já são informação, e o A2 a mencionaria na presunção.
  const { data: candidatasCruas } = datasetId === TODAS_AS_BASES
    ? await supabase
      .from("datasets")
      .select("id, name, schema_metadata, vocabulario_exposto")
      .eq("organization_id", profile.organization_id)
      .eq("status", "active")
    : await supabase
      .from("datasets")
      .select("id, name, schema_metadata, vocabulario_exposto")
      .eq("id", datasetId)
      .eq("organization_id", profile.organization_id);

  const { data: permsDaOrg } = await supabase
    .from("role_permissions")
    .select("dataset_id, allowed_columns")
    .eq("role_id", profile.role_id)
    .in("dataset_id", (candidatasCruas ?? []).map((d) => d.id));

  const comColuna = new Set(
    (permsDaOrg ?? [])
      .filter((p) => ((p.allowed_columns ?? []) as string[]).filter(Boolean).length)
      .map((p) => p.dataset_id as string),
  );

  // Ordem estável por `id`: `nomearBases` desempata nome repetido pela ordem de
  // entrada, e o nome tem de ser o mesmo aqui e no `handleExecutePlan`.
  const candidatas = ((candidatasCruas ?? []) as DatasetCandidato[])
    .filter((d) => comColuna.has(d.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  if (!candidatas.length) {
    await registrar({
      etapa: "encaminhador",
      status: "erro",
      codigoErro: "sem_base",
      latenciaMs: 0,
    });
    return json({
      habilitado: true,
      status: "inviavel",
      mensagem: "Você não tem acesso liberado a nenhuma coluna de nenhuma base.",
    });
  }

  const porNomeDaOrg = nomearBases<DatasetCandidato>(candidatas);
  const dicionarios = new Map(
    [...porNomeDaOrg].map(([nome, ds]) => [nome, lerDicionario(ds.schema_metadata)]),
  );

  // ⚠️ Bases sem coluna descrita nenhuma saem do índice. `lerDicionario` nunca
  // lança e sempre devolve forma completa, então zero coluna significa
  // `schema_metadata` vazio de verdade — base em rascunho, ou cadastro que não
  // terminou. Oferecê-la ao A2 faria ele escolher uma base sobre a qual o A3 não
  // tem nome de coluna para planejar.
  const comDicionario = [...porNomeDaOrg.keys()].filter(
    (nome) => Object.keys(dicionarios.get(nome)!.colunas).length,
  );

  if (!comDicionario.length) {
    await registrar({
      etapa: "encaminhador",
      status: "erro",
      codigoErro: "dicionario_vazio",
      latenciaMs: 0,
    });
    return json({ habilitado: true, status: "erro", etapa: "dicionario" });
  }

  // ── A2 · Encaminhador ────────────────────────────────────────────────────
  //
  // ⭐ **O lugar dele é forçado, não escolhido.** A busca de vocabulário abaixo
  // depende de saber quais colunas importam, que depende de saber quais bases.
  // Ele tem de vir antes.
  //
  // ⚠️ Isto deixa esta invocação com três idas à rede (LLM, LLM, Lambda). A
  // versão de antes de 2026-08-21 tinha CINCO e a função morria antes de
  // responder — está dentro do orçamento, e a latência entra na verificação.
  const t2 = Date.now();
  const { encaminhamento, llm: llmA2 } = await encaminhar({
    pergunta,
    bases: comDicionario.map((nome) => ({ nome, dicionario: dicionarios.get(nome)! })),
  });

  await registrar({
    etapa: "encaminhador",
    status: encaminhamento.inviavel ? "inviavel" : "ok",
    // ⭐ `agenteInvalido` é o modelo pedindo um A3 que não existe. Não é erro
    // para o usuário — cai no generalista — mas um fallback que ninguém mede é
    // um roteador que parou de funcionar sem avisar.
    codigoErro: llmA2.erro?.codigo ??
      (encaminhamento.agenteInvalido ? "agente_invalido" : null),
    modelo: llmA2.modelo,
    provedor: llmA2.provedor,
    tokensEntrada: llmA2.tokens.entrada,
    tokensSaida: llmA2.tokens.saida,
    latenciaMs: Date.now() - t2,
    // ⚠️ A decisão é da ORGANIZAÇÃO, não de uma base — no modo "todas" o
    // `dataset_id` do turno é o sentinela e não aponta para dataset nenhum.
    // Qual base saiu escolhida está aqui, no `resposta`.
    respostaAgente: {
      agente: encaminhamento.agente.id,
      bases: encaminhamento.bases,
      presuncao: encaminhamento.presuncao,
      inviavel: encaminhamento.inviavel || undefined,
      bases_descartadas: encaminhamento.basesDescartadas.length
        ? encaminhamento.basesDescartadas
        : undefined,
      candidatas: comDicionario,
    },
  });

  // ⭐ Inviável é RESPOSTA, não falha — o front já trata assim. E dizer isso aqui
  // é mais barato que deixar o A3 inventar um `from` sobre a base menos errada.
  if (encaminhamento.inviavel) {
    return json({
      habilitado: true,
      status: "inviavel",
      mensagem: encaminhamento.inviavel,
    });
  }

  const escolhidas = encaminhamento.bases;
  const dicionarioPrincipal = dicionarios.get(escolhidas[0])!;

  // ── Coleta determinística: vocabulário (B04) ─────────────────────────────
  // Sem LLM. As colunas vêm do que o DICIONÁRIO marcou — antes era o A2 — e as
  // três travas do B04 continuam valendo: `allowed_columns` (conferido pedido a
  // pedido no `handleExecutePlan`), a flag da base, e o teto de cardinalidade
  // que o executor aplica.
  //
  // ⚠️ **Só da PRIMEIRA base escolhida**, e é limitação declarada: o pedido de
  // vocabulário carrega o nome da coluna como `card_id`, e duas bases com uma
  // coluna homônima colidiriam nessa chave — o A3 receberia os valores de uma
  // como se fossem da outra. Resolver exige prefixar a chave pelo nome da base,
  // o que muda o contrato do `lerVocabulario`. Fica para o bloco do cruzamento.
  const vocabularios: Record<string, ValorDoVocabulario[]> = {};
  const dsPrincipal = porNomeDaOrg.get(escolhidas[0])!;
  const querVocabulario = colunasComVocabulario(dicionarioPrincipal);

  if (dsPrincipal.vocabulario_exposto && querVocabulario.length) {
    const t3 = Date.now();
    const resp = await handleExecutePlan(req, dsPrincipal.id, {}, {
      caminho: "ad_hoc",
      lote: querVocabulario.slice(0, 4).map((col) => ({
        id: col,
        plano: planoDeVocabulario(col),
        tipo: "vocabulario",
      })),
    });
    const corpoVoc = await resp.json().catch(() => null);

    for (const res of (corpoVoc?.results ?? []) as Record<string, unknown>[]) {
      // ⚠️ Coluna recusada pelo teto de cardinalidade sai daqui em silêncio, e
      // é o comportamento certo: acima de 200 distintos ela é identificador, e
      // o A3 planeja melhor sem uma lista truncada do que com ela.
      if (res.status !== "ok") continue;
      vocabularios[String(res.card_id)] = lerVocabulario(String(res.card_id), res.rows);
    }

    await registrar({
      etapa: "executor",
      status: "ok",
      latenciaMs: Date.now() - t3,
      respostaAgente: {
        vocabularios_pedidos: querVocabulario,
        obtidos: Object.keys(vocabularios),
        base: escolhidas[0],
      },
    });
  }

  return json({
    habilitado: true,
    status: "ok",
    // ⚠️ `cacheHit` continua no corpo, sempre `false`: o A2 novo não cacheia (ver
    // D-054) e o front ainda lê o campo. Removê-lo é limpeza de outro bloco.
    cacheHit: false,
    // ⭐ **Ids de dataset, não dicionários.** O servidor relê o `schema_metadata`
    // na 2ª invocação — ver o comentário de `bases` no corpo da requisição.
    bases: escolhidas.map((nome) => porNomeDaOrg.get(nome)!.id),
    agente: encaminhamento.agente.id,
    presuncaoDoEncaminhador: encaminhamento.presuncao || undefined,
    vocabularios,
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// ad_hoc_planejar — só o A3. A invocação que existe por causa do relógio.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ **Isto era a segunda metade do `ad_hoc_reconhecer` até 2026-08-21.** Juntas,
 * as duas encadeavam CINCO idas à rede numa invocação só — porteiro, Lambda, A2,
 * Lambda e o A3 — e a última é um modelo de raciocínio, lento por construção.
 *
 * ⭐ O sintoma foi cruel: o `plum_logs` mostrava `porteiro`, `executor`,
 * `reconhecedor` e `planejador` todos gravados, com um plano bem formado, e
 * **nenhuma** linha do `ad_hoc_executar`. A função terminava o trabalho e morria
 * antes de responder — logs são gravados durante a execução, o `return` é a
 * última coisa. Separar dá ao agente lento um orçamento de tempo só dele, e
 * torna a latência dele legível isolada no log.
 *
 * ⚠️ O **dicionário** e os `vocabularios` chegam do cliente (o parâmetro é
 * `dicionarioCru`; até o B15 era `reconhecimento`, e o nome antigo ficou neste
 * comentário até 2026-08-27). É seguro pela mesma
 * razão dos `pedidos`: **nada disso é decisão de autorização.** O
 * `authorizePlan` roda no servidor sobre o plano final e a barreira 4 do Lambda
 * reconfere contra o `allowed_columns` lido com o JWT. O vocabulário contém
 * valores da base, sim — mas são os valores que aquele mesmo usuário acabou de
 * ter permissão de ler, indo e voltando para ele.
 */
async function handleAdHocPlanejar(
  req: Request,
  pergunta: unknown,
  basesCruas: unknown,
  agenteCru: unknown,
  vocabularios: unknown,
  turno: Partial<DadosDoTurno>,
): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "sem credencial" }, 401);
  if (typeof pergunta !== "string" || !pergunta.trim()) {
    return json({ error: "prompt obrigatorio" }, 400);
  }
  const ids = (Array.isArray(basesCruas) ? basesCruas : [])
    .filter((x): x is string => typeof x === "string" && !!x);
  if (!ids.length) return json({ error: "bases obrigatorias" }, 400);

  const registrar = criarRegistrador(authHeader, turno, "ad_hoc");
  const voc = (vocabularios ?? {}) as Record<string, ValorDoVocabulario[]>;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return json({ error: "sessao invalida" }, 401);

  const { data: profile } = await supabase
    .from("profiles").select("organization_id, role_id").eq("id", auth.user.id).single();
  if (!profile?.organization_id) return json({ error: "perfil sem organizacao" }, 403);
  if (!profile.role_id) {
    return json({ error: "seu usuario ainda nao tem um cargo definido" }, 403);
  }

  // ── ⭐⭐ O DICIONÁRIO É RELIDO AQUI, NÃO RECEBIDO ─────────────────────────
  //
  // Até 2026-08-28 o dicionário fazia uma volta pelo cliente entre as duas
  // invocações, e esta função o renormalizava por desconfiança. Com N bases,
  // seriam N dicionários indo e voltando pelo navegador — payload grande de dado
  // que ele não usa, e N renormalizações defensivas.
  //
  // ⚠️ O que chega agora são **ids**, e eles são entrada hostil: o cliente pode
  // mandar qualquer uuid. O filtro por `organization_id` e por cargo é o que
  // impede que um id de outra base responda a pergunta.
  const { data: crus } = await supabase
    .from("datasets")
    .select("id, name, schema_metadata")
    .in("id", ids)
    .eq("organization_id", profile.organization_id);

  const { data: perms } = await supabase
    .from("role_permissions")
    .select("dataset_id, allowed_columns")
    .eq("role_id", profile.role_id)
    .in("dataset_id", (crus ?? []).map((d) => d.id));

  const comColuna = new Set(
    (perms ?? [])
      .filter((p) => ((p.allowed_columns ?? []) as string[]).filter(Boolean).length)
      .map((p) => p.dataset_id as string),
  );

  // Ordem estável por `id` — o mesmo critério da invocação 1 e do
  // `handleExecutePlan`. Sem ela o desempate de nome repetido trocaria de dono
  // entre as invocações, e o `from` que o A3 emitisse apontaria para outra base.
  const datasets = ((crus ?? []) as { id: string; name: string | null; schema_metadata: unknown }[])
    .filter((d) => comColuna.has(d.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // ⛔ Id descartado é LOGADO, não fatal: o cliente pode ter mandado lixo, ou uma
  // base pode ter sido revogada entre as duas invocações. O turno responde com o
  // que sobrou — mas o descarte não é silencioso.
  if (datasets.length !== ids.length) {
    console.warn("[a3] bases descartadas", JSON.stringify({
      pedidas: ids,
      aceitas: datasets.map((d) => d.id),
    }));
  }

  if (!datasets.length) {
    await registrar({
      etapa: "planejador",
      status: "erro",
      codigoErro: "sem_base_valida",
      latenciaMs: 0,
    });
    return json({ status: "erro", etapa: "planejador" });
  }

  // ⭐ O MESMO `nomearBases` das outras duas etapas. É o que faz o nome que o A3
  // vê no prompt ser o nome que a barreira 3 vai casar com o `from` — ver o
  // cabeçalho de `_shared/bases.ts`.
  const porNome = nomearBases<{ id: string; name: string | null; schema_metadata: unknown }>(datasets);
  const dicionariosPorNome = new Map(
    [...porNome].map(([nome, ds]) => [nome, lerDicionario(ds.schema_metadata)]),
  );

  // ⚠️ Revalidado contra o registro, e **de novo**: o id do agente voltou pelo
  // cliente. Hoje o registro tem um A3 só, então isto sempre resolve para o
  // generalista — e é justamente por isso que o teste do roteamento usa o
  // `REGISTRO_DE_TESTE`.
  const { agente, caiuNoPadrao } = resolverAgente(agenteCru);

  const t0 = Date.now();
  const { plano, llm: llmA3 } = await planejar({
    pergunta,
    bases: [...dicionariosPorNome].map(([nome, dicionario]) => ({ nome, dicionario })),
    vocabularios: voc,
  });

  const registrarA3 = async (status: StatusLog) => {
    await registrar({
      etapa: "planejador",
      status,
      codigoErro: llmA3.erro?.codigo ?? null,
      modelo: llmA3.modelo,
      provedor: llmA3.provedor,
      tokensEntrada: llmA3.tokens.entrada,
      tokensSaida: llmA3.tokens.saida,
      latenciaMs: Date.now() - t0,
      presuncoesQtd: plano.presuncoes.length,
      // ⭐ `_dicionario` é metadado da ENTRADA, não saída do agente, e está aqui
      // de propósito: `presuncoes_qtd` só é interpretável sabendo se o
      // dicionário tinha passado por gente. Um dicionário `versao: 1` faz o A3
      // presumir mais **por instrução** (ver `paraPrompt`), então sem esta chave
      // uma queda de presunções não se distingue de uma amostra de bases já
      // conferidas. Prefixo `_` marca que não veio do modelo.
      respostaAgente: {
        ...plano,
        // ⚠️ Passou a ser POR BASE no B20: com N bases, uma versão só não diz
        // nada — uma base v2 conferida e uma v1 crua no mesmo turno fariam a
        // média mentir nas duas direções.
        _dicionario: [...dicionariosPorNome].map(([nome, d]) => ({
          base: nome,
          versao: d.versao,
          conferido: d.conferido,
          colunas: Object.keys(d.colunas).length,
        })),
        // ⭐ Qual A3 planejou, e se o id veio inválido do cliente. Sem isto o
        // roteamento não é auditável depois do fato.
        _agente: { id: agente.id, caiu_no_padrao: caiuNoPadrao },
      },
    });
  };

  // ── Resolvedor de entidade (B04) — código, sem LLM ───────────────────────
  // ⭐ Dois candidatos plausíveis viram PERGUNTA, nunca escolha: escolher errado
  // devolve um número certo sobre a pessoa errada.
  const literais = new Map<string, string>();
  for (const { termo, coluna } of plano.entidades) {
    const casado = resolverEntidade(termo, voc[coluna] ?? []);

    if (casado.tipo === "exato") {
      literais.set(termo, casado.literal);
    } else if (casado.tipo === "ambiguo") {
      await registrarA3("desambiguacao");
      return json({ status: "desambiguacao", termo, opcoes: casado.opcoes });
    }
    // `nenhum`: segue com o termo cru. O `where` do executor normaliza os dois
    // lados, então ainda pode casar — e devolver zero é mais honesto que trocar
    // por um valor que o resolvedor não teve confiança para escolher.
  }

  const pedidos: Pedido[] = plano.pedidos.map((p) => ({
    ...p,
    plano: aplicarLiterais(p.plano, literais) as Record<string, unknown>,
  }));

  await registrarA3(plano.inviavel ? "inviavel" : pedidos.length ? "ok" : "erro");

  if (plano.inviavel) return json({ status: "inviavel", mensagem: plano.inviavel });
  if (!pedidos.length) return json({ status: "erro", etapa: "planejador" });

  return json({ status: "ok", pedidos, presuncoes: plano.presuncoes });
}

// ─────────────────────────────────────────────────────────────────────────────
// ad_hoc_executar — executor → A4. A segunda metade do turno.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ **Os `pedidos` vêm do cliente, e isso é seguro pelo mesmo motivo de sempre:
 * plano é candidato, nunca verdade.** O `authorizePlan` roda aqui no servidor
 * para cada pedido, e a barreira 4 do Lambda reconfere contra o
 * `allowed_columns` lido do banco com o JWT de quem perguntou. É exatamente a
 * postura do `execute_plan` do caminho atual, que também recebe o plano pronto.
 */
async function handleAdHocExecutar(
  req: Request,
  pergunta: unknown,
  datasetId: unknown,
  pedidos: unknown,
  presuncoes: unknown,
  basesCruas: unknown,
  turno: Partial<DadosDoTurno>,
): Promise<Response> {
  if (typeof pergunta !== "string" || !Array.isArray(pedidos) || !pedidos.length) {
    return json({ error: "pergunta e pedidos obrigatorios" }, 400);
  }

  const authHeader = req.headers.get("Authorization");
  const registrar = criarRegistrador(authHeader, turno, "ad_hoc");
  const lista = pedidos as Pedido[];

  // ── Orçamento de linhas brutas (B10) ─────────────────────────────────────
  //
  // ⭐ Só entra em cena quando há `registro` ou `amostra` no lote. Agregado,
  // série, metadados e vocabulário não devolvem linha, e cobrar por eles
  // empurraria o planejador a agregar MENOS para caber — o contrário do que o
  // orçamento quer.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader ?? "" } } },
  );

  // ⚠️ Filtrado aqui só quanto à FORMA. Quem valida contra `organization_id` e
  // contra o cargo é o `handleExecutePlan` — dois lugares filtrando o mesmo id
  // por critérios diferentes é como se perde a noção de qual deles protege.
  const idsDeBase = (Array.isArray(basesCruas) ? basesCruas : [])
    .filter((x): x is string => typeof x === "string" && !!x);

  let negadosPorOrcamento: { id: string; motivo: string }[] = [];
  let aprovados = lista;

  if (lista.some((p) => consomeOrcamento(p.tipo))) {
    // ── ⭐⭐ O ORÇAMENTO É POR BASE, NÃO POR TURNO (§B4) ────────────────────
    //
    // Uma pergunta que lê duas planilhas com 5 linhas de cada são 10 linhas, e
    // debitar de uma cota só faria o teto virar sugestão assim que alguém
    // perguntasse cruzando.
    //
    // ⛔ E há um motivo mecânico: `turno.datasetId` é `null` no modo "todas", e
    // `saldoDaJanela(null)` consulta `dataset_id = ""` — que falha o cast de uuid
    // e cai no fail-closed (saldo 0). Sem isto, TODA pergunta com `registro` no
    // modo "Todas" seria negada com a frase "você já viu o máximo de linhas",
    // que é mentira.
    //
    // ⚠️ Base sem saldo nega os pedidos DELA; os das outras seguem. É a negação
    // parcial que o produto promete.
    const idsParaOrcamento = idsDeBase.length
      ? idsDeBase
      : (turno.datasetId ? [turno.datasetId] : []);

    // O saldo de cada base, em paralelo — são leituras independentes.
    const saldos = new Map<string, number>();
    let saldoMinimo = 0;
    let gastoMaximo = 0;

    if (!idsParaOrcamento.length) {
      // Nenhuma base identificável e há pedido que consome: fail-closed. É o
      // mesmo critério do `saldoDaJanela` — orçamento que abre quando não sabe
      // contra o que medir não é orçamento.
      console.error("[orcamento] pedido que consome sem base identificavel");
      aprovados = [];
      negadosPorOrcamento = lista.filter((p) => consomeOrcamento(p.tipo)).map((p) => ({
        id: p.id,
        motivo: "não consegui medir sua cota de linhas detalhadas desta base",
      }));
    } else {
      const medidos = await Promise.all(
        idsParaOrcamento.map(async (id) => [id, await saldoDaJanela(supabase, id)] as const),
      );
      for (const [id, g] of medidos) {
        saldos.set(id, g.saldo);
        gastoMaximo = Math.max(gastoMaximo, g.gasto);
      }
      // ⚠️⚠️ **O mais apertado manda no lote, e isto é DÍVIDA REGISTRADA** —
      // ver "Dívidas conhecidas" em `contexto/20-pendencias.md`. Não conserte
      // sem ler o porquê lá.
      //
      // `aprovarLote` decide por saldo único, e um pedido não declara de qual
      // base ele lê — quem sabe isso é o `from`. Usar o menor saldo erra para o
      // lado seguro: nunca entrega mais do que a base mais gasta permite.
      //
      // ⛔ O conserto óbvio (chamar `resolverBase` aqui) põe a decisão de "qual
      // base" em DOIS lugares deste arquivo, e a divergência entre eles não é
      // erro de coluna — é autorizar contra a base A e executar sobre a B. O
      // caminho certo é `aprovarLote` receber `{base: saldo}` e o pedido carregar
      // a base que a barreira 3 já resolveu.
      saldoMinimo = Math.min(...idsParaOrcamento.map((id) => saldos.get(id) ?? 0));

      const veredito = aprovarLote(lista, saldoMinimo, TETO_POR_PEDIDO);
      aprovados = veredito.aprovados as Pedido[];
      negadosPorOrcamento = veredito.negados;
    }

    if (negadosPorOrcamento.length) {
      console.warn(
        `[orcamento] ${negadosPorOrcamento.length} pedido(s) negados — ` +
          `pior gasto ${gastoMaximo}/${TETO_DE_LINHAS_BRUTAS} na janela, ` +
          `bases ${JSON.stringify(idsParaOrcamento)}`,
      );
    }
  }

  // ⚠️ Todos negados pelo orçamento: nada a executar, e a resposta é uma frase,
  // não uma falha. O usuário estourou uma cota, não quebrou nada.
  if (!aprovados.length) {
    await registrar({
      etapa: "executor",
      status: "negado",
      codigoErro: "orcamento_esgotado",
      linhasBrutasEntregues: 0,
    });
    return json({
      status: "negado",
      mensagem:
        "Você já viu o máximo de linhas detalhadas desta base nas últimas " +
        `${JANELA_HORAS} horas. Perguntas que somam, contam ou agrupam continuam ` +
        "funcionando normalmente.",
    });
  }

  // ── Executor ─────────────────────────────────────────────────────────────
  const t0 = Date.now();
  const resp = await handleExecutePlan(req, datasetId, {}, {
    caminho: "ad_hoc",
    lote: aprovados.map((p) => ({ id: p.id, plano: p.plano, tipo: p.tipo })),
    ...(idsDeBase.length ? { bases: idsDeBase } : {}),
  });
  const corpo = await resp.json().catch(() => null);
  const results = (corpo?.results ?? []) as Record<string, unknown>[];
  const negadosRbac = [
    ...((corpo?.negados ?? []) as { id: string; motivo: string }[]),
    ...negadosPorOrcamento,
  ];

  const porId = new Map(lista.map((p) => [p.id, p]));
  const resultados: ResultadoDePedido[] = [
    ...results.map((res) => ({
      id: String(res.card_id),
      porque: porId.get(String(res.card_id))?.porque ?? "",
      status: res.status === "ok" ? ("ok" as const) : ("erro" as const),
      dados: res.status === "ok" ? { colunas: res.columns, linhas: res.rows } : undefined,
      motivo: res.status === "ok"
        ? undefined
        : String(res.error ?? "não foi possível calcular este recorte"),
    })),
    ...negadosRbac.map((n) => ({
      id: n.id,
      porque: porId.get(n.id)?.porque ?? "",
      status: "negado" as const,
      motivo: n.motivo,
    })),
  ];

  // ── ⚠️ O DÉBITO, e ele é uma escrita VERIFICADA ──────────────────────────
  //
  // O executor devolve `linhas_brutas_entregues` por pedido — quem sabe quanto
  // saiu é ele, não uma estimativa daqui.
  //
  // ⭐ Esta gravação NÃO pode ser best-effort como o resto do log. O saldo sai
  // de `SUM(plum_logs.linhas_brutas_entregues)`, então um débito que não grava
  // é uma linha bruta que saiu de graça — e, se o log estiver quebrado, saem
  // todas, para sempre. Se não gravar, o turno falha.
  const entregues = results.reduce(
    (t, r) => t + (typeof r.linhas_brutas_entregues === "number" ? r.linhas_brutas_entregues : 0),
    0,
  );

  const comDados = resultados.filter((x) => x.status === "ok");

  if (entregues > 0) {
    const debitar = criarRegistradorVerificado(supabase as never, turno, "ad_hoc");
    const { ok, erro } = await debitar({
      etapa: "executor",
      status: "ok",
      latenciaMs: Date.now() - t0,
      linhasBrutasEntregues: entregues,
      respostaAgente: { debito: entregues, tipos: aprovados.map((p) => p.tipo) },
    });

    if (!ok) {
      console.error("[orcamento] debito falhou, turno recusado:", erro);
      return json({
        status: "erro",
        etapa: "orcamento",
        mensagem:
          "Não consegui registrar o uso desta consulta, então preferi não " +
          "entregá-la. Tente de novo em instantes.",
      });
    }
  } else {
    await registrar({
      etapa: "executor",
      status: comDados.length ? "ok" : negadosRbac.length ? "negado" : "erro",
      latenciaMs: Date.now() - t0,
      linhasBrutasEntregues: 0,
    });
  }

  // ⚠️ Nenhum resultado: nada para o A4 interpretar. Chamar o modelo caro aqui
  // produziria uma frase educada sobre o nada.
  if (!comDados.length) {
    return json({
      status: negadosRbac.length ? "negado" : "erro",
      // ⭐⭐ `etapa` ENTRA AQUI, e a ausência dela já custou uma investigação.
      //
      // Este retorno gravava `etapa: "executor"` no log logo acima e devolvia a
      // resposta HTTP **sem** o campo — então o front caía no default dele
      // (`?? 'interprete'`, `PlumChat.tsx`) e a tela acusava o A4 de uma falha
      // que foi do executor. Em 2026-08-28 isso mandou o diagnóstico para o
      // agente errado, com o log dizendo a coisa certa ao lado.
      //
      // ⚠️ Sem queda para o legado, a mensagem na tela É a principal superfície
      // de diagnóstico — um default que adivinha a etapa derrota o mecanismo que
      // essa decisão criou.
      etapa: "executor",
      mensagem: negadosRbac.length
        ? "Seu cargo não tem acesso às colunas necessárias para responder isso."
        : null,
    });
  }

  // ── A4 · Intérprete ──────────────────────────────────────────────────────
  const t1 = Date.now();
  const { texto, llm } = await interpretar(
    pergunta,
    resultados,
    (Array.isArray(presuncoes) ? presuncoes : []) as Presuncao[],
  );

  await registrar({
    etapa: "interprete",
    status: texto ? "ok" : "erro",
    codigoErro: llm.erro?.codigo ?? null,
    modelo: llm.modelo,
    provedor: llm.provedor,
    tokensEntrada: llm.tokens.entrada,
    tokensSaida: llm.tokens.saida,
    latenciaMs: Date.now() - t1,
    respostaAgente: texto,
  });

  if (!texto) return json({ status: "erro", etapa: "interprete" });
  return json({ status: "ok", resposta: texto });
}

/** Teto por pedido do executor (`query_engine/linhas.py`). Espelhado aqui para
 *  a reserva ser feita pelo PIOR caso, antes de qualquer linha ser lida. */
const TETO_POR_PEDIDO = 5;

/**
 * Quanto de linha bruta este usuário já recebeu desta base na janela.
 *
 * ⭐ Sai de `plum_logs`, sem tabela nova: a coluna existe desde a Etapa 0 e a
 * RLS já limita à organização.
 *
 * ⚠️ **Mas a RLS de leitura é POR ORGANIZAÇÃO, não por pessoa** — a policy
 * "membro ativo le o log da org" deixa qualquer membro ler o log de todos. Sem
 * o `user_id` explícito no filtro, a cota viraria coletiva: um colega gastaria
 * as 200 linhas de todo mundo. É a mesma armadilha do RLS ≠ GRANT — supor que a
 * policy já faz o recorte que você queria.
 *
 * ⚠️ **A chave não é `sessao_id`.** Ele é uuid do cliente, renovado a cada F5 —
 * amarrar a cota a ele daria orçamento novo a cada recarga. O aviso está escrito
 * desde a Etapa 0 na migration, no `log.ts` e no `PlumChat.tsx`.
 */
async function saldoDaJanela(
  supabase: ClienteSupabase,
  datasetId: string | null | undefined,
): Promise<Gasto> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user?.id) throw new Error("sem usuario no JWT");

    const desde = new Date(Date.now() - JANELA_HORAS * 3600_000).toISOString();
    const { data, error } = await supabase
      .from("plum_logs")
      .select("linhas_brutas_entregues")
      .eq("user_id", auth.user.id)
      .eq("dataset_id", datasetId ?? "")
      .gt("linhas_brutas_entregues", 0)
      .gte("created_at", desde);

    // ⚠️ Postgrest não lança: erro vem em `error` com `data: null`. Destruturar
    // só o `data` faria `data ?? []` virar saldo cheio — o orçamento falharia
    // ABERTO exatamente quando o banco está ruim. Foi assim que a gravação do
    // cache do A2 ficou meses invisível.
    if (error) throw new Error(error.message);

    return calcularSaldo((data ?? []).map((l) => l.linhas_brutas_entregues as number));
  } catch (e) {
    // ⚠️ Falha ao LER o saldo trata como esgotado, não como livre. Um orçamento
    // que abre quando o banco tosse não é orçamento — e o custo do lado seguro
    // é uma pergunta respondida sem linha detalhada.
    console.error("[orcamento] leitura do saldo falhou:", e instanceof Error ? e.message : e);
    return { gasto: TETO_DE_LINHAS_BRUTAS, saldo: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      action, prompt, schemaMetadata, executorResult, datasetId, plan,
      // ⚠️ Vêm do cliente e são plano de consulta — o que é seguro pelo mesmo
      // motivo que o `plan` acima: o `authorizePlan` roda no servidor para cada
      // pedido e a barreira 4 do Lambda reconfere. Plano é candidato, nunca
      // verdade (§4 regra 1).
      pedidos, presuncoes, vocabularios,
      // ⭐ Multi-base (B19/B20). `bases` são ids de dataset escolhidos pelo A2 na
      // 1ª invocação; `agente` é o id do A3 que ele escolheu.
      //
      // ⚠️ Vêm do cliente porque o turno é partido em três invocações — e por
      // isso são revalidados no servidor: `bases` contra `organization_id` e
      // contra o cargo, `agente` contra o registro de `_shared/agentes.ts`.
      // Continuação de estado que passa pelo navegador é entrada, não memória.
      //
      // ⛔ `dicionario` SAIU do corpo em 2026-08-28: o servidor relê o
      // `schema_metadata` das bases escolhidas. Com N bases, N dicionários
      // fazendo essa volta era payload grande no navegador para dado que ele não
      // usa — e obrigava a renormalizar cada um por desconfiança.
      bases, agente,
      // Identificam a conversa e a pergunta, para o log costurar as etapas.
      // Gerados no cliente — ver `20260818110000_plum_logs.sql`. Opcionais de
      // propósito: front antigo continua funcionando, só sem registro.
      sessaoId, turnoId,
    } = await req.json();

    // ⛔⛔ **O SENTINELA NÃO PODE ENTRAR NO `turno`.**
    //
    // `plum_logs.dataset_id` é uuid com foreign key para `datasets`, e o
    // registrador escreve `turno.datasetId` direto nele. Com `"todas"` ali,
    // TODO insert de log do turno falharia no cast — e log é best-effort, então
    // as linhas simplesmente não apareceriam. O modo "Todas as minhas bases"
    // ficaria invisível no `plum_logs`, que é justamente onde ele precisa ser
    // auditado (I-12: conferir no banco, não na tela).
    //
    // ⭐ `null` é o valor certo, não um id inventado: no modo "todas" a decisão
    // é da ORGANIZAÇÃO. Qual base o A2 escolheu está no `resposta` da etapa
    // `encaminhador`.
    const turno = {
      sessaoId,
      turnoId,
      datasetId: datasetId === TODAS_AS_BASES ? null : datasetId,
    };
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
    // ⭐ Fora do `ad_hoc` e fora do legado: é o CADASTRO, não o chat. Não passa
    // pela chave `remake_habilitado` nem escreve em `plum_logs` — não há turno,
    // não há pergunta, e uma linha de log por leitura de cabeçalho poluiria a
    // tabela que mede o chat.
    if (action === "cabecalhos_da_planilha") {
      return await handleCabecalhos(req, datasetId);
    }

    if (action === "perfil_do_cadastro") {
      return await handlePerfilDoCadastro(req, datasetId);
    }
    if (action === "amostra_do_cadastro") {
      return await handleAmostraDoCadastro(req, datasetId);
    }

    if (action === "ad_hoc_reconhecer") {
      return await handleAdHocReconhecer(req, prompt, datasetId, turno);
    }
    if (action === "ad_hoc_planejar") {
      return await handleAdHocPlanejar(req, prompt, bases, agente, vocabularios, turno);
    }
    if (action === "ad_hoc_executar") {
      return await handleAdHocExecutar(
        req, prompt, datasetId, pedidos, presuncoes, bases, turno,
      );
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
