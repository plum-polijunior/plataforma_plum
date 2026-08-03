import { useState, useRef, useEffect, useCallback } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useOrgAccess } from "@/hooks/use-org-access";
import plumLogo from "@/assets/plum-logo.png";

type ChatMessage = {
  id: string;
  content: string;
  direcao: "in" | "out";
};

/**
 * Chat pós-login da organização. As mensagens são persistidas e escopadas pela
 * edge function `chat-core` (RBAC por cargo). A UI:
 *  - envia a pergunta via functions.invoke('chat-core');
 *  - assina Realtime em `messages` da conversa, então as respostas (e, no
 *    futuro, mensagens vindas do WhatsApp) aparecem ao vivo sem polling.
 */
export default function Chat() {
  const { state, organizationName } = useOrgAccess();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Assina Realtime nas mensagens da conversa corrente.
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            content: string;
            direcao: "in" | "out";
          };
          setMessages((prev) =>
            prev.some((m) => m.id === row.id)
              ? prev
              : [...prev, { id: row.id, content: row.content, direcao: row.direcao }],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setError(null);
    setSending(true);
    setInput("");

    // Eco otimista da mensagem do usuário (id temporário; o Realtime traz o real).
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, content: text, direcao: "in" }]);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("chat-core", {
        body: { message: text, conversation_id: conversationId },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      if (data?.conversation_id && !conversationId) {
        setConversationId(data.conversation_id as string);
      }
      // A resposta ('out') chega pelo Realtime; como fallback (ex.: Realtime
      // desabilitado), injeta aqui se ainda não veio.
      if (data?.answer) {
        setMessages((prev) =>
          prev.some((m) => m.content === data.answer && m.direcao === "out")
            ? prev
            : [...prev, { id: `ans-${Date.now()}`, content: data.answer, direcao: "out" }],
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar a mensagem.");
    } finally {
      setSending(false);
    }
  };

  if (state === "carregando") {
    return <div className="text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto h-full flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-foreground">Chat</h1>
        <p className="text-sm text-muted-foreground">
          Converse com o PLUM sobre as bases de {organizationName ?? "sua organização"}.
          As respostas respeitam as permissões do seu cargo.
        </p>
      </div>

      <div className="flex-1 flex flex-col glass rounded-2xl border border-border/30 overflow-hidden min-h-0">
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
        >
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground text-sm text-center">
                Faça uma pergunta sobre os dados da sua organização.
              </p>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.direcao === "in" ? "justify-end" : "justify-start"}`}
            >
              {m.direcao === "out" && (
                <img
                  src={plumLogo}
                  alt="Plum"
                  className="w-7 h-7 object-contain mr-2 mt-1 shrink-0"
                />
              )}
              <div
                className={`max-w-[80%] px-4 py-2 whitespace-pre-wrap text-sm ${
                  m.direcao === "in"
                    ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md"
                    : "bg-muted/50 text-foreground rounded-2xl rounded-bl-md border border-border/20"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-muted/50 text-muted-foreground rounded-2xl rounded-bl-md border border-border/20 px-4 py-2 text-sm">
                PLUM está pensando...
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 py-2 text-xs text-destructive border-t border-border/20">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSend}
          className="p-3 border-t border-border/20 bg-card/30 backdrop-blur"
        >
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Digite sua pergunta..."
              disabled={sending}
              className="flex-1 bg-muted/30 border-border/30 focus:border-primary/50"
            />
            <Button type="submit" size="icon" variant="hero" disabled={sending} className="shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
