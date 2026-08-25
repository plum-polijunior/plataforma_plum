import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { parseGeminiJson } from '../_shared/gemini_parsing.ts';
import { MODELOS } from '../_shared/llm_core.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rótulo de log por `action` — números dos agentes do pipeline de importação
// (ver CLAUDE.md §5), pra identificar no log de quem é cada resposta.
const AGENT_LABELS: Record<string, string> = {
  guard: 'agent-0',
  predict_semantics: 'agent-1',
  refine_semantics: 'agent-2',
  format_data: 'agent-3',
  refine_format: 'agent-3.1',
  column_support: 'agent-support',
};

/**
 * ⭐ Quantas linhas o Agente 3 devolve TRANSFORMADAS — e por que o número não é
 * o mesmo da amostra que ele recebe.
 *
 * Ele **vê** as 20 linhas de `amostra_do_cadastro` (`TETO_DE_CADASTRO`, em
 * `query_engine/linhas.py`), porque é vendo variedade que se acerta a regra:
 * cinco linhas de uma coluna de texto parecem iguais tendo ela 12 valores
 * distintos ou 12.000. Mas quem revisa é humano, e uma tabela antes-vs-depois
 * de 20 linhas não se lê — 10 é o que cabe na tela do passo 2.
 *
 * ⚠️ **O prompt dizia "5 linhas" cravado enquanto recebia 20**, desde que o B12
 * subiu a amostra. Ninguém mexeu no texto, e o resultado era o agente devolver 5
 * de 20 sem nada apontando a contradição. Por isso o número vive aqui, é
 * interpolado no prompt, e a contagem real da amostra vai junto na mensagem: o
 * prompt não tem como discordar da realidade sozinho.
 */
const LINHAS_NO_ANTES_DEPOIS = 10;

