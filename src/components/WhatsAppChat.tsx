"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import plumbLogo from "@/assets/plumb-logo.png";

type Message = {
  id: number;
  content: string;
  sender: "user" | "plumb";
  buttons?: { label: string; action: string }[];
};

type ChatState =
  | "initial"
  | "choose_mode"
  | "ai_agent_suggest"
  | "menu_options"
  | "choose_delivery"
  | "delivery_interval"
  | "complete";

const RESPONSES: Record<string, string> = {
  faturamento: "R$100.000",
  produto: "Produto X",
  vendedor: "Vendedor Y",
  ai_query: "R$100.000",
};

export function WhatsAppChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [chatState, setChatState] = useState<ChatState>("initial");
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [pendingAnswer, setPendingAnswer] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const addMessage = (content: string, sender: "user" | "plumb", buttons?: { label: string; action: string }[]) => {
    idCounter.current += 1;
    setMessages((prev) => [...prev, { id: idCounter.current, content, sender, buttons }]);
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const userMessage = inputValue.trim();
    addMessage(userMessage, "user");
    setInputValue("");

    if (chatState === "initial") {
      setTimeout(() => {
        addMessage("Olá! Como você quer consultar seus dados?", "plumb", [
          { label: "Agente de IA", action: "ai_agent" },
          { label: "Menu Botões", action: "menu_buttons" },
        ]);
        setChatState("choose_mode");
      }, 600);
    } else if (chatState === "ai_agent_suggest") {
      // User sent the AI query
      setPendingQuestion(userMessage);
      setPendingAnswer(RESPONSES.ai_query);
      setTimeout(() => {
        addMessage("Como você quer receber essa informação?", "plumb", [
          { label: "Delivery recorrente", action: "delivery" },
          { label: "Consulta pontual", action: "pontual" },
        ]);
        setChatState("choose_delivery");
      }, 600);
    }
  };

  const handleButtonClick = (action: string) => {
    switch (action) {
      case "ai_agent":
        addMessage("Agente de IA", "user");
        setTimeout(() => {
          setInputValue("Qual foi o faturamento da semana anterior?");
          setChatState("ai_agent_suggest");
        }, 400);
        break;

      case "menu_buttons":
        addMessage("Menu Botões", "user");
        setTimeout(() => {
          addMessage("Escolha uma consulta:", "plumb", [
            { label: "Faturamento", action: "query_faturamento" },
            { label: "Produto mais vendido", action: "query_produto" },
            { label: "Maior vendedor do mês", action: "query_vendedor" },
          ]);
          setChatState("menu_options");
        }, 600);
        break;

      case "query_faturamento":
        addMessage("Faturamento", "user");
        setPendingQuestion("Qual é o faturamento?");
        setPendingAnswer(RESPONSES.faturamento);
        setTimeout(() => {
          addMessage("Como você quer receber essa informação?", "plumb", [
            { label: "Delivery recorrente", action: "delivery" },
            { label: "Consulta pontual", action: "pontual" },
          ]);
          setChatState("choose_delivery");
        }, 600);
        break;

      case "query_produto":
        addMessage("Produto mais vendido", "user");
        setPendingQuestion("Qual é o produto mais vendido?");
        setPendingAnswer(RESPONSES.produto);
        setTimeout(() => {
          addMessage("Como você quer receber essa informação?", "plumb", [
            { label: "Delivery recorrente", action: "delivery" },
            { label: "Consulta pontual", action: "pontual" },
          ]);
          setChatState("choose_delivery");
        }, 600);
        break;

      case "query_vendedor":
        addMessage("Maior vendedor do mês", "user");
        setPendingQuestion("Quem é o maior vendedor do mês?");
        setPendingAnswer(RESPONSES.vendedor);
        setTimeout(() => {
          addMessage("Como você quer receber essa informação?", "plumb", [
            { label: "Delivery recorrente", action: "delivery" },
            { label: "Consulta pontual", action: "pontual" },
          ]);
          setChatState("choose_delivery");
        }, 600);
        break;

      case "delivery":
        addMessage("Delivery recorrente", "user");
        setTimeout(() => {
          addMessage("Você quer receber essa informação de quanto em quanto tempo?", "plumb", [
            { label: "De 12 em 12 horas", action: "interval_12h" },
            { label: "Diariamente", action: "interval_daily" },
            { label: "Semanalmente", action: "interval_weekly" },
          ]);
          setChatState("delivery_interval");
        }, 600);
        break;

      case "pontual":
        addMessage("Consulta pontual", "user");
        setTimeout(() => {
          if (pendingAnswer) {
            addMessage(pendingAnswer, "plumb");
          }
          setTimeout(() => {
            addMessage("Deseja fazer outra consulta?", "plumb", [
              { label: "Nova pergunta", action: "reset" },
            ]);
            setChatState("complete");
          }, 800);
        }, 600);
        break;

      case "interval_12h":
        addMessage("De 12 em 12 horas", "user");
        setTimeout(() => {
          if (pendingAnswer) {
            addMessage(pendingAnswer, "plumb");
          }
          setTimeout(() => {
            addMessage("✓ Mensagem agendada para: a cada 12 horas", "plumb", [
              { label: "Nova pergunta", action: "reset" },
            ]);
            setChatState("complete");
          }, 600);
        }, 600);
        break;

      case "interval_daily":
        addMessage("Diariamente", "user");
        setTimeout(() => {
          if (pendingAnswer) {
            addMessage(pendingAnswer, "plumb");
          }
          setTimeout(() => {
            addMessage("✓ Mensagem agendada para: diariamente", "plumb", [
              { label: "Nova pergunta", action: "reset" },
            ]);
            setChatState("complete");
          }, 600);
        }, 600);
        break;

      case "interval_weekly":
        addMessage("Semanalmente", "user");
        setTimeout(() => {
          if (pendingAnswer) {
            addMessage(pendingAnswer, "plumb");
          }
          setTimeout(() => {
            addMessage("✓ Mensagem agendada para: semanalmente", "plumb", [
              { label: "Nova pergunta", action: "reset" },
            ]);
            setChatState("complete");
          }, 600);
        }, 600);
        break;

      case "reset":
        resetChat();
        break;
    }
  };

  const resetChat = () => {
    setMessages([]);
    setInputValue("");
    setChatState("initial");
    setPendingQuestion(null);
    setPendingAnswer(null);
    idCounter.current = 0;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Chat container */}
      <div className="glass rounded-2xl overflow-hidden border border-border/30">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/20 bg-card/50 backdrop-blur">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
            <img src={plumbLogo} alt="Plumb" className="w-7 h-7 object-contain" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-foreground text-sm">Plumb Assistant</h4>
            <p className="text-xs text-muted-foreground">Online</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetChat}
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        {/* Messages area */}
        <div className="h-[350px] overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-background/50 to-background/80">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground text-sm text-center">
                Digite uma mensagem para iniciar a simulação
              </p>
            </div>
          )}

          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.2 }}
                className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] ${
                    message.sender === "user"
                      ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md"
                      : "bg-muted/50 text-foreground rounded-2xl rounded-bl-md border border-border/20"
                  } px-4 py-2`}
                >
                  <p className="text-sm">{message.content}</p>

                  {message.buttons && message.buttons.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {message.buttons.map((btn) => (
                        <button
                          key={btn.action}
                          onClick={() => handleButtonClick(btn.action)}
                          className="px-3 py-1.5 text-xs font-medium rounded-full bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-colors"
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="p-3 border-t border-border/20 bg-card/30 backdrop-blur">
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                chatState === "ai_agent_suggest"
                  ? "Sugerido: envie a pergunta"
                  : "Digite uma mensagem..."
              }
              className="flex-1 bg-muted/30 border-border/30 focus:border-primary/50"
            />
            <Button
              onClick={handleSend}
              size="icon"
              variant="hero"
              className="shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
