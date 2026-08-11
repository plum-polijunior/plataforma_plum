import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { ETAPAS, LINHAS_AMOSTRA } from "./dados-demo";
import { Pontinhos } from "./Pontinhos";

function Passos() {
  return (
    <div className="mb-8 flex items-center">
      {ETAPAS.map((e, i) => {
        const concluida = e.estado === "ok";
        const atual = e.estado === "atual";
        const ultima = i === ETAPAS.length - 1;

        return (
          <div key={e.nome} className={cn("flex min-w-0 items-center", ultima ? "flex-none" : "flex-1")}>
            <div className="flex min-w-0 items-center gap-[9px]">
              <div
                className={cn(
                  "flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border font-code text-xs font-semibold",
                  concluida && "border-plum-ok-line bg-plum-ok-bg text-plum-ok",
                  atual && "border-plum-brand bg-plum-brand text-white",
                  !concluida && !atual && "border-plum-line-strong bg-transparent text-plum-muted",
                )}
              >
                {concluida ? "✓" : e.num}
              </div>
              <span
                className={cn(
                  "truncate whitespace-nowrap text-[12.5px] font-medium",
                  concluida && "text-plum-text-soft",
                  atual && "text-plum-ink",
                  !concluida && !atual && "text-plum-muted",
                )}
              >
                {e.nome}
              </span>
            </div>

            {/* A linha herda a cor do passo à ESQUERDA: o trecho verde marca o
                caminho já percorrido, não o destino. */}
            {!ultima && <div className={cn("mx-3.5 h-px flex-1", concluida ? "bg-plum-ok-line" : "bg-plum-line")} />}
          </div>
        );
      })}
    </div>
  );
}

export function TelaPipeline() {
  return (
    <div className="animate-pl-in px-6 pb-10 pt-7">
      <div className="mx-auto max-w-[960px]">
        <Passos />

        <div className="mb-[22px]">
          <h2 className="m-0 mb-[5px] font-display text-[22px] font-semibold tracking-[-0.02em]">
            Formatação e limpeza
          </h2>
          <p className="m-0 text-[13.5px] leading-[1.55] text-plum-text-soft">
            O Agente 3 propôs regras a partir de 5 linhas de amostra. Revise o antes e depois — ou peça um ajuste no
            chat ao lado.
          </p>
        </div>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_320px]">
          <div className="overflow-hidden rounded-xl border border-plum-line">
            <div className="grid grid-cols-2 border-b border-plum-line">
              <div className="border-r border-plum-line bg-plum-surface px-[18px] py-[11px] text-[11px] uppercase tracking-[0.06em] text-plum-muted">
                Antes
              </div>
              <div className="bg-plum-tint-soft px-[18px] py-[11px] text-[11px] uppercase tracking-[0.06em] text-plum-brand">
                Depois
              </div>
            </div>

            {LINHAS_AMOSTRA.map((l) => (
              <div key={l.coluna} className="border-b border-plum-line">
                <div className="px-[18px] pt-[9px] font-code text-[11px] text-plum-muted-soft">{l.coluna}</div>
                <div className="grid grid-cols-2">
                  <div className="border-r border-plum-line px-[18px] pb-3 pt-1.5 font-code text-[12.5px] text-plum-muted line-through decoration-plum-tint-line">
                    {l.antes}
                  </div>
                  <div className="bg-plum-tint-soft px-[18px] pb-3 pt-1.5 font-code text-[12.5px] text-plum-ink">
                    {l.depois}
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between px-[18px] py-3.5">
              <span className="text-xs text-plum-muted">7 regras aplicadas em 12 colunas</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-plum-line-strong px-3.5 py-[7px] text-[13px] text-plum-text transition-all duration-150 hover:border-plum-line-hover hover:text-plum-ink"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-plum-brand px-4 py-2 text-[13px] font-medium text-white transition-all duration-150 hover:bg-plum-brand-hover"
                >
                  Aprovar e seguir
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col overflow-hidden rounded-xl border border-plum-line bg-plum-surface">
            <div className="flex items-center gap-2 border-b border-plum-line px-4 py-[13px]">
              <div className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-plum-brand font-display text-xs font-bold text-white">
                P
              </div>
              <span className="text-[12.5px] font-medium">Agente 3.1</span>
              <span className="ml-auto text-[10.5px] text-plum-muted">Ajuste conversando</span>
            </div>

            <div className="flex flex-col gap-3.5 p-4">
              <div className="text-[13px] leading-[1.6] text-plum-text">
                Encontrei datas em três formatos diferentes na coluna{" "}
                <span className="font-code text-plum-ink">data_venda</span>. Padronizei tudo para ISO. Quer outro
                formato?
              </div>

              <div className="max-w-[85%] self-end rounded-[12px_12px_4px_12px] bg-plum-brand px-[13px] py-[9px] text-[13px] leading-[1.5] text-white">
                Mantém ISO, mas tira o R$ do valor
              </div>

              <div className="flex items-center gap-2">
                <Pontinhos />
                <span className="text-xs text-plum-muted">Reaplicando às amostras…</span>
              </div>
            </div>

            <div className="mt-auto flex items-center gap-2 border-t border-plum-line px-3.5 py-3">
              <input
                placeholder="Peça um ajuste…"
                aria-label="Peça um ajuste ao agente"
                className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-plum-ink outline-none"
              />
              <button
                type="button"
                aria-label="Enviar ajuste"
                className="flex h-7 w-7 flex-none items-center justify-center rounded-[7px] bg-plum-brand text-white transition-all duration-150 hover:bg-plum-brand-hover"
              >
                <ArrowUp size={13} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
