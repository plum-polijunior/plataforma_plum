import { useState } from "react";
import { Outlet, Navigate, useNavigate, Link, useLocation } from "react-router-dom";
import { Building2, LogOut, Menu, X, Users, Settings, Layers, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import plumLogo from "@/assets/plum-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { useOrgAccess } from "@/hooks/use-org-access";
import AccessPending from "@/pages/AccessPending";

export function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { state, session, organizationName } = useOrgAccess();

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

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border/20 shadow-xl transition-transform duration-300 ease-in-out lg:static lg:translate-x-0
        ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="h-full flex flex-col">
          <div className="h-16 flex items-center px-6 border-b border-border/10">
            <img src={plumLogo} alt="Plum" className="h-8 w-8 object-contain mr-2" />
            <span className="text-lg font-semibold text-gradient">Plum</span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="ml-auto lg:hidden"
              onClick={() => setIsSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-2">
            <Link to="/dashboard">
              <Button variant={location.pathname === "/dashboard" ? "secondary" : "ghost"} className={`w-full justify-start ${location.pathname === "/dashboard" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <Building2 className="mr-2 h-4 w-4" />
                Minha Organização
              </Button>
            </Link>
            
            <Link to="/dashboard/database">
              <Button variant={location.pathname === "/dashboard/database" ? "secondary" : "ghost"} className={`w-full justify-start ${location.pathname === "/dashboard/database" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <Layers className="mr-2 h-4 w-4" />
                Minha Base de Dados
              </Button>
            </Link>

            <Link to="/dashboard/chat">
              <Button variant={location.pathname === "/dashboard/chat" ? "secondary" : "ghost"} className={`w-full justify-start ${location.pathname === "/dashboard/chat" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Chat
              </Button>
            </Link>
            {/* Future items */}
            {/* <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground">
              <Users className="mr-2 h-4 w-4" />
              Membros
            </Button>
            <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground">
              <Settings className="mr-2 h-4 w-4" />
              Configurações
            </Button> */}
          </nav>

          <div className="p-4 border-t border-border/10">
            <div className="mb-4 px-2">
              <p className="text-sm font-medium text-foreground truncate">{session.user.email}</p>
            </div>
            <Button variant="outline" className="w-full justify-start text-muted-foreground" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar for mobile */}
        <header className="h-16 lg:hidden flex items-center px-4 border-b border-border/10 bg-card">
          <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)}>
            <Menu className="h-6 w-6" />
          </Button>
          <span className="ml-4 font-medium text-foreground">Dashboard</span>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
