import accenture from "@/assets/partners/accenture.png";
import grupoSafra from "@/assets/partners/grupo-safra.png";
import bain from "@/assets/partners/bain.png";
import bcg from "@/assets/partners/bcg.png";
import hig from "@/assets/partners/hig.webp";

type Partner = { name: string; logo?: string; maxH: number; maxW: number };

const partners: Partner[] = [
  { name: "Accenture", logo: accenture, maxH: 34, maxW: 130 },
  { name: "Grupo Safra", logo: grupoSafra, maxH: 34, maxW: 130 },
  { name: "Bain & Company", logo: bain, maxH: 58, maxW: 173 },
  { name: "BCG", logo: bcg, maxH: 34, maxW: 130 },
  { name: "H.I.G. Capital", logo: hig, maxH: 92, maxW: 253 },
  { name: "L'Oréal", maxH: 34, maxW: 130 },
  { name: "McKinsey", maxH: 58, maxW: 173 },
  { name: "Oliver Wyman", maxH: 34, maxW: 130 },
  { name: "Stone", maxH: 34, maxW: 130 },
];

function PartnerLogo({ partner }: { partner: Partner }) {
  return (
    <div
      className="flex items-center justify-center flex-shrink-0"
      style={{ height: partner.maxH, width: partner.maxW }}
    >
      {partner.logo ? (
        <img
          src={partner.logo}
          alt={partner.name}
          className="h-full w-full object-contain grayscale opacity-65"
          style={{ maxHeight: partner.maxH, maxWidth: partner.maxW }}
        />
      ) : (
        <span className="text-[15px] font-bold tracking-wide text-muted-foreground/70 whitespace-nowrap">
          {partner.name}
        </span>
      )}
    </div>
  );
}

export function PartnersSection() {
  const doubled = [...partners, ...partners];

  return (
    <section className="bg-background py-12 pb-16 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[220px] rounded-full bg-primary/[0.04] blur-[90px] pointer-events-none" />

      <div className="text-center text-[13px] font-semibold tracking-wide text-muted-foreground mb-7 relative z-10">
        Empresas parceiras da Poli Júnior
      </div>
      <div
        className="overflow-hidden relative z-10"
        style={{
          maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
          WebkitMaskImage:
            "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
        }}
      >
        <div className="flex items-center gap-16 w-max animate-marquee">
          {doubled.map((partner, i) => (
            <PartnerLogo key={`${partner.name}-${i}`} partner={partner} />
          ))}
        </div>
      </div>
    </section>
  );
}
