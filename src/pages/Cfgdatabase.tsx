import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import DatabasePipeline from "@/components/DatabasePipeline";
import { ShieldAlert, Lock, Plus, FileSpreadsheet, Clock, ArrowRight, Activity, Calendar, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { colunaNova } from "@/lib/dicionario";
import {
  ehLinkPublicado,
  extrairSheetRef,
  ERRO_LINK_INVALIDO,
  ERRO_LINK_PUBLICADO,
} from "@/lib/google-sheets";

export default function DatabasePage() {
  const { toast } = useToast();
  const [organization, setOrganization] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [datasets, setDatasets] = useState<any[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<any>(null);
  const [showPipeline, setShowPipeline] = useState(false);
  const [isEditingSchema, setIsEditingSchema] = useState(false);
  const [editSheetUrl, setEditSheetUrl] = useState("");
  const [refinePrompt, setRefinePrompt] = useState("");
  const [refineContextPrompt, setRefineContextPrompt] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [editedSchema, setEditedSchema] = useState<any>(null);
  const [isSavingSchema, setIsSavingSchema] = useState(false);

  /**
   * ⭐ A base que o cadastro mandou abrir (B21), esperando o refetch.
   *
   * ⚠️ Não dá para selecioná-la direto de `datasets`: a lista em memória pode
   * ser anterior à base que se quer abrir. Guardar o id e resolver **depois** do
   * `fetchData` — que o próprio `setShowPipeline(false)` dispara — é o que faz
   * isso funcionar também logo após finalizar um cadastro.
   *
   * ⚠️ **`useRef`, não `useState`, e é de propósito.** Como estado ele teria de
   * entrar nas dependências do efeito de busca, e limpá-lo no fim do próprio
   * efeito dispararia uma segunda busca — recarregar a lista inteira só para
   * anunciar que o pedido foi atendido. Ele é um recado de mão única, não algo
   * que a tela renderiza.
   */
  const idParaAbrir = useRef<string | null>(null);

  /**
   * ⭐ **O diff entre a planilha de hoje e o dicionário gravado** (B22, C13/C15).
   *
   * `null` enquanto ninguém releu. Depois de reler, é o que a tela mostra e o
   * que o "Aplicar" consome — o mesmo objeto, para não haver chance de a tela
   * exibir um diff e o botão aplicar outro.
   */
  const [diff, setDiff] = useState<{
    novas: string[];
    sumiram: string[];
    iguais: string[];
    colisoes: Record<string, string[]>;
    semTitulo: number;
    aba: string;
  } | null>(null);
  const [relendo, setRelendo] = useState(false);
  const [aplicando, setAplicando] = useState(false);

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

          // ⭐ B21: o cadastro recusou uma planilha já cadastrada e pediu para
          // abrir a base existente. Só agora ela existe na lista.
          if (idParaAbrir.current && dsets) {
            const alvo = dsets.find((d) => d.id === idParaAbrir.current);
            if (alvo) {
              setSelectedDataset(alvo);
              setEditSheetUrl(alvo.google_sheet_url || alvo.google_sheet_id || "");
              setEditedSchema(
                alvo.schema_metadata ? JSON.parse(JSON.stringify(alvo.schema_metadata)) : null,
              );
              setIsEditingSchema(true);
            }
            idParaAbrir.current = null;
          }
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

  /** O cargo Admin da organização — comparado por nome, case-insensitive. */
  const idDoCargoAdmin = async (): Promise<string | null> => {
    const { data } = await supabase
      .from('roles')
      .select('id')
      .eq('organization_id', organization.id)
      .ilike('name', 'admin')
      .maybeSingle();
    return data?.id ?? null;
  };

  /**
   * ⭐⭐ **Reler a planilha e comparar com o dicionário gravado** (B22).
   *
   * Fecha a **C15** — *"mudar ou acrescentar uma coluna no Sheets obriga a
   * refazer o cadastro inteiro"* — e, por tabela, a **C13**: recadastrar era a
   * única saída, e recadastrar cria uuid novo, o que leva junto os cards do
   * dashboard e a matriz de permissões por CASCADE. Aqui o `id` do dataset é
   * preservado, porque isto é um `update`. É o ponto do bloco inteiro.
   *
   * ⛔ **NÃO é a edição manual de nome de coluna que o V3 propôs.** O nome
   * normalizado é contrato com três lados — as chaves do `schema_metadata`, os
   * valores de `role_permissions.allowed_columns` e o cabeçalho real, que o
   * executor normaliza na leitura. Digitá-lo à mão quebra os três de uma vez, e
   * a falha é muda: "coluna não encontrada". O que se quer é **reconciliar com
   * a planilha**, e é a planilha que tem a resposta.
   *
   * Nenhuma célula de dado é lida: a Edge Function busca só a linha 1.
   */
  const handleReler = async () => {
    if (!selectedDataset) return;
    setRelendo(true);
    try {
      const res = await supabase.functions.invoke('ai-plum-chat', {
        body: { action: 'cabecalhos_da_planilha', datasetId: selectedDataset.id },
      });

      if (res.error || res.data?.status !== 'ok') {
        // ⚠️ A frase vem do executor e é acionável ("a planilha não foi
        // compartilhada com o Plum"). Trocá-la por uma genérica aqui apagaria a
        // única informação que resolve o problema.
        toast({
          title: "Não consegui ler a planilha",
          description: res.data?.mensagem || res.error?.message || "Tente novamente em instantes.",
          variant: "destructive",
        });
        return;
      }

      const colunas = (res.data.colunas ?? []) as { original: string; nome: string }[];
      const naPlanilha = colunas.map((c) => c.nome);
      const noDicionario = Object.keys(selectedDataset.schema_metadata?.columns ?? {});

      setDiff({
        novas: naPlanilha.filter((n) => !noDicionario.includes(n)),
        sumiram: noDicionario.filter((n) => !naPlanilha.includes(n)),
        iguais: noDicionario.filter((n) => naPlanilha.includes(n)),
        colisoes: (res.data.colisoes ?? {}) as Record<string, string[]>,
        semTitulo: Number(res.data.colunas_sem_titulo ?? 0),
        aba: String(res.data.aba ?? ""),
      });
    } finally {
      setRelendo(false);
    }
  };

  /**
   * Aplica a reconciliação. ⚠️ **A ORDEM DOS DOIS UPDATES É A DEFESA.**
   *
   * O cliente Supabase não tem transação, e são duas tabelas: o
   * `schema_metadata` e o `allowed_columns` de todos os cargos. Como não dá para
   * torná-los atômicos, escolhe-se o lado seguro de falhar:
   *
   *   1. tira a coluna do `allowed_columns` — falhar aqui não muda nada;
   *   2. grava o `schema_metadata` novo.
   *
   * ⛔ **Na ordem inversa, uma falha no meio produz a C12** — a matriz de
   * permissões citando coluna que o dicionário não tem mais, que é silenciosa e
   * envelhece até alguém pedir aquela coluna. Nesta ordem, a falha no meio deixa
   * a coluna no dicionário e fora da permissão: aparece na matriz, e refazer
   * resolve.
   */
  const handleAplicarReconciliacao = async () => {
    if (!selectedDataset || !diff || !organization) return;
    setAplicando(true);
    try {
      const atual = selectedDataset.schema_metadata ?? {};
      const colunasAtuais = (atual.columns ?? {}) as Record<string, unknown>;

      const columns: Record<string, unknown> = {};
      // ⭐ As iguais passam INTOCADAS — definição semântica, papel analítico e
      // vocabulário sobrevivem. É o que separa isto de recadastrar.
      for (const nome of diff.iguais) columns[nome] = colunasAtuais[nome];
      for (const nome of diff.novas) columns[nome] = colunaNova();

      const novoSchema = {
        ...atual,
        // ⛔ **A `versao` é preservada, nunca promovida.** `conferido = versao >= 2`
        // afirma que uma pessoa conferiu papel e grão de CADA coluna, e a
        // reconciliação não pergunta nada disso. Promover faria o A3 parar de
        // declarar presunção sobre conceitos que ninguém leu.
        versao: atual.versao ?? 1,
        columns,
      };

      // ── 1 · o `allowed_columns` primeiro ──────────────────────────────────
      const { data: permissoes, error: erroLendo } = await supabase
        .from('role_permissions')
        .select('id, role_id, allowed_columns')
        .eq('dataset_id', selectedDataset.id);
      if (erroLendo) throw erroLendo;

      const adminId = await idDoCargoAdmin();

      for (const p of permissoes ?? []) {
        const antes: string[] = p.allowed_columns ?? [];
        // ⭐ Coluna nova vai SÓ para o Admin. Permissão é sempre explícita
        // (CLAUDE.md §3) — liberar para todo cargo daria acesso que ninguém
        // concedeu. E o Admin precisa porque ele nunca aparece no formulário de
        // permissões do `Dashboard.tsx`, que assume acesso irrestrito para ele.
        const ganha = p.role_id === adminId ? diff.novas : [];
        const depois = [...antes.filter((c) => !diff.sumiram.includes(c)), ...ganha]
          .filter((c, i, todas) => todas.indexOf(c) === i);

        const igual = depois.length === antes.length && depois.every((c, i) => c === antes[i]);
        if (igual) continue;

        const { error } = await supabase
          .from('role_permissions')
          .update({ allowed_columns: depois })
          .eq('id', p.id);
        if (error) throw error;
      }

      // ── 2 · e só então o dicionário ───────────────────────────────────────
      const { error: erroSchema } = await supabase
        .from('datasets')
        .update({ schema_metadata: novoSchema })
        .eq('id', selectedDataset.id);
      if (erroSchema) throw erroSchema;

      const atualizado = { ...selectedDataset, schema_metadata: novoSchema };
      setSelectedDataset(atualizado);
      setEditedSchema(JSON.parse(JSON.stringify(novoSchema)));
      // ⚠️ A lista só recarrega quando `showPipeline` muda — atualizar à mão,
      // senão o card continua mostrando a contagem de colunas antiga.
      setDatasets((antes) => antes.map((d) => (d.id === atualizado.id ? atualizado : d)));
      setDiff(null);

      toast({
        title: "Esquema reconciliado",
        description:
          `${diff.novas.length} coluna(s) acrescentada(s), ${diff.sumiram.length} removida(s). ` +
          "Os cards e as permissões desta base continuam valendo.",
      });
    } catch (e) {
      toast({
        title: "Não consegui aplicar",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setAplicando(false);
    }
  };

  const handleDeleteDataset = async (id: string) => {
    if (!window.confirm("Atenção: Tem certeza que deseja excluir permanentemente esta base de dados? Esta ação não pode ser desfeita.")) {
      return;
    }
    
    setIsLoading(true);
    try {
      const { error } = await supabase.from('datasets').delete().eq('id', id);
      if (error) throw error;
      
      setDatasets(datasets.filter(d => d.id !== id));
      setSelectedDataset(null);
      alert("Base de dados excluída com sucesso!");
    } catch (error: any) {
      console.error(error);
      alert("Erro ao excluir base de dados: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

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



  if (showPipeline) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => setShowPipeline(false)} className="mb-4">
          ← Voltar para Minhas Bases de Dados
        </Button>
        {organization && (
          <DatabasePipeline
            organizationId={organization.id}
            // ⭐ B21. Sair do cadastro e cair já dentro de "Editar Esquema" da
            // base que existe — é lá que fica o "Reler a planilha", que é o que
            // a pessoa queria fazer quando recolou o link.
            onAbrirBase={(id) => { idParaAbrir.current = id; setShowPipeline(false); }}
          />
        )}
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
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-xl bg-background/50">
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
              className={`p-5 rounded-xl border cursor-pointer transition-all hover:border-primary/50 hover:bg-muted/20 ${selectedDataset?.id === dataset.id ? 'border-primary ring-1 ring-primary/20 bg-primary/5' : 'border-border bg-background'}`}
              onClick={() => {
                setSelectedDataset(selectedDataset?.id === dataset.id ? null : dataset);
                // ⛔ O diff pertence a UMA base. Sem esta linha, reler a base A,
                // clicar na base B e apertar "Aplicar" gravaria as colunas de A
                // no dicionário de B — e nada na tela denunciaria.
                setDiff(null);
                setIsEditingSchema(false);
                setEditSheetUrl(dataset.google_sheet_url || dataset.google_sheet_id || "");
                setEditedSchema(dataset.schema_metadata ? JSON.parse(JSON.stringify(dataset.schema_metadata)) : null);
              }}
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
        <div className="mt-8 border border-border rounded-xl bg-background overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="p-6 border-b border-border bg-muted/20 flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" /> {selectedDataset.name}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedDataset.status === 'active' ? 'Esquema ativo e pronto para consultas do Chatbot.' : 'O processamento desta planilha ainda não foi finalizado.'}
              </p>
            </div>
            <Button 
              onClick={() => {
                if (selectedDataset.status === 'active') {
                  setIsEditingSchema(!isEditingSchema);
                  setDiff(null);
                  setEditSheetUrl(selectedDataset.google_sheet_url || selectedDataset.google_sheet_id || "");
                  setEditedSchema(selectedDataset.schema_metadata ? JSON.parse(JSON.stringify(selectedDataset.schema_metadata)) : null);
                } else {
                  setShowPipeline(true);
                }
              }} 
              variant={selectedDataset.status === 'active' ? (isEditingSchema ? 'secondary' : 'outline') : 'default'}
            >
              {selectedDataset.status === 'active' ? (isEditingSchema ? 'Cancelar Edição' : 'Editar Esquema') : 'Continuar Rascunho'} 
              {!isEditingSchema && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
            <Button
              variant="destructive"
              className="ml-2"
              onClick={() => handleDeleteDataset(selectedDataset.id)}
              title="Excluir base de dados permanentemente"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="p-6">
            {selectedDataset.status === 'active' && isEditingSchema && editedSchema ? (
              <div className="space-y-8">
                
                {/* 1. Conexão */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-foreground">Conexão do Google Sheets</h4>
                  <p className="text-xs text-muted-foreground">Atualize o link da planilha. Não esqueça de compartilhar com o email oficial <strong>plum-polijunior@plataforma-plum.iam.gserviceaccount.com</strong> como Leitor.</p>
                  <div className="flex gap-2">
                    <Input 
                      value={editSheetUrl} 
                      onChange={(e) => setEditSheetUrl(e.target.value)} 
                      placeholder="https://docs.google.com/spreadsheets/d/[ID_DA_SUA_PLANILHA]"
                    />
                    <Button onClick={async () => {
                      // Mesma regra do onboarding: o ID é a verdade, a URL é
                      // só para exibir. Recusar aqui evita gravar uma base que
                      // vai falhar depois, na hora que alguém abrir o card.
                      //
                      // O `gid` (qual aba) vem no mesmo passo. Esta tela é
                      // também o conserto de bases antigas: recolar a URL com a
                      // aba certa aberta passa a corrigir a aba, coisa que
                      // antes era impossível pela interface.
                      const ref = extrairSheetRef(editSheetUrl);
                      if (!ref) {
                        alert(ehLinkPublicado(editSheetUrl) ? ERRO_LINK_PUBLICADO : ERRO_LINK_INVALIDO);
                        return;
                      }

                      // ⭐ **A segunda porta da base duplicada** (B21).
                      //
                      // O cadastro passou a recusar planilha já cadastrada, mas
                      // esta tela apontava uma base ativa para o sheet+aba de
                      // OUTRA base sem conferir nada — e o resultado é pior que
                      // duplicar: duas bases com dicionários diferentes lendo a
                      // mesma aba, e cada card respondendo pelo dicionário que
                      // por acaso for consultado.
                      let jaExiste = supabase
                        .from('datasets')
                        .select('id, name')
                        .eq('organization_id', organization.id)
                        .eq('google_sheet_id', ref.id)
                        .neq('id', selectedDataset.id);
                      // ⚠️ `.eq(col, null)` não casa NULL no PostgREST, e
                      // `gid = 0` é a primeira aba — desvio por `=== null`.
                      jaExiste = ref.gid === null
                        ? jaExiste.is('google_sheet_gid', null)
                        : jaExiste.eq('google_sheet_gid', ref.gid);

                      const { data: conflito } = await jaExiste;
                      if (conflito?.length) {
                        alert(
                          `Essa aba já é a base "${conflito[0].name}". ` +
                          "Duas bases lendo a mesma aba se contradizem, porque cada " +
                          "uma tem o seu próprio dicionário. Abra aquela base, ou " +
                          "aponte esta para outra aba.",
                        );
                        return;
                      }

                      const { error } = await supabase
                        .from('datasets')
                        .update({
                          google_sheet_id: ref.id,
                          google_sheet_url: editSheetUrl,
                          google_sheet_gid: ref.gid,
                        })
                        .eq('id', selectedDataset.id);
                      if (!error) {
                        alert("Planilha atualizada com sucesso!");
                        setSelectedDataset({
                          ...selectedDataset,
                          google_sheet_id: ref.id,
                          google_sheet_url: editSheetUrl,
                          google_sheet_gid: ref.gid,
                        });
                      } else {
                        alert("Não consegui salvar: " + error.message);
                      }
                    }}>Salvar URL</Button>
                  </div>
                </div>

                {/*
                  ⭐⭐ 1-bis. RELER A PLANILHA (B22) — a C13 e a C15.

                  Fica logo abaixo da conexão de propósito: é a mesma pergunta
                  ("esta base ainda corresponde à planilha?"), e quem acabou de
                  corrigir a aba costuma querer reler em seguida.
                */}
                <div className="space-y-3 border-t border-border pt-6">
                  <h4 className="font-semibold text-foreground">Reler a planilha</h4>
                  <p className="text-xs text-muted-foreground">
                    Compara o cabeçalho de hoje com o dicionário desta base. Serve para quando
                    você acrescentou ou tirou uma coluna no Google Sheets — sem recadastrar,
                    então os cards do dashboard e as permissões dos cargos continuam valendo.
                    Nenhum dado é lido, só a primeira linha.
                  </p>

                  <Button variant="outline" onClick={handleReler} disabled={relendo} className="gap-2">
                    {relendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Reler a planilha
                  </Button>

                  {diff && (
                    <div className="space-y-3 rounded-xl border border-border p-4 bg-background/50">
                      <p className="text-xs text-muted-foreground">
                        Aba lida: <strong>{diff.aba}</strong>
                      </p>

                      {/*
                        ⛔ Colisão TRAVA, igual ao passo 1 do cadastro (C11).
                        Aplicar com dois cabeçalhos que normalizam para o mesmo
                        nome faria a base perder uma coluna em silêncio — o furo
                        que o B13 fechou, reaberto por outra porta.
                      */}
                      {Object.keys(diff.colisoes).length > 0 ? (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                          <p className="text-sm font-semibold text-destructive">
                            Duas colunas com o mesmo nome interno
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Renomeie uma delas na planilha e releia. Seguir assim faria esta base
                            perder uma coluna sem avisar.
                          </p>
                          <ul className="text-xs font-mono space-y-1">
                            {Object.entries(diff.colisoes).map(([nome, originais]) => (
                              <li key={nome}>
                                <span className="text-destructive">{nome}</span>
                                {" ← "}
                                {originais.map((o) => `"${o}"`).join(" e ")}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                            <div>
                              <p className="font-semibold text-foreground mb-1">
                                Novas ({diff.novas.length})
                              </p>
                              {diff.novas.length === 0 ? (
                                <p className="text-muted-foreground">nenhuma</p>
                              ) : (
                                <ul className="font-mono space-y-0.5 text-primary">
                                  {diff.novas.map((n) => <li key={n}>+ {n}</li>)}
                                </ul>
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-foreground mb-1">
                                Sumiram ({diff.sumiram.length})
                              </p>
                              {diff.sumiram.length === 0 ? (
                                <p className="text-muted-foreground">nenhuma</p>
                              ) : (
                                <ul className="font-mono space-y-0.5 text-destructive line-through">
                                  {diff.sumiram.map((n) => <li key={n}>{n}</li>)}
                                </ul>
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-foreground mb-1">
                                Iguais ({diff.iguais.length})
                              </p>
                              <p className="text-muted-foreground">
                                Intocadas: a descrição, o papel e o vocabulário delas ficam
                                exatamente como estão.
                              </p>
                            </div>
                          </div>

                          {diff.semTitulo > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {diff.semTitulo} coluna(s) sem título na planilha foram ignoradas —
                              sem cabeçalho não há nome pelo qual pedir a coluna.
                            </p>
                          )}

                          {diff.sumiram.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              ⚠️ As colunas que sumiram saem também da permissão de todos os
                              cargos. Card que dependa de uma delas para de responder.
                            </p>
                          )}

                          {diff.novas.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              As colunas novas entram <strong>sem descrição</strong>. Escreva o que
                              cada uma significa no bloco abaixo — sem isso o chat sabe que a
                              coluna existe, mas não o que ela quer dizer.
                            </p>
                          )}

                          <div className="flex gap-2 pt-1">
                            <Button
                              onClick={handleAplicarReconciliacao}
                              disabled={aplicando || (diff.novas.length === 0 && diff.sumiram.length === 0)}
                              className="gap-2"
                            >
                              {aplicando && <Loader2 className="h-4 w-4 animate-spin" />}
                              {diff.novas.length === 0 && diff.sumiram.length === 0
                                ? "Nada a reconciliar"
                                : "Aplicar ao dicionário"}
                            </Button>
                            <Button variant="ghost" onClick={() => setDiff(null)}>
                              Descartar
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Refinar Contexto */}
                <div className="space-y-4 border-t border-border pt-6">
                  <h4 className="font-semibold text-foreground">Refinar Contexto Semântico (Agente 2)</h4>
                  <p className="text-xs text-muted-foreground">Edite manualmente o que a IA entende por cada coluna, ou peça ajuda do agente abaixo.</p>
                  
                  <div className="flex flex-col gap-3 max-h-80 overflow-y-auto pr-2 border border-border p-3 rounded-xl bg-background/50">
                    {Object.entries(editedSchema.columns).map(([colName, colData]: [string, any]) => (
                      <div key={colName} className="flex flex-col gap-1">
                        <label className="text-xs font-bold font-mono text-primary">{colName}</label>
                        <textarea
                          className="w-full text-sm p-2 rounded-md border border-border bg-background resize-y min-h-[60px]"
                          value={colData.semantic_definition || ''}
                          onChange={(e) => {
                            const updated = { ...editedSchema };
                            updated.columns[colName].semantic_definition = e.target.value;
                            setEditedSchema(updated);
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 justify-between">
                    <div className="flex gap-2 flex-1">
                      <Input 
                        value={refineContextPrompt} 
                        onChange={(e) => setRefineContextPrompt(e.target.value)} 
                        placeholder="Ordem para o Agente 2 (Opcional)"
                      />
                      <Button variant="secondary" disabled={isRefining || !refineContextPrompt.trim()} onClick={async () => {
                        setIsRefining(true);
                        try {
                          const currentDefs = Object.entries(editedSchema.columns).reduce((acc: any, [k, v]: [string, any]) => {
                            acc[k] = v.semantic_definition;
                            return acc;
                          }, {});
                          
                          const res = await supabase.functions.invoke('ai-agents', {
                            body: { action: 'refine_semantics', columns: currentDefs, dataSamples: [] }
                          });
                          
                          if (res.error) throw res.error;
                          
                          const newDefs = res.data.result;
                          const updatedSchema = { ...editedSchema };
                          Object.keys(newDefs).forEach(col => {
                            if (updatedSchema.columns[col]) {
                              updatedSchema.columns[col].semantic_definition = newDefs[col];
                            }
                          });
                          setEditedSchema(updatedSchema);
                          setRefineContextPrompt("");
                          alert("Contexto refinado pela IA! Revise antes de salvar.");
                        } catch (err) {
                          alert("Erro ao refinar contexto.");
                          console.error(err);
                        } finally {
                          setIsRefining(false);
                        }
                      }}>
                        {isRefining ? "Processando..." : "Agente 2"}
                      </Button>
                    </div>

                    <Button 
                      disabled={isSavingSchema}
                      onClick={async () => {
                        setIsSavingSchema(true);
                        try {
                          const { error } = await supabase.from('datasets').update({ schema_metadata: editedSchema }).eq('id', selectedDataset.id);
                          if (error) throw error;
                          setSelectedDataset({...selectedDataset, schema_metadata: editedSchema});
                          alert("Esquema salvo com sucesso!");
                        } catch(e) { console.error(e); } finally { setIsSavingSchema(false); }
                      }}
                    >
                      Salvar Contexto
                    </Button>
                  </div>
                </div>

                {/* 3. Refinar Formatação */}
                <div className="space-y-4 border-t border-border pt-6">
                  <h4 className="font-semibold text-foreground">Refinar Formatação (Agente 3.1)</h4>
                  <p className="text-xs text-muted-foreground">Visualize as regras de formatação atuais. Dê uma ordem em linguagem natural para que o Agente ajuste as regras em massa.</p>
                  
                  <div className="flex flex-col gap-3 max-h-60 overflow-y-auto pr-2 border border-border p-3 rounded-xl bg-background/50">
                    {Object.entries(editedSchema.columns).map(([colName, colData]: [string, any]) => (
                      <div key={colName} className="flex gap-4 p-2 bg-muted/10 rounded-md border border-border">
                        <span className="text-xs font-bold font-mono text-primary w-1/4 truncate">{colName}</span>
                        <span className="text-xs text-muted-foreground flex-1 break-words">{colData.formatting_rule?.explicacao || 'Sem regra'}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Input
                      value={refinePrompt}
                      onChange={(e) => setRefinePrompt(e.target.value)}
                      placeholder="Ex: Formate a coluna data_venda para o padrão PT-BR"
                    />
                    <Button disabled={isRefining || !refinePrompt.trim()} onClick={async () => {
                      setIsRefining(true);
                      try {
                        const currentRules = Object.entries(selectedDataset.schema_metadata.columns).reduce((acc: any, [k, v]: [string, any]) => {
                          acc[k] = v.formatting_rule;
                          return acc;
                        }, {});

                        const res = await supabase.functions.invoke('ai-agents', {
                          body: { action: 'refine_format', prompt: refinePrompt, columns: currentRules, dataSamples: [] }
                        });

                        if (res.error) throw res.error;

                        let resultado = res.data?.result;
                        if (typeof resultado === "string") {
                          const limpo = resultado.replace(/```json\n?|\n?```/g, "").trim();
                          resultado = JSON.parse(limpo);
                        }

                        const newRules = resultado?.formattingRules;
                        if (!newRules) throw new Error("A IA nao retornou um formato valido.");
                        const newSchema = { ...selectedDataset.schema_metadata };
                        Object.keys(newRules).forEach(col => {
                          if (newSchema.columns[col]) {
                            newSchema.columns[col].formatting_rule = newRules[col];
                          }
                        });

                        await supabase.from('datasets').update({ schema_metadata: newSchema }).eq('id', selectedDataset.id);
                        setSelectedDataset({...selectedDataset, schema_metadata: newSchema});
                        setEditedSchema(newSchema);
                        setRefinePrompt("");
                        alert("Regras refinadas com sucesso pela IA!");
                      } catch (err) {
                        alert("Erro ao refinar");
                        console.error(err);
                      } finally {
                        setIsRefining(false);
                      }
                    }}>
                      {isRefining ? "Refinando..." : "Agente: Aplicar Ordem"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : selectedDataset.schema_metadata && selectedDataset.schema_metadata.columns ? (
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase">Dicionário Semântico Extraído</h4>
                <div className="grid grid-cols-1 gap-3">
                  {Object.entries(selectedDataset.schema_metadata.columns).map(([colName, colData]: [string, any]) => (
                    <div key={colName} className="p-4 rounded-lg border border-border bg-background flex flex-col md:flex-row gap-4">
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
                          <span className="text-foreground/70">{colData.formatting_rule?.explicacao || 'Não definida'}</span>
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
