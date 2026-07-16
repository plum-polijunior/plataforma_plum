import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import DatabasePipeline from "@/components/DatabasePipeline";
import { ShieldAlert, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function DatabasePage() {
  const [organization, setOrganization] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profileData && profileData.organization_id) {
          const { data: orgData } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', profileData.organization_id)
            .single();
          setOrganization(orgData);

          if (profileData.role_id) {
            const { data: roleData } = await supabase
              .from('roles')
              .select('name')
              .eq('id', profileData.role_id)
              .maybeSingle();

            if (roleData && roleData.name.toLowerCase() === 'admin') {
              setIsAdmin(true);
            }
          }
        }
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  if (isLoading) return <div>Carregando...</div>;

  if (!isAdmin) {
    return (
      <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500 flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 mt-0.5" />
        <div>
          <h4 className="font-semibold">Acesso Restrito</h4>
          <p className="text-sm">Você precisa ser um Admin para acessar a Base de Dados.</p>
        </div>
      </div>
    );
  }

  if (!isUnlocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center">
        <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-2">
          <Lock className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Acesso Restrito</h2>
          <p className="text-muted-foreground">Em fase de testes! Temporariamente com acesso restrito :)</p>
        </div>
        <div className="flex gap-2 max-w-sm w-full">
          <Input
            type="password"
            placeholder="Digite a senha"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && passwordInput === 'inovacao') setIsUnlocked(true);
            }}
          />
          <Button onClick={() => {
            if (passwordInput === 'inovacao') setIsUnlocked(true);
            else alert("Senha incorreta");
          }}>
            Entrar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Minha Base de Dados</h1>
        <p className="text-muted-foreground mt-1">Conecte planilhas e processe dados com Inteligência Artificial.</p>
      </div>
      {organization && <DatabasePipeline organizationId={organization.id} />}
    </div>
  );
}
