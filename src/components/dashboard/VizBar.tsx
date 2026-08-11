/**
 * Barra horizontal, série única.
 *
 * ── O ERRO QUE ESTE ARQUIVO JÁ TEVE, E QUE NÃO PODE VOLTAR ──────────────────
 *
 * A versão anterior desenhava a barra como **proporção do maior valor** e
 * escrevia ao lado a **proporção do total**. Duas grandezas diferentes na mesma
 * linha: a maior categoria aparecia com a barra cheia, rotulada "77%". Quem
 * olhasse a barra leria "isto é tudo"; quem lesse o número leria "isto é três
 * quartos". O gráfico contradizia a própria legenda.
 *
 * Agora o comprimento e o número são **a mesma coisa**, e qual delas é depende
 * de a agregação ser somável:
 *
 *   sum/count → PARTE-DO-TODO. O trilho é 100%, cada barra ocupa a sua fatia,
 *               e o percentual ao lado é essa mesma fatia. Somar as somas de
 *               cada categoria dá o total da base: a parte cabe no todo.
 *
 *   avg/min/max → COMPARAÇÃO DE MAGNITUDE. O trilho é o maior valor, a barra é
 *               a razão contra ele, e **nenhum percentual é exibido**. Somar
 *               médias não produz um todo, então qualquer "% do total" ali
 *               seria um número inventado com cara de resposta.
 *
 * ── Outras decisões ────────────────────────────────────────────────────────
 *
 * POR QUE NÃO recharts: a especificação de marca do `DESIGN.md` §4 é apertada —
 * espessura ≤24px, canto de 4px só na ponta do dado, nenhuma sombra. Recharts
 * daria mais luta contra os próprios padrões do que estas linhas de CSS. Ele
 * continua certo para `line` e `stacked_bar`, que têm eixo e escala de verdade.
 *
 * POR QUE SEQUENCIAL E NÃO CATEGÓRICA: `DESIGN.md` §3 — quando o dado compara
 * magnitude, a resposta é *"sequencial: um hue só, mais escuro = maior"*.
 *
 * Horizontal, não vertical: com nome de categoria em português ("Loja Shopping
 * Norte"), a barra vertical vira texto girado ou cortado (`DESIGN.md` §8).
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { LinhaResultado } from "./tipos";
import { formatarValor, unidadeDaColuna } from "./formato";

interface Props {
  colunas: string[];
  linhas: LinhaResultado[];
  /** Coluna de ORIGEM da agregação — decide R$ / % / nada. Nunca o alias. */
  colunaOrigem?: string;
  /** `sum`, `count`, `avg`, `min`, `max`. Decide se parte-do-todo faz sentido. */
  agregacao?: string;
}

/**
 * Quantas barras aparecem antes de o usuário pedir o resto.
 *
 * Quatro, e não oito: a leitura útil de um card de barras é "quem são os
 * maiores e quanto pesam", e isso se responde nas primeiras linhas. Oito
 * transformavam o card num relatório — e num card com 11 categorias o rodapé
 * ainda dizia "7 não exibidas", que é a pior das duas situações: comprido E
 * incompleto.
 *
 * O resto não some, fica atrás de um botão. Esconder sem oferecer o caminho de
 * volta seria truncar; oferecer é resumir.
 */
const BARRAS_PADRAO = 4;

/** Só estas produzem um todo do qual as categorias são partes. */
const AGREGACOES_SOMAVEIS = new Set(["sum", "count"]);

export function VizBar({ colunas, linhas, colunaOrigem, agregacao }: Props) {
  const [expandido, setExpandido] = useState(false);

  // Convenção do Query Plan: a dimensão do `group_by` vem primeiro, a medida
  // agregada depois (`pandas_executor.py`, bloco COM AGRUPAMENTO).
  const [dimensao, medida] = colunas;

  if (!dimensao || !medida) {
    return <p className="text-sm text-muted-foreground">Sem resultado.</p>;
  }

  const dados = linhas
    .map((l) => ({
      rotulo: String(l[dimensao] ?? "—"),
      valor: Number(l[medida] ?? 0),
    }))
    .filter((d) => Number.isFinite(d.valor))
    .sort((a, b) => b.valor - a.valor);

  if (dados.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem resultado.</p>;
  }

  // Valor negativo quebra a leitura de parte-do-todo: uma fatia não pode ser
  // negativa. Havendo qualquer um, cai para comparação de magnitude.
  const temNegativo = dados.some((d) => d.valor < 0);
  const parteDoTodo =
    AGREGACOES_SOMAVEIS.has(agregacao ?? "") && !temNegativo;

  const visiveis = expandido ? dados : dados.slice(0, BARRAS_PADRAO);
  const ocultas = dados.length - visiveis.length;

  // A referência do trilho: o total (parte-do-todo) ou o maior (magnitude).
  const total = dados.reduce((acc, d) => acc + d.valor, 0);
  // Sobre TODOS os dados, não só os visíveis: se a referência mudasse ao
  // expandir, as barras já na tela encolheriam sozinhas e o usuário leria isso
  // como o dado ter mudado.
  const maior = Math.max(...dados.map((d) => Math.abs(d.valor)));
  const referencia = (parteDoTodo ? total : maior) || 1;

  const unidade = unidadeDaColuna(colunaOrigem ?? medida);

  return (
    <div className="space-y-3">
      {visiveis.map((d, i) => {
        const fracao = Math.abs(d.valor) / referencia;

        // Sequencial dentro do slot 1: luminosidade cheia no maior, descendo
        // até um piso. O piso existe para a última barra continuar visível
        // contra a superfície do card — escala que some não informa nada.
        const luz = 56 - Math.min(i, 5) * 4.4;

        return (
          <div key={d.rotulo}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              {/* Texto nunca veste a cor da série (`DESIGN.md` §4). */}
              <span className="truncate text-xs text-muted-foreground" title={d.rotulo}>
                {d.rotulo}
              </span>
              <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">
                {formatarValor(d.valor, unidade)}
                {parteDoTodo && (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {(fracao * 100).toFixed(0)}%
                  </span>
                )}
              </span>
            </div>

            {/* Trilho: em parte-do-todo ele É o 100%, então a barra ocupar um
                quarto dele significa literalmente um quarto do total. */}
            <div className="h-2 w-full overflow-hidden rounded-sm bg-foreground/[0.045]">
              <div
                className="h-full rounded-r-[3px] transition-[width] duration-150 motion-reduce:transition-none"
                style={{
                  width: `${Math.max(fracao * 100, 1.5)}%`,
                  backgroundColor: `hsl(212 78% ${luz}%)`,
                }}
              />
            </div>
          </div>
        );
      })}

      {(ocultas > 0 || expandido) && (
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          className="flex items-center gap-1 pt-1 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none"
          aria-expanded={expandido}
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-150 motion-reduce:transition-none ${
              expandido ? "rotate-180" : ""
            }`}
          />
          {expandido
            ? "Ver menos"
            : `Ver todas as ${dados.length} categorias`}
        </button>
      )}
    </div>
  );
}
