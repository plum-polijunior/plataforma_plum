/**
 * Formatação de número e de idade para os cards.
 *
 * O executor devolve número cru. Quem decide como ele aparece é a tela — e
 * `DESIGN.md` §5 pede compacto automático (1.284 · 12,9 mil · R$ 4,2 mi),
 * porque um valor grande por extenso rouba a largura do card e some no celular.
 */

/**
 * Heurística de unidade pelo nome da coluna. O executor manda o número já
 * limpo, sem dizer se era R$ ou %.
 *
 * ⚠️ **Usar a coluna de ORIGEM, nunca o alias.** O resultado vem batizado pelo
 * `as` do Query Plan — `ticket`, `total`, `pecas` — e nenhum desses nomes diz o
 * que o número é. Foi por isso que "Ticket médio" apareceu como `230,73` em vez
 * de `R$ 230,73`: a heurística estava olhando o alias.
 *
 * Errar para menos é o certo: um valor sem "R$" continua legível; um "R$"
 * indevido é informação falsa.
 *
 * Isto é a mesma dívida de keyword-match que o `query_engine/urgent.md`
 * registra — a diferença é que aqui ela só afeta a exibição, nunca o cálculo.
 */
const PISTAS_MOEDA = [
  "valor", "faturamento", "receita", "preco", "preço",
  "custo", "total", "ticket", "lucro", "margem_r",
];

const PISTAS_PERCENTUAL = ["percent", "desconto", "taxa", "_pct", "%"];

export type Unidade = "moeda" | "percentual" | "nenhuma";

export function unidadeDaColuna(nomeColuna: string | undefined): Unidade {
  if (!nomeColuna) return "nenhuma";
  const n = nomeColuna.toLowerCase();
  if (PISTAS_PERCENTUAL.some((p) => n.includes(p))) return "percentual";
  if (PISTAS_MOEDA.some((p) => n.includes(p))) return "moeda";
  return "nenhuma";
}

/**
 * Compacto acima de mil, para caber na figura herói sem quebrar linha.
 * Abaixo disso, o número inteiro — arredondar 847 para "0,8 mil" seria perder
 * precisão que cabia na tela.
 */
