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

import { useEffect, useMemo, useState } from "react";
import { LayoutDashboard, Database, PlugZap, RotateCw, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgAccess } from "@/hooks/use-org-access";
import { useDashboardCards } from "@/hooks/use-dashboard-cards";
import { CardDashboard } from "@/components/dashboard/CardDashboard";
import { NovoCardDialog } from "@/components/dashboard/NovoCardDialog";
import { Button } from "@/components/ui/button";
import type { CardNaTela } from "@/components/dashboard/tipos";
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
  const [criando, setCriando] = useState(false);
  const [tique, setTique] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTique((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // O resultado mais antigo entre os cards. Um card degradado puxa a idade da
  // página para cima, que é o comportamento certo: a página não pode se dizer
  // mais fresca do que o seu pior dado.
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
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
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

        {baseId && (
          <Button size="sm" className="h-9" onClick={() => setCriando(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Novo card
          </Button>
        )}

        {cards.length > 0 && (
          <button
            type="button"
            onClick={() => recarregar()}
            title="Recalcular todos os cards"
            // 44px de alvo de toque (`DESIGN.md` §9).
            className="flex h-9 items-center gap-2 rounded-lg border border-border/20 px-3 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
          >
            <RotateCw className={`h-3.5 w-3.5 ${estado === "carregando" ? "motion-safe:animate-spin" : ""}`} />
            Atualizar
          </button>
        )}
      </header>

      {previa ? (
        <GradeDeCards cards={previa} />
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
        <GradeDeCards cards={cards} />
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
function GradeDeCards({ cards }: { cards: CardNaTela[] }) {
  const numeros = cards.filter((c) => c.viz === "kpi");
  const graficos = cards.filter((c) => c.viz !== "kpi");

  return (
    <div className="space-y-4">
      {numeros.length > 0 && (
        // Flex, não grid: com `flex-1` cada tile CRESCE para ocupar a sobra, e
        // a última fileira fica cheia mesmo quando o número de KPIs não divide
        // certo pelas colunas. Numa grade fixa de 4, cinco tiles deixam três
        // buracos na segunda linha — foi exatamente o vazio que aparecia.
        // O herói leva `flex-[2]`: o dobro da fatia dos outros, seja qual for
        // a quantidade.
        <div className="flex flex-wrap gap-4">
          {numeros.map((card, i) => (
            <div
              key={card.id}
              className={`min-w-[9.5rem] ${i === 0 ? "flex-[2]" : "flex-1"}`}
            >
              <CardDashboard card={card} compacto heroi={i === 0} />
            </div>
          ))}
        </div>
      )}

      {graficos.length > 0 && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {graficos.map((card) => (
            <CardDashboard key={card.id} card={card} />
          ))}
        </div>
      )}
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
