import { Copy, Plus, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { ATIVIDADE, CODIGO_CONVITE, DOMINIOS, KPIS_ORG, MEMBROS_RESUMO, type Tela } from "./dados-demo";
import { EstadoMembro } from "./EstadoMembro";
import { FaixaKpis } from "./FaixaKpis";

const TOM_MARCADOR = {
  ok: "bg-plum-ok",
  marca: "bg-plum-brand",
  neutro: "bg-plum-muted",
} as const;

export function TelaOrganizacao({ onNavegar }: { onNavegar: (tela: Tela) => void }) {
  return (
    <div className="animate-pl-in px-6 pb-10 pt-7">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        <FaixaKpis kpis={KPIS_ORG} />

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.35fr_1fr]">
          <div className="flex flex-col gap-5">
            <div className="overflow-hidden rounded-xl border border-plum-line">
              <div className="flex items-center border-b border-plum-line px-5 py-[15px]">
                <div>
                  <div className="text-sm font-semibold">Membros</div>
                  <div className="mt-0.5 text-xs text-plum-muted">2 aguardando aprovação</div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavegar("membros")}
                  className="ml-auto rounded-[7px] border border-plum-line-strong px-3 py-1.5 text-[12.5px] text-plum-text transition-all duration-150 hover:border-plum-line-hover hover:text-plum-ink"
                >
                  Ver todos
                </button>
              </div>

              {MEMBROS_RESUMO.map((m) => (
                <div key={m.email} className="flex items-center gap-[13px] border-b border-plum-line px-5 py-[13px]">
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-plum-tint-line bg-plum-tint-soft text-[11.5px] font-semibold text-plum-brand">
                    {m.iniciais}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{m.email}</div>
                    <div className="mt-px text-[11.5px] text-plum-muted">{m.cargo}</div>
                  </div>
                  <EstadoMembro pendente={m.pendente} />
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-xl border border-plum-line">
              <div className="border-b border-plum-line px-5 py-[15px] text-sm font-semibold">Atividade recente</div>
              <div className="px-5 pb-4 pt-1.5">
                {ATIVIDADE.map((a, i) => (
                  <div key={a.texto} className="flex gap-3.5 py-[11px]">
                    <div className="relative flex w-[7px] flex-none justify-center">
                      <div className={cn("z-10 mt-[5px] h-[7px] w-[7px] rounded-full", TOM_MARCADOR[a.tom])} />
                      {/* O último item não puxa fio para baixo: a linha do tempo
                          termina no ponto, não no vazio. */}
                      {i < ATIVIDADE.length - 1 && (
                        <div className="absolute bottom-[-11px] top-3.5 w-px bg-plum-line" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] leading-[1.5] text-plum-ink-soft">{a.texto}</div>
                      <div className="mt-[3px] text-[11.5px] text-plum-muted">{a.quando}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="rounded-xl border border-plum-tint-line bg-[linear-gradient(160deg,#F5E4EC,#F7EBF1)] p-5">
              <div className="mb-3 text-[11px] uppercase tracking-[0.08em] text-plum-brand">Código de convite</div>

              <div className="flex items-center gap-2.5 rounded-[9px] border border-plum-line-strong bg-white px-3.5 py-3">
                <span className="flex-1 font-code text-[15px] tracking-[0.13em] text-plum-ink">{CODIGO_CONVITE}</span>
                <button
                  type="button"
                  aria-label="Copiar código de convite"
                  className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-plum-text-soft transition-all duration-150 hover:bg-plum-surface-hover hover:text-plum-ink"
                >
                  <Copy size={14} strokeWidth={1.8} />
                </button>
              </div>

              <p className="m-0 mt-3 text-xs leading-[1.55] text-plum-text-soft">
                Envie para colaboradores sem domínio corporativo verificado. Eles entram como pendentes.
              </p>

              <button
                type="button"
                className="mt-3.5 w-full rounded-lg bg-plum-brand py-[9px] text-[13px] font-medium text-white transition-all duration-150 hover:bg-plum-brand-hover"
              >
                Gerar novo código
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-plum-line">
              <div className="border-b border-plum-line px-5 py-[15px]">
                <div className="text-sm font-semibold">Domínios verificados</div>
                <div className="mt-0.5 text-xs text-plum-muted">Login automático por SSO</div>
              </div>

              {DOMINIOS.map((d) => {
                const verificado = d.estado === "Verificado";
                return (
                  <div key={d.dominio} className="flex items-center gap-[11px] border-b border-plum-line px-5 py-[13px]">
                    <Shield
                      size={15}
                      strokeWidth={1.8}
                      className={verificado ? "text-plum-ok" : "text-plum-warn"}
                    />
                    <span className="flex-1 font-code text-[12.5px] text-plum-ink-soft">{d.dominio}</span>
                    <span className={cn("text-[11.5px]", verificado ? "text-plum-ok" : "text-plum-warn")}>
                      {d.estado}
                    </span>
                  </div>
                );
              })}

              <button
                type="button"
                className="flex w-full items-center justify-center gap-[7px] p-[13px] text-[12.5px] text-plum-muted transition-all duration-150 hover:bg-plum-surface hover:text-plum-brand"
              >
                <Plus size={14} strokeWidth={2} />
                Adicionar domínio
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
