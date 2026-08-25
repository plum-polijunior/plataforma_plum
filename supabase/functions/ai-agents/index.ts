import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { parseGeminiJson } from '../_shared/gemini_parsing.ts';
import { chamar, type Papel } from '../_shared/llm.ts';

import { FORMATTING_TYPES } from './prompts/tipos_de_formatacao.ts';
import { PROMPT_GUARDIAO } from './prompts/agente0_guardiao.ts';
import { PROMPT_SEMANTICA } from './prompts/agente1_semantica.ts';
import { PROMPT_REFINO_SEMANTICO } from './prompts/agente2_refino_semantico.ts';
import { entradaDaFormatacao, PROMPT_FORMATACAO } from './prompts/agente3_formatacao.ts';
import {
  entradaDoRefinoDeFormatacao,
  PROMPT_REFINO_DE_FORMATACAO,
} from './prompts/agente31_refino_de_formatacao.ts';
import { PROMPT_SUPORTE_DE_COLUNAS } from './prompts/suporte_de_colunas.ts';
import {
  entradaDaSemantica,
  normalizarDicionarioDoAgente1,
} from './dicionario_do_cadastro.ts';
import { sugerirDoPerfil, type SugestaoDeColuna } from '../_shared/perfil.ts';

/**
 * `ai-agents` — os seis agentes do cadastro de base.
 *
 * ── ⭐ O QUE O B14 MUDOU AQUI, E POR QUE ────────────────────────────────────
 *
 * Antes: seis `systemInstruction` embutidos neste arquivo e um `fetch` direto
 * para o Gemini com o modelo cravado na URL. O literal ficou **duas versões
 * atrás** (`gemini-3.5-flash` quando o Flash da tabela já era `3.7`) porque
 * estava fora da única tabela que existe para ser o lugar de subir versão.
 *
 * Agora: um arquivo por prompt em `prompts/`, no molde do
 * `ai-plum-chat/adhoc/prompts/`, e toda chamada por `_shared/llm.ts`. É o item
 * **C2** — o `ai-agents` era a última função de produção fora da abstração de
 * provedor (sobra o `dashboard-agent`, fora de escopo por decisão).
 *
 * ⚠️ **`_shared/` é empacotado por função.** Este arquivo passou a consumir
 * `llm.ts`, `llm/gemini.ts`, `llm/claude.ts` e `llm_core.ts` — mexer em
 * qualquer um deles agora exige republicar o `ai-agents` também.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * `action` → agente, e cada agente → papel na tabela de modelos.
 *
 * ⭐ Os dois num lugar só: o rótulo é o que identifica a linha no log, e o papel
 * é quem paga a conta. Tabelas separadas divergiriam — um agente novo com
 * rótulo e sem papel resolveria `undefined` dentro do adaptador, longe da causa.
 */
const AGENTES: Readonly<Record<string, { rotulo: string; papel: Papel }>> = {
  guard: { rotulo: 'agent-0', papel: 'guardiao' },
  predict_semantics: { rotulo: 'agent-1', papel: 'semantico' },
  refine_semantics: { rotulo: 'agent-2', papel: 'semantico' },
  format_data: { rotulo: 'agent-3', papel: 'formatador' },
  refine_format: { rotulo: 'agent-3.1', papel: 'formatador' },
  column_support: { rotulo: 'agent-support', papel: 'suporte' },
};

/**
 * Segunda barreira contra o Gemini inventar um `type` fora do enum.
 *
 * Não dá para confiar só no prompt, e não há `responseSchema` estruturado aqui
 * porque as chaves do objeto são dinâmicas — nome de coluna. Qualquer `type` que
 * não bata exatamente no enum é reescrito para `nenhuma`, **nunca descartado em
 * silêncio**: a explicação registra o que a IA tentou originalmente, para quem
 * revisa a tela entender por que aquela coluna não foi transformada.
 */
