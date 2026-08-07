import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =========================================================================
// CONTRATO DE FORMATAÇÃO
// =========================================================================
// Enum FECHADO. O Agente 3 escolhe daqui; ele não inventa vocabulário.
//
// Por que fechado: antes, o agente escrevia a regra como frase livre em
// português e quem consumia fazia grep de palavra-chave. Uma regra como
// "converter Sim/Não para booleano" não casava com nenhuma palavra e a coluna
// virava `text` em silêncio — o que faz o executor somar com
// `to_numeric(errors="coerce").fillna(0)` e transformar valor não convertido
// em ZERO dentro da conta. Ver query_engine/urgent.md.
//
// Esta lista precisa bater com PAPEL_POR_TIPO em
// supabase/functions/_shared/query_plan.ts, que é onde o tipo vira o
// `column_roles` do executor. Os dois arquivos são deployados separadamente
// (este é colado no painel; aquele vai por CLI), então não dá para importar.
// Mudou aqui, muda lá.
const TIPOS_FORMATACAO = [
  'moeda_brl',
  'numero_decimal',
  'numero_inteiro',
  'percentual',
  'data',
  'texto_trim_maiusculas',
  'texto_trim_minusculas',
  'documento_cpf_cnpj',
  'booleano_sim_nao',
  'nenhuma',
] as const;

const DESCRICAO_DOS_TIPOS = `
- "moeda_brl": valor em dinheiro. params: { "casas_decimais": number }
- "numero_decimal": número com casas decimais. params: { "casas_decimais": number }
- "numero_inteiro": número sem casas decimais. params: {}
- "percentual": porcentagem. params: { "casas_decimais": number }
- "data": data ou data/hora. params: { "dayfirst": boolean }
- "texto_trim_maiusculas": texto, sem espaços nas bordas, em MAIÚSCULAS. params: {}
- "texto_trim_minusculas": texto, sem espaços nas bordas, em minúsculas. params: {}
- "documento_cpf_cnpj": CPF/CNPJ, só os dígitos. params: {}
- "booleano_sim_nao": Sim/Não, Verdadeiro/Falso, 1/0 -> booleano. params: {}
- "nenhuma": texto livre, sem transformação. params: {}`.trim();

const REGRA_DO_CONTRATO = `
Para CADA coluna você deve devolver um objeto com exatamente três chaves:
  "tipo"       - OBRIGATORIAMENTE um destes valores: ${TIPOS_FORMATACAO.join(', ')}
  "params"     - objeto com os parâmetros do tipo (use {} quando não houver)
  "explicacao" - uma frase curta em português explicando a regra para um humano revisar

O campo "tipo" NUNCA pode ser um valor fora da lista. Se a coluna não se
encaixar em nenhum tipo, use "nenhuma" e diga o porquê em "explicacao" — é
melhor declarar que não soube formatar do que inventar um tipo.`.trim();

type ItemContrato = { tipo: string; params: Record<string, unknown>; explicacao: string };

/**
 * Nunca confiar no LLM para respeitar o enum. O Gemini roda com
 * response_mime_type JSON, o que garante a FORMA da resposta, não o
 * VOCABULÁRIO dela. Tipo fora da lista vira "nenhuma" e gera aviso visível, em
 * vez de virar um comportamento silencioso lá na frente.
 */
