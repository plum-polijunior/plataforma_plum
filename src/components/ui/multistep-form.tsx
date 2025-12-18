"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CheckIcon, ArrowRightIcon } from "lucide-react";

type Step = {
  id: number;
  label: string;
  field: string;
  placeholder: string;
  type?: string;
};

const steps: Step[] = [
  { id: 1, label: "Nome", field: "Nome", placeholder: "Seu nome completo", type: "text" },
  { id: 2, label: "Email", field: "Email", placeholder: "voce@exemplo.com", type: "email" },
  { id: 3, label: "Telefone", field: "Telefone", placeholder: "(11) 99999-9999", type: "tel" },
];

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

export function MultiStepForm({
  onSubmitToSupabase,
}: {
  onSubmitToSupabase: (payload: { Nome: string; Email: string; Telefone: string }) => Promise<void>;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isComplete, setIsComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleInputChange = (field: string, value: string) => {
    if (field === "Telefone") {
      setFormData({ ...formData, [field]: formatPhone(value) });
    } else {
      setFormData({ ...formData, [field]: value });
    }
  };

  const canContinue = !!formData[currentStepData.field]?.trim();

  const handleNext = async () => {
    setErrorMsg(null);

    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      return;
    }

    // Último step: SUBMIT
    const payload = {
      Nome: (formData["Nome"] || "").trim(),
      Email: (formData["Email"] || "").trim(),
      Telefone: (formData["Telefone"] || "").replace(/\D/g, "").trim(),
    };

    // Validações
    if (!payload.Nome) return setErrorMsg("Preencha seu nome.");
    if (!payload.Email || !payload.Email.includes("@")) return setErrorMsg("Digite um email válido.");
    if (!payload.Telefone || payload.Telefone.length < 10)
      return setErrorMsg("Digite um telefone válido.");

    try {
      setIsSubmitting(true);
      await onSubmitToSupabase(payload);
      setIsComplete(true);
    } catch (e: any) {
      setErrorMsg("Não conseguimos enviar agora. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canContinue) {
      e.preventDefault();
      handleNext();
    }
  };

  if (isComplete) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center py-12 text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
          className="relative"
        >
          <div className="absolute inset-0 bg-primary/30 rounded-full blur-xl animate-pulse" />
          <div className="relative w-20 h-20 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3 }}
            >
              <CheckIcon className="w-10 h-10 text-primary" />
            </motion.div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-6"
        >
          <h3 className="text-2xl font-bold text-foreground mb-2">Recebido!</h3>
          <p className="text-muted-foreground">
            Vamos falar com você em breve, {formData["Nome"]?.split(" ")[0]}.
          </p>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stepper */}
      <div className="flex items-center justify-center gap-3">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => index < currentStep && setCurrentStep(index)}
              disabled={index > currentStep}
              className={cn(
                "group relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-500 ease-out",
                "disabled:cursor-not-allowed",
                index < currentStep && "bg-primary/30 text-primary",
                index === currentStep && "bg-primary text-primary-foreground shadow-[0_0_24px_-6px_hsl(var(--primary))]",
                index > currentStep && "bg-muted/30 text-muted-foreground/50"
              )}
            >
              {index < currentStep ? (
                <CheckIcon className="w-5 h-5" />
              ) : (
                <span className="text-sm font-semibold">{step.id}</span>
              )}
              {index === currentStep && (
                <motion.div
                  layoutId="activeStep"
                  className="absolute inset-0 rounded-full border-2 border-primary"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
            </button>

            {index < steps.length - 1 && (
              <div className="relative mx-2 h-[2px] w-8 overflow-hidden rounded-full bg-muted/20">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-primary"
                  initial={{ width: "0%" }}
                  animate={{ width: index < currentStep ? "100%" : "0%" }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted/20">
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-accent"
          initial={{ width: "0%" }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          <div className="flex items-center justify-between">
            <Label htmlFor={currentStepData.field} className="text-lg font-medium text-foreground">
              {currentStepData.label}
            </Label>
            <span className="text-sm text-muted-foreground">
              {currentStep + 1}/{steps.length}
            </span>
          </div>

          <Input
            id={currentStepData.field}
            type={currentStepData.type}
            placeholder={currentStepData.placeholder}
            value={formData[currentStepData.field] || ""}
            onChange={(e) => handleInputChange(currentStepData.field, e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            maxLength={currentStepData.field === "Telefone" ? 15 : undefined}
            className="h-14 text-base transition-all duration-300 border-border/30 focus:border-primary/50 bg-muted/30 backdrop-blur"
          />

          {errorMsg && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-destructive"
            >
              {errorMsg}
            </motion.p>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Actions */}
      <div className="space-y-3 pt-2">
        <Button
          onClick={handleNext}
          disabled={!canContinue || isSubmitting}
          variant="hero"
          size="xl"
          className="w-full"
        >
          <span>
            {currentStep === steps.length - 1
              ? isSubmitting
                ? "Enviando..."
                : "Concluir"
              : "Continuar"}
          </span>
          <ArrowRightIcon className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
        </Button>

        {currentStep > 0 && (
          <button
            onClick={() => setCurrentStep(currentStep - 1)}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-300"
          >
            Voltar
          </button>
        )}
      </div>
    </div>
  );
}
