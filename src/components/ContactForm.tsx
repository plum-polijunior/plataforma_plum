"use client";

import { MultiStepForm } from "@/components/ui/multistep-form";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ContactFormProps {
  onSuccess?: () => void;
  className?: string;
}

export function ContactForm({ onSuccess, className }: ContactFormProps) {
  const { toast } = useToast();

  const handleSubmitToSupabase = async (payload: {
    Nome: string;
    Email: string;
    Telefone: string;
  }) => {
    const { error } = await supabase.from("Leads").insert([
      {
        Nome: payload.Nome,
        Email: payload.Email,
        Telefone: payload.Telefone,
      },
    ]);

    if (error) {
      toast({
        title: "Erro ao enviar",
        description: "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
      throw error;
    }

    toast({
      title: "Você está na lista!",
      description: "Entraremos em contato assim que houver vagas disponíveis.",
    });

    onSuccess?.();
  };

  return (
    <div className={className}>
      <MultiStepForm onSubmitToSupabase={handleSubmitToSupabase} />
    </div>
  );
}
