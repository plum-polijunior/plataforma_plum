import { useEffect, useRef, useState } from "react";

import plumMascoteEstatico from "@/assets/plum-mascote.png";

/**
 * O mascote, em um arquivo só (origem: `z_mascot_and_background/PLUM.mp4`).
 *
 * Desde 2026-08-14 **todas** as sete superfícies usam este mesmo vídeo — logo da
 * landing, hero, FAQ, "Vamos conversar?", `/auth`, cabeçalho do produto e avatar
 * do chat. Antes eram dois arquivos e um PNG de arte diferente convivendo.
 */
export const MASCOTE = "/mascote.webm";

/**
 * O mascote animado, com fundo transparente de verdade.
 *
 * ── COMO A TRANSPARÊNCIA FUNCIONA AQUI ───────────────────────────────────
 *
 * O arquivo de origem é um MP4 com o mascote sobre **fundo verde** (`#12871E`).
 * MP4/H.264 não tem canal alfa, e o navegador não faz chroma key sozinho —
 * então o verde é removido **na origem**, e o que este componente carrega é um
 * **WebM VP9 com canal alfa**. Fazer o chroma key em tempo de execução (canvas
 * quadro a quadro) custaria centenas de milhares de pixels de JS por frame;
 * com alfa no arquivo, o navegador decodifica nativamente.
 *
 * O comando, para quem precisar refazer com outro vídeo:
 *
 *   ffmpeg -i PLUM.mp4 \
 *     -vf "chromakey=0x12871E:0.14:0.05,despill=type=green:mix=0.6:expand=0,\
 *          scale=480:-2,format=yuva420p" \
 *     -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 34 -an -auto-alt-ref 0 \
 *     mascote.webm
 *
 * Três decisões dentro dele, medidas e não chutadas:
 *
 *   • `chromakey` (YUV) e não `colorkey` (RGB). Em RGB a `similarity` que
 *     limpava o fundo já comia os tons azulados do próprio mascote — o corpo
 *     ficava semitransparente sobre fundo colorido. Isso importa **mais** neste
 *     vídeo do que nos anteriores: o mascote agora é azul, mais perto do verde
 *     no círculo de matiz do que o roxo de antes.
 *   • `despill` depois do key. Sem ele sobra franja verde na borda; com ele o
 *     resíduo medido é **zero**.
 *   • `scale=480`. O maior uso na tela é ~172px, então 480 cobre tela 2x com
 *     folga. Sem isso o arquivo sairia várias vezes maior sem ganho visível.
 *
 * ⚠️ **Não há vai-e-volta aqui, e não é esquecimento.** Uma versão anterior
 * concatenava a ida com a volta invertida porque aquele vídeo era um movimento
 * curto que não fechava sozinho. Este fecha: o atributo nativo de repetição
 * basta. Se um vídeo futuro voltar a não fechar, a técnica está no histórico
 * (commit `10a1add`) — mas não a reintroduza sem precisar, porque ela dobra o
 * número de quadros do arquivo.
 *
 * ⚠️ **Não há recorte circular.** Uma versão antiga usava um, porque o vídeo
 * de então tinha fundo preto opaco e o recorte era o único jeito de escondê-lo.
 * Com alfa de verdade a moldura deixou de ser necessária, e um círculo cortaria
 * a silhueta irregular. Se um vídeo futuro voltar a ter fundo sólido, a
 * resposta certa é rodar o chroma key de novo, não reintroduzir a máscara.
 *
 * ⚠️ **LACUNA conhecida:** o mascote encosta na borda INFERIOR do quadro e sai
 * achatado ali — 15,3% da largura da base, medido na origem (196 de 1280 px) e
 * confirmado no derivado (68 de 480), ou seja, veio do vídeo e não do
 * processamento. Aumentar a resolução não resolve: o corte é geométrico, os
 * pixels não existem em lugar nenhum. Só uma reexportação da animação com
 * margem embaixo resolve de verdade.
 *
 * ── O FALLBACK NÃO É DECORATIVO ──────────────────────────────────────────
 *
 * WebM com alfa não é universal: o Safari só passou a ler WebM na versão 16, e
 * o suporte a canal alfa ali é historicamente irregular. Um `<video>` que o
 * navegador não sabe decodificar renderiza **nada** — o mascote sumiria da
 * página sem erro nenhum. Por isso existe o PNG estático como reserva.
 *
 * ⚠️ **O PNG é gerado do PRÓPRIO vídeo** (um quadro, com o mesmo chroma key),
 * e isso é obrigatório, não capricho. Até 2026-08-14 o fallback era
 * `plum-mascot-transparent.png`, de uma arte anterior — e o mascote mudou de
 * desenho *e de cor* (era roxo, agora é azul). Um fallback de arte diferente
 * não é degradação elegante: é mostrar outro personagem. Trocou o vídeo?
 * Regenere o PNG junto.
 *
 * ⚠️ Ele é renderizado por TROCA, não empilhado atrás do vídeo. A primeira
 * versão deste componente empilhava, e ficou errado na tela: o PNG antigo
 * vazava por baixo do vídeo formando um halo. O `onError` abaixo garante que
 * um, e só um, esteja na tela a qualquer momento.
 */
export function MascoteAnimado({ className }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Começa `false` e vira `true` no `onError` do vídeo. Note a direção: o
  // padrão é CONFIAR no vídeo, e só cair para o PNG diante de falha real. O
  // contrário (mostrar o PNG até o vídeo provar que toca) faria todo mundo ver
  // uma troca de imagem no carregamento.
  const [videoFalhou, setVideoFalhou] = useState(false);

  // Mesmo cuidado do vídeo de fundo (ver `FundoAnimado.tsx`): um laço contínuo
  // é exatamente o tipo de movimento que `prefers-reduced-motion` existe para
  // evitar, e a preferência não alcança um vídeo com reprodução automática via
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
      src={MASCOTE}
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
