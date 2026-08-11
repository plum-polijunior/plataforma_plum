import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import plumMascot from "@/assets/plum-mascot-transparent.png";

const faqs = [
  {
    question: "Meus dados saem da empresa?",
    answer:
      "Não. O Plum consulta seu banco de dados sob demanda — as informações continuam na infraestrutura da sua empresa.",
  },
  {
    question: "O Plum funciona só no WhatsApp?",
    answer:
      "Não. Além do WhatsApp, o Plum também roda em uma plataforma web própria — você escolhe o canal que faz mais sentido em cada momento.",
  },
  {
    question: "Como funciona o controle de quem vê o quê?",
    answer:
      "A plataforma é uma solução interna da sua empresa, com níveis de acesso configuráveis — cada pessoa enxerga apenas o que faz sentido para sua função.",
  },
  {
    question: "Preciso trocar meu banco de dados atual?",
    answer: "Não. O Plum se conecta à estrutura de dados que você já usa hoje e consulta a partir dela.",
  },
  {
    question: "Dá para programar relatórios e lembretes automáticos?",
    answer:
      "Sim. Você define frequência, destinatário e conteúdo de cada envio, direto a partir do seu banco de dados.",
  },
  {
    question: "O Plum serve para qual tipo de empresa?",
    answer:
      "Qualquer empresa com dados estruturados: varejo, indústria, financeiro, e-commerce, agências e consultórios, entre outros.",
  },
];

export function FAQSection() {
  return (
    <section id="faq" className="bg-secondary py-[110px] px-6 overflow-hidden">
      <div className="max-w-[820px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          viewport={{ once: true }}
          className="flex items-center justify-center gap-9 flex-wrap mb-12"
        >
          <div className="flex-shrink-0">
            <div className="relative bg-card border border-primary/20 rounded-2xl px-[18px] py-2.5 text-[15px] font-semibold text-[#5c2340] whitespace-nowrap shadow-md mb-2.5 text-center">
              Bateu alguma dúvida?
              <div className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 rotate-45 w-3.5 h-3.5 bg-card border-r border-b border-primary/20" />
            </div>
            <img
              src={plumMascot}
              alt="Mascote Plum"
              className="w-[172px] h-auto animate-cloud-float"
              style={{ filter: "drop-shadow(0 12px 20px hsl(329 44% 33% / 0.25))" }}
            />
          </div>

          <div className="text-left max-w-[420px]">
            <div className="text-[13px] font-bold tracking-[1.5px] uppercase text-primary mb-3.5">
              FAQ
            </div>
            <h2 className="text-gradient font-extrabold m-0 mb-3 text-[clamp(28px,3.6vw,40px)]">
              Perguntas frequentes
            </h2>
            <p className="text-[15px] text-muted-foreground m-0">
              Sobre a plataforma, os dados e como o Plum se encaixa no seu dia a dia.
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          viewport={{ once: true }}
          className="bg-card border border-border rounded-[20px] px-7 py-2 shadow-sm"
        >
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border-border">
                <AccordionTrigger className="text-left text-[15.5px] font-semibold text-foreground hover:text-primary hover:no-underline transition-colors py-[18px]">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-[14.5px] leading-[1.7] text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
