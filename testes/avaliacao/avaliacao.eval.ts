/**
 * A suíte de avaliação do `ad_hoc` — B17.
 *
 * ── ⛔ ELA NÃO RODA NO `npm test`, E ISSO É DELIBERADO ──────────────────────
 *
 * Cada pergunta aqui chama **modelo de verdade**, três vezes, e o executor
 * real. No CI ficaria caro e instável — e o I-10 já mostrou o custo de um teste
 * que falha por motivo alheio ao código: some a confiança na suíte inteira, não
 * só naquele teste. O `vitest.config.ts` inclui `*.test.ts`; este arquivo é
 * `*.eval.ts`, então não é alcançado por acidente.
 *
 *     npm run avaliacao
 *
 * ── ⭐ O QUE ELA MEDE, E O QUE ELA NÃO MEDE ────────────────────────────────
 *
 * Só a **metade mecânica**: o plano emitiu `std` na pergunta de dispersão?
 * declarou presunção onde havia ambiguidade? pediu linha bruta onde agregação
 * bastava? Isso é verificável e vira regressão de verdade.
 *
 * ⛔ **Ela não julga se a resposta está boa.** Essa metade é humana: o runner
 * imprime pergunta, plano, presunções e resposta final, e o 👤 lê e nota. Um
 * `expect` sobre qualidade de prosa mediria a existência de palavras-chave, que
 * é pior que não medir — daria verde para uma resposta errada bem escrita.
 *
 * ── ⚠️ O QUE PRECISA EXISTIR ANTES DE RODAR ────────────────────────────────
 *
 * Variáveis de ambiente (a suíte fala com produção, não com mock):
 *
 *   PLUM_URL         URL do projeto Supabase
 *   PLUM_ANON_KEY    a anon key
 *   PLUM_JWT         um access token de usuário Admin com acesso à base
 *   PLUM_DATASET_ID  o uuid da base a avaliar (a `plum_base_suja`)
 *
 * ⚠️ **JWT de usuário, nunca `service_role`.** Metade do que se está avaliando é
 * o comportamento sob RBAC de coluna: com `service_role` o RLS não se aplica, a
 * suíte passaria a medir uma cadeia que nenhum usuário executa, e um vazamento
 * de coluna sairia verde.
 */

import { describe, expect, it } from "vitest";

import { PERGUNTAS, type Pergunta } from "./perguntas.ts";

const URL_BASE = process.env.PLUM_URL;
const ANON = process.env.PLUM_ANON_KEY;
const JWT = process.env.PLUM_JWT;
const DATASET = process.env.PLUM_DATASET_ID;

const CONFIGURADO = Boolean(URL_BASE && ANON && JWT && DATASET);

/** Uma pergunta pode ser lenta: o planejador é modelo de raciocínio. */
const TIMEOUT_MS = 120_000;

interface Resultado {
  status?: string;
  [chave: string]: unknown;
}

