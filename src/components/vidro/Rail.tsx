import { Bot, Building2, Database, Download, LogOut, Users } from "lucide-react";
import { Moldura } from "./Moldura";
import { USUARIO, type Tela } from "./dados-demo";
import plumMark from "@/assets/plum-mark.png";

interface ItemNav {
  tela: Tela;
  rotulo: string;
  Icone: typeof Bot;
  /** Contagem à direita, visível só com o rail aberto. */
  contagem?: string;
  /** Ponto de aviso sobre o ícone, visível só com o rail fechado — é o que
      sobra da contagem quando o rótulo não cabe. */
  aviso?: boolean;
}

const PLATAFORMA: ItemNav[] = [
  { tela: "chat", rotulo: "PLUM Chat", Icone: Bot },
  { tela: "bases", rotulo: "Minhas Bases de Dados", Icone: Database },
  { tela: "pipeline", rotulo: "Nova base", Icone: Download },
];

const ADMINISTRACAO: ItemNav[] = [
  { tela: "org", rotulo: "Minha Organização", Icone: Building2 },
  { tela: "membros", rotulo: "Membros", Icone: Users, contagem: "2", aviso: true },
];

interface Props {
  tela: Tela;
  onNavegar: (tela: Tela) => void;
}

export function Rail({ tela, onNavegar }: Props) {
  const renderItem = ({ tela: destino, rotulo, Icone, contagem, aviso }: ItemNav) => {
    const ativo = tela === destino;

    return (
      <button
        key={destino}
        type="button"
        onClick={() => onNavegar(destino)}
        aria-current={ativo ? "page" : undefined}
        className="v-nav-item v-rail-item flex w-full items-center py-2.5 text-[13.5px]"
      >
        {/* Placa da seleção: fica atrás, por isso tudo o que vem depois é
            `relative`. Um fundo direto no botão não daria o anel interno. */}
        {ativo && <span className="v-nav-placa" aria-hidden />}

        <span className="relative flex flex-none">
          <Icone size={18} strokeWidth={1.7} />
          {aviso && <span className="v-rail-ponto absolute -right-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-[color:var(--acento)] shadow-[0_0_0_2px_var(--fundo)]" />}
        </span>

        <span className="v-rail-rotulo relative">{rotulo}</span>

        {contagem && <span className="v-rail-rotulo v-code v-acento relative ml-auto text-xs">{contagem}</span>}
      </button>
    );
  };

  return (
    <Moldura
      como="rail"
      vidro="base"
      className="v-rail flex-none"
      classeSup="flex h-full flex-col overflow-hidden"
      elemento="aside"
    >
      <div className="v-rail-topo flex h-[66px] flex-none items-center">
        <img src={plumMark} alt="" className="block h-[25px] w-[25px] flex-none object-contain" />
        <span className="v-rail-rotulo v-display text-[17px] font-bold tracking-[-0.02em]">Plum</span>
        <span className="v-rail-rotulo v-acento ml-auto rounded-full bg-[color:var(--ctrl)] px-2 py-[3px] text-[9.5px] font-medium uppercase tracking-[0.09em]">
          Beta
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-[11px] pb-3.5 pt-1.5">
        <div className="flex flex-col gap-[3px]">{PLATAFORMA.map(renderItem)}</div>

        <div className="v-divisor mx-[11px] my-[15px]" />

        <div className="flex flex-col gap-[3px]">{ADMINISTRACAO.map(renderItem)}</div>
      </nav>

      <div className="v-linha-t flex-none p-[11px]">
        <div className="v-rail-item flex cursor-pointer items-center rounded-[14px] py-2 hover:bg-[color:var(--ctrl)]">
          <div className="v-ficha v-acento flex h-[31px] w-[31px] flex-none items-center justify-center rounded-full text-[11px] font-semibold">
            {USUARIO.iniciais}
          </div>
          <div className="v-rail-rotulo min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium">{USUARIO.email}</div>
            <div className="v-t3 text-[11px]">{USUARIO.papel}</div>
          </div>
          <LogOut size={15} strokeWidth={1.7} className="v-rail-rotulo v-t3 flex-none" />
        </div>
      </div>
    </Moldura>
  );
}
