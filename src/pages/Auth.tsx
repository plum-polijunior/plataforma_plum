import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogIn, Globe } from "lucide-react";
import plumLogo from "@/assets/plum-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Auth = () => {
  const { toast } = useToast();
  
  // State for active tab (empty initially so no forms show)
  const [activeTab, setActiveTab] = useState<string>("");

  // State for "Entrar em uma organização"
  const [orgId, setOrgId] = useState("");
  const [foundOrg, setFoundOrg] = useState<{ id: string; name: string } | null>(null);
  
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  
  // State for "Criar uma organização"
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgShareId, setNewOrgShareId] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);

  // 1. Procurar organização pelo ID de 4 dígitos
  const handleSearchOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (orgId.length < 4) return;
    
    setIsLoading(true);
    try {
      const shareId = orgId.toUpperCase();
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('share_id', shareId)
        .maybeSingle();
        
      if (error) throw error;
      
      if (data) {
        setFoundOrg(data);
      } else {
        toast({
          title: "Organização não encontrada",
          description: "Verifique o ID digitado e tente novamente.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro ao buscar organização",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Login de usuário já existente
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });
      
      if (error) throw error;
      
      window.location.href = '/dashboard';
    } catch (error: any) {
      toast({
        title: "Erro no login",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Cadastro de novo integrante em organização existente
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundOrg) return;
    
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: {
          data: {
            organization_id: foundOrg.id
            // `status` NÃO é enviado: quem define é o servidor.
          }
        }
      });
      
      if (error) throw error;
      
      // Enviar webhook ou trigger para o admin via Edge Function
      await supabase.functions.invoke('send-auth-email', {
        body: { type: 'new_request', userEmail: signupEmail, organizationName: foundOrg.name }
      });
      
      toast({
        title: "Conta criada com sucesso!",
        description: "Aguardando autorização do administrador da organização.",
      });
      
      // Limpar form
      setSignupEmail("");
      setSignupPassword("");
    } catch (error: any) {
      toast({
        title: "Erro ao criar conta",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Criar nova organização (Admin)
  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const shareId = newOrgShareId.toUpperCase();
      
      // Verifica unicidade
      const { data: existingOrg } = await supabase
        .from('organizations')
        .select('id')
        .eq('share_id', shareId)
        .maybeSingle();
        
      if (existingOrg) {
        toast({
          title: "ID Indisponível",
          description: "Este ID já está em uso por outra organização. Escolha outro.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // Cria o usuário Admin passando os dados para a Trigger SQL criar tudo atomicamente
      const { error: authError } = await supabase.auth.signUp({
        email: adminEmail,
        password: adminPassword,
        options: {
          data: {
            is_admin_setup: 'true',
            org_name: newOrgName,
            org_share_id: shareId
            // `status` NÃO é enviado: quem define é o servidor.
          }
        }
      });
      
      if (authError) throw authError;

      // Dispara o email de boas vindas (Edge Function)
      try {
        await supabase.functions.invoke('send-auth-email', {
          body: { type: 'organization_created', userEmail: adminEmail, organizationName: newOrgName }
        });
      } catch (e) {
        console.error("Falha ao enviar email de boas vindas:", e);
      }
      
      toast({
        title: "Organização criada!",
        description: "Bem-vindo ao Plum. Redirecionando...",
      });
      
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1500);
      
    } catch (error: any) {
      toast({
        title: "Erro ao criar organização",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start pt-16 md:pt-24 p-4 relative overflow-hidden">
      {/* Glows do tema */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-[-140px] right-[-120px] h-[420px] w-[420px] rounded-full bg-accent/10 blur-3xl" />
      </div>
      
      {/* Botão voltar */}
      <Button 
        variant="ghost" 
        onClick={() => {
          if (activeTab !== "") {
            setActiveTab("");
            setFoundOrg(null);
          } else {
            window.location.href = '/';
          }
        }}
        className="absolute top-4 left-4 z-20 text-muted-foreground hover:text-foreground"
      >
        ← {activeTab !== "" ? "Voltar para seleção de acesso" : "Voltar para o site"}
      </Button>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl z-10"
      >
        <div className="text-center mb-16">
          <img src={plumLogo} alt="Plum" className="w-20 h-20 mx-auto object-contain mb-4" />
          <h1 className="text-2xl font-bold text-gradient">Plum Platform</h1>
          <p className="text-muted-foreground mt-2">Acesse os dados da sua operação</p>
        </div>

        <div className="w-full">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {activeTab === "" && (
              <TabsList className="grid w-full grid-cols-1 md:grid-cols-2 mb-10 bg-transparent gap-6 p-0 h-auto">
              <TabsTrigger 
                value="entrar" 
                onClick={() => setFoundOrg(null)}
                className="flex flex-col items-center justify-center px-6 py-16 border-2 border-primary/40 bg-primary/10 hover:bg-primary/20 hover:border-primary/60 data-[state=active]:border-primary data-[state=active]:bg-primary/20 transition-all rounded-2xl shadow-md min-h-[300px]"
              >
                <span className="font-bold text-2xl mb-6 text-foreground">Entrar</span>
                <LogIn className="h-16 w-16 mb-6 text-primary" />
                <span className="text-base text-muted-foreground whitespace-normal text-center">
                  Clique aqui se sua empresa já usa o Plum.
                </span>
              </TabsTrigger>
              
              <TabsTrigger 
                value="criar"
                className="flex flex-col items-center justify-center px-6 py-16 border-2 border-primary/40 bg-primary/10 hover:bg-primary/20 hover:border-primary/60 data-[state=active]:border-primary data-[state=active]:bg-primary/20 transition-all rounded-2xl shadow-md min-h-[300px]"
              >
                <span className="font-bold text-2xl mb-6 text-foreground">Nova Organização</span>
                <Globe className="h-16 w-16 mb-6 text-primary" />
                <span className="text-base text-muted-foreground whitespace-normal text-center">
                  Clique aqui para criar um novo ambiente para sua empresa.
                </span>
              </TabsTrigger>
              </TabsList>
            )}

            {/* TAB: ENTRAR EM UMA ORGANIZAÇÃO */}
            <TabsContent value="entrar">
              <div className="glass p-6 md:p-8 rounded-2xl border border-border/30 shadow-xl mx-auto max-w-md">
                {!foundOrg ? (
                  <form onSubmit={handleSearchOrg} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="orgId">ID da Organização (4 caracteres)</Label>
                      <Input 
                        id="orgId" 
                        placeholder="Ex: CALI" 
                        value={orgId}
                        onChange={(e) => setOrgId(e.target.value.toUpperCase())}
                        maxLength={4}
                        required
                        className="bg-background/50 uppercase"
                      />
                    </div>
                    <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={isLoading}>
                      {isLoading ? "Buscando..." : "Buscar Organização"}
                    </Button>
                  </form>
                ) : (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/20">
                      <div>
                        <p className="text-sm text-muted-foreground">Entrando em:</p>
                        <p className="font-semibold text-foreground text-lg">{foundOrg.name}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setFoundOrg(null)}>Trocar</Button>
                    </div>

                    <Tabs defaultValue="login" className="w-full mt-4">
                      <TabsList className="grid w-full grid-cols-2 mb-4 bg-muted/20">
                        <TabsTrigger value="login">Login</TabsTrigger>
                        <TabsTrigger value="cadastro">Cadastrar</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="login">
                        <form onSubmit={handleLogin} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="login-email">Email</Label>
                            <Input id="login-email" type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required className="bg-background/50" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="login-password">Senha</Label>
                            <Input id="login-password" type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required className="bg-background/50" />
                          </div>
                          <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={isLoading}>
                            {isLoading ? "Entrando..." : "Entrar"}
                          </Button>
                        </form>
                      </TabsContent>

                      <TabsContent value="cadastro">
                        <form onSubmit={handleSignup} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="signup-email">Email Corporativo</Label>
                            <Input id="signup-email" type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required className="bg-background/50" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="signup-password">Senha</Label>
                            <Input id="signup-password" type="password" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required className="bg-background/50" />
                          </div>
                          <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={isLoading}>
                            {isLoading ? "Solicitando..." : "Solicitar Acesso"}
                          </Button>
                          <p className="text-xs text-muted-foreground text-center mt-2">
                            Você precisará da aprovação do administrador para entrar.
                          </p>
                        </form>
                      </TabsContent>
                    </Tabs>
                  </motion.div>
                )}
              </div>
            </TabsContent>

            {/* TAB: CRIAR UMA ORGANIZAÇÃO */}
            <TabsContent value="criar">
              <div className="glass p-6 md:p-8 rounded-2xl border border-border/30 shadow-xl mx-auto max-w-md">
                <form onSubmit={handleCreateOrg} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-org-name">Nome da Empresa</Label>
                    <Input id="new-org-name" placeholder="Ex: Cali Ltda" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} required className="bg-background/50" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="new-org-id">ID Compartilhável (4 caracteres)</Label>
                    <Input 
                      id="new-org-id" 
                      placeholder="Ex: CALI" 
                      value={newOrgShareId} 
                      onChange={(e) => setNewOrgShareId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} 
                      maxLength={4}
                      minLength={4}
                      required 
                      className="bg-background/50 uppercase" 
                    />
                    <p className="text-xs text-muted-foreground">Este ID será enviado aos seus colaboradores para entrarem na plataforma.</p>
                  </div>

                  <div className="pt-4 border-t border-border/20 space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">Sua conta de Administrador</h3>
                    <div className="space-y-2">
                      <Label htmlFor="admin-email">Seu Email</Label>
                      <Input id="admin-email" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required className="bg-background/50" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="admin-password">Senha</Label>
                      <Input id="admin-password" type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required className="bg-background/50" />
                    </div>
                  </div>

                  <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 mt-6" disabled={isLoading}>
                    {isLoading ? "Criando ambiente..." : "Criar Organização"}
                  </Button>
                </form>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
