import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, RotateCcw, Plus, Shuffle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import plumLogo from "@/assets/plum-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Product {
  id: string;
  name: string;
  unitPrice: string;
  salesToday: string;
  salesMonth: string;
}

interface Message {
  id: number;
  content: string;
  sender: "user" | "plum";
}

const DEFAULT_PRODUCTS: Product[] = [
  { id: "1", name: "Camiseta", unitPrice: "59,90", salesToday: "12", salesMonth: "340" },
  { id: "2", name: "Casaco", unitPrice: "189,90", salesToday: "5", salesMonth: "87" },
  { id: "3", name: "Meia", unitPrice: "29,90", salesToday: "25", salesMonth: "520" },
];

const RANDOM_PRODUCTS = [
  { name: "Camiseta", priceRange: [39, 79], todayRange: [5, 35], monthRange: [100, 500] },
  { name: "Casaco", priceRange: [129, 249], todayRange: [2, 15], monthRange: [40, 150] },
  { name: "Meia", priceRange: [19, 39], todayRange: [10, 45], monthRange: [200, 600] },
  { name: "Bolsa", priceRange: [89, 199], todayRange: [3, 20], monthRange: [50, 200] },
];

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parsePrice(value: string): number {
  return parseFloat(value.replace(/\./g, "").replace(",", ".")) || 0;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function DataPlaygroundSection() {
  const [products, setProducts] = useState<Product[]>(DEFAULT_PRODUCTS);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const addMessage = (content: string, sender: "user" | "plum") => {
    idCounter.current += 1;
    setMessages((prev) => [...prev, { id: idCounter.current, content, sender }]);
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue.trim();
    addMessage(userMessage, "user");
    setInputValue("");
    setIsLoading(true);

    try {
      // Prepare products data for the API
      const productsData = products.map((p) => ({
        name: p.name,
        unitPrice: parsePrice(p.unitPrice),
        salesToday: parseInt(p.salesToday) || 0,
        salesMonth: parseInt(p.salesMonth) || 0,
      }));

      const { data, error } = await supabase.functions.invoke("plum-chat", {
        body: { question: userMessage, products: productsData },
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      addMessage(data.response, "plum");
    } catch (error) {
      console.error("Error calling plum-chat:", error);
      const errorMessage = error instanceof Error ? error.message : "Erro ao processar sua pergunta.";
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
      addMessage("Desculpe, ocorreu um erro ao processar sua pergunta. Tente novamente.", "plum");
    } finally {
      setIsLoading(false);
    }
  };

  const resetChat = () => {
    setMessages([]);
    idCounter.current = 0;
  };

  const handleProductChange = (id: string, field: keyof Product, value: string) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const addRow = () => {
    if (products.length >= 5) return;
    setProducts((prev) => [
      ...prev,
      { id: generateId(), name: "", unitPrice: "", salesToday: "", salesMonth: "" },
    ]);
  };

  const generateRandom = () => {
    const numProducts = randomInRange(4, 5);
    const shuffled = [...RANDOM_PRODUCTS].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, numProducts);

    const newProducts: Product[] = selected.map((item) => ({
      id: generateId(),
      name: item.name,
      unitPrice: randomInRange(item.priceRange[0], item.priceRange[1]).toFixed(2).replace(".", ","),
      salesToday: randomInRange(item.todayRange[0], item.todayRange[1]).toString(),
      salesMonth: randomInRange(item.monthRange[0], item.monthRange[1]).toString(),
    }));

    setProducts(newProducts);
  };

  // Calculate summary
  const summary = products.reduce(
    (acc, p) => {
      const price = parsePrice(p.unitPrice);
      const today = parseInt(p.salesToday) || 0;
      const month = parseInt(p.salesMonth) || 0;
      return {
        revenueToday: acc.revenueToday + price * today,
        revenueMonth: acc.revenueMonth + price * month,
      };
    },
    { revenueToday: 0, revenueMonth: 0 }
  );

  return (
    <div className="w-full">
      <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
        {/* Chat - Left side */}
        <div className="order-2 lg:order-1">
          <div className="glass rounded-2xl overflow-hidden border border-border/30 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/20 bg-card/50 backdrop-blur shrink-0">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
                <img src={plumLogo} alt="Plum" className="w-7 h-7 object-contain" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-foreground text-sm">Plum Assistant</h4>
                <p className="text-xs text-muted-foreground">
                  {isLoading ? "Digitando..." : "Online"}
                </p>
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
            <div
              ref={messagesContainerRef}
              className="flex-1 min-h-[300px] max-h-[400px] overflow-y-auto no-scrollbar overscroll-contain p-4 space-y-3 bg-gradient-to-b from-background/50 to-background/80"
              style={{ touchAction: "pan-y" }}
            >
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-2">
                    <p className="text-muted-foreground text-sm">
                      Pergunte sobre os dados da tabela
                    </p>
                    <p className="text-muted-foreground/60 text-xs">
                      Ex: "Qual o faturamento de hoje?"
                    </p>
                  </div>
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
                      className={`max-w-[85%] ${
                        message.sender === "user"
                          ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md"
                          : "bg-muted/50 text-foreground rounded-2xl rounded-bl-md border border-border/20"
                      } px-4 py-2`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="bg-muted/50 text-foreground rounded-2xl rounded-bl-md border border-border/20 px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Digitando...</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input area */}
            <form onSubmit={handleSend} className="p-3 border-t border-border/20 bg-card/30 backdrop-blur shrink-0">
              <div className="flex gap-2">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Pergunte sobre seus dados..."
                  className="flex-1 bg-muted/30 border-border/30 focus:border-primary/50"
                  disabled={isLoading}
                />
                <Button
                  type="submit"
                  size="icon"
                  variant="hero"
                  className="shrink-0"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Table - Right side */}
        <div className="order-1 lg:order-2">
          <div className="glass rounded-2xl overflow-hidden border border-border/30 p-4">
            {/* Table header with actions */}
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-foreground text-sm">Tabela de Produtos</h4>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={generateRandom}
                  className="text-muted-foreground hover:text-foreground gap-1"
                >
                  <Shuffle className="w-4 h-4" />
                  <span className="hidden sm:inline">Gerar aleatório</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={addRow}
                  disabled={products.length >= 5}
                  className="text-muted-foreground hover:text-foreground gap-1 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Adicionar</span>
                </Button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">
                      Nome do produto
                    </th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">
                      Valor unitário
                    </th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">
                      Qtd. vendas hoje
                    </th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">
                      Qtd. vendas mês
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className="border-b border-border/20 last:border-0">
                      <td className="py-2 px-1">
                        <Input
                          value={product.name}
                          onChange={(e) => handleProductChange(product.id, "name", e.target.value)}
                          className="h-8 text-sm bg-muted/20 border-border/20 focus:border-primary/50"
                          placeholder="Nome"
                        />
                      </td>
                      <td className="py-2 px-1">
                        <Input
                          value={product.unitPrice}
                          onChange={(e) => handleProductChange(product.id, "unitPrice", e.target.value)}
                          className="h-8 text-sm bg-muted/20 border-border/20 focus:border-primary/50 w-24"
                          placeholder="0,00"
                        />
                      </td>
                      <td className="py-2 px-1">
                        <Input
                          value={product.salesToday}
                          onChange={(e) => handleProductChange(product.id, "salesToday", e.target.value.replace(/\D/g, ""))}
                          className="h-8 text-sm bg-muted/20 border-border/20 focus:border-primary/50 w-20"
                          placeholder="0"
                          type="text"
                          inputMode="numeric"
                        />
                      </td>
                      <td className="py-2 px-1">
                        <Input
                          value={product.salesMonth}
                          onChange={(e) => handleProductChange(product.id, "salesMonth", e.target.value.replace(/\D/g, ""))}
                          className="h-8 text-sm bg-muted/20 border-border/20 focus:border-primary/50 w-20"
                          placeholder="0"
                          type="text"
                          inputMode="numeric"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="mt-4 pt-4 border-t border-border/30 grid grid-cols-2 gap-4">
              <div className="glass rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Faturamento hoje</p>
                <p className="text-lg font-semibold text-primary">
                  {formatCurrency(summary.revenueToday)}
                </p>
              </div>
              <div className="glass rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Faturamento do mês</p>
                <p className="text-lg font-semibold text-primary">
                  {formatCurrency(summary.revenueMonth)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
