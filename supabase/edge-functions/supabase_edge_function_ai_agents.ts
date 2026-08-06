import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      systemInstruction = "Você é um Engenheiro de Dados Especialista. Sua tarefa é analisar amostras de dados (5 linhas) de uma planilha e formatá-las corretamente para um banco de dados relacional. Você deve retornar um JSON ESTRITO com duas chaves: 'formattedSamples' (uma array com as 5 linhas transformadas, mantendo a estrutura de objetos originais) e 'formattingRules' (um objeto JSON onde a chave é o nome da coluna e o valor é a explicação exata de como os dados daquela coluna foram ou devem ser formatados). Exemplo de regra: 'Retirar os R$, converter para string(), e deixar com 3 casas decimais'.";
      userPrompt = `Amostras de dados originais: ${JSON.stringify(dataSamples)}\nPor favor, formate os dados e retorne o JSON com as amostras e as regras aplicadas.`;
    }
    // =========================================================================
    // AGENTE 3.1: REFINAMENTO DE FORMATAÇÃO
    // =========================================================================
    else if (action === 'refine_format') {
      systemInstruction = "Você é um Engenheiro de Dados Especialista. O usuário solicitou uma alteração pontual nas regras de formatação. Sua tarefa é analisar as regras de formatação atuais (formattingRules) e a solicitação do usuário, e alterar APENAS a regra referente à coluna ou solicitação mencionada pelo usuário, MANTENDO TODAS AS OUTRAS REGRAS INTACTAS sem modificar o que não foi pedido. Em seguida, aplique esse conjunto completo de regras atualizado às 5 amostras de dados originais (dataSamples). Você DEVE retornar ESTRITAMENTE um JSON com duas chaves: 'formattedSamples' (uma array com as 5 linhas transformadas) e 'formattingRules' (um objeto contendo todas as regras de formatação por coluna, com apenas a regra solicitada modificada).";
      // columns = regras de formatação atuais (formattingRules), prompt = solicitação do usuário
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
      let finalResponse = generatedText;

      if (isJsonResponse) {
        try {
          // Tenta fazer parse do JSON retornado pelo Gemini para garantir que é válido
          finalResponse = JSON.parse(generatedText);
        } catch (e) {
          console.error("Gemini não retornou um JSON válido:", generatedText);
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
