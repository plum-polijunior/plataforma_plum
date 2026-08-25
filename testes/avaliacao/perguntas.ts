/**
 * As perguntas de avaliação do `ad_hoc` — B17.
 *
 * ── ⭐ DUAS METADES, E SÓ UMA É AUTOMATIZÁVEL ──────────────────────────────
 *
 * | | o quê | como |
 * |---|---|---|
 * | **mecânica** | emitiu `std` na pergunta de dispersão? declarou presunção onde havia duas colunas de receita? pediu linha onde agregação bastava? | conferível no plano e no `plum_logs`, vira regressão de verdade |
 * | **julgamento** | a resposta está boa? | 👤 lê e nota |
 *
 * Cada pergunta declara o que a metade mecânica espera. O runner não tenta
 * julgar a resposta — ele imprime, e a nota é humana.
 *
 * ── ⚠️ ESTA LISTA ESTÁ INCOMPLETA, E DE PROPÓSITO ─────────────────────────
 *
 * O plano pede **25–30** perguntas sobre a `plum_base_suja`, e o
 * `PROXIMO-PASSO.md` registra essa lista como *"bloqueante da etapa, sem dono"*.
 * As 14 abaixo cobrem as verificações mecânicas que o plano nomeia
 * explicitamente e as regras do prompt do A3 que já custaram caro. **Elas não
 * substituem a lista completa**, que depende de conhecer as colunas reais da
 * `plum_base_suja` e as perguntas que o negócio de fato faz.
 *
 * ⛔ Não "complete" isto inventando pergunta plausível: uma suíte de avaliação
 * cheia de perguntas que ninguém faria mede a coisa errada com confiança. O que
 * falta é conversa com quem usa, não mais linhas neste arquivo.
 */

export type Agregacao =
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "count"
  | "std"
  | "median"
  | "var"
  | "quantile"
  | "nunique";

export interface Pergunta {
  /** Identificador estável — é a chave do resultado entre execuções. */
  id: string;
  texto: string;
  /** Uma frase: o que esta pergunta existe para verificar. */
  porque: string;

  // ── A metade mecânica ────────────────────────────────────────────────────

  /** Alguma agregação do plano tem de estar aqui. */
  esperaAgregacao?: Agregacao[];
  /** ⛔ Nenhuma agregação do plano pode ser uma destas. */
  proibeAgregacao?: Agregacao[];
  /** A pergunta tem ambiguidade real: o A3 tem de declarar presunção. */
  exigePresuncao?: boolean;
  /** ⛔ A pergunta é inequívoca: presunção aqui é ruído. */
  proibePresuncao?: boolean;
  /** Nenhum pedido pode ser `registro`/`amostra` — agregação resolvia. */
  proibeLinhaBruta?: boolean;
  /** O A3 tem de marcar um termo da pergunta como entidade a resolver. */
  exigeEntidade?: boolean;
  /** A base não tem o dado: a resposta certa é dizer que não tem. */
  esperaInviavel?: boolean;
  /** `group_by` tem de existir (com ou sem `trunc`). */
  exigeAgrupamento?: boolean;
  /** O `trunc` esperado, quando a pergunta pede série temporal. */
  esperaTrunc?: "week" | "month" | "quarter" | "year";
}

