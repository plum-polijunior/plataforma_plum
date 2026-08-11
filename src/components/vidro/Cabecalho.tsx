import { Bell, ChevronRight, Moon, Plus, Search, Sun } from "lucide-react";
import { Moldura } from "./Moldura";
import { ORGANIZACAO, TITULOS, type Tela } from "./dados-demo";
import type { Tema } from "./tema";

interface Props {
  tela: Tela;
  tema: Tema;
  onAlternarTema: () => void;
  onNavegar: (tela: Tela) => void;
}

export function Cabecalho({ tela, tema, onAlternarTema, onNavegar }: Props) {
  const [titulo, subtitulo] = TITULOS[tela];
  const escuro = tema === "escuro";

  return (
    <Moldura
      como="topo"
      vidro="base"
      className="flex-none"
      classeSup="flex h-[60px] items-center gap-3 px-5"
      elemento="header"
    >
      <span className="v-t3 text-[12.5px]">{ORGANIZACAO}</span>
      <ChevronRight size={14} strokeWidth={2} className="v-icone-fraco flex-none" />

      <h1 className="v-display m-0 text-[17px] font-bold tracking-[-0.02em]">{titulo}</h1>
      {subtitulo && <span className="v-t4 text-xs">{subtitulo}</span>}

      <div className="ml-auto flex items-center gap-2">
        {/* O botão mostra o tema VIGENTE e alterna ao ser clicado — é como o
            protótipo faz. Daí o `aria-label` dizer a ação, que o rótulo não diz. */}
        <button
          type="button"
          onClick={onAlternarTema}
          aria-label={escuro ? "Mudar para o tema claro" : "Mudar para o tema escuro"}
          className="v-ctrl flex h-[34px] items-center gap-[7px] rounded-full px-[13px] text-[12.5px] font-medium"
        >
          {escuro ? <Moon size={15} strokeWidth={1.7} className="flex-none" /> : <Sun size={15} strokeWidth={1.7} className="flex-none" />}
          {escuro ? "Escuro" : "Claro"}
        </button>

        <button
          type="button"
          aria-label="Buscar"
          className="v-ctrl flex h-[34px] w-[34px] items-center justify-center rounded-[11px]"
        >
          <Search size={16} strokeWidth={1.7} />
        </button>

        <button
          type="button"
          aria-label="Notificações"
          className="v-ctrl relative flex h-[34px] w-[34px] items-center justify-center rounded-[11px]"
        >
          <Bell size={16} strokeWidth={1.7} />
          <span className="absolute right-2 top-[7px] h-1.5 w-1.5 rounded-full bg-[color:var(--acento)]" />
        </button>

        <div className="mx-[3px] h-5 w-px bg-[color:var(--divisor)]" />

        <button
          type="button"
          onClick={() => onNavegar("pipeline")}
          className="v-btn flex h-[34px] items-center gap-[7px] rounded-[11px] px-3.5 text-[13px] font-medium hover:-translate-y-px"
        >
          <Plus size={15} strokeWidth={2} />
          Nova base
        </button>
      </div>
    </Moldura>
  );
}