// Enum fechado de `type` de formatação — espelha _FORMATTERS/TYPE_TO_ROLE em
// query_engine/pandas_executor.py. Mudar um lado sem o outro quebra o
// dispatcher em silêncio, então trate os dois como uma unidade.
const FORMATTING_TYPES = [
  'moeda_brl', 'numero_decimal', 'numero_inteiro', 'percentual', 'data', 'ano',
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
    const { action, prompt, columns, dataSamples, colisoes, colunasSemTitulo, aba } = await req.json();

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
      systemInstruction = `Você é um Engenheiro de Dados Especialista. Sua tarefa é analisar amostras de dados de uma planilha e formatá-las corretamente para um banco de dados relacional. Você deve retornar um JSON ESTRITO com duas chaves: 'formattedSamples' (uma array com as PRIMEIRAS ${LINHAS_NO_ANTES_DEPOIS} linhas transformadas, na ordem em que chegaram e mantendo a estrutura de objetos originais — analise TODAS as linhas recebidas para decidir a regra, mas transforme somente essas ${LINHAS_NO_ANTES_DEPOIS}) e 'formattingRules' (um objeto JSON onde a chave é o nome da coluna e o valor é OUTRO OBJETO com exatamente três campos: 'type', 'params' e 'explicacao'.

'type' DEVE ser EXATAMENTE um destes valores, e NUNCA outro: ${FORMATTING_TYPES.join(', ')}.
- moeda_brl: valor monetário escrito como "R$ 1.234,56".
- numero_decimal: número com vírgula decimal, sem moeda (ex.: "8,5").
- numero_inteiro: contagem/quantidade inteira (ex.: "1.000").
- percentual: percentual escrito como texto com "%" (ex.: "15%"). Não use este type se a coluna já for um número puro representando fração.
- data: qualquer data escrita como texto, quando o dia e o mes importam.
- ano: coluna que representa um ANO (ex.: "2005", "Ano de conclusao", "Safra", "Exercicio"). Prefira 'ano' a 'numero_inteiro' e a 'data' sempre que os valores forem anos de 4 digitos, INCLUSIVE se algumas poucas celulas vierem como data completa ("01/12/2005") — este type extrai o ano das duas formas. Usar 'numero_inteiro' faz a data completa virar vazio e o registro sumir das contagens por ano; usar 'data' faz o ano puro virar uma data de 1905.
- texto_trim_maiusculas / texto_trim_minusculas: texto que precisa só de padronização de caixa e espaços.
- documento_cpf_cnpj: CPF ou CNPJ com pontuação.
- booleano_sim_nao: valores como "Sim"/"Não", "Verdadeiro"/"Falso", "1"/"0".
- nenhuma: nada da lista se aplica. Use isto sempre que tiver dúvida — NUNCA invente um type fora desta lista.

'params' é um objeto com parâmetros específicos do type (ex.: {"dayfirst": true} para 'data'; a maioria dos types usa {} vazio).
'explicacao' é uma frase curta em português explicando a regra para um humano revisor — é o único campo que ele vai ler.

Exemplo de valor para uma coluna: {"type": "moeda_brl", "params": {}, "explicacao": "Remove 'R$', separador de milhar e converte vírgula decimal para número."}`;
      userPrompt = `Amostras de dados originais (${Array.isArray(dataSamples) ? dataSamples.length : 0} linhas): ${JSON.stringify(dataSamples)}\nUse TODAS elas para decidir as regras. Retorne 'formattingRules' para todas as colunas e 'formattedSamples' com as primeiras ${LINHAS_NO_ANTES_DEPOIS} linhas transformadas.`;
    }
    // =========================================================================
    // AGENTE 3.1: REFINAMENTO DE FORMATAÇÃO
    // =========================================================================
    else if (action === 'refine_format') {
      systemInstruction = `Você é um Engenheiro de Dados Especialista. O usuário solicitou uma alteração pontual nas regras de formatação. As regras atuais (formattingRules) já vêm no formato estruturado {type, params, explicacao} por coluna. Sua tarefa é alterar APENAS o objeto {type, params, explicacao} da coluna ou solicitação mencionada pelo usuário, MANTENDO TODOS OS OUTROS OBJETOS INTACTOS, sem modificar o que não foi pedido.

'type' DEVE continuar sendo EXATAMENTE um destes valores, e NUNCA outro: ${FORMATTING_TYPES.join(', ')}. Se a alteração pedida não se encaixar em nenhum deles, use 'nenhuma' e explique o motivo em 'explicacao'.

Em seguida, aplique esse conjunto completo de regras atualizado às amostras de dados originais (dataSamples). Você DEVE retornar ESTRITAMENTE um JSON com duas chaves: 'formattedSamples' (uma array com as PRIMEIRAS ${LINHAS_NO_ANTES_DEPOIS} linhas transformadas, na ordem em que chegaram) e 'formattingRules' (o objeto completo, mesmo formato estruturado, com apenas a coluna solicitada modificada).`;
      // columns = regras de formatação atuais (formattingRules, formato estruturado), prompt = solicitação do usuário
      userPrompt = `Regras de Formatação Atuais (formattingRules): ${JSON.stringify(columns)}\nAmostras de Dados Originais (dataSamples): ${JSON.stringify(dataSamples)}\nSolicitação de Alteração do Usuário: "${prompt}"\nAltere APENAS o que o usuário solicitou nas regras e retorne o JSON com 'formattedSamples' e 'formattingRules'.`;
    }
    // =========================================================================
    // AGENTE DE SUPORTE (COLUNAS)
    // =========================================================================
    else if (action === 'column_support') {
      // ⚠️ **Este agente NÃO tem ação executiva — ele só explica.** Ele não
      // conserta a planilha, não relê a base, não cria coluna e não decide nada:
      // devolve texto para uma pessoa ler. O `systemInstruction` daqui era, até
      // 2026-08-25, cópia literal do Agente 3 ("o usuário discordou da
      // formatação... retorne 'formattedSamples' e 'formattingRules'"), que é o
      // papel de outro agente inteiro. Ele também é o único do arquivo fora de
      // `isJsonResponse`, e é por isso: a resposta cai num parágrafo simples do
      // passo 1, e JSON ali apareceria cru na tela.
      systemInstruction = `Você explica, para quem está cadastrando uma base no Plum, como a planilha precisa estar organizada. A pergunta chega da caixa "Faltou alguma coluna?", no passo em que a pessoa vê a lista de colunas que o Plum encontrou.

⭐ O que o Plum faz ao ler uma planilha, e é isto que você explica:
- Ele lê **uma única aba** — a que o link aponta.
- Nessa aba, ele lê **somente a primeira linha** para descobrir os nomes das colunas. Nada acima ou fora da primeira linha é cabeçalho: título de relatório, linha em branco, subtítulo ou célula mesclada no topo fazem o Plum tomar aquilo por nome de coluna.
- Cada coluna precisa de um título **próprio e único** nessa primeira linha. Coluna sem título não pode ser consultada, porque não existe nome pelo qual pedir por ela. Dois títulos que só diferem em acento, espaço ou maiúscula viram o mesmo nome interno e colidem.
- Os dados vêm **da segunda linha em diante**, uma linha por registro.

Então o formato que o Plum entende é: primeira linha só com os nomes das colunas, um nome por coluna, todos preenchidos e distintos, e os dados começando na linha seguinte.

⚠️ **Você não executa nada.** O Plum apenas lê a planilha, nunca escreve nela, e você não altera, não conserta e não relê base nenhuma. Quem edita a planilha é a pessoa, na conta dela; depois disso ela clica em "Reler" para o Plum ver o cabeçalho novo. Diga isso quando houver algo a arrumar.

Como responder: em português, no máximo 3 frases curtas, em TEXTO CORRIDO. Sem JSON, sem lista, sem tabela, sem título, sem emoji — a resposta é exibida como um parágrafo simples. Explique a regra que responde a dúvida dela e o que fazer na planilha. Você não está vendo a planilha nem a lista de colunas: não afirme que uma coluna específica existe, falta ou colidiu, e não sugira calcular ou derivar valor (isso é assunto do chat, depois que a base estiver pronta).`;
      userPrompt = `Dúvida de quem está cadastrando a base: "${prompt}"`;
    }
    else {
      throw new Error('Ação inválida.');
    }

    // Chamada para a API do Gemini.
    //
    // ⭐ **Os seis agentes do cadastro usam o modelo de raciocínio**, não o
    // Flash, desde 2026-08-25. O que eles produzem — `type` de formatação e
    // definição semântica — entra no `schema_metadata`, que é o cérebro do
    // produto (CLAUDE.md §3): errar aqui não estraga uma resposta, estraga
    // todas as respostas futuras sobre aquela coluna, e o custo é pago uma vez
    // por base, não por pergunta. É o inverso do porteiro do chat, que roda
    // sempre e vive no Flash.
    //
    // ⚠️ O ID vem de `MODELOS`, nunca cravado aqui. Antes era o literal
    // `gemini-3.5-flash` nesta linha, invisível para a tabela que existe para
    // ser o único lugar de subir versão — e por isso ficou duas versões atrás
    // sem ninguém notar. Vale o aviso de lá: `-preview` faz parte do ID, e
    // modelo em preview pode ser aposentado sem aviso.
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODELOS.RACIOCINIO}:generateContent?key=${GEMINI_API_KEY?.trim()}`;

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

      console.log(`[${AGENT_LABELS[action] ?? action}]`, JSON.stringify(finalResponse));

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
