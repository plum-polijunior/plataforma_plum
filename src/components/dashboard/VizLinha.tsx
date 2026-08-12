/**
 * Evolução no tempo: uma série, um eixo, ordem cronológica.
 *
 * ── POR QUE recharts AQUI, e não em `bar`/`stacked_bar` ──────────────────────
 * O `VizBar` explica por que optou por CSS: a especificação de marca do
 * `DESIGN.md` §4 é apertada (espessura ≤24px, canto de 4px só na ponta) e
 * recharts daria mais luta contra os próprios padrões do que valia. E o mesmo
 * comentário já previa este momento: *"Ele continua certo para `line` e
 * `stacked_bar`, que têm eixo e escala de verdade."*
 *
 * Linha tem escala contínua, domínio temporal e distribuição de ticks. Isso não
 * é CSS: é cálculo de layout, e reimplementar seria trabalho sem ganho.
 *
 * ── O QUE O EXECUTOR MANDA ───────────────────────────────────────────────────
 * A dimensão vem PRIMEIRO e a medida depois, convenção do Query Plan
 * (`pandas_executor.py`, bloco COM AGRUPAMENTO) — mesma leitura do `VizBar`.
 *
 * ⚠️ **A ordem das linhas é a ordem do desenho, e ela vem pronta.** O rótulo de
 * período é ISO justamente para ordenar como texto (`2026-01`, `2026Q1`), e o
 * `order_by` do plano já ordenou. Este componente **não reordena** — diferente
 * do `VizBar`, que ordena por valor decrescente. Ordenar aqui por valor
 * embaralharia o tempo, que é a única coisa que uma linha comunica.
 *
 * ── A SUAVIZAÇÃO: `monotone` SIM, `natural`/`basis` NUNCA ────────────────────
 * O padrão é `monotone`, escolhido em 2026-08-12 depois de comparação visual
 * lado a lado. A distinção entre os tipos de curva é de PRECISÃO, não de gosto,
 * e é ela que autoriza um e proíbe os outros:
 *
 *   - `natural`, `basis`, `cardinal` fazem **overshoot**: a curva passa ACIMA do
 *     maior e ABAIXO do menor dos dois pontos que liga. Ela desenha valores que
 *     não existem em lugar nenhum, inclusive picos falsos. **Nunca usar.** Num
 *     produto cujo pior erro é número errado com cara de certo, um pico
 *     inventado é exatamente isso, em forma de desenho.
 *   - `monotone` (cúbica monotônica) **não faz overshoot**: entre dois pontos ela
 *     nunca sai do intervalo entre eles. Arredonda o canto sem inventar pico.
 *
 * O que `monotone` ainda faz, e é o custo aceito: sugere uma TRAJETÓRIA entre
 * medições. Num faturamento mensal ela insinua um caminho dentro do mês que
 * ninguém mediu. O que sustenta a escolha é que os vértices continuam sendo os
 * valores reais, todo ponto medido tem marcador visível, e o tooltip dá o número
 * exato — o dado permanece recuperável, só o trajeto entre dois dados é
 * estilizado.
 *
 * `curva="linear"` continua disponível e é o modo sem nenhuma interpolação.
 *
 * ── ONDE CADA TEXTO FICA, E POR QUE ──────────────────────────────────────────
 * Três posições, e cada uma resolveu uma sobreposição encontrada em revisão
 * visual. O histórico está registrado em `FOLGA_PONTA` e `ladoDoExtremo`
 * porque as tentativas erradas são instrutivas — duas delas só mudaram o
 * problema de lugar.
 *
 *   1. **Pontos do meio** — rótulo centrado no ponto, alternando acima/abaixo.
 *   2. **Último ponto** — bloco à DIREITA do ponto, fora do caminho de todos.
 *   3. **Legenda** — uma linha embaixo, explicando o triângulo uma vez só.
 *
 * ── REGRAS HERDADAS DO DESIGN.md ─────────────────────────────────────────────
 *   §4  linha de 3px, junção e ponta ARREDONDADAS
 *   §4  marcador ≥8px, com anel de 2px na cor da superfície
 *   §4  preenchimento de área: o hue da série (o degradê — ver a nota de §4 lá)
 *   §4  gridline 1px SÓLIDA e recessiva, nunca tracejada
 *   §7  a COR do delta segue `higher_is_better`, nunca a direção crua
 *   §8  abaixo de 640px o eixo X rarefaz os rótulos (via `minTickGap`)
 *   §10 item 5 — nunca dois eixos Y
 *   §10 item 8 — nunca número em CADA ponto: só os que carregam significado
 */

