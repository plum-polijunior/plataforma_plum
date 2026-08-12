import { motion } from "framer-motion";

const SETORES = [
  "Varejo",
  "Indústria",
  "E-commerce",
  "Financeiro",
  "Agências de Marketing",
  "Consultórios",
];

/**
 * "O que somos".
 *
 * Reescrito em 2026-08-12 com o novo design. O que saiu da versão anterior: os
 * três cartões "O Problema / O Contexto / A Solução" e o bloco animado
 * "Para quem" (`ui/database-with-rest-api.tsx`, removido) — os mesmos seis
 * setores agora são uma linha de texto, que diz a mesma coisa sem uma animação
 * de fios entre caixas.
 *
 * Duas coisas do protótipo NÃO foram portadas, de propósito:
 *
 *   1. Os três cartões "Multi-canal / Níveis de acesso / Automação e alertas".
 *      Eles viraram cartões de Funcionalidades, onde não competem com a
 *      explicação do que o produto é.
 *
 *   2. O bloco de depoimento em vídeo. Ele traz um botão de play que não toca
 *      nada e a frase "Veja como o Plum mudou a rotina da nossa operação" entre
 *      aspas, que se apresenta como fala de um cliente. Não existe esse cliente
 *      nem esse vídeo. Entra quando houver os dois.
 */
export function AboutSection() {
  return (
    <section id="sobre" className="relative overflow-hidden bg-secondary px-6 py-[110px]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 left-1/4 h-[380px] w-[380px] rounded-full bg-primary/[0.06] blur-3xl"
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6 }}
        className="relative mx-auto max-w-[1100px]"
      >
        <p className="text-[12.5px] font-semibold uppercase tracking-[1.5px] text-primary">
          O que somos
        </p>

        <h2
          className="text-gradient mt-3 font-bold leading-[1.15] tracking-[-0.02em]"
          style={{ fontSize: "clamp(30px, 4vw, 44px)" }}
        >
          Mais do que um chatbot.
        </h2>

        <p className="mt-6 max-w-[720px] text-[17px] leading-[1.65] text-muted-foreground">
          Dados dispersos custam tempo e atrasam decisões. Plum conecta sua equipe ao banco
          de dados da empresa e transforma qualquer pergunta em resposta imediata.
        </p>

        <p className="text-gradient mt-4 text-[19px] font-bold">
          Dados viram insights. Insights viram ação.
        </p>

        <div className="mt-12">
          <p className="text-[13px] font-semibold text-foreground">No seu setor:</p>
          <ul className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            {SETORES.map((setor, i) => (
              <li key={setor} className="flex items-center gap-3">
                {i > 0 && (
                  <span aria-hidden="true" className="text-muted-foreground/40">
                    ·
                  </span>
                )}
                <span className="text-[15px] text-secondary-foreground">{setor}</span>
              </li>
            ))}
          </ul>
        </div>
      </motion.div>
    </section>
  );
}
