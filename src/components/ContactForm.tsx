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

    // Dispara o email de boas vindas para o lead usando a Edge Function
    try {
      await supabase.functions.invoke('send-auth-email', {
        body: { type: 'lead_received', userEmail: payload.Email, userName: payload.Nome }
      });
    } catch (e) {
      console.error("Falha ao enviar email do lead:", e);
    }

    toast({
      title: "Recebemos seus dados!",
      description: "Fique de olho no seu e-mail.",
    });

    onSuccess?.();
  };

  return (
    <div className={className}>
      <MultiStepForm onSubmitToSupabase={handleSubmitToSupabase} />
    </div>
  );
}
