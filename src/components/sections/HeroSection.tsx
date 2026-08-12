import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import plumMascot from "@/assets/plum-mascot-transparent.png";

interface HeroSectionProps {
  onNavigate: (sectionId: string) => void;
}

// Rótulos qualitativos, sem número público não confirmado — ver
// docs/2026-08-12-PLANO-merge-landing-page.md §3 (pendência resolvida na
// atualização da branch `rafaela`).
const stats = [
  { value: "Horas economizadas", label: "menos tempo em tarefas manuais, mais tempo decidindo" },
  { value: "Resultado financeiro", label: "decisões mais rápidas geram mais receita" },
  { value: "Pessoas atendidas", label: "times inteiros usando o Plum no dia a dia" },
];

export function HeroSection({ onNavigate }: HeroSectionProps) {
  return (
    <section
      id="inicio"
      className="relative overflow-hidden min-h-[92vh] flex items-center justify-center px-6 pt-[120px] pb-20"
    >
      {/* Dot-grid texture */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(hsl(329 44% 33%) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      />

      {/* Glow blobs */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[560px] h-[560px] rounded-full bg-primary/[0.14] blur-[90px] animate-glow-pulse" />
      <div
        className="absolute -bottom-36 -right-24 w-[420px] h-[420px] rounded-full bg-accent/10 blur-[90px] animate-glow-pulse"
        style={{ animationDirection: "alternate-reverse", animationDuration: "8s" }}
      />

      {/* Watermark mascots */}
      <img
        src={plumMascot}
        alt=""
        className="absolute top-[8%] left-[4%] w-[120px] opacity-10 -rotate-12 pointer-events-none select-none"
      />
      <img
        src={plumMascot}
        alt=""
        className="absolute bottom-[6%] right-[6%] w-[90px] opacity-10 rotate-[18deg] -scale-x-100 pointer-events-none select-none"
      />

      <div className="relative z-10 max-w-[800px] mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex justify-center mb-4"
        >
          <img
            src={plumMascot}
            alt="Plum"
            className="h-[150px] w-auto object-contain"
            style={{ filter: "drop-shadow(0 14px 24px hsl(329 44% 33% / 0.3))" }}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="flex justify-center mb-7"
        >
          <span className="text-gradient font-extrabold tracking-tight text-[clamp(32px,4.2vw,50px)]">
            Plum
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-gradient font-extrabold leading-[1.06] tracking-tight text-[clamp(38px,5.2vw,66px)] mb-6"
        >
          Do dado à decisão,
          <br />
          em segundos.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-[19px] leading-relaxed text-muted-foreground max-w-[620px] mx-auto mb-10"
        >
          Plum centraliza, consulta e entrega as respostas da sua operação — no momento em
          que você precisa decidir.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex justify-center gap-4 flex-wrap mb-14"
        >
          <Button variant="hero" size="xl" onClick={() => onNavigate("sobre")}>
            Entender o Plum
          </Button>
          <Button
            variant="outline"
            size="xl"
            className="rounded-2xl border-primary/20 text-foreground/80 bg-transparent hover:bg-muted/50"
            onClick={() => onNavigate("contato")}
          >
            Fale com a gente →
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.55 }}
          className="flex justify-center items-stretch gap-8 flex-wrap mb-3"
        >
          {stats.map((stat, i) => (
            <div key={stat.value} className="flex items-stretch gap-8">
              <div className="text-center max-w-[170px]">
                <div className="text-[15px] font-bold text-foreground mb-1">{stat.value}</div>
                <div className="text-[12.5px] leading-snug text-muted-foreground">{stat.label}</div>
              </div>
              {i < stats.length - 1 && <span className="w-px bg-primary/20" />}
            </div>
          ))}
        </motion.div>
        <p className="text-[12.5px] text-muted-foreground/70 m-0">
          Resultados de soluções de IA construídas pelo time por trás do Plum.
        </p>
      </div>
    </section>
  );
}
