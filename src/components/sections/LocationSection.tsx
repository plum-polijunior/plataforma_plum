import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";

const ENDERECO = "Av. Professor Mello Moraes, 2231 - Butantã, São Paulo - SP";

/**
 * Mapa real do Google Maps, desde 2026-08-12.
 *
 * Antes daqui vinha `ui/expand-map.tsx`: um mapa DESENHADO (SVG com ruas e um
 * pin animados), que nunca foi um mapa de verdade — não navegava, não tinha
 * zoom, não abria em lugar nenhum. Substituído a pedido do usuário por um
 * embed real, que o visitante pode arrastar, dar zoom e abrir no Google Maps.
 *
 * ⚠️ Isto usa o embed CLÁSSICO (`google.com/maps?...&output=embed`), sem
 * chave de API. Ele é gratuito e funciona hoje, mas é o produto legado do
 * Google, não a Maps Embed API oficial — o próprio Google recomenda a versão
 * com chave para uso comercial de longo prazo. Se a organização já tiver (ou
 * vier a ter) uma chave do Google Cloud com a Maps Embed API habilitada, a
 * troca é só a URL do `src` abaixo, por
 * `https://www.google.com/maps/embed/v1/place?key=SUA_CHAVE&q=<endereço>`.
 */
export function LocationSection() {
  const enderecoCodificado = encodeURIComponent(ENDERECO);

  return (
    <section id="localizacao" className="relative overflow-hidden bg-secondary px-6 py-[110px]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/4 top-1/3 h-[380px] w-[380px] rounded-full bg-primary/[0.06] blur-3xl"
      />

      <div className="relative mx-auto max-w-[900px]">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <p className="text-[12.5px] font-semibold uppercase tracking-[1.5px] text-primary">
            Localização
          </p>
          <h2
            className="text-gradient mt-3 font-bold leading-[1.15] tracking-[-0.02em]"
            style={{ fontSize: "clamp(30px, 4vw, 44px)" }}
          >
            Onde estamos
          </h2>
          <p className="mt-4 text-[16px] text-muted-foreground">{ENDERECO}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-12 overflow-hidden rounded-[20px] border border-border shadow-sm"
        >
          <iframe
            title={`Mapa: ${ENDERECO}`}
            src={`https://www.google.com/maps?q=${enderecoCodificado}&z=16&output=embed`}
            className="h-[360px] w-full"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </motion.div>

        <div className="mt-4 text-center">
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${enderecoCodificado}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-primary hover:underline"
          >
            Ver no Google Maps
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
          </a>
        </div>
      </div>
    </section>
  );
}
