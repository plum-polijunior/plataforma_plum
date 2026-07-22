import { motion } from "framer-motion";
import { Clock, ShieldAlert, Building2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import plumLogo from "@/assets/plum-logo.png";
import { supabase } from "@/integrations/supabase/client";
import type { OrgAccessState } from "@/hooks/use-org-access";

interface AccessPendingProps {
  state: Extract<OrgAccessState, "sem-org" | "pendente" | "bloqueado">;
  email?: string | null;
  organizationName?: string | null;
}

const CONTEUDO = {
  "sem-org": {
    icone: Building2,
    titulo: "Nenhuma organização vinculada",
    descricao:
      "Seu e-mail não corresponde a nenhum domínio corporativo verificado no Plum. " +
      "Peça ao administrador da sua empresa para cadastrar e verificar o domínio, " +
      "ou para te enviar o ID de acesso da organização.",
  },
  pendente: {
    icone: Clock,
    titulo: "Aguardando liberação",
    descricao:
      "Sua conta foi vinculada à organização, mas o acesso aos dados depende da " +
      "aprovação de um administrador. Você será notificado assim que for liberado.",
  },
  bloqueado: {
    icone: ShieldAlert,
    titulo: "Acesso indisponível",
    descricao:
      "Seu acesso a esta organização foi recusado ou desativado por um administrador. " +
      "Entre em contato com o responsável da sua empresa.",
  },
} as const;

export default function AccessPending({ state, email, organizationName }: AccessPendingProps) {
  const { icone: Icone, titulo, descricao } = CONTEUDO[state];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md z-10"
      >
        <div className="text-center mb-10">
          <img src={plumLogo} alt="Plum" className="w-16 h-16 mx-auto object-contain mb-4" />
          <h1 className="text-xl font-bold text-gradient">Plum Platform</h1>
        </div>

        <div className="glass p-8 rounded-2xl border border-border/30 shadow-xl text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border border-primary/30">
            <Icone className="h-8 w-8 text-primary" />
          </div>

          <h2 className="text-lg font-semibold text-foreground mb-3">{titulo}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{descricao}</p>

          {organizationName && (
            <p className="mt-6 text-sm">
              <span className="text-muted-foreground">Organização: </span>
              <span className="font-medium text-foreground">{organizationName}</span>
            </p>
          )}

          {email && (
            <p className="mt-1 text-sm">
              <span className="text-muted-foreground">Conta: </span>
              <span className="font-medium text-foreground">{email}</span>
            </p>
          )}

          <Button variant="outline" className="w-full mt-8 text-muted-foreground" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
