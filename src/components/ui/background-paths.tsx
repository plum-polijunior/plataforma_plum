"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import plumbLogo from "@/assets/plumb-logo.png";
function FloatingPaths({
  position
}: {
  position: number;
}) {
  const paths = Array.from({
    length: 36
  }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03
  }));
  return <div className="absolute inset-0 pointer-events-none">
      <svg className="w-full h-full" viewBox="0 0 696 316" fill="none">
        <title>Background Paths</title>
        {paths.map(path => <motion.path key={path.id} d={path.d} stroke="hsl(270 70% 60%)" strokeWidth={path.width} strokeOpacity={0.05 + path.id * 0.02} initial={{
        pathLength: 0.3,
        opacity: 0.6
      }} animate={{
        pathLength: 1,
        opacity: [0.25, 0.6, 0.25],
        pathOffset: [0, 1, 0]
      }} transition={{
        duration: 20 + Math.random() * 10,
        repeat: Number.POSITIVE_INFINITY,
        ease: "linear"
      }} />)}
      </svg>
    </div>;
}
export function BackgroundPaths({
  subtitle = "Dados da sua operação. Em segundos. No WhatsApp.",
  ctaLabel = "Entender o Plumb →",
  onCta
}: {
  subtitle?: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-background">
      {/* Glow roxo discreto */}
      <div className="absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl animate-glow-pulse" />
        <div className="absolute bottom-[-140px] right-[-120px] h-[420px] w-[420px] rounded-full bg-accent/15 blur-3xl animate-glow-pulse" />
      </div>

      <div className="absolute inset-0">
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
      </div>

      <div className="relative z-10 container mx-auto px-4 md:px-6 text-center">
        <motion.div initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} transition={{
        duration: 1.6
      }} className="max-w-4xl mx-auto">
          {/* Logo */}
          <motion.div initial={{
          y: 60,
          opacity: 0
        }} animate={{
          y: 0,
          opacity: 1
        }} transition={{
          delay: 0.2,
          type: "spring",
          stiffness: 100,
          damping: 20
        }} className="mb-8">
            <img src={plumbLogo} alt="Plumb Logo" className="w-48 h-48 sm:w-64 sm:h-64 mx-auto object-contain drop-shadow-2xl" />
          </motion.div>

          <motion.p initial={{
          y: 30,
          opacity: 0
        }} animate={{
          y: 0,
          opacity: 1
        }} transition={{
          delay: 0.6,
          duration: 0.8
        }} className="mx-auto mb-10 max-w-2xl text-base sm:text-lg text-muted-foreground">
            {subtitle}
          </motion.p>

          <motion.div initial={{
          y: 30,
          opacity: 0
        }} animate={{
          y: 0,
          opacity: 1
        }} transition={{
          delay: 0.8,
          duration: 0.8
        }}>
            <div className="inline-block group relative bg-gradient-to-b from-primary/20 to-primary/5 p-px rounded-2xl backdrop-blur-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300">
              <Button variant="hero" size="xl" onClick={onCta} className="group">
                <span className="opacity-90 group-hover:opacity-100 transition-opacity">
                  {ctaLabel}
                </span>
              </Button>
            </div>
          </motion.div>

          {/* Hint discreto */}
          
        </motion.div>
      </div>
    </div>;
}