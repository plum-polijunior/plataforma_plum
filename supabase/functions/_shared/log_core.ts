/**
 * O miolo da escrita em `plum_logs` — sem nenhuma dependência de Deno.
 *
 * ⭐ **A regra que governa este arquivo: o log NUNCA derruba a pergunta.**
 * Toda falha aqui é engolida e vira um `console.error`. Uma tabela de
 * observabilidade que quebra o produto é pior que não ter tabela — e este
 * caminho roda em toda pergunta, então um erro não tratado aqui tira o chat
 * do ar inteiro.
 *
 * ── POR QUE ESTE ARQUIVO EXISTE SEPARADO DO `log.ts` ─────────────────────
 *
 * Aquela regra acima é justamente a que **nunca executa em operação normal**:
 * o caminho de falha só roda quando o banco recusa o insert. Testar isso à mão
 * exige derrubar o INSERT em produção, e a primeira versão do manual da Etapa 0
 * propunha fazê-lo dentro de `begin; revoke …; rollback;` — o que não funciona,
 * porque um REVOKE não commitado é invisível para a conexão da Edge Function.
 *
 * Então o miolo mora aqui, recebendo um `ClienteDeLog` por parâmetro, e o
 * `log_core.test.ts` injeta um dublê que falha de propósito. A garantia passa a
 * ser verificada a cada `npm test`, e não uma vez, na mão, com o dedo cruzado.
 *
 * O `log.ts` continua sendo o ponto de entrada das Edge Functions: ele importa
 * o `@supabase/supabase-js` de uma URL, que o vitest (Node) não resolve. Manter
 * o import lá e a lógica aqui é o que torna o teste possível.
 *
 * ── POR QUE UM INSERT POR INVOCAÇÃO, E NÃO UM BUFFER ─────────────────────
 *
 * Parece que uma pergunta deveria gerar um insert com todas as linhas de uma
 * vez. Não é o caso: o `PlumChat.tsx` chama a Edge Function **uma vez por
 * ação**, e cada invocação é um processo próprio que enxerga só a sua parte.
 * O que costura todas é o `turno_id`, gerado no cliente.
 *
 * ⚠️ **A lista de ações cresceu no B06** e não é mais só `guard` →
 * `plan_query` → `execute_plan` → `synthesize_answer`: entrou o
 * `ad_hoc_planejar`, que roda em modo sombra ao lado da cadeia atual e grava
 * com `caminho = 'ad_hoc'`. Uma pergunta pode portanto gerar linhas dos DOIS
 * caminhos, com o mesmo `turno_id` — e é assim de propósito, porque é o que
 * permite comparar as duas cadeias par a par em vez de em agregado.
 *
 * ── IDENTIDADE ───────────────────────────────────────────────────────────
 *
 * `organization_id` e `user_id` **não são enviados daqui**. As colunas têm
 * default `current_org_id()` e `auth.uid()`, resolvidos no banco a partir do
 * JWT — ver `20260818110000_plum_logs.sql`. Mandar daqui seria reintroduzir
 * "identificador vindo do cliente" (CLAUDE.md §4 regra 1) num lugar onde ele
 * simplesmente não precisa existir.
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

export type CaminhoLog = "legado" | "ad_hoc";

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
  /**
   * ⭐ O que o agente devolveu naquela etapa: o veredito do Z, o Query Plan do
   * A, o texto do C. É o que responde *"por que a resposta ficou ruim?"* — a
   * pergunta que sintoniza prompt, e a única que status e latência não
   * respondem.
   *
   * ⚠️ **Não recebe o resultado do executor**: é dado de negócio agregado do
   * cliente, e o log não é lugar para uma segunda cópia dele. **Nem a
   * pergunta** — ela já está em `plum_chat.content` por design. Ver o cabeçalho
   * de `20260818120000_plum_logs_resposta.sql`.
   */
  respostaAgente?: unknown;
}

/**
 * O mínimo que este módulo precisa de um client Supabase.
 *
 * Existe para o teste poder passar um dublê — inclusive um que falha — sem
 * subir banco nenhum.
 */
export interface ClienteDeLog {
  from(tabela: string): {
    insert(
      linha: Record<string, unknown>,
    ): PromiseLike<{ error: { message: string } | null }>;
  };
}

