import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Clock, ShieldAlert, Building2, LogOut, Plus, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import plumLogo from "@/assets/plum-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
  const { toast } = useToast();
  const [criando, setCriando] = useState(false);
  const [nomeOrg, setNomeOrg] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  // Leitura síncrona do localStorage para evitar flash de tela e bug do StrictMode
  const [pendingSSOOrgName, setPendingSSOOrgName] = useState(() => localStorage.getItem("plum_pending_org_name"));

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  useEffect(() => {
    if (state === "sem-org" && pendingSSOOrgName) {
      const autoCreate = async () => {
        // Não removemos o localStorage AQUI, para evitar que o React StrictMode 
        // destrua a intenção do usuário antes de completar a requisição.
        try {
          const { error } = await supabase.rpc("criar_organizacao", { p_nome: pendingSSOOrgName });
          if (error) throw error;
    
          localStorage.removeItem("plum_pending_org_name");
          setSucesso(true);
        } catch (err: any) {
          localStorage.removeItem("plum_pending_org_name");
          setPendingSSOOrgName(null); // Volta pra tela de erro normal
          toast({
            title: "Erro ao criar organização (SSO)",
            description: err.message,
            variant: "destructive",
          });
        }
      };
      
      autoCreate();
    }
  }, [state, pendingSSOOrgName, toast]);

  // Quem chega aqui sem organização precisa de uma saída: ou pede o código de
  // convite ao admin, ou cria a própria organização. Sem isto o usuário que
  // confirma o e-mail e entra fica num beco sem saída.
  const handleCriarOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const { error } = await supabase.rpc("criar_organizacao", { p_nome: nomeOrg });
      if (error) throw error;

      setSucesso(true);
    } catch (err: any) {
      toast({
        title: "Erro ao criar organização",
        description: err.message,
        variant: "destructive",
      });
      setEnviando(false);
    }
  };

  const handleEntrarNoPlum = async () => {
    setEnviando(true);
    // Limpa o hash do SSO da URL para que o Supabase não use o token antigo
    window.history.replaceState(null, "", window.location.pathname);
    // Força o refresh da sessão para obter o JWT com o organization_id
    await supabase.auth.refreshSession();
  };

  if (sucesso) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass p-8 rounded-2xl border border-border/30 shadow-xl text-center max-w-md w-full space-y-6 z-10"
        >
          <div className="h-16 w-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-2 shadow-inner border border-green-500/20">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Organização criada!</h2>
            <p className="text-muted-foreground leading-relaxed">
              Seu ambiente corporativo já está pronto para uso.
            </p>
          </div>
          <Button 
            className="w-full text-base py-5 font-semibold" 
            onClick={handleEntrarNoPlum}
            disabled={enviando}
          >
            {enviando ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : null}
            {enviando ? "Entrando..." : "Entrar no Plum"}
          </Button>
        </motion.div>
      </div>
    );
  }

  if (state === "sem-org" && pendingSSOOrgName) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="glass p-8 rounded-2xl border border-border/30 shadow-xl text-center max-w-sm w-full space-y-5 z-10">
          <Loader2 className="h-10 w-10 text-primary mx-auto animate-spin" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Configurando ambiente</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">
              Criando a organização <strong className="text-foreground">{pendingSSOOrgName}</strong> e vinculando sua conta...
            </p>
          </div>
        </div>
      </div>
    );
  }

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

          {state === "sem-org" && (
            <div className="mt-8 pt-6 border-t border-border/20 text-left">
              {!criando ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setCriando(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Criar uma organização
                </Button>
              ) : (
                <form onSubmit={handleCriarOrg} className="space-y-3">
                  <Label htmlFor="nome-org">Nome da empresa</Label>
                  <Input
                    id="nome-org"
                    value={nomeOrg}
                    onChange={(e) => setNomeOrg(e.target.value)}
                    placeholder="Ex: Minha Empresa Ltda"
                    required
                    minLength={2}
                    className="bg-background/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    Você será o administrador. Um código de convite de 12 caracteres
                    será gerado para sua equipe.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="flex-1"
                      onClick={() => setCriando(false)}
                      disabled={enviando}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" className="flex-1" disabled={enviando}>
                      {enviando ? "Criando..." : "Criar"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          <Button variant="outline" className="w-full mt-4 text-muted-foreground" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
