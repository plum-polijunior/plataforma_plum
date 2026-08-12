/**
 * A paleta de série do dashboard, medida em vez de prometida.
 *
 * O `DESIGN.md` §11 exige que a paleta seja *"re-degrau na superfície clara e
 * revalidada, não invertida automaticamente"*. Até 2026-08-12 essa exigência
 * vivia só em comentário dentro de `cores.ts`, com os números de contraste
 * escritos à mão por quem tinha medido uma vez. Nada impedia alguém de ajustar
 * uma constante "só um pouquinho" e derrubar a barreira em silêncio — o
 * sintoma seria uma barra pálida que ninguém associa a uma regressão.
 *
 * Este arquivo transforma a exigência em teste. É o mesmo padrão que o repo já
 * usa para o RBAC de coluna (`_shared/query_plan.test.ts`) e para a normalização
 * de nome de coluna (`colunas.test.ts`): a regra que não pode regredir em
 * silêncio ganha um teste que fica vermelho.
 *
 * Import relativo, não `@/`: o `vitest.config.ts` não declara `resolve.alias`
 * (só o `vite.config.ts` declara), então `@/` não resolve aqui.
 *
 * As três propriedades verificadas são independentes, e a história da conversão
 * para tema claro é a prova de que uma não implica a outra: houve uma versão com
 * contraste aprovado em todos os 42 degraus e rampa do azul perceptualmente
 * plana (L* 58 no maior valor, 57 no menor). Contraste diz se a cor é visível;
 * ΔE diz se dois degraus são distinguíveis; a ordenação diz se o gráfico está
 * dizendo a verdade sobre qual valor é maior.
 */

import { describe, expect, it } from "vitest";

import {
  CONTRASTE_MINIMO,
  QUANTOS_SLOTS,
  SUPERFICIE_DO_CARD,
  SUPERFICIE_DO_CARD_ESCURO,
  corDaSerie,
  corDeSerieUnica,
} from "../components/dashboard/cores";

/** Maior rampa que os consumidores pedem: `MAX_SEGMENTOS`/`MAX_FATIAS` = 6. */
const MAIOR_RAMPA = 6;

/**
 * ΔE76 mínimo entre degraus VIZINHOS da mesma rampa.
 *
 * 8 é o piso que o `DESIGN.md` §3 usa para pares adjacentes sob daltonismo. A
 * medição atual dá 9,2 no pior caso (magenta), então há folga de 1,2 — o
 * suficiente para um ajuste fino não quebrar o teste, e pouco o suficiente para
 * um ajuste grosseiro quebrar.
 */
const DELTA_E_MINIMO = 8;

/**
 * Quantos pontos de L* separam o maior valor do menor, no mínimo.
 *
 * Existe por causa do bug real: com os sinais de desvio herdados do tema escuro,
 * o azul tinha 1 ponto de L* entre a barra maior e a menor. Passava em
 * contraste, passava em ΔE entre alguns pares, e não ordenava nada.
 */
const AMPLITUDE_L_MINIMA = 8;

// ─────────────────────────────────────────────────────────────────────────────
// Colorimetria. Implementada aqui, e não importada, de propósito: um teste que
// usa o mesmo utilitário do código sob teste não testa o utilitário.
// ─────────────────────────────────────────────────────────────────────────────

type RGB = [number, number, number];

