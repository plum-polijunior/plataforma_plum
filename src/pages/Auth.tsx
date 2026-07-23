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

      // MUDANÇA DE SEGURANÇA (achado S-02): antes esta tela fazia
      // `.from('organizations').select(...)` como `anon`, o que exigia
      // leitura pública da tabela inteira — vazava a lista de clientes.
      // Agora usa uma função SECURITY DEFINER que devolve APENAS
      // { org_id, org_name } da organização correspondente ao código.
      const { data, error } = await supabase
        .rpc('resolver_codigo_organizacao', { p_codigo: shareId });

      if (error) throw error;

      const encontrada = Array.isArray(data) ? data[0] : data;

      if (encontrada) {
        setFoundOrg({ id: encontrada.org_id, name: encontrada.org_name });
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

  // 2b. Login via SSO corporativo (Google / Microsoft).
  // O vínculo com a organização é resolvido 100% no servidor a partir do
  // domínio verificado do e-mail — o cliente não envia nem escolhe org.
  const handleSSO = async (provider: 'google' | 'azure') => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
          // `hd` (Google) e `tid` (Microsoft) chegam nas claims e são usados
          // como sinal primário pelo trigger.
          scopes: provider === 'azure' ? 'email openid profile' : undefined,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      toast({
        title: "Erro no login corporativo",
        description: error.message,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  // 3. Cadastro de novo integrante em organização existente
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundOrg) return;
    
    setIsLoading(true);
    try {
      // O que vai no metadata é o CÓDIGO de convite digitado pelo usuário —
      // um segredo portador, não uma declaração de identidade. O servidor
      // resolve a organização a partir dele e define o status.
      // Nunca enviar `organization_id` nem `status`: o trigger os ignora.
      const { error } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: {
          data: {
            join_code: orgId.toUpperCase()
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
      // MUDANÇA DE SEGURANÇA (achado S-10): antes o cliente enviava
      // `is_admin_setup: 'true'` + `org_name` + `org_share_id` no metadata do
      // signUp e o trigger criava a organização a partir disso. Metadata é
      // campo livre do cliente — criar organização por ali é o mesmo padrão
      // que gerou o S-01.
      //
      // Agora são dois passos explícitos:
      //   1. cria a conta (nasce SEM organização);
      //   2. chama a RPC `criar_organizacao`, já autenticado.
      // O código de convite é gerado pelo servidor, não escolhido pelo cliente.
      const { data: signUpData, error: authError } = await supabase.auth.signUp({
        email: adminEmail,
        password: adminPassword,
      });

      if (authError) throw authError;

      // Sem sessão = confirmação de e-mail está ligada. A organização é
      // criada no primeiro login, pela tela de "sem organização".
      if (!signUpData.session) {
        toast({
          title: "Confirme seu e-mail",
          description:
            "Enviamos um link de confirmação. Após confirmar e entrar, você concluirá a criação da organização.",
        });
        setIsLoading(false);
        return;
      }

      const { error: rpcError } = await supabase
        .rpc('criar_organizacao', { p_nome: newOrgName });

      if (rpcError) throw rpcError;

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
                {/* Caminho preferencial: SSO corporativo.
                    A organização é resolvida pelo domínio verificado. */}
                <div className="space-y-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full bg-background/50"
                    disabled={isLoading}
                    onClick={() => handleSSO('google')}
                  >
                    <Globe className="mr-2 h-4 w-4" />
                    Continuar com Google
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full bg-background/50"
                    disabled={isLoading}
                    onClick={() => handleSSO('azure')}
                  >
                    <Globe className="mr-2 h-4 w-4" />
                    Continuar com Microsoft
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Use seu e-mail corporativo — sua organização é identificada automaticamente.
                  </p>
                </div>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/30" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">ou com ID da organização</span>
                  </div>
                </div>

                {!foundOrg ? (
                  <form onSubmit={handleSearchOrg} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="orgId">Código da Organização</Label>
                      <Input
                        id="orgId"
                        placeholder="Ex: K7M2PQR4XW3T"
                        value={orgId}
                        onChange={(e) => setOrgId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                        // 12 = join_code novo. O limite antigo era 4 (share_id),
                        // que continua aceito para não quebrar as orgs existentes.
                        maxLength={12}
                        required
                        className="bg-background/50 uppercase tracking-wider"
                      />
                      <p className="text-xs text-muted-foreground">
                        O administrador da sua empresa envia esse código.
                      </p>
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
                  
                  {/* O código de convite deixou de ser escolhido pelo cliente:
                      agora é gerado pelo servidor com 12 caracteres aleatórios
                      (o antigo, de 4, era enumerável em poucas horas). */}
                  <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">
                      Um <span className="font-medium text-foreground">código de convite</span> de
                      12 caracteres será gerado automaticamente. Você o encontra no painel,
                      em "Minha Organização", para enviar aos seus colaboradores.
                    </p>
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
