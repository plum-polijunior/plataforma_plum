import { motion } from "framer-motion";

export function LocationSection() {
  return (
    <section id="localizacao" className="bg-secondary py-[110px] px-6">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        viewport={{ once: true }}
        className="max-w-[900px] mx-auto text-center"
      >
        <div className="text-[13px] font-bold tracking-[1.5px] uppercase text-primary mb-3.5">
          Localização
        </div>
        <h2 className="text-gradient font-extrabold m-0 mb-3.5 text-[clamp(28px,3.6vw,40px)]">
          Onde estamos
        </h2>
        <p className="text-[15px] text-muted-foreground mb-8">
          Av. Professor Mello Moraes, 2231 - Butantã, São Paulo - SP
        </p>
        <div
          className="h-[280px] rounded-[20px] border border-border flex items-center justify-center"
          style={{
            background:
              "repeating-linear-gradient(135deg, hsl(329 44% 33% / 0.05), hsl(329 44% 33% / 0.05) 12px, hsl(0 0% 100%) 12px, hsl(0 0% 100%) 24px)",
          }}
        >
          <span className="font-mono text-[13px] text-muted-foreground/80">
            mapa — Av. Prof. Mello Moraes, 2231, Butantã, SP
          </span>
        </div>

        <div className="text-center mt-12 text-muted-foreground/70 text-[13px] leading-[1.8]">
          © Plum — Direitos Reservados 2026
          <br />
          Um projeto do Núcleo de Inovação — Poli Júnior
        </div>
      </motion.div>
    </section>
  );
}
