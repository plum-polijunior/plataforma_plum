import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgAccess } from "@/hooks/use-org-access";
import { ArrowUp, Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PlumThinkingBar } from "@/components/PlumThinkingBar";
import { RespostaMarkdown } from "@/components/RespostaMarkdown";
import { MASCOTE_PINGPONG, MascoteAnimado } from "@/components/sections/MascoteAnimado";
import {
  REPETICOES_PARA_REUSAR,
  escolherPlanoDominante,
  planoTemData,
} from "@/lib/plano-cache";

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export default function PlumChat() {
  const { session, organizationId, roleId } = useOrgAccess();
  const { toast } = useToast();
  
  const [datasets, setDatasets] = useState<any[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session && organizationId && roleId) {
      fetchDatasets();
      fetchHistory();
    }
  }, [session, organizationId, roleId]);

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
        .eq('role_id', roleId);

      const allowedIds = rolePerms?.map(rp => rp.dataset_id) || [];

      if (allowedIds.length === 0) return;

      const { data: dsData } = await supabase
        .from('datasets')
        .select('*')
        .eq('organization_id', organizationId)
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

  /**
   * Procura um plano já usado para EXATAMENTE esta pergunta, nesta base.
   *
   * ⚠️ ESCOPO: só as perguntas do próprio usuário. A RLS de `plum_chat` é
   * `auth.uid() = user_id`, e o CLAUDE.md declara "Chat é 100% privado por
   * usuário" — contar as repetições da organização inteira exigiria uma RPC
   * `SECURITY DEFINER` que devolvesse só {plano, contagem}, nunca linhas de
   * chat. Decisão consciente de 2026-08-12: ficou de fora. O custo é que o
   * reuso dispara pouco, porque exige a MESMA pessoa repetindo a MESMA
   * pergunta — por isso os dois `console.log` abaixo, para dar como medir se
   * vale a pena ampliar depois.
   *
   * ⚠️ NÃO É CACHE DE RESULTADO. Devolve o PLANO, que segue por
   * `execute_plan` e passa por `authorizePlan` com as permissões de quem
   * pergunta agora. Um plano que cite coluna que o cargo não vê volta
   * `forbidden`, igual a um plano recém-gerado.
   *
   * Falha em silêncio de propósito: se o lookup der erro, devolve null e o
   * fluxo cai no Agente A, que é o comportamento de sempre. Uma otimização
   * nunca deve derrubar a pergunta.
   */
  const buscarPlanoReusavel = async (pergunta: string): Promise<unknown | null> => {
    try {
      const { data, error } = await supabase
        .from('plum_chat')
        .select('plan_query')
        .eq('user_id', session.user.id)
        .eq('dataset_id', selectedDatasetId)
        .eq('content', pergunta)
        .not('plan_query', 'is', null);

      if (error || !data?.length) return null;

      const planos = data.map((linha: { plan_query: unknown }) => linha.plan_query);
      const escolhido = escolherPlanoDominante(planos);

      if (!escolhido) {
        console.log(
          `[plano] sem reuso — ${planos.length} plano(s) guardado(s), limiar e ${REPETICOES_PARA_REUSAR}`,
        );
      }
      return escolhido;
    } catch (e) {
      console.error('[plano] lookup falhou, seguindo para o Agente A:', e);
      return null;
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !selectedDatasetId) return;
    
    const userMsgContent = input.trim();
    setInput("");
    setIsProcessing(true);

    const dataset = datasets.find(d => d.id === selectedDatasetId);

    try {
      // 1. Insert user message in DB immediately for optimistic UI
      const { data: userMsgData, error: insertErr } = await supabase
        .from('plum_chat')
        .insert({
          organization_id: organizationId,
          user_id: session.user.id,
          role: 'user',
          content: userMsgContent,
          // Guardado desde o INSERT: é metade da chave de reuso do plano (a
          // mesma frase contra outra base é outra pergunta).
          dataset_id: selectedDatasetId,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      setMessages(prev => [...prev, userMsgData as ChatMessage]);

      // 2. Chama Agente Z (Guardião)
      //
      // ⚠️ O guardião roda SEMPRE, inclusive quando o plano vem do cache. Ele
      // é quem barra pergunta fora de escopo e pergunta inviável para a base —
      // pular por causa de um plano guardado deixaria passar o que ele existe
      // para segurar.
      const guardRes = await supabase.functions.invoke('ai-plum-chat', {
        body: { action: 'guard', prompt: userMsgContent, schemaMetadata: dataset.schema_metadata }
      });

      if (guardRes.error) throw guardRes.error;
      const guardData = guardRes.data.result;

      if (guardData.status !== "PERMITIDO") {
        await saveAndShowAssistantMsg(guardData.message || "Requisição bloqueada.");
        setIsProcessing(false);
        return;
      }

      // 3. O plano: reusado, se esta mesma pergunta já produziu o mesmo plano
      // vezes suficientes; senão, gerado pelo Agente A.
      let plan = await buscarPlanoReusavel(userMsgContent);

      if (plan) {
        console.log('[plano] reuso — Agente A pulado');
      } else {
        const planRes = await supabase.functions.invoke('ai-plum-chat', {
          body: { action: 'plan_query', prompt: userMsgContent, schemaMetadata: dataset.schema_metadata }
        });
        if (planRes.error) throw planRes.error;
        plan = planRes.data.result;

        // Só guarda o que pode ser reusado depois. Plano com data absoluta
        // fica de fora: "quanto faturei hoje" gera `["2026-08-12", ...]`, e
        // reusar isso amanhã devolveria o número do dia errado, em silêncio.
        // Ver `src/lib/plano-cache.ts` e o PLANO-cache-de-perguntas-com-data.md.
        if (plan && !planoTemData(plan)) {
          supabase
            .from('plum_chat')
            .update({ plan_query: plan })
            .eq('id', userMsgData.id)
            .then(({ error }) => {
              if (error) console.error('[plano] falha ao guardar:', error.message);
            });
        }
      }

      // 4. Executa o Pandas Executor de verdade (Lambda), via execute_plan.
      // A Edge Function resolve as colunas do plano, confere contra
      // allowed_columns do cargo do usuário, assina (HMAC + SigV4) e chama o
      // mesmo executor que o dashboard usa — nenhum número inventado aqui.
      const execRes = await supabase.functions.invoke('ai-plum-chat', {
        body: { action: 'execute_plan', datasetId: selectedDatasetId, plan }
      });
      if (execRes.error) throw execRes.error;
      const executorResult = execRes.data.result;

      if (executorResult.status === 'forbidden') {
        await saveAndShowAssistantMsg(
          executorResult.error || "Seu cargo não tem acesso a uma das colunas necessárias para essa pergunta."
        );
        setIsProcessing(false);
        return;
      }
      if (executorResult.status === 'error') {
        await saveAndShowAssistantMsg(
          executorResult.error || "Não consegui calcular isso agora. Tente novamente em instantes."
        );
        setIsProcessing(false);
        return;
      }

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
          organization_id: organizationId,
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
    /*
      Repaginado para a Direção A em 2026-08-12. Quatro mudanças estruturais, e
      nenhuma linha de lógica: o `return` começa aqui e todo o pipeline de
      agentes fica acima, intocado.

      1. O cartão sumiu. A tela era um `rounded-2xl bg-card shadow-sm` de 4xl no
         meio da página; agora é a própria coluna da conversa, como no protótipo.
         De graça, morrem dois itens da lista de reprovação do `DESIGN.md` §1:
         `shadow-sm` e o `backdrop-blur` do cabeçalho.
      2. O cabeçalho próprio sumiu. Ele repetia "Plum Chat" — que o cabeçalho do
         `DashboardLayout` agora escreve — e trazia um selo "Online" com
         `bg-green-500` cru que não media nada.
      3. O seletor de base descartou o canto superior direito e foi para o pé da
         caixa de texto, onde o protótipo põe o escopo da pergunta. É o lugar
         certo: a base é parte do que se está perguntando, não do título da tela.
      4. A resposta do assistente perdeu a bolha. Fica em texto corrido ao lado
         da marca, e só a pergunta do usuário é uma bolha. Isso dá à resposta a
         largura inteira da coluna, que é o que uma lista de tópicos precisa.

      A altura desconta os 60px do cabeçalho do layout mais o padding do
      contêiner de conteúdo (`p-4` no mobile, `md:p-8`).
    */
    <div className="flex h-[calc(100vh-60px-2rem)] flex-col md:h-[calc(100vh-60px-4rem)]">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[740px] flex-col gap-[30px] px-1 pb-5 pt-2">
          {messages.length === 0 && (
            <div className="flex flex-col items-start pt-10">
              <h3 className="mb-2 font-display text-[22px] font-semibold tracking-[-0.02em] text-foreground">
                Converse com os seus dados
              </h3>
              <p className="max-w-sm text-sm leading-[1.6] text-text-soft">
                Escolha uma base no pé da caixa de texto e pergunte em português. O Plum planeja
                a consulta, o Python calcula, e a resposta vem com o número exato.
              </p>
            </div>
          )}

          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const d = new Date(msg.created_at);
            const timeString = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateString = d.toLocaleDateString();

            /*
              Resposta do assistente = Markdown; pergunta do usuário = texto
              literal. Ver `RespostaMarkdown.tsx` para o porquê da assimetria e
              para o conjunto de elementos aceitos.

              ⚠️ Esta assimetria é segurança de exibição, não estética, e
              atravessou a repaginação de propósito. Interpretar Markdown na
              pergunta reescreveria na tela o que a pessoa digitou.

              Até 2026-08-11 os dois lados caíam no mesmo `{msg.content}` de
              texto puro, com as classes `prose` penduradas numa div sem efeito
              nenhum (o plugin de typography não estava registrado no
              `tailwind.config.ts`). O resultado era o `**` do modelo aparecendo
              na tela.
            */
            if (isUser) {
              return (
                <div key={msg.id} className="flex animate-pl-up flex-col items-end gap-1">
                  <div className="max-w-[76%] rounded-[15px_15px_5px_15px] bg-primary px-[15px] py-[11px] text-sm leading-[1.55] text-primary-foreground">
                    {msg.content}
                  </div>
                  {/* O badge de `assunto` que ficava aqui saiu em 2026-08-12
                      junto com a coluna: o Agente Z o classificava a partir de
                      uma lista aberta e o valor saía inconsistente para a mesma
                      pergunta. Nada consumia o campo. */}
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {timeString} · {dateString}
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex animate-pl-up gap-[13px]">
                {/* Era um quadrado "P" sólido; trocado pelo mesmo mascote animado
                    da landing (`MascoteAnimado`, vídeo com alfa de verdade) — sem
                    clipe/rounded ao redor, porque a silhueta tem pontas que um
                    recorte cortaria (mesmo motivo documentado no componente). */}
                <div className="h-[27px] w-[27px] flex-none">
                  <MascoteAnimado src={MASCOTE_PINGPONG} className="h-full w-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <RespostaMarkdown content={msg.content} />
                  <span className="mt-1.5 block text-[10px] font-medium text-muted-foreground">
                    {timeString} · {dateString}
                  </span>
                </div>
              </div>
            );
          })}

          {isProcessing && (
            <div className="flex animate-pl-in gap-[13px]">
              <div className="h-[27px] w-[27px] flex-none">
                <MascoteAnimado src={MASCOTE_PINGPONG} className="h-full w-full" />
              </div>
              <div className="min-w-0 flex-1">
                <PlumThinkingBar isProcessing={isProcessing} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="flex-none pt-2">
        <div className="mx-auto max-w-[740px]">
          <div className="rounded-[13px] border border-input bg-secondary px-[15px] py-[13px] transition-colors duration-150 focus-within:border-primary">
            <textarea
              className="max-h-32 min-h-[38px] w-full resize-none border-0 bg-transparent pb-3 text-[14.5px] text-foreground outline-none placeholder:text-muted-foreground"
              placeholder={datasets.length === 0 ? "Você não tem acesso a nenhuma base de dados" : "Pergunte sobre suas bases…"}
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

            <div className="flex items-center gap-2">
              <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId} disabled={isProcessing}>
                <SelectTrigger className="h-[30px] w-auto max-w-[240px] gap-[7px] rounded-[7px] border-input bg-secondary px-2.5 text-xs text-text-soft transition-colors duration-150 hover:border-line-hover hover:text-foreground">
                  <Database size={13} strokeWidth={1.8} className="flex-none" />
                  <SelectValue placeholder="Escolher base" />
                </SelectTrigger>
                <SelectContent>
                  {datasets.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                  {datasets.length === 0 && (
                    <SelectItem value="empty" disabled>Nenhuma base liberada</SelectItem>
                  )}
                </SelectContent>
              </Select>

              <Button
                size="icon"
                aria-label="Enviar"
                className="ml-auto h-8 w-8 shrink-0 rounded-lg"
                disabled={!input.trim() || isProcessing || datasets.length === 0}
                onClick={handleSendMessage}
              >
                {isProcessing ? (
                  <Loader2 size={15} strokeWidth={2} className="animate-spin" />
                ) : (
                  <ArrowUp size={15} strokeWidth={2} />
                )}
              </Button>
            </div>
          </div>

          <p className="mt-2.5 text-center text-[11px] text-muted-foreground">
            O Plum consulta apenas as bases liberadas para o seu cargo. Verifique os valores
            retornados.
          </p>
        </div>
      </div>
    </div>
  );
}
