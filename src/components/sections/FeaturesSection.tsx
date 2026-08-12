import { motion } from "framer-motion";
import {
  BellRing,
  Brain,
  LayoutDashboard,
  MessageCircle,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

interface Card {
  Icone: LucideIcon;
  titulo: string;
  texto: string;
  exemplo?: string;
}

/**
 * Os seis cartões, na ordem definida com o usuário em 2026-08-12.
 *
 * Três vieram do "O que somos" do protótipo (Multi canal, Níveis de acesso,
 * Automação e alertas), um já existia aqui (Agentes de IA), e dois foram
 * escritos agora: "Dashboards automáticos em tempo real" e "Proteção de dados".
 *
 * ⚠️ A copy dos dois novos descreve o que o código faz hoje, e não o que seria
 * bom prometer. "Recalcula sozinho" é o `refresh_interval_minutes` dos
 * `dashboard_cards`; "cada cargo enxerga só as colunas liberadas" é o
 * `allowed_columns` por par (cargo, base); "nenhuma linha bruta sai" é a trava
 * `RawRowsBlocked` do executor, que recusa qualquer plano sem agregação. Se
 * alguma dessas três deixar de ser verdade, a frase correspondente sai daqui.
 *
 * Saiu da lista: "Consulta de dados históricos" — decisão do usuário.
 *
 * O cabeçalho da seção ("Funcionalidades" / "Consulta e entrega de dados, no
 * seu ritmo." / subtítulo) e o bloco "Como funciona" (os três passos: Você
 * pergunta / Plum consulta / Você recebe a resposta) saíram em 2026-08-12, a
 * pedido do usuário — a seção passou a ser só os seis cartões.
 */
const CARDS: Card[] = [
  {
    Icone: LayoutDashboard,
    titulo: "Dashboards automáticos em tempo real",
    texto:
      "Transforme uma pergunta em card fixo na sua página inicial. Ele recalcula sozinho, no intervalo que você definir, sem ninguém reabrir planilha.",
    exemplo: "Faturamento por loja, atualizado a cada hora.",
  },
  {
    Icone: ShieldCheck,
    titulo: "Proteção de dados",
    texto:
      "Os dados continuam na sua planilha — o Plum só lê, nunca escreve. Também, todas as requisições passam por conexões seguras e autenticadas.",
  },
  {
    Icone: Users,
    titulo: "Níveis de acesso",
    texto:
      "Solução interna da empresa: cada pessoa enxerga só o que faz sentido pra sua função, com níveis de acesso configuráveis por cargo e por base.",
      exemplo: "O gerente pode ver os dados de todas as lojas, o vendedor só os da dele.",
  },
  {
    Icone: MessageCircle,
    titulo: "Multi canal",
    texto:
      "No WhatsApp do dia a dia, no telegram, na plataforma web... sem trocar de ferramenta.",
  },
  {
    Icone: BellRing,
    titulo: "Automação e alertas",
    texto: "Relatórios periódicos, lembretes e avisos automáticos.",
    exemplo: "Toda segunda, envie a média de faturamento da semana anterior",
  },
  {
    Icone: Brain,
    titulo: "O Plum é um restaurante",
    texto:
      "Você é o cliente. A IA é o garçom. O código é o cozinheiro. No chat do Plum, a IA não lê suas planilhas, ela usa o contexto delas pra orientar o código a retornar o dado certo.",
    exemplo:
      "Você: 'Qual foi o faturamento mês passado?'\nIA: 'Código, pegue os dado da coluna Faturamento que tenham data entre 01/08 e 31/08 e some-os'\nCódigo: 'R$ 1.234.567,89'.",
  },
];

export function FeaturesSection() {
  return (
    <section
      id="funcionalidades"
      className="relative overflow-hidden bg-background px-6 py-[110px]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 h-[380px] w-[380px] rounded-full bg-accent/20 blur-3xl"
      />

      <div className="relative mx-auto max-w-[1100px]">
        {/* Só o rótulo — sem título nem subtítulo, a pedido do usuário. Sem
            ele a seção ficava sem nenhuma pista visual de onde se está,
            inconsistente com "O que somos" / "FAQ" / "Localização", que
            sempre abrem com esse mesmo rótulo em letras miúdas. */}
        <p className="text-[12.5px] font-semibold uppercase tracking-[1.5px] text-primary">
          Funcionalidades
        </p>

        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card, i) => (
            <motion.div
              key={card.titulo}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
              className="flex flex-col rounded-[20px] border border-border bg-card p-7 shadow-sm transition-shadow duration-300 hover:shadow-md"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/[0.16] to-accent/40">
                <card.Icone className="h-5 w-5 text-primary" strokeWidth={1.8} />
              </div>

              <h3 className="mt-5 text-[17px] font-semibold leading-snug text-foreground">
                {card.titulo}
              </h3>
              <p className="mt-2.5 flex-1 text-[14.5px] leading-[1.6] text-muted-foreground">
                {card.texto}
              </p>

              {card.exemplo && (
                <div className="mt-5 rounded-xl bg-muted/60 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Exemplo
                  </p>
                  {/* `whitespace-pre-line` é o que faz o `\n` da string virar
                      quebra de linha de verdade — sem ele, `white-space:
                      normal` (o default) colapsa `\n` num espaço, igual
                      aconteceria com `</br>` (que nem é uma tag válida) dentro
                      de uma string interpolada: o React escapa o conteúdo,
                      então a tag apareceria como texto na tela em vez de
                      quebrar a linha. */}
                  <p className="mt-1.5 whitespace-pre-line text-[13.5px] italic leading-snug text-primary">
                    “{card.exemplo}”
                  </p>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