export const PERGUNTAS: Pergunta[] = [
  // ── Dispersão e posição: o que o B09 acrescentou e ninguém mediu ─────────
  {
    id: "dispersao-std",
    texto: "Tem alguma venda muito fora do padrão?",
    porque:
      "É a verificação mecânica que o plano nomeia primeiro. 'Fora do padrão' é dispersão, " +
      "e antes do B09 o planejador não tinha `std` na gramática — a resposta era um `max` " +
      "sem contexto, que não distingue um pico legítimo de um outlier.",
    esperaAgregacao: ["std", "var"],
    proibeLinhaBruta: true,
  },
  {
    id: "posicao-mediana",
    texto: "Qual o valor típico de uma venda?",
    porque:
      "'Típico' é mediana, não média: a base suja tem extremos, e a média é puxada por eles. " +
      "O prompt do A3 diz isso explicitamente — este é o teste de que a instrução pega.",
    esperaAgregacao: ["median"],
    proibeAgregacao: ["avg"],
  },
  {
    id: "posicao-percentil",
    texto: "Quanto os 10% melhores clientes faturam?",
    porque:
      "`quantile` exige o parâmetro `p`, e sem ele o pedido é RECUSADO de propósito — a " +
      "biblioteca devolveria a mediana em silêncio e 'percentil 90' viraria 'percentil 50'.",
    esperaAgregacao: ["quantile"],
  },

  // ── Presunção: o entregável do A3, e o defeito mais caro ─────────────────
  {
    id: "presuncao-duas-receitas",
    texto: "Quanto vendemos no total?",
    porque:
      "⭐ O caso canônico do plano: se a base tem mais de uma coluna de receita, escolher " +
      "uma sem dizer devolve um número certo sobre a coisa errada. Presunção não declarada " +
      "é o pior defeito possível aqui, porque é indistinguível de um acerto.",
    exigePresuncao: true,
    esperaAgregacao: ["sum"],
    proibeLinhaBruta: true,
  },
  {
    id: "presuncao-periodo-nao-dito",
    texto: "Como estão as vendas?",
    porque:
      "Não há período na pergunta. Se o planejador filtrar algum, tem de declarar; se não " +
      "filtrar, também é uma escolha — a base inteira pode misturar anos.",
    exigePresuncao: true,
  },
  {
    id: "presuncao-os-melhores",
    texto: "Quais são os melhores vendedores?",
    porque:
      "'Melhores' é por valor ou por quantidade? O prompt lista este caso; sem declarar, o " +
      "ranking responde uma pergunta que ninguém fez.",
    exigePresuncao: true,
    exigeAgrupamento: true,
  },
  {
    id: "sem-presuncao-contagem",
    texto: "Quantas linhas tem essa base?",
    porque:
      "⭐ O contrapeso, e ele importa tanto quanto o resto: uma suíte que só cobra presunção " +
      "premia o agente que declara em tudo, e presunção em toda resposta é ruído que treina " +
      "o usuário a ignorá-la.",
    esperaAgregacao: ["count"],
    proibePresuncao: true,
  },

  // ── R-13: só o Python multiplica ─────────────────────────────────────────
  {
    id: "receita-derivada",
    texto: "Qual a receita total de cada produto?",
    porque:
      "⚠️ Se a base não tem coluna de receita mas tem quantidade e preço, receita é " +
      "OBRIGATORIAMENTE `sum(quantidade × preço)`, dentro de `col`. Devolver `sum(qtd)` e " +
      "`avg(preco)` separados foi a violação do R-13 em 2026-08-11: o sintetizador " +
      "multiplicou os dois no texto e inventou R$ 85.100,00.",
    esperaAgregacao: ["sum"],
    proibeAgregacao: ["avg"],
    exigeAgrupamento: true,
  },

  // ── Linha bruta: o orçamento do B10 ─────────────────────────────────────
  {
    id: "agregacao-basta",
    texto: "Qual foi a maior venda do ano?",
    porque:
      "⚠️ 'A maior' é `max`, não uma linha. O prompt do A3 diz que `registro` exige `where` " +
      "e que sem filtro a pergunta é de agregação — pedir linha aqui gasta a cota de 200 " +
      "linhas/dia do usuário à toa.",
    esperaAgregacao: ["max"],
    proibeLinhaBruta: true,
  },
  {
    id: "amostra-legitima",
    texto: "Me dá um exemplo de linha dessa base, pra eu ver como ela é?",
    porque:
      "O contrapeso do anterior: 'como a base é' só tem resposta com linha. Se o agente " +
      "recusar isto, o orçamento está cobrando de quem não devolve linha.",
  },

  // ── Entidade: o B04, e a falha que devolve vazio parecendo fato ──────────
  {
    id: "entidade-vendedor",
    texto: "Quanto o joão silva vendeu?",
    porque:
      "⭐ Sem resolução de entidade isto devolve ZERO — e zero parece um fato, não um erro. " +
      "O A3 tem de marcar 'joão silva' como entidade e escrever o termo como o usuário " +
      "disse; quem troca pelo literal da base é o resolvedor, sem LLM.",
    exigeEntidade: true,
  },
  {
    id: "entidade-ambigua",
    texto: "Quanto a maria vendeu?",
    porque:
      "Se houver mais de uma Maria, a resposta certa é PERGUNTAR qual — escolher devolve um " +
      "número certo sobre a pessoa errada. O runner registra `desambiguacao` como sucesso.",
    exigeEntidade: true,
  },

  // ── Série temporal ──────────────────────────────────────────────────────
  {
    id: "serie-mensal",
    texto: "Como as vendas evoluíram mês a mês?",
    porque:
      "`trunc: month` sobre a coluna de data. ⚠️ `trunc` não aceita 'day' — agrupar pela " +
      "coluna crua já agrupa por dia, e pedir 'day' seria plano inválido.",
    exigeAgrupamento: true,
    esperaTrunc: "month",
  },

  // ── Inviabilidade: falta de DADO, não de coluna pronta ──────────────────
  {
    id: "inviavel-de-verdade",
    texto: "Qual a nota de satisfação dos clientes?",
    porque:
      "⚠️ Presume-se que a base não tem nada sobre satisfação. Inviável é falta de DADO — e " +
      "o erro oposto é o que o prompt combate: falta de coluna PRONTA não é inviabilidade, " +
      "se der para calcular do que existe, calcule.",
    esperaInviavel: true,
  },
];
