import { useEffect, useRef, useState } from "react";

/** O vídeo de fundo da landing (origem: `z_mascot_and_background/LANDING_PAGE.mp4`). */
export const FUNDO_VIDEO = "/fundo-animado.mp4";

/**
 * Vídeo de fundo de seção, com o cuidado de `prefers-reduced-motion`.
 *
 * Nasceu extraído do `HeroSection` em 2026-08-14, quando o mesmo fundo passou a
 * ser pedido também na seção "Vamos conversar?". Duplicar o `<video>` seria
 * duplicar junto o efeito de movimento reduzido abaixo — e é exatamente o tipo
 * de lógica que só quebra num dos dois lugares meses depois.
 *
 * ⚠️ **A preferência de movimento reduzido não alcança um vídeo com reprodução
 * automática por CSS** — só por JS. Um laço de vídeo é o caso central que essa
 * preferência existe para evitar, então pausar aqui não é polimento.
 *
 * A preferência é lida dentro do componente, e não uma vez no módulo, porque o
 * sistema operacional pode trocá-la no meio da sessão, sem recarregar a página.
 *
 * ⚠️ `muted` não é preferência: sem ele o navegador recusa a reprodução
 * automática. `playsInline` impede o iOS de abrir o vídeo em tela cheia sozinho.
 * `aria-hidden` porque não há informação aqui — anunciar "vídeo" sem conteúdo só
 * atrapalha quem usa leitor de tela.
 *
 * Quem chama é responsável pelo **véu** por cima: o texto precisa de contraste
 * garantido em QUALQUER quadro, e o vídeo é trocável. Sem essa camada, a
 * legibilidade passaria a depender do arquivo que estiver em `public/`.
 */
export function FundoAnimado({ className }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [semMovimento, setSemMovimento] = useState(false);

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
          // Reprodução automática recusada (política do navegador, economia de
          // bateria). Não é erro: o véu e o fundo sólido de quem chama já
          // sustentam o texto.
        });
      }
    };

    aplicar();
    consulta.addEventListener("change", aplicar);
    return () => consulta.removeEventListener("change", aplicar);
  }, []);

  return (
    <video
      ref={videoRef}
      className={`absolute inset-0 h-full w-full object-cover ${className ?? ""}`}
      src={FUNDO_VIDEO}
      autoPlay={!semMovimento}
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}
