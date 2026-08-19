import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

/**
 * Escrita em `plum_logs` — a observabilidade do chat.
 *
 * ⭐ **A regra que governa este arquivo: o log NUNCA derruba a pergunta.**
 * Toda falha aqui é engolida e vira um `console.error`. Uma tabela de
 * observabilidade que quebra o produto é pior que não ter tabela — e este
 * caminho roda em toda pergunta, então um erro não tratado aqui tira o chat
 * do ar inteiro.
 *
 * ⚠️ **A pergunta crua não entra em nada disto** (D-022). Registra-se a FORMA
 * — quantos pedidos, de que tipos, quantas linhas —, nunca o texto. Se você
 * for acrescentar um campo e ele for `string` livre vinda do usuário, pare.
 *
 * ── POR QUE UM INSERT POR INVOCAÇÃO, E NÃO UM BUFFER ─────────────────────
 *
 * Parece que uma pergunta deveria gerar um insert com 4 linhas de uma vez. Não
 * é o caso: o `PlumChat.tsx` chama a Edge Function **uma vez por ação**
 * (`guard`, depois `plan_query`, depois `execute_plan`, depois
 * `synthesize_answer`). Cada invocação é um processo próprio e enxerga só a
 * própria etapa. O que costura as quatro é o `turno_id`, gerado no cliente.
 *
 * ── IDENTIDADE ───────────────────────────────────────────────────────────
 *
 * `organization_id` e `user_id` **não são enviados daqui**. As colunas têm
 * default `current_org_id()` e `auth.uid()`, resolvidos no banco a partir do
 * JWT — ver `20260818110000_plum_logs.sql`. Mandar daqui seria reintroduzir
 * "identificador vindo do cliente" (CLAUDE.md §4 regra 1) num lugar onde ele
 * simplesmente não precisa existir.
 *
 * Por isso o client é montado com o JWT de quem perguntou, e não com
 * `service_role` — mesma postura do resto do `ai-plum-chat`.
 */

/** As etapas do caminho atual. O remake acrescenta as suas ao CHECK da tabela. */
export type EtapaLog =
  | "guard"
  | "plan_query"
  | "execute_plan"
  | "synthesize_answer";

export type StatusLog =
  | "ok"
  | "bloqueado"
  | "negado"
  | "inviavel"
  | "desambiguacao"
  | "erro";

export interface DadosDoTurno {
  /** uuid do cliente, por conversa. Ver o cabeçalho da migration. */
  sessaoId: string;
  /** uuid do cliente, por pergunta. É o que costura as etapas. */
  turnoId: string;
  datasetId?: string | null;
}

export interface LinhaDeLog {
  etapa: EtapaLog;
  status: StatusLog;
  codigoErro?: string | null;
  modelo?: string | null;
  provedor?: string | null;
  tokensEntrada?: number | null;
  tokensSaida?: number | null;
  latenciaMs?: number | null;
  linhasOrigem?: number | null;
  linhasBrutasEntregues?: number | null;
  cacheHitA2?: boolean | null;
}

/**
 * Devolve uma função que grava uma linha de log, já amarrada ao turno.
 *
 * Uso no chamador:
 * ```ts
 * const registrar = criarRegistrador(authHeader, { sessaoId, turnoId, datasetId });
 * await registrar({ etapa: "guard", status: "ok", latenciaMs: 812 });
 * ```
 *
 * ⚠️ Sem `authHeader` (ou sem `sessaoId`/`turnoId`) ele vira um no-op silencioso
 * em vez de lançar. É deliberado: durante a Etapa 0 o front ainda pode estar
 * numa versão que não manda esses campos, e uma pergunta sem log é muito melhor
 * que uma pergunta que falha por causa do log.
 */
export function criarRegistrador(
  authHeader: string | null,
  turno: Partial<DadosDoTurno>,
  caminho: "legado" | "ad_hoc" = "legado",
) {
  const podeRegistrar = Boolean(authHeader && turno.sessaoId && turno.turnoId);

  if (!podeRegistrar) {
    // Uma linha, uma vez, para o silêncio não virar mistério em produção.
    console.warn(
      "[log] turno incompleto (sessao/turno/auth ausentes) — pergunta segue sem registro",
    );
    return async (_linha: LinhaDeLog) => {};
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader! } } },
  );

  return async function registrar(linha: LinhaDeLog): Promise<void> {
    try {
      const { error } = await supabase.from("plum_logs").insert({
        sessao_id: turno.sessaoId,
        turno_id: turno.turnoId,
        dataset_id: turno.datasetId ?? null,
        caminho,
        etapa: linha.etapa,
        status: linha.status,
        codigo_erro: linha.codigoErro ?? null,
        modelo: linha.modelo ?? null,
        provedor: linha.provedor ?? null,
        tokens_entrada: linha.tokensEntrada ?? null,
        tokens_saida: linha.tokensSaida ?? null,
        latencia_ms: linha.latenciaMs ?? null,
        linhas_origem: linha.linhasOrigem ?? null,
        linhas_brutas_entregues: linha.linhasBrutasEntregues ?? null,
        cache_hit_a2: linha.cacheHitA2 ?? null,
      });

      if (error) console.error("[log] insert falhou:", error.message);
    } catch (e) {
      // Rede, JWT expirado, tabela ainda não criada — nada disso é motivo para
      // a pessoa não receber a resposta dela.
      console.error("[log] excecao engolida:", e instanceof Error ? e.message : e);
    }
  };
}

/**
 * Extrai a contagem de tokens da resposta do Gemini.
 *
 * ⚠️ **O código descartava isso.** O Gemini devolve `usageMetadata` em toda
 * resposta e nada no `ai-plum-chat` lia — então "custo por pergunta", que é a
 * métrica principal do log, sairia nulo. Conferido em 2026-08-18: não havia
 * nenhuma ocorrência de `usageMetadata` no repositório.
 *
 * Tolerante de propósito: campo ausente vira `null`, não exceção. O formato da
 * resposta é de terceiro e pode mudar sem aviso.
 */
export function extrairUsoDeTokens(
  corpo: unknown,
): { entrada: number | null; saida: number | null } {
  const uso = (corpo as { usageMetadata?: Record<string, unknown> } | null)
    ?.usageMetadata;
  const numero = (v: unknown) => (typeof v === "number" ? v : null);

  return {
    entrada: numero(uso?.promptTokenCount),
    saida: numero(uso?.candidatesTokenCount),
  };
}
