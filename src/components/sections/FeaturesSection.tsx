import { motion } from "framer-motion";
import { Database, Calendar, Brain, MessageCircle } from "lucide-react";
import { DataPlaygroundSection } from "@/components/sections/DataPlaygroundSection";
const features = [
  {
    icon: Brain,
    title: "Agente de IA",
    description: "Perguntas subjetivas com métricas estatísticas e nota de confiabilidade.",
    example: '"Qual foi a maior venda já registrada na empresa?"',
  },
  {
    icon: Database,
    title: "Consulta de dados históricos",
    description: "Acesse métricas e relatórios de qualquer período com perguntas simples.",
    example: '"Informe a média de faturamento da semana passada"',
  },
  {
    icon: Calendar,
    title: "Delivery recorrente de dados",
    description: "Configure alertas e relatórios automáticos no horário que preferir.",
    example: '"Informe toda segunda-feira a média de faturamento da semana anterior"',
  },
];

export function FeaturesSection() {
  return (
    <section
      id="funcionalidades"
      className="min-h-screen flex items-center justify-center py-20 px-4 relative overflow-hidden scroll-snap-start"
    >
      {/* Background elements */}
      <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

      <div className="container mx-auto max-w-6xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gradient mb-4">
            Funcionalidades
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto flex items-center justify-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            Consulta e delivery de dados — direto no WhatsApp.
          </p>
        </motion.div>

        {/* Data Playground - BEFORE feature cards */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="mb-16"
        >
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-foreground mb-2">
              Simule o Plum
            </h3>
            <p className="text-muted-foreground text-sm">
              Edite a tabela de produtos e pergunte ao Plum sobre seus dados.
            </p>
          </div>
          <DataPlaygroundSection />
        </motion.div>

        {/* Feature cards - AFTER simulation */}
        <div className="grid lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.15 }}
              viewport={{ once: true }}
              className="group"
            >
              <div className="glass rounded-2xl p-8 h-full hover:border-primary/30 transition-all duration-300 relative overflow-hidden">
                {/* Glow effect on hover */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                <div className="relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mb-6 group-hover:bg-primary/30 group-hover:scale-110 transition-all duration-300">
                    <feature.icon className="w-7 h-7 text-primary" />
                  </div>

                  <h3 className="text-xl font-semibold mb-3 text-foreground">
                    {feature.title}
                  </h3>

                  <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                    {feature.description}
                  </p>

                  {/* Example */}
                  <div className="glass rounded-xl p-4 border-primary/20">
                    <p className="text-xs text-muted-foreground/60 mb-1">Exemplo:</p>
                    <p className="text-sm text-primary/90 italic">
                      {feature.example}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
