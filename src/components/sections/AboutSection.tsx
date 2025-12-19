import { motion } from "framer-motion";
import { Users, Target, Zap } from "lucide-react";
import DatabaseWithRestApi from "@/components/ui/database-with-rest-api";

const cards = [
  {
    icon: Users,
    title: "O Problema",
    description: "Necessidade por mecanismo de simples obtenção de informações e dados em meio a softwares complexos, lentos e burocráticos.",
  },
  {
    icon: Target,
    title: "O Contexto",
    description: "Busca por mecanismos simples em meio a softwares complexos, lentos e burocráticos disponíveis no mercado.",
  },
  {
    icon: Zap,
    title: "A Solução",
    description: "O Plum propõe um chatbot de consulta e avisos operacionais programáveis, conectando funcionários à base de dados e facilitando a busca e o recebimento de informações pontuais.",
  },
];

export function AboutSection() {
  return (
    <section
      id="sobre"
      className="min-h-screen flex items-center justify-center py-20 px-4 relative overflow-hidden scroll-snap-start"
    >
      {/* Background glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />

      <div className="container mx-auto max-w-6xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gradient mb-4">
            O que somos
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Transformando dados operacionais em insights acessíveis via WhatsApp.
          </p>
        </motion.div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {cards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.15 }}
              viewport={{ once: true }}
              className="glass rounded-2xl p-6 hover:border-primary/30 transition-all duration-300 group"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-4 group-hover:bg-primary/30 transition-colors">
                <card.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-foreground">
                {card.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {card.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Para quem - Subtitle + Database with animated wires */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          viewport={{ once: true }}
          className="flex flex-col items-center"
        >
          <h3 className="text-2xl md:text-3xl font-semibold text-foreground mb-8">
            Para quem
          </h3>
          <DatabaseWithRestApi
            circleText="Uso de dados"
            lightColor="#A855F7"
            badgeTexts={{
              first: "Varejistas",
              second: "Agências de Marketing",
              third: "Financeiro",
              fourth: "Indústrias",
            }}
          />
        </motion.div>
      </div>
    </section>
  );
}
