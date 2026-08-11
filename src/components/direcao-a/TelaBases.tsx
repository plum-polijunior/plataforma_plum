import { Database, MoreVertical, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { BASES, KPIS_BASES, type Tela } from "./dados-demo";
import { FaixaKpis } from "./FaixaKpis";

/** Mesmo template de colunas no cabeçalho e nas linhas — se divergir, a
    tabela desalinha em qualquer largura que não seja a do protótipo. */
const GRADE = "grid-cols-[2.2fr_1fr_1fr_1fr_40px]";

export function TelaBases({ onNavegar }: { onNavegar: (tela: Tela) => void }) {
  return (
    <div className="animate-pl-in px-6 pb-10 pt-7">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-6">
          <FaixaKpis kpis={KPIS_BASES} />
        </div>

        <div className="mb-3.5 flex items-center gap-2.5">
          <h2 className="m-0 font-display text-base font-semibold tracking-[-0.015em]">Bases conectadas</h2>
          <span className="text-xs text-plum-muted">3 publicadas · 1 rascunho</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-plum-line">
          <div
            className={cn(
              "grid gap-4 border-b border-plum-line bg-plum-surface px-5 py-[11px] text-[11px] uppercase tracking-[0.06em] text-plum-muted",
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
                  "grid cursor-pointer items-center gap-4 border-b border-plum-line px-5 py-[15px] transition-colors duration-150 hover:bg-plum-surface",
                  GRADE,
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-plum-tint-line bg-plum-tint">
                    <Database size={15} strokeWidth={1.8} className="text-plum-brand" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-code text-[13px] font-medium">{b.nome}</div>
                    <div className="mt-0.5 truncate text-[11.5px] text-plum-muted">{b.desc}</div>
                  </div>
                </div>

                <div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-medium",
                      publicada ? "bg-plum-ok-bg text-plum-ok" : "bg-plum-warn-bg text-plum-warn",
                    )}
                  >
                    <span className="h-[5px] w-[5px] rounded-full bg-current" />
                    {b.status}
                  </span>
                </div>

                <span className="font-code text-[13px] text-plum-text">{b.colunas}</span>
                <span className="text-[12.5px] text-plum-text-soft">{b.quando}</span>

                <button
                  type="button"
                  aria-label={`Ações de ${b.nome}`}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-plum-muted-soft transition-all duration-150 hover:bg-plum-surface-hover hover:text-plum-ink"
                >
                  <MoreVertical size={15} strokeWidth={2} />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => onNavegar("pipeline")}
            className="flex w-full items-center justify-center gap-2 p-4 text-[13px] text-plum-muted transition-all duration-150 hover:bg-plum-surface hover:text-plum-brand"
          >
            <Plus size={15} strokeWidth={2} />
            Conectar nova base
          </button>
        </div>
      </div>
    </div>
  );
}
