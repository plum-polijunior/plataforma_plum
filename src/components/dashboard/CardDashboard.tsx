/**
 * A casca do card e os seus cinco estados.
 *
 * As regras que não podem ser quebradas estão em `DESIGN.md` §6, e cada uma
 * tem um motivo concreto:
 *
 *  - CARREGANDO: esqueleto de **altura uniforme**, sem spinner. Altura variada
 *    é confundida com dado real a 3 metros de distância.
 *  - DEGRADADO: o número aparece em **peso e tamanho totais**, com pílula
 *    neutra. Nunca vermelho, nunca âmbar, nunca ícone de alerta — isto não é
 *    erro. O número está certo, só é antigo; rebaixá-lo faria a pessoa
 *    desconfiar de um dado válido.
 *  - ERRO: **sem número nenhum**. Frase humana e um "Tentar de novo". Nunca
 *    mostrar um número junto de um erro, nunca caixa vermelha — o card já está
 *    vazio, o alarme seria redundante.
 *
 * O 5º estado do documento ("Suprimido") NÃO existe: morreu com o k-anonimato
 * em 2026-08-08, e `suppressed_groups` volta sempre 0. No lugar dele entra
 * `forbidden`, que é real e vem de `dashboard-execute`.
 *
 * A pílula de idade é SEMPRE visível (decisão D5), não só no degradado.
 */

import { Lock } from "lucide-react";
import { AcoesDoCard, type AcoesCard } from "./AcoesDoCard";
import type { CardNaTela, FormaVisual } from "./tipos";
import { idadeLegivel } from "./formato";
import { VizKpi } from "./VizKpi";
import { VizBar } from "./VizBar";
import { VizTabela } from "./VizTabela";
import { VizStackedBar } from "./VizStackedBar";
import { VizPie } from "./VizPie";

interface Props {
  card: CardNaTela;
  /** Só a primeira figura da tela é herói (DESIGN.md §5). */
  heroi?: boolean;
  /**
   * Tira de KPI: título pequeno em cima, número embaixo, sem cabeçalho
   * separado. É o formato de resumo executivo — quatro números lado a lado
   * ocupando a altura de um, em vez de quatro cards altos com um número
   * boiando no meio de área vazia.
   */
  compacto?: boolean;
  /** Ausente na prévia do diálogo: ali o card ainda não existe para ser gerido. */
  acoes?: AcoesCard;
  /**
   * Forma escolhida por quem está OLHANDO, que sobrepõe a gravada no card.
   *
   * Não é salva de propósito: o card é da organização, mas a preferência de
   * leitura é da pessoa. Alguém que precisa de tabela por leitor de tela não
   * deveria trocar a visualização para todo mundo.
   */
  vizEfetiva?: FormaVisual;
  /** Posicao na grade: decide o matiz das series deste card (`cores.ts`). */
  slotCor?: number;
}

