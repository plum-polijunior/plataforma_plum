/**
 * O resultado em linhas.
 *
 * É a visão que o `DESIGN.md` §9 chama de "a peça que mais paga de todo o
 * documento": resolve leitor de tela, daltonismo severo, exportação e tela
 * estreita de uma vez. Um gráfico comunica a forma; a tabela comunica o valor,
 * e há perguntas que só a segunda responde ("quanto exatamente foi o terceiro?").
 *
 * Serve para QUALQUER resultado do executor, inclusive o de um card `kpi` — ali
 * ela vira uma linha só, o que é honesto: é literalmente o que o executor
 * devolveu.
 */

import type { LinhaResultado } from "./tipos";
import { formatarValor, unidadeDaColuna } from "./formato";

interface Props {
  colunas: string[];
  linhas: LinhaResultado[];
  /** Coluna de ORIGEM da agregação — decide R$ / % / nada. Nunca o alias. */
  colunaOrigem?: string;
}

/** Cabeçalho legível a partir do nome técnico: `valor_total_r` → `Valor total r`. */
function rotulo(nome: string): string {
  const limpo = nome.replace(/_/g, " ").trim();
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

export function VizTabela({ colunas, linhas, colunaOrigem }: Props) {
  if (colunas.length === 0 || linhas.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem resultado.</p>;
  }

  // A dimensão do `group_by` vem primeiro; as demais são medidas agregadas.
  // Só as medidas levam unidade — pôr "R$" numa coluna de categoria seria
  // afirmar algo falso sobre o dado.
  const [dimensao] = colunas;
  const unidade = unidadeDaColuna(colunaOrigem);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {colunas.map((c, i) => (
              <th
                key={c}
                scope="col"
                className={`pb-2 text-xs font-medium text-muted-foreground ${
                  i === 0 ? "text-left" : "text-right"
                }`}
              >
                {rotulo(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {colunas.map((c, j) => {
                const bruto = linha[c];
                const numero = typeof bruto === "number" ? bruto : Number(bruto);
                const ehMedida = c !== dimensao || colunas.length === 1;
                const texto =
                  ehMedida && Number.isFinite(numero)
                    ? formatarValor(numero, unidade)
                    : String(bruto ?? "—");

                return (
                  <td
                    key={c}
                    // `tabular-nums` só na coluna de número: é onde há
                    // alinhamento vertical para respeitar (`DESIGN.md` §5).
                    className={`py-2 ${
                      j === 0
                        ? "text-left text-muted-foreground"
                        : "text-right tabular-nums text-foreground"
                    }`}
                  >
                    {texto}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
