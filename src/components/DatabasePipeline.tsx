import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Database, FileSpreadsheet, Bot, CheckCircle, ArrowRight, Loader2, Code } from "lucide-react";
import * as XLSX from "xlsx";

interface DatabasePipelineProps {
  organizationId: string;
}

export default function DatabasePipeline({ organizationId }: DatabasePipelineProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(0); // 0: Upload, 1: Review Cols, 2: Semantic, 3: Refine, 4: Format
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Data States
  const [originalColumns, setOriginalColumns] = useState<string[]>([]);
  const [normalizedColumns, setNormalizedColumns] = useState<Record<string, string>>({});
  const [dataSamples, setDataSamples] = useState<any[]>([]);

  // Helpers
  const normalizeString = (str: string) => {
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove acentos
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_") // caracteres especiais viram _
      .replace(/_+/g, "_") // multiplos _ viram um só
      .replace(/^_|_$/g, ""); // remove _ do começo e fim
  };

  const [datasetId, setDatasetId] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsProcessing(true);
    setUploadError(null);

    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];

        // Converte para JSON pegando cabeçalhos na primeira linha
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        if (data.length === 0) throw new Error("Planilha vazia");

        const headers = data[0] as string[];
        const samples = data.slice(1, 6); // Pega 5 linhas de exemplo

        // Validação removida. O Plum agora formata as colunas automaticamente para snake_case (Etapa 1 Invisível).
        const normMap: Record<string, string> = {};
        headers.forEach(h => {
          normMap[h] = normalizeString(String(h));
        });

        // Mapeia colunas amostrais (para enviar pra IA depois) já com o nome normalizado
        const formattedSamples = samples.map(row => {
          const obj: any = {};
          headers.forEach((h, i) => { obj[normMap[h]] = row[i]; });
          return obj;
        });

        // 1. Verificar se existe rascunho com a MESMA Matriz de Colunas
        const { data: existingDatasets } = await supabase
          .from('datasets')
          .select('id, sketch, status')
          .eq('organization_id', organizationId)
          .eq('status', 'processing');

        let matchedDataset = null;
        if (existingDatasets) {
          matchedDataset = existingDatasets.find(d => {
            // `sketch` e jsonb, tipado como Json (uniao) -- precisa estreitar
            // antes de acessar os campos do rascunho.
            const sketch = d.sketch as { originalColumns?: string[] } | null;
            if (sketch && sketch.originalColumns) {
              return JSON.stringify(sketch.originalColumns) === JSON.stringify(headers);
            }
            return false;
          });
        }

        if (matchedDataset) {
          // Restaurar progresso
          setDatasetId(matchedDataset.id);
          setOriginalColumns(matchedDataset.sketch.originalColumns);
          setNormalizedColumns(matchedDataset.sketch.normalizedColumns);
          setDataSamples(matchedDataset.sketch.dataSamples);
          
          if (matchedDataset.sketch.formattingRules) setFormattingRules(matchedDataset.sketch.formattingRules);
          if (matchedDataset.sketch.semanticDefinitions) setSemanticDefinitions(matchedDataset.sketch.semanticDefinitions);
          if (matchedDataset.sketch.formattedDataSamples) setFormattedDataSamples(matchedDataset.sketch.formattedDataSamples);
          
          setStep(matchedDataset.sketch.step || 1);
          toast({ title: "Rascunho Encontrado!", description: "Recuperamos o seu progresso anterior automaticamente." });
        } else {
          // Criar novo registro
          const { data: newDataset, error: dbError } = await supabase
            .from('datasets')
            .insert({
              organization_id: organizationId,
              name: file.name,
              status: 'processing',
              sketch: {
                step: 1,
                originalColumns: headers,
                normalizedColumns: normMap,
                dataSamples: formattedSamples
              }
            })
            .select('id')
            .single();

          if (dbError) throw dbError;
          if (newDataset) setDatasetId(newDataset.id);

          setOriginalColumns(headers);
          setDataSamples(formattedSamples);
          setNormalizedColumns(normMap);
          setStep(1); // Vai para revisão
        }
      } catch (error: any) {
        console.error(error);
        setUploadError(error.message || "Erro desconhecido ao processar planilha.");
      } finally {
        setIsProcessing(false);
      }
    };

    reader.onerror = () => {
      setUploadError("Falha na leitura do arquivo local.");
      setIsProcessing(false);
    };

    reader.readAsBinaryString(file);
  };

  const [semanticDefinitions, setSemanticDefinitions] = useState<Record<string, string>>({});
  const [formattedDataSamples, setFormattedDataSamples] = useState<any[]>([]);
  const [formattingRules, setFormattingRules] = useState<Record<string, string>>({});

  const [formatQuery, setFormatQuery] = useState("");
  const [isFormatRefining, setIsFormatRefining] = useState(false);

  const saveSketch = async (currentStep: number, extraData: any = {}) => {
    if (!datasetId) return;
    try {
      await supabase
        .from('datasets')
        .update({
          sketch: {
            step: currentStep,
            originalColumns,
            normalizedColumns,
            dataSamples,
            formattingRules: extraData.formattingRules || formattingRules,
            semanticDefinitions: extraData.semanticDefinitions || semanticDefinitions,
            formattedDataSamples: extraData.formattedDataSamples || formattedDataSamples
          }
        })
        .eq('id', datasetId);
    } catch (err) {
      console.error("Falha ao salvar rascunho", err);
    }
  };

  const handleRefineFormat = async () => {
    if (!formatQuery.trim()) return;
    setIsFormatRefining(true);
    try {
      toast({ title: "Refinando Formatação...", description: "O Agente 3.1 está ajustando as regras conforme o seu pedido." });
      
      const formatRes = await supabase.functions.invoke('ai-agents', {
        body: { 
          action: 'refine_format', 
          prompt: formatQuery,
          columns: formattingRules,
          dataSamples: dataSamples
        }
      });

      if (formatRes.error) throw new Error(formatRes.error.message || "Erro na IA de Refinamento");

      let formatResult = formatRes.data?.result;
      if (typeof formatResult === "string") {
        try {
          const cleaned = formatResult.replace(/```json\n?|\n?```/g, "").trim();
          formatResult = JSON.parse(cleaned);
        } catch (e) {
          console.error("Falha ao analisar JSON retornado:", e);
        }
      }

      if (formatResult && (formatResult.formattedSamples || formatResult.formattingRules)) {
        const newFormattedSamples = formatResult.formattedSamples || formattedDataSamples;
        const newFormattingRules = formatResult.formattingRules || formattingRules;

        setFormattedDataSamples(newFormattedSamples);
        setFormattingRules(newFormattingRules);
        setFormatQuery(""); // Limpa o chat após sucesso
        
        // Salva rascunho
        saveSketch(2, {
          formattedDataSamples: newFormattedSamples,
          formattingRules: newFormattingRules
        });

        toast({ title: "Formatação atualizada!", description: "A IA aplicou as suas correções.", variant: "default" });
      } else {
        throw new Error("A IA não retornou um formato válido.");
      }
    } catch (error: any) {
      toast({ title: "Erro no Refinamento", description: error.message, variant: "destructive" });
    } finally {
      setIsFormatRefining(false);
    }
  };

  const handleUpdateSemantic = (col: string, desc: string) => {
    setSemanticDefinitions(prev => ({
      ...prev,
      [col]: desc
    }));
  };

  const handleFormatData = async () => {
    setIsProcessing(true);
    try {
      toast({ title: "Agente 3 operando...", description: "A IA está analisando a formatação dos dados. Isso pode levar alguns segundos." });
      
      const formatRes = await supabase.functions.invoke('ai-agents', {
        body: { 
          action: 'format_data', 
          dataSamples: dataSamples
        }
      });

      if (formatRes.error) throw new Error(formatRes.error.message || "Erro na IA de Formatação");

      const formatResult = formatRes.data.result;
      if (formatResult && formatResult.formattedSamples) {
        setFormattedDataSamples(formatResult.formattedSamples);
        setFormattingRules(formatResult.formattingRules || {});
        
        saveSketch(2, {
          formattedDataSamples: formatResult.formattedSamples,
          formattingRules: formatResult.formattingRules || {}
        });

        setStep(2); // Vai para Formatação
      } else {
        setFormattedDataSamples(dataSamples);
        setStep(2);
      }
    } catch (error: any) {
      toast({ title: "Erro na Formatação", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRefineSemantics = async () => {
    setIsProcessing(true);
    try {
      toast({ title: "Agente 2 operando...", description: "Refinando descrições para o padrão Otimizado." });
      const refineRes = await supabase.functions.invoke('ai-agents', {
        body: {
          action: 'refine_semantics',
          columns: semanticDefinitions
        }
      });
      if (refineRes.error) throw new Error(refineRes.error.message || "Erro no Agente de Refinamento");
      setSemanticDefinitions(refineRes.data.result);
      saveSketch(3, { semanticDefinitions: refineRes.data.result });
      toast({ title: "Refinamento concluído!" });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateNormalizedColumn = (original: string, newValue: string) => {
    setNormalizedColumns(prev => ({
      ...prev,
      [original]: newValue
    }));
  };

  const [supportQuery, setSupportQuery] = useState("");
  const [supportResponse, setSupportResponse] = useState("");
  const [isSupportLoading, setIsSupportLoading] = useState(false);

  const handleSupportChat = async () => {
    if (!supportQuery.trim()) return;
    setIsSupportLoading(true);
    setSupportResponse("");
    try {
      const res = await supabase.functions.invoke('ai-agents', {
        body: {
          action: 'column_support',
          prompt: supportQuery
        }
      });
      if (res.error) throw new Error(res.error.message || "Erro no Suporte");
      setSupportResponse(res.data.result);
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setIsSupportLoading(false);
    }
  };

  const handleAnalyzeSemantics = async () => {
    setIsProcessing(true);
    try {
      const finalColumns = Object.values(normalizedColumns);
      const promptText = `Quero criar uma base de dados para o chatbot com as seguintes colunas: ${finalColumns.join(', ')}`;

      // 1. Chama o Agente 0 (Guardião)
      toast({ title: "Agente 0 analisando...", description: "Verificando escopo da requisição." });
      const guardRes = await supabase.functions.invoke('ai-agents', {
        body: { action: 'guard', prompt: promptText }
      });

      if (guardRes.error) throw new Error(guardRes.error.message || "Erro no Agente Guardião");

      const guardResult = guardRes.data.result.trim();
      if (guardResult !== 'PERMITIDO') {
        throw new Error(`Operação Bloqueada pelo Guardião: O conteúdo parece fora do escopo do Plum. (${guardResult})`);
      }

      // 2. Chama o Agente 1 (Previsão Semântica)
      toast({ title: "Agente 1 operando...", description: "A IA está prevendo as definições semânticas. Isso pode levar alguns segundos." });

      const predictRes = await supabase.functions.invoke('ai-agents', {
        body: {
          action: 'predict_semantics',
          columns: finalColumns,
          dataSamples: dataSamples
        }
      });

      if (predictRes.error) throw new Error(predictRes.error.message || "Erro na IA de Semântica");

      const definitionsJSON = predictRes.data.result;
      setSemanticDefinitions(definitionsJSON);
      saveSketch(3, { semanticDefinitions: definitionsJSON });
      setStep(3);

    } catch (error: any) {
      toast({ title: "Erro na Análise", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinalizeAndSave = async () => {
    if (!organizationId || !datasetId) {
      toast({ title: "Erro", description: "Sessão inválida", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    try {
      const schemaMetadata = {
        columns: Object.values(normalizedColumns).reduce((acc: any, col) => {
          acc[col] = {
            semantic_definition: semanticDefinitions[col] || "",
            cleaning_rule: formattingRules[col] || ""
          };
          return acc;
        }, {})
      };

      const { error } = await supabase
        .from('datasets')
        .update({
          name: fileName || "Nova Planilha",
          status: "active",
          schema_metadata: schemaMetadata as any,
          sketch: null // Limpa o rascunho
        })
        .eq('id', datasetId);

      if (error) throw error;

      toast({
        title: "Planilha e Dicionário Salvos com Sucesso!",
        description: `A base "${fileName || "Nova Planilha"}" foi registrada no Supabase e está pronta para configuração de acessos por cargo.`
      });
      setStep(0);
      setFileName("");
      setOriginalColumns([]);
      setNormalizedColumns({});
      setDataSamples([]);
      setSemanticDefinitions({});
      setFormattingRules({});
    } catch (err: any) {
      toast({
        title: "Erro ao salvar no Supabase",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Stepper Header */}
      <div className="flex items-center justify-between mb-8 rounded-xl border border-border/40 bg-card/30">
        {[
          { label: "Etapa 1: Upload", icon: FileSpreadsheet },
          { label: "Etapa 2: Colunas", icon: Database },
          { label: "Etapa 3: Formatação", icon: Code },
          { label: "Etapa 4: Semântica", icon: Bot },
          { label: "Etapa 5: Finalizar", icon: CheckCircle },
        ].map((s, i, arr) => {
          const isActive = step >= i;
          return (
            <div key={i} className={`flex-1 flex flex-col items-center justify-center p-4 border-r border-border/40 last:border-0 relative ${isActive ? 'bg-primary/5 text-primary' : 'opacity-50 grayscale'}`}>
              <s.icon className={`h-6 w-6 mb-2 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-center">{s.label}</span>
              {i < arr.length - 1 && (
                <div className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 bg-background rounded-full border border-border/40 p-0.5">
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="glass p-6 rounded-2xl border border-border/30">
        {step === 0 && (
          <div className="text-center py-12 space-y-4">
            {isProcessing ? (
              <div className="py-8 flex flex-col items-center justify-center space-y-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full"></div>
                  <Loader2 className="h-20 w-20 animate-spin text-primary relative z-10" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground">Processando seus dados...</h3>
                  <p className="text-muted-foreground mt-2">Lendo as colunas e preparando o ambiente local.</p>
                </div>
              </div>
            ) : uploadError ? (
              <div className="py-8 flex flex-col items-center justify-center space-y-4">
                <div className="h-16 w-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-2">
                  <span className="font-bold text-2xl">!</span>
                </div>
                <h3 className="text-2xl font-bold text-foreground">Atenção ao Formato das Colunas</h3>
                <p className="text-muted-foreground max-w-lg mx-auto whitespace-pre-line text-sm leading-relaxed text-left bg-muted/50 p-4 rounded-xl border border-border/50">
                  {uploadError}
                </p>
                <div className="pt-4">
                  <Button onClick={() => setUploadError(null)} variant="outline" className="border-destructive/30 text-foreground hover:bg-destructive/10 hover:text-destructive">
                    Entendi, vou corrigir a planilha
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <FileSpreadsheet className="h-16 w-16 mx-auto text-primary/40 mb-4" />
                <h3 className="text-2xl font-bold">Importe sua Base de Dados</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  1) Sua planilha não ficará armazenada em nenhum servidor e não sofrerá nenhuma alteração. A inteligência artificial apenas lerá o nome das colunas e os dados das 5 primeiras linhas. <br />2) É essencial que o nome das colunas não tenham espaços ou caracteres especiais (Ex: 'Número de peças' deve ser 'numero_de_pecas')
                </p>
                <div className="pt-6">
                  <Label htmlFor="file-upload" className="cursor-pointer bg-primary text-primary-foreground px-6 py-3 rounded-full font-medium inline-flex items-center gap-2 hover:bg-primary/90 transition">
                    <ArrowRight className="h-5 w-5" />
                    Selecionar .CSV ou .XLSX
                  </Label>
                  <Input
                    id="file-upload"
                    type="file"
                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2"><Database className="h-5 w-5 text-primary" /> Revisão de Colunas</h3>
              <p className="text-sm text-muted-foreground mt-1">Cheque se todas as colunas da planilha estão aqui. Caso necessário, corrija diretamente com a IA na caixa de texto abaixo</p>
            </div>

            <div className="bg-background/50 border border-border/50 rounded-xl p-4">
              <h4 className="text-sm font-semibold mb-3">Colunas Identificadas ({originalColumns.length})</h4>
              <div className="flex flex-wrap gap-2">
                {Object.values(normalizedColumns).map((col, idx) => (
                  <div key={idx} className="bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 rounded-md font-mono text-xs font-semibold">
                    {col}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-muted/30 border border-border/40 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" /> Faltou alguma coluna?
              </h4>
              <div className="flex gap-2">
                <Input
                  value={supportQuery}
                  onChange={(e) => setSupportQuery(e.target.value)}
                  placeholder="Ex: Por que a coluna 'Lucro' não apareceu?"
                  className="bg-background"
                  onKeyDown={(e) => e.key === 'Enter' && handleSupportChat()}
                />
                <Button onClick={handleSupportChat} disabled={isSupportLoading || !supportQuery.trim()}>
                  {isSupportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Perguntar"}
                </Button>
              </div>
              {supportResponse && (
                <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm text-foreground/90 whitespace-pre-line">
                  {supportResponse}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border/30">
              <Button variant="outline" onClick={() => setStep(0)} disabled={isProcessing}>Voltar</Button>
              <Button onClick={handleFormatData} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Tudo certo! Podemos analisar a Formatação com IA <Bot className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2"><Code className="h-5 w-5 text-primary" /> Formatação de Dados (Agente 3)</h3>
              <p className="text-sm text-muted-foreground mt-1">A IA analisou as primeiras 5 linhas da sua planilha e ajustou a formatação para o padrão de banco de dados.</p>
              
              {Object.keys(formattingRules).length > 0 && (
                <div className="mt-6 space-y-3">
                  <h4 className="font-semibold text-sm">Regras Aplicadas por Coluna:</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(formattingRules).map(([colName, rule], idx) => (
                      <div key={idx} className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm">
                        <span className="font-bold text-primary font-mono block mb-1">{colName}</span>
                        <span className="text-muted-foreground leading-relaxed">{rule}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-muted-foreground uppercase">Antes (Original)</h4>
                <div className="border border-border/50 rounded-xl overflow-x-auto bg-background p-4">
                  <pre className="text-xs text-foreground/70">{JSON.stringify(dataSamples, null, 2)}</pre>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-primary uppercase">Depois (Formatado)</h4>
                <div className="border border-primary/20 rounded-xl overflow-x-auto bg-primary/5 p-4">
                  <pre className="text-xs text-primary">{JSON.stringify(formattedDataSamples, null, 2)}</pre>
                </div>
              </div>
            </div>

            <div className="bg-muted/30 border border-border/40 rounded-xl p-4 space-y-3 mt-4">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" /> A formatação não ficou legal? Peça ajustes para o Agente 3.1
              </h4>
              <div className="flex gap-2">
                <Input 
                  value={formatQuery}
                  onChange={(e) => setFormatQuery(e.target.value)}
                  placeholder="Ex: Não tire o R$ do faturamento, deixe como texto."
                  className="bg-background"
                  onKeyDown={(e) => e.key === 'Enter' && handleRefineFormat()}
                />
                <Button onClick={handleRefineFormat} disabled={isFormatRefining || !formatQuery.trim()}>
                  {isFormatRefining ? <Loader2 className="h-4 w-4 animate-spin" /> : "Corrigir Formatação"}
                </Button>
              </div>
            </div>

            <div className="mt-4 p-4 border border-border/50 rounded-xl bg-background/50">
              <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2">JSON da Formatação (Por baixo dos panos)</h4>
              <pre className="text-xs text-foreground/80 overflow-auto max-h-40">{JSON.stringify(formattingRules, null, 2)}</pre>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border/30">
              <Button variant="outline" onClick={() => setStep(1)} disabled={isProcessing}>Voltar</Button>
              <Button onClick={handleAnalyzeSemantics} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Prever Semântica com IA <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /> Definições Semânticas (Agente 1)</h3>
              <p className="text-sm text-muted-foreground mt-1">
                A IA analisou suas colunas e tentou prever o significado delas para o Chatbot.
                Edite as descrições para adicionar contexto de negócio específico (ex: "lucro não inclui impostos").
              </p>
            </div>

            <div className="border border-border/50 rounded-xl overflow-hidden bg-background max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border/50 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-3 font-medium w-1/4">Coluna</th>
                    <th className="px-6 py-3 font-medium">Definição para a Inteligência Artificial</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {Object.values(normalizedColumns).map((col, idx) => (
                    <tr key={idx} className="hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4 font-mono text-primary text-xs font-semibold align-top pt-5">{col}</td>
                      <td className="px-6 py-4">
                        <textarea
                          value={semanticDefinitions[col] || ''}
                          onChange={(e) => handleUpdateSemantic(col, e.target.value)}
                          className="w-full bg-transparent border border-border/40 rounded-md p-2 text-sm min-h-[60px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 resize-y"
                          placeholder="Ex: Representa o lucro líquido..."
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-4 border border-border/50 rounded-xl bg-background/50">
              <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2">JSON da Semântica (Por baixo dos panos)</h4>
              <pre className="text-xs text-foreground/80 overflow-auto max-h-40">{JSON.stringify(semanticDefinitions, null, 2)}</pre>
            </div>

            <div className="flex flex-col sm:flex-row justify-between gap-4 pt-4 border-t border-border/30">
              <Button variant="outline" onClick={() => setStep(2)} disabled={isProcessing}>Voltar</Button>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={handleRefineSemantics} disabled={isProcessing}>
                  {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                  Refinar Descrições (Agente 2)
                </Button>
                <Button onClick={() => setStep(4)} disabled={isProcessing}>
                  Próxima Etapa <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2"><CheckCircle className="h-5 w-5 text-primary" /> Destino e Exportação</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Revise o Metadado Final consolidado. É este o dicionário completo que será gravado no banco de dados para a Query Engine entender a sua planilha.
              </p>
            </div>

            <div className="border border-border/50 rounded-xl bg-background p-4 space-y-2">
              <h4 className="font-semibold text-sm text-primary uppercase">Esquema Final Consolidado (JSONB)</h4>
              <div className="bg-primary/5 rounded-lg p-4 max-h-[300px] overflow-auto border border-primary/10">
                <pre className="text-xs text-foreground/80">
                  {JSON.stringify({
                    columns: Object.values(normalizedColumns).reduce((acc: any, col) => {
                      acc[col] = {
                        semantic_definition: semanticDefinitions[col] || "",
                        cleaning_rule: formattingRules[col] || ""
                      };
                      return acc;
                    }, {})
                  }, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border/30">
              <Button variant="outline" onClick={() => setStep(3)} disabled={isProcessing}>Voltar</Button>
              <Button onClick={handleFinalizeAndSave} disabled={isProcessing} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar Base e Dicionário no Supabase <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
