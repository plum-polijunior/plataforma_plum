/**
 * Renderiza a resposta do Agente C como Markdown, dentro da bolha do chat.
 *
 * Criado em 2026-08-11. Antes disto `PlumChat.tsx` renderizava `{msg.content}`
 * como texto puro, e o `**R$ 7.800,00**` que o modelo emite aparecia na tela
 * com os asteriscos — junto de dois efeitos menos óbvios: `- item` saía com o
 * hífen literal, e todo `\n\n` colapsava em espaço simples (sem
 * `whitespace-pre-wrap`, o default `white-space: normal` come a quebra), então
 * a resposta virava um parágrafo corrido mesmo quando o modelo separava blocos.
 *
 * Só a bolha do ASSISTENTE passa por aqui. A mensagem do usuário continua texto
 * literal de propósito: é o que ele digitou, e interpretar Markdown ali
 * reescreveria a pergunta dele na tela (um `*` no meio de uma frase viraria
 * itálico, e o caractere que ele digitou desapareceria).
 *
 * O conjunto de elementos é deliberadamente estreito, e o prompt do Agente C
 * (`supabase/functions/ai-plum-chat/index.ts`, ação `synthesize_answer`) pede
 * exatamente este subconjunto: parágrafo, lista com "- " e "**" no valor
 * principal. O mapa abaixo existe para o caso de o modelo sair do combinado —
 * o que ele emitir a mais degrada para algo legível, em vez de estourar a
 * hierarquia visual da página.
 *
 * Não há `rehype-raw`: o `react-markdown` ignora HTML cru por padrão, e é assim
 * que fica. O texto vem de um LLM, e o Markdown que interessa aqui não precisa
 * de HTML nenhum para funcionar.
 */

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Título vira parágrafo em negrito.
 *
 * O prompt proíbe `#`, mas se escapar um, um `<h1>` de verdade dentro de uma
 * bolha de chat competiria com o título da própria página — o mesmo raciocínio
 * do `DESIGN.md` sobre não deixar nada disputar atenção com o número.
 */
const TituloComoParagrafo: Components["h1"] = ({ children }) => (
  <p className="font-semibold">{children}</p>
);

const COMPONENTES: Components = {
  h1: TituloComoParagrafo,
  h2: TituloComoParagrafo,
  h3: TituloComoParagrafo,
  h4: TituloComoParagrafo,
  h5: TituloComoParagrafo,
  h6: TituloComoParagrafo,

  // O prompt não pede link nenhum. Se vier um, abre fora da aba do Plum e sem
  // passar o referrer.
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="underline underline-offset-2"
    >
      {children}
    </a>
  ),

  // Tabela também não é pedida, e é a que quebra pior: a bolha tem largura
  // máxima de 70% no desktop e 85% no celular. Com o scroll horizontal ela
  // fica apertada; sem ele, empurra a largura da conversa inteira.
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="text-xs">{children}</table>
    </div>
  ),
};

interface RespostaMarkdownProps {
  content: string;
}

export function RespostaMarkdown({ content }: RespostaMarkdownProps) {
  return (
    // As cores saem do tema, não da paleta do plugin. O que estava aqui antes
    // eram os modificadores de paleta neutra e de inversão no escuro do
    // `@tailwindcss/typography`, que trazem a escala de cinza própria do
    // plugin: contraria a §7 do CLAUDE.md ("cores só via CSS variables do
    // tema") e briga com o `text-foreground` que a bolha já define. Os
    // modificadores `prose-*:` abaixo amarram cada elemento ao token do tema.
    //
    // ⚠️ Os nomes daquelas duas classes não estão escritos aqui de propósito.
    // O extrator de conteúdo do Tailwind é regex sobre o arquivo inteiro e não
    // entende comentário: citar a classe literalmente faz o plugin gerar o CSS
    // dela — utilitário morto no bundle, só por ter sido mencionado numa
    // explicação. Medido nesta mudança: 2,08 kB.
    //
    // A margem do primeiro e do último bloco não precisa de utilitário: o
    // plugin já emite `.prose > :first-child { margin-top: 0 }` e o par
    // simétrico, então o bloco não ganha espaço morto no topo nem no rodapé.
    //
    // Ajustado em 2026-08-12 para a Direção A: o corpo do texto passou de
    // `foreground` (a tinta cheia) para `ink-soft`, e o `strong` FICOU na tinta
    // cheia. É o que cria a hierarquia da resposta — a frase é legível, o valor
    // principal é o que salta. Com os dois no mesmo token o negrito só engrossa
    // o traço, e o número deixa de ser o assunto.
    //
    // Os dois tokens existem nos dois temas (`src/index.css`), então isto
    // continua correto se a tela voltar a ser escura.
    <div
      className="text-[14.5px] leading-[1.65] prose prose-sm max-w-none
        prose-p:text-ink-soft prose-p:my-2
        prose-strong:text-foreground prose-strong:font-semibold
        prose-li:text-ink-soft prose-li:my-0.5
        prose-ul:my-2 prose-ol:my-2
        prose-headings:text-foreground"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTES}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
