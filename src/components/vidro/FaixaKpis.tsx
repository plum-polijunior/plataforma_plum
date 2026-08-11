import { cn } from "@/lib/utils";
import { Moldura } from "./Moldura";
import type { Kpi } from "./dados-demo";

const TOM = {
  ok: "v-ok",
  alerta: "v-alerta",
  neutro: "v-t4",
} as const;

/**
 * Faixa de quatro indicadores. Aparece igual em Bases e em Organização.
 *
 * ⚠️ É o item 1 da lista de reprovação automática do `DESIGN.md` §10 —
 * "gradiente ou glow atrás de número" — em quatro cópias: cada valor fica sobre
 * vidro translúcido, e por baixo do vidro passam as manchas animadas do
 * `Fundo`. A §1 explica por que a regra existe: brilho atrás de um número
 * disputa atenção com o número, e num painel o número é o produto.
 *
 * Fica assim porque é exatamente a escolha que a proposta coloca em mesa. Ver
 * `docs/direcao-vidro.md` §1 e a dívida 3 (contraste sobre vidro nunca foi
 * medido).
 */
export function FaixaKpis({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((k) => (
        <Moldura key={k.rotulo} como="kpi" vidro="alto" classeSup="px-[19px] py-[17px]">
          <div className="v-t3 mb-[11px] text-[12.5px]">{k.rotulo}</div>

          <div className="v-display text-[30px] font-bold leading-none tracking-[-0.025em]">{k.valor}</div>

          {/* O delta some quando não houve variação, mas o elemento fica: a nota
              carrega o sentido sozinha e o espaçamento não pode dançar entre
              cards da mesma fileira. */}
          <div className="mt-3 flex items-center gap-1.5 text-xs">
            <span className={cn("font-medium", TOM[k.tom])}>{k.delta}</span>
            <span className="v-t4">{k.nota}</span>
          </div>
        </Moldura>
      ))}
    </div>
  );
}
