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
1. Responda SOMENTE usando os dados da tabela fornecida em JSON.
2. Se a pergunta exigir dados que NÃO estão na tabela, responda que não é possível calcular e peça para o usuário preencher os dados necessários.
3. Seja breve, objetivo e "executivo".
4. Use formato de moeda brasileira (R$) para valores monetários.
5. NÃO invente dados. NÃO faça suposições. Use APENAS os dados fornecidos.

INSTRUÇÕES DE CÁLCULO (SIGA À RISCA):
Sempre que a pergunta envolver faturamento, receita ou valores monetários, você DEVE:
- Listar CADA produto com a multiplicação explícita: nome: unitPrice × quantidade = resultado
- Depois somar os resultados parciais e mostrar o total final.
- Use EXATAMENTE os valores numéricos do JSON. Não arredonde antes de somar.

FÓRMULAS:
- Faturamento hoje de UM produto = unitPrice × salesToday
- Faturamento hoje TOTAL = soma de (unitPrice × salesToday) de TODOS os produtos
- Faturamento do mês de UM produto = unitPrice × salesMonth
- Faturamento do mês TOTAL = soma de (unitPrice × salesMonth) de TODOS os produtos
- Produto mais vendido = produto com maior quantidade de vendas (salesToday ou salesMonth, conforme contexto)
- Produto com maior receita = produto cujo (unitPrice × quantidade) é o maior
- Média de vendas = total de vendas / número de produtos
- Percentual de um produto = (faturamento do produto / faturamento total) × 100

EXEMPLO DE RESPOSTA CORRETA para "faturamento de hoje":
- Camiseta: 59.90 × 12 = R$ 718,80
- Casaco: 189.90 × 5 = R$ 949,50
- Meia: 29.90 × 25 = R$ 747,50
**Total hoje: R$ 2.415,80**

SEMPRE mostre o cálculo passo a passo como acima. Nunca dê apenas o número final.`;

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
