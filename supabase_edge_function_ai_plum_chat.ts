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
    const { action, prompt, schemaMetadata, executorResult } = await req.json();

    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    let systemInstruction = "";
    let userPrompt = "";

    // =========================================================================
    // AGENTE Z: GUARDIÃO DE CONTEXTO E VIABILIDADE
    // =========================================================================
    if (action === 'guard') {
      systemInstruction = `Você é o Agente Z, Guardião de Segurança, Contexto e Viabilidade da Plataforma Plum.
Sua missão é realizar duas verificações estritas:

1. SEGURANÇA E ESCOPO DO CHAT:
   - Se a pergunta do usuário for sobre assuntos alheios à análise de dados da empresa (ex: história como "Revolução Francesa", receitas, piadas, esportes, bate-papo informal ou comandos de código), você DEVE BLOQUEAR.
   - Para perguntas bloqueadas por escopo, defina status = "BLOQUEADO" e message = "Sou o assistente inteligente da Plataforma Plum especialista nas suas bases de dados e indicadores corporativos. Posso te ajudar a analisar suas planilhas. Como posso ajudar com seus dados hoje?".

2. VIABILIDADE DE DADOS (SCHEMA METADATA):
   - Se a pergunta for sobre dados, analise o schema_metadata fornecido (conceitos e colunas disponíveis).
   - Se o usuário pedir métricas ou dimensões que NÃO existem e não podem ser calculadas a partir das colunas disponíveis no schema_metadata (ex: pedir "lucro" quando só existe "faturamento" sem custo), defina status = "INVIAVEL" e informe amigavelmente na "message" quais colunas faltam.
   - Se a pergunta for sobre dados e houver colunas compatíveis no schema_metadata, defina status = "PERMITIDO".

Sempre retorne ESTRITAMENTE um JSON com as chaves:
"status": ("PERMITIDO" | "BLOQUEADO" | "INVIAVEL")
"message": (string com a mensagem amigável para o usuário caso status seja BLOQUEADO ou INVIAVEL, ou null se PERMITIDO)`;

      userPrompt = `Pergunta do Usuário: "${prompt}"\nSchema Metadata (JSON de Contexto): ${JSON.stringify(schemaMetadata || {})}`;
    }

    // =========================================================================
    // AGENTE A: PLANEJADOR SEMÂNTICO (QUERY PLAN FOR PANDAS EXECUTOR)
    // =========================================================================
    else if (action === 'plan_query') {
      systemInstruction = `Você é o Agente A, Planejador Semântico de Consultas da Plataforma Plum.
Sua única função é analisar a pergunta do usuário e o schema_metadata (JSON de contexto e definições de colunas) e gerar um Query Plan JSON estrito para o executor determinístico em Python (Pandas Executor).

REGRAS OBRIGATÓRIAS DO QUERY PLAN:
- "from": "producao" (ou nome da tabela principal).
- "target_columns": array contendo os nomes EXATOS das colunas que o executor precisará carregar (ex: ["faturamento", "data_venda"]).
- "select": array de expressões de seleção. Cada item pode ser uma string (coluna direta) ou objeto {"expr": {"agg": "sum"|"avg"|"min"|"max"|"count", "col": "nome_coluna"}, "as": "alias"}.
- "where": (opcional) objeto de filtro como {"left": "coluna", "op": "="|"between"|">"|"<"|"contains"|"in", "right": valor} ou {"op": "and"|"or", "args": [...]}.
- "group_by": (opcional) array de colunas para agrupamento.
- "order_by": (opcional) array de objetos {"col": "nome_coluna", "dir": "asc"|"desc"}.
- "limit": (opcional) inteiro limite de linhas (padrão 200).

Retorne ESTRITAMENTE o JSON do Query Plan sem markdown.`;

      userPrompt = `Pergunta do Usuário: "${prompt}"\nSchema Metadata (JSON de Contexto): ${JSON.stringify(schemaMetadata || {})}`;
    }

    // =========================================================================
    // AGENTE C: SINTETIZADOR DE RESPOSTA EM LINGUAGEM NATURAL
    // =========================================================================
    else if (action === 'synthesize_answer') {
      systemInstruction = `Você é o Agente C, Comunicador e Sintetizador de Respostas da Plataforma Plum.
Você receberá a pergunta original do usuário, o schema_metadata de contexto e o resultado exato e determinístico calculated pelo Pandas Executor (vetor de resultados).

Sua tarefa é elaborar uma resposta em português brasileiro executiva, clara, elegante e precisa.
- Utilize os valores exatos retornados pelo executor (respeite moedas R$, percentuais e totais).
- Não invente nem adicione números que não estejam no resultado do executor.
- Responda diretamente à dúvida do usuário de forma profissional.`;

      userPrompt = `Pergunta Original do Usuário: "${prompt}"\nResultado do Executor Python (Vetor de Dados): ${JSON.stringify(executorResult || {})}\nSchema Metadata: ${JSON.stringify(schemaMetadata || {})}`;
    }
    else {
      throw new Error('Ação inválida para ai-plum-chat.');
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY?.trim()}`;

    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: [
          { parts: [{ text: userPrompt }] }
        ],
        generationConfig: {
          temperature: action === 'plan_query' ? 0.0 : 0.2,
          response_mime_type: (action === 'guard' || action === 'plan_query') ? 'application/json' : 'text/plain',
        }
      })
    });

    const data = await res.json();

    if (res.ok) {
      const generatedText = data.candidates[0].content.parts[0].text;
      let finalResponse = generatedText;

      if (action === 'guard' || action === 'plan_query') {
        try {
          const cleaned = generatedText.replace(/```json\n?|\n?```/g, "").trim();
          finalResponse = JSON.parse(cleaned);
        } catch (e) {
          console.error("Falha ao parsear JSON retornado pelo Gemini:", generatedText);
        }
      }

      return new Response(JSON.stringify({ result: finalResponse }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } else {
      console.error("ERRO DA API DO GEMINI (ai-plum-chat):", JSON.stringify(data, null, 2));
      return new Response(JSON.stringify({ error: data.error?.message || "Erro na API do Google Gemini" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
  } catch (error: any) {
    console.error("ERRO INTERNO NA EDGE FUNCTION (ai-plum-chat):", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
