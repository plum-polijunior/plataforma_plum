import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Moldura } from "./Moldura";
import { EstadoMembro } from "./EstadoMembro";
import { MEMBROS_COMPLETOS } from "./dados-demo";

const GRADE = "grid-cols-[2fr_1fr_1fr_200px]";

export function TelaMembros() {
  return (
    <div className="v-entra min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-1">
      <div className="mx-auto flex max-w-[1020px] flex-col gap-3.5">
        <Moldura como="aviso" vidro="base" classeSup="flex items-center gap-3.5 px-5 py-[17px]">
          <Clock size={19} strokeWidth={1.7} className="v-acento flex-none" />
          <div className="flex-1">
            <div className="text-sm font-medium">2 pessoas aguardando aprovação</div>
            <div className="v-t3 mt-0.5 text-[12.5px]">
              Elas não conseguem ver nenhum dado até que você libere o acesso.
            </div>
          </div>
        </Moldura>

        <Moldura como="tabela" vidro="alto" classeSup="overflow-hidden">
          <div
            className={cn(
              "v-regua-b v-t4 grid gap-4 px-[22px] py-[11px] text-[11px] uppercase tracking-[0.07em]",
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
                "v-regua-b v-hover-ctrl grid items-center gap-4 px-[22px] py-3.5 transition-colors duration-150",
                GRADE,
              )}
            >
              <div className="flex min-w-0 items-center gap-[13px]">
                <div className="v-ficha v-acento flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full text-xs font-semibold">
                  {m.iniciais}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium">{m.email}</div>
                  <div className="v-t4 mt-px text-xs">{m.desde}</div>
                </div>
              </div>

              <span className="v-t2 text-[12.5px]">{m.cargo}</span>
              <span className="v-t3 text-[12.5px]">{m.via}</span>

              <div className="flex justify-end">
                <EstadoMembro pendente={m.pendente} />
              </div>
            </div>
          ))}
        </Moldura>
      </div>
    </div>
  );
}
