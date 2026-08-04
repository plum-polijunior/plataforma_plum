import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldAlert,
  Users as UsersIcon,
  BadgeCheck,
  XCircle,
  Database,
  Settings,
  Check,
  Sliders,
  Layers,
  Lock,
  Unlock,
  Loader2,
  Info,
  Sparkles,
  Copy,
  Globe,
  Edit2
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

interface RolePermissions {
  allowed_datasets: string[];
  columns_access: {
    [datasetId: string]: string[];
  };
}

export default function Dashboard() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [organization, setOrganization] = useState<any>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [datasets, setDatasets] = useState<any[]>([]);
  const [allRolePermissions, setAllRolePermissions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New role state
  const [newRoleName, setNewRoleName] = useState("");

  // Role permissions edit modal state
  const [editingRole, setEditingRole] = useState<any | null>(null);
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>({
    allowed_datasets: [],
    columns_access: {}
  });
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);

  // Approval state per user
  const [selectedApprovalRoles, setSelectedApprovalRoles] = useState<{ [userId: string]: string }>({});

  // Join code edit state
  const [isEditingJoinCode, setIsEditingJoinCode] = useState(false);
  const [newJoinCode, setNewJoinCode] = useState("");

  const handleUpdateJoinCode = async () => {
    if (!newJoinCode || newJoinCode.length <= 4) {
      toast({
        title: "Código muito curto",
        description: "O código de convite deve ter mais de 4 caracteres.",
        variant: "destructive"
      });
      return;
    }

    // Validar apenas letras e números (sem espaços/símbolos)
    if (!/^[a-zA-Z0-9]+$/.test(newJoinCode)) {
      toast({
        title: "Formato inválido",
        description: "O código deve conter apenas letras e números, sem espaços ou símbolos.",
        variant: "destructive"
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('organizations')
        .update({ join_code: newJoinCode.toUpperCase() })
        .eq('id', organization.id);

      if (error) {
        if (error.code === '23505') {
          throw new Error("Este código já está em uso.");
        }
        throw error;
      }

      toast({
        title: "Código atualizado!",
        description: "O novo código de convite foi salvo com sucesso."
      });

      setIsEditingJoinCode(false);
      fetchData(); // re-fetch to update organization state
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar código",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (profileError) throw profileError;

      // Fetch user's role explicitly to ensure it loads perfectly
      if (profileData && profileData.role_id) {
        const { data: roleData } = await supabase
          .from('roles')
          .select('*')
          .eq('id', profileData.role_id)
          .maybeSingle();

        if (roleData) {
          (profileData as any).role = roleData;
        }
      }

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

        // Fetch datasets to allow column permissions configuration
        const { data: datasetsData } = await supabase
          .from('datasets')
          .select('*')
          .eq('organization_id', profileData.organization_id)
          .order('created_at', { ascending: false });
        setDatasets(datasetsData || []);

        // Fetch all role permissions from the relational link table
        const { data: rolePermsData } = await supabase
          .from('role_permissions')
          .select('*')
          .eq('organization_id', profileData.organization_id);
        setAllRolePermissions(rolePermsData || []);

        // Fetch all members of this organization
        const { data: membersData } = await supabase
          .from('profiles')
          .select('*')
          .eq('organization_id', profileData.organization_id);

        // Enriquecer os membros com o nome do cargo buscando no array de roles já carregado
        const enrichedMembers = (membersData || []).map((m: any) => ({
          ...m,
          role: (rolesData || []).find((r: any) => r.id === m.role_id) || null
        }));

        setMembers(enrichedMembers);
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

      toast({ title: "Cargo criado com sucesso!", description: "Configure as permissões de acesso logo abaixo." });
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

  // Helper to safely extract columns from dataset schema_metadata
  const getDatasetColumns = (dataset: any): { name: string; description: string }[] => {
    if (!dataset || !dataset.schema_metadata) return [];
    const meta = typeof dataset.schema_metadata === 'string'
      ? JSON.parse(dataset.schema_metadata)
      : dataset.schema_metadata;

    if (Array.isArray(meta.columns)) {
      return meta.columns.map((c: any) =>
        typeof c === 'string' ? { name: c, description: '' } : { name: c.name || String(c), description: c.description || c.semantic_definition || '' }
      );
    }
    if (meta.columns && typeof meta.columns === 'object') {
      return Object.entries(meta.columns).map(([colName, info]: [string, any]) => ({
        name: colName,
        description: info?.semantic_definition || info?.description || ''
      }));
    }
    return [];
  };

  // Open permissions edit modal
  // O código de convite substituiu o antigo `share_id` de 4 caracteres.
  // Ele não é mais escolhido por quem cria a organização — é gerado pelo
  // servidor —, então esta tela é o lugar onde o admin o recupera.
  const handleCopiarCodigo = async (codigo: string) => {
    try {
      await navigator.clipboard.writeText(codigo);
      toast({
        title: "Código copiado",
        description: "Envie para quem vai entrar na organização.",
      });
    } catch {
      // clipboard exige contexto seguro (https ou localhost)
      toast({
        title: "Não foi possível copiar",
        description: `Copie manualmente: ${codigo}`,
        variant: "destructive",
      });
    }
  };

  const handleOpenPermissionModal = (role: any) => {
    setEditingRole(role);
    const rolePerms = allRolePermissions.filter(rp => rp.role_id === role.id);
    const allowed_datasets = rolePerms.map(rp => rp.dataset_id);
    const columns_access: { [datasetId: string]: string[] } = {};
    rolePerms.forEach(rp => {
      columns_access[rp.dataset_id] = rp.allowed_columns || [];
    });

    setRolePermissions({ allowed_datasets, columns_access });
  };

  // Toggle dataset allowed state
  const handleToggleDataset = (dsId: string) => {
    const isAllowed = rolePermissions.allowed_datasets.includes(dsId);
    let newAllowed = [...rolePermissions.allowed_datasets];
    let newColsAccess = { ...rolePermissions.columns_access };

    if (isAllowed) {
      newAllowed = newAllowed.filter(id => id !== dsId);
      delete newColsAccess[dsId];
    } else {
      newAllowed.push(dsId);
      // Padrão: ao permitir a base, libera todas as colunas existentes daquele dataset
      const ds = datasets.find(d => d.id === dsId);
      const cols = getDatasetColumns(ds).map(c => c.name);
      newColsAccess[dsId] = cols;
    }

    setRolePermissions({
      allowed_datasets: newAllowed,
      columns_access: newColsAccess
    });
  };

  // Toggle individual column inside a dataset
  const handleToggleColumn = (dsId: string, colName: string) => {
    const currentCols = rolePermissions.columns_access[dsId] || [];
    const exists = currentCols.includes(colName);
    let updatedCols = [...currentCols];

    if (exists) {
      updatedCols = updatedCols.filter(c => c !== colName);
    } else {
      updatedCols.push(colName);
    }

    setRolePermissions({
      ...rolePermissions,
      columns_access: {
        ...rolePermissions.columns_access,
        [dsId]: updatedCols
      }
    });
  };

  // Select / Deselect all columns for a dataset
  const handleSetAllColumns = (dsId: string, selectAll: boolean) => {
    if (!selectAll) {
      setRolePermissions({
        ...rolePermissions,
        columns_access: {
          ...rolePermissions.columns_access,
          [dsId]: []
        }
      });
      return;
    }

    const ds = datasets.find(d => d.id === dsId);
    const allCols = getDatasetColumns(ds).map(c => c.name);
    setRolePermissions({
      ...rolePermissions,
      columns_access: {
        ...rolePermissions.columns_access,
        [dsId]: allCols
      }
    });
  };

  // Save permissions to Supabase
  const handleSavePermissions = async () => {
    if (!editingRole || !organization) return;
    setIsSavingPermissions(true);
    try {
      // 1. First delete existing records for this role
      const { error: delError } = await supabase
        .from('role_permissions')
        .delete()
        .eq('role_id', editingRole.id);

      if (delError) throw delError;

      // 2. Prepare new records based on rolePermissions.allowed_datasets
      const toInsert = rolePermissions.allowed_datasets.map(datasetId => ({
        organization_id: organization.id,
        role_id: editingRole.id,
        dataset_id: datasetId,
        allowed_columns: rolePermissions.columns_access[datasetId] || [],
        created_by: profile?.id || null
      }));

      // 3. Insert if any datasets are allowed
      if (toInsert.length > 0) {
        const { error: insError } = await supabase
          .from('role_permissions')
          .insert(toInsert);

        if (insError) throw insError;
      }

      toast({
        title: "Permissões salvas com sucesso!",
        description: `As regras de acesso para "${editingRole.name}" foram salvas na tabela relacional.`
      });
      setEditingRole(null);
      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar permissões",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSavingPermissions(false);
    }
  };

  // Summary helper text for UI preview
  const getRoleSummaryText = (role: any) => {
    if (!role) return "Selecione um cargo";
    if (role.name?.toLowerCase() === 'admin') {
      return "Acesso irrestrito a todos os datasets e colunas (Admin)";
    }
    const rolePerms = allRolePermissions.filter(rp => rp.role_id === role.id);
    if (rolePerms.length === 0) {
      return "Nenhum dataset autorizado para consulta";
    }
    const totalCols = rolePerms.reduce((acc, rp) => acc + (rp.allowed_columns?.length || 0), 0);
    return `Acesso a ${rolePerms.length} base(s) de dados e ${totalCols} coluna(s) específica(s)`;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm font-medium">Carregando painel e permissões da organização...</p>
      </div>
    );
  }

  // Filter members
  const pendingMembers = members.filter(m => m.status === 'pendente');
  const activeMembers = members.filter(m => m.status === 'ativo');
  const isAdmin = profile?.role?.name?.toLowerCase() === 'admin';

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            Minha Organização
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20 ml-2">RBAC Granular</Badge>
          </h1>
          <p className="text-muted-foreground mt-1">Gerencie os acessos, cargos e permissões por coluna da sua empresa.</p>
        </div>

        {organization && (
          <div className="glass px-6 py-3 rounded-xl border border-primary/20 bg-primary/5 flex items-center gap-4 flex-wrap">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Sua Empresa</p>
              <p className="font-bold text-lg">{organization.name}</p>
            </div>

            <div className="h-10 w-px bg-border/50 mx-2 hidden sm:block"></div>

            {/* Modo de entrada define o que faz sentido mostrar: em 'dominio'
                o código de convite não é usado, então exibi-lo seria enganoso. */}
            {organization.join_mode === 'dominio' ? (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  Entrada
                </p>
                <p className="font-bold text-lg text-primary flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Por domínio verificado
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  Código de Convite
                </p>
                {isEditingJoinCode ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      value={newJoinCode}
                      onChange={(e) => setNewJoinCode(e.target.value)}
                      placeholder="Ex: MINHAEMPRESA"
                      className="h-8 w-40 font-mono text-sm uppercase"
                      maxLength={12}
                    />
                    <Button
                      variant="default"
                      size="sm"
                      className="h-8 px-2"
                      onClick={handleUpdateJoinCode}
                    >
                      Salvar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-muted-foreground"
                      onClick={() => setIsEditingJoinCode(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <p className="font-bold text-lg text-primary tracking-widest font-mono">
                      {organization.join_code}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-primary"
                      title="Copiar código"
                      onClick={() => handleCopiarCodigo(organization.join_code)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        title="Editar código"
                        onClick={() => {
                          setNewJoinCode(organization.join_code ?? "");
                          setIsEditingJoinCode(true);
                        }}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {!isAdmin && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold">Acesso Restrito</h4>
            <p className="text-sm">Você precisa ser um Admin para aprovar novos membros ou gerenciar permissões e cargos.</p>
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
          <Tabs defaultValue="pendentes" className="w-full">
            <TabsList className="grid w-full md:w-auto md:inline-grid grid-cols-3 mb-8 bg-muted/50">
              <TabsTrigger value="ativos" className="data-[state=active]:bg-background">Membros Ativos ({activeMembers.length})</TabsTrigger>
              <TabsTrigger value="pendentes" className="data-[state=active]:bg-background relative">
                Aprovações Pendentes
                {pendingMembers.length > 0 && (
                  <span className="ml-2 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full font-bold">
                    {pendingMembers.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="cargos" className="data-[state=active]:bg-background">Cargos & Permissões</TabsTrigger>
            </TabsList>

            <TabsContent value="ativos" className="space-y-4">
              <div className="grid gap-4">
                {activeMembers.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Nenhum membro ativo.</p>
                ) : (
                  activeMembers.map(member => (
                    <div key={member.id} className="flex items-center justify-between p-4 rounded-xl border border-border/40 bg-card/50 hover:bg-card transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {member.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{member.email}</p>
                          <p className="text-sm text-muted-foreground">Adicionado em {new Date(member.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="px-3 py-1 text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                          {member.role?.name || 'Sem cargo'}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="pendentes" className="space-y-4">
              <div className="grid gap-4">
                {pendingMembers.length === 0 ? (
                  <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed border-border/50">
                    <BadgeCheck className="h-12 w-12 mx-auto text-muted-foreground opacity-30 mb-4" />
                    <p className="text-foreground font-medium">Tudo certo!</p>
                    <p className="text-muted-foreground text-sm mt-1">Nenhuma aprovação pendente no momento.</p>
                  </div>
                ) : (
                  pendingMembers.map(member => {
                    const selectedRoleId = selectedApprovalRoles[member.id] || "";
                    const selectedRoleObj = roles.find(r => r.id === selectedRoleId);

                    return (
                      <div key={member.id} className="flex flex-col p-5 rounded-xl border border-border/60 bg-card/60 gap-4 transition-all">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 font-bold text-lg">
                              {member.email.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-base text-foreground">{member.email}</p>
                              <p className="text-xs text-muted-foreground">Solicitou acesso em {new Date(member.created_at).toLocaleDateString()}</p>
                            </div>
                          </div>

                          {isAdmin ? (
                            <div className="flex flex-wrap items-center gap-3">
                              <select
                                className="bg-background border border-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-[200px]"
                                id={`role-select-${member.id}`}
                                value={selectedRoleId}
                                onChange={(e) => setSelectedApprovalRoles({ ...selectedApprovalRoles, [member.id]: e.target.value })}
                              >
                                <option value="" disabled>Atribuir um cargo...</option>
                                {roles.map(r => (
                                  <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                              </select>

                              <Button
                                variant="default"
                                className="bg-green-600 hover:bg-green-700 text-white font-semibold shadow-sm"
                                onClick={() => {
                                  if (!selectedRoleId) {
                                    toast({ title: "Selecione um cargo para aprovar o usuário.", variant: "destructive" });
                                    return;
                                  }
                                  handleUpdateStatus(member.id, 'ativo', selectedRoleId);
                                }}
                              >
                                <BadgeCheck className="h-4 w-4 mr-1.5" /> Aprovar Membro
                              </Button>
                              <Button
                                variant="outline"
                                className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => handleUpdateStatus(member.id, 'rejeitado')}
                              >
                                <XCircle className="h-4 w-4 mr-1.5" /> Rejeitar
                              </Button>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">Aguardando admin</p>
                          )}
                        </div>

                        {/* Summary box showing exactly what permissions this user will get */}
                        {selectedRoleObj && (
                          <div className="mt-2 pt-3 border-t border-border/40 flex items-center justify-between bg-primary/5 -mx-5 -mb-5 p-4 rounded-b-xl border-b border-x border-primary/20 text-xs">
                            <div className="flex items-center gap-2 text-foreground/90 font-medium">
                              <Sliders className="h-4 w-4 text-primary shrink-0" />
                              <span><strong>Permissões que serão concedidas ({selectedRoleObj.name}):</strong> {getRoleSummaryText(selectedRoleObj)}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[11px] text-primary hover:text-primary/80 hover:bg-primary/10"
                              onClick={() => handleOpenPermissionModal(selectedRoleObj)}
                            >
                              Ver/Editar Colunas
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="cargos" className="space-y-6">
              {isAdmin && (
                <form onSubmit={handleCreateRole} className="flex flex-col sm:flex-row items-end gap-4 p-5 rounded-xl border border-primary/20 bg-primary/5 shadow-sm">
                  <div className="flex-1 space-y-2 w-full">
                    <Label htmlFor="new-role" className="text-sm font-semibold flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" /> Criar Novo Cargo Personalizado
                    </Label>
                    <Input
                      id="new-role"
                      placeholder="Ex: Analista de Produção ou Gestor Comercial"
                      value={newRoleName}
                      onChange={e => setNewRoleName(e.target.value)}
                      className="bg-background/80 h-11 text-sm border-border/80"
                    />
                  </div>
                  <Button type="submit" className="h-11 px-6 font-semibold shadow-sm w-full sm:w-auto">
                    Criar & Configurar
                  </Button>
                </form>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {roles.map(role => {
                  const roleMembers = members.filter(m => m.role_id === role.id && m.status === 'ativo');
                  const isRoleAdmin = role.name?.toLowerCase() === 'admin';

                  return (
                    <div key={role.id} className="p-5 rounded-xl border border-border/50 bg-card/50 flex flex-col justify-between h-full hover:border-primary/30 transition-all shadow-sm">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-bold text-lg text-foreground flex items-center gap-2">
                              {role.name}
                              {isRoleAdmin && <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">Admin Global</Badge>}
                            </h4>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                              <UsersIcon className="h-3.5 w-3.5" /> {roleMembers.length} membro(s) com este cargo
                            </p>
                          </div>

                          {isAdmin && !isRoleAdmin && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                              onClick={() => handleOpenPermissionModal(role)}
                            >
                              <Settings className="h-3.5 w-3.5" /> Permissões
                            </Button>
                          )}
                        </div>

                        {/* Permission Badge / Summary */}
                        <div className="mt-4 p-3 rounded-lg bg-background/60 border border-border/40 text-xs text-muted-foreground space-y-1">
                          <div className="flex items-center gap-1.5 font-medium text-foreground/80">
                            <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span>Escopo de Acesso a Planilhas:</span>
                          </div>
                          <p className="pl-5 text-muted-foreground leading-relaxed">
                            {getRoleSummaryText(role)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 pt-4 border-t border-border/20 flex items-center justify-between">
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

                        {isAdmin && !isRoleAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => handleOpenPermissionModal(role)}
                          >
                            Configurar Colunas &rarr;
                          </Button>
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

      {/* Permission Matrix Dialog */}
      <Dialog open={!!editingRole} onOpenChange={(open) => !open && setEditingRole(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col bg-card border-border/80 shadow-2xl">
          <DialogHeader className="border-b border-border/40 pb-4">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Sliders className="h-5 w-5 text-primary" />
              Configurar Matriz de Acesso: <span className="text-primary">{editingRole?.name}</span>
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Defina a quais bases de dados e a quais colunas específicas os usuários com este cargo terão acesso quando consultarem o agente inteligente.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4 space-y-6 pr-1">
            {editingRole?.name?.toLowerCase() === 'admin' ? (
              <div className="p-6 rounded-xl bg-primary/10 border border-primary/20 text-center space-y-2">
                <Lock className="h-10 w-10 text-primary mx-auto opacity-80" />
                <h4 className="font-bold text-base text-foreground">Cargo de Administração Global</h4>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  O Administrador possui acesso de leitura e escrita irrestrito a todos os datasets e colunas anexadas na organização.
                </p>
              </div>
            ) : datasets.length === 0 ? (
              <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed border-border/50">
                <Database className="h-12 w-12 mx-auto text-muted-foreground opacity-40 mb-3" />
                <h4 className="font-semibold text-foreground">Nenhuma Base de Dados Anexada</h4>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                  Você precisa importar ou anexar planilhas na aba "Bases Anexadas" para poder configurar as permissões por coluna deste cargo.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span>Bases da Organização ({datasets.length})</span>
                  <span>Marque a base e expanda para filtrar colunas</span>
                </div>

                <Accordion type="multiple" className="space-y-3">
                  {datasets.map((ds) => {
                    const isDatasetAllowed = rolePermissions.allowed_datasets.includes(ds.id);
                    const cols = getDatasetColumns(ds);
                    const allowedCols = rolePermissions.columns_access[ds.id] || [];
                    const allSelected = isDatasetAllowed && cols.length > 0 && allowedCols.length === cols.length;

                    return (
                      <div key={ds.id} className={`rounded-xl border transition-all ${isDatasetAllowed ? 'border-primary/40 bg-primary/[0.02]' : 'border-border/60 bg-card/40 opacity-75'}`}>
                        <div className="flex items-center justify-between p-4 pb-0">
                          <div className="flex items-center gap-3">
                            <Checkbox
                              id={`ds-${ds.id}`}
                              checked={isDatasetAllowed}
                              onCheckedChange={() => handleToggleDataset(ds.id)}
                            />
                            <div>
                              <Label htmlFor={`ds-${ds.id}`} className="font-bold text-base cursor-pointer hover:text-primary transition-colors">
                                {ds.name}
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                {cols.length} coluna(s) disponível(is) no dicionário semântico
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {isDatasetAllowed ? (
                              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs">
                                {allowedCols.length} de {cols.length} liberadas
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground text-xs">
                                Acesso Bloqueado
                              </Badge>
                            )}
                          </div>
                        </div>

                        <AccordionItem value={ds.id} className="border-b-0 px-4">
                          <AccordionTrigger className="py-3 text-xs text-primary hover:no-underline font-semibold">
                            {isDatasetAllowed ? "Personalizar colunas visíveis &rarr;" : "Ver colunas da base (Desativado)"}
                          </AccordionTrigger>
                          <AccordionContent className="pt-2 pb-4 border-t border-border/30 space-y-3">
                            {!isDatasetAllowed ? (
                              <p className="text-xs text-muted-foreground italic py-2">
                                Ative a caixa de seleção ao lado do nome da base ("{ds.name}") para autorizar e escolher as colunas visíveis para este cargo.
                              </p>
                            ) : (
                              <>
                                <div className="flex items-center justify-between bg-muted/40 p-2.5 rounded-lg border border-border/40">
                                  <span className="text-xs font-medium text-foreground/80">Seleção Rápida de Colunas:</span>
                                  <div className="flex gap-2">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs text-primary hover:bg-primary/10"
                                      onClick={() => handleSetAllColumns(ds.id, true)}
                                      disabled={allSelected}
                                    >
                                      Marcar Todas
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                      onClick={() => handleSetAllColumns(ds.id, false)}
                                      disabled={allowedCols.length === 0}
                                    >
                                      Desmarcar Todas
                                    </Button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 max-h-60 overflow-y-auto pr-1">
                                  {cols.map(col => {
                                    const isColChecked = allowedCols.includes(col.name);
                                    return (
                                      <div
                                        key={col.name}
                                        onClick={() => handleToggleColumn(ds.id, col.name)}
                                        className={`flex items-start gap-2.5 p-3 rounded-lg border text-left cursor-pointer transition-all ${isColChecked
                                            ? 'border-primary/30 bg-primary/5 text-foreground'
                                            : 'border-border/40 bg-background/40 text-muted-foreground opacity-60 hover:opacity-100'
                                          }`}
                                      >
                                        <Checkbox
                                          checked={isColChecked}
                                          onCheckedChange={() => handleToggleColumn(ds.id, col.name)}
                                          className="mt-0.5 pointer-events-none"
                                        />
                                        <div className="space-y-0.5 overflow-hidden">
                                          <p className="text-xs font-bold truncate leading-tight">{col.name}</p>
                                          {col.description && (
                                            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-normal">
                                              {col.description}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      </div>
                    );
                  })}
                </Accordion>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border/40 pt-4 flex flex-col sm:flex-row justify-between items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingRole(null)}
              disabled={isSavingPermissions}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            {editingRole?.name?.toLowerCase() !== 'admin' && (
              <Button
                type="button"
                onClick={handleSavePermissions}
                disabled={isSavingPermissions}
                className="w-full sm:w-auto px-6 font-semibold shadow-md"
              >
                {isSavingPermissions ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" /> Salvar Matriz de Permissões
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