import { useId } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import type { LinhaResultado } from "./tipos";
import {
  anoDoPeriodo,
  formatarValor,
  formatarVariacao,
  leituraDoDelta,
  rotuloCurtoDePeriodo,
  rotuloDePeriodo,
  SEM_DATA,
  sentidoDaVariacao,
  unidadeDaColuna,
  variacaoPercentual,
  type LeituraDelta,
  type Sentido,
  type TruncPeriodo,
} from "./formato";
import { corDeSerieUnica, type TemaDaSerie } from "./cores";
import { useTemaAtivo } from "@/hooks/use-tema-ativo";
import {
  indicesComValor,
  indicesComVariacao,
  ladoAlternado,
  ladoDoExtremo,
  ladoQueCabe,
  larguraAproximada,
  passoDaVariacao,
} from "./rotulos";

interface Props {
  colunas: string[];
  linhas: LinhaResultado[];
  /** Coluna de ORIGEM da agregação — decide R$ / % / nada. Nunca o alias. */
  colunaOrigem?: string;
  /** O truncamento, para traduzir o rótulo ISO. Ver `rotuloDePeriodo`. */
  periodo?: TruncPeriodo;
  /** `true` = subir é bom, `false` = subir é ruim, `null` = sem cor (DESIGN §7). */
  maiorEhMelhor?: boolean | null;
  /** Posição do card na grade, decide o matiz. Ver `cores.ts`. */
  slotCor?: number;
  /**
   * Altura da área do gráfico, em px. O padrão é a altura do card; a visão
   * ampliada passa um valor maior.
   *
   * ⚠️ Não é só estética: `ladoQueCabe` usa a altura para saber onde estão o
   * topo e a base e decidir se um rótulo cabe acima ou abaixo do ponto. Passar
   * uma altura aqui sem que o container tenha essa altura de fato faz o rótulo
   * ser posicionado contra uma borda que não existe.
   */
  altura?: number;
  /**
   * Mostra a variação em TODO ponto, sem ralear.
   *
   * A visão ampliada liga isto: ela existe justamente para ver todos os dados,
   * então economizar rótulo ali seria contra o propósito dela. E a largura
   * sustenta — no diálogo cada ponto tem ~55px contra ~38px no card, o que
   * acomoda um rótulo de variação (~34px) em cada um.
   */
  densidadeCheia?: boolean;
  /**
   * A interpolação da linha. **O padrão é `monotone`** — ver a seção sobre
   * suavização no cabeçalho para o porquê de ela ser aceitável e as outras não.
   *
   * `monotone` é a única suavização que se pode considerar. A diferença importa:
   *
   *   - `natural`, `basis`, `cardinal` fazem **overshoot**: a curva passa ACIMA
   *     do maior e ABAIXO do menor dos dois pontos que ela liga. Ela desenha
   *     valores que não existem em lugar nenhum, inclusive picos falsos.
   *   - `monotone` (interpolação cúbica monotônica) **não faz overshoot**: entre
   *     dois pontos ela nunca sai do intervalo entre eles. Arredonda o canto sem
   *     inventar pico.
   *
   * Mesmo `monotone` sugere caminho entre medições — num faturamento mensal, a
   * curva insinua uma trajetória dentro do mês que ninguém mediu. É o custo
   * aceito; `curva="linear"` desliga qualquer interpolação.
   *
   * ⚠️ "Suavizar só nas viradas drásticas" não é possível no recharts: `type` é
   * uma propriedade da série inteira, não do segmento. Fazer por segmento exigiria
   * gerar o `path` SVG à mão, ponto a ponto — o que é viável, mas é outro tamanho
   * de trabalho e traria de volta a decisão de onde está o limiar de "drástico".
   */
  curva?: "linear" | "monotone";
}