/** `hsl(H S% L%)` — a forma exata que `corDaSerie` devolve — para RGB 0..1. */
function hslStringParaRgb(css: string): RGB {
  const m = css.match(/hsl\(\s*([-\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/);
  if (!m) throw new Error(`corDaSerie devolveu algo que não é hsl(): ${css}`);

  const matiz = ((Number(m[1]) % 360) + 360) % 360;
  const s = Math.min(100, Math.max(0, Number(m[2]))) / 100;
  const l = Number(m[3]) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((matiz / 60) % 2) - 1));
  const m0 = l - c / 2;

  const [r, g, b] =
    matiz < 60
      ? [c, x, 0]
      : matiz < 120
        ? [x, c, 0]
        : matiz < 180
          ? [0, c, x]
          : matiz < 240
            ? [0, x, c]
            : matiz < 300
              ? [x, 0, c]
              : [c, 0, x];

  return [r + m0, g + m0, b + m0];
}

function hexParaRgb(hex: string): RGB {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

/** Luminância relativa WCAG 2.x. */
function luminancia([r, g, b]: RGB): number {
  const canal = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contraste(a: RGB, b: RGB): number {
  const [x, y] = [luminancia(a), luminancia(b)];
  const [claro, escuro] = x > y ? [x, y] : [y, x];
  return (claro + 0.05) / (escuro + 0.05);
}

/** CIE L*a*b* com iluminante D65, como o `DESIGN.md` §3 pressupõe. */
function lab([r, g, b]: RGB): [number, number, number] {
  const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const [R, G, B] = [linear(r), linear(g), linear(b)];

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const Y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const Z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);

  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

function deltaE76(a: RGB, b: RGB): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

const superficie = hexParaRgb(SUPERFICIE_DO_CARD);
const cor = (slot: number, i: number, quantos: number) =>
  hslStringParaRgb(corDaSerie(slot, i, quantos));

// ─────────────────────────────────────────────────────────────────────────────

describe("paleta de série na superfície clara", () => {
  it(`todo degrau de todo slot passa ${CONTRASTE_MINIMO}:1 contra a superfície do card`, () => {
    const reprovados: string[] = [];

    for (let slot = 0; slot < QUANTOS_SLOTS; slot++) {
      // Toda quantidade de degraus que os consumidores podem pedir, porque a
      // luminosidade de um degrau depende de `quantos`: o mesmo `i` sai mais
      // escuro numa rampa de 2 do que numa de 6.
      for (let quantos = 1; quantos <= MAIOR_RAMPA; quantos++) {
        for (let i = 0; i < quantos; i++) {
          const razao = contraste(cor(slot, i, quantos), superficie);
          if (razao < CONTRASTE_MINIMO) {
            reprovados.push(
              `slot ${slot} · rampa de ${quantos} · degrau ${i} → ${razao.toFixed(2)}:1`,
            );
          }
        }
      }
    }

    expect(reprovados).toEqual([]);
  });

  it(`degraus vizinhos ficam distinguíveis (ΔE76 ≥ ${DELTA_E_MINIMO})`, () => {
    const reprovados: string[] = [];

    for (let slot = 0; slot < QUANTOS_SLOTS; slot++) {
      for (let i = 0; i < MAIOR_RAMPA - 1; i++) {
        const e = deltaE76(cor(slot, i, MAIOR_RAMPA), cor(slot, i + 1, MAIOR_RAMPA));
        if (e < DELTA_E_MINIMO) {
          reprovados.push(`slot ${slot} · degraus ${i}/${i + 1} → ΔE ${e.toFixed(1)}`);
        }
      }
    }

    expect(reprovados).toEqual([]);
  });

  it("o maior valor é o mais escuro, e a rampa tem amplitude de verdade", () => {
    // Os três consumidores (`VizBar`, `VizStackedBar`, `VizPie`) ordenam por
    // valor decrescente, então `i = 0` é sempre o maior. Numa superfície clara
    // quem salta é o escuro — e é o que o `DESIGN.md` §3 pede literalmente:
    // "mais escuro = maior".
    const reprovados: string[] = [];

    for (let slot = 0; slot < QUANTOS_SLOTS; slot++) {
      const claridadeDoMaior = lab(cor(slot, 0, MAIOR_RAMPA))[0];
      const claridadeDoMenor = lab(cor(slot, MAIOR_RAMPA - 1, MAIOR_RAMPA))[0];
      const amplitude = claridadeDoMenor - claridadeDoMaior;

      if (amplitude < AMPLITUDE_L_MINIMA) {
        reprovados.push(
          `slot ${slot} → L* ${claridadeDoMaior.toFixed(0)} no maior valor e ` +
            `${claridadeDoMenor.toFixed(0)} no menor (amplitude ${amplitude.toFixed(0)})`,
        );
      }
    }

    expect(reprovados).toEqual([]);
  });

  it("uma série sozinha recebe o tom forte, não o fraco", () => {
    // `quantos <= 1` é o caso do card de uma barra só. Devolver o tom mais claro
    // ali deixaria o card inteiro pálido sem motivo.
    for (let slot = 0; slot < QUANTOS_SLOTS; slot++) {
      const sozinha = lab(cor(slot, 0, 1))[0];
      const maisFraco = lab(cor(slot, MAIOR_RAMPA - 1, MAIOR_RAMPA))[0];
      expect(sozinha).toBeLessThan(maisFraco);
    }
  });

  it("slot fora da faixa cicla em vez de estourar", () => {
    // `Inicio.tsx` passa a posição do card na grade, que cresce sem limite.
    for (const slot of [-1, 0, QUANTOS_SLOTS, QUANTOS_SLOTS * 3 + 2]) {
      expect(corDaSerie(slot, 0, 4)).toMatch(/^hsl\(/);
    }
  });
});

describe("corDeSerieUnica — a linha do VizLinha", () => {
  it("todos os 7 slots passam no piso de contraste sobre o cartão claro", () => {
    const superficie = hexParaRgb(SUPERFICIE_DO_CARD);
    for (let slot = 0; slot < QUANTOS_SLOTS; slot++) {
      const razao = contraste(hslStringParaRgb(corDeSerieUnica(slot)), superficie);
      expect(
        razao,
        `slot ${slot}: ${razao.toFixed(2)}:1 sobre ${SUPERFICIE_DO_CARD}`,
      ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    }
  });

  it("⚠️ é MAIS CLARO que o degrau escuro da rampa — é o ponto da função", () => {
    // A rampa multi-categoria manda o MAIOR valor para o tom mais escuro
    // (`corDaSerie(slot, 0, 1)` → t = 1). Numa série única isso dava uma linha
    // quase preta: azul L=25, verde e aqua L=14. Este teste trava a diferença,
    // para que ninguém "unifique" as duas funções e traga o problema de volta.
    const superficie = hexParaRgb(SUPERFICIE_DO_CARD);
    for (let slot = 0; slot < QUANTOS_SLOTS; slot++) {
      const daRampa = contraste(hslStringParaRgb(corDaSerie(slot, 0, 1)), superficie);
      const unica = contraste(hslStringParaRgb(corDeSerieUnica(slot)), superficie);
      // Mais claro = MENOS contraste contra superfície clara.
      expect(unica, `slot ${slot}`).toBeLessThan(daRampa);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A paleta do TEMA ESCURO
//
// Mesmos três critérios da superfície clara, contra a outra superfície. Existe
// porque nenhum par de luminosidades serve aos dois fundos: no claro o contraste
// vem de escurecer e o TETO de cada matiz aperta; no escuro vem de clarear e o
// PISO manda. A paleta clara medida no escuro passava com folga desperdiçada
// (5,5:1) e cor mais escura do que precisava — foi o que a revisão visual
// reprovou como "cor sem diferença em relação ao fundo".
//
// ⚠️ Este bloco é a trava que impede a tabela escura de ser ajustada "a olho".
// Sem ele, mexer num número de `MATIZES_ESCURO` não quebraria nada.
// ─────────────────────────────────────────────────────────────────────────────

describe("paleta de série na superfície ESCURA", () => {
  const superficieEscura = hexParaRgb(SUPERFICIE_DO_CARD_ESCURO);
  const corEscura = (slot: number, i: number, quantos: number) =>
    hslStringParaRgb(corDaSerie(slot, i, quantos, "escuro"));

  it(`todo degrau de todo slot passa ${CONTRASTE_MINIMO}:1 contra o cartão escuro`, () => {
    const reprovados: string[] = [];
    for (let slot = 0; slot < QUANTOS_SLOTS; slot++) {
      for (let quantos = 1; quantos <= MAIOR_RAMPA; quantos++) {
        for (let i = 0; i < quantos; i++) {
          const razao = contraste(corEscura(slot, i, quantos), superficieEscura);
          if (razao < CONTRASTE_MINIMO) {
            reprovados.push(
              `slot ${slot} · rampa de ${quantos} · degrau ${i} → ${razao.toFixed(2)}:1`,
            );
          }
        }
      }
    }
    expect(reprovados).toEqual([]);
  });

  it(`degraus vizinhos ficam distinguíveis (ΔE76 ≥ ${DELTA_E_MINIMO})`, () => {
    const reprovados: string[] = [];
    for (let slot = 0; slot < QUANTOS_SLOTS; slot++) {
      for (let i = 0; i < MAIOR_RAMPA - 1; i++) {
        const e = deltaE76(
          corEscura(slot, i, MAIOR_RAMPA),
          corEscura(slot, i + 1, MAIOR_RAMPA),
        );
        if (e < DELTA_E_MINIMO) {
          reprovados.push(`slot ${slot} · degraus ${i}/${i + 1} → ΔE ${e.toFixed(1)}`);
        }
      }
    }
    expect(reprovados).toEqual([]);
  });

  it(`o maior valor se separa do menor por ≥ ${AMPLITUDE_L_MINIMA} pontos de L*`, () => {
    // A trava contra o bug histórico do azul: 1 ponto de L* entre a barra maior e
    // a menor passava em contraste e não ordenava nada.
    const reprovados: string[] = [];
    for (let slot = 0; slot < QUANTOS_SLOTS; slot++) {
      const maior = lab(corEscura(slot, 0, MAIOR_RAMPA))[0];
      const menor = lab(corEscura(slot, MAIOR_RAMPA - 1, MAIOR_RAMPA))[0];
      const amplitude = Math.abs(maior - menor);
      if (amplitude < AMPLITUDE_L_MINIMA) {
        reprovados.push(`slot ${slot} → ${amplitude.toFixed(1)} pontos de L*`);
      }
    }
    expect(reprovados).toEqual([]);
  });

  it("⭐ a rampa INVERTE de sentido: no escuro o maior valor é o mais CLARO", () => {
    // É a diferença conceitual entre os dois temas, e a que alguém mais
    // provavelmente "corrigiria" por engano ao unificar as tabelas. No claro o
    // maior valor recebe o tom escuro; aqui, o claro. Os dois seguem a MESMA
    // ideia — "maior valor, mais contraste contra o fundo" — em fundos opostos.
    for (let slot = 0; slot < QUANTOS_SLOTS; slot++) {
      const lMaiorValor = lab(corEscura(slot, 0, MAIOR_RAMPA))[0];
      const lMenorValor = lab(corEscura(slot, MAIOR_RAMPA - 1, MAIOR_RAMPA))[0];
      expect(lMaiorValor, `slot ${slot} no escuro`).toBeGreaterThan(lMenorValor);

      // E no claro é o oposto, no mesmo slot.
      const claroMaior = lab(hslStringParaRgb(corDaSerie(slot, 0, MAIOR_RAMPA)))[0];
      const claroMenor = lab(
        hslStringParaRgb(corDaSerie(slot, MAIOR_RAMPA - 1, MAIOR_RAMPA)),
      )[0];
      expect(claroMaior, `slot ${slot} no claro`).toBeLessThan(claroMenor);
    }
  });

  it("corDeSerieUnica passa no piso e é MAIS CLARA que no tema claro", () => {
    for (let slot = 0; slot < QUANTOS_SLOTS; slot++) {
      const escura = hslStringParaRgb(corDeSerieUnica(slot, "escuro"));
      expect(
        contraste(escura, superficieEscura),
        `slot ${slot} sobre o cartão escuro`,
      ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);

      // A linha do tema escuro tem de ser mais luminosa que a do claro; se as
      // duas fossem iguais, a segunda tabela não estaria sendo usada.
      const clara = hslStringParaRgb(corDeSerieUnica(slot, "claro"));
      expect(lab(escura)[0], `slot ${slot}`).toBeGreaterThan(lab(clara)[0]);
    }
  });
});
