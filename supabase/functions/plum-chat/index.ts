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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build the system prompt with strict instructions
    const systemPrompt = `Você é o Plum, um assistente de análise de dados de vendas. Você SOMENTE pode responder perguntas baseadas nos dados da tabela fornecida abaixo.

DADOS DA TABELA DE PRODUTOS:
${JSON.stringify(products, null, 2)}

REGRAS ESTRITAS:
1. Responda APENAS com base nos dados fornecidos acima
2. Se o usuário perguntar algo que não pode ser calculado com esses dados, diga educadamente que não tem essa informação e sugira que ele adicione os dados necessários na tabela
3. Seja direto, conciso e "executivo" nas respostas
4. Use formato de moeda brasileira (R$) para valores monetários
5. Faça cálculos quando solicitado (faturamento = valor unitário × quantidade vendida)
6. Você pode calcular: faturamento (hoje/mês), produto mais vendido, média de vendas, comparações entre produtos, impacto de mudanças de preço

EXEMPLOS DE CÁLCULOS QUE VOCÊ PODE FAZER:
- Faturamento hoje = soma de (valor unitário × qtd vendas hoje) para cada produto
- Faturamento do mês = soma de (valor unitário × qtd vendas mês) para cada produto
- Produto mais vendido = produto com maior quantidade de vendas
- Produto com maior receita = produto com maior (valor × quantidade)
- Média de vendas = total de vendas / número de produtos
- Impacto de aumento de preço = calcular novo faturamento com preço ajustado`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos à sua conta Lovable." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Erro ao processar sua pergunta. Tente novamente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || "Desculpe, não consegui processar sua pergunta.";

    console.log("AI Response:", aiResponse);

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
