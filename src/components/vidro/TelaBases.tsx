import { Database, MoreVertical, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Moldura } from "./Moldura";
import { FaixaKpis } from "./FaixaKpis";
import { BASES, KPIS_BASES, type Tela } from "./dados-demo";

/** Mesmo template no cabeçalho e nas linhas — se divergir, a tabela desalinha
    em qualquer largura que não seja a do protótipo. */
const GRADE = "grid-cols-[2.2fr_1fr_0.7fr_1fr_40px]";

export function TelaBases({ onNavegar }: { onNavegar: (tela: Tela) => void }) {
  return (
    <div className="v-entra min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-1">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-3.5">
        <FaixaKpis kpis={KPIS_BASES} />

        <Moldura como="cartao" vidro="alto" classeSup="overflow-hidden">
          <div className="flex items-baseline gap-[11px] px-[22px] pb-[15px] pt-[18px]">
            <h2 className="v-display m-0 text-[17px] font-semibold tracking-[-0.015em]">Bases conectadas</h2>
            <span className="v-t4 text-[12.5px]">3 publicadas · 1 rascunho</span>
          </div>

          <div
            className={cn(
              "v-regua-t v-regua-b v-t4 grid gap-4 px-[22px] py-2.5 text-[11px] uppercase tracking-[0.07em]",
              GRADE,
            )}
          >
            <span>Base</span>
            <span>Status</span>
            <span>Colunas</span>
            <span>Atualizada</span>
            <span />
          </div>

          {BASES.map((b) => {
            const publicada = b.status === "Publicada";

            return (
              <div
                key={b.nome}
                className={cn(
                  "v-regua-b v-hover-ctrl grid cursor-pointer items-center gap-4 px-[22px] py-[15px] transition-colors duration-150",
                  GRADE,
                )}
              >
                <div className="flex min-w-0 items-center gap-[13px]">
                  <div className="v-ficha flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[11px]">
                    <Database size={16} strokeWidth={1.7} className="v-acento" />
                  </div>
                  <div className="min-w-0">
                    <div className="v-code truncate text-[13px] font-medium">{b.nome}</div>
                    <div className="v-t4 mt-0.5 truncate text-xs">{b.desc}</div>
                  </div>
                </div>

                <div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-[11px] py-1 text-[11.5px] font-medium",
                      publicada
                        ? "v-ok bg-[color:var(--ok-fundo)]"
                        : "v-alerta bg-[color:var(--alerta-fundo)]",
                    )}
                  >
                    <span className="h-[5px] w-[5px] rounded-full bg-current" />
                    {b.status}
                  </span>
                </div>

                <span className="v-code v-t2 text-[13px]">{b.colunas}</span>
                <span className="v-t3 text-[12.5px]">{b.quando}</span>

                <button
                  type="button"
                  aria-label={`Ações de ${b.nome}`}
                  className="v-t4 flex h-7 w-7 items-center justify-center rounded-lg border-0 bg-transparent hover:bg-[color:var(--ctrl-h)] hover:text-[color:var(--texto)]"
                >
                  <MoreVertical size={15} strokeWidth={2} />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => onNavegar("pipeline")}
            className="v-t4 v-hover-ctrl flex w-full items-center justify-center gap-2 border-0 bg-transparent p-4 text-[13px] hover:text-[color:var(--acento)]"
          >
            <Plus size={15} strokeWidth={2} />
            Conectar nova base
          </button>
        </Moldura>
      </div>
    </div>
  );
}
