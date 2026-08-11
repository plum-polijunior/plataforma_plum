import { Copy, Plus, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { Moldura } from "./Moldura";
import { EstadoMembro } from "./EstadoMembro";
import { FaixaKpis } from "./FaixaKpis";
import { ATIVIDADE, CODIGO_CONVITE, DOMINIOS, KPIS_ORG, MEMBROS_RESUMO, type Tela } from "./dados-demo";

const TOM_MARCADOR = {
  ok: "var(--ok)",
  marca: "var(--acento)",
  neutro: "var(--texto4)",
} as const;

export function TelaOrganizacao({ onNavegar }: { onNavegar: (tela: Tela) => void }) {
  return (
    <div className="v-entra min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-1">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-3.5">
        <FaixaKpis kpis={KPIS_ORG} />

        <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[1.35fr_1fr]">
          <div className="flex flex-col gap-3.5">
            <Moldura como="painel" vidro="alto" classeSup="overflow-hidden">
              <div className="flex items-center px-[22px] py-[17px]">
                <div>
                  <div className="v-display text-base font-semibold tracking-[-0.015em]">Membros</div>
                  <div className="v-t4 mt-0.5 text-[12.5px]">2 aguardando aprovação</div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavegar("membros")}
                  className="v-ctrl ml-auto rounded-[9px] px-[13px] py-[7px] text-[12.5px]"
                >
                  Ver todos
                </button>
              </div>

              {MEMBROS_RESUMO.map((m) => (
                <div key={m.email} className="v-regua-t flex items-center gap-[13px] px-[22px] py-[13px]">
                  <div className="v-ficha v-acento flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full text-xs font-semibold">
                    {m.iniciais}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium">{m.email}</div>
                    <div className="v-t4 mt-px text-xs">{m.cargo}</div>
                  </div>
                  <EstadoMembro pendente={m.pendente} />
                </div>
              ))}
            </Moldura>

            <Moldura como="painel" vidro="alto" classeSup="overflow-hidden">
              <div className="v-display px-[22px] py-[17px] text-base font-semibold tracking-[-0.015em]">
                Atividade recente
              </div>

              <div className="px-[22px] pb-[18px]">
                {ATIVIDADE.map((a, i) => (
                  <div key={a.texto} className="flex gap-[15px] py-[11px]">
                    <div className="relative flex w-2 flex-none justify-center">
                      <div
                        className="z-10 mt-[5px] h-2 w-2 rounded-full"
                        style={{ background: TOM_MARCADOR[a.tom] }}
                      />
                      {/* O último item não puxa fio para baixo. No protótipo puxa,
                          e a linha fica pendurada no respiro do card — é o único
                          ponto em que a transcrição corrige em vez de copiar. */}
                      {i < ATIVIDADE.length - 1 && (
                        <div className="absolute bottom-[-11px] top-[15px] w-px bg-[color:var(--regua)]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] leading-[1.5]">{a.texto}</div>
                      <div className="v-t4 mt-[3px] text-xs">{a.quando}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Moldura>
          </div>

          <div className="flex flex-col gap-3.5">
            <Moldura como="cromo" vidro="base" classeSup="p-[22px]">
              <div className="v-display mb-1 text-base font-semibold tracking-[-0.015em]">Código de convite</div>
              <p className="v-t3 m-0 mb-[15px] text-[12.5px] leading-[1.55]">
                Envie para colaboradores sem domínio corporativo verificado. Eles entram como pendentes.
              </p>

              <div className="v-ctrl flex items-center gap-2.5 rounded-xl px-[15px] py-[13px]">
                <span className="v-code v-t flex-1 text-[15px] tracking-[0.12em]">{CODIGO_CONVITE}</span>
                <button
                  type="button"
                  aria-label="Copiar código de convite"
                  className="v-t3 flex h-7 w-7 flex-none items-center justify-center rounded-lg border-0 bg-transparent hover:bg-[color:var(--ctrl-h)] hover:text-[color:var(--texto)]"
                >
                  <Copy size={14} strokeWidth={1.7} />
                </button>
              </div>

              <button type="button" className="v-btn mt-3 w-full rounded-[11px] p-2.5 text-[13px] font-medium">
                Gerar novo código
              </button>
            </Moldura>

            <Moldura como="painel" vidro="alto" classeSup="overflow-hidden">
              <div className="px-[22px] py-[17px]">
                <div className="v-display text-base font-semibold tracking-[-0.015em]">Domínios verificados</div>
                <div className="v-t4 mt-0.5 text-[12.5px]">Login automático por SSO</div>
              </div>

              {DOMINIOS.map((d) => {
                const verificado = d.estado === "Verificado";

                return (
                  <div key={d.dominio} className="v-regua-t flex items-center gap-[11px] px-[22px] py-[13px]">
                    <Shield
                      size={16}
                      strokeWidth={1.7}
                      className={cn("flex-none", verificado ? "v-ok" : "v-alerta")}
                    />
                    <span className="v-code flex-1 text-[12.5px]">{d.dominio}</span>
                    <span className={cn("text-[11.5px] font-medium", verificado ? "v-ok" : "v-alerta")}>
                      {d.estado}
                    </span>
                  </div>
                );
              })}

              <button
                type="button"
                className="v-regua-t v-t4 v-hover-ctrl flex w-full items-center justify-center gap-[7px] border-0 bg-transparent p-3.5 text-[12.5px] hover:text-[color:var(--acento)]"
              >
                <Plus size={14} strokeWidth={2} />
                Adicionar domínio
              </button>
            </Moldura>
          </div>
        </div>
      </div>
    </div>
  );
}