async function chamar(corpo: Record<string, unknown>): Promise<Resultado> {
  const resp = await fetch(`${URL_BASE}/functions/v1/ai-plum-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON!,
      Authorization: `Bearer ${JWT}`,
    },
    body: JSON.stringify({ ...corpo, datasetId: DATASET }),
  });
  return (await resp.json().catch(() => ({}))) as Resultado;
}

/**
 * Roda um turno completo, na mesma ordem que o front roda.
 *
 * ⚠️ **Três invocações, não uma**, e a suíte tem de repetir isso: o turno inteiro
 * numa chamada encadeava cinco idas à rede e a função morria antes de responder
 * (o sintoma do B07-bis). Uma suíte que fizesse diferente do front mediria um
 * caminho que ninguém executa.
 */
async function rodarTurno(pergunta: string, sessaoId: string, turnoId: string) {
  const rec = await chamar({ action: "ad_hoc_reconhecer", prompt: pergunta, sessaoId, turnoId });
  if (rec.habilitado === false) throw new Error("remake_habilitado está desligado nesta org");
  if (rec.status !== "ok") {
    return { etapa: "reconhecer" as const, rec, pl: null, ex: null };
  }

  const pl = await chamar({
    action: "ad_hoc_planejar",
    prompt: pergunta,
    dicionario: rec.dicionario,
    vocabularios: rec.vocabularios,
    sessaoId,
    turnoId,
  });
  if (pl.status !== "ok") return { etapa: "planejar" as const, rec, pl, ex: null };

  const ex = await chamar({
    action: "ad_hoc_executar",
    prompt: pergunta,
    pedidos: pl.pedidos,
    presuncoes: pl.presuncoes,
    sessaoId,
    turnoId,
  });
  return { etapa: "executar" as const, rec, pl, ex };
}

/** Toda agregação que aparece no `select` de todos os pedidos. */
function agregacoesDoPlano(pedidos: unknown): string[] {
  const out: string[] = [];
  for (const p of (pedidos ?? []) as { plano?: { select?: unknown } }[]) {
    for (const item of (p.plano?.select ?? []) as { expr?: { agg?: unknown } }[]) {
      // `select` de `registro`/`amostra` é uma lista de nomes de coluna, não de
      // agregações — daí o teste de tipo em vez de acesso direto.
      const agg = item?.expr?.agg;
      if (typeof agg === "string") out.push(agg);
    }
  }
  return out;
}

function temAgrupamento(pedidos: unknown): boolean {
  return ((pedidos ?? []) as { plano?: { group_by?: unknown[] } }[])
    .some((p) => Array.isArray(p.plano?.group_by) && p.plano!.group_by!.length > 0);
}

function truncsDoPlano(pedidos: unknown): string[] {
  const out: string[] = [];
  for (const p of (pedidos ?? []) as { plano?: { group_by?: unknown[] } }[]) {
    for (const g of (p.plano?.group_by ?? []) as { trunc?: unknown }[]) {
      if (g && typeof g === "object" && typeof g.trunc === "string") out.push(g.trunc);
    }
  }
  return out;
}

function tiposDePedido(pedidos: unknown): string[] {
  return ((pedidos ?? []) as { tipo?: string }[]).map((p) => String(p.tipo ?? "agregado"));
}

/**
 * Verifica a metade mecânica de uma pergunta.
 *
 * ⭐ Devolve a lista de falhas em vez de lançar na primeira: uma pergunta pode
 * errar duas coisas, e saber as duas é o que orienta a próxima edição do prompt.
 */
function conferirMecanica(q: Pergunta, pl: Resultado | null): string[] {
  const falhas: string[] = [];

  if (q.esperaInviavel) {
    if (pl?.status !== "inviavel") {
      falhas.push(`esperava status 'inviavel', veio '${pl?.status}'`);
    }
    // Inviável não tem plano: as outras checagens não se aplicam.
    return falhas;
  }

  if (q.exigeEntidade) {
    // ⭐ `desambiguacao` conta como acerto: perguntar qual "maria" é a resposta
    // certa, não uma falha. Escolher uma delas seria o defeito.
    const entidades = (pl?.entidades ?? []) as unknown[];
    if (pl?.status !== "desambiguacao" && !entidades.length) {
      falhas.push("nenhuma entidade marcada, e o termo da pergunta precisa casar com a base");
    }
    if (pl?.status === "desambiguacao") return falhas;
  }

  const pedidos = pl?.pedidos;
  if (!Array.isArray(pedidos) || !pedidos.length) {
    falhas.push("o planejador não devolveu pedido nenhum");
    return falhas;
  }

  const aggs = agregacoesDoPlano(pedidos);

  if (q.esperaAgregacao && !q.esperaAgregacao.some((a) => aggs.includes(a))) {
    falhas.push(`esperava uma de [${q.esperaAgregacao.join(", ")}], veio [${aggs.join(", ")}]`);
  }

  for (const proibida of q.proibeAgregacao ?? []) {
    if (aggs.includes(proibida)) falhas.push(`usou '${proibida}', que esta pergunta proíbe`);
  }

  if (q.proibeLinhaBruta) {
    const brutos = tiposDePedido(pedidos).filter((t) => t === "registro" || t === "amostra");
    if (brutos.length) {
      falhas.push(`pediu linha bruta (${brutos.join(", ")}) onde agregação bastava`);
    }
  }

  const presuncoes = (pl?.presuncoes ?? []) as unknown[];
  if (q.exigePresuncao && !presuncoes.length) {
    falhas.push("não declarou presunção, e a pergunta tem ambiguidade real");
  }
  if (q.proibePresuncao && presuncoes.length) {
    falhas.push(`declarou ${presuncoes.length} presunção(ões) numa pergunta inequívoca`);
  }

  if (q.exigeAgrupamento && !temAgrupamento(pedidos)) {
    falhas.push("nenhum pedido agrupou, e a pergunta é por recorte");
  }

  if (q.esperaTrunc) {
    const truncs = truncsDoPlano(pedidos);
    if (!truncs.includes(q.esperaTrunc)) {
      falhas.push(`esperava trunc '${q.esperaTrunc}', veio [${truncs.join(", ") || "nenhum"}]`);
    }
  }

  return falhas;
}

describe.skipIf(!CONFIGURADO)("avaliação do ad_hoc (B17)", () => {
  if (!CONFIGURADO) {
    // Não é falha: é a suíte dizendo o que falta. Sem isto, `describe.skipIf`
    // resultaria numa execução silenciosamente vazia, que se lê como sucesso.
    console.warn(
      "[avaliacao] pulada: defina PLUM_URL, PLUM_ANON_KEY, PLUM_JWT e PLUM_DATASET_ID.",
    );
  }

  // ⚠️ Um `sessaoId` por execução da suíte, e um `turnoId` por pergunta. É o que
  // permite achar a execução inteira no `plum_logs` depois:
  //   select etapa, status, presuncoes_qtd, latencia_ms, modelo
  //     from plum_logs where sessao_id = '<o que sair no console>' order by criado_em;
  const sessaoId = crypto.randomUUID();
  console.log(`[avaliacao] sessao_id desta execução: ${sessaoId}`);

  for (const q of PERGUNTAS) {
    it(`${q.id} — ${q.texto}`, async () => {
      const turnoId = crypto.randomUUID();
      const { etapa, pl, ex } = await rodarTurno(q.texto, sessaoId, turnoId);

      // ⭐ A metade de JULGAMENTO sai por aqui, sempre, mesmo quando a mecânica
      // passa: é isto que o 👤 lê para dar a nota. Sem o dump, um verde só diz
      // que o plano tinha a forma certa — não que a resposta serve.
      console.log(
        [
          "",
          `── ${q.id} ────────────────────────────────────────────`,
          `pergunta:  ${q.texto}`,
          `porque:    ${q.porque}`,
          `turno_id:  ${turnoId}`,
          `parou em:  ${etapa} (status ${pl?.status ?? "—"})`,
          `presunções: ${JSON.stringify(pl?.presuncoes ?? [])}`,
          `plano:     ${JSON.stringify(pl?.pedidos ?? pl?.mensagem ?? null)}`,
          `resposta:  ${String(ex?.resposta ?? ex?.mensagem ?? "—")}`,
        ].join("\n"),
      );

      const falhas = conferirMecanica(q, pl);
      expect(falhas, `${q.id}: ${falhas.join(" · ")}`).toEqual([]);
    }, TIMEOUT_MS);
  }
});