function normalizarContrato(
  bruto: unknown,
): { contrato: Record<string, ItemContrato>; avisos: string[] } {
  const contrato: Record<string, ItemContrato> = {};
  const avisos: string[] = [];

  if (!bruto || typeof bruto !== 'object') return { contrato, avisos };

  for (const [coluna, valor] of Object.entries(bruto as Record<string, unknown>)) {
    // O modelo às vezes recai no formato antigo e manda a frase direto.
    if (typeof valor === 'string') {
      avisos.push(`Coluna "${coluna}": o modelo devolveu texto livre em vez de {tipo, params}. Tratada como "nenhuma".`);
      contrato[coluna] = { tipo: 'nenhuma', params: {}, explicacao: valor };
      continue;
    }

    const v = (valor ?? {}) as Record<string, unknown>;
    let tipo = String(v.tipo ?? 'nenhuma');

    if (!(TIPOS_FORMATACAO as readonly string[]).includes(tipo)) {
      avisos.push(`Coluna "${coluna}": tipo "${tipo}" está fora da lista permitida. Trocado por "nenhuma".`);
      tipo = 'nenhuma';
    }

    contrato[coluna] = {
      tipo,
      params: v.params && typeof v.params === 'object' ? (v.params as Record<string, unknown>) : {},
      explicacao: String(v.explicacao ?? ''),
    };
  }

  return { contrato, avisos };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, prompt, columns, dataSamples } = await req.json();

    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    let systemInstruction = "";
    let userPrompt = "";

    // =========================================================================
    // AGENTE 0: GUARDIÃO DE CONTEXTO
    // =========================================================================
    if (action === 'guard') {
      systemInstruction = "Você é um agente de segurança estrito do sistema Plum. Sua única função é classificar se a intenção do usuário está relacionada à construção, edição ou análise de bases de dados, colunas de planilhas ou arquitetura de chatbot para a plataforma Plum. Responda EXATAMENTE com a palavra 'PERMITIDO' se estiver dentro do escopo, ou 'BLOQUEADO' se for qualquer outro assunto (como receitas, piadas, código malicioso ou conversas genéricas).";
      userPrompt = `Analise este prompt de usuário: "${prompt}"`;
    }
    // =========================================================================
    // AGENTE 1: PREVISÃO SEMÂNTICA
    // =========================================================================
    else if (action === 'predict_semantics') {
      systemInstruction = "Você é um Analista de Dados Especialista. O usuário fornecerá uma lista de colunas de uma planilha e algumas linhas de exemplo. Sua tarefa é prever e gerar uma definição semântica clara e técnica para CADA coluna. Retorne o resultado ESTRITAMENTE em formato JSON, onde as chaves são os nomes das colunas e os valores são as descrições.";
      userPrompt = `Colunas: ${JSON.stringify(columns)}\nAmostras de Dados: ${JSON.stringify(dataSamples)}\nPor favor, retorne o JSON com as descrições.`;
    }
    // =========================================================================
    // AGENTE 2: REFINAMENTO CONTÍNUO
    // =========================================================================
    else if (action === 'refine_semantics') {
      systemInstruction = "Você é um Especialista em Engenharia de Prompt. O usuário vai te fornecer as definições de algumas colunas que ele mesmo escreveu ou editou. Sua tarefa é melhorar essas definições para que fiquem perfeitas, claras e sem ambiguidades para um LLM (Chatbot) que lerá essas descrições no futuro. Retorne o resultado ESTRITAMENTE em formato JSON (chave: coluna, valor: descrição melhorada).";
      userPrompt = `Definições atuais do usuário: ${JSON.stringify(columns)}\nMelhore-as.`;
    }
    // =========================================================================
    // AGENTE 3: FORMATAÇÃO DE DADOS
    // =========================================================================
    else if (action === 'format_data') {
      systemInstruction = `Você é um Engenheiro de Dados Especialista. Analise as amostras de dados (5 linhas) de uma planilha e classifique CADA coluna.

Retorne um JSON ESTRITO com exatamente duas chaves:

1. "formattedSamples": array com as 5 linhas já transformadas, mantendo a estrutura de objetos original.
2. "formattingContract": objeto onde a chave é o nome da coluna.

${REGRA_DO_CONTRATO}

Tipos disponíveis:
${DESCRICAO_DOS_TIPOS}

Exemplo de uma entrada de "formattingContract":
{
  "faturamento": {
    "tipo": "moeda_brl",
    "params": { "casas_decimais": 2 },
    "explicacao": "Remove o R$, o separador de milhar, e converte a vírgula decimal para número."
  }
}`;
      userPrompt = `Amostras de dados originais: ${JSON.stringify(dataSamples)}\nClassifique cada coluna e retorne o JSON com 'formattedSamples' e 'formattingContract'.`;
    }
    // =========================================================================
    // AGENTE 3.1: REFINAMENTO DE FORMATAÇÃO
    // =========================================================================
    else if (action === 'refine_format') {
      systemInstruction = `Você é um Engenheiro de Dados Especialista. O usuário pediu uma alteração pontual no contrato de formatação.

Altere APENAS a coluna mencionada pelo usuário. Todas as outras colunas devem voltar EXATAMENTE como estavam — mesmo "tipo", mesmos "params", mesma "explicacao". Não reescreva, não melhore, não reordene o que não foi pedido.

Depois aplique o contrato completo às 5 amostras originais.

Retorne um JSON ESTRITO com exatamente duas chaves:

1. "formattedSamples": array com as 5 linhas transformadas.
2. "formattingContract": o contrato COMPLETO (todas as colunas), com só a coluna pedida alterada.

${REGRA_DO_CONTRATO}

Tipos disponíveis:
${DESCRICAO_DOS_TIPOS}`;
      // columns = contrato de formatação atual, prompt = solicitação do usuário
      userPrompt = `Contrato de Formatação Atual: ${JSON.stringify(columns)}\nAmostras de Dados Originais (dataSamples): ${JSON.stringify(dataSamples)}\nSolicitação de Alteração do Usuário: "${prompt}"\nAltere APENAS o que o usuário pediu e retorne o JSON com 'formattedSamples' e 'formattingContract'.`;
    }
    // =========================================================================
    // AGENTE DE SUPORTE (COLUNAS)
    // =========================================================================
    else if (action === 'column_support') {
      systemInstruction = "Você é um Engenheiro de Dados Especialista. O usuário discordou da formatação anterior e enviou um feedback. Sua tarefa é pegar os dados originais, aplicar as regras de formatação antigas COM AS CORREÇÕES PEDIDAS PELO USUÁRIO. Você deve retornar um JSON ESTRITO com duas chaves: 'formattedSamples' (uma array com as 5 linhas transformadas) e 'formattingRules' (as regras atualizadas por coluna).";
      // columns = regras antigas, prompt = feedback do usuário
      userPrompt = `Amostras de dados originais: ${JSON.stringify(dataSamples)}\nRegras Anteriores: ${JSON.stringify(columns)}\nFeedback/Correção do Usuário: "${prompt}"\nPor favor, aplique a nova formatação e retorne o JSON solicitado.`;
    }
    else {
      throw new Error('Ação inválida.');
    }

    // Chamada para a API do Gemini
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY?.trim()}`;

    const isJsonResponse = ['predict_semantics', 'refine_semantics', 'format_data', 'refine_format'].includes(action);

    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: [
          {
            parts: [{ text: userPrompt }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          response_mime_type: isJsonResponse ? 'application/json' : 'text/plain',
        }
      })
    });

    const data = await res.json();

    if (res.ok) {
      const generatedText = data.candidates[0].content.parts[0].text;
      let finalResponse = generatedText;

      if (isJsonResponse) {
        try {
          // Tenta fazer parse do JSON retornado pelo Gemini para garantir que é válido
          finalResponse = JSON.parse(generatedText);
        } catch (e) {
          console.error("Gemini não retornou um JSON válido:", generatedText);
        }
      }

      // Contrato de formatação: valida o enum ANTES de a resposta sair daqui.
      if (action === 'format_data' || action === 'refine_format') {
        const { contrato, avisos } = normalizarContrato(finalResponse?.formattingContract);

        if (avisos.length) {
          console.warn(`[${action}] contrato ajustado:`, avisos);
        }

        finalResponse = {
          ...finalResponse,
          formattingContract: contrato,
          // Compatibilidade: a tela lê `formattingRules` como {coluna: frase}.
          // A frase agora é derivada do contrato, nunca o contrário — o que a
          // pessoa lê e o que a máquina executa saem da mesma fonte.
          formattingRules: Object.fromEntries(
            Object.entries(contrato).map(([coluna, item]) => [coluna, item.explicacao]),
          ),
          avisosContrato: avisos,
        };
      }

      return new Response(JSON.stringify({ result: finalResponse }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } else {
      console.error("ERRO DA API DO GEMINI:", JSON.stringify(data, null, 2));
      return new Response(JSON.stringify({ error: data.error?.message || "Erro desconhecido da API do Google" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
  } catch (error: any) {
    console.error("ERRO INTERNO NA EDGE FUNCTION:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
