import { ArrowUp, Check, Copy, Database, Paperclip, RotateCcw, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Moldura } from "./Moldura";
import { Pontinhos } from "./Pontinhos";
import { BARRAS, SUGESTOES } from "./dados-demo";
import plumMark from "@/assets/plum-mark.png";

const ACOES = [
  { rotulo: "Útil", Icone: ThumbsUp },
  { rotulo: "Copiar", Icone: Copy },
  { rotulo: "Refazer", Icone: RotateCcw },
];

export function TelaChat() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-1 pb-2 pt-[22px]">
        <div className="mx-auto flex max-w-[740px] flex-col gap-[34px]">
          <div className="v-entra-cima flex justify-end">
            <div className="v-bolha max-w-[74%] rounded-[18px_18px_6px_18px] px-4 py-3 text-[14.5px] leading-[1.55] shadow-[var(--sombra-1),inset_0_1px_0_rgba(255,255,255,0.16)]">
              Qual foi o ticket médio por região no último trimestre?
            </div>
          </div>

          <div className="v-entra-cima flex gap-3.5" style={{ animationDelay: "0.1s" }}>
            <img src={plumMark} alt="Plum" className="mt-0.5 block h-[27px] w-[27px] flex-none object-contain" />

            <div className="min-w-0 flex-1">
              <div className="v-pilula v-t3 mb-3.5 inline-flex items-center gap-2 rounded-full px-3 py-[5px] text-[11.5px]">
                <Check size={11} strokeWidth={3} className="v-ok flex-none" />
                Consultou <span className="v-code v-t2">vendas_2026</span> · 3 colunas · 0,8s
              </div>

              {/* `text-wrap: pretty` evita a última linha órfã do parágrafo. */}
              <p className="v-t2 m-0 mb-[9px] text-[15px] leading-[1.65] [text-wrap:pretty]">
                Ficou em <strong className="v-display v-t text-base font-bold">R$ 1.284</strong>, contra R$ 1.209 no
                trimestre anterior. Sudeste puxa para cima, Norte para baixo.
              </p>

              {/* A ressalva vem antes do gráfico de propósito: o número acima não
                  cobre a base toda, e descobrir isso depois do gráfico é tarde. */}
              <p className="v-t3 m-0 mb-5 text-[13px] leading-[1.6]">
                212 pedidos estão sem região preenchida e ficaram de fora da conta.
              </p>

              <Moldura como="cartao" vidro="alto" classeSup="overflow-hidden">
                <div className="flex items-start justify-between gap-4 px-5 pb-1.5 pt-[18px]">
                  <div>
                    <div className="v-display text-[15px] font-semibold tracking-[-0.01em]">
                      Ticket médio por região
                    </div>
                    <div className="v-t3 mt-[3px] text-[11.5px]">Maio a julho · 4.812 pedidos</div>
                  </div>

                  <div className="flex flex-none gap-1.5">
                    {["Tabela", "CSV"].map((r) => (
                      <button key={r} type="button" className="v-ctrl rounded-[9px] px-2.5 py-[5px] text-[11.5px]">
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex h-[178px] items-end gap-4 px-5 pb-5 pt-3.5">
                  {BARRAS.map((b) => (
                    <div key={b.regiao} className="flex h-full flex-1 flex-col items-center gap-[9px]">
                      <span className={cn("v-code flex-none text-[11px]", b.destaque ? "v-t" : "v-t3")}>
                        {b.valor}
                      </span>

                      {/* O invólucro é quem tem altura; a barra cresce dentro
                          dele. Sem isso a porcentagem mediria contra a coluna
                          inteira, rótulos incluídos. */}
                      <div className="flex min-h-0 flex-1 items-end self-stretch">
                        <div
                          className={cn("v-barra flex-none", b.destaque && "v-barra-destaque")}
                          style={{ height: b.altura }}
                        />
                      </div>

                      <span className="v-t3 flex-none text-[11.5px]">{b.regiao}</span>
                    </div>
                  ))}
                </div>
              </Moldura>

              <div className="mt-[15px] flex gap-[3px]">
                {ACOES.map(({ rotulo, Icone }) => (
                  <button
                    key={rotulo}
                    type="button"
                    className="v-fantasma flex items-center gap-[7px] rounded-[9px] px-[9px] py-1.5 text-xs"
                  >
                    <Icone size={13} strokeWidth={1.7} />
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="v-entra flex items-center gap-3.5" style={{ animationDelay: "0.2s" }}>
            <img src={plumMark} alt="" className="block h-[27px] w-[27px] flex-none object-contain" />
            <div className="flex items-center gap-2.5">
              <Pontinhos />
              <span className="v-t3 text-[12.5px]">Cruzando com margem_produto…</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-none px-1 pb-1 pt-1.5">
        <div className="mx-auto max-w-[740px]">
          <div className="mb-3 flex flex-wrap gap-2">
            {SUGESTOES.map((s) => (
              <button key={s} type="button" className="v-pilula rounded-full px-3.5 py-[7px] text-[12.5px]">
                {s}
              </button>
            ))}
          </div>

          <Moldura como="composer" vidro="alto" classeSup="px-[17px] py-[15px]">
            <input
              placeholder="Pergunte sobre suas bases…"
              aria-label="Pergunte sobre suas bases"
              className="v-t w-full border-0 bg-transparent pb-3.5 text-[15px] outline-none"
            />

            <div className="flex items-center gap-2">
              <button type="button" className="v-ctrl flex items-center gap-2 rounded-[10px] px-[11px] py-1.5 text-xs">
                <Database size={13} strokeWidth={1.7} />3 bases
              </button>

              <button
                type="button"
                className="v-fantasma flex items-center gap-[7px] rounded-[9px] px-2 py-1.5 text-xs"
              >
                <Paperclip size={14} strokeWidth={1.7} />
                Anexar
              </button>

              <button
                type="button"
                aria-label="Enviar"
                className="v-btn ml-auto flex h-9 w-9 items-center justify-center rounded-xl hover:scale-105"
              >
                <ArrowUp size={15} strokeWidth={2} />
              </button>
            </div>
          </Moldura>

          <p className="v-t4 m-0 mt-[11px] text-center text-[11px]">Só as bases publicadas são consultadas.</p>
        </div>
      </div>
    </div>
  );
}
