/**
 * O registro dos agentes de PLANEJAMENTO — quem existe e o que cada um faz.
 *
 * ── ⭐⭐ POR QUE ISTO É DADO E NÃO PROSA DENTRO DE UM PROMPT ─────────────────
 *
 * O `a2_encaminhador` escolhe qual A3 planeja a pergunta. Para escolher, ele
 * precisa saber o que cada um faz — e o despacho precisa saber qual função
 * chamar. **São dois consumidores da mesma informação.**
 *
 * Se a descrição vivesse dentro da string do prompt e o despacho num `switch`
 * escrito à mão, acrescentar um A3 seria editar dois lugares — e eles
 * divergiriam em silêncio. É exatamente o padrão do D-028 (`_shared/`
 * empacotado por função, divergência invisível até alguém emitir a forma nova)
 * e da normalização duplicada TS↔Python do D-017.
 *
 * ⇒ Um dono, dois consumidores: `paraPrompt()` gera o texto, `resolver()` faz o
 * despacho. Mesma forma do `MODELO_POR_PAPEL`.
 *
 * ── ⛔ O DONO DESTE ARQUIVO É O ADMINISTRADOR, NÃO O CLIENTE ────────────────
 *
 * Quem escreve `quandoUsar` e `capacidades` somos nós. Por isso é **constante
 * em código**, versionada, publicada por deploy — e não:
 *
 *   - tabela no Supabase editável pelo painel. Trocar sem republicar é tentador
 *     e é a lição do I-03 (*o código no repositório deixa de ser o que está
 *     rodando*). E daria ao cliente superfície de escrita sobre o roteamento.
 *   - secret / variável de ambiente. Mesmo motivo pelo qual `MODELOS` não é env
 *     var, já escrito em `llm_core.ts`: um typo derruba todas as perguntas
 *     daquele papel, nenhum teste alcança o valor, e trocar um secret
 *     incrementa o `version` da função sem código novo.
 *   - campo no `schema_metadata`. Ali é território do cliente.
 *
 * ⭐ A fronteira, que é a mesma forma do D-039: **o cliente escreve o que os
 * DADOS significam** (dicionário, grão, observações — no `schema_metadata`); **o
 * administrador escreve o que os AGENTES sabem fazer** (aqui).
 *
 * Consequência: o cliente não cria, renomeia nem descreve um A3. O que ele
 * influencia é qual BASE o A2 escolhe, e influencia isso escrevendo bom
 * dicionário — que é o incentivo certo.
 *
 * Ver `contexto/30-decisoes.md` D-054.
 */

/** O papel de LLM que aquele agente consome. Casa com `Papel` do `llm_core`. */
export type PapelDeAgente = "planejador";

export interface Agente {
  /** O id que o A2 emite e o despacho casa. ⭐ ASCII, sem acento. */
  id: string;
  papel: PapelDeAgente;
  /**
   * ⭐ A frase que o A2 lê para decidir. Escrita para ser comparada com uma
   * pergunta, não para descrever a implementação.
   */
  quandoUsar: string;
  /** O que ele sabe fazer, em termos que restringem a base elegível. */
  capacidades: string[];
  /**
   * ⚠️ `true` ⇒ existe só para a suíte de avaliação. Ver `REGISTRO_DE_TESTE`.
   */
  soParaTeste?: boolean;
}

/**
 * ⭐ O generalista, e o único que existe em produção hoje.
 *
 * O id é `a3_planejador` porque é o nome do arquivo e do prompt
 * (`adhoc/prompts/a3_planejador.ts`). ⛔ **Não é "a3_reconhecedor"** —
 * `reconhecedor` foi o nome do A2, o agente que o cadastro substituiu no B15
 * (D-049). Confundir os dois inverte quem morreu.
 */
export const A3_PLANEJADOR = "a3_planejador";

export const REGISTRO: readonly Agente[] = [
  {
    id: A3_PLANEJADOR,
    papel: "planejador",
    quandoUsar:
      "Qualquer pergunta sobre o que ESTÁ nos dados: somar, contar, comparar, " +
      "ordenar, agrupar por período ou categoria, achar extremo, ver a " +
      "distribuição. É o padrão — escolha-o sempre que nenhum especialista " +
      "encaixar melhor.",
    capacidades: [
      "agregação (soma, média, contagem, mediana, percentil, desvio)",
      "recorte por período absoluto e por categoria",
      "série temporal por semana, mês, trimestre e ano",
      "conta entre colunas linha a linha",
    ],
  },
];

