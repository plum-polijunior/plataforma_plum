/**
 * Página Inicial — o mural de cards do dashboard.
 *
 * A rota existe, mas **não há item na sidebar de propósito** — é a válvula de
 * rollback da §2.3 do plano (`docs/fases dashboard/`). O link só entra na Etapa
 * 6, depois da bateria de verificação passar.
 *
 * Superfície de app, não de landing (`DESIGN.md` §1): fundo plano, sem
 * gradiente, sem glow, sem sombra. Separação por hairline de 1px.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutDashboard, Database, PlugZap, RotateCw, Plus, Maximize2, Minimize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgAccess } from "@/hooks/use-org-access";
import { useDashboardCards } from "@/hooks/use-dashboard-cards";
import { CardDashboard } from "@/components/dashboard/CardDashboard";
import { NovoCardDialog } from "@/components/dashboard/NovoCardDialog";
import { EditarCardDialog } from "@/components/dashboard/EditarCardDialog";
import type { AcoesCard } from "@/components/dashboard/AcoesDoCard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { CardNaTela, TipoViz } from "@/components/dashboard/tipos";
import { formasCompativeis } from "@/components/dashboard/formas";
import { idadeLegivel } from "@/components/dashboard/formato";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BaseLiberada {
  id: string;
  name: string;
  created_at: string;
  schema_metadata: unknown;
}

export default function Inicio() {
  const { organizationId, roleId } = useOrgAccess();

  const [bases, setBases] = useState<BaseLiberada[]>([]);
  const [baseId, setBaseId] = useState<string>("");
  const [carregandoBases, setCarregandoBases] = useState(true);

  const { cards, estado, recarregar } = useDashboardCards(baseId || null);

  // Prévia de layout para a parada de revisão visual. Só em `npm run dev` E com
  // `?preview=1`. O `import()` é dinâmico de propósito: em produção `DEV` é
  // `false`, o ramo morre e o módulo nunca entra no bundle. Sai no fim da fase.
  const [previa, setPrevia] = useState<CardNaTela[] | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!new URLSearchParams(window.location.search).has("preview")) return;
    import("@/components/dashboard/fixture-preview").then((m) =>
      setPrevia(m.cardsDeExemplo()),
    );
  }, []);

  useEffect(() => {
    if (!organizationId || !roleId) return;

    const buscarBases = async () => {
      try {
        // Só bases em que o cargo tem ALGUMA coluna liberada. Sem este filtro,
        // uma base com `allowed_columns = '{}'` apareceria no seletor e faria
        // `dashboard-execute` responder 403 de corpo inteiro — o usuário
        // escolheria uma base que só sabe dar erro.
        const { data: permissoes } = await supabase
          .from("role_permissions")
          .select("dataset_id, allowed_columns")
          .eq("role_id", roleId);

        const idsLiberados = (permissoes ?? [])
          .filter((p) => (p.allowed_columns?.length ?? 0) > 0)
          .map((p) => p.dataset_id);

        if (idsLiberados.length === 0) {
          setBases([]);
          return;
        }

        const { data } = await supabase
          .from("datasets")
          .select("id, name, created_at, schema_metadata")
          .eq("organization_id", organizationId)
          .eq("status", "active")
          .in("id", idsLiberados)
          .order("created_at");

        setBases(data ?? []);
        if (data?.length) setBaseId(data[0].id);
      } catch (erro) {
        console.error("Falha ao carregar as bases da Página Inicial:", erro);
      } finally {
        setCarregandoBases(false);
      }
    };

    buscarBases();
  }, [organizationId, roleId]);

  // Duas bases com o mesmo nome são indistinguíveis num dropdown que só mostra
  // `name` — e base duplicada por re-upload existe (foi a hipótese D da
  // investigação do chat). Só desempata quando há colisão, para não poluir o
  // caso comum.
  const nomesRepetidos = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const b of bases) contagem.set(b.name, (contagem.get(b.name) ?? 0) + 1);
    return new Set([...contagem].filter(([, n]) => n > 1).map(([nome]) => nome));
  }, [bases]);

  const semBase = !carregandoBases && bases.length === 0;

  // Sem isto o rótulo só mudaria quando a página re-renderizasse por outro
  // motivo — ficaria "calculado agora" com o dado já de meia hora. Meio minuto
  // é o passo mais grosso que ainda acerta a virada de "agora" para "há 1 min".
  // Tela cheia de verdade (Fullscreen API), não só esconder a sidebar: o pedido
  // era ver o dashboard sem o painel lateral E sem as abas do navegador. Pedir
  // fullscreen NESTE elemento faz o navegador mostrar só ele — a sidebar some
  // por consequência, sem precisar de estado global nem de mexer no layout.
  const raiz = useRef<HTMLDivElement>(null);
  const [telaCheia, setTelaCheia] = useState(false);

  useEffect(() => {
    // Ouvir o evento em vez de confiar no nosso próprio estado: dá para sair da
    // tela cheia pelo Esc ou pelo botão do navegador, sem passar pelo nosso
    // clique — e aí o ícone ficaria mentindo.
    const aoMudar = () => setTelaCheia(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

  async function alternarTelaCheia() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await raiz.current?.requestFullscreen();
    } catch (e) {
      // Safari em iPhone não suporta, e alguns navegadores recusam sem gesto do
      // usuário. Falhar em silêncio é melhor que um alerta: a página continua
      // inteira, só não entrou em tela cheia.
      console.warn("Tela cheia indisponível:", e);
    }
  }

  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<CardNaTela | null>(null);
  // Preferência de leitura por card, só nesta sessão e só para esta pessoa.
  // Não vai para o banco de propósito — ver o comentário em AcoesDoCard.
  const [formaEscolhida, setFormaEscolhida] = useState<Record<string, TipoViz>>({});
  const [apagando, setApagando] = useState<CardNaTela | null>(null);
  const [tique, setTique] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTique((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // O resultado mais antigo entre os cards. Um card degradado puxa a idade da
  // página para cima, que é o comportamento certo: a página não pode se dizer
  // mais fresca do que o seu pior dado.
  /**
   * Trocar a posição com o vizinho DENTRO DO MESMO GRUPO.
   *
   * `position` é global por base, mas a tela renderiza números e gráficos em
   * faixas separadas. Mover contra a lista global faria um KPI "pular" um
   * gráfico sem sair do lugar na tela — o usuário clicaria de novo achando que
   * não funcionou. A vizinhança que importa é a que ele enxerga.
   */
  async function moverCard(card: CardNaTela, direcao: -1 | 1) {
    const grupo = cards.filter((c) =>
      card.viz === "kpi" ? c.viz === "kpi" : c.viz !== "kpi",
    );
    const i = grupo.findIndex((c) => c.id === card.id);
    const vizinho = grupo[i + direcao];
    if (!vizinho) return;

    const { data: posicoes } = await supabase
      .from("dashboard_cards")
      .select("id, position")
      .in("id", [card.id, vizinho.id]);

    const pA = posicoes?.find((p) => p.id === card.id)?.position ?? 0;
    const pB = posicoes?.find((p) => p.id === vizinho.id)?.position ?? 0;

    // Duas escritas, não uma transação: se a segunda falhar, os dois cards
    // ficam com a mesma posição — a ordem entre eles fica indefinida, mas
    // nenhum card se perde e um novo clique conserta.
    await supabase.from("dashboard_cards").update({ position: pB }).eq("id", card.id);
    await supabase.from("dashboard_cards").update({ position: pA }).eq("id", vizinho.id);
    recarregar();
  }

  async function apagarCard(card: CardNaTela) {
    const { error } = await supabase.from("dashboard_cards").delete().eq("id", card.id);
    if (error) console.error("Falha ao apagar card:", error);
    setApagando(null);
    recarregar();
  }

  function acoesDe(card: CardNaTela): AcoesCard {
    const grupo = cards.filter((c) =>
      card.viz === "kpi" ? c.viz === "kpi" : c.viz !== "kpi",
    );
    const i = grupo.findIndex((c) => c.id === card.id);
    const formas = formasCompativeis(card);
    return {
      formas,
      formaAtual: formaEscolhida[card.id] ?? card.viz,
      onTrocarForma: (v) => setFormaEscolhida((m) => ({ ...m, [card.id]: v })),
      onEditar: () => setEditando(card),
      onApagar: () => setApagando(card),
      // `true` força o recálculo, pulando o cache de snapshot.
      onRecalcular: () => recarregar(true),
      onMover: (d) => moverCard(card, d),
      podeMoverAntes: i > 0,
      podeMoverDepois: i >= 0 && i < grupo.length - 1,
    };
  }

  const idadeMaisAntiga = useMemo(() => {
    const datas = cards
      .map((c) => c.calculadoEm)
      .filter((d): d is string => Boolean(d))
      .sort();
    return datas.length ? idadeLegivel(datas[0]) : "";
    // `tique` entra nas dependências de propósito: é ele que faz o texto
    // envelhecer sozinho, sem precisar de nova requisição.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, tique]);

  return (
    <div
      ref={raiz}
      // Em tela cheia este elemento passa a ser a página inteira: sem o fundo e
      // o `overflow-auto` próprios ele apareceria transparente e sem rolagem.
      // Em tela cheia este elemento vira a página inteira. `flex-col` +
      // `overflow-hidden` fazem dele um container de altura FIXA: o cabeçalho
      // não encolhe e a grade recebe o que sobra, em vez de a página crescer.
      className={`mx-auto w-full ${
        telaCheia
          ? "flex h-screen max-w-none flex-col overflow-hidden bg-background p-6"
          : "max-w-6xl"
      }`}
    >
      <header className={`flex shrink-0 flex-wrap items-start justify-between gap-4 ${telaCheia ? "mb-4" : "mb-8"}`}>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Página Inicial</h1>
          {/* Frescor dito UMA vez, para a página inteira, em vez de repetido em
              cada card — era uma linha de altura gasta por card sem informar
              nada de novo. Mostra a idade do resultado MAIS ANTIGO: é a
              afirmação segura ("nada aqui é mais velho que isto"). */}
          <p className="mt-1 flex h-5 items-center gap-1.5 text-sm text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground" />
            {estado === "carregando"
              ? "Calculando…"
              : `Calculado ${idadeMaisAntiga || "agora"}`}
          </p>
        </div>

        {/* Um grupo só, à direita: seletor e botões na mesma altura (h-9) e
            com o mesmo raio. Antes eram três filhos soltos do `justify-between`,
            então o espaço sobrava entre eles em vez de ficar antes do bloco. */}
        <div className="flex flex-wrap items-center gap-2">
        {bases.length > 0 && (
          <Select value={baseId} onValueChange={setBaseId}>
            <SelectTrigger className="h-9 w-[240px] text-sm">
              <SelectValue placeholder="Selecione uma base" />
            </SelectTrigger>
            <SelectContent>
              {bases.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  <span className="flex items-center gap-2">
                    <Database className="h-3.5 w-3.5 text-muted-foreground" />
                    {b.name}
                    {nomesRepetidos.has(b.name) && (
                      <span className="text-xs text-muted-foreground">
                        · {new Date(b.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {cards.length > 0 && (
          <Button
            variant="outline"
            className="h-9 border-border/20 font-normal text-muted-foreground hover:text-foreground"
            // `true` = ignora o cache de snapshot. Sem ele, o botão relia o
            // mesmo resultado e a idade só crescia — o usuário clicava e nada
            // acontecia, que é pior do que não ter o botão.
            onClick={() => recarregar(true)}
            title="Recalcular todos os cards"
          >
            <RotateCw
              className={`mr-1.5 h-4 w-4 ${estado === "carregando" ? "motion-safe:animate-spin" : ""}`}
            />
            Atualizar
          </Button>
        )}

        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 border-border/20 text-muted-foreground hover:text-foreground"
          onClick={alternarTelaCheia}
          title={telaCheia ? "Sair da tela cheia" : "Ver em tela cheia"}
          aria-label={telaCheia ? "Sair da tela cheia" : "Ver em tela cheia"}
        >
          {telaCheia ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>

        {baseId && (
          <Button className="h-9" onClick={() => setCriando(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Novo card
          </Button>
        )}
        </div>
      </header>

      {previa ? (
        <GradeDeCards cards={previa} preencherTela={telaCheia} />
      ) : semBase ? (
        <SemBase />
      ) : estado === "sem-coluna-liberada" ? (
        <Aviso
          icone={<Database className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />}
          titulo="Seu cargo não tem acesso a esta base"
          texto="Nenhuma coluna desta base está liberada para o seu cargo. Fale com um administrador da sua organização."
        />
      ) : estado === "base-desconectada" ? (
        <Aviso
          icone={<PlugZap className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />}
          titulo="Esta base precisa ser reconectada"
          texto="Falta o link da planilha. Abra Minhas Bases de Dados e conecte a planilha de novo."
        />
      ) : estado === "falhou" ? (
        <Aviso
          icone={<LayoutDashboard className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />}
          titulo="Não consegui carregar os cards agora"
          texto="Tente recarregar a página em instantes."
        />
      ) : cards.length === 0 && estado === "pronto" ? (
        <SemCard />
      ) : (
        <GradeDeCards
          cards={cards}
          acoesDe={acoesDe}
          preencherTela={telaCheia}
          formaDe={(c) => formaEscolhida[c.id]}
        />
      )}

      {baseId && organizationId && (
        <NovoCardDialog
          aberto={criando}
          onFechar={() => setCriando(false)}
          datasetId={baseId}
          organizationId={organizationId}
          schemaMetadata={bases.find((b) => b.id === baseId)?.schema_metadata}
          onPublicado={() => recarregar()}
        />
      )}

      <EditarCardDialog
        card={editando}
        onFechar={() => setEditando(null)}
        onSalvo={() => recarregar()}
      />

      <AlertDialog open={Boolean(apagando)} onOpenChange={(v) => (v ? null : setApagando(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar "{apagando?.titulo}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O card sai da página inicial de toda a organização. O histórico de
              cálculos dele também é apagado. A planilha não é tocada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => apagando && apagarCard(apagando)}
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Grade responsiva do `DESIGN.md` §8: 1 coluna abaixo de 640px, 2 até 1024px,
 * 3 acima. Card de barra ocupa duas colunas — rótulo de categoria em português
 * não cabe em um terço de tela sem truncar no meio da palavra.
 */
/**
 * Duas faixas, não uma grade só.
 *
 * Em cima, os NÚMEROS, em tira compacta — quatro lado a lado ocupando a altura
 * de um. Embaixo, os GRÁFICOS, que precisam de largura e altura de verdade.
 *
 * Por que separar: número e gráfico têm alturas naturais muito diferentes.
 * Numa grade única, ou o KPI estica até a altura do gráfico (número pequeno
 * boiando em área vazia), ou a linha fica desalinhada. Separar resolve os dois
 * e ainda produz a leitura que um dashboard quer: resumo executivo primeiro,
 * detalhe depois.
 *
 * O primeiro KPI é a figura herói (`DESIGN.md` §5): ocupa o dobro da largura e
 * usa corpo maior. É o único ponto focal da tela.
 */
function GradeDeCards({
  cards,
  acoesDe,
  preencherTela = false,
  formaDe,
}: {
  cards: CardNaTela[];
  acoesDe?: (card: CardNaTela) => AcoesCard;
  /** Tela cheia: a grade ocupa a altura disponível e nada rola. */
  preencherTela?: boolean;
  formaDe?: (card: CardNaTela) => TipoViz | undefined;
}) {
  // A separação segue a forma EFETIVA: trocar um KPI para tabela deve movê-lo
  // para a faixa de baixo, senão uma tabela apareceria espremida na tira de
  // números, que tem altura de uma linha.
  const forma = (c: CardNaTela) => formaDe?.(c) ?? c.viz;
  const numeros = cards.filter((c) => forma(c) === "kpi");
  const graficos = cards.filter((c) => forma(c) !== "kpi");

  // Quantas colunas de gráfico cabem sem virar tira fina. Fora da tela cheia
  // são sempre 2, porque a página rola e a largura é o que manda. Em tela cheia
  // o que manda é a ALTURA: mais colunas significa menos fileiras, e menos
  // fileiras é o que faz tudo caber.
  const colunas = !preencherTela
    ? 2
    : graficos.length <= 2
      ? graficos.length || 1
      : graficos.length <= 6
        ? 3
        : 4;

  return (
    <div className={preencherTela ? "flex min-h-0 flex-1 flex-col gap-4" : "space-y-4"}>
      {numeros.length > 0 && (
        <div className={preencherTela ? "shrink-0" : ""}>
          <TiraDeNumeros cards={numeros} acoesDe={acoesDe} />
        </div>
      )}

      {graficos.length > 0 && (
        // `auto-rows-fr` divide a altura restante igualmente entre as fileiras,
        // e `min-h-0` é o que permite ao grid ENCOLHER dentro do flex — sem
        // ele, o conteúdo define a altura e a rolagem volta.
        <div
          className={
            preencherTela
              ? "grid min-h-0 flex-1 auto-rows-fr gap-4"
              : "grid items-start gap-4 lg:grid-cols-2"
          }
          style={preencherTela ? { gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` } : undefined}
        >
          {graficos.map((card) => (
            <CardDashboard key={card.id} card={card} acoes={acoesDe?.(card)} vizEfetiva={formaDe?.(card)} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A tira de números, em fileiras EQUILIBRADAS.
 *
 * O problema que isto resolve: com `flex-wrap` puro e uma largura mínima, seis
 * tiles cabiam apertados numa fileira só, e a quebra — quando acontecia —
 * deixava uma fileira cheia e outra com um tile solto esticado.
 *
 * Agora a quantidade por fileira é decidida antes: até 4 números cabem em uma
 * fileira; acima disso vira metade em cada uma. Com 6 dá 3 e 3; com 5 dá 3 e 2,
 * e como cada tile mantém `flex-grow`, a fileira curta **estica para fechar**
 * em vez de deixar buraco. Nunca mais de 4 por fileira: acima disso o número
 * grande não cabe sem truncar.
 *
 * O herói só ganha o dobro de largura quando há espaço de sobra (até 3 tiles).
 * Com a tira cheia, largura dupla apertaria os vizinhos — e o corpo maior da
 * fonte já basta para dar o foco.
 */
function TiraDeNumeros({
  cards,
  acoesDe,
}: {
  cards: CardNaTela[];
  acoesDe?: (card: CardNaTela) => AcoesCard;
}) {
  const porFileira = Math.min(cards.length <= 4 ? cards.length : Math.ceil(cards.length / 2), 4);
  const heroiDuplo = cards.length <= 3;

  // `calc` com o gap descontado: sem isso o último tile de cada fileira estoura
  // a largura e quebra sozinho, produzindo justamente a fileira órfã.
  const base = `calc((100% - ${porFileira - 1} * 1rem) / ${porFileira})`;

  return (
    <div className="flex flex-wrap gap-4">
      {cards.map((card, i) => (
        <div
          key={card.id}
          className="grow"
          style={{ flexBasis: heroiDuplo && i === 0 ? `calc(2 * ${base})` : base }}
        >
          <CardDashboard card={card} compacto heroi={i === 0} acoes={acoesDe?.(card)} vizEfetiva={formaDe?.(card)} />
        </div>
      ))}
    </div>
  );
}

function Aviso({
  icone,
  titulo,
  texto,
}: {
  icone: React.ReactNode;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="rounded-xl border border-border/20 bg-card px-6 py-12 text-center">
      {icone}
      <h2 className="text-base font-medium text-foreground">{titulo}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{texto}</p>
    </div>
  );
}

function SemBase() {
  return (
    <Aviso
      icone={<Database className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />}
      titulo="Nenhuma base liberada para o seu cargo"
      texto="Para montar indicadores aqui, seu cargo precisa ter acesso a pelo menos uma coluna de uma base. Fale com um administrador da sua organização."
    />
  );
}

function SemCard() {
  return (
    <Aviso
      icone={<LayoutDashboard className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />}
      titulo="Nenhum card ainda"
      texto="Um card é uma pergunta guardada: você pergunta uma vez, e a resposta fica aqui, sempre atualizada."
    />
  );
}
