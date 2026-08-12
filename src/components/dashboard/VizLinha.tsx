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
 * ── REGRAS HERDADAS DO DESIGN.md ─────────────────────────────────────────────
 *   §4  linha de 2px, junção e ponta ARREDONDADAS
 *   §4  marcador ≥8px, com anel de 2px na cor da superfície
 *   §4  gridline 1px SÓLIDA e recessiva, nunca tracejada
 *   §8  abaixo de 640px o eixo X reduz para primeiro/meio/último
 *   §10 item 5 — nunca dois eixos Y
 *   §10 item 8 — nunca número em cada ponto: só o último ganha rótulo direto
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import type { LinhaResultado } from "./tipos";
import {
  formatarValor,
  rotuloDePeriodo,
  unidadeDaColuna,
  type TruncPeriodo,
} from "./formato";
import { corDaSerie } from "./cores";

interface Props {
  colunas: string[];
  linhas: LinhaResultado[];
  /** Coluna de ORIGEM da agregação — decide R$ / % / nada. Nunca o alias. */
  colunaOrigem?: string;
  /** O truncamento, para traduzir o rótulo ISO. Ver `rotuloDePeriodo`. */
  periodo?: TruncPeriodo;
  /** Posição do card na grade, decide o matiz. Ver `cores.ts`. */
  slotCor?: number;
}

/**
 * Uma linha é UMA série, então ela usa o degrau mais escuro do matiz do slot —
 * `corDaSerie(slot, 0, 1)` devolve `t = 1`, o tom cheio. A rampa de luminosidade
 * de `cores.ts` existe para distinguir categorias dentro de um card; aqui não há
 * o que distinguir, e um tom claro só perderia contraste contra o fundo.
 */
function corDaLinha(slot: number): string {
  return corDaSerie(slot, 0, 1);
}

export function VizLinha({
  colunas,
  linhas,
  colunaOrigem,
  periodo,
  slotCor = 0,
}: Props) {
  const isMobile = useIsMobile();
  const [dimensao, medida] = colunas;

  if (!dimensao || !medida) {
    return <p className="text-sm text-muted-foreground">Sem resultado.</p>;
  }

  const unidade = unidadeDaColuna(colunaOrigem);

  // Sem `.sort()`: ver o aviso no cabeçalho. A ordem vem do executor.
  const dados = linhas
    .map((l) => ({
      bruto: String(l[dimensao] ?? ""),
      rotulo: rotuloDePeriodo(String(l[dimensao] ?? ""), periodo),
      valor: Number(l[medida] ?? 0),
    }))
    .filter((d) => Number.isFinite(d.valor));

  if (dados.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem resultado.</p>;
  }

  // Um ponto não é evolução. Desenhar uma linha de um ponto só entrega um card
  // vazio com um pingo no meio — dizer isso é mais honesto, e acontece de
  // verdade: a base de teste de vendas é toda de um mês, então "por mês" ali
  // devolve exatamente um ponto.
  if (dados.length === 1) {
    return (
      <div className="flex h-[180px] flex-col items-center justify-center gap-1 text-center">
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

  const cor = corDaLinha(slotCor);

  // §8: abaixo de 640px, primeiro/meio/último. Acima, todos — o número de
  // períodos de um card é pequeno por natureza (12 meses, 4 trimestres).
  const indicesVisiveis = isMobile
    ? new Set([0, Math.floor((dados.length - 1) / 2), dados.length - 1])
    : null;

  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          {/* Gridline: 1px sólida e recessiva. `vertical={false}` porque a
              comparação que importa numa linha é de ALTURA; grade vertical
              adiciona ruído sem ajudar a ler valor. */}
          <CartesianGrid
            stroke="hsl(var(--grid))"
            strokeWidth={1}
            vertical={false}
          />
          <XAxis
            dataKey="rotulo"
            stroke="hsl(var(--axis))"
            strokeWidth={1}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            interval={0}
            tickFormatter={(valor: string, indice: number) =>
              indicesVisiveis && !indicesVisiveis.has(indice) ? "" : valor
            }
          />
          {/* UM eixo Y, sempre (§10 item 5). Compacto, porque "R$ 1.284.000"
              num eixo rouba a largura do card. */}
          <YAxis
            stroke="hsl(var(--axis))"
            strokeWidth={1}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            width={56}
            tickFormatter={(v: number) => formatarValor(v, unidade)}
          />
          <Tooltip
            // O tooltip é onde o número exato vive, já que o gráfico não
            // carimba valor em cada ponto (§10 item 8).
            formatter={(v: number) => [formatarValor(v, unidade), medida]}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              color: "hsl(var(--popover-foreground))",
              fontSize: 12,
            }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
          />
          <Line
            type="linear"
            dataKey="valor"
            stroke={cor}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            // §10 item 8 e §4: marcador só no ÚLTIMO ponto, ≥8px (r=4 → 8px de
            // diâmetro) e com anel de 2px na cor da superfície. Marcador em todo
            // ponto vira contagem de contas, e some a leitura de tendência.
            //
            // É `dot` e não `activeDot`: o do último ponto é PERMANENTE, porque
            // ele ancora "onde a série termina". O `activeDot` abaixo é outra
            // coisa — o realce de quem está sob o cursor.
            dot={(props) => {
              const { cx, cy, index } = props as {
                cx: number;
                cy: number;
                index: number;
              };
              if (index !== dados.length - 1) {
                // Recharts exige um elemento SVG; devolver null quebra o tipo.
                return <g key={`sem-ponto-${index}`} />;
              }
              return (
                <circle
                  key={`ponto-${index}`}
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill={cor}
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                />
              );
            }}
            activeDot={{ r: 4, fill: cor, stroke: "hsl(var(--card))", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Rótulo direto SELETIVO: o último valor, que é o que a pessoa quer
          saber ao bater o olho. Fora do SVG de propósito — texto em HTML é
          selecionável e é lido por leitor de tela na ordem certa. */}
      <p className="mt-1 text-right text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">
          {formatarValor(dados[dados.length - 1].valor, unidade)}
        </span>
        {" em "}
        {dados[dados.length - 1].rotulo}
      </p>
    </div>
  );
}
