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
 * em 4 lugares de 3 funções. Na Etapa 1 só o `ai-plum-chat` adotou; **o
 * `ai-agents` entrou no B14** (item C2), e sobra o `dashboard-agent`, que segue
 * fora de escopo por decisão. E como `_shared/` é empacotado por função, cada
 * adoção exige republicar aquela função.
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
  | "interprete"
  // ⭐ A terceira cadeia, do B14: os seis agentes do cadastro (`ai-agents`).
  // Ela não responde pergunta — ela **escreve o dicionário** que as outras duas
  // leem, e é por isso que existe separada em vez de reaproveitar `guard` e
  // companhia: mesmo nome de papel com propósito diferente faria a tabela
  // abaixo mentir sobre quem paga o quê.
  //
  // ⚠️ `guardiao` é o Agente 0 do cadastro; `guard` é o Agente Z do chat
  // legado. Os dois filtram escopo, em cadeias diferentes.
  | "guardiao"
  | "formatador"
  | "semantico"
  | "suporte";

export interface Destino {
  provedor: Provedor;
  modelo: string;
}

/**
 * ⭐ Os identificadores de modelo, cada um escrito **uma vez**.
 *
 * Subir de versão é editar aqui, e vale para todos os papéis que usam aquele
 * modelo de uma vez só. Antes o literal `gemini-3.5-flash` aparecia cinco vezes
 * na tabela abaixo, e subir de versão era cinco edições com quatro chances de
 * esquecer uma — o tipo de divergência que ninguém percebe até comparar custo
 * entre duas etapas e achar a diferença estranha.
 *
 * ⚠️ **De propósito NÃO são variáveis de ambiente.** Ler o modelo de um secret
 * permitiria trocar sem republicar, e é tentador — mas: um erro de digitação
 * derruba todas as perguntas daquele papel, nenhum teste alcança o valor, e o
 * que está rodando deixa de estar no repositório. Esta última é literalmente a
 * lição do I-03 (*"o código no repositório não é o que está rodando"*), que já
 * custou caro aqui. Constante em código é versionada, revisável e testável; o
 * preço é um `functions deploy`, que este projeto exige de qualquer forma.
 *
 * ⚠️ E há um segundo motivo, específico: trocar um secret **incrementa o
 * `version`** da função sem código novo. Seria criar, de propósito, mais casos
 * do sinal falso que o I-03 manda ignorar.
 */
export const MODELOS = {
  /** Rápido e barato. Classificação e reconhecimento, que rodam em toda pergunta. */
  FLASH: "gemini-3.7-flash",
  /**
   * O de raciocínio: Query Plan e prosa, onde errar custa mais que a chamada.
   *
   * ⭐ **O nome é neutro de propósito.** Era `OPUS` e apontava para
   * `claude-opus-5`; uma análise de custo trocou por Gemini Pro em 2026-08-21, e
   * um nome que carrega o provedor obriga a renomear em toda parte a cada troca
   * — que é exatamente o acoplamento que este arquivo existe para não ter.
   *
   * ⚠️ **`-preview` faz parte do ID, não é um canal separado.** Não existe
   * `gemini-3.1-pro`: pedir aquele nome é 400 em toda chamada. E com a queda
   * para o legado do B07, esse 400 seria **silencioso** — o chat responderia
   * pela cadeia antiga e ninguém veria o remake parar de rodar. Confira em
   * `plum_logs.modelo`, não na tela.
   *
   * ⚠️ Modelo em preview pode ser aposentado sem aviso. O sintoma será o mesmo:
   * `ad_hoc` caindo para o legado em toda pergunta, com `codigo_erro` do
   * provedor no log.
   */
  RACIOCINIO: "gemini-3.1-pro-preview",
} as const;

/**
 * ⭐ A tabela que é o ponto do bloco. Trocar de modelo é editar uma linha.
 *
 * Porteiro e reconhecedor são classificação sobre entrada curta: Flash resolve,
 * e são os dois que rodam em toda pergunta. Planejador e intérprete carregam a
 * dificuldade — o Query Plan e a prosa que não pode fazer conta (R-13) — e vão
 * para o modelo caro.
 *
 * ⭐ **As duas cadeias usam o MESMO Flash de propósito.** A Etapa 1 compara o
 * caminho `ad_hoc` com o `legado`, e diferença de modelo entre eles
 * contaminaria a comparação: não daria para saber se o remake ficou melhor ou
 * se só ganhou um modelo mais novo.
 */
export const MODELO_POR_PAPEL: Readonly<Record<Papel, Destino>> = {
  guard: { provedor: "google", modelo: MODELOS.FLASH },
  plan_query: { provedor: "google", modelo: MODELOS.FLASH },
  synthesize_answer: { provedor: "google", modelo: MODELOS.FLASH },

  porteiro: { provedor: "google", modelo: MODELOS.FLASH },
  reconhecedor: { provedor: "google", modelo: MODELOS.FLASH },

  // ⚠️ Foram para a Anthropic (`claude-opus-5`) do B05 até 2026-08-21, quando
  // uma análise de custo os trouxe para o Gemini Pro. O adaptador da Anthropic
  // continua no repositório e passa a ser inalcançável — ver `llm/claude.ts`.
  planejador: { provedor: "google", modelo: MODELOS.RACIOCINIO },
  interprete: { provedor: "google", modelo: MODELOS.RACIOCINIO },

  // ⭐ **A cadeia do cadastro vai INTEIRA para o raciocínio, e é a exceção da
  // regra "classificador é Flash".** O que estes seis escrevem entra no
  // `schema_metadata` e vale para toda pergunta futura sobre a base; errar aqui
  // não estraga uma resposta, estraga todas, e em silêncio, porque a base fica
  // plausível. E o custo é O(1) por base — um cadastro roda seis chamadas uma
  // vez na vida daquela planilha, contra três por pergunta, para sempre.
  //
  // ⚠️ O plano do B14 subia só `formatador` e `semantico` (as etapas 3 e 4).
  // Subir também `guardiao` e `suporte` foi decisão do 👤 em 2026-08-25 —
  // "todos os agentes das 4 etapas" — registrada como D-047.
  guardiao: { provedor: "google", modelo: MODELOS.RACIOCINIO },
  formatador: { provedor: "google", modelo: MODELOS.RACIOCINIO },
  semantico: { provedor: "google", modelo: MODELOS.RACIOCINIO },
  suporte: { provedor: "google", modelo: MODELOS.RACIOCINIO },
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
