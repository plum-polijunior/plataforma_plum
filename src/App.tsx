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
import Vidro from "./pages/Vidro";
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
          {/* Direção Vidro: proposta visual do ambiente interno, com dados
              falsos e tema próprio. Fora do DashboardLayout porque traz o
              próprio shell, e sem guard de organização porque não lê dado
              nenhum. Contraria o DESIGN.md §1 e §10 de propósito — é a
              decisão que ela existe para provocar. Ver docs/direcao-vidro.md. */}
          <Route path="/vidro" element={<Vidro />} />
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
