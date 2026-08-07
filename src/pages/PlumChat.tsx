import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgAccess } from "@/hooks/use-org-access";
import { Send, Bot, User, Loader2, Database, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PlumThinkingBar } from "@/components/PlumThinkingBar";

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  assunto?: string;
  created_at: string;
}

export default function PlumChat() {
  const { session, profile } = useOrgAccess();
  const { toast } = useToast();
  
  const [datasets, setDatasets] = useState<any[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session && profile?.organization_id && profile?.role_id) {
      fetchDatasets();
      fetchHistory();
    }
  }, [session, profile]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchDatasets = async () => {
    try {
      const { data: rolePerms } = await supabase
        .from('role_permissions')
        .select('dataset_id')
        .eq('role_id', profile.role_id);
      
      const allowedIds = rolePerms?.map(rp => rp.dataset_id) || [];
      
      if (allowedIds.length === 0) return;

      const { data: dsData } = await supabase
        .from('datasets')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .eq('status', 'active')
        .in('id', allowedIds);
        
      setDatasets(dsData || []);
      if (dsData && dsData.length > 0) {
        setSelectedDatasetId(dsData[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('plum_chat')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true });
        
      if (!error && data) {
        setMessages(data as ChatMessage[]);
      }
    } catch (err) {
      console.error("Erro ao carregar histórico", err);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !selectedDatasetId) return;
    
    const userMsgContent = input.trim();
    setInput("");
    setIsProcessing(true);

    const dataset = datasets.find(d => d.id === selectedDatasetId);
    let assuntoMsg = null;

    try {
      // 1. Insert user message in DB immediately for optimistic UI
      const { data: userMsgData, error: insertErr } = await supabase
        .from('plum_chat')
        .insert({
          organization_id: profile.organization_id,
          user_id: session.user.id,
          role: 'user',
          content: userMsgContent
        })
        .select()
        .single();
        
      if (insertErr) throw insertErr;
      
      setMessages(prev => [...prev, userMsgData as ChatMessage]);

      // 2. Chama Agente Z (Guardião)
      const guardRes = await supabase.functions.invoke('ai-plum-chat', {
        body: { action: 'guard', prompt: userMsgContent, schemaMetadata: dataset.schema_metadata }
      });
      
      if (guardRes.error) throw guardRes.error;
      const guardData = guardRes.data.result;
      
      assuntoMsg = guardData.assunto;

      // Update user message with "assunto" in background
      if (assuntoMsg) {
        supabase.from('plum_chat').update({ assunto: assuntoMsg }).eq('id', userMsgData.id).then();
      }

      if (guardData.status !== "PERMITIDO") {
        await saveAndShowAssistantMsg(guardData.message || "Requisição bloqueada.");
        setIsProcessing(false);
        return;
      }

      // 3. Chama Agente A (Plan)
      const planRes = await supabase.functions.invoke('ai-plum-chat', {
        body: { action: 'plan_query', prompt: userMsgContent, schemaMetadata: dataset.schema_metadata }
      });
      if (planRes.error) throw planRes.error;
      const plan = planRes.data.result;

      // 4. Executa o plano no Pandas, via chat-execute.
      //
      // O navegador nunca fala com a AWS: quem valida o tenant, resolve as
      // colunas contra o cargo e assina o payload é a Edge Function. Aqui só
      // vai o dataset_id e o plano — e o dataset_id é candidato, não
      // declaração: `chat-execute` confere contra o JWT antes de qualquer coisa.
      const execRes = await supabase.functions.invoke('chat-execute', {
        body: { dataset_id: dataset.id, plan }
      });

      // Erro de execução não pode virar resposta inventada. O Agente C só é
      // chamado quando existe um número real para ele traduzir; sem isso, a
      // pessoa recebe o motivo.
      //
      // Em status fora do 2xx o supabase-js devolve `data: null` e guarda a
      // resposta em `error.context` — a mensagem útil ("essa coluna não é
      // visível para o seu cargo") só existe lá.
      if (execRes.error) {
        let motivo = "Não consegui calcular esse resultado agora.";
        try {
          const corpo = await (execRes.error as any).context?.json?.();
          if (corpo?.error) motivo = corpo.error;
        } catch {
          // Sem corpo legível: fica a mensagem genérica acima.
        }
        console.error("Falha no chat-execute:", execRes.error);
        await saveAndShowAssistantMsg(motivo);
        setIsProcessing(false);
        return;
      }

      const executorResult = execRes.data.result;

      // 5. Chama Agente C (Sintetizador)
      const synthRes = await supabase.functions.invoke('ai-plum-chat', {
        body: { action: 'synthesize_answer', prompt: userMsgContent, schemaMetadata: dataset.schema_metadata, executorResult }
      });
      if (synthRes.error) throw synthRes.error;
      const synthMsg = synthRes.data.result;

      await saveAndShowAssistantMsg(synthMsg);
      
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro", description: "Falha na comunicação com o PLUM.", variant: "destructive" });
      await saveAndShowAssistantMsg("Desculpe, ocorreu um erro interno ao processar sua requisição.");
    } finally {
      setIsProcessing(false);
    }
  };

  const saveAndShowAssistantMsg = async (content: string) => {
    try {
      const { data, error } = await supabase
        .from('plum_chat')
        .insert({
          organization_id: profile.organization_id,
          user_id: session.user.id,
          role: 'assistant',
          content: content
        })
        .select()
        .single();
        
      if (!error && data) {
        setMessages(prev => [...prev, data as ChatMessage]);
      }
    } catch(e) { console.error(e); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] md:h-[calc(100vh-4rem)] max-w-4xl mx-auto border border-border/40 rounded-2xl bg-card shadow-sm overflow-hidden mt-4 md:mt-8">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/40 bg-card/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center">
            <span className="font-extrabold text-primary-foreground text-lg">P</span>
          </div>
          <div>
            <h2 className="font-bold text-foreground leading-tight">Plum Chat</h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block"></span>
              Online
            </p>
          </div>
        </div>

        <div>
          <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId} disabled={isProcessing}>
            <SelectTrigger className="w-[200px] h-8 text-xs bg-background/50">
              <SelectValue placeholder="Selecione uma base" />
            </SelectTrigger>
            <SelectContent>
              {datasets.map(d => (
                <SelectItem key={d.id} value={d.id}>
                  <div className="flex items-center gap-2">
                    <Database className="h-3 w-3 text-primary" />
                    {d.name}
                  </div>
                </SelectItem>
              ))}
              {datasets.length === 0 && (
                <SelectItem value="empty" disabled>Nenhuma base liberada</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-muted/10 relative">
        {messages.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
            <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Bot className="h-8 w-8 text-primary opacity-80" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">Bem-vindo ao Plum Chat</h3>
            <p className="text-sm max-w-sm">
              Selecione uma das suas bases de dados conectadas no topo e faça qualquer pergunta corporativa.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const d = new Date(msg.created_at);
          const timeString = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const dateString = d.toLocaleDateString();

          return (
            <div key={msg.id} className={`flex w-full animate-in fade-in slide-in-from-bottom-2 duration-300 ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex flex-col gap-1 max-w-[85%] md:max-w-[70%] ${isUser ? 'items-end' : 'items-start'}`}>
                
                <div className={`px-4 py-3 rounded-2xl shadow-sm ${
                  isUser 
                    ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                    : 'bg-card border border-border/50 text-foreground rounded-tl-sm'
                }`}>
                  <div className={`text-sm ${!isUser && 'prose prose-sm prose-neutral dark:prose-invert max-w-none'}`}>
                    {msg.content}
                  </div>
                </div>

                <div className="flex items-center gap-2 px-1">
                  {msg.assunto && isUser && (
                    <span className="text-[10px] text-primary/80 font-medium bg-primary/10 px-1.5 py-0.5 rounded">
                      {msg.assunto}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {timeString} · {dateString}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        
        {isProcessing && (
          <div className="flex justify-start w-full">
            <PlumThinkingBar isProcessing={isProcessing} />
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-card border-t border-border/40">
        <div className="flex items-end gap-2 bg-background border border-border/50 rounded-2xl p-2 focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all">
          <textarea
            className="flex-1 max-h-32 min-h-[40px] resize-none bg-transparent border-0 focus:ring-0 text-sm px-2 py-2 placeholder:text-muted-foreground outline-none"
            placeholder={datasets.length === 0 ? "Você não tem acesso a nenhuma base de dados..." : "Pergunte algo aos seus dados..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            disabled={isProcessing || datasets.length === 0}
          />
          <Button 
            size="icon" 
            className="h-10 w-10 rounded-xl shrink-0" 
            disabled={!input.trim() || isProcessing || datasets.length === 0}
            onClick={handleSendMessage}
          >
            {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </div>
        <p className="text-[10px] text-center text-muted-foreground mt-2">
          A Plum pode cometer erros de interpretação. Verifique os valores retornados.
        </p>
      </div>

    </div>
  );
}
