import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { parseGeminiJson } from '../_shared/gemini_parsing.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enum fechado de `type` de formatação — espelha _FORMATTERS/TYPE_TO_ROLE em
// query_engine/pandas_executor.py. Mudar um lado sem o outro quebra o
// dispatcher em silêncio, então trate os dois como uma unidade.
const FORMATTING_TYPES = [
  'moeda_brl', 'numero_decimal', 'numero_inteiro', 'percentual', 'data',
  'texto_trim_maiusculas', 'texto_trim_minusculas', 'documento_cpf_cnpj',
  'booleano_sim_nao', 'nenhuma',
];

// Segunda barreira contra o Gemini inventar um `type` fora do enum: não dá
// para confiar só no prompt (não há responseSchema estruturado aqui, porque
// as chaves do objeto são dinâmicas — nome de coluna). Qualquer `type` que
// não bata exatamente no enum é reescrito para 'nenhuma', nunca descartado
// em silêncio — a explicação registra o que a IA tentou originalmente.
function sanitizeFormattingRules(formattingRules: unknown): Record<string, unknown> {
  if (typeof formattingRules !== 'object' || formattingRules === null) return {};
  const saneado: Record<string, unknown> = {};
  for (const [coluna, regra] of Object.entries(formattingRules as Record<string, { type?: string }>)) {
    const tipo = regra?.type;
    if (tipo !== undefined && FORMATTING_TYPES.includes(tipo)) {
      saneado[coluna] = regra;
      continue;
    }
    saneado[coluna] = {
      type: 'nenhuma',
      params: {},
      explicacao: `Nao transformada: a IA sugeriu um type invalido ('${String(tipo)}'). Revise manualmente.`,
    };
  }
  return saneado;
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
      systemInstruction = `Você é um Engenheiro de Dados Especialista. Sua tarefa é analisar amostras de dados (5 linhas) de uma planilha e formatá-las corretamente para um banco de dados relacional. Você deve retornar um JSON ESTRITO com duas chaves: 'formattedSamples' (uma array com as 5 linhas transformadas, mantendo a estrutura de objetos originais) e 'formattingRules' (um objeto JSON onde a chave é o nome da coluna e o valor é OUTRO OBJETO com exatamente três campos: 'type', 'params' e 'explicacao'.

'type' DEVE ser EXATAMENTE um destes valores, e NUNCA outro: ${FORMATTING_TYPES.join(', ')}.
- moeda_brl: valor monetário escrito como "R$ 1.234,56".
- numero_decimal: número com vírgula decimal, sem moeda (ex.: "8,5").
- numero_inteiro: contagem/quantidade inteira (ex.: "1.000").
- percentual: percentual escrito como texto com "%" (ex.: "15%"). Não use este type se a coluna já for um número puro representando fração.
- data: qualquer data escrita como texto.
- texto_trim_maiusculas / texto_trim_minusculas: texto que precisa só de padronização de caixa e espaços.
- documento_cpf_cnpj: CPF ou CNPJ com pontuação.
- booleano_sim_nao: valores como "Sim"/"Não", "Verdadeiro"/"Falso", "1"/"0".
- nenhuma: nada da lista se aplica. Use isto sempre que tiver dúvida — NUNCA invente um type fora desta lista.

'params' é um objeto com parâmetros específicos do type (ex.: {"dayfirst": true} para 'data'; a maioria dos types usa {} vazio).
'explicacao' é uma frase curta em português explicando a regra para um humano revisor — é o único campo que ele vai ler.

Exemplo de valor para uma coluna: {"type": "moeda_brl", "params": {}, "explicacao": "Remove 'R$', separador de milhar e converte vírgula decimal para número."}`;
      userPrompt = `Amostras de dados originais: ${JSON.stringify(dataSamples)}\nPor favor, formate os dados e retorne o JSON com as amostras e as regras aplicadas.`;
    }
    // =========================================================================
    // AGENTE 3.1: REFINAMENTO DE FORMATAÇÃO
    // =========================================================================
    else if (action === 'refine_format') {
      systemInstruction = `Você é um Engenheiro de Dados Especialista. O usuário solicitou uma alteração pontual nas regras de formatação. As regras atuais (formattingRules) já vêm no formato estruturado {type, params, explicacao} por coluna. Sua tarefa é alterar APENAS o objeto {type, params, explicacao} da coluna ou solicitação mencionada pelo usuário, MANTENDO TODOS OS OUTROS OBJETOS INTACTOS, sem modificar o que não foi pedido.

'type' DEVE continuar sendo EXATAMENTE um destes valores, e NUNCA outro: ${FORMATTING_TYPES.join(', ')}. Se a alteração pedida não se encaixar em nenhum deles, use 'nenhuma' e explique o motivo em 'explicacao'.

Em seguida, aplique esse conjunto completo de regras atualizado às 5 amostras de dados originais (dataSamples). Você DEVE retornar ESTRITAMENTE um JSON com duas chaves: 'formattedSamples' (uma array com as 5 linhas transformadas) e 'formattingRules' (o objeto completo, mesmo formato estruturado, com apenas a coluna solicitada modificada).`;
      // columns = regras de formatação atuais (formattingRules, formato estruturado), prompt = solicitação do usuário
      userPrompt = `Regras de Formatação Atuais (formattingRules): ${JSON.stringify(columns)}\nAmostras de Dados Originais (dataSamples): ${JSON.stringify(dataSamples)}\nSolicitação de Alteração do Usuário: "${prompt}"\nAltere APENAS o que o usuário solicitou nas regras e retorne o JSON com 'formattedSamples' e 'formattingRules'.`;
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
      let finalResponse: unknown = generatedText;

      if (isJsonResponse) {
        try {
          // Tolera fences de markdown e lixo à direita (ver _shared/gemini_parsing.ts).
          finalResponse = parseGeminiJson(generatedText);
        } catch (e) {
          // Antes: caía em silêncio pro texto bruto, e o front salvava essa
          // string crua em `semanticDefinitions`/`formattingRules` sem notar
          // — as caixas de texto por coluna quebravam sem nenhum aviso.
          console.error("Gemini não retornou um JSON válido:", generatedText);
          throw new Error('A IA nao retornou um JSON valido. Tente novamente.');
        }
      }

      // Segunda barreira contra `type` fora do enum fechado: o prompt pede,
      // mas não força — sanitiza antes de devolver ao front, nunca deixa um
      // type inventado chegar até o schema_metadata persistido.
      if (
        (action === 'format_data' || action === 'refine_format') &&
        finalResponse && typeof finalResponse === 'object'
      ) {
        const resultado = finalResponse as { formattingRules?: unknown };
        if (resultado.formattingRules) {
          resultado.formattingRules = sanitizeFormattingRules(resultado.formattingRules);
        }
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