// ── Geometria ────────────────────────────────────────────────────────────────

const ALTURA_PADRAO = 268;
/** `right` pequena: quem protege o bloco do último ponto é a `FOLGA_PONTA`. */
const MARGEM = { top: 44, right: 12, bottom: 8, left: 8 };
/** Altura que o recharts reserva para o eixo X por padrão. */
const ALTURA_EIXO_X = 30;
/** Altura de um bloco de rótulo, conforme tenha uma ou duas linhas de texto. */
const ALTURA_BLOCO_DUPLO = 30;
const ALTURA_BLOCO_SIMPLES = 16;

/**
 * Folga horizontal DENTRO da área de plotagem, nas duas pontas.
 *
 * Modesta de propósito, e é o que sobrou de uma série de tentativas:
 *
 *   1ª — sem folga, tudo centrado: o rótulo do primeiro ponto invadia a faixa de
 *        números do eixo Y.
 *   2ª — âncora `start`/`end` nos extremos: tirou do eixo Y jogando o texto para
 *        DENTRO do gráfico, por cima da linha. Trocar alinhamento move o problema.
 *   3ª — folga larga (88px) para hospedar o bloco do último ponto: funcionou, mas
 *        176px de folga somados comprimiam os dados ao terço central do card.
 *
 * 38px é o que um rótulo de valor centrado no ponto extremo precisa: o mais largo
 * que aparece ("R$ 128,9 mil") mede ~62px, logo avança ~31px para cada lado.
 * Sem essa folga o rótulo do primeiro ponto invade a faixa de números do eixo Y e
 * o do último é cortado pela moldura do card.
 *
 * NÃO subir para ~88px (que foi tentado, para hospedar um bloco inteiro à direita
 * do último ponto): 176px de folga somados comprimem os dados ao terço central do
 * card, e a linha fica apertada no meio para acomodar texto nas beiradas.
 */
const FOLGA_PONTA = 38;

// ── Helpers de texto ─────────────────────────────────────────────────────────





/**
 * A cor da linha: o tom mais VIVO do matiz do slot que ainda passa no piso de
 * contraste. Ver `corDeSerieUnica` em `cores.ts` para o porquê de não ser o
 * degrau escuro da rampa multi-categoria.
 */
function corDaLinha(slot: number, tema: TemaDaSerie): string {
  return corDeSerieUnica(slot, tema);
}

/** A classe de cor de cada leitura de delta. Token, nunca hex (`CLAUDE.md` §7). */
const COR_DELTA: Record<LeituraDelta, string> = {
  bom: "text-[hsl(var(--ok))]",
  ruim: "text-[hsl(var(--danger))]",
  neutro: "text-muted-foreground",
};

/** A cor do delta como valor de `fill` para SVG. Mesma regra do `COR_DELTA`. */
const FILL_DELTA: Record<LeituraDelta, string> = {
  bom: "hsl(var(--ok))",
  ruim: "hsl(var(--danger))",
  neutro: "hsl(var(--muted-foreground))",
};

/**
 * O triângulo de direção, desenhado.
 *
 * Não é o caractere "▲"/"▼": glifo depende de fonte instalada, muda de tamanho
 * e de alinhamento vertical entre sistemas, e em algumas fontes simplesmente não
 * existe (aparece o retângulo vazio). Desenhar garante a mesma seta em todo
 * lugar, no mesmo tamanho, alinhada com o texto ao lado.
 *
 * `currentColor` faz o triângulo herdar a cor do elemento pai, então a regra de
 * cor do `DESIGN.md` §7 é aplicada uma vez, na classe do container.
 */