function sanitizeFormattingRules(formattingRules: unknown): Record<string, unknown> {
  if (typeof formattingRules !== 'object' || formattingRules === null) return {};
  const saneado: Record<string, unknown> = {};
  for (const [coluna, regra] of Object.entries(formattingRules as Record<string, { type?: string }>)) {
    const tipo = regra?.type;
    if (tipo !== undefined && (FORMATTING_TYPES as readonly string[]).includes(tipo)) {
      saneado[coluna] = regra;
      continue;
    }
    saneado[coluna] = {
      type: 'nenhuma',
      params: {},
      explicacao:
        `Nao transformada: a IA sugeriu um type invalido ('${String(tipo)}'). Revise manualmente.`,
    };
  }
  return saneado;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      action,
      prompt,
      columns,
      dataSamples,
      // ⭐ Os dois do B14, e só o Agente 1 os usa: o perfil da base
      // (`metadados` do Lambda) e o vocabulário das colunas candidatas.
      //
      // ⛔ **As sugestões determinísticas NÃO vêm do cliente** — são calculadas
      // aqui, do perfil, por `sugerirDoPerfil`. Aceitá-las do corpo criaria uma
      // segunda fonte para uma regra que já tem dono (`_shared/perfil.ts`), e
      // um front desatualizado passaria a decidir papel de coluna.
      perfil,
      vocabularios,
    } = await req.json();

    const agente = AGENTES[action as string];
    if (!agente) throw new Error('Ação inválida.');

    let sistema = '';
    let entrada = '';

    // =========================================================================
    // AGENTE 0: GUARDIÃO DE CONTEXTO
    // =========================================================================
    if (action === 'guard') {
      sistema = PROMPT_GUARDIAO;
      entrada = `Analise a seguinte requisição: "${prompt}"`;
    }
    // =========================================================================
    // AGENTE 1: SEMÂNTICA — e o A2 do chat, absorvido (B14)
    // =========================================================================
    else if (action === 'predict_semantics') {
      sistema = PROMPT_SEMANTICA;
      entrada = entradaDaSemantica({
        colunas: (columns ?? []) as string[],
        perfil,
        dataSamples,
        vocabularios: (vocabularios ?? {}) as Record<string, unknown>,
        sugestoes: sugerirDoPerfil((columns ?? []) as string[], perfil),
      });
    }
    // =========================================================================
    // AGENTE 2: REFINAMENTO SEMÂNTICO
    // =========================================================================
    else if (action === 'refine_semantics') {
      sistema = PROMPT_REFINO_SEMANTICO;
      entrada = `Definições atuais do usuário: ${JSON.stringify(columns)}\nMelhore-as.`;
    }
    // =========================================================================
    // AGENTE 3: FORMATAÇÃO DE DADOS
    // =========================================================================
    else if (action === 'format_data') {
      sistema = PROMPT_FORMATACAO;
      entrada = entradaDaFormatacao(dataSamples);
    }
    // =========================================================================
    // AGENTE 3.1: REFINAMENTO DE FORMATAÇÃO
    // =========================================================================
    else if (action === 'refine_format') {
      sistema = PROMPT_REFINO_DE_FORMATACAO;
      // `columns` aqui = as regras de formatação atuais, formato estruturado.
      entrada = entradaDoRefinoDeFormatacao(columns, dataSamples, String(prompt ?? ''));
    }
    // =========================================================================
    // AGENTE DE SUPORTE (COLUNAS) — o único que devolve texto, não JSON
    // =========================================================================
    else if (action === 'column_support') {
      sistema = PROMPT_SUPORTE_DE_COLUNAS;
      entrada = `Dúvida de quem está cadastrando a base: "${prompt}"`;
    }

    const esperaJson = action !== 'guard' && action !== 'column_support';

    const llm = await chamar({
      papel: agente.papel,
      sistema,
      prompt: entrada,
      json: esperaJson,
      temperatura: 0.2,
    });

    if (!llm.ok) {
      // ⚠️ A mensagem do provedor chega ao front porque ela é acionável: cota
      // estourada e chave inválida pedem ações opostas de quem está cadastrando.
      console.error(`[${agente.rotulo}] provedor falhou:`, llm.erro?.codigo, llm.erro?.mensagem);
      return new Response(
        JSON.stringify({ error: llm.erro?.mensagem ?? 'Erro desconhecido da API do provedor' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    let resultado: unknown = llm.texto;

    if (esperaJson) {
      try {
        // Tolera fences de markdown e lixo à direita (ver _shared/gemini_parsing.ts).
        resultado = parseGeminiJson(llm.texto);
      } catch {
        // Antes: caía em silêncio pro texto bruto, e o front salvava essa string
        // crua em `semanticDefinitions`/`formattingRules` sem notar — as caixas
        // de texto por coluna quebravam sem nenhum aviso.
        console.error(`[${agente.rotulo}] Gemini não retornou um JSON válido:`, llm.texto);
        throw new Error('A IA nao retornou um JSON valido. Tente novamente.');
      }
    }

    if (
      (action === 'format_data' || action === 'refine_format') &&
      resultado && typeof resultado === 'object'
    ) {
      const r = resultado as { formattingRules?: unknown };
      if (r.formattingRules) r.formattingRules = sanitizeFormattingRules(r.formattingRules);
    }

    // ⭐ O Agente 1 é o único cuja saída vai direto para o `schema_metadata`.
    // Normalizar aqui, e não no front, é o que impede `papel_analitico`
    // inventado de virar dicionário persistido — mesma postura do
    // `sanitizeFormattingRules` logo acima.
    if (action === 'predict_semantics') {
      resultado = normalizarDicionarioDoAgente1(
        resultado,
        (columns ?? []) as string[],
        sugerirDoPerfil((columns ?? []) as string[], perfil),
      );
    }

    // ⚠️ Observabilidade permanente, não debug: uma linha com a resposta inteira
    // do agente. O `modelo` vai junto porque é a única prova de que a cadeia do
    // cadastro está no raciocínio — `-preview` pode ser aposentado sem aviso.
    console.log(`[${agente.rotulo}] modelo=${llm.modelo}`, JSON.stringify(resultado));

    return new Response(JSON.stringify({ result: resultado }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('ERRO INTERNO NA EDGE FUNCTION (ai-agents):', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    );
  }
});
