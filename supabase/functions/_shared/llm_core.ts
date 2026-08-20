/**
 * O miolo da abstração de provedor de LLM — sem Deno, sem import de URL.
 *
 * Mesma divisão do `log_core.ts`, e pelo mesmo motivo: o `llm.ts` importa o SDK
 * da Anthropic de uma URL, que o vitest sob Node não resolve. A tabela
 * papel→modelo, a resolução e a leitura de token vivem aqui, onde são testadas.
 *
 * ── ⭐ O QUE ESTA ABSTRAÇÃO É, E O QUE ELA NÃO É ─────────────────────────
 *
 * O contrato é estreito de propósito: **prompt, saída estruturada, temperatura
 * e contagem de token**. Cache de prompt, tool use e streaming ficam de fora —
 * unificar os três sai mais caro que manter dois clientes separados, e nenhum
 * agente do remake precisa deles.
 *
 * ⚠️ **Ela consolida UM ponto de chamada, não quatro.** A URL do Gemini aparece
 * em 4 lugares de 3 funções, mas `dashboard-agent` e `ai-agents` estão fora do
 * escopo da Etapa 1. Só o `ai-plum-chat` adota. E como `_shared/` é empacotado
 * por função, adotar nos outros depois exige republicar cada um.
 */

export type Provedor = "google" | "anthropic";

/**
 * Os papéis das duas cadeias. As três primeiras são as ações do caminho atual;
 * as quatro seguintes são os agentes do remake.
 *
 * Aceitar os dois vocabulários é a mesma escolha do `CHECK` de `plum_logs.etapa`
 * — durante a Etapa 1 as duas cadeias convivem, e um enum só com os nomes novos
 * rejeitaria o caminho que ainda responde as perguntas.
 */
export type Papel =
  | "guard"
  | "plan_query"
  | "synthesize_answer"
  | "porteiro"
  | "reconhecedor"
  | "planejador"
  | "interprete";

export interface Destino {
  provedor: Provedor;
  modelo: string;
}

/**
 * ⭐ A tabela que é o ponto do bloco. Trocar de modelo é editar uma linha.
 *
 * Porteiro e reconhecedor são classificação sobre entrada curta: Flash resolve,
 * e são os dois que rodam em toda pergunta. Planejador e intérprete carregam a
 * dificuldade — o Query Plan e a prosa que não pode fazer conta (R-13) — e vão
 * para o modelo caro.
 */
export const MODELO_POR_PAPEL: Readonly<Record<Papel, Destino>> = {
  guard: { provedor: "google", modelo: "gemini-3.5-flash" },
  plan_query: { provedor: "google", modelo: "gemini-3.5-flash" },
  synthesize_answer: { provedor: "google", modelo: "gemini-3.5-flash" },

  porteiro: { provedor: "google", modelo: "gemini-3.5-flash" },
  reconhecedor: { provedor: "google", modelo: "gemini-3.5-flash" },

  planejador: { provedor: "anthropic", modelo: "claude-opus-5" },
  interprete: { provedor: "anthropic", modelo: "claude-opus-5" },
};

export interface PedidoLLM {
  papel: Papel;
  sistema: string;
  prompt: string;
  /** Espera JSON puro. Muda o mime type no Gemini; no Claude fica com o prompt. */
  json?: boolean;
  temperatura?: number;
  /** Saída estruturada. Só o porteiro usa, e só o adaptador do Gemini aplica. */
  schema?: unknown;
}

export interface UsoDeTokens {
  entrada: number | null;
  saida: number | null;
}

export interface RespostaLLM {
  ok: boolean;
  texto: string;
  tokens: UsoDeTokens;
  modelo: string;
  provedor: Provedor;
  /** Preenchido quando `ok` é falso. `codigo` vai para `plum_logs.codigo_erro`. */
  erro?: { codigo: string; mensagem: string };
}

export interface ResolucaoDePapel extends Destino {
  /**
   * ⚠️ O papel deveria ir para a Anthropic e caiu no Gemini por falta de chave.
   *
   * Não é erro — a pergunta continua sendo respondida —, mas o planejador
   * rodando em Flash é uma cadeia **mais fraca** do que a projetada, e isso
   * precisa aparecer. Vai para `plum_logs` via `modelo`/`provedor`, então a
   * degradação é mensurável, não uma suspeita.
   */
  degradado: boolean;
}

/** Para onde este papel vai, dado o que existe de credencial. */
export function resolver(papel: Papel, temChaveAnthropic: boolean): ResolucaoDePapel {
  const destino = MODELO_POR_PAPEL[papel];

  if (destino.provedor === "anthropic" && !temChaveAnthropic) {
    return { ...MODELO_POR_PAPEL.plan_query, degradado: true };
  }

  return { ...destino, degradado: false };
}

/**
 * Leitura de token, por provedor.
 *
 * ⭐ **Isto saiu do `log_core.ts` neste bloco, e é o motivo de o B05 tocar no
 * log.** Lá a função lia `usageMetadata`, que é formato do Gemini. A Anthropic
 * devolve `usage.input_tokens`/`output_tokens`: mantida onde estava, "custo por
 * pergunta" — a métrica principal do log — voltaria a sair nula no dia em que o
 * planejador virasse Claude, sem nada quebrar para avisar.
 *
 * Tolerante de propósito nos dois casos: campo ausente vira `null`, não
 * exceção. O formato é de terceiro e pode mudar sem aviso, e nenhuma mudança
 * dele pode derrubar uma resposta que já foi gerada.
 */
const numero = (v: unknown) => (typeof v === "number" ? v : null);

export function tokensDoGemini(corpo: unknown): UsoDeTokens {
  const uso = (corpo as { usageMetadata?: Record<string, unknown> } | null)
    ?.usageMetadata;
  return { entrada: numero(uso?.promptTokenCount), saida: numero(uso?.candidatesTokenCount) };
}

export function tokensDaAnthropic(corpo: unknown): UsoDeTokens {
  const uso = (corpo as { usage?: Record<string, unknown> } | null)?.usage;
  return { entrada: numero(uso?.input_tokens), saida: numero(uso?.output_tokens) };
}

export const SEM_TOKENS: UsoDeTokens = { entrada: null, saida: null };

/** Resposta de falha, no formato que o chamador já sabe tratar. */
export function falha(
  destino: Destino,
  codigo: string,
  mensagem: string,
): RespostaLLM {
  return {
    ok: false,
    texto: "",
    tokens: SEM_TOKENS,
    modelo: destino.modelo,
    provedor: destino.provedor,
    erro: { codigo, mensagem },
  };
}
