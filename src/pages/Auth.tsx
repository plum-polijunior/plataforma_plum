import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Globe } from "lucide-react";
import plumLogo from "@/assets/plum-mascot-transparent.png";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Separador "ou …" entre SSO e formulário. Repetia-se em três lugares. */
function Separador({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="whitespace-nowrap text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
        {children}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

const Auth = () => {
  const { toast } = useToast();

  // State for active tab (empty initially so no forms show)
  const [activeTab, setActiveTab] = useState<string>("");

  // Sub-state for "Entrar" tab (login por email/SSO é o caminho padrão —
  // a esmagadora maioria dos acessos é de quem já tem conta; "Primeiro
  // acesso" vira uma opção secundária, não uma escolha equivalente).
  const [loginMode, setLoginMode] = useState<"returning" | "new">("returning");

  // State for "Entrar em uma organização"
  const [orgId, setOrgId] = useState("");
  const [foundOrg, setFoundOrg] = useState<{ id: string; name: string } | null>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const isLoginEmailValid = EMAIL_REGEX.test(loginEmail);
  const isLoginPasswordValid = loginPassword.length >= 6;
  const isLoginFormValid = isLoginEmailValid && isLoginPasswordValid;
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

      window.location.href = '/inicio';
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
          redirectTo: `${window.location.origin}/inicio`,
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

  const handleSSOCreateOrg = (provider: 'google' | 'azure') => {
    if (!newOrgName.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Digite o nome da sua empresa antes de continuar com o Google/Microsoft.",
        variant: "destructive"
      });
      return;
    }
    // Salva a intenção de criar organização com este nome
    localStorage.setItem("plum_pending_org_name", newOrgName.trim());
    handleSSO(provider);
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
        window.location.href = '/inicio';
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
    /*
      Repaginado para a Direção A em 2026-08-12: tema claro, sem nenhuma
      alteração de lógica — os handlers, a validação e o destino do login
      estão todos acima e não foram tocados.

      O painel direito ("Os dados da sua operação, em uma conversa" + a lista
      de 3 pontos, componente `PainelLateral`) saiu em 2026-08-12, a pedido do
      usuário — o login passou a ser a única coisa na tela, centralizada.

      O que mais saiu, e por quê: os dois glows `blur-3xl`, o `glass` dos
      cartões, o `text-gradient` do título e o botão `variant="hero"`. Todos
      são vocabulário da landing (vidro e brilho sobre fundo escuro), e esta
      tela é a porta do produto, não a página de venda. O `DESIGN.md` §1
      separa as duas superfícies exatamente aqui.

      O que ficou, porque é decisão de produto e não de estilo (§7 do CLAUDE.md):
      "Entrar" continua sendo o caminho central e "criar organização" continua
      rebaixado a link secundário — entrar acontece milhares de vezes, criar
      acontece uma vez na vida da empresa.
    */
    <div className="relative flex min-h-screen flex-col justify-center bg-background px-6 py-12 md:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_400px_at_50%_15%,hsl(var(--tint-soft)),transparent_70%)]" />

      <button
        type="button"
        onClick={() => {
          if (activeTab !== "") {
            setActiveTab("");
            setFoundOrg(null);
            setLoginMode("returning");
          } else {
            window.location.href = '/';
          }
        }}
        className="absolute left-6 top-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground md:left-10"
      >
        <ArrowLeft size={14} strokeWidth={2} />
        {activeTab !== "" ? "Voltar" : "Voltar para o site"}
      </button>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative mx-auto w-full max-w-[360px]"
      >
          <img src={plumLogo} alt="Plum" className="mb-8 h-10 w-10 object-contain" />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {activeTab === "" && (
              <div>
                <h1 className="mb-2 font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground">
                  Entrar na plataforma
                </h1>
                <p className="mb-8 text-sm leading-[1.55] text-text-soft">
                  Acesse os dados da sua operação.
                </p>

                {/* O `TabsList`/`TabsTrigger` continua sendo quem troca de aba —
                    só deixou de ser um cartão de 300px de altura e passou a ser
                    o botão primário da tela. */}
                <TabsList className="h-auto w-full bg-transparent p-0">
                  <TabsTrigger
                    value="entrar"
                    onClick={() => {
                      setFoundOrg(null);
                      setLoginMode("returning");
                    }}
                    className="h-[42px] w-full rounded-[9px] bg-primary text-sm font-medium text-primary-foreground transition-all duration-150 hover:-translate-y-px hover:bg-brand-hover data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    Entrar
                  </TabsTrigger>
                </TabsList>

                <p className="mt-7 text-center text-[12.5px] text-muted-foreground">
                  Sua empresa ainda não usa o Plum?{" "}
                  <button
                    type="button"
                    onClick={() => setActiveTab("criar")}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Crie uma organização
                  </button>
                </p>
              </div>
            )}

            {/* ── ENTRAR EM UMA ORGANIZAÇÃO ─────────────────────────────────── */}
            <TabsContent value="entrar" className="mt-0">
              {!foundOrg ? (
                <>
                  {loginMode === "returning" ? (
                    <>
                      <h1 className="mb-2 font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground">
                        Entrar na plataforma
                      </h1>
                      <p className="mb-8 text-sm leading-[1.55] text-text-soft">
                        Acesse os dados da sua operação.
                      </p>

                      <div className="flex flex-col gap-2">
                        <Button type="button" variant="outline" className="w-full" disabled={isLoading} onClick={() => handleSSO('google')}>
                          <Globe className="mr-2 h-4 w-4" />
                          Continuar com Google
                        </Button>
                        <Button type="button" variant="outline" className="w-full" disabled={isLoading} onClick={() => handleSSO('azure')}>
                          <Globe className="mr-2 h-4 w-4" />
                          Continuar com Microsoft
                        </Button>
                      </div>

                      <Separador>ou com email</Separador>

                      <form onSubmit={handleLogin} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-[7px]">
                          <Label htmlFor="top-login-email" className="text-[12.5px] font-medium text-secondary-foreground">
                            Email corporativo
                          </Label>
                          <Input id="top-login-email" type="email" placeholder="voce@empresa.com.br" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
                          {loginEmail.length > 0 && !isLoginEmailValid && (
                            <p className="text-xs text-destructive">O email precisa ter um @ e um domínio (ex.: nome@empresa.com).</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-[7px]">
                          <Label htmlFor="top-login-password" className="text-[12.5px] font-medium text-secondary-foreground">
                            Senha
                          </Label>
                          <Input id="top-login-password" type="password" placeholder="••••••••••" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required />
                          {loginPassword.length > 0 && !isLoginPasswordValid && (
                            <p className="text-xs text-destructive">A senha precisa ter pelo menos 6 caracteres.</p>
                          )}
                        </div>
                        {/* O botão só EXISTE quando e-mail e senha passam na
                            validação local — §7 do CLAUDE.md. Não é `disabled`:
                            é ausência, de propósito. */}
                        {isLoginFormValid && (
                          <Button type="submit" className="mt-1 w-full" disabled={isLoading}>
                            {isLoading ? "Entrando…" : "Entrar com Email"}
                          </Button>
                        )}
                      </form>

                      <p className="mt-7 text-center text-[12.5px] text-muted-foreground">
                        Primeiro acesso?{" "}
                        <button
                          type="button"
                          onClick={() => setLoginMode("new")}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          Pedir acesso à sua organização
                        </button>
                      </p>
                    </>
                  ) : (
                    <>
                      <h1 className="mb-2 font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground">
                        Primeiro acesso
                      </h1>
                      <p className="mb-8 text-sm leading-[1.55] text-text-soft">
                        Use o código que a sua empresa enviou, ou entre pelo email corporativo.
                      </p>

                      <form onSubmit={handleSearchOrg} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-[7px]">
                          <Label htmlFor="orgId" className="text-[12.5px] font-medium text-secondary-foreground">
                            Código de convite
                          </Label>
                          <Input
                            id="orgId"
                            placeholder="Ex: MINH4EMPRES4"
                            value={orgId}
                            onChange={(e) => setOrgId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                            maxLength={12}
                            required
                            className="font-code uppercase tracking-wider"
                          />
                          <p className="text-xs leading-[1.5] text-muted-foreground">
                            São 12 caracteres. Quem tem o código é o administrador da sua
                            organização.
                          </p>
                        </div>
                        <Button type="submit" variant="outline" className="w-full" disabled={isLoading}>
                          {isLoading ? "Buscando…" : "Buscar organização"}
                        </Button>
                      </form>

                      <Separador>ou com email corporativo</Separador>

                      <div className="flex flex-col gap-2">
                        <Button type="button" variant="outline" className="w-full" disabled={isLoading} onClick={() => handleSSO('google')}>
                          <Globe className="mr-2 h-4 w-4" />
                          Continuar com Google
                        </Button>
                        <Button type="button" variant="outline" className="w-full" disabled={isLoading} onClick={() => handleSSO('azure')}>
                          <Globe className="mr-2 h-4 w-4" />
                          Continuar com Microsoft
                        </Button>
                      </div>

                      <p className="mt-7 text-center text-[12.5px] text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => setLoginMode("returning")}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          Já tenho conta
                        </button>
                      </p>
                    </>
                  )}
                </>
              ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="mb-6 flex items-end justify-between gap-3 border-b border-border pb-5">
                    <div className="min-w-0">
                      <p className="text-[12.5px] text-muted-foreground">Entrando em</p>
                      <p className="truncate font-display text-lg font-semibold tracking-[-0.01em] text-foreground">
                        {foundOrg.name}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFoundOrg(null)}
                      className="flex-none text-[12.5px] font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Trocar
                    </button>
                  </div>

                  <Tabs defaultValue="login" className="w-full">
                    <TabsList className="mb-5 grid w-full grid-cols-2 bg-secondary">
                      <TabsTrigger value="login">Entrar</TabsTrigger>
                      <TabsTrigger value="cadastro">Pedir acesso</TabsTrigger>
                    </TabsList>

                    <TabsContent value="login">
                      <form onSubmit={handleLogin} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-[7px]">
                          <Label htmlFor="login-email" className="text-[12.5px] font-medium text-secondary-foreground">
                            Email
                          </Label>
                          <Input id="login-email" type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
                        </div>
                        <div className="flex flex-col gap-[7px]">
                          <Label htmlFor="login-password" className="text-[12.5px] font-medium text-secondary-foreground">
                            Senha
                          </Label>
                          <Input id="login-password" type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required />
                        </div>
                        <Button type="submit" className="mt-1 w-full" disabled={isLoading}>
                          {isLoading ? "Entrando…" : "Entrar"}
                        </Button>
                      </form>
                    </TabsContent>

                    <TabsContent value="cadastro">
                      <form onSubmit={handleSignup} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-[7px]">
                          <Label htmlFor="signup-email" className="text-[12.5px] font-medium text-secondary-foreground">
                            Email corporativo
                          </Label>
                          <Input id="signup-email" type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required />
                        </div>
                        <div className="flex flex-col gap-[7px]">
                          <Label htmlFor="signup-password" className="text-[12.5px] font-medium text-secondary-foreground">
                            Senha
                          </Label>
                          <Input id="signup-password" type="password" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required />
                        </div>
                        <Button type="submit" className="mt-1 w-full" disabled={isLoading}>
                          {isLoading ? "Solicitando…" : "Solicitar acesso"}
                        </Button>
                        <p className="text-center text-xs text-muted-foreground">
                          Um administrador precisa aprovar antes de você ver os dados.
                        </p>
                      </form>
                    </TabsContent>
                  </Tabs>
                </motion.div>
              )}
            </TabsContent>

            {/* ── CRIAR UMA ORGANIZAÇÃO ─────────────────────────────────────── */}
            <TabsContent value="criar" className="mt-0">
              <h1 className="mb-2 font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground">
                Criar uma organização
              </h1>
              <p className="mb-8 text-sm leading-[1.55] text-text-soft">
                Você será o administrador do ambiente da sua empresa.
              </p>

              <div className="mb-6 flex flex-col gap-[7px]">
                <Label htmlFor="new-org-name" className="text-[12.5px] font-medium text-secondary-foreground">
                  Nome da empresa
                </Label>
                <Input
                  id="new-org-name"
                  placeholder="Ex: Minha Empresa Ltda"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  required
                />
                <p className="text-xs leading-[1.5] text-muted-foreground">
                  Este será o nome do ambiente no Plum. Vale para os três caminhos abaixo.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Button type="button" variant="outline" className="w-full" disabled={isLoading} onClick={() => handleSSOCreateOrg('google')}>
                  <Globe className="mr-2 h-4 w-4" />
                  Criar com Google
                </Button>
                <Button type="button" variant="outline" className="w-full" disabled={isLoading} onClick={() => handleSSOCreateOrg('azure')}>
                  <Globe className="mr-2 h-4 w-4" />
                  Criar com Microsoft
                </Button>
              </div>

              <Separador>ou com email e senha</Separador>

              <form onSubmit={handleCreateOrg} className="flex flex-col gap-4">
                <div className="flex flex-col gap-[7px]">
                  <Label htmlFor="admin-email" className="text-[12.5px] font-medium text-secondary-foreground">
                    Seu email corporativo
                  </Label>
                  <Input id="admin-email" type="email" placeholder="voce@empresa.com.br" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
                </div>
                <div className="flex flex-col gap-[7px]">
                  <Label htmlFor="admin-password" className="text-[12.5px] font-medium text-secondary-foreground">
                    Crie uma senha
                  </Label>
                  <Input id="admin-password" type="password" placeholder="••••••••••" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required />
                </div>

                {/* O código de convite deixou de ser escolhido pelo cliente:
                    agora é gerado pelo servidor com 12 caracteres aleatórios
                    (o antigo, de 4, era enumerável em poucas horas). */}
                <div className="rounded-[9px] border border-border bg-secondary p-3">
                  <p className="text-xs leading-[1.5] text-muted-foreground">
                    Um <span className="font-medium text-foreground">código de convite</span> de 12
                    caracteres é gerado automaticamente. Ele fica em "Minha Organização", para você
                    enviar à sua equipe.
                  </p>
                </div>

                <Button type="submit" className="mt-1 w-full" disabled={isLoading}>
                  {isLoading ? "Criando ambiente…" : "Criar organização"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
      </motion.div>
    </div>
  );
};

export default Auth;
