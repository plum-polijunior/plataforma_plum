import { motion } from "framer-motion";
import { ContactForm } from "@/components/ContactForm";
import { FundoAnimado } from "./FundoAnimado";
import { MascoteAnimado } from "./MascoteAnimado";

/**
 * Só reestilizada em 2026-08-12. O `ContactForm` (e o `MultiStepForm` por trás
 * dele) não foi tocado: ele grava em `Leads` e dispara o e-mail de aviso, e
 * essa é a única parte da landing que escreve em algum lugar.
 *
 * Desde 2026-08-14 esta seção usa o mesmo vídeo de fundo do hero. Ela fecha a
 * página como o hero a abre — e o arquivo é o mesmo, então não há download
 * extra: o navegador já o tem em cache desde o topo.
 */
export function ContactSection() {
  return (
    <section id="contato" className="relative overflow-hidden bg-background px-6 py-[110px]">
      <FundoAnimado />

      {/* Véu, pelo mesmo motivo do hero: o formulário e o texto precisam de
          contraste garantido em QUALQUER quadro do vídeo. Aqui ele é mais
          fechado do que no hero — lá o conteúdo é um título curto e de peso
          alto, aqui há campos de formulário e rótulos pequenos. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-background/85 backdrop-blur-[3px]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background"
      />

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
          <div
            className="mx-auto h-[72px] w-[72px]"
            style={{ filter: "drop-shadow(0 10px 18px hsl(329 44% 33% / 0.22))" }}
          >
            <MascoteAnimado className="h-full w-full" />
          </div>
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
