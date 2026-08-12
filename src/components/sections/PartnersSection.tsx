import accenture from "@/assets/partners/accenture.png";
import bain from "@/assets/partners/bain.png";
import bcg from "@/assets/partners/bcg.png";
import grupoSafra from "@/assets/partners/grupo-safra.png";
import higCapital from "@/assets/partners/hig-capital.png";
import loreal from "@/assets/partners/loreal.png";
import mckinsey from "@/assets/partners/mckinsey.png";
import oliverWyman from "@/assets/partners/oliver-wyman.png";
import stone from "@/assets/partners/stone.png";

/**
 * Faixa de parceiros da Poli Júnior. Os nove agora têm logo.
 *
 * A maioria veio de `z_mascot_and_background/` com bastante moldura
 * transparente ao redor da marca — a Stone, por exemplo, chegou num canvas
 * quadrado de 4096×4096 com o logotipo ocupando só a faixa central.
 * Recortados com `sharp({ trim })` antes de entrar em `src/assets/partners/`:
 * sem o recorte, `object-contain` escalaria a moldura vazia junto, e a Stone
 * teria saído minúscula perto das outras oito.
 */
const PARCEIROS: { nome: string; logo: string; maxH: number; maxW: number }[] = [
  { nome: "Accenture", logo: accenture, maxH: 34, maxW: 130 },
  { nome: "Grupo Safra", logo: grupoSafra, maxH: 34, maxW: 130 },
  { nome: "Bain & Company", logo: bain, maxH: 58, maxW: 173 },
  { nome: "BCG", logo: bcg, maxH: 34, maxW: 130 },
  // Composição em grade (H. I. G. + "CAPITAL" pequeno embaixo) — mais alto que
  // os wordmarks simples, senão o "CAPITAL" vira ruído ilegível.
  { nome: "H.I.G. Capital", logo: higCapital, maxH: 84, maxW: 172 },
  { nome: "L'Oréal", logo: loreal, maxH: 30, maxW: 170 },
  { nome: "McKinsey & Company", logo: mckinsey, maxH: 34, maxW: 120 },
  // Tão largo quanto a H.I.G. era antes — o par ícone + "OliverWyman" não
  // cabe mais estreito sem ficar ilegível.
  { nome: "Oliver Wyman", logo: oliverWyman, maxH: 30, maxW: 253 },
  { nome: "Stone", logo: stone, maxH: 34, maxW: 135 },
];

export function PartnersSection() {
  return (
    <section className="border-y border-border/60 bg-secondary py-12">
      <p className="mb-8 text-center text-[13px] font-semibold tracking-wide text-muted-foreground">
        Empresas parceiras da Poli Júnior
      </p>

      {/* A máscara desfaz as duas pontas: sem ela, os logos aparecem e somem
          com um corte reto na borda da tela. */}
      <div
        className="overflow-hidden"
        style={{
          maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
        }}
      >
        {/* A lista é renderizada DUAS vezes seguidas e a animação desliza
            exatamente metade da largura total (`translateX(-50%)`, ver
            `.animate-marquee` em `index.css`) — no instante em que o laço
            reinicia (100% → 0%), a segunda cópia já está pixel a pixel onde a
            primeira estava no início.

            ⚠️ O espaçamento entre os itens é MARGEM em cada um (`mr-16`), não
            `gap` no container flex — de propósito, e não é só estilo. Com
            `gap`, um container de N itens tem só N-1 espaçamentos (o CSS não
            gruda um "gap final" depois do último item); duplicando a lista
            para 18 itens, a metade exata da largura total fica meio `gap`
            (32px) à frente de onde a segunda cópia realmente começa, e o laço
            dá um pulinho visível a cada volta. Com margem em CADA item —
            inclusive o último da segunda cópia, que nunca chega a ficar
            visível — cada cópia (9 itens) sempre soma exatamente 9 margens, as
            duas cópias somam o dobro, e a metade cai matematicamente em cima
            do início da segunda cópia. `w-max` é o que faz as duas caberem
            numa linha só — com largura limitada elas quebrariam e o cálculo
            de 50% deixaria de valer. */}
        <div className="flex w-max animate-marquee items-center" aria-hidden="true">
          {[...PARCEIROS, ...PARCEIROS].map((p, i) => (
            <div key={`${p.nome}-${i}`} className="mr-16 flex shrink-0 items-center justify-center">
              <img
                src={p.logo}
                alt=""
                className="object-contain opacity-65 grayscale"
                style={{ maxHeight: p.maxH, maxWidth: p.maxW }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* A faixa acima é `aria-hidden` (duplicada e em movimento, ela seria lida
          duas vezes). Esta lista é a versão que o leitor de tela usa. */}
      <p className="sr-only">
        Parceiros: {PARCEIROS.map((p) => p.nome).join(", ")}.
      </p>
    </section>
  );
}
