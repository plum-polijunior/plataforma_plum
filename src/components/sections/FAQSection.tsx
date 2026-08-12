import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { MascoteAnimado } from "./MascoteAnimado";

const PERGUNTAS = [
  {
    pergunta: "Meus dados saem da empresa?",
    resposta:
      "Não. O Plum consulta seu banco de dados sob demanda — as informações continuam na infraestrutura da sua empresa.",
  },
  {
    pergunta: "O Plum funciona só no WhatsApp?",
    resposta:
      "Não. Além do WhatsApp, o Plum também roda em uma plataforma web própria — você escolhe o canal que faz mais sentido em cada momento.",
  },
  {
    pergunta: "Como funciona o controle de quem vê o quê?",
    resposta:
      "A plataforma é uma solução interna da sua empresa, com níveis de acesso configuráveis — cada pessoa enxerga apenas o que faz sentido para sua função.",
  },
  {
    pergunta: "Preciso trocar meu banco de dados atual?",
    resposta:
      "Não. O Plum se conecta à estrutura de dados que você já usa hoje e consulta a partir dela.",
  },
  {
    pergunta: "Dá para programar relatórios e lembretes automáticos?",
    resposta:
      "Sim. Você define frequência, destinatário e conteúdo de cada envio, direto a partir do seu banco de dados.",
  },
  {
    pergunta: "O Plum serve para qual tipo de empresa?",
    resposta:
      "Qualquer empresa com dados estruturados: varejo, indústria, financeiro, e-commerce, agências e consultórios, entre outros.",
  },
];

export function FAQSection() {
  return (
    <section id="faq" className="bg-secondary px-6 py-[110px]">
      <div className="mx-auto max-w-[820px]">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center gap-8 sm:flex-row sm:items-end"
        >
          {/* Mascote + balão. Decoração: a fala do balão não acrescenta
              informação ao "Perguntas frequentes" que vem ao lado. */}
          <div aria-hidden="true" className="relative shrink-0">
            <div className="relative mx-auto mb-3 w-fit rounded-2xl border border-border bg-card px-4 py-2 shadow-sm">
              <span className="text-[13px] font-semibold text-primary">
                Bateu alguma dúvida?
              </span>
              <div className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-border bg-card" />
            </div>
            <div
              className="mx-auto w-[172px] animate-cloud-float"
              style={{ filter: "drop-shadow(0 14px 24px hsl(329 44% 33% / 0.22))" }}
            >
              <MascoteAnimado className="aspect-square" />
            </div>
          </div>

          <div className="text-center sm:pb-6 sm:text-left">
            <p className="text-[12.5px] font-semibold uppercase tracking-[1.5px] text-primary">
              FAQ
            </p>
            <h2
              className="text-gradient mt-3 font-bold leading-[1.15] tracking-[-0.02em]"
              style={{ fontSize: "clamp(30px, 4vw, 44px)" }}
            >
              Perguntas frequentes
            </h2>
            <p className="mt-4 text-[16px] leading-[1.6] text-muted-foreground">
              Sobre a plataforma, os dados e como o Plum se encaixa no seu dia a dia.
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-12 rounded-[20px] border border-border bg-card px-7 py-2 shadow-sm"
        >
          <Accordion type="single" collapsible className="w-full">
            {PERGUNTAS.map((item, i) => (
              <AccordionItem key={item.pergunta} value={`item-${i}`}>
                <AccordionTrigger className="text-left text-[15.5px] font-semibold text-foreground hover:no-underline">
                  {item.pergunta}
                </AccordionTrigger>
                <AccordionContent className="text-[14.5px] leading-[1.65] text-muted-foreground">
                  {item.resposta}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
