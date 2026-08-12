import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import plumMascote from "@/assets/plum-mascot-transparent.png";

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [semMovimento, setSemMovimento] = useState(false);

  // `prefers-reduced-motion` não alcança `<video autoplay>` por CSS — pausar é
  // a única forma. Um laço de vídeo é exatamente o tipo de movimento contínuo
  // que essa preferência existe para evitar.
  //
  // Ler a preferência aqui, e não uma vez fora do componente, porque ela pode
  // mudar durante a sessão (o sistema operacional troca sem recarregar a
  // página).
  useEffect(() => {
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");

    const aplicar = () => {
      setSemMovimento(consulta.matches);
      const v = videoRef.current;
      if (!v) return;
      if (consulta.matches) {
        v.pause();
        v.currentTime = 0; // congela no primeiro quadro, não num meio de corte
      } else {
        void v.play().catch(() => {
          // Autoplay recusado (política do navegador, economia de bateria).
          // Não é erro: o véu e o fundo sólido abaixo já sustentam o texto.
        });
      }
    };

    aplicar();
    consulta.addEventListener("change", aplicar);
    return () => consulta.removeEventListener("change", aplicar);
  }, []);

  return (
    <section className="relative flex min-h-[92vh] items-center justify-center overflow-hidden px-6 pb-20 pt-[120px]">
      {/* ── Fundo ────────────────────────────────────────────────────────────
          Substituiu, em 2026-08-12, os traços roxos animados em SVG
          (`ui/background-paths.tsx`, removido).

          `muted` não é preferência: sem ele o navegador recusa o autoplay.
          `playsInline` impede o iOS de abrir o vídeo em tela cheia sozinho.
          `aria-hidden` porque não há informação aqui — quem usa leitor de tela
          não perde nada, e anunciar "vídeo" sem conteúdo só atrapalha. */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        src="/hero-fundo.mp4"
        autoPlay={!semMovimento}
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
      />

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
        <motion.img
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          src={plumMascote}
          alt=""
          aria-hidden="true"
          className="mx-auto h-[150px] object-contain"
          style={{ filter: "drop-shadow(0 14px 24px hsl(329 44% 33% / 0.3))" }}
        />

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
