import { useState } from "react";
import { Outlet, Navigate, useNavigate, Link, useLocation } from "react-router-dom";
import { Bot, Building2, ChevronRight, Database, LayoutDashboard, LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import plumLogo from "@/assets/plum-mascot-transparent.png";
import { supabase } from "@/integrations/supabase/client";
import { useOrgAccess } from "@/hooks/use-org-access";
import AccessPending from "@/pages/AccessPending";

/**
 * Título de cada rota, para a trilha do cabeçalho.
 *
 * Os textos são os mesmos rótulos da navegação de propósito: o cabeçalho confirma
 * onde a pessoa está, não introduz um segundo vocabulário para a mesma tela.
 */
const TITULOS: Record<string, string> = {
  "/inicio": "Página Inicial",
  "/dashboard": "Minha Organização",
  "/cfgdatabase": "Minhas Bases de Dados",
  "/plum": "PLUM Chat",
};

interface ItemNav {
  to: string;
  rotulo: string;
  Icone: typeof Bot;
  /** Selo à direita, visível só com o rail aberto. */
  selo?: string;
}

/**
 * Navegação em dois grupos, como a Direção A.
 *
 * ⚠️ Só entram rotas que EXISTEM em `App.tsx`. O protótipo desenha também "Nova
 * base" e "Membros"; nenhuma das duas é rota hoje (o pipeline vive dentro de
 * `/cfgdatabase` e a aprovação de membros dentro de `/dashboard`), e item de menu
 * que não leva a lugar nenhum é pior que ausência de item.
 */
const PLATAFORMA: ItemNav[] = [
  { to: "/inicio", rotulo: "Página Inicial", Icone: LayoutDashboard },
  { to: "/plum", rotulo: "PLUM Chat", Icone: Bot, selo: "IA" },
  { to: "/cfgdatabase", rotulo: "Minhas Bases de Dados", Icone: Database },
];

const ADMINISTRACAO: ItemNav[] = [
  { to: "/dashboard", rotulo: "Minha Organização", Icone: Building2 },
];

export function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  /**
   * Rail recolhido/expandido, só no desktop. Estado puramente de apresentação —
   * não toca em sessão, cargo nem rota. Ver `docs/2026-08-12-direcao-a-no-app.md`.
   */
  const [railAberto, setRailAberto] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { state, session, organizationName, roleName } = useOrgAccess();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (state === "carregando") {
    return <div className="min-h-screen bg-background flex items-center justify-center">Carregando...</div>;
  }

  if (state === "anonimo") {
    return <Navigate to="/auth" replace />;
  }

  // Sem org / pendente / bloqueado não entram no dashboard: nenhum dado é lido.
  if (state !== "ativo") {
    return (
      <AccessPending
        state={state}
        email={session?.user.email}
        organizationName={organizationName}
      />
    );
  }

  // Rótulos somem por OPACIDADE, não por `display`: é o que dá o deslizamento
  // contínuo do rail em vez de o texto reaparecer de estalo no fim da animação.
  // No mobile o painel já abre com 262px, então o rótulo fica sempre visível.
  const opRotulo = railAberto ? "opacity-100" : "opacity-100 lg:opacity-0";

  const grupo = (titulo: string, itens: ItemNav[]) => (
    <>
      <div
        className={cn(
          "mb-2 whitespace-nowrap px-[9px] text-[10.5px] uppercase tracking-[0.09em] text-muted-foreground transition-opacity duration-200",
          opRotulo,
        )}
      >
        {titulo}
      </div>
      <div className="flex flex-col gap-0.5">
        {itens.map(({ to, rotulo, Icone, selo }) => {
          const ativo = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              onClick={() => setIsSidebarOpen(false)}
              className={cn(
                "flex w-full items-center gap-[11px] whitespace-nowrap rounded-lg px-2.5 py-[9px] text-[13.5px] font-medium transition-colors duration-150",
                ativo
                  ? "bg-surface-hover text-foreground"
                  : "text-text-soft hover:bg-surface-hover hover:text-foreground",
              )}
            >
              <Icone size={18} strokeWidth={1.8} className="flex-none" />
              <span className={cn("transition-opacity duration-200", opRotulo)}>{rotulo}</span>
              {selo && (
                <span
                  className={cn(
                    "ml-auto rounded-full bg-accent px-[7px] py-0.5 text-[9.5px] font-medium text-primary transition-opacity duration-200",
                    opRotulo,
                  )}
                >
                  {selo}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );

  return (
    // `h-screen` e não `min-h-screen`: com `min-h-`, o container CRESCE junto
    // com o conteúdo, a página inteira vira o elemento que rola, e a sidebar
    // sobe junto — o botão "Sair" some do alcance num dashboard longo.
    // Travando a altura em uma tela, quem rola passa a ser o `overflow-auto`
    // do `<main>`, e a barra lateral fica parada onde deve.
    <div className="h-screen bg-background flex overflow-hidden">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-foreground/20 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/*
        O rail. Recolhido em 68px e expandido em 262px no hover, desde 2026-08-12
        (Direção A). Antes era uma barra fixa de 256px (`w-64`) com `shadow-xl` —
        e sombra é reprovação do `DESIGN.md` §1 em App UI, que separa por hairline
        de 1px. A largura agora vem de classe e não de `style`, para o mobile
        continuar abrindo em 262px sem depender do estado do rail.
      */}
      <aside
        onMouseEnter={() => setRailAberto(true)}
        onMouseLeave={() => setRailAberto(false)}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[262px] flex-none flex-col overflow-hidden border-r border-border bg-secondary transition-[width,transform] duration-300 ease-in-out lg:static lg:translate-x-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full",
          railAberto ? "lg:w-[262px]" : "lg:w-[68px]",
        )}
      >
        <div className="flex h-[60px] flex-none items-center gap-[11px] border-b border-border px-[21px]">
          <img src={plumLogo} alt="" className="block h-6 w-6 flex-none object-contain" />
          <span
            className={cn(
              "whitespace-nowrap font-display text-base font-semibold tracking-[-0.01em] text-foreground transition-opacity duration-200",
              opRotulo,
            )}
          >
            Plum
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
          {grupo("Plataforma", PLATAFORMA)}
          <div className="mt-[22px]">{grupo("Administração", ADMINISTRACAO)}</div>
        </nav>

        <div className="flex-none border-t border-border p-3">
          <div className="flex items-center gap-[11px] rounded-lg px-[9px] py-2">
            <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full border border-tint-line bg-tint-soft text-[11px] font-semibold text-primary">
              {(session.user.email ?? "?").slice(0, 2).toUpperCase()}
            </div>
            <div className={cn("min-w-0 flex-1 transition-opacity duration-200", opRotulo)}>
              <div className="truncate text-[12.5px] font-medium text-foreground">
                {session.user.email}
              </div>
              {roleName && <div className="text-[11px] text-muted-foreground">{roleName}</div>}
            </div>
            {/*
              "Sair" é botão próprio, e não o cartão de identidade inteiro como no
              protótipo: clicar no próprio nome e ser desconectado é armadilha.
            */}
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sair"
              title="Sair"
              className={cn(
                "flex-none rounded-md p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-surface-hover hover:text-foreground",
                opRotulo,
              )}
            >
              <LogOut size={15} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {/*
          Um cabeçalho para todos os tamanhos, com a trilha `Organização › Tela`.
          Antes existia um topbar só de mobile, com o rótulo fixo "Dashboard" —
          que era errado em três das quatro rotas.

          Sem os botões de busca e de notificação que o protótipo desenha: não há
          nada atrás deles hoje, e affordance que não faz nada custa mais confiança
          do que entrega em aparência.
        */}
        <header className="flex h-[60px] flex-none items-center gap-[11px] border-b border-border px-4 md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {organizationName && (
            <>
              <span className="hidden truncate text-[13px] text-muted-foreground sm:block">
                {organizationName}
              </span>
              <ChevronRight
                size={14}
                strokeWidth={2}
                className="hidden flex-none text-line-hover sm:block"
              />
            </>
          )}
          <span className="truncate font-display text-[15px] font-semibold tracking-[-0.01em] text-foreground">
            {TITULOS[location.pathname] ?? "Plum"}
          </span>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
