import { motion } from "framer-motion";
import plumMascot from "@/assets/plum-mascot-transparent.png";

const steps = [
  {
    n: 1,
    title: "Você pergunta",
    description: "No WhatsApp ou na plataforma web, em linguagem natural.",
  },
  {
    n: 2,
    title: "Plum consulta",
    description:
      "O banco de dados da sua empresa, respeitando o nível de acesso de quem perguntou.",
  },
  {
    n: 3,
    title: "Você recebe a resposta",
    description: "Na hora, ou de forma recorrente — como relatório ou lembrete agendado.",
  },
];

const features = [
  {
    title: "Agente de IA",
    description: "Perguntas abertas sobre a operação, com métricas e nota de confiabilidade.",
    example: '"Qual foi a maior venda já registrada na empresa?"',
  },
  {
    title: "Consulta de dados históricos",
    description: "Acesse métricas e relatórios de qualquer período direto do banco de dados.",
    example: '"Informe a média de faturamento da semana passada"',
  },
  {
    title: "Relatórios e lembretes",
    description: "Relatórios periódicos, lembretes e avisos automáticos.",
    example: '"Toda segunda, envie a média de faturamento da semana anterior"',
  },
];

function ChatBubble({ mine, children }: { mine: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`max-w-[82%] px-3.5 py-2.5 text-sm leading-relaxed ${
        mine
          ? "self-end bg-primary text-primary-foreground rounded-[16px_16px_4px_16px]"
          : "self-start bg-muted border border-border text-foreground rounded-[16px_16px_16px_4px]"
      }`}
    >
      {children}
    </div>
  );
}

export function FeaturesSection() {
  return (
    <section
      id="funcionalidades"
      className="bg-background py-[110px] px-6 relative overflow-hidden"
    >
      <div className="absolute bottom-0 left-[10%] w-[400px] h-[400px] rounded-full bg-accent/5 blur-[90px]" />

      <div className="max-w-[1100px] mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          viewport={{ once: true }}
          className="text-center max-w-[640px] mx-auto mb-16"
        >
          <div className="text-[13px] font-bold tracking-[1.5px] uppercase text-primary mb-3.5">
            Funcionalidades
          </div>
          <h2 className="text-gradient font-extrabold leading-[1.15] text-[clamp(30px,4vw,44px)] mb-4">
            Consulta e entrega de dados, no seu ritmo.
          </h2>
          <p className="text-base text-muted-foreground">
            Perguntas soltas, históricos e relatórios recorrentes — tudo pelo mesmo agente.
          </p>
        </motion.div>

        {/* Como funciona */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-0 mb-[72px] relative">
          <div className="hidden md:block absolute top-[22px] left-[16.6%] right-[16.6%] h-px bg-[repeating-linear-gradient(90deg,hsl(329_44%_33%/0.25)_0,hsl(329_44%_33%/0.25)_6px,transparent_6px,transparent_12px)] z-0" />
          {steps.map((step) => (
            <div key={step.n} className="text-center relative z-10 px-4">
              <div className="w-11 h-11 rounded-full bg-primary text-primary-foreground text-[17px] font-bold flex items-center justify-center mx-auto mb-4">
                {step.n}
              </div>
              <h4 className="text-base font-bold text-foreground mb-2">{step.title}</h4>
              <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        {/* Simulation */}
        <div className="mb-16">
          <div className="text-center mb-5">
            <h3 className="text-[22px] font-bold text-foreground mb-1.5">Simule o Plum</h3>
            <p className="text-sm text-muted-foreground/80">
              Prévia estática do formato de conversa — a simulação interativa chega em breve.
            </p>
          </div>
          <div className="max-w-[520px] mx-auto relative">
            <div className="absolute -top-3 right-4 z-10 px-3.5 py-1 rounded-full bg-card border border-primary/30 text-xs font-bold text-primary tracking-wide shadow-sm">
              EM BREVE
            </div>
            <div className="bg-card border border-border rounded-[22px] overflow-hidden shadow-md">
              <div className="flex items-center gap-3 p-4 border-b border-border bg-muted/60">
                <div className="w-[38px] h-[38px] rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                  <img src={plumMascot} alt="" className="w-[26px] h-[26px] object-contain" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">Plum Assistant</div>
                  <div className="text-xs text-muted-foreground">Pré-visualização</div>
                </div>
              </div>
              <div className="p-5 flex flex-col gap-3">
                <ChatBubble mine>Qual foi o faturamento de ontem na loja Centro?</ChatBubble>
                <ChatBubble mine={false}>
                  Ontem a loja Centro faturou R$ 18.430,00 — 12% acima da média das
                  últimas 4 terças-feiras.
                </ChatBubble>
                <ChatBubble mine>E comparado ao mesmo dia do mês passado?</ChatBubble>
                <ChatBubble mine={false}>
                  23% maior. Quer que eu envie esse comparativo toda semana?
                </ChatBubble>
              </div>
              <div className="p-3 px-4 border-t border-border flex gap-2.5">
                <div className="flex-1 h-[38px] rounded-[10px] bg-muted/60 border border-border flex items-center px-3 text-[13px] text-muted-foreground/60">
                  Pergunte sobre seus dados...
                </div>
                <div className="w-[38px] h-[38px] rounded-[10px] bg-primary/10 border border-primary/20 opacity-50" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.12 }}
              viewport={{ once: true }}
              className="bg-card border border-border rounded-[20px] p-7 shadow-sm"
            >
              <h3 className="text-lg font-bold text-foreground mb-2.5">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground mb-4.5">
                {feature.description}
              </p>
              <div className="bg-muted/60 border border-border rounded-xl p-3.5">
                <div className="text-[11px] text-muted-foreground/70 mb-1">Exemplo:</div>
                <div className="text-[13.5px] text-primary italic">{feature.example}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
