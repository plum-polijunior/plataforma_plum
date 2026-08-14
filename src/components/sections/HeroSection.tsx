import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { FundoAnimado } from "./FundoAnimado";
import { MascoteAnimado } from "./MascoteAnimado";

interface HeroSectionProps {
  onNavigate: (sectionId: string) => void;
}

/**
 * Os números vêm do material da Poli Júnior, não de nada que este código meça.
 *
 * ⚠️ São afirmações públicas sobre resultado de cliente. A nota logo abaixo
 * deles ("Resultados de soluções de IA construídas pelo time por trás do Plum")
 * existe para não deixar ninguém ler isso como métrica da plataforma Plum, que
 * não teria como sustentar — ela é nova. Se os números mudarem, a nota muda
 * junto: os dois são uma coisa só.
 */
const NUMEROS = [
  { valor: "+4.800h", rotulo: "economizadas por ano" },
  { valor: "R$585 mil", rotulo: "gerados por ano" },
  { valor: "3.200+", rotulo: "pessoas atendidas" },
];

export function HeroSection({ onNavigate }: HeroSectionProps) {
  return (
    <section className="relative flex min-h-[92vh] items-center justify-center overflow-hidden px-6 pb-20 pt-[120px]">
      {/* ── Fundo ────────────────────────────────────────────────────────────
          Substituiu, em 2026-08-12, os traços roxos animados em SVG
          (`ui/background-paths.tsx`, removido). O `<video>` e o cuidado com
          movimento reduzido moraram aqui até 2026-08-14, quando a seção
          "Vamos conversar?" passou a pedir o mesmo fundo — ver
          `FundoAnimado.tsx`. */}
      <FundoAnimado />

      {/* Véu. O texto precisa de contraste garantido em QUALQUER quadro do
          vídeo, e o vídeo é provisório — sem esta camada, a legibilidade do H1
          passaria a depender do arquivo que estiver em `public/`. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-background/70 backdrop-blur-[2px]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background"
      />

      <div className="relative z-10 mx-auto max-w-[800px] text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="mx-auto w-[150px]"
          style={{ filter: "drop-shadow(0 14px 24px hsl(329 44% 33% / 0.3))" }}
        >
          <MascoteAnimado className="aspect-square" />
        </motion.div>

        {/* As três linhas vivem num elemento só, e não em dois como no
            protótipo (onde "Plum" era um `<p>` de 50px acima de um `<h1>` de
            66px). É o que garante literalmente a mesma fonte e o mesmo corpo
            nas três: não há um segundo lugar onde o tamanho possa divergir. */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="text-gradient mt-4 font-extrabold leading-[1.08] tracking-[-0.02em]"
          style={{ fontSize: "clamp(38px, 5.2vw, 66px)" }}
        >
          Plum.
          <br />
          Do dado à decisão.
          <br />
          Em segundos.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mx-auto mt-6 max-w-[620px] text-[19px] leading-[1.55] text-muted-foreground"
        >
          Plum centraliza, consulta e entrega as respostas da sua operação — no momento em
          que você precisa decidir.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <Button variant="hero" size="xl" onClick={() => onNavigate("sobre")}>
            Entender o Plum
          </Button>
          <Button
            variant="outline"
            size="xl"
            onClick={() => onNavigate("contato")}
            className="rounded-2xl"
          >
            Fale com a gente →
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.55 }}
          className="mt-14"
        >
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-6">
            {NUMEROS.map((n, i) => (
              <div key={n.valor} className="flex items-center gap-8">
                {i > 0 && <div aria-hidden="true" className="hidden h-9 w-px bg-primary/20 sm:block" />}
                <div className="text-center">
                  <p className="text-[26px] font-bold leading-none text-foreground">{n.valor}</p>
                  <p className="mt-1.5 text-[13px] text-muted-foreground">{n.rotulo}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 text-[12.5px] text-muted-foreground/80">
            Resultados de soluções de IA construídas pelo time por trás do Plum.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
