import { motion } from "framer-motion";
import { LocationMap } from "@/components/ui/expand-map";

// O design novo troca o mapa por um placeholder listrado estático — aqui
// mantemos o `LocationMap` (SVG com tilt 3D, já funciona) e só reestilizamos
// o entorno. Ver docs/2026-08-12-PLANO-merge-landing-page.md §3.
export function LocationSection() {
  return (
    <section id="localizacao" className="bg-secondary py-[110px] px-6 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[6%] w-[360px] h-[360px] rounded-full bg-primary/[0.06] blur-[90px] pointer-events-none" />
      <div className="absolute bottom-[-15%] left-[4%] w-[320px] h-[320px] rounded-full bg-accent/[0.07] blur-[90px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        viewport={{ once: true }}
        className="max-w-[900px] mx-auto text-center relative z-10"
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

        <LocationMap
          location="Av. Professor Mello Moraes, 2231 - Butantã, São Paulo - SP"
          coordinates="05508-030"
        />
      </motion.div>
    </section>
  );
}
