import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";

interface PlumThinkingBarProps {
  isProcessing: boolean;
}

export function PlumThinkingBar({ isProcessing }: PlumThinkingBarProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isProcessing) {
      setProgress(0);
      return;
    }

    // Intervalo de aceleração progressiva customizada
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev < 40) {
          return prev + 8; // Rápida: Validação de cache e schema (0 - 40%)
        } else if (prev < 90) {
          return prev + 2.5; // Média: Computação matemática no Pandas + Agente (40 - 90%)
        } else if (prev < 99) {
          return prev + 0.2; // Lenta: Redação e fechamento semântico (90 - 99%)
        }
        return prev;
      });
    }, 400);

    return () => clearInterval(timer);
  }, [isProcessing]);

  if (!isProcessing && progress === 0) return null;

  return (
    <div className="w-full max-w-xs space-y-1.5 py-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex justify-between text-xs text-muted-foreground font-medium">
        <span>Analisando base e calculando...</span>
        <span>{Math.floor(progress)}%</span>
      </div>
      <Progress value={progress} className="h-1.5 bg-muted/30 overflow-hidden" />
    </div>
  );
}
