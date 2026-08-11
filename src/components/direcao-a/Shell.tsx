import { useState, type ReactNode } from "react";
import { Bell, Bot, Building2, ChevronRight, Database, Download, LogOut, Plus, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { ORGANIZACAO, TITULOS, USUARIO, type Tela } from "./dados-demo";
import plumMark from "@/assets/plum-mark.png";

interface ItemNav {
  tela: Tela;
  rotulo: string;
  Icone: typeof Bot;
  /** Selo à direita, visível só com o rail aberto. */
  selo?: { texto: string; tom: "ia" | "contagem" };
  /** Ponto de aviso sobre o ícone, visível só com o rail fechado. */
  aviso?: boolean;
}

const PLATAFORMA: ItemNav[] = [
  { tela: "chat", rotulo: "PLUM Chat", Icone: Bot, selo: { texto: "IA", tom: "ia" } },
  { tela: "bases", rotulo: "Minhas Bases de Dados", Icone: Database },
  { tela: "pipeline", rotulo: "Nova base", Icone: Download },
];

const ADMINISTRACAO: ItemNav[] = [
  { tela: "org", rotulo: "Minha Organização", Icone: Building2 },
  { tela: "membros", rotulo: "Membros", Icone: Users, selo: { texto: "2", tom: "contagem" }, aviso: true },
];

interface Props {
  tela: Tela;
  onNavegar: (tela: Tela) => void;
  onSair: () => void;
  children: ReactNode;
}

export function Shell({ tela, onNavegar, onSair, children }: Props) {
  const [railAberto, setRailAberto] = useState(false);

  /** Rótulos somem por opacidade, não por `display`: é o que dá o
      deslizamento contínuo em vez do texto reaparecendo de estalo. */
  const opRotulo = railAberto ? "opacity-100" : "opacity-0";

  const renderGrupo = (titulo: string, itens: ItemNav[]) => (
    <>
      <div
        className={cn(
          "mb-2 whitespace-nowrap px-[9px] text-[10.5px] uppercase tracking-[0.09em] text-plum-muted transition-opacity duration-200",
          opRotulo,
        )}
      >
        {titulo}
      </div>
      <div className="flex flex-col gap-0.5">
        {itens.map(({ tela: destino, rotulo, Icone, selo, aviso }) => {
          const ativo = tela === destino;
          return (
            <button
              key={destino}
              type="button"
              onClick={() => onNavegar(destino)}
              className={cn(
                "flex w-full items-center gap-[11px] whitespace-nowrap rounded-lg px-2.5 py-[9px] text-left text-[13.5px] font-medium transition-colors duration-150",
                ativo ? "bg-plum-surface-hover text-plum-ink" : "text-plum-text-soft hover:bg-plum-surface-hover",
              )}
            >
              <span className="relative flex flex-none">
                <Icone size={18} strokeWidth={1.8} />
                {aviso && (
                  <span
                    className={cn(
                      "absolute -right-1 -top-[3px] h-[7px] w-[7px] rounded-full border-[1.5px] border-plum-surface bg-plum-brand transition-opacity duration-200",
                      railAberto ? "opacity-0" : "opacity-100",
                    )}
                  />
                )}
              </span>

              <span className={cn("transition-opacity duration-200", opRotulo)}>{rotulo}</span>

              {selo && (
                <span
                  className={cn(
                    "ml-auto rounded-full transition-opacity duration-200",
                    selo.tom === "ia"
                      ? "bg-plum-tint px-[7px] py-0.5 text-[9.5px] font-medium text-plum-brand"
                      : "bg-plum-brand px-[7px] py-0.5 text-[10px] font-semibold text-white",
                    opRotulo,
                  )}
                >
                  {selo.texto}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1">
      <aside
        onMouseEnter={() => setRailAberto(true)}
        onMouseLeave={() => setRailAberto(false)}
        style={{ width: railAberto ? 262 : 68 }}
        // `ease-in-out` do Tailwind já é cubic-bezier(.4,0,.2,1) — a mesma
        // curva do protótipo, sem valor arbitrário ambíguo.
        className="flex flex-none flex-col overflow-hidden border-r border-plum-line bg-plum-surface transition-[width] duration-300 ease-in-out"
      >
        <div className="flex h-[60px] flex-none items-center gap-[11px] border-b border-plum-line px-[21px]">
          <img src={plumMark} alt="" className="block h-6 w-6 flex-none object-contain" />
          <span
            className={cn(
              "whitespace-nowrap font-display text-base font-semibold tracking-[-0.01em] text-plum-ink transition-opacity duration-200",
              opRotulo,
            )}
          >
            Plum
          </span>
          <span
            className={cn(
              "ml-auto whitespace-nowrap rounded-[5px] border border-plum-line-strong px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.08em] text-plum-muted transition-opacity duration-200",
              opRotulo,
            )}
          >
            Beta
          </span>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
          {renderGrupo("Plataforma", PLATAFORMA)}
          <div className="mt-[22px]">{renderGrupo("Administração", ADMINISTRACAO)}</div>

          {/* Largura fixa: com `w-full` o cartão encolheria junto com o rail e
              o texto quebraria em cada frame da animação. */}
          <div
            className={cn(
              "mt-6 w-[222px] rounded-[10px] border border-plum-line bg-gradient-to-b from-plum-tint-soft to-plum-brand/0 p-3.5 transition-opacity duration-200",
              railAberto ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <div className="mb-2 text-[9.5px] uppercase tracking-[0.09em] text-plum-muted">Novidades</div>
            <div className="mb-1 text-[13px] font-semibold">Agente 3.1 de formatação</div>
            <div className="text-xs leading-[1.5] text-plum-text-soft">
              Ajuste regras de limpeza conversando, sem refazer o pipeline.
            </div>
            <a href="#" className="mt-2.5 inline-block text-xs font-medium">
              Ver o que mudou →
            </a>
          </div>
        </div>

        <div className="flex-none border-t border-plum-line p-3">
          <button
            type="button"
            onClick={onSair}
            className="flex w-full items-center gap-[11px] whitespace-nowrap rounded-lg px-[9px] py-2 text-left transition-colors duration-150 hover:bg-plum-surface-hover"
          >
            <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full border border-plum-tint-line bg-plum-tint-soft text-[11px] font-semibold text-plum-brand">
              {USUARIO.iniciais}
            </div>
            <div className={cn("min-w-0 flex-1 transition-opacity duration-200", opRotulo)}>
              <div className="truncate text-[12.5px] font-medium">{USUARIO.email}</div>
              <div className="text-[11px] text-plum-muted">{USUARIO.papel}</div>
            </div>
            <LogOut
              size={15}
              strokeWidth={1.8}
              className={cn("flex-none text-plum-muted transition-opacity duration-200", opRotulo)}
            />
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[60px] flex-none items-center gap-[11px] border-b border-plum-line px-6">
          <span className="text-[13px] text-plum-muted">{ORGANIZACAO}</span>
          <ChevronRight size={14} strokeWidth={2} className="text-plum-line-hover" />
          <span className="font-display text-[15px] font-semibold tracking-[-0.01em]">{TITULOS[tela]}</span>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              aria-label="Buscar"
              className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-plum-line text-plum-text-soft transition-all duration-150 hover:border-plum-line-scroll hover:bg-plum-surface-hover hover:text-plum-ink"
            >
              <Search size={16} strokeWidth={1.8} />
            </button>

            <button
              type="button"
              aria-label="Notificações"
              className="relative flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-plum-line text-plum-text-soft transition-all duration-150 hover:border-plum-line-scroll hover:bg-plum-surface-hover hover:text-plum-ink"
            >
              <Bell size={16} strokeWidth={1.8} />
              <span className="absolute right-[7px] top-1.5 h-1.5 w-1.5 animate-pl-pulse rounded-full bg-plum-brand" />
            </button>

            <div className="mx-0.5 h-5 w-px bg-plum-line" />

            <button
              type="button"
              onClick={() => onNavegar("pipeline")}
              className="flex h-[34px] items-center gap-[7px] rounded-lg bg-plum-brand px-[13px] text-[13px] font-medium text-white transition-[background,transform] duration-150 hover:-translate-y-px hover:bg-plum-brand-hover"
            >
              <Plus size={15} strokeWidth={2} />
              Nova base
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
