import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import DatabasePipeline from "@/components/DatabasePipeline";
import { ShieldAlert, Lock, Plus, FileSpreadsheet, Clock, ArrowRight, Activity, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function DatabasePage() {
  const [organization, setOrganization] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");

  const [datasets, setDatasets] = useState<any[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<any>(null);
  const [showPipeline, setShowPipeline] = useState(false);

  // Hook do React que executa um efeito colateral após a renderização do componente
  useEffect(() => {
    // Define uma função assíncrona para buscar os dados no Supabase
    const fetchData = async () => {
      // Inicia um bloco try para capturar eventuais erros durante as requisições
      try {
        // Busca a sessão atual de autenticação do usuário no Supabase
        const { data: { session } } = await supabase.auth.getSession();
        // Se não houver uma sessão ativa (usuário não logado), interrompe a execução da função
        if (!session) return;

        // Consulta a tabela 'profiles' no banco de dados do Supabase
        const { data: profileData } = await supabase
          // Especifica a tabela 'profiles'
          .from('profiles')
          // Seleciona todas as colunas
          .select('*')
          // Filtra onde a coluna 'id' seja igual ao ID do usuário autenticado
          .eq('id', session.user.id)
          // Espera retornar um único registro
          .single();

        // Verifica se o perfil foi encontrado e se o usuário possui uma organização associada
        if (profileData && profileData.organization_id) {
          // Consulta a tabela 'organizations' para obter os dados da empresa do usuário
          const { data: orgData } = await supabase
            // Especifica a tabela 'organizations'
            .from('organizations')
            // Seleciona todas as colunas
            .select('*')
            // Filtra pelo ID da organização encontrado no perfil do usuário
            .eq('id', profileData.organization_id)
            // Espera retornar um único registro
            .single();
          // Salva os dados da organização no estado local 'organization'
          setOrganization(orgData);

          // Verifica se o perfil possui um ID de cargo (role_id) atribuído
          if (profileData.role_id) {
            // Consulta a tabela 'roles' para obter o nome do cargo do usuário
            const { data: roleData } = await supabase
              // Especifica a tabela 'roles'
              .from('roles')
              // Seleciona apenas a coluna 'name'
              .select('name')
              // Filtra pelo ID do cargo (role_id) do perfil
              .eq('id', profileData.role_id)
              // Retorna o registro se existir, ou null se não encontrar (sem lançar erro)
              .maybeSingle();

            // Verifica se encontrou o cargo e se o nome dele é 'admin' (convertendo para minúsculas)
            if (roleData && roleData.name.toLowerCase() === 'admin') {
              // Atualiza o estado 'isAdmin' para true se for um administrador
              setIsAdmin(true);
            }
          }

          // Comentário original: Busca as bases de dados (datasets)
          // Consulta a tabela 'datasets' no Supabase
          const { data: dsets } = await supabase
            // Especifica a tabela 'datasets'
            .from('datasets')
            // Seleciona todas as colunas
            .select('*')
            // Filtra os conjuntos de dados pertencentes à organização do usuário
            .eq('organization_id', profileData.organization_id)
            // Ordena os registros pela data de criação em ordem decrescente (mais recentes primeiro)
            .order('created_at', { ascending: false });

          // Se encontrar datasets no banco, atualiza o estado local 'datasets' com a lista recebida
          if (dsets) setDatasets(dsets);
        }
      // Bloco que captura qualquer erro que ocorra dentro do bloco try
      } catch (error) {
        // Exibe o erro no console do navegador para depuração
        console.error(error);
      // Bloco que sempre será executado ao final, ocorrendo erro ou não
      } finally {
        // Define o estado de carregamento como falso para liberar a exibição da interface
        setIsLoading(false);
      }
    };
    // Executa a função assíncrona criada acima
    fetchData();
  // Array de dependências: recarrega os dados quando o estado 'showPipeline' mudar
  }, [showPipeline]);

  if (isLoading) return <div>Carregando...</div>;

  if (!isAdmin) {
    return (
      <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500 flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 mt-0.5" />
        <div>
          <h4 className="font-semibold">Acesso Restrito</h4>
          <p className="text-sm">Você precisa ser um Admin para acessar as Bases de Dados.</p>
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

  if (showPipeline) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => setShowPipeline(false)} className="mb-4">
          ← Voltar para Minhas Bases de Dados
        </Button>
        {organization && <DatabasePipeline organizationId={organization.id} />}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Bases de Dados</h1>
          <p className="text-muted-foreground mt-1">Gerencie suas planilhas conectadas e os schemas extraídos pela IA.</p>
        </div>
        <Button onClick={() => { setSelectedDataset(null); setShowPipeline(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Conectar Nova Planilha
        </Button>
      </div>

      {datasets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border/50 rounded-xl bg-background/50">
          <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-foreground">Nenhuma base conectada</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-6">Conecte sua primeira planilha para o Chatbot aprender sobre seus dados.</p>
          <Button onClick={() => setShowPipeline(true)} variant="outline">
            Começar agora
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {datasets.map((dataset) => (
            <div
              key={dataset.id}
              className={`p-5 rounded-xl border cursor-pointer transition-all hover:border-primary/50 hover:bg-muted/20 ${selectedDataset?.id === dataset.id ? 'border-primary ring-1 ring-primary/20 bg-primary/5' : 'border-border/50 bg-background'}`}
              onClick={() => setSelectedDataset(selectedDataset?.id === dataset.id ? null : dataset)}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                </div>
                <div className={`text-xs px-2 py-1 rounded-full font-medium ${dataset.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>
                  {dataset.status === 'active' ? 'Concluído' : 'Rascunho'}
                </div>
              </div>
              <h3 className="font-semibold text-lg text-foreground truncate" title={dataset.name}>{dataset.name}</h3>
              <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(dataset.created_at).toLocaleDateString()}</span>
                {dataset.schema_metadata && (
                  <span className="flex items-center gap-1"><Activity className="h-3 w-3" /> {Object.keys(dataset.schema_metadata.columns || {}).length} Colunas</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedDataset && (
        <div className="mt-8 border border-border/50 rounded-xl bg-background overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="p-6 border-b border-border/50 bg-muted/20 flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" /> {selectedDataset.name}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedDataset.status === 'active' ? 'Esquema ativo e pronto para consultas do Chatbot.' : 'O processamento desta planilha ainda não foi finalizado.'}
              </p>
            </div>
            <Button onClick={() => setShowPipeline(true)} variant={selectedDataset.status === 'active' ? 'outline' : 'default'}>
              {selectedDataset.status === 'active' ? 'Editar Esquema' : 'Continuar Rascunho'} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <div className="p-6">
            {selectedDataset.schema_metadata && selectedDataset.schema_metadata.columns ? (
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase">Dicionário Semântico Extraído</h4>
                <div className="grid grid-cols-1 gap-3">
                  {Object.entries(selectedDataset.schema_metadata.columns).map(([colName, colData]: [string, any]) => (
                    <div key={colName} className="p-4 rounded-lg border border-border/50 bg-background flex flex-col md:flex-row gap-4">
                      <div className="md:w-1/4">
                        <span className="font-mono text-sm font-bold text-primary">{colName}</span>
                      </div>
                      <div className="md:w-3/4 space-y-2 text-sm">
                        <div>
                          <span className="text-xs text-muted-foreground font-semibold uppercase block mb-1">Contexto (Agente 2)</span>
                          <span className="text-foreground/90">{colData.semantic_definition || 'Não definido'}</span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground font-semibold uppercase block mb-1">Regra de Formatação (Agente 3)</span>
                          <span className="text-foreground/70">{colData.cleaning_rule || 'Não definida'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <p>O Dicionário final ainda não foi gerado.</p>
                <p className="text-sm">Clique em "Continuar Rascunho" para finalizar o pipeline.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