function Triangulo({ subiu }: { subiu: boolean }) {
  return (
    <svg
      width="8"
      height="7"
      viewBox="0 0 8 7"
      aria-hidden="true"
      className="inline-block shrink-0"
      style={{ verticalAlign: "baseline" }}
    >
      <path d={subiu ? "M0 7 L8 7 L4 0 Z" : "M0 0 L8 0 L4 7 Z"} fill="currentColor" />
    </svg>
  );
}

interface Ponto {
  bruto: string;
  rotulo: string;
  valor: number;
  /** Fração vs. o ponto anterior. `null` no primeiro, ou quando não dá dizer. */
  variacao: number | null;
  sentido: Sentido | null;
  leitura: LeituraDelta;
  /** Ganha o VALOR escrito? Extremos + espaçados no meio — `indicesComValor`. */
  comValor: boolean;
  /** Ganha o rótulo de VARIAÇÃO? Raleado por `passoDaVariacao`. */
  mostraVariacao: boolean;
}




export function VizLinha({
  colunas,
  linhas,
  colunaOrigem,
  periodo,
  maiorEhMelhor = null,
  slotCor = 0,
  altura = ALTURA_PADRAO,
  densidadeCheia = false,
  curva = "monotone",
}: Props) {
  const isMobile = useIsMobile();
  const tema = useTemaAtivo();
  // O `id` do degradê precisa ser único por instância: dois cards de linha na
  // mesma página com o mesmo id fariam o segundo herdar o gradiente do primeiro,
  // porque `url(#...)` resolve no documento inteiro, não no componente.
  const idGradiente = useId().replace(/:/g, "");
  const [dimensao, medida] = colunas;

  if (!dimensao || !medida) {
    return <p className="text-sm text-muted-foreground">Sem resultado.</p>;
  }

  const unidade = unidadeDaColuna(colunaOrigem);

  // Sem `.sort()`: ver o aviso no cabeçalho. A ordem vem do executor.
  const bruto0 = linhas
    .map((l) => ({
      bruto: String(l[dimensao] ?? ""),
      rotulo: rotuloDePeriodo(String(l[dimensao] ?? ""), periodo),
      valor: Number(l[medida] ?? 0),
    }))
    .filter((d) => Number.isFinite(d.valor));

  // ── Rótulo do eixo: curto, e o ano só onde ele é necessário ───────────────
  // Os anos presentes na série decidem tudo. Um só: o eixo pode dizer apenas
  // "jan", "fev", ... e o ano vira legenda única no fim. Mais de um: o ponto em
  // que o ano vira carrega o ano abreviado, senão dois "jan" ficam
  // indistinguíveis e o eixo passa a mentir.
  const anos = [...new Set(bruto0.map((d) => anoDoPeriodo(d.bruto, periodo)).filter(Boolean))] as string[];
  const anoUnico = anos.length === 1 ? anos[0] : null;

  const cru = bruto0.map((d, i) => {
    const anoDele = anoDoPeriodo(d.bruto, periodo);
    const anoAnterior = i > 0 ? anoDoPeriodo(bruto0[i - 1].bruto, periodo) : null;
    const viradaDeAno = !anoUnico && anoDele !== null && anoDele !== anoAnterior;
    return {
      ...d,
      eixo: rotuloCurtoDePeriodo(d.bruto, periodo, viradaDeAno),
    };
  });

  if (cru.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem resultado.</p>;
  }

  const comValor = indicesComValor(cru.length, densidadeCheia);

  // ── Densidade adaptável ───────────────────────────────────────────────────
  // Quais pontos exibem variação, e em que ORDEM os rótulos aparecem. A ordem é
  // o que alimenta a alternância acima/abaixo — ver `ladoAlternado`.
  const comVariacao = indicesComVariacao(
    cru.length,
    densidadeCheia ? 1 : passoDaVariacao(cru.length),
  );
  const ordemDoRotulo = new Map<number, number>();
  cru.forEach((_, i) => {
    if (comValor.has(i) || comVariacao.has(i)) {
      ordemDoRotulo.set(i, ordemDoRotulo.size);
    }
  });

  const dados: Ponto[] = cru.map((d, i) => {
    const anterior = i > 0 ? cru[i - 1] : null;
    // Variação a partir de "Sem data" não significa nada: aquele grupo não é um
    // período, é o balde das linhas cuja data não pôde ser lida (D6). Comparar
    // um mês com ele produziria um percentual com aparência de informação.
    const comparavel =
      anterior !== null && anterior.bruto !== SEM_DATA && d.bruto !== SEM_DATA;

    const variacao = comparavel ? variacaoPercentual(anterior!.valor, d.valor) : null;
    const sentido = sentidoDaVariacao(variacao);

    return {
      ...d,
      variacao,
      sentido,
      leitura: leituraDoDelta(sentido, maiorEhMelhor),
      comValor: comValor.has(i),
      mostraVariacao: comVariacao.has(i),
    };
  });

  // Um ponto não é evolução. Desenhar uma linha de um ponto só entrega um card
  // vazio com um pingo no meio — dizer isso é mais honesto, e acontece de
  // verdade: a base de teste de vendas é toda de um mês, então "por mês" ali
  // devolve exatamente um ponto.
  if (dados.length === 1) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-1 text-center"
        style={{ height: altura }}
      >
        <p className="text-2xl font-semibold text-foreground">
          {formatarValor(dados[0].valor, unidade)}
        </p>
        <p className="text-sm text-muted-foreground">{dados[0].rotulo}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Só um período no recorte — sem evolução para desenhar.
        </p>
      </div>
    );
  }

  const cor = corDaLinha(slotCor, tema);
  const ultimo = dados[dados.length - 1];
  const iUltimo = dados.length - 1;

  const yTopo = MARGEM.top;
  const yBase = altura - MARGEM.bottom - ALTURA_EIXO_X;

  /**
   * O rótulo de um ponto: valor e/ou variação com triângulo.
   *
   * O ÚLTIMO ponto é tratado à parte, à direita do marcador — ver a nota do
   * cabeçalho. O motivo é que ele é o único ponto que sempre acumula as duas
   * informações (é sempre `comValor`, e sempre tem variação em relação ao
   * penúltimo), então é onde o bloco fica mais alto justamente na posição em
   * que a alternância tem menos espaço para manobrar. Empurrá-lo para a direita
   * o tira do caminho de todos os outros de uma vez.
   */
  const renderRotulo = (props: unknown) => {
    const { x, y, index } = props as { x: number; y: number; index: number };
    const p = dados[index];
    if (!p) return <g key={`vazio-${index}`} />;

    // `mostraVariacao` é a densidade adaptável; ela não muda o dado, só decide
    // se este ponto imprime o rótulo. O último sempre imprime (fica à direita,
    // fora do caminho).
    const temVariacao =
      p.variacao !== null &&
      p.sentido !== null &&
      p.sentido !== "igual" &&
      (p.mostraVariacao || index === iUltimo);
    if (!p.comValor && !temVariacao) return <g key={`vazio-${index}`} />;

    const subiu = p.sentido === "subiu";
    const corTexto = FILL_DELTA[p.leitura];
    const textoVar = formatarVariacao(p.variacao);
    const LARGURA_SETA = 7;
    const VAO_SETA_TEXTO = 3;

    // ── Os pontos do meio: centrados, alternando acima/abaixo ────────────────
    const duplo = p.comValor && temVariacao;
    const alturaBloco = duplo ? ALTURA_BLOCO_DUPLO : ALTURA_BLOCO_SIMPLES;
    // Extremo: lado ditado pela DIREÇÃO da linha. Meio: alternância.
    const ehExtremo = index === 0 || index === iUltimo;
    const vizinho = index === 0 ? dados[1] : dados[iUltimo - 1];
    const preferido =
      ehExtremo && vizinho
        ? ladoDoExtremo(p.valor, vizinho.valor)
        : ladoAlternado(ordemDoRotulo.get(index) ?? index);
    const lado = ladoQueCabe(preferido, y, alturaBloco, yTopo, yBase);

    // Ordem vertical dentro do bloco: valor em cima, variação embaixo — o valor
    // é o dado, a variação é a leitura dele. A ordem NÃO se inverte quando o
    // bloco vai para baixo: manter "dado, depois leitura" em toda a série é o
    // que permite varrer o gráfico com o olho sem reinterpretar.
    let yValor: number;
    let yVar: number;
    if (lado === "abaixo") {
      yValor = y + 18;
      yVar = duplo ? yValor + 12 : y + 18;
    } else {
      yVar = y - 9;
      yValor = duplo ? yVar - 12 : y - 9;
    }

    // Centraliza o grupo "seta + percentual" como unidade. Todo rótulo do meio
    // fica centrado no seu ponto — é a `FOLGA_PONTA` que garante o espaço no
    // primeiro deles.
    const larguraGrupo =
      LARGURA_SETA + VAO_SETA_TEXTO + larguraAproximada(textoVar, 10);
    const xSeta = x - larguraGrupo / 2;

    return (
      <g key={`rot-${index}`}>
        {p.comValor && (
          <text
            x={x}
            y={yValor}
            textAnchor="middle"
            className="fill-foreground"
            style={{ fontSize: 11, fontWeight: 700 }}
          >
            {formatarValor(p.valor, unidade)}
          </text>
        )}
        {temVariacao && (
          <>
            <path
              d={
                subiu
                  ? `M ${xSeta} ${yVar} L ${xSeta + LARGURA_SETA} ${yVar} L ${xSeta + LARGURA_SETA / 2} ${yVar - 6} Z`
                  : `M ${xSeta} ${yVar - 6} L ${xSeta + LARGURA_SETA} ${yVar - 6} L ${xSeta + LARGURA_SETA / 2} ${yVar} Z`
              }
              fill={corTexto}
            />
            <text
              x={xSeta + LARGURA_SETA + VAO_SETA_TEXTO}
              y={yVar}
              textAnchor="start"
              fill={corTexto}
              style={{ fontSize: 10, fontWeight: 600 }}
            >
              {textoVar}
            </text>
          </>
        )}
      </g>
    );
  };

  return (
    <div className="w-full">
      {/* `style` e não classe do Tailwind: a altura tem que sair da MESMA fonte
          que `yBase` usa para saber onde está a base do gráfico. O extrator do
          Tailwind é regex sobre o arquivo, então `h-[${altura}px]` não geraria
          CSS nenhum — e repetir o número deixaria os dois divergirem em
          silêncio, com o rótulo posicionado contra uma borda inexistente. */}
      <div className="relative w-full" style={{ height: altura }}>
        {/* O ano, uma vez, no fim da linha do eixo horizontal.
            Sai do rótulo de cada tick porque repetir "2026" doze vezes gasta
            exatamente a largura que os meses precisam — era o eixo mostrando
            "jan · abr · jul · dez" e a série parecendo ter 4 pontos.

            Fica aqui e não dentro do SVG porque a `FOLGA_PONTA` já reserva
            ~88px vazios no fim do eixo, e posicionar por CSS acompanha o
            container em qualquer largura sem recalcular coordenada.

            Série que cruza anos não mostra ano nenhum aqui: nesse caso quem
            carrega a informação é o tick da virada (`jan/27`), e um ano solto no
            canto seria ambíguo sobre a metade esquerda da série. */}
        {anoUnico && (
          <span
            className="pointer-events-none absolute right-0 text-[11px] font-medium text-muted-foreground"
            style={{ bottom: MARGEM.bottom + 2 }}
          >
            {anoUnico}
          </span>
        )}
        <ResponsiveContainer width="100%" height="100%">
          {/* `top: 44`   — cabe o bloco valor+variação do ponto mais alto;
              `right: 12` — pequena: quem protege o bloco do último ponto é a
                            `FOLGA_PONTA`, dentro da plotagem;
              `left: 8`   — o eixo Y (`width={68}`) já reserva o lado esquerdo;
              `bottom: 8` — separa o rótulo do eixo X da borda de baixo. */}
          <ComposedChart data={dados} margin={MARGEM}>
            <defs>
              {/* Degradê da área: o hue da série descendo até quase transparente.
                  ⚠️ `DESIGN.md` §4 diz "~10% de opacidade", e isto está ACIMA.
                  0.22 → 0 (a média pedida) foi testado com olho humano e ficou
                  invisível nos dois temas. O número do §4 vem da época em que o
                  app só tinha tema escuro, onde 10% sobre fundo quase preto já
                  rendia contraste; no tema claro, que hoje é o `:root`, não
                  rende. Ver a nota que isto gerou no próprio §4. */}
              <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={cor} stopOpacity={0.42} />
                <stop offset="55%" stopColor={cor} stopOpacity={0.16} />
                <stop offset="100%" stopColor={cor} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="hsl(var(--grid))" strokeWidth={1} vertical={false} />

            {/* ⚠️ `interval="preserveStartEnd"` + `minTickGap`, NUNCA
                `interval={0}`. Com `interval={0}` o recharts é obrigado a
                desenhar TODOS os rótulos, e com 12 meses eles se sobrepunham até
                ficar ilegível. Blanquear texto no `tickFormatter` não resolve: o
                espaço já foi reservado e os vizinhos continuam colados.
                `minTickGap` faz o recharts medir e descartar o que não cabe,
                mantendo sempre o primeiro e o último — e honra o §8, porque no
                celular cabe menos e ele rarefaz mais. */}
            <XAxis
              dataKey="eixo"
              stroke="hsl(var(--axis))"
              strokeWidth={1}
              tickLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={isMobile ? 24 : 8}
              dy={8}
              // ⭐ A folga que resolve a sobreposição nos extremos. Ver
              // `FOLGA_PONTA`/`FOLGA_PONTA`.
              padding={{ left: FOLGA_PONTA, right: FOLGA_PONTA }}
            />
            {/* UM eixo Y, sempre (§10 item 5). Compacto, porque "R$ 1.284.000"
                num eixo rouba a largura do card. 68 e não 56: "R$ 128,9 mil" não
                cabia em 56 e era cortado. */}
            <YAxis
              stroke="hsl(var(--axis))"
              strokeWidth={1}
              tickLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              width={68}
              tickFormatter={(v: number) => formatarValor(v, unidade)}
            />
            <Tooltip
              formatter={(v: number) => [formatarValor(v, unidade), medida]}
              // `fontFamily: "inherit"` porque o recharts injeta a própria
              // pilha de fontes no tooltip, e ela não é a Inter do resto do app
              // (`body` em `index.css`) — o número aparecia com desenho de
              // caractere diferente do card em volta.
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                color: "hsl(var(--popover-foreground))",
                fontFamily: "inherit",
                fontSize: 12,
                boxShadow: "none",
              }}
              // `tabular-nums` alinha os dígitos: sem isso o valor "dança" na
              // horizontal conforme o mouse passa de um ponto para outro.
              itemStyle={{
                color: "hsl(var(--popover-foreground))",
                fontFamily: "inherit",
                fontVariantNumeric: "tabular-nums",
                padding: 0,
              }}
              labelStyle={{
                color: "hsl(var(--muted-foreground))",
                fontFamily: "inherit",
                fontSize: 11,
                marginBottom: 2,
              }}
              // O eixo mostra "jan"; o tooltip mostra "jan/2026". `label` aqui é
              // o valor do `dataKey` do eixo (o curto), então o completo vem do
              // próprio ponto — é onde a precisão importa e há espaço para ela.
              labelFormatter={(rotuloCurto, payload) =>
                (payload?.[0]?.payload as Ponto | undefined)?.rotulo ?? rotuloCurto
              }
            />

            {/* A área é só o degradê: `stroke="none"` para não desenhar uma
                segunda linha por cima da de verdade.

                ⚠️ `tooltipType="none"` NÃO é detalhe. `Area` e `Line` usam o
                MESMO `dataKey`, e o recharts monta o tooltip a partir de todas as
                séries ativas — então sem isto o tooltip listava o valor DUAS
                vezes, em duas linhas idênticas. A área é decoração; quem
                representa o dado é a linha. */}
            <Area
              type={curva}
              dataKey="valor"
              stroke="none"
              fill={`url(#${idGradiente})`}
              tooltipType="none"
              isAnimationActive={false}
            />

            <Line
              // Padrão `monotone`. NUNCA trocar para `natural`/`basis`/`cardinal`:
              // essas fazem overshoot e desenham picos que não existem no dado.
              // Ver a seção sobre suavização no cabeçalho.
              type={curva}
              dataKey="valor"
              stroke={cor}
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
              // Ponto em TODO período, em dois pesos:
              //   - medição comum: r=2,5. Ancora o olho em cada mês e deixa
              //     contável quantos períodos existem, que a linha sozinha não
              //     mostra quando os valores são próximos.
              //   - ponto rotulado: r=4 (8px) com anel de 2px na cor da
              //     superfície, exatamente o marcador do `DESIGN.md` §4. Ele
              //     ancora o número escrito, então a ênfase acompanha o rótulo em
              //     vez de marcar pico/fundo — que a forma da linha já mostra.
              //
              // ⚠️ Esta distinção de dois pesos NÃO está no §4, que descreve só
              // "marcador / ponto final". 8px nos doze pontos deixava o gráfico
              // pesado e apagava a hierarquia; nenhum ponto foi o que a revisão
              // visual reprovou. Ver a nota que isto gerou no próprio §4.
              //
              // No ampliado todos são rotulados, então todos ficam fortes — e ali
              // isso é correto: a tela existe para ver cada medição.
              dot={(props) => {
                const { cx, cy, index } = props as {
                  cx: number;
                  cy: number;
                  index: number;
                };
                const p = dados[index];
                if (!p) return <g key={`sem-ponto-${index}`} />;
                const forte = p.comValor;
                return (
                  <circle
                    key={`ponto-${index}`}
                    cx={cx}
                    cy={cy}
                    r={forte ? 4 : 2.5}
                    fill={cor}
                    stroke="hsl(var(--card))"
                    strokeWidth={forte ? 2 : 1.5}
                  />
                );
              }}
              label={renderRotulo}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda, e não repetição do último valor.
          O bloco à direita do último ponto já mostra "quanto" e "quanto variou";
          repetir isso num rodapé era o texto duplicado que a revisão visual
          apontou. O que o gráfico NÃO consegue dizer é contra o que a variação é
          medida — e isso se diz uma vez, aqui, em vez de "vs. <mês>" em cada
          ponto. Fora do SVG porque texto em HTML é selecionável e é lido por
          leitor de tela na ordem certa. */}
      <p className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
        <span className={COR_DELTA[leituraDoDelta("subiu", maiorEhMelhor)]}>
          <Triangulo subiu />
        </span>
        <span className={COR_DELTA[leituraDoDelta("desceu", maiorEhMelhor)]}>
          <Triangulo subiu={false} />
        </span>
        variação em relação ao período anterior
        {ultimo.bruto === SEM_DATA && " · o grupo “Sem data” não entra na comparação"}
      </p>
    </div>
  );
}
