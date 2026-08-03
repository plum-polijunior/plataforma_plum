// =========================================================================
// BRAIN — interface do cérebro (troca a implementação sem tocar o resto)
// =========================================================================
// O núcleo (chatCore) só conhece esta interface. Hoje: GeminiBrain (Gemini
// direto, no padrão anti-alucinação do plum-chat). Amanhã: DslBrain chamando
// o motor DSL (FastAPI, outro repo) — troca por trás, sem mexer em UI/store.
//
// IMPORTANTE (limite da Fase 1): o cérebro recebe o DICIONÁRIO das colunas
// permitidas, não as LINHAS reais dos dados (que hoje vivem no Google Sheets).
// Portanto responde sobre o que existe/o significado das colunas e orienta;
// o cálculo sobre valores reais depende do conector de dados / motor DSL
// (ver docs/PLANO-CHAT-PLATAFORMA.md, Fase 2). Quando `input.data` for
// fornecido no futuro, o mesmo prompt já o utiliza.
// =========================================================================
import type { AllowedSchema } from "./rbac.ts";

export interface BrainInput {
  message: string;
  allowedSchema: AllowedSchema;
  history: { direcao: "in" | "out"; content: string }[];
  persona?: string | null;
  /** Linhas reais por dataset, quando houver conector (futuro). */
  data?: Record<string, unknown[]> | null;
}

export interface BrainResult {
  text: string;
  meta?: Record<string, unknown>;
}

export interface Brain {
  answer(input: BrainInput): Promise<BrainResult>;
}

function renderAllowedSchema(schema: AllowedSchema): string {
  if (schema.length === 0) return "(nenhuma base liberada para este usuário)";
  return schema
    .map((d) => {
      const cols = d.columns
        .map((c) => `    - ${c.name}${c.meaning ? `: ${c.meaning}` : ""}`)
        .join("\n");
      return `• Base "${d.name}":\n${cols}`;
    })
    .join("\n");
}

const GEMINI_MODEL = "gemini-2.0-flash";

export class GeminiBrain implements Brain {
  constructor(private apiKey: string) {}

  async answer(input: BrainInput): Promise<BrainResult> {
    const schemaText = renderAllowedSchema(input.allowedSchema);
    const temNada = input.allowedSchema.length === 0;

    const systemInstruction = `Você é o assistente do PLUM, um consultor de dados em linguagem natural (PT-BR).

REGRAS ESTRITAS (OBRIGATÓRIAS):
1. Você SÓ pode falar sobre as bases e colunas listadas em "BASES LIBERADAS". É o escopo do CARGO deste usuário.
2. Se a pergunta for sobre uma tabela/coluna que NÃO está na lista, responda educadamente que o usuário não tem acesso a esse dado e que isso é definido pelo cargo dele — sem revelar que a base existe.
3. NÃO invente dados nem valores. NÃO faça suposições.
4. Seja breve, objetivo e "executivo". Use R$ para valores monetários.
5. Se a pergunta exigir VALORES reais das linhas (e não apenas o significado das colunas), explique que a consulta aos dados ainda está sendo conectada e peça para o usuário reformular ou aguardar — nunca chute números.
${temNada ? "6. Este usuário NÃO tem nenhuma base liberada. Oriente-o a pedir acesso ao administrador da organização." : ""}`;

    const historyText = input.history
      .slice(-12)
      .map((m) => `${m.direcao === "in" ? "Usuário" : "PLUM"}: ${m.content}`)
      .join("\n");

    const userPrompt = `${input.persona ? `PERSONA DO ASSISTENTE:\n${input.persona}\n\n` : ""}BASES LIBERADAS (escopo do cargo):
${schemaText}
${input.data ? `\nAMOSTRA DE DADOS (JSON):\n${JSON.stringify(input.data)}\n` : ""}
HISTÓRICO RECENTE:
${historyText || "(início da conversa)"}

PERGUNTA DO USUÁRIO:
${input.message}

Responda seguindo as REGRAS ESTRITAS.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            temperature: 0.2,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        }),
      },
    );

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Gemini ${resp.status}: ${body}`);
    }

    const data = await resp.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ??
      "Desculpe, não consegui processar sua pergunta.";

    return {
      text,
      meta: {
        model: GEMINI_MODEL,
        allowedDatasets: input.allowedSchema.map((d) => d.name),
      },
    };
  }
}
