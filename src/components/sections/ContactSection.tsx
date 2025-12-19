import { motion } from "framer-motion";
import { MultiStepForm } from "@/components/ui/multistep-form";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import plumLogo from "@/assets/plum-logo.png";

export function ContactSection() {
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
  };

  return (
    <section
      id="contato"
      className="min-h-screen flex items-center justify-center py-20 px-4 relative overflow-hidden scroll-snap-start"
    >
      {/* Background glow */}
      <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />

      <div className="container mx-auto max-w-lg relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <div className="flex justify-center mb-6">
            <img src={plumLogo} alt="Plum" className="h-12 w-auto opacity-60" />
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-gradient mb-4">
            Lista de Espera
          </h2>
          <p className="text-muted-foreground">
            Entre na lista de espera e seja um dos primeiros a usar o Plum.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
          className="glass rounded-2xl p-8 border border-border/20"
        >
          <MultiStepForm onSubmitToSupabase={handleSubmitToSupabase} />
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
          className="text-center mt-12 text-muted-foreground/60 text-sm"
        >
          © PLUM Direitos Reservados 2026
        </motion.div>
      </div>
    </section>
  );
}
