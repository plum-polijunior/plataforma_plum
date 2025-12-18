import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "Os dados da minha empresa estão seguros?",
    answer: "Sim. Utilizamos criptografia de ponta a ponta e estamos em conformidade com a LGPD. Os dados permanecem nos servidores da sua empresa — o Plumb apenas faz a consulta sob demanda.",
  },
  {
    question: "O Plumb substitui o BI da minha empresa?",
    answer: "Não. O Plumb complementa seu BI existente, oferecendo uma camada de acesso simplificada via WhatsApp para consultas rápidas. Para análises profundas, seu BI continua sendo a ferramenta ideal.",
  },
  {
    question: "Quais sistemas o Plumb integra?",
    answer: "Integramos com os principais ERPs (SAP, TOTVS, Oracle), bancos de dados SQL, planilhas Google/Excel, APIs REST e diversas outras fontes de dados. Caso seu sistema não esteja listado, entre em contato.",
  },
  {
    question: "O agente de IA pode cometer erros?",
    answer: "Sim, como qualquer IA. Por isso, toda resposta do agente inclui uma nota de confiabilidade e a fonte dos dados. Recomendamos validar insights importantes com seu time de dados.",
  },
  {
    question: "Quanto tempo leva a implantação?",
    answer: "Em média, 2 a 4 semanas, dependendo da complexidade das integrações. Projetos simples podem ser entregues em menos de 1 semana.",
  },
  {
    question: "Preciso instalar algum software?",
    answer: "Não. O Plumb funciona 100% via WhatsApp. Não é necessário instalar aplicativos ou acessar painéis — tudo acontece na conversa.",
  },
  {
    question: "Posso personalizar os relatórios automáticos?",
    answer: "Sim. Você define quais métricas receber, em qual frequência (diária, semanal, mensal) e quem deve receber cada relatório.",
  },
  {
    question: "Qual o custo do Plumb?",
    answer: "O modelo é por assinatura, com planos baseados no volume de consultas e número de usuários. Entre em contato para uma proposta personalizada.",
  },
  {
    question: "O Plumb funciona em grupo de WhatsApp?",
    answer: "Sim, é possível configurar o bot para responder em grupos específicos, permitindo que times inteiros tenham acesso às informações operacionais.",
  },
  {
    question: "Como faço para testar?",
    answer: "Solicite uma demonstração pelo formulário de contato. Agendaremos uma call para entender suas necessidades e mostrar o Plumb em ação.",
  },
];

export function FAQSection() {
  return (
    <section
      id="faq"
      className="min-h-screen flex items-center justify-center py-20 px-4 relative overflow-hidden scroll-snap-start"
    >
      {/* Background glow */}
      <div className="absolute top-1/2 left-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-y-1/2" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />

      <div className="container mx-auto max-w-3xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gradient mb-4">
            FAQ
          </h2>
          <p className="text-muted-foreground">
            Perguntas frequentes sobre o Plumb.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
          className="glass rounded-2xl p-6"
        >
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border-border/30">
                <AccordionTrigger className="text-left text-foreground hover:text-primary transition-colors py-4">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed pb-4">
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