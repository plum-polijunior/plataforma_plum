/**
 * Pizza — parte-do-todo em ângulo.
 *
 * ── POR QUE ELA EXISTE, SENDO QUE O `DESIGN.md` §10 A PROÍBE ────────────────
 *
 * A proibição do documento é sobre o que o produto PUBLICA: `dashboard_cards.viz`
 * não aceita `pie` no `CHECK`, e continua não aceitando. Esta forma vive só no
 * alternador "Ver como", que não é salvo e não sai da sessão de quem escolheu.
 *
 * A distinção não é um contorno da regra, é a regra aplicada onde ela vale: o
 * padrão que toda a organização vê continua sendo barra ou barra empilhada. O
 * que muda é que uma pessoa pode olhar de outro jeito, para ela.
 *
 * ── O CUSTO, QUE É REAL E ESTÁ MITIGADO ────────────────────────────────────
 *
 * Gente compara COMPRIMENTO bem e ÂNGULO/ÁREA mal — é medido desde Cleveland &
 * McGill nos anos 80, e é o motivo de a barra ser o padrão. Numa pizza dá para
 * dizer "essa é maior", não "essa é quase o dobro daquela".
 *
 * Por isso a legenda traz **valor e percentual de cada fatia**: o gráfico dá a
 * forma, o texto dá a precisão. Sem isso a pizza comunicaria menos que a barra
 * e ocuparia mais espaço.
 *
 * A objeção de COR, essa não se aplica mais: as fatias usam a mesma rampa
 * sequencial dos outros gráficos, ordenadas por tamanho, com a legenda na mesma
 * ordem — a identificação é por posição, não por matiz.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { LinhaResultado } from "./tipos";
import { formatarValor, unidadeDaColuna } from "./formato";
import { corDaSerie } from "./cores";

interface Props {
  colunas: string[];
  linhas: LinhaResultado[];
  colunaOrigem?: string;
  agregacao?: string;
  slotCor?: number;
}

const MAX_FATIAS = 6;
const AGREGACOES_SOMAVEIS = new Set(["sum", "count"]);

/** Raio e centro em coordenadas do `viewBox`, não em pixels: o SVG escala. */
const R = 46;
const C = 50;

/** Ponto da circunferência no ângulo dado, começando às 12 horas. */
function ponto(anguloFracao: number): [number, number] {
  const rad = anguloFracao * 2 * Math.PI - Math.PI / 2;
  return [C + R * Math.cos(rad), C + R * Math.sin(rad)];
}

