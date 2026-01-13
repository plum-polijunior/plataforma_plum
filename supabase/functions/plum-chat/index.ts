import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Product {
  name: string;
  unitPrice: number;
  salesToday: number;
  salesMonth: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, products } = await req.json();
    
    console.log("Received question:", question);
    console.log("Products data:", JSON.stringify(products));

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not configured");
      throw new Error("GEMINI_API_KEY is not configured");
    }

    // Build the prompt with strict instructions for anti-hallucination
    const systemInstruction = `Você é o assistente do PLUM, especializado em análise de dados de vendas.

REGRAS ESTRITAS (OBRIGATÓRIAS):
1. Responda SOMENTE usando os dados da tabela fornecida em JSON
2. Se a pergunta exigir dados que NÃO estão na tabela, responda que não é possível calcular e peça para o usuário preencher os dados necessários
3. Seja breve, objetivo e "executivo"
4. Sempre que fizer conta, mostre o resultado final claramente em R$ quando for receita
5. Use formato de moeda brasileira (R$) para valores monetários
6. NÃO invente dados. NÃO faça suposições. Use APENAS os dados fornecidos.

CÁLCULOS QUE VOCÊ PODE FAZER:
- Faturamento hoje = soma de (unitPrice × salesToday) para cada produto
- Faturamento do mês = soma de (unitPrice × salesMonth) para cada produto
- Produto mais vendido = produto com maior quantidade de vendas
- Produto com maior receita = produto com maior (valor × quantidade)
- Média de vendas = total de vendas / número de produtos
- Impacto de mudança de preço = recalcular faturamento com novo preço`;

    const userPrompt = `DADOS DA TABELA DE PRODUTOS (JSON):
${JSON.stringify(products, null, 2)}

PERGUNTA DO USUÁRIO:
${question}

Responda de forma breve e objetiva, usando APENAS os dados acima.`;

    // Call Gemini API directly
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: userPrompt }
              ]
            }
          ],
          systemInstruction: {
            parts: [
              { text: systemInstruction }
            ]
          },
          generationConfig: {
            temperature: 0.3,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições do Gemini excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API Key do Gemini inválida ou sem permissão." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Erro ao processar sua pergunta. Tente novamente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Gemini raw response:", JSON.stringify(data));
    
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || 
                       "Desculpe, não consegui processar sua pergunta.";

    console.log("Gemini Response:", aiResponse);

    return new Response(
      JSON.stringify({ response: aiResponse }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in plum-chat function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
