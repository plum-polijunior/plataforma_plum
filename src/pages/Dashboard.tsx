import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ShieldAlert, Users as UsersIcon, BadgeCheck, XCircle } from "lucide-react";

export default function Dashboard() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [organization, setOrganization] = useState<any>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New role state
  const [newRoleName, setNewRoleName] = useState("");

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*, role:roles(name)')
        .eq('id', session.user.id)
        .single();
        
      if (profileError) throw profileError;
      setProfile(profileData);

      if (profileData && profileData.organization_id) {
        // Fetch organization
        const { data: orgData } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', profileData.organization_id)
          .single();
        setOrganization(orgData);

        // Fetch roles
        const { data: rolesData } = await supabase
          .from('roles')
          .select('*')
          .eq('organization_id', profileData.organization_id)
          .order('created_at', { ascending: true });
        setRoles(rolesData || []);

        // Fetch all members of this organization
        const { data: membersData } = await supabase
          .from('profiles')
          .select('*, role:roles(name)')
          .eq('organization_id', profileData.organization_id);
        setMembers(membersData || []);
      }
    } catch (error: any) {
      console.error(error);
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim() || !organization) return;

    try {
      const { error } = await supabase
        .from('roles')
        .insert({
          organization_id: organization.id,
          name: newRoleName.trim()
        });
      
      if (error) throw error;
      
      toast({ title: "Cargo criado com sucesso" });
      setNewRoleName("");
      fetchData(); // reload
    } catch (error: any) {
      toast({
        title: "Erro ao criar cargo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUpdateStatus = async (userId: string, newStatus: string, roleId?: string) => {
    try {
      const updateData: any = { status: newStatus };
      if (roleId) updateData.role_id = roleId;

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId);

      if (error) throw error;

      toast({ title: `Usuário ${newStatus === 'ativo' ? 'aprovado' : 'rejeitado'} com sucesso!` });
      
      // Notify user via Edge Function if approved
      if (newStatus === 'ativo') {
        const user = members.find(m => m.id === userId);
        if (user) {
          await supabase.functions.invoke('send-auth-email', {
            body: { type: 'account_approved', userEmail: user.email, organizationName: organization.name }
          });
        }
      }

      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return <div>Carregando dashboard...</div>;
  }

  // Filter members
  const pendingMembers = members.filter(m => m.status === 'pendente');
  const activeMembers = members.filter(m => m.status === 'ativo');
  const isAdmin = profile?.role?.name?.toLowerCase() === 'admin';

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Minha Organização</h1>
          <p className="text-muted-foreground mt-1">Gerencie os acessos e membros da sua empresa.</p>
        </div>
        
        {organization && (
          <div className="glass px-6 py-3 rounded-xl border border-primary/20 bg-primary/5 flex items-center gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Sua Empresa</p>
              <p className="font-bold text-lg">{organization.name}</p>
            </div>
            <div className="h-10 w-px bg-border/50 mx-2"></div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">ID Compartilhável</p>
              <p className="font-bold text-lg text-primary tracking-widest">{organization.share_id}</p>
            </div>
          </div>
        )}
      </div>

      {!isAdmin && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 mt-0.5" />
          <div>
            <h4 className="font-semibold">Acesso Restrito</h4>
            <p className="text-sm">Você precisa ser um Admin para aprovar novos membros ou criar cargos.</p>
          </div>
        </div>
      )}

      {profile?.status === 'pendente' && (
        <div className="p-6 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-center">
          <ShieldAlert className="h-12 w-12 mx-auto mb-4 opacity-80" />
          <h3 className="text-xl font-bold mb-2">Conta Pendente</h3>
          <p>Sua conta foi criada e está aguardando a aprovação do administrador da organização.</p>
          <p className="text-sm mt-4 opacity-80">Você não poderá acessar os dados do Plum até ser aprovado.</p>
        </div>
      )}

      {profile?.status === 'ativo' && (
        <div className="glass p-6 rounded-2xl border border-border/30 shadow-sm">
          <Tabs defaultValue="ativos" className="w-full">
            <TabsList className="grid w-full md:w-auto md:inline-grid grid-cols-3 mb-8 bg-muted/50">
              <TabsTrigger value="ativos" className="data-[state=active]:bg-background">Membros Ativos</TabsTrigger>
              <TabsTrigger value="pendentes" className="data-[state=active]:bg-background">
                Aprovações {pendingMembers.length > 0 && <span className="ml-2 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">{pendingMembers.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="cargos" className="data-[state=active]:bg-background">Cargos</TabsTrigger>
            </TabsList>

            <TabsContent value="ativos" className="space-y-4">
              <div className="grid gap-4">
                {activeMembers.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Nenhum membro ativo.</p>
                ) : (
                  activeMembers.map(member => (
                    <div key={member.id} className="flex items-center justify-between p-4 rounded-lg border border-border/40 bg-card/50 hover:bg-card transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {member.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{member.email}</p>
                          <p className="text-sm text-muted-foreground">Adicionado em {new Date(member.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-medium">
                        {member.role?.name || 'Sem cargo'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="pendentes" className="space-y-4">
              <div className="grid gap-4">
                {pendingMembers.length === 0 ? (
                  <div className="text-center py-12">
                    <BadgeCheck className="h-12 w-12 mx-auto text-muted-foreground opacity-30 mb-4" />
                    <p className="text-muted-foreground">Tudo certo! Nenhuma aprovação pendente.</p>
                  </div>
                ) : (
                  pendingMembers.map(member => (
                    <div key={member.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg border border-border/40 bg-card/50 gap-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold">
                          {member.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{member.email}</p>
                          <p className="text-sm text-muted-foreground">Solicitou em {new Date(member.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      
                      {isAdmin ? (
                        <div className="flex items-center gap-2">
                          <select 
                            className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
                            id={`role-select-${member.id}`}
                            defaultValue=""
                          >
                            <option value="" disabled>Selecione um cargo...</option>
                            {roles.map(r => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                          
                          <Button 
                            variant="default" 
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => {
                              const select = document.getElementById(`role-select-${member.id}`) as HTMLSelectElement;
                              if (!select.value) {
                                toast({ title: "Selecione um cargo para aprovar.", variant: "destructive" });
                                return;
                              }
                              handleUpdateStatus(member.id, 'ativo', select.value);
                            }}
                          >
                            <BadgeCheck className="h-4 w-4 mr-1" /> Aprovar
                          </Button>
                          <Button 
                            variant="destructive"
                            onClick={() => handleUpdateStatus(member.id, 'rejeitado')}
                          >
                            <XCircle className="h-4 w-4 mr-1" /> Rejeitar
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Aguardando admin</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="cargos" className="space-y-6">
              {isAdmin && (
                <form onSubmit={handleCreateRole} className="flex items-end gap-4 p-4 rounded-lg border border-primary/20 bg-primary/5">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="new-role">Criar novo cargo</Label>
                    <Input 
                      id="new-role" 
                      placeholder="Ex: Analista de Produção" 
                      value={newRoleName}
                      onChange={e => setNewRoleName(e.target.value)}
                      className="bg-background"
                    />
                  </div>
                  <Button type="submit">Criar</Button>
                </form>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {roles.map(role => {
                  const roleMembers = members.filter(m => m.role_id === role.id && m.status === 'ativo');
                  return (
                    <div key={role.id} className="p-4 rounded-lg border border-border/40 bg-card/50 flex flex-col h-full">
                      <h4 className="font-semibold text-lg">{role.name}</h4>
                      <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                        <UsersIcon className="h-3 w-3" /> {roleMembers.length} membro(s)
                      </p>
                      
                      <div className="mt-4 pt-4 border-t border-border/20 flex-1">
                        {roleMembers.length > 0 ? (
                          <div className="flex -space-x-2 overflow-hidden">
                            {roleMembers.slice(0, 5).map(m => (
                              <div key={m.id} className="inline-block h-8 w-8 rounded-full ring-2 ring-background bg-primary/10 flex items-center justify-center text-xs font-medium text-primary" title={m.email}>
                                {m.email.charAt(0).toUpperCase()}
                              </div>
                            ))}
                            {roleMembers.length > 5 && (
                              <div className="inline-block h-8 w-8 rounded-full ring-2 ring-background bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                                +{roleMembers.length - 5}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">Nenhum membro ativo</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
