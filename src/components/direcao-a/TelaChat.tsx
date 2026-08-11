import { ArrowUp, Check, Copy, Database, Paperclip, RotateCcw, ThumbsUp } from "lucide-react";
import { BARRAS, SUGESTOES } from "./dados-demo";
import { Pontinhos } from "./Pontinhos";

const ACOES = [
  { rotulo: "Útil", Icone: ThumbsUp },
  { rotulo: "Copiar", Icone: Copy },
  { rotulo: "Refazer", Icone: RotateCcw },
];

function AvatarAgente({ tamanho = 27 }: { tamanho?: number }) {
  return (
    <div
      style={{ width: tamanho, height: tamanho }}
      className="flex flex-none items-center justify-center rounded-[7px] bg-plum-brand font-display text-sm font-bold text-white"
    >
      P
    </div>
  );
}

export function TelaChat() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-6 pb-5 pt-9">
        <div className="mx-auto flex max-w-[740px] flex-col gap-[30px]">
          <div className="flex animate-pl-up justify-end">
            <div className="max-w-[76%] rounded-[15px_15px_5px_15px] bg-plum-brand px-[15px] py-[11px] text-sm leading-[1.55] text-white">
              Qual foi o ticket médio por região no último trimestre?
            </div>
          </div>

          <div style={{ animationDelay: "0.1s" }} className="flex animate-pl-up gap-[13px]">
            <AvatarAgente />

            <div className="min-w-0 flex-1">
              <div className="mb-3 inline-flex items-center gap-[7px] rounded-full border border-plum-line px-2.5 py-1 text-[11px] text-plum-muted">
                <Check size={11} strokeWidth={3} className="text-plum-ok" />
                Consultou <span className="text-plum-text">vendas_2026</span> · 3 colunas · 0,8s
              </div>

              <p className="mb-[18px] text-[14.5px] leading-[1.65] text-plum-ink-soft">
                O ticket médio consolidado do trimestre foi de{" "}
                <strong className="font-semibold text-plum-ink">R$ 1.284</strong>, uma alta de 6,2% sobre o trimestre
                anterior. Sudeste concentra o maior valor e o Norte puxa a média para baixo.
              </p>

              <figure className="m-0 overflow-hidden rounded-xl border border-plum-line bg-plum-surface">
                <div className="flex items-center justify-between border-b border-plum-line px-4 py-3">
                  <figcaption className="text-[13px] font-semibold">Ticket médio por região</figcaption>
                  <div className="flex gap-1.5">
                    {["Tabela", "CSV"].map((r) => (
                      <button
                        key={r}
                        type="button"
                        className="rounded-md border border-plum-line-strong px-[9px] py-1 text-[11.5px] text-plum-text-soft transition-all duration-150 hover:border-plum-line-hover hover:text-plum-ink"
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex h-[172px] items-end gap-3.5 px-4 pb-4 pt-5">
                  {BARRAS.map((b) => (
                    <div key={b.regiao} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                      <span className="font-code text-[11px] text-plum-text">{b.valor}</span>
                      <div
                        className="w-full origin-bottom animate-pl-grow rounded-t bg-gradient-to-b from-plum-brand-soft to-plum-brand"
                        style={{ height: b.altura, animationDelay: b.atraso }}
                      />
                      <span className="text-[11.5px] text-plum-muted">{b.regiao}</span>
                    </div>
                  ))}
                </div>
              </figure>

              <div className="mt-3.5 flex gap-1.5">
                {ACOES.map(({ rotulo, Icone }) => (
                  <button
                    key={rotulo}
                    type="button"
                    className="flex items-center gap-1.5 rounded-md px-2 py-[5px] text-xs text-plum-muted transition-all duration-150 hover:bg-plum-surface-hover hover:text-plum-ink"
                  >
                    <Icone size={13} strokeWidth={1.8} />
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ animationDelay: "0.2s" }} className="flex animate-pl-in gap-[13px]">
            <AvatarAgente />
            <div className="flex h-[27px] items-center gap-[9px]">
              <Pontinhos />
              <span className="text-[12.5px] text-plum-muted">Cruzando com margem_produto…</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-none px-6 pb-6">
        <div className="mx-auto max-w-[740px]">
          <div className="mb-[11px] flex flex-wrap gap-[7px]">
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                className="rounded-full border border-plum-line-strong bg-plum-surface px-[13px] py-1.5 text-[12.5px] text-plum-text transition-all duration-150 hover:border-plum-brand hover:bg-plum-surface-hover hover:text-plum-ink"
              >
                {s}
              </button>
            ))}
          </div>

          <div className="rounded-[13px] border border-plum-line-strong bg-plum-surface px-[15px] py-[13px] transition-colors duration-150 focus-within:border-plum-brand">
            <input
              placeholder="Pergunte sobre suas bases…"
              aria-label="Pergunte sobre suas bases"
              className="w-full border-0 bg-transparent pb-3 text-[14.5px] text-plum-ink outline-none"
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex items-center gap-[7px] rounded-[7px] border border-plum-line-strong bg-plum-surface px-2.5 py-[5px] text-xs text-plum-text-soft transition-all duration-150 hover:border-plum-line-hover hover:text-plum-ink"
              >
                <Database size={13} strokeWidth={1.8} />
                3 bases
              </button>

              <button
                type="button"
                className="flex items-center gap-1.5 rounded-md px-1.5 py-[5px] text-xs text-plum-text-soft transition-all duration-150 hover:bg-plum-surface-hover hover:text-plum-ink"
              >
                <Paperclip size={14} strokeWidth={1.8} />
                Anexar
              </button>

              <button
                type="button"
                aria-label="Enviar"
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg bg-plum-brand text-white transition-[background,transform] duration-150 hover:scale-105 hover:bg-plum-brand-hover"
              >
                <ArrowUp size={15} strokeWidth={2} />
              </button>
            </div>
          </div>

          <p className="mt-2.5 text-center text-[11px] text-plum-muted-soft">
            O Plum consulta apenas as bases publicadas da sua organização.
          </p>
        </div>
      </div>
    </div>
  );
}
