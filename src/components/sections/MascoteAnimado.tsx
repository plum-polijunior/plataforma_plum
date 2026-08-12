import { useEffect, useRef, useState } from "react";

/**
 * O mascote animado, recortado num círculo.
 *
 * `mascote-animado.mp4` é um vídeo H.264 comum, sem canal alfa — nenhum
 * `<video>` de navegador suporta transparência real em MP4 (WebM com VP9+alfa
 * suportaria, mas não é o formato que veio). O quadro é 1280×720 com o
 * mascote centrado sobre fundo **preto sólido**.
 *
 * `mix-blend-mode: screen` foi tentado e descartado: funciona para brilho
 * aditivo sobre preto (partículas, fogo), não para um personagem de cor média
 * — no fundo branco da seção ele simplesmente desaparece (branco + qualquer
 * cor, em `screen`, continua branco); no rosa clarinho do "O que somos" saía
 * um fantasma sem cor, só os brilhos dos olhos sobrevivendo.
 *
 * A saída que funcionou: o mascote já é um blob quase circular dentro do
 * quadro 16:9, com bastante preto sobrando exatamente nos quatro cantos.
 * Um recorte circular (`overflow: hidden` + `border-radius: 50%`) elimina
 * canto por definição — é geometria, não coincidência. `object-position` e o
 * `scale()` abaixo foram calibrados olhando o resultado (não por conta),
 * então qualquer vídeo de substituição provavelmente pede recalibrar os dois.
 *
 * Efeito colateral assumido: o mascote deixa de ser um blob solto com sombra
 * (como o PNG estático) e passa a aparecer como avatar circular — é a moldura
 * que esconde o preto, não uma escolha de estilo independente.
 */
export function MascoteAnimado({ className }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Mesmo cuidado do vídeo de fundo do Hero (ver HeroSection.tsx): um laço
  // contínuo é exatamente o tipo de movimento que `prefers-reduced-motion`
  // existe para evitar, e a preferência não alcança `<video autoplay>` via
  // CSS — pausar por JS é a única forma.
  useEffect(() => {
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");

    const aplicar = () => {
      const v = videoRef.current;
      if (!v) return;
      if (consulta.matches) {
        v.pause();
        v.currentTime = 0;
      } else {
        void v.play().catch(() => {});
      }
    };

    aplicar();
    consulta.addEventListener("change", aplicar);
    return () => consulta.removeEventListener("change", aplicar);
  }, []);

  return (
    <div className={`overflow-hidden rounded-full ${className ?? ""}`}>
      <video
        ref={videoRef}
        src="/mascote-animado.mp4"
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
        tabIndex={-1}
        className="h-full w-full object-cover"
        style={{ objectPosition: "49% 56%", transform: "scale(1.55)" }}
      />
    </div>
  );
}
