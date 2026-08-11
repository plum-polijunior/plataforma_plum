import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { MEMBROS_COMPLETOS } from "./dados-demo";
import { EstadoMembro } from "./EstadoMembro";

const GRADE = "grid-cols-[2fr_1fr_1fr_200px]";

export function TelaMembros() {
  return (
    <div className="animate-pl-in px-6 pb-10 pt-7">
      <div className="mx-auto max-w-[1000px]">
        <div className="mb-5 flex items-center gap-3.5 rounded-xl border border-plum-tint-line bg-plum-tint-soft px-5 py-4">
          <Clock size={18} strokeWidth={1.8} className="flex-none text-plum-brand" />
          <div className="flex-1">
            <div className="text-[13.5px] font-medium">2 pessoas aguardando aprovação</div>
            <div className="mt-0.5 text-[12.5px] text-plum-text">
              Elas não conseguem ver nenhum dado até que você libere o acesso.
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-plum-line">
          <div
            className={cn(
              "grid gap-4 border-b border-plum-line bg-plum-surface px-5 py-[11px] text-[11px] uppercase tracking-[0.06em] text-plum-muted",
              GRADE,
            )}
          >
            <span>Pessoa</span>
            <span>Cargo</span>
            <span>Entrou por</span>
            <span />
          </div>

          {MEMBROS_COMPLETOS.map((m) => (
            <div
              key={m.email}
              className={cn(
                "grid items-center gap-4 border-b border-plum-line px-5 py-3.5 transition-colors duration-150 hover:bg-plum-surface",
                GRADE,
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-plum-tint-line bg-plum-tint-soft text-[11.5px] font-semibold text-plum-brand">
                  {m.iniciais}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{m.email}</div>
                  <div className="mt-px text-[11.5px] text-plum-muted">{m.desde}</div>
                </div>
              </div>

              <span className="text-[12.5px] text-plum-text">{m.cargo}</span>
              <span className="text-[12.5px] text-plum-muted">{m.via}</span>

              <div className="flex justify-end">
                <EstadoMembro pendente={m.pendente} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