export function formatarValor(valor: number, unidade: Unidade): string {
  if (unidade === "percentual") {
    // ── A ESCALA DO PERCENTUAL É AMBÍGUA, E ISTO É UM CHUTE INFORMADO ───────
    //
    // O executor devolve o número como ele está na planilha, e há duas origens
    // legítimas para a MESMA ideia de "10%":
    //
    //   célula formatada como porcentagem no Sheets → 0.1   (fração)
    //   texto "10%" numa célula comum               → 10    (pontos)
    //
    // Nada no `formatting_rule` diz qual é: o `type` informa QUE é percentual,
    // não em QUE escala. É a mesma dívida que `query_engine/urgent.md` registra.
    //
    // O corte: abaixo de 1 assume-se fração. É `< 1` e não `<= 1` de propósito
    // — uma média de exatamente 1,0 é comum em coluna de pontos (1% médio) e
    // rara em coluna de fração (exigiria todas as linhas em 100%).
    //
    // ONDE ISTO FALHA, e não é hipotético: uma base cujos percentuais sejam
    // todos abaixo de 1% (0,3% de taxa, por exemplo) seria multiplicada por 100
    // e mostraria 30%. O conserto certo é no executor, que enxerga a COLUNA
    // INTEIRA em vez de um agregado — decidir a escala com 40 valores à vista é
    // outra coisa. Ver `TODOS.md` #13.
    const emPontos = Math.abs(valor) < 1 ? valor * 100 : valor;
    // Percentual nunca é compactado: "12,9 mil %" não existe.
    return `${emPontos.toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    })}%`;
  }

  const abs = Math.abs(valor);
  const prefixo = unidade === "moeda" ? "R$ " : "";

  if (abs >= 1_000_000) {
    return `${prefixo}${(valor / 1_000_000).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })} mi`;
  }
  if (abs >= 10_000) {
    return `${prefixo}${(valor / 1_000).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })} mil`;
  }
  return `${prefixo}${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: unidade === "moeda" ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rótulo de período — a metade do front da decisão D3 da Fase 5b
// ─────────────────────────────────────────────────────────────────────────────

/** Os quatro truncamentos que o executor sabe fazer (`_TRUNC_PARA_PERIODO`). */
export type TruncPeriodo = "week" | "month" | "quarter" | "year";

const MESES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/**
 * O rótulo ISO que o executor emite, traduzido para português.
 *
 * ⚠️ **A divisão de trabalho aqui é uma decisão, não conveniência.** O executor
 * emite ISO — `2026-01`, `2026Q1`, `2026`, `2026-01-05` — porque o rótulo
 * precisa **ordenar como texto**: o `order_by` ordena a coluna de saída e a
 * linha é desenhada na ordem das linhas. Se o executor já mandasse "jan/2026",
 * a ordenação seria alfabética (abr, ago, dez, fev...) e a linha sairia
 * embaralhada sem nenhum erro no caminho.
 *
 * Por isso a tradução mora aqui, DEPOIS da ordenação, junto das outras
 * traduções de exibição. Ver `query_engine/pandas_executor.py`,
 * `_rotulo_de_periodo`, e o teste que trava a ordenação nos dois lados.
 *
 * `trunc` vem por parâmetro em vez de ser adivinhado da string: `2026` poderia
 * ser um ano ou o começo de qualquer outra coisa, e adivinhar é o tipo de
 * heurística que este projeto já paga caro em outro lugar (`unidadeDaColuna`).
 *
 * Nunca lança. Rótulo que não casa com o formato esperado volta como veio — na
 * pior hipótese o usuário lê o ISO, que é feio mas verdadeiro. Inclui o
 * "Sem data" que o executor usa para linha sem data (decisão D6).
 */
export function rotuloDePeriodo(valor: string, trunc?: TruncPeriodo): string {
  if (!valor || !trunc) return valor;

  // year: "2026" já é o rótulo final em português.
  if (trunc === "year") return valor;

  if (trunc === "month") {
    // "2026-01" -> "jan/2026"
    const m = /^(\d{4})-(\d{2})$/.exec(valor);
    if (!m) return valor;
    const mes = MESES_ABREV[Number(m[2]) - 1];
    return mes ? `${mes}/${m[1]}` : valor;
  }

  if (trunc === "quarter") {
    // "2026Q1" -> "1º tri/2026"
    const m = /^(\d{4})Q([1-4])$/.exec(valor);
    return m ? `${m[2]}º tri/${m[1]}` : valor;
  }

  // week: "2026-01-05" (a segunda que abre a semana) -> "05/01/2026"
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : valor;
}

/**
 * O ano de um rótulo ISO de período, ou `null` quando não há como saber.
 *
 * Usado para decidir se o eixo pode omitir o ano (série de um ano só) e para
 * marcar a virada quando ela existe.
 */
export function anoDoPeriodo(valor: string, trunc?: TruncPeriodo): string | null {
  if (!valor || !trunc) return null;
  const m = /^(\d{4})/.exec(valor);
  return m ? m[1] : null;
}

/**
 * A versão CURTA do rótulo, para o eixo horizontal.
 *
 * ⚠️ Existe por um problema de largura medido na tela: `jan/2026` mede ~46px, e
 * com 12 meses num card o `minTickGap` do recharts descartava a maioria — o eixo
 * mostrava "jan · abr · jul · dez" e a série parecia ter 4 pontos. `jan` mede
 * ~18px e os doze cabem.
 *
 * O ano sai do rótulo e vira uma legenda única no fim do eixo (ver `VizLinha`),
 * porque repetir "2026" doze vezes gasta a largura que os meses precisam.
 *
 * `mostrarAno` existe para o caso que quebra a simplificação: **série que cruza
 * anos.** Aí um ano só no fim do eixo mentiria sobre os primeiros pontos, então
 * o ponto em que o ano vira carrega o ano abreviado (`jan/26`). Sem isso, uma
 * série de 18 meses mostraria dois "jan" indistinguíveis.
 *
 * A forma longa continua existindo (`rotuloDePeriodo`) e é o que aparece no
 * tooltip e nos rótulos sobre a linha, onde há espaço e a precisão importa.
 */
export function rotuloCurtoDePeriodo(
  valor: string,
  trunc?: TruncPeriodo,
  mostrarAno = false,
): string {
  if (!valor || !trunc) return valor;
  // `year` não tem o que encurtar: o rótulo JÁ é o ano.
  if (trunc === "year") return valor;

  const ano = anoDoPeriodo(valor, trunc);
  const sufixo = mostrarAno && ano ? `/${ano.slice(2)}` : "";

  if (trunc === "month") {
    const m = /^\d{4}-(\d{2})$/.exec(valor);
    if (!m) return valor;
    const mes = MESES_ABREV[Number(m[1]) - 1];
    return mes ? `${mes}${sufixo}` : valor;
  }

  if (trunc === "quarter") {
    const m = /^\d{4}Q([1-4])$/.exec(valor);
    return m ? `${m[1]}º tri${sufixo}` : valor;
  }

  // week: "2026-01-05" -> "05/01" (o dia e o mês bastam; o ano vem na legenda)
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(valor);
  return m ? `${m[2]}/${m[1]}${sufixo}` : valor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Variação entre períodos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O rótulo que o executor usa para linha sem data (`_SEM_DATA`, decisão D6).
 *
 * Duplicado aqui como string porque o executor é Python e não há como
 * compartilhar constante entre as duas linguagens — mesma situação da
 * normalização de nome de coluna (`CLAUDE.md` §8). Divergir aqui não quebra
 * cálculo: só faz a variação aparecer onde não devia.
 */
export const SEM_DATA = "Sem data";

/** Para onde o número andou. `null` quando não há como saber. */
export type Sentido = "subiu" | "desceu" | "igual";

/** Como pintar: segue `higher_is_better`, nunca a direção crua (DESIGN.md §7). */
export type LeituraDelta = "bom" | "ruim" | "neutro";

/**
 * A variação de `anterior` para `atual`, como fração (0,35 = +35%).
 *
 * `null` significa "não dá para dizer", e cada caso tem motivo:
 *
 *   - **`anterior === 0`** — divisão por zero. "Saiu de 0 e foi para 100" não é
 *     +∞% nem +100%: é um começo, não um crescimento. Mostrar qualquer número
 *     aqui seria inventar.
 *   - **valor não finito** — `null`, `NaN`, texto que não virou número.
 *
 * ⚠️ **O denominador é `Math.abs(anterior)`**, e isso importa quando o valor
 * anterior é negativo (prejuízo, saldo devedor). Sem o `abs`, ir de −100 para
 * −50 daria −50%: o número melhorou e o sinal diria que piorou, porque o
 * denominador negativo inverte a fração. Com `abs`, dá +50%, que é o sentido
 * real do movimento.
 */
export function variacaoPercentual(
  anterior: number | null | undefined,
  atual: number | null | undefined,
): number | null {
  if (anterior == null || atual == null) return null;
  if (!Number.isFinite(anterior) || !Number.isFinite(atual)) return null;
  if (anterior === 0) return null;
  return (atual - anterior) / Math.abs(anterior);
}

/** "+35%" · "−11%" · "0%". Usa o menos tipográfico, não o hífen. */
export function formatarVariacao(fracao: number | null): string {
  if (fracao === null) return "";
  const pct = fracao * 100;
  // Abaixo de 0,5% arredondaria para "0%" com sinal, que lê como erro.
  if (Math.abs(pct) < 0.5) return "0%";
  const sinal = pct > 0 ? "+" : "−";
  return `${sinal}${Math.abs(pct).toLocaleString("pt-BR", {
    maximumFractionDigits: Math.abs(pct) < 10 ? 1 : 0,
  })}%`;
}

export function sentidoDaVariacao(fracao: number | null): Sentido | null {
  if (fracao === null) return null;
  if (Math.abs(fracao * 100) < 0.5) return "igual";
  return fracao > 0 ? "subiu" : "desceu";
}

/**
 * Como pintar a variação — `DESIGN.md` §7, e a regra NÃO é "subiu = verde".
 *
 * | `maiorEhMelhor` | subiu | desceu |
 * |---|---|---|
 * | `true`  | bom    | ruim   |
 * | `false` | ruim   | bom    |
 * | `null`  | neutro | neutro |
 *
 * O `null` é o padrão de card novo, e devolver "neutro" nele é deliberado:
 * *"Cor errada é pior que ausência de cor: um card de custo subindo 30% em
 * verde é lido antes do número e faz a pessoa seguir o dia tranquila."*
 *
 * O triângulo e o texto carregam a direção mesmo sem cor, então nada se perde
 * em preto e branco nem sob daltonismo severo — é o mesmo raciocínio que
 * mantém a tabela sempre disponível (§9).
 */
export function leituraDoDelta(
  sentido: Sentido | null,
  maiorEhMelhor: boolean | null | undefined,
): LeituraDelta {
  if (sentido === null || sentido === "igual") return "neutro";
  if (maiorEhMelhor == null) return "neutro";
  const subiu = sentido === "subiu";
  return subiu === maiorEhMelhor ? "bom" : "ruim";
}

/**
 * "há 4 min", "há 3 h", "há 2 d".
 *
 * A pílula é SEMPRE visível (decisão D5), não só quando o dado está velho: o
 * número pode ter até 15 min de TTL mais 15 min de cache no executor, e a
 * expectativa de "tempo real" precisa virar informação na tela em vez de
 * surpresa.
 */
export function idadeLegivel(iso: string | undefined, agora = Date.now()): string {
  if (!iso) return "";
  const ms = agora - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";

  const min = Math.floor(ms / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;

  const horas = Math.floor(min / 60);
  if (horas < 24) return `há ${horas} h`;

  return `há ${Math.floor(horas / 24)} d`;
}
