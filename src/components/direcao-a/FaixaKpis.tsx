import { cn } from "@/lib/utils";
import type { Kpi } from "./dados-demo";

/** Faixa de 4 indicadores. Aparece igual em Bases e em Organização. */
export function FaixaKpis({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-plum-line lg:grid-cols-4">
      {kpis.map((k) => (
        <div key={k.rotulo} className="border-r border-plum-line px-5 py-[18px] last:border-r-0">
          <div className="mb-2.5 text-[12.5px] text-plum-text-soft">{k.rotulo}</div>
          <div className="font-display text-[29px] font-semibold leading-none tracking-[-0.02em]">{k.valor}</div>
          <div className="mt-3 flex items-center gap-[5px] text-xs">
            <span className={cn(k.tom === "ok" ? "text-plum-ok" : "text-plum-warn")}>{k.delta}</span>
            <span className="text-plum-muted">vs. mês passado</span>
          </div>
        </div>
      ))}
    </div>
  );
}
