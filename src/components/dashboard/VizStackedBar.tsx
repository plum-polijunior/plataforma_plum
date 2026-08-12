/**
 * Barra empilhada horizontal — a forma de parte-do-todo do PLUM.
 *
 * É ela que existe no lugar de rosca e pizza.
 *
 * ── POR QUE 6 SEGMENTOS E NÃO 3 ─────────────────────────────────────────────
 *
 * O `DESIGN.md` §3 põe teto de **3 slots** em formas de todos-os-pares, e o
 * motivo é medido: com 4 slots da paleta CATEGÓRICA, o par amarelo↔laranja cai
 * para ΔE 10,6, abaixo do piso de 15.
 *
 * O teto é da paleta categórica, não da forma. O mesmo §3 prescreve, para
 * comparar magnitude, *"sequencial: um hue só, mais escuro = maior"* — e escala
 * sequencial não gasta slot nenhum.
 *
 * Com sequencial, dois fatos mudam:
 *   1. Os segmentos ficam ordenados por tamanho e a legenda segue a MESMA
 *      ordem, então casar legenda com segmento é por POSIÇÃO, não por cor. A
 *      exigência de todos-os-pares deixa de valer: basta o vizinho diferir.
 *   2. A rampa de luminosidade dá degraus consistentes, sem o problema de dois
 *      matizes vizinhos no espectro colidirem.
 *
 * Seis é o limite de LEITURA, não de cor: abaixo disso os segmentos pequenos
 * viram fatias finas demais para ter rótulo próprio. O excedente continua em
 * "Outros", e continua detalhável.
 *
 * Só faz sentido quando a agregação é somável. Somar médias não produz um todo,
 * e empilhar médias desenharia uma barra cujo comprimento não significa nada —
 * nesse caso o componente recusa e explica, em vez de desenhar algo bonito e
 * falso.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { LinhaResultado } from "./tipos";
import { formatarValor, unidadeDaColuna } from "./formato";
import { corDaSerie } from "./cores";
import { useTemaAtivo } from "@/hooks/use-tema-ativo";

interface Props {
  colunas: string[];
  linhas: LinhaResultado[];
  colunaOrigem?: string;
  agregacao?: string;
  /** Posicao do card na grade, decide o matiz. Ver `cores.ts`. */
  slotCor?: number;
}

/** Ver o cabeçalho: limite de leitura da barra, não de cor. */
const MAX_SEGMENTOS = 6;

const AGREGACOES_SOMAVEIS = new Set(["sum", "count"]);

export function VizStackedBar({ colunas, linhas, colunaOrigem, agregacao, slotCor = 0 }: Props) {
  const [abrirOutros, setAbrirOutros] = useState(false);
  const tema = useTemaAtivo();
  // Segmento sob o cursor. Numa barra empilhada, casar a fatia com a linha da
  // legenda é o mesmo trabalho que numa pizza — as fatias pequenas não cabem
  // rótulo próprio. Destacar os dois lados ao mesmo tempo resolve, e funciona
  // nos dois sentidos: o hover na legenda também realça o segmento.
  const [destacado, setDestacado] = useState<number | null>(null);
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
  const restoParticipacao = resto.reduce((a, d) => a + d.valor, 0) / total;

  return (
    <div>
      {/* Gap de 2px na cor da SUPERFÍCIE separa os segmentos — nunca uma borda
          desenhada (`DESIGN.md` §4). Borda adiciona uma cor a mais para o olho
          resolver justamente onde já há duas encostadas. */}
      <div className="flex h-6 w-full gap-[2px] overflow-hidden rounded-sm">
        {segmentos.map((s, i) => (
          <div
            key={s.rotulo}
            onMouseEnter={() => setDestacado(i)}
            onMouseLeave={() => setDestacado(null)}
            className="transition-opacity duration-150 motion-reduce:transition-none"
            style={{
              opacity: destacado === null || destacado === i ? 1 : 0.45,
              width: `${(s.valor / total) * 100}%`,
              // Os três primeiros usam slots da paleta validada; "Outros" fica
              // recessivo de propósito: ele não é uma categoria, é o resíduo.
              backgroundColor:
                i < MAX_SEGMENTOS
                  ? corDaSerie(slotCor, i, Math.min(principais.length, MAX_SEGMENTOS), tema)
                  : "hsl(var(--muted-foreground) / 0.35)",
            }}
            title={`${s.rotulo}: ${formatarValor(s.valor, unidade)} (${((s.valor / total) * 100).toFixed(0)}%)`}
          />
        ))}
      </div>

      {/* Legenda a partir de 2 séries, sempre (`DESIGN.md` §4). O ponto colorido
          dá a identidade; o texto nunca veste a cor da série. */}
      <ul className="mt-3 space-y-1.5">
        {segmentos.map((s, i) => (
          <li
            key={s.rotulo}
            onMouseEnter={() => setDestacado(i)}
            onMouseLeave={() => setDestacado(null)}
            className={`-mx-1 rounded px-1 transition-colors duration-150 motion-reduce:transition-none ${
              destacado === i ? "bg-foreground/[0.06]" : ""
            }`}
          >
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      i < MAX_SEGMENTOS
                        ? corDaSerie(slotCor, i, Math.min(principais.length, MAX_SEGMENTOS), tema)
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
            </div>

            {/* O detalhamento de "Outros".
                O teto de 3 do `DESIGN.md` §3 é sobre COR: acima disso os pares
                ficam indistinguíveis dentro da barra. Uma lista de texto não
                tem esse problema — o rótulo está escrito ao lado, e todos os
                itens compartilham a mesma cor apagada de propósito, porque
                ninguém precisa diferenciá-los por cor.
                Agrupar sem deixar ver o que foi agrupado esconde dado; agrupar
                oferecendo o detalhe é resumir. */}
            {i === MAX_SEGMENTOS && resto.length > 0 && (
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
                            {/* Percentual do TOTAL, não do "Outros": senão o
                                mesmo rótulo significaria coisas diferentes
                                dentro e fora da lista. */}
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

      {/* Quando "Outros" é grande, o gráfico está errado — não a escolha da
          pessoa. Seis fatias é o teto medido: acima disso o salto de luminância
          entre vizinhos cai a zero (o desvio de matiz cancela a queda de
          luminosidade), e uma fatia de 1% tem 4px num card de 420px. Nenhuma
          cor resolve 4px.
          Então em vez de esconder o problema atrás de uma fatia cinza, o card
          diz o tamanho dele e aponta a forma que mostra tudo. */}
      {resto.length > 0 && restoParticipacao > 0.25 && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          As {resto.length} categorias agrupadas somam{" "}
          {(restoParticipacao * 100).toFixed(0)}% do total — bastante para ficarem
          escondidas. Veja como <strong className="font-medium">Tabela</strong>{" "}
          para ter todas com o valor exato.
        </p>
      )}
    </div>
  );
}
