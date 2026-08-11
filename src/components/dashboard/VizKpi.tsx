/**
 * Um número só, grande.
 *
 * `DESIGN.md` §5: figura herói ≥48px, exatamente uma por tela; os demais stat
 * tiles em 30px. Figuras **proporcionais**, não `tabular-nums` — números
 * tabulares só onde há alinhamento vertical, e aqui não há: um número solto em
 * fonte tabular fica com o espaçamento frouxo e perde presença.
 *
 * `tracking-tight` no herói é o que faz o valor "pesar" sem precisar de sombra,
 * brilho ou fonte de display: em corpo grande, o espaçamento padrão da fonte
 * fica largo demais e o número parece esticado.
 */

import type { LinhaResultado } from "./tipos";
import { formatarValor, unidadeDaColuna } from "./formato";

interface Props {
  colunas: string[];
  linhas: LinhaResultado[];
  /** A primeira figura da tela é a herói. Só uma. */
  heroi?: boolean;
  /** Rótulo do que o número mede. Frase, sem dois-pontos (`DESIGN.md` §5). */
  rotulo?: string;
  /** Coluna de ORIGEM da agregação — decide R$ / % / nada. Nunca o alias. */
  colunaOrigem?: string;
}

export function VizKpi({ colunas, linhas, heroi = false, rotulo, colunaOrigem }: Props) {
  const linha = linhas[0];

  // Agregado único devolve uma linha com uma coluna. Se vier mais de uma, a
  // primeira é a medida — as outras seriam dimensões, e aí o card deveria ser
  // `bar`, não `kpi`.
  const coluna = colunas[0];
  const bruto = linha?.[coluna];

  if (bruto === undefined || bruto === null) {
    return <p className="text-sm text-muted-foreground">Sem resultado.</p>;
  }

  const numero = typeof bruto === "number" ? bruto : Number(bruto);
  const texto = Number.isFinite(numero)
    ? formatarValor(numero, unidadeDaColuna(colunaOrigem ?? coluna))
    : String(bruto);

  return (
    // `justify-end`, não `justify-center`: na tira compacta o valor é empurrado
    // para a base pelo `mt-auto` do card, e centralizar aqui brigaria com isso,
    // deixando cada número numa altura diferente dentro da mesma fileira.
    <div className="flex h-full flex-col justify-end">
      <p
        className={`font-semibold leading-[1.05] tracking-tight text-foreground ${
          heroi ? "text-4xl" : "text-2xl"
        }`}
      >
        {texto}
      </p>
      {rotulo && (
        <p className="mt-2 text-xs text-muted-foreground">{rotulo}</p>
      )}
    </div>
  );
}
