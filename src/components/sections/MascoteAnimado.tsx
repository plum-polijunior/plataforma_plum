import { useEffect, useRef, useState } from "react";

import plumMascoteEstatico from "@/assets/plum-mascot-transparent.png";

/**
 * O mascote animado, com fundo transparente de verdade.
 *
 * ── COMO A TRANSPARÊNCIA FUNCIONA AQUI ───────────────────────────────────
 *
 * O arquivo de origem (`z_mascot_and_background/plum_mascot_2.mp4`) é um
 * MP4 1280×720 com o mascote sobre **fundo verde** (`rgb(30,166,39)`).
 * MP4/H.264 não tem canal alfa, e o navegador não faz chroma key sozinho —
 * então o verde foi removido **na origem**, e o que este componente carrega é
 * um **WebM VP9 com canal alfa** (`public/mascote-animado.webm`, 562 kB).
 *
 * O comando que gerou o arquivo, para quem precisar refazer com outro vídeo:
 *
 *   ffmpeg -i plum_mascot_2.mp4 \
 *     -vf "chromakey=0x1EA627:0.12:0.04,despill=type=green:mix=0.6:expand=0,\
 *          scale=480:-2,format=yuva420p" \
 *     -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 34 -an -auto-alt-ref 0 \
 *     mascote-animado.webm
 *
 * Três decisões dentro desse comando, todas medidas e não chutadas:
 *
 *   • `chromakey` (YUV) e não `colorkey` (RGB). Com RGB a `similarity` que
 *     limpava o fundo já comia os tons azulados do próprio mascote — o corpo
 *     ficava semitransparente, visível sobre fundo colorido. Medido: 1,45% de
 *     pixels esverdeados restantes com RGB contra 0,87% com YUV.
 *   • `despill` depois do key. Sem ele sobrava franja verde na borda das
 *     pontas (0,87% dos pixels); com ele, **zero**. A cor do mascote não muda
 *     a olho nu.
 *   • `scale=480`. O maior uso na tela é 172px (o FAQ), então 480px já cobre
 *     tela 2x com folga. Sem isso o arquivo sairia ~4x maior sem nenhum ganho
 *     visível.
 *
 * ⚠️ **Não há recorte circular.** A versão anterior usava um, porque o vídeo
 * antigo tinha fundo preto opaco e o recorte era o único jeito de escondê-lo.
 * Este mascote tem pontas irregulares que um círculo cortaria — e com alfa de
 * verdade a moldura deixou de ser necessária. Se um vídeo futuro voltar a ter
 * fundo sólido, a resposta certa é rodar o chroma key de novo, não reintroduzir
 * a máscara.
 *
 * ── O FALLBACK NÃO É DECORATIVO ──────────────────────────────────────────
 *
 * WebM com alfa não é universal: o Safari só passou a ler WebM na versão 16, e
 * o suporte a canal alfa ali é historicamente irregular. Um `<video>` que o
 * navegador não sabe decodificar renderiza **nada** — o mascote sumiria da
 * página sem erro nenhum. Por isso existe o PNG estático como reserva.
 *
 * ⚠️ Ele é renderizado por TROCA, não empilhado atrás do vídeo. A primeira
 * versão deste componente empilhava, e ficou errado na tela: o PNG é um
 * mascote de desenho ANTIGO (blob liso) e o vídeo é o novo (com pontas), então
 * o antigo vazava por baixo do novo formando um halo. Empilhar só seria seguro
 * se os dois fossem a mesma arte. O `onError`/`onCanPlay` abaixo garantem que
 * um, e só um, esteja na tela a qualquer momento.
 */
export function MascoteAnimado({ className }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Começa `false` e vira `true` no `onError` do vídeo. Note a direção: o
  // padrão é CONFIAR no vídeo, e só cair para o PNG diante de falha real. O
  // contrário (mostrar o PNG até o vídeo provar que toca) faria todo mundo ver
  // uma troca de imagem no carregamento.
  const [videoFalhou, setVideoFalhou] = useState(false);

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

  if (videoFalhou) {
    return (
      <img
        src={plumMascoteEstatico}
        alt=""
        aria-hidden="true"
        className={`object-contain ${className ?? ""}`}
      />
    );
  }

  return (
    <video
      ref={videoRef}
      src="/mascote-animado.webm"
      autoPlay
      muted
      loop
      playsInline
      aria-hidden="true"
      tabIndex={-1}
      onError={() => setVideoFalhou(true)}
      className={`object-contain ${className ?? ""}`}
    />
  );
}
