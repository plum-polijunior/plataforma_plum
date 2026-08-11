import { useEffect, useRef } from "react";
import type { Tema } from "./tema";

const TOTAL_FEIXES = 16;

/** Resolução do canvas em relação ao tamanho na tela. O desfoque é do CSS
    (`filter: blur(18px)`); o canvas só compõe as faixas, então 30% basta e
    corta o custo de pintura por ~11×. */
const ESCALA = 0.3;

/** PRNG com semente (mulberry32). A composição do campo de feixes precisa ser
    sempre a mesma: com `Math.random` o fundo mudaria a cada resize e a cada
    troca de tema, e o protótipo deixa de ser reproduzível. */
function semeado(semente: number) {
  let s = semente;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Feixe {
  x: number;
  y: number;
  largura: number;
  comprimento: number;
  angulo: number;
  opacidade: number;
  matiz: number;
  pulso: number;
}

/** ⚠️ A ordem das chamadas a `r()` é o que define a composição. Trocar duas
    linhas de lugar aqui muda o fundo inteiro, mesmo com a mesma semente. */
function montarFeixes(w: number, h: number): Feixe[] {
  const r = semeado(20260811);
  return Array.from({ length: TOTAL_FEIXES }, (_, i) => {
    const faixa = i / TOTAL_FEIXES;
    return {
      x: -w * 0.15 + faixa * w * 1.35 + (r() - 0.5) * w * 0.1,
      y: -h * 0.35 + r() * h * 1.5,
      largura: (60 + r() * 120) * 0.3,
      comprimento: h * 2.2,
      angulo: -35 + r() * 10,
      opacidade: 0.14 + r() * 0.14,
      matiz: 318 + faixa * 30,
      pulso: r() * Math.PI * 2,
    };
  });
}

/**
 * Camadas decorativas por trás de tudo: feixes, três manchas em deriva lenta,
 * faixas diagonais, malha de pontos e grão.
 *
 * Nada aqui é interativo — todas as camadas são `pointer-events: none`, e o
 * `prefers-reduced-transparency` esconde o conjunto inteiro (ver `vidro.css`).
 *
 * ⚠️ ESTE ARQUIVO É MOVIMENTO DECORATIVO, que o `DESIGN.md` §1 proíbe em App UI
 * ("só transição de estado, ≤150ms, nada decorativo") — as manchas correm em
 * laço de 46s, 61s e 53s, sem fim. E é ele que põe gradiente atrás de número,
 * o item 1 da lista de reprovação automática da §10. Vive só na rota `/vidro`,
 * e é a parte da proposta que mais depende de uma decisão explícita antes de ir
 * para qualquer lugar. Ver `docs/direcao-vidro.md` §1.
 */
export function Fundo({ tema }: { tema: Tema }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;

    const ctx = c.getContext("2d");
    if (!ctx) return;

    let feixes: Feixe[] = [];

    const desenhar = () => {
      const w = c.width;
      const h = c.height;
      const escuro = tema === "escuro";
      const lum = escuro ? 58 : 46;
      const ganho = escuro ? 1 : 0.85;

      ctx.clearRect(0, 0, w, h);

      feixes.forEach((f) => {
        const alfa = f.opacidade * (0.8 + Math.sin(f.pulso) * 0.2) * ganho;
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate((f.angulo * Math.PI) / 180);

        const g = ctx.createLinearGradient(0, 0, 0, f.comprimento);
        g.addColorStop(0, `hsla(${f.matiz}, 58%, ${lum}%, 0)`);
        g.addColorStop(0.1, `hsla(${f.matiz}, 58%, ${lum}%, ${alfa * 0.5})`);
        g.addColorStop(0.4, `hsla(${f.matiz}, 58%, ${lum}%, ${alfa})`);
        g.addColorStop(0.6, `hsla(${f.matiz}, 58%, ${lum}%, ${alfa})`);
        g.addColorStop(0.9, `hsla(${f.matiz}, 58%, ${lum}%, ${alfa * 0.5})`);
        g.addColorStop(1, `hsla(${f.matiz}, 58%, ${lum}%, 0)`);

        ctx.fillStyle = g;
        ctx.fillRect(-f.largura / 2, 0, f.largura, f.comprimento);
        ctx.restore();
      });
    };

    const dimensionar = () => {
      const w = Math.max(1, Math.round(c.clientWidth * ESCALA));
      const h = Math.max(1, Math.round(c.clientHeight * ESCALA));
      c.width = w;
      c.height = h;
      feixes = montarFeixes(w, h);
      desenhar();
    };

    dimensionar();
    window.addEventListener("resize", dimensionar);
    return () => window.removeEventListener("resize", dimensionar);

    // `tema` reexecuta o efeito inteiro em vez de só repintar. Sai mais barato
    // do que parece e dá exatamente o mesmo resultado: a semente é fixa, então
    // remontar os feixes com o mesmo tamanho devolve a mesma composição.
  }, [tema]);

  return (
    <>
      <div className="v-plano" />
      <canvas ref={canvas} className="v-feixes" aria-hidden />
      <div className="v-mancha v-mancha-a" />
      <div className="v-mancha v-mancha-b" />
      <div className="v-mancha v-mancha-c" />
      <div className="v-streak" />
      <div className="v-pontos" />
      <div className="v-grao" />
    </>
  );
}