/**
 * ⚠️⚠️ **O ROTEAMENTO COM UM DESTINO SÓ É INFALSIFICÁVEL — e é por isso que esta
 * entrada existe.**
 *
 * Com um A3 apenas, o A2 sempre acerta: não há como distinguir um roteador
 * funcionando de um roteador quebrado. O primeiro teste real aconteceria no dia
 * em que o segundo A3 subisse, que é o pior momento possível para descobrir que
 * o despacho nunca rodou.
 *
 * ⭐ Esta entrada é um especialista de mentira, injetável só pela suíte, para
 * afirmar que uma pergunta de tendência escolhe o especialista e **não** o
 * generalista. É o I-13 aplicado antes do erro: um critério que só confere *"a
 * peça está no lugar?"* dá verde para um mecanismo que nunca executou.
 *
 * ⛔ **Nunca entra no `REGISTRO`.** Quem quiser usá-la passa `REGISTRO_DE_TESTE`
 * explicitamente para `paraPrompt`/`resolver`.
 */
export const A3_TENDENCIA_DE_TESTE = "a3_tendencia";

export const REGISTRO_DE_TESTE: readonly Agente[] = [
  ...REGISTRO,
  {
    id: A3_TENDENCIA_DE_TESTE,
    papel: "planejador",
    quandoUsar:
      "Perguntas sobre o FUTURO ou sobre tendência: projetar, extrapolar, " +
      "prever, estimar quanto vai ser, dizer se a curva sobe ou desce daqui " +
      "para frente. ⛔ Exige uma base com coluna temporal.",
    capacidades: [
      "regressão e extrapolação de série temporal",
      "projeção com intervalo de confiança",
    ],
    soParaTeste: true,
  },
];

/**
 * O trecho do prompt do A2 que descreve as opções — **gerado**, nunca escrito.
 *
 * ⭐ É metade do valor deste arquivo: acrescentar um agente ao `REGISTRO` muda o
 * prompt sem ninguém editar prompt.
 */
export function paraPrompt(agentes: readonly Agente[] = REGISTRO): string {
  const blocos = agentes.map((a) => {
    const linhas = [
      `### ${a.id}`,
      `QUANDO USAR: ${a.quandoUsar}`,
      "SABE FAZER:",
      ...a.capacidades.map((c) => `  - ${c}`),
    ];
    return linhas.join("\n");
  });

  return [
    "OS AGENTES DE PLANEJAMENTO DISPONÍVEIS:",
    "",
    blocos.join("\n\n"),
    "",
    `⚠️ Se nenhum encaixar claramente, escolha "${A3_PLANEJADOR}". Ele é o ` +
    "generalista, e uma escolha conservadora custa menos que uma errada.",
  ].join("\n");
}

/**
 * O id que o A2 pediu, ou o generalista.
 *
 * ⛔⛔ **NUNCA levanta, e isso é uma decisão, não descuido.** Um roteador que
 * levanta exceção transforma um typo do modelo em **chat morto**: a pergunta era
 * respondível, o plano seria válido, e o usuário vê uma falha porque um id veio
 * com um caractere a mais.
 *
 * ⭐ Mesmo espírito do pedido `metadados`, que devolve `{"existe": false}` por
 * coluna em vez de recusar a base inteira.
 *
 * ⚠️ Mas o desvio **não é silencioso**: `caiuNoPadrao` sobe para o chamador
 * gravar `codigo_erro` no `plum_logs`. Um fallback que ninguém mede é um
 * roteador que parou de funcionar sem avisar.
 */
export function resolver(
  idPedido: unknown,
  agentes: readonly Agente[] = REGISTRO,
): { agente: Agente; caiuNoPadrao: boolean } {
  const achado = typeof idPedido === "string"
    ? agentes.find((a) => a.id === idPedido.trim())
    : undefined;

  if (achado) return { agente: achado, caiuNoPadrao: false };

  const padrao = agentes.find((a) => a.id === A3_PLANEJADOR);
  if (!padrao) {
    // ⚠️ Isto é erro de programação, não de modelo: alguém montou um registro
    // sem o generalista. Aí levantar é certo — não há para onde cair.
    throw new Error(`registro de agentes sem o padrao '${A3_PLANEJADOR}'`);
  }
  return { agente: padrao, caiuNoPadrao: true };
}
