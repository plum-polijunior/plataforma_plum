import { motion } from "framer-motion";
import { Play } from "lucide-react";

const sectors = [
  "Varejo",
  "Indústria",
  "E-commerce",
  "Financeiro",
  "Agências de Marketing",
  "Consultórios",
];

const cards = [
  {
    title: "Multi-canal",
    description: "No WhatsApp do dia a dia ou na plataforma web — sem trocar de ferramenta.",
    shape: "square",
  },
  {
    title: "Níveis de acesso",
    description:
      "Solução interna da empresa: cada pessoa enxerga só o que faz sentido pra sua função, com níveis de acesso configuráveis.",
    shape: "circle",
  },
  {
    title: "Automação e alertas",
    description: "Relatórios periódicos, lembretes e avisos automáticos.",
    shape: "diamond",
  },
];

function CardIcon({ shape }: { shape: string }) {
  if (shape === "circle") {
    return <span className="w-4 h-4 rounded-full border-2 border-primary" />;
  }
  if (shape === "diamond") {
    return (
      <span
        className="w-4 h-4 bg-primary"
        style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }}
      />
    );
  }
  return <span className="w-4 h-4 rounded-[5px] border-2 border-primary" />;
}

export function AboutSection() {
  return (
    <section
      id="sobre"
      className="bg-secondary py-[110px] px-6 relative overflow-hidden"
    >
      <div className="absolute top-[20%] left-[8%] w-[380px] h-[380px] rounded-full bg-primary/[0.06] blur-[90px]" />
      <div className="absolute bottom-[-8%] right-[6%] w-[340px] h-[340px] rounded-full bg-accent/[0.07] blur-[90px] pointer-events-none" />

      <div className="max-w-[1100px] mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          viewport={{ once: true }}
          className="text-center max-w-[720px] mx-auto mb-6"
        >
          <div className="text-[13px] font-bold tracking-[1.5px] uppercase text-primary mb-3.5">
            O que somos
          </div>
          <h2 className="text-gradient font-extrabold leading-[1.15] text-[clamp(30px,4vw,44px)] mb-5">
            Mais do que um chatbot.
          </h2>
          <p className="text-[17px] leading-[1.7] text-muted-foreground mb-5">
            Dados dispersos custam tempo e atrasam decisões. Plum conecta sua equipe ao
            banco de dados da empresa e transforma qualquer pergunta em resposta imediata.
            <br />
            <span className="font-bold text-gradient">
              Dados viram insights. Insights viram ação.
            </span>
          </p>
          <div>
            <div className="text-sm font-semibold text-primary mb-2.5">No seu setor:</div>
            <div className="flex items-center justify-center gap-2.5 flex-wrap">
              {sectors.map((sector, i) => (
                <span key={sector} className="flex items-center gap-2.5">
                  <span className="text-sm text-foreground/80">{sector}</span>
                  {i < sectors.length - 1 && <span className="text-primary/30">·</span>}
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 mt-14">
          {cards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.12 }}
              viewport={{ once: true }}
              className="bg-card border border-border rounded-[20px] p-8 shadow-sm"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/[0.16] to-accent/10 flex items-center justify-center mb-5">
                <CardIcon shape={card.shape} />
              </div>
              <h3 className="text-[19px] font-bold text-foreground mb-2.5">{card.title}</h3>
              <p className="text-[14.5px] leading-[1.6] text-muted-foreground">
                {card.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Full-bleed client testimonial */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        viewport={{ once: true }}
        className="mt-20 w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw]"
      >
        <div
          className="relative w-full overflow-hidden"
          style={{
            aspectRatio: "21 / 9",
            background: "linear-gradient(135deg, hsl(330 45% 12%), hsl(330 45% 25%))",
          }}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <div className="w-[76px] h-[76px] rounded-full bg-white/[0.14] border-[1.5px] border-white/50 flex items-center justify-center mb-6">
              <Play className="w-6 h-6 text-white fill-white ml-0.5" />
            </div>
            <div className="text-[13px] font-bold tracking-[1.5px] uppercase text-[#e8c9d8] mb-2.5">
              Depoimento de cliente
            </div>
            <h3 className="text-white font-extrabold m-0 max-w-[600px] text-[clamp(22px,3vw,32px)]">
              "Veja como o Plum mudou a rotina da nossa operação"
            </h3>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
