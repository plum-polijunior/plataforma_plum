/**
 * Barra empilhada horizontal — a forma de parte-do-todo do PLUM.
 *
 * É ela que existe no lugar de rosca e pizza, e o motivo está medido no
 * `DESIGN.md` §3: barra empilhada é uma **forma de todos-os-pares** (qualquer
 * segmento pode encostar em qualquer outro), então TODOS os pares de cor
 * precisam ser distinguíveis — exigência muito mais dura que a de cores
 * adjacentes. Com 4 categorias o par amarelo↔laranja cai para ΔE 10,6, abaixo
 * do piso de 15, indistinguível antes mesmo de considerar daltonismo.
 *
 * Por isso o TETO DE 3 SEGMENTOS, com o excedente somado em "Outros". Não é
 * simplificação estética: acima de 3 a paleta reprova no próprio validador.
 *
 * Só faz sentido quando a agregação é somável. Somar médias não produz um todo,
 * e empilhar médias desenharia uma barra cujo comprimento não significa nada —
 * nesse caso o componente recusa e explica, em vez de desenhar algo bonito e
 * falso.
 */

import type { LinhaResultado } from "./tipos";
import { formatarValor, unidadeDaColuna } from "./formato";

interface Props {
  colunas: string[];
  linhas: LinhaResultado[];
  colunaOrigem?: string;
  agregacao?: string;
}

/** Teto da §3 para formas de todos-os-pares. */
const MAX_SEGMENTOS = 3;

const AGREGACOES_SOMAVEIS = new Set(["sum", "count"]);

export function VizStackedBar({ colunas, linhas, colunaOrigem, agregacao }: Props) {
  const [dimensao, medida] = colunas;
  if (!dimensao || !medida) {
    return <p className="text-sm text-muted-foreground">Sem resultado.</p>;
  }

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

  const principais = dados.slice(0, MAX_SEGMENTOS);
  const resto = dados.slice(MAX_SEGMENTOS);
  const segmentos = resto.length
    ? [
        ...principais,
        { rotulo: `Outros (${resto.length})`, valor: resto.reduce((a, d) => a + d.valor, 0) },
      ]
    : principais;

  const total = segmentos.reduce((a, s) => a + s.valor, 0) || 1;
  const unidade = unidadeDaColuna(colunaOrigem ?? medida);

  return (
    <div>
      {/* Gap de 2px na cor da SUPERFÍCIE separa os segmentos — nunca uma borda
          desenhada (`DESIGN.md` §4). Borda adiciona uma cor a mais para o olho
          resolver justamente onde já há duas encostadas. */}
      <div className="flex h-6 w-full gap-[2px] overflow-hidden rounded-sm">
        {segmentos.map((s, i) => (
          <div
            key={s.rotulo}
            style={{
              width: `${(s.valor / total) * 100}%`,
              // Os três primeiros usam slots da paleta validada; "Outros" fica
              // recessivo de propósito: ele não é uma categoria, é o resíduo.
              backgroundColor:
                i < MAX_SEGMENTOS ? `hsl(var(--serie-${i + 1}))` : "hsl(var(--muted-foreground) / 0.35)",
            }}
            title={`${s.rotulo}: ${formatarValor(s.valor, unidade)}`}
          />
        ))}
      </div>

      {/* Legenda a partir de 2 séries, sempre (`DESIGN.md` §4). O ponto colorido
          dá a identidade; o texto nunca veste a cor da série. */}
      <ul className="mt-3 space-y-1.5">
        {segmentos.map((s, i) => (
          <li key={s.rotulo} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    i < MAX_SEGMENTOS
                      ? `hsl(var(--serie-${i + 1}))`
                      : "hsl(var(--muted-foreground) / 0.35)",
                }}
              />
              <span className="truncate" title={s.rotulo}>
                {s.rotulo}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-foreground">
              {formatarValor(s.valor, unidade)}
              <span className="ml-1.5 text-muted-foreground">
                {((s.valor / total) * 100).toFixed(0)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
