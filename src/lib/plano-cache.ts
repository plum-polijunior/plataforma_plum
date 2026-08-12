/**
 * Reuso de Query Plan no chat: as decisões puras, testáveis sem banco.
 *
 * O QUE ISTO RESOLVE
 *
 * Hoje a mesma pergunta passa pelo Agente A todas as vezes e gera o mesmo
 * plano de novo — 15 perguntas iguais, 15 chamadas ao Gemini, 15 planos
 * idênticos. Se a pessoa já fez exatamente aquela pergunta várias vezes e o
 * plano saiu igual em todas, dá para pular o planejador e mandar o plano
 * direto para o executor.
 *
 * ⚠️ ISTO NÃO É CACHE DE RESULTADO, E A DIFERENÇA É DE SEGURANÇA.
 *
 * O que se reusa é o PLANO, nunca o número. O plano reusado continua entrando
 * por `execute_plan`, que resolve `allowed_columns` do cargo de quem está
 * perguntando AGORA e roda `authorizePlan` de novo. Um plano que cite uma
 * coluna que o cargo não vê volta `forbidden`, exatamente como se o Agente A
 * o tivesse acabado de gerar — é o mesmo modelo que os `dashboard_cards` já
 * operam em produção desde a Fase 4.
 *
 * Cachear o RESULTADO seria outra história: aí o RBAC seria pulado por
 * definição, e precisaria de `permissions_fingerprint` na chave, como
 * `dashboard_card_snapshots` faz. Não é o que acontece aqui.
 */

/** Quantas vezes o mesmo plano precisa ter saído para ser reusado. */
export const REPETICOES_PARA_REUSAR = 5;

/**
 * Serializa um plano de forma estável, para comparar dois planos por
 * igualdade.
 *
 * ⚠️ `JSON.stringify` cru NÃO serve. A ação `plan_query` é a única do
 * `ai-plum-chat` que roda SEM `response_schema` (o Query Plan tem união de
 * tipos em `select` e recursão em `where`; prender num schema distorceria o
 * plano). Sem schema, a ordem das chaves que o Gemini emite não é estável —
 * `{"from":"producao","limit":10}` e `{"limit":10,"from":"producao"}` são o
 * mesmo plano e dariam strings diferentes, fazendo todo lookup dar falso
 * negativo.
 *
 * Ordenar as chaves recursivamente resolve. Arrays NÃO são ordenados: em
 * `select`, `group_by` e `order_by` a ordem é semântica — trocar a ordem do
 * `order_by` muda o resultado.
 *
 * É o mesmo raciocínio de `permissionsFingerprint` em `_shared/query_plan.ts`,
 * que ordena as colunas antes do SHA-256.
 */
export function canonicalizarPlano(plano: unknown): string {
  return JSON.stringify(ordenarChaves(plano));
}

function ordenarChaves(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenarChaves);
  if (valor === null || typeof valor !== "object") return valor;

  const obj = valor as Record<string, unknown>;
  const saida: Record<string, unknown> = {};
  for (const chave of Object.keys(obj).sort()) {
    saida[chave] = ordenarChaves(obj[chave]);
  }
  return saida;
}

/**
 * O plano contém alguma data literal?
 *
 * ⚠️ ESTA É A TRAVA MAIS IMPORTANTE DO ARQUIVO.
 *
 * O prompt do Agente A recebe a data de hoje interpolada
 * (`ai-plum-chat/index.ts`: "Hoje é ${hoje}"). Uma pergunta como "quanto
 * faturei hoje" vira um plano com data ABSOLUTA no `where`:
 *
 *     {"left": "data", "op": "between", "right": ["2026-08-12", "2026-08-12"]}
 *
 * Reusar esse plano amanhã devolveria o faturamento de ontem, sem erro nenhum
 * e sem aviso. Seria "número errado com cara de certo", que o CLAUDE.md já
 * registra duas vezes como o pior tipo de falha que este produto pode cometer
 * (o intervalo que perdia o primeiro dia; a receita como soma × média).
 *
 * A varredura é deliberadamente CONSERVADORA: qualquer string em qualquer
 * lugar do plano que pareça uma data ISO faz o plano inteiro ser considerado
 * datado e ficar fora do cache. Um falso positivo custa uma chamada ao Agente
 * A — o que já é o comportamento de hoje. Um falso negativo custa um número
 * errado na tela.
 */
export function planoTemData(plano: unknown): boolean {
  let achou = false;

  const varrer = (valor: unknown) => {
    if (achou) return;

    if (typeof valor === "string") {
      // ISO (2026-08-12) ou pt-BR (12/08/2026), em qualquer ponto da string.
      if (/\d{4}-\d{2}-\d{2}/.test(valor) || /\d{2}\/\d{2}\/\d{4}/.test(valor)) {
        achou = true;
      }
      return;
    }
    if (Array.isArray(valor)) {
      valor.forEach(varrer);
      return;
    }
    if (valor !== null && typeof valor === "object") {
      Object.values(valor as Record<string, unknown>).forEach(varrer);
    }
  };

  varrer(plano);
  return achou;
}

/**
 * Dado o histórico de planos já gerados para uma mesma pergunta, decide se
 * existe um plano dominante o bastante para ser reusado.
 *
 * Devolve o plano vencedor, ou `null` quando não há consenso suficiente.
 *
 * A contagem é por plano CANONICALIZADO: cinco execuções que produziram
 * quatro planos iguais e um diferente não atingem o limiar de 5 — e não
 * atingir é o resultado certo, porque divergência é sinal de que o Agente A
 * não está determinístico para aquela pergunta.
 */
export function escolherPlanoDominante(
  planos: unknown[],
  limiar: number = REPETICOES_PARA_REUSAR,
): unknown | null {
  const contagem = new Map<string, { plano: unknown; vezes: number }>();

  for (const plano of planos) {
    if (!plano) continue;
    // Um plano datado nunca entra na contagem: se entrasse, poderia vencer e
    // ser servido depois com a data velha.
    if (planoTemData(plano)) continue;

    const chave = canonicalizarPlano(plano);
    const atual = contagem.get(chave);
    if (atual) atual.vezes += 1;
    else contagem.set(chave, { plano, vezes: 1 });
  }

  for (const { plano, vezes } of contagem.values()) {
    if (vezes >= limiar) return plano;
  }

  return null;
}
