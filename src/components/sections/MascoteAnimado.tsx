import { useEffect, useRef, useState } from "react";

import plumMascoteEstatico from "@/assets/plum-mascot-transparent.png";

/**
 * Laço simples de ~10s (origem: `z_mascot_and_background/plum_mascot_2.mp4`).
 * Hoje só o FAQ usa. Ver o bloco "AS DUAS FONTES" abaixo.
 */
export const MASCOTE_LOOP = "/mascote-animado.webm";

/**
 * Vai-e-volta de ~2,9s (origem: `z_mascot_and_background/mais_ou_menos_isso_plum.mp4`).
 * Hero da landing e avatar do assistente no chat.
 */
export const MASCOTE_PINGPONG = "/mascote-pingpong.webm";

/**
 * O mascote animado, com fundo transparente de verdade.
 *
 * ── COMO A TRANSPARÊNCIA FUNCIONA AQUI ───────────────────────────────────
 *
 * Os dois arquivos de origem são MP4 com o mascote sobre **fundo verde**.
 * MP4/H.264 não tem canal alfa, e o navegador não faz chroma key sozinho —
 * então o verde é removido **na origem**, e o que este componente carrega é um
 * **WebM VP9 com canal alfa**. Fazer o chroma key em tempo de execução (canvas
 * quadro a quadro) custaria centenas de milhares de pixels de JS por frame;
 * com alfa no arquivo, o navegador decodifica nativamente.
 *
 * Três decisões do processamento, todas medidas e não chutadas:
 *
 *   • `chromakey` (YUV) e não `colorkey` (RGB). Com RGB a `similarity` que
 *     limpava o fundo já comia os tons azulados do próprio mascote — o corpo
 *     ficava semitransparente sobre fundo colorido. Medido no primeiro vídeo:
 *     1,45% de pixels esverdeados restantes com RGB contra 0,87% com YUV.
 *   • `despill` depois do key. Sem ele sobra franja verde na borda; com ele o
 *     resíduo medido é **zero** nos dois arquivos.
 *   • `scale=480`. O maior uso na tela é ~172px, então 480 cobre tela 2x com
 *     folga. Sem isso o arquivo sairia várias vezes maior sem ganho visível.
 *
 * ── AS DUAS FONTES, E POR QUE SÃO DUAS ───────────────────────────────────
 *
 * `MASCOTE_LOOP` é o vídeo antigo, de laço simples. `MASCOTE_PINGPONG` é o
 * novo, em vai-e-volta. Em 2026-08-12 o pedido foi trocar **só** o hero e o
 * avatar do chat — o FAQ ficou de propósito com o antigo, não por descuido.
 * Se um dia o FAQ também mudar, é passar a prop e apagar a constante órfã.
 *
 * ⚠️ **O vai-e-volta está gravado no arquivo, não é feito em JS.** Navegador
 * nenhum toca vídeo de trás pra frente: `playbackRate` negativo não é
 * suportado, e simular por `requestAnimationFrame` mexendo em `currentTime`
 * força uma busca por quadro — caro e trêmulo, porque codec inter-frame
 * precisa decodificar pra frente pra reconstruir cada quadro. Com a ida e a
 * volta concatenadas no próprio arquivo, o atributo nativo de repetição
 * resolve tudo, sem uma linha de JS.
 *
 * O comando, para quem precisar refazer com outro vídeo:
 *
 *   ffmpeg -i origem.mp4 -filter_complex "\
 *     [0:v]chromakey=0x219C28:0.12:0.04,despill=type=green:mix=0.6:expand=0,\
 *          scale=480:-2,format=yuva420p,split[a][b];\
 *     [b]reverse,trim=start_frame=1:end_frame=44,setpts=PTS-STARTPTS[r];\
 *     [a][r]concat=n=2:v=1[out]" -map "[out]" \
 *     -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 34 -an -auto-alt-ref 0 \
 *     mascote-pingpong.webm
 *
 * ⚠️ **O `trim` no meio disso não é detalhe — é o que tira a travadinha.** A
 * origem tem 45 quadros (0…44). A volta precisa ser 43…1, **sem as duas
 * pontas**: com a volta inteira (44…0), o quadro 44 apareceria duas vezes
 * seguidas na virada e o quadro 0 duas vezes na emenda da repetição — dois
 * engasgos de ~66 ms por ciclo, bem visíveis num movimento de 1,5 s. Daí
 * `start_frame=1:end_frame=44` (fim exclusivo), que devolve 43 quadros e
 * fecha o ciclo em 88. Refez com outro vídeo? **Recalcule esses dois
 * números** a partir da contagem real de quadros; deixá-los fixos é o jeito
 * mais fácil de reintroduzir o engasgo sem perceber.
 *
 * ⚠️ **Não há recorte circular.** Uma versão antiga usava um, porque o vídeo
 * de então tinha fundo preto opaco e o recorte era o único jeito de escondê-lo.
 * Com alfa de verdade a moldura deixou de ser necessária, e um círculo cortaria
 * a silhueta irregular. Se um vídeo futuro voltar a ter fundo sólido, a
 * resposta certa é rodar o chroma key de novo, não reintroduzir a máscara.
 *
 * ⚠️ **LACUNA conhecida do `MASCOTE_PINGPONG`:** o mascote encosta na borda
 * INFERIOR do quadro e sai achatado ali — 6,04% da largura da base, medido
 * igual na origem (116 de 1920 px) e no derivado (29 de 480), ou seja, veio do
 * vídeo, não do processamento. Aumentar a resolução não resolve: o corte é
 * geométrico, os pixels não existem em lugar nenhum. Só uma reexportação da
 * animação com margem embaixo resolve de verdade.
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
 * mascote de desenho ANTIGO (blob liso) e o vídeo é outro, então o antigo
 * vazava por baixo do novo formando um halo. Empilhar só seria seguro se os
 * dois fossem a mesma arte. O `onError` abaixo garante que um, e só um, esteja
 * na tela a qualquer momento.
 */
export function MascoteAnimado({
  className,
  src = MASCOTE_LOOP,
}: {
  className?: string;
  src?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Começa `false` e vira `true` no `onError` do vídeo. Note a direção: o
  // padrão é CONFIAR no vídeo, e só cair para o PNG diante de falha real. O
  // contrário (mostrar o PNG até o vídeo provar que toca) faria todo mundo ver
  // uma troca de imagem no carregamento.
  const [videoFalhou, setVideoFalhou] = useState(false);

  // Mesmo cuidado do vídeo de fundo do Hero (ver HeroSection.tsx): um laço
  // contínuo é exatamente o tipo de movimento que `prefers-reduced-motion`
  // existe para evitar, e a preferência não alcança um vídeo com reprodução
  // automática via CSS — pausar por JS é a única forma.
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
      src={src}
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