/**
 * Traduz a linha em camelCase para as colunas em snake_case da tabela.
 *
 * Separada do insert porque é a única parte determinística: dá para conferir o
 * mapeamento sem simular banco, e um nome de coluna errado aqui vira `null`
 * silencioso no banco em vez de erro.
 */
export function montarLinha(
  turno: Partial<DadosDoTurno>,
  caminho: CaminhoLog,
  linha: LinhaDeLog,
): Record<string, unknown> {
  return {
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
    resposta_agente: linha.respostaAgente ?? null,
  };
}

/**
 * Devolve a função de registro, já amarrada ao turno e ao client.
 *
 * ⚠️ `cliente` nulo vira no-op silencioso em vez de erro — é o caso "o chamador
 * não tinha JWT ou o front ainda não manda `sessaoId`/`turnoId`". Uma pergunta
 * sem log é muito melhor que uma pergunta que falha por causa do log.
 */
export function criarRegistradorCom(
  cliente: ClienteDeLog | null,
  turno: Partial<DadosDoTurno>,
  caminho: CaminhoLog = "legado",
): (linha: LinhaDeLog) => Promise<void> {
  if (!cliente) return async (_linha: LinhaDeLog) => {};

  return async function registrar(linha: LinhaDeLog): Promise<void> {
    try {
      const { error } = await cliente
        .from("plum_logs")
        .insert(montarLinha(turno, caminho, linha));

      if (error) console.error("[log] insert falhou:", error.message);
    } catch (e) {
      // Rede, JWT expirado, tabela ainda não criada, cliente malformado — nada
      // disso é motivo para a pessoa não receber a resposta dela.
      console.error("[log] excecao engolida:", e instanceof Error ? e.message : e);
    }
  };
}

/**
 * Igual ao `criarRegistradorCom`, mas **não engole o erro** — devolve se gravou.
 *
 * ⚠️ Existe por causa do orçamento do B10, e a diferença é deliberada. A regra
 * deste arquivo é *o log nunca derruba a pergunta*, e ela está certa para
 * observabilidade: perder uma linha de custo não justifica perder a resposta.
 *
 * ⭐ **Mas o débito do orçamento não é observabilidade — é controle.** Um
 * orçamento apoiado numa escrita best-effort se contorna fazendo a escrita
 * falhar: bastaria o log quebrar para as linhas brutas saírem de graça, para
 * sempre. Por isso o chamador recebe o resultado e **falha o pedido** quando o
 * débito não grava.
 *
 * São duas posturas na mesma tabela, de propósito. Qual usar depende de uma
 * pergunta só: *se esta linha se perder, alguém ganha alguma coisa?*
 */
export function criarRegistradorVerificado(
  cliente: ClienteDeLog | null,
  turno: Partial<DadosDoTurno>,
  caminho: CaminhoLog = "legado",
): (linha: LinhaDeLog) => Promise<{ ok: boolean; erro?: string }> {
  if (!cliente) {
    // ⚠️ Sem client não há como debitar, e "não consegui cobrar" tem de ser
    // falha — não um passe livre.
    return async () => ({ ok: false, erro: "sem cliente para gravar o debito" });
  }

  return async (linha: LinhaDeLog) => {
    try {
      const { error } = await cliente
        .from("plum_logs")
        .insert(montarLinha(turno, caminho, linha));

      if (error) {
        console.error("[orcamento] debito nao gravou:", error.message);
        return { ok: false, erro: error.message };
      }
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[orcamento] excecao ao gravar debito:", msg);
      return { ok: false, erro: msg };
    }
  };
}

/**
 * ⭐ `extrairUsoDeTokens` saiu daqui no B05 — agora é `tokensDoGemini` e
 * `tokensDaAnthropic`, em `llm_core.ts`.
 *
 * O motivo: ela lia `usageMetadata`, que é formato do **Gemini**. A Anthropic
 * devolve `usage.input_tokens`/`output_tokens`. Mantida neste arquivo, ela
 * viraria "a leitura de token", singular, e no dia em que o planejador passasse
 * a rodar em Claude o "custo por pergunta" — a métrica principal deste log —
 * sairia nulo sem nada quebrar para avisar. Leitura de token é responsabilidade
 * de quem conhece o provedor, e quem conhece o provedor é o adaptador.
 */
