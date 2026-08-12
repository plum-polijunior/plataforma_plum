import { motion } from "framer-motion";
import { ContactForm } from "@/components/ContactForm";
import plumMascot from "@/assets/plum-mascot-transparent.png";

// `ContactForm` não é substituído — só o entorno visual muda. Ver
// docs/2026-08-12-PLANO-merge-landing-page.md §3.
export function ContactSection() {
  return (
    <section id="contato" className="bg-background py-[110px] px-6 relative overflow-hidden">
      <div className="absolute -top-24 -left-24 w-[380px] h-[380px] rounded-full bg-primary/[0.07] blur-[90px] pointer-events-none" />
      <div className="absolute -bottom-32 -right-16 w-[420px] h-[420px] rounded-full bg-accent/[0.08] blur-[90px] pointer-events-none" />

      <div className="max-w-[520px] mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <img
            src={plumMascot}
            alt="Plum"
            className="h-[72px] w-auto mx-auto mb-5"
            style={{ filter: "drop-shadow(0 8px 14px hsl(329 44% 33% / 0.22))" }}
          />
          <h2 className="text-gradient font-extrabold m-0 mb-3.5 text-[clamp(28px,3.6vw,40px)]">
            Vamos conversar?
          </h2>
          <p className="text-[15px] text-muted-foreground m-0">
            Deixe seus dados e entraremos em contato para entender suas necessidades.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          viewport={{ once: true }}
          className="bg-card border border-border rounded-[20px] p-8 shadow-sm"
        >
          <ContactForm />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          viewport={{ once: true }}
          className="text-center mt-12 text-muted-foreground/70 text-[13px] leading-[1.8]"
        >
          © Plum — Direitos Reservados 2026
          <br />
          Um projeto do Núcleo de Inovação — Poli Júnior
        </motion.div>
      </div>
    </section>
  );
}