export function CardDashboard({
  card,
  heroi = false,
  compacto = false,
  acoes,
  vizEfetiva,
  slotCor = 0,
}: Props) {
  const idade = idadeLegivel(card.calculadoEm);

  // A idade só aparece no card quando ele DIVERGE do resto da página: um
  // resultado degradado, vindo de snapshot antigo. O caso comum ("tudo foi
  // calculado agora") é dito uma vez só, no cabeçalho da página — repetir a
  // mesma frase em seis cards gastava uma linha de altura em cada um sem
  // acrescentar informação. A decisão D5 continua valendo: a idade é sempre
  // visível, só que no lugar certo.
  const mostrarIdade = card.estado === "stale" && idade;

  if (compacto) {
    return (
      // `h-full` faz o card ocupar a altura do container; como os tiles são
      // itens de um flex (que estica por padrão), todos ficam com a altura do
      // mais alto. Sem isso, o herói — que usa corpo maior — ficava mais alto
      // que os vizinhos e a fileira desalinhava.
      //
      // `mt-auto` empurra o número para a base: os títulos alinham no topo, os
      // valores alinham embaixo, e a diferença de corpo entre o herói e os
      // outros deixa de virar degrau.
      <article className="flex h-full flex-col rounded-xl border border-border/20 bg-card px-4 py-3.5 transition-colors duration-150 hover:border-border/40 motion-reduce:transition-none">
        <div className="flex items-start justify-between gap-2">
          <h2 className="truncate text-xs text-muted-foreground" title={card.titulo}>
            {card.titulo}
          </h2>
          {acoes && <AcoesDoCard acoes={acoes} titulo={card.titulo} />}
        </div>
        <div className="mt-auto pt-3">
          <Corpo card={card} heroi={heroi} compacto viz={vizEfetiva} slotCor={slotCor} />
        </div>
        {mostrarIdade && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">calculado {idade}</p>
        )}
      </article>
    );
  }

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-border/20 bg-card transition-colors duration-150 hover:border-border/40 motion-reduce:transition-none">
      {/* Hairline separando cabeçalho de dado: é o mecanismo de separação do
          app (`DESIGN.md` §1), no lugar da sombra que a superfície não tem. */}
      <header className="flex items-start justify-between gap-2 border-b border-border/15 px-4 py-3">
        <h2 className="truncate text-sm font-semibold text-foreground" title={card.titulo}>
          {card.titulo}
        </h2>
        <div className="flex shrink-0 items-start gap-1">
          {mostrarIdade && (
            <span className="pt-0.5 text-[11px] text-muted-foreground">calculado {idade}</span>
          )}
          {acoes && <AcoesDoCard acoes={acoes} titulo={card.titulo} />}
        </div>
      </header>

      {/* `min-h-0` + `overflow-y-auto`: quando a grade fixa a altura do card
          (tela cheia), o conteudo mais longo rola DENTRO do card em vez de
          esticar a grade e devolver a rolagem para a pagina — que e justamente
          o que a tela cheia existe para evitar. Fora da tela cheia a altura e
          natural e isto nunca dispara. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <Corpo card={card} heroi={heroi} viz={vizEfetiva} slotCor={slotCor} />
      </div>
    </article>
  );
}

function Corpo({
  card,
  heroi,
  compacto = false,
  viz,
  slotCor = 0,
}: {
  card: CardNaTela;
  heroi: boolean;
  compacto?: boolean;
  viz?: FormaVisual;
  slotCor?: number;
}) {
  if (card.estado === "carregando") return <Esqueleto compacto={compacto} />;

  if (card.estado === "forbidden") {
    if (compacto) {
      return (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Sem acesso
        </p>
      );
    }
    return (
      <div className="flex h-full flex-col justify-center">
        <Lock className="mb-2 h-4 w-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {card.erro ?? "Seu cargo não tem acesso a uma das colunas deste card."}
        </p>
      </div>
    );
  }

  if (card.estado === "error") {
    if (compacto) {
      // Sem número, sem vermelho: o valor simplesmente não existe agora.
      return <p className="text-sm text-muted-foreground">Indisponível</p>;
    }
    // Sem número nenhum aqui, de propósito. E sem vermelho: o card já está
    // vazio, então a caixa de alarme seria redundante (`DESIGN.md` §6). O link
    // é discreto porque a ação não é mais importante que o dado que faltou.
    return (
      <div className="flex h-full flex-col justify-center">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {card.erro ?? "Não consegui calcular este card agora."}
        </p>
        <button
          type="button"
          className="mt-3 self-start text-sm text-foreground/70 underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  if (card.totalLinhas === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum dado para este recorte.
      </p>
    );
  }

  // `ok` e `stale` renderizam IGUAL: o número do degradado não é rebaixado.
  // A diferença mora só na pílula de idade do cabeçalho.
  const forma = viz ?? card.viz;

  if (forma === "table") {
    return (
      <VizTabela
        colunas={card.colunas}
        linhas={card.linhas}
        colunaOrigem={card.colunaOrigem}
      />
    );
  }
  if (forma === "pie") {
    return (
      <VizPie
        colunas={card.colunas}
        linhas={card.linhas}
        colunaOrigem={card.colunaOrigem}
        agregacao={card.agregacao}
        slotCor={slotCor}
      />
    );
  }
  if (forma === "stacked_bar") {
    return (
      <VizStackedBar
        colunas={card.colunas}
        linhas={card.linhas}
        colunaOrigem={card.colunaOrigem}
        agregacao={card.agregacao}
        slotCor={slotCor}
      />
    );
  }
  if (forma === "bar") {
    return (
      <VizBar
        colunas={card.colunas}
        linhas={card.linhas}
        colunaOrigem={card.colunaOrigem}
        agregacao={card.agregacao}
        slotCor={slotCor}
      />
    );
  }
  return (
    <VizKpi
      colunas={card.colunas}
      linhas={card.linhas}
      heroi={heroi}
      colunaOrigem={card.colunaOrigem}
    />
  );
}

/**
 * Alturas UNIFORMES, sem spinner, branco a 5,5% (`DESIGN.md` §6 e §10 item 10).
 * Altura variada é confundida com dado real a 3 metros de distância — é o
 * motivo de as três barras terem a mesma altura, mesmo parecendo "menos vivo".
 *
 * O pulso é a única concessão a movimento aqui, e desliga inteiro sob
 * `prefers-reduced-motion` (`DESIGN.md` §9).
 */
function Esqueleto({ compacto = false }: { compacto?: boolean }) {
  if (compacto) {
    return (
      <div className="h-7 w-24 rounded bg-foreground/[0.055] motion-safe:animate-pulse" aria-hidden />
    );
  }
  return (
    <div className="space-y-2.5 motion-safe:animate-pulse" aria-hidden>
      <div className="h-3 w-full rounded bg-foreground/[0.055]" />
      <div className="h-3 w-full rounded bg-foreground/[0.055]" />
      <div className="h-3 w-2/3 rounded bg-foreground/[0.055]" />
    </div>
  );
}
