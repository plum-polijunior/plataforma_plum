import { motion } from "framer-motion";
import { Users, Target, Zap, Building2, Briefcase, TrendingUp, DollarSign } from "lucide-react";

const cards = [
  {
    icon: Users,
    title: "O Problema",
    description: "Clientes relatam dificuldade na hora de consultar informações sobre a empresa.",
  },
  {
    icon: Target,
    title: "O Contexto",
    description: "Seja por quererem algo simples em meio a softwares complexos, ou por serem coordenadores mais velhos em cargos estratégicos que não dominam tais aplicações.",
  },
  {
    icon: Zap,
    title: "A Solução",
    description: "O Plum propõe um chatbot de consulta e avisos operacionais programáveis, conectando funcionários à base de dados e facilitando a busca e o recebimento de informações pontuais.",
  },
];

const targetAudience = [
  { icon: Building2, label: "Diretoria / C-Level" },
  { icon: Briefcase, label: "Gestores e Coordenadores" },
  { icon: TrendingUp, label: "Operações" },
  { icon: DollarSign, label: "Financeiro" },
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

        {/* Target Audience */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          viewport={{ once: true }}
          className="glass rounded-2xl p-8"
        >
          <h3 className="text-xl font-semibold mb-6 text-center text-foreground">
            Para quem é
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {targetAudience.map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.4 + index * 0.1 }}
                viewport={{ once: true }}
                className="flex flex-col items-center gap-3 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <item.icon className="w-6 h-6 text-primary" />
                <span className="text-sm text-muted-foreground text-center font-medium">
                  {item.label}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}