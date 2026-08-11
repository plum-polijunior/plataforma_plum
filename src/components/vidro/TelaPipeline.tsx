import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Moldura } from "./Moldura";
import { Pontinhos } from "./Pontinhos";
import { ETAPAS, LINHAS_AMOSTRA } from "./dados-demo";
import plumMark from "@/assets/plum-mark.png";

function Passos() {
  return (
    <Moldura como="passos" vidro="alto" classeSup="px-6 py-5">
      <div className="flex items-center">
        {ETAPAS.map((e, i) => {
          const concluida = e.estado === "ok";
          const atual = e.estado === "atual";
          const ultima = i === ETAPAS.length - 1;

          return (
            <div key={e.nome} className={cn("flex min-w-0 items-center", ultima ? "flex-none" : "flex-1")}>
              <div className="flex min-w-0 items-center gap-2.5">
                <div
                  className={cn(
                    "v-code flex h-7 w-7 flex-none items-center justify-center rounded-full border text-[12.5px] font-semibold",
                    concluida && "v-passo-ok",
                    atual && "v-passo-atual",
                    !concluida && !atual && "v-passo-futuro",
                  )}
                >
                  {concluida ? "✓" : e.num}
                </div>

                <span
                  className={cn(
                    "truncate whitespace-nowrap text-[13px] font-medium",
                    concluida && "v-t3",
                    atual && "v-t",
                    !concluida && !atual && "v-t4",
                  )}
                >
                  {e.nome}
                </span>
              </div>

              {/* A linha herda a cor do passo à ESQUERDA: o trecho colorido marca
                  o caminho já percorrido, não o destino. */}
              {!ultima && (
                <div
                  className="mx-3.5 h-0.5 flex-1 rounded-sm"
                  style={{ background: concluida ? "var(--ok)" : "var(--regua)" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </Moldura>
  );
}

export function TelaPipeline() {
  return (
    <div className="v-entra min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-1">
      <div className="mx-auto flex max-w-[980px] flex-col gap-3.5">
        <Passos />

        <div className="px-0.5 pt-1">
          <h2 className="v-display m-0 mb-[5px] text-[26px] font-bold tracking-[-0.025em]">Formatação e limpeza</h2>
          <p className="v-t3 m-0 max-w-[640px] text-sm leading-[1.55]">
            O Agente 3 propôs regras a partir de 5 linhas de amostra. Revise o antes e depois — ou peça um ajuste no
            chat ao lado.
          </p>
        </div>

        <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[1fr_330px]">
          <Moldura como="painel" vidro="alto" classeSup="overflow-hidden">
            <div className="v-regua-b grid grid-cols-2">
              <div className="v-t4 px-5 py-3 text-[11px] uppercase tracking-[0.07em]">Antes</div>
              <div className="v-acento bg-[color:var(--plum-b)] px-5 py-3 text-[11px] uppercase tracking-[0.07em]">
                Depois
              </div>
            </div>

            {LINHAS_AMOSTRA.map((l) => (
              <div key={l.coluna} className="v-regua-b">
                <div className="v-code v-t4 px-5 pt-2.5 text-[11px]">{l.coluna}</div>
                <div className="grid grid-cols-2">
                  <div className="v-code v-t4 px-5 pb-[13px] pt-1.5 text-[12.5px] line-through">{l.antes}</div>
                  <div className="v-code v-t bg-[color:var(--plum-b)] px-5 pb-[13px] pt-1.5 text-[12.5px]">
                    {l.depois}
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between px-5 py-[15px]">
              <span className="v-t4 text-[12.5px]">7 regras aplicadas em 12 colunas</span>
              <div className="flex gap-2">
                <button type="button" className="v-ctrl rounded-[10px] px-[15px] py-2 text-[13px]">
                  Voltar
                </button>
                <button type="button" className="v-btn rounded-[10px] px-[17px] py-[9px] text-[13px] font-medium">
                  Aprovar e seguir
                </button>
              </div>
            </div>
          </Moldura>

          <Moldura como="cromo" vidro="base" classeSup="flex flex-col overflow-hidden">
            <div className="v-linha-b flex items-center gap-[9px] px-[17px] py-3.5">
              <img src={plumMark} alt="" className="block h-[22px] w-[22px] flex-none object-contain" />
              <span className="text-[13px] font-medium">Agente 3.1</span>
              <span className="v-t4 ml-auto text-[11px]">Ajuste conversando</span>
            </div>

            <div className="flex flex-col gap-[15px] p-[17px]">
              <div className="v-t2 text-[13.5px] leading-[1.6]">
                Encontrei datas em três formatos diferentes na coluna{" "}
                <span className="v-code v-t">data_venda</span>. Padronizei tudo para ISO. Quer outro formato?
              </div>

              <div className="v-bolha max-w-[85%] self-end rounded-[14px_14px_4px_14px] px-3.5 py-2.5 text-[13.5px] leading-[1.5]">
                Mantém ISO, mas tira o R$ do valor
              </div>

              <div className="flex items-center gap-[9px]">
                <Pontinhos />
                <span className="v-t4 text-[12.5px]">Reaplicando às amostras…</span>
              </div>
            </div>

            <div className="v-linha-t mt-auto flex items-center gap-[9px] px-[15px] py-3">
              <input
                placeholder="Peça um ajuste…"
                aria-label="Peça um ajuste ao agente"
                className="v-t min-w-0 flex-1 border-0 bg-transparent text-[13.5px] outline-none"
              />
              <button
                type="button"
                aria-label="Enviar ajuste"
                className="v-btn flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px]"
              >
                <ArrowUp size={13} strokeWidth={2} />
              </button>
            </div>
          </Moldura>
        </div>
      </div>
    </div>
  );
}
