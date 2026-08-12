import { motion } from "framer-motion";
import { ContactForm } from "@/components/ContactForm";
import plumMascote from "@/assets/plum-mascot-transparent.png";

/**
 * Só reestilizada em 2026-08-12. O `ContactForm` (e o `MultiStepForm` por trás
 * dele) não foi tocado: ele grava em `Leads` e dispara o e-mail de aviso, e
 * essa é a única parte da landing que escreve em algum lugar.
 */
export function ContactSection() {
  return (
    <section id="contato" className="relative overflow-hidden bg-background px-6 py-[110px]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-1/4 top-1/4 h-[420px] w-[420px] rounded-full bg-accent/25 blur-3xl"
      />

      <div className="relative mx-auto max-w-[520px]">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <img
            src={plumMascote}
            alt=""
            aria-hidden="true"
            className="mx-auto h-[72px] object-contain"
            style={{ filter: "drop-shadow(0 10px 18px hsl(329 44% 33% / 0.22))" }}
          />
          <h2
            className="text-gradient mt-6 font-bold leading-[1.15] tracking-[-0.02em]"
            style={{ fontSize: "clamp(30px, 4vw, 44px)" }}
          >
            Vamos conversar?
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-muted-foreground">
            Deixe seus dados e entraremos em contato para entender suas necessidades.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-10 rounded-[20px] border border-border bg-card p-8 shadow-sm"
        >
          <ContactForm />
        </motion.div>

        <p className="mt-14 text-center text-[13px] leading-[1.7] text-muted-foreground/70">
          © Plum — Direitos Reservados 2026
          <br />
          Um projeto do Núcleo de Inovação — Poli Júnior
        </p>
      </div>
    </section>
  );
}
