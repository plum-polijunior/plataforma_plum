import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import DatabasePage from "./pages/Cfgdatabase";
import Inicio from "./pages/Inicio";
import DirecaoA from "./pages/DirecaoA";
import { DashboardLayout } from "./layouts/DashboardLayout";
import NotFound from "./pages/NotFound";

import PlumChat from "./pages/PlumChat";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          {/* Direção A: proposta visual do ambiente interno, com dados falsos.
              Fora do DashboardLayout de propósito — não passa pelo guard de
              org, e a tela de login dela é parte do que está em avaliação. */}
          <Route path="/direcao-a" element={<DirecaoA />} />
          <Route element={<DashboardLayout />}>
            {/* Página Inicial: rota viva, sem item na sidebar de propósito —
                válvula de rollback da Fase 4 (§2.3 do plano). O link entra na
                Etapa 6, depois da bateria de verificação passar. */}
            <Route path="/inicio" element={<Inicio />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/cfgdatabase" element={<DatabasePage />} />
            <Route path="/plum" element={<PlumChat />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