export function VizPie({ colunas, linhas, colunaOrigem, agregacao, slotCor = 0 }: Props) {
  const [abrirOutros, setAbrirOutros] = useState(false);
  // Fatia sob o cursor. Destaca a fatia E a linha da legenda ao mesmo tempo:
  // o trabalho de casar uma com a outra é justamente o custo da pizza.
  const [destacada, setDestacada] = useState<number | null>(null);
  const [dimensao, medida] = colunas;

  if (!dimensao || !medida) {
    return <p className="text-sm text-muted-foreground">Sem resultado.</p>;
  }

  // Mesma trava do empilhado: fatia de uma média não é parte de um todo.
  if (!AGREGACOES_SOMAVEIS.has(agregacao ?? "")) {
    return (
      <p className="text-sm text-muted-foreground">
        Parte-do-todo só faz sentido em soma ou contagem. Este card calcula uma
        média — veja como barras ou tabela.
      </p>
    );
  }

  const dados = linhas
    .map((l) => ({ rotulo: String(l[dimensao] ?? "—"), valor: Number(l[medida] ?? 0) }))
    .filter((d) => Number.isFinite(d.valor) && d.valor > 0)
    .sort((a, b) => b.valor - a.valor);

  if (dados.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem resultado.</p>;
  }

  const principais = dados.slice(0, MAX_FATIAS);
  const resto = dados.slice(MAX_FATIAS);
  const fatias = resto.length
    ? [
        ...principais,
        { rotulo: `Outros (${resto.length})`, valor: resto.reduce((a, d) => a + d.valor, 0) },
      ]
    : principais;

  const total = fatias.reduce((a, f) => a + f.valor, 0) || 1;
  const unidade = unidadeDaColuna(colunaOrigem ?? medida);
  const cor = (i: number) =>
    i < MAX_FATIAS
      ? corDaSerie(slotCor, i, Math.min(principais.length, MAX_FATIAS))
      : "hsl(var(--muted-foreground) / 0.35)";

  // Ângulos acumulados, em fração de volta (0 a 1).
  let acumulado = 0;
  const arcos = fatias.map((f, i) => {
    const inicio = acumulado;
    acumulado += f.valor / total;
    return { ...f, inicio, fim: acumulado, i };
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0" role="img" aria-label="Gráfico de pizza">
        {arcos.length === 1 ? (
          // Uma fatia só é a circunferência inteira: o arco de 0 a 1 volta ao
          // mesmo ponto e o `path` degenera em nada.
          <circle cx={C} cy={C} r={R} fill={cor(0)} />
        ) : (
          arcos.map((a) => {
            const [x0, y0] = ponto(a.inicio);
            const [x1, y1] = ponto(a.fim);
            const arcoGrande = a.fim - a.inicio > 0.5 ? 1 : 0;
            return (
              <path
                key={a.rotulo}
                d={`M ${C} ${C} L ${x0} ${y0} A ${R} ${R} 0 ${arcoGrande} 1 ${x1} ${y1} Z`}
                fill={cor(a.i)}
                // Traço na cor da superfície faz o mesmo papel do gap de 2px da
                // barra empilhada (`DESIGN.md` §4): separa sem desenhar borda.
                stroke="hsl(var(--card))"
                strokeWidth={1.5}
                opacity={destacada === null || destacada === a.i ? 1 : 0.45}
                className="transition-opacity duration-150 motion-reduce:transition-none"
                onMouseEnter={() => setDestacada(a.i)}
                onMouseLeave={() => setDestacada(null)}
              >
                {/* `<title>` dentro do path: o navegador mostra como dica ao
                    passar o mouse, e o leitor de tela anuncia. Uma dica
                    desenhada por nós não teria a segunda parte. */}
                <title>
                  {`${a.rotulo}: ${formatarValor(a.valor, unidade)} (${(
                    (a.valor / total) * 100
                  ).toFixed(0)}%)`}
                </title>
              </path>
            );
          })
        )}
      </svg>

      <ul className="w-full min-w-0 space-y-1.5">
        {fatias.map((f, i) => (
          <li
            key={f.rotulo}
            onMouseEnter={() => setDestacada(i)}
            onMouseLeave={() => setDestacada(null)}
            className={`rounded px-1 -mx-1 transition-colors duration-150 motion-reduce:transition-none ${
              destacada === i ? "bg-foreground/[0.06]" : ""
            }`}
          >
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: cor(i) }}
                />
                <span className="truncate" title={f.rotulo}>
                  {f.rotulo}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-foreground">
                {formatarValor(f.valor, unidade)}
                <span className="ml-1.5 text-muted-foreground">
                  {((f.valor / total) * 100).toFixed(0)}%
                </span>
              </span>
            </div>

            {i === MAX_FATIAS && resto.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setAbrirOutros((v) => !v)}
                  aria-expanded={abrirOutros}
                  className="mt-1 flex items-center gap-1 pl-3.5 text-[11px] text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none"
                >
                  <ChevronDown
                    className={`h-3 w-3 transition-transform duration-150 motion-reduce:transition-none ${
                      abrirOutros ? "rotate-180" : ""
                    }`}
                  />
                  {abrirOutros ? "Ocultar detalhe" : `Ver as ${resto.length} categorias`}
                </button>

                {abrirOutros && (
                  <ul className="mt-1.5 space-y-1 border-l border-border pl-3.5">
                    {resto.map((r) => (
                      <li
                        key={r.rotulo}
                        className="flex items-baseline justify-between gap-3 text-[11px]"
                      >
                        <span className="truncate text-muted-foreground" title={r.rotulo}>
                          {r.rotulo}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {formatarValor(r.valor, unidade)}
                          <span className="ml-1.5">
                            {((r.valor / total) * 100).toFixed(1)}%
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

    </div>
  );
}
