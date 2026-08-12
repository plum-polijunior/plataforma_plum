/**
 * Criar card: pergunta → prévia com número real → Publicar.
 *
 * A prévia existe porque o card vai para a página inicial de TODA a organização
 * e se re-executa sozinho para sempre (decisão D1b do plano). Um card errado
 * não é um erro particular: é um número errado na cara de todo mundo, todo dia.
 * Enquanto não se clica em "Publicar", nada é gravado.
 *
 * AS CINCO TRAVAS ANTES DE GRAVAR, todas baratas e todas com bug garantido se
 * faltarem — ver Etapa 4 do plano:
 *
 *   1. Colunas existem no schema? Recusa antes de ir para a prévia. Sem isto o
 *      erro que aparece é "seu cargo não pode ver", que é mentira e manda a
 *      pessoa investigar permissão em vez do plano.
 *   2. `viz` dentro do enum do CHECK, senão o INSERT quebra no Postgres.
 *   3. `created_by = auth.uid()`, `organization_id` — a policy de INSERT exige
 *      os dois, e o Postgres recusa sem dizer qual condição falhou.
 *   4. `position = max + 1`, porque a coluna é NOT NULL DEFAULT 0 sem UNIQUE e
 *      todo card em 0 dá ordem arbitrária que muda entre carregamentos.
 *   5. Botão desabilitado durante a gravação: não existe UNIQUE em
 *      `dashboard_cards`, então dois cliques criam dois cards idênticos —
 *      aconteceu de verdade na Etapa 0, com o INSERT rodado duas vezes.
 *
 *   E `origin_question` fica NULL de propósito: guardaria a pergunta em texto
 *   livre sob a mesma RLS do título, e a D4 aceitou o vazamento do título (que
 *   a pessoa escolhe), não o da pergunta (que ela digita sem pensar).
 */

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CardDashboard } from "./CardDashboard";
import type { CardNaTela, TipoViz } from "./tipos";
// O MESMO interpretador que a Edge Function usa para autorizar o plano.
// Importar em vez de reimplementar não é preferência: uma cópia local do
// "quais colunas este plano usa" já divergiu uma vez, e o sintoma foi um card
// legítimo recusado com uma mensagem falsa (ver o comentário em
// `colunasDeOrigem` abaixo). O arquivo não importa nada de propósito,
// justamente para rodar igual no Deno, no Node do vitest e aqui no navegador.
import { extractColumns, type QueryPlan } from "../../../supabase/functions/_shared/query_plan";

/**
 * O que o front sabe desenhar hoje. `meter` está no CHECK da tabela mas não
 * aqui: sem onde guardar uma meta, ele renderizaria vazio. O agente também não
 * o oferece.
 *
 * ⭐ `line` entrou na Fase 5b. Antes dela, esta lista é o que transformava um
 * `viz: "line"` do agente num card **gravado como `kpi`** — e um card "Faturamento
 * por mês" caía no `VizKpi`, que lê `colunas[0]`/`linhas[0]` e renderizaria um
 * **`2026-01` gigante**. Não é número errado, é pior de explicar. Foi por isso
 * que o prompt do agente (Etapa 6) só podia mudar DEPOIS desta linha.
 */
const VIZ_PERMITIDOS: TipoViz[] = ["kpi", "line", "bar", "stacked_bar", "table"];

/** Os quatro truncamentos que o executor aceita (`_TRUNC_PARA_PERIODO`). */
const TRUNCS_VALIDOS = new Set(["week", "month", "quarter", "year"]);

/**
 * O plano agrupa por período?
 *
 * Duplica `truncDoPlano` de `use-dashboard-cards.ts` em intenção, mas não em
 * papel: lá é para DESENHAR (traduzir rótulo, oferecer o alternador), aqui é
 * para VALIDAR antes de gravar. O que se checa é diferente — aqui basta
 * "tem ou não tem", e o plano ainda é `Record<string, unknown>` cru do agente,
 * não um `CardNaTela` montado.
 */
function planoTemPeriodo(plano: unknown): boolean {
  const gb = (plano as { group_by?: unknown })?.group_by;
  if (!Array.isArray(gb)) return false;
  return gb.some((item) => {
    const t = (item as { trunc?: unknown })?.trunc;
    return typeof t === "string" && TRUNCS_VALIDOS.has(t.toLowerCase());
  });
}

interface CardGerado {
  title?: string;
  viz?: string;
  higher_is_better?: boolean | null;
  query_plan?: Record<string, unknown>;
  erro?: string;
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  datasetId: string;
  organizationId: string;
  schemaMetadata: unknown;
  onPublicado: () => void;
}

export function NovoCardDialog({
  aberto,
  onFechar,
  datasetId,
  organizationId,
  schemaMetadata,
  onPublicado,
}: Props) {
  const [pergunta, setPergunta] = useState("");
  const [titulo, setTitulo] = useState("");
  const [gerado, setGerado] = useState<CardGerado | null>(null);
  const [previa, setPrevia] = useState<CardNaTela | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const colunasDoSchema = Object.keys(
    (schemaMetadata as { columns?: Record<string, unknown> } | null)?.columns ?? {},
  );

  function limpar() {
    setPergunta("");
    setTitulo("");
    setGerado(null);
    setPrevia(null);
    setErro("");
  }

  function fechar() {
    limpar();
    onFechar();
  }

  /**
   * As colunas de ORIGEM que o plano lê da planilha.
   *
   * ⚠️ Alias do `select` NÃO é coluna de origem. `order_by` roda DEPOIS da
   * agregação, sobre o frame de saída, cujas colunas são os aliases — então
   * `{"col": "total_vendas"}` ali é o `as` de um `sum`, não algo que exista na
   * planilha.
   *
   * A primeira versão desta tela tinha um walker próprio que não fazia essa
   * distinção, e recusou "qual foi o vendedor que mais vendeu?" dizendo que
   * `total_vendas` não existia. O plano estava correto. É a mesma falha que
   * `_shared/query_plan.ts` corrigiu no backend em 2026-08-10 — e o motivo de
   * agora esta tela chamar aquele arquivo em vez de ter o seu.
   */
  function colunasDeOrigem(plano: unknown): string[] {
    return [...extractColumns(plano as QueryPlan)];
  }

  async function gerarEPrever() {
    setOcupado(true);
    setErro("");
    setPrevia(null);

    try {
      const { data, error } = await supabase.functions.invoke("dashboard-agent", {
        body: { action: "gerar_card", pergunta, schemaMetadata },
      });
      if (error) throw error;

      const card: CardGerado = data?.card ?? {};

      // O agente pode dizer que a pergunta é inviável — e isso é uma resposta
      // legítima, não uma falha. Ex.: pedir agrupamento por mês (D7).
      if (card.erro) {
        setErro(card.erro);
        return;
      }

      // TRAVA 1 — coluna inventada. O RBAC também barraria, mas com a mensagem
      // errada ("seu cargo não pode ver"), mandando a pessoa investigar
      // permissão quando o problema é o plano.
      const inexistentes = colunasDeOrigem(card.query_plan).filter(
        (c) => !colunasDoSchema.includes(c),
      );
      if (inexistentes.length > 0) {
        setErro(
          `A pergunta gerou um cálculo sobre ${inexistentes.length === 1 ? "uma coluna que não existe" : "colunas que não existem"} nesta base: ${inexistentes.join(", ")}. Tente nomear as colunas como elas aparecem na sua planilha.`,
        );
        return;
      }
      if (!card.query_plan) {
        setErro("Não consegui montar um cálculo para essa pergunta.");
        return;
      }

      // TRAVA 2 — `viz` fora do enum quebra o INSERT no Postgres.
      let viz: TipoViz = VIZ_PERMITIDOS.includes(card.viz as TipoViz)
        ? (card.viz as TipoViz)
        : "kpi";

      // TRAVA 2b — `line` exige agrupamento por período.
      //
      // O prompt do Tarsila manda usar `line` só quando o `group_by` tem
      // `trunc`, mas prompt é instrução e não garantia: um `viz: "line"` sobre
      // `group_by: ["loja"]` desenharia um traço ligando Loja A, Loja B e Loja
      // C, sugerindo uma progressão entre elas que não existe. E ficaria
      // GRAVADO como o padrão da organização.
      //
      // Cai para `bar`, não para `kpi`: o card tem categorias e uma medida, que
      // é exatamente o que barras leem bem. `kpi` mostraria só a primeira linha.
      if (viz === "line" && !planoTemPeriodo(card.query_plan)) {
        console.warn(
          "[novo-card] viz 'line' pedida sem trunc de periodo no group_by; usando 'bar'.",
        );
        viz = "bar";
      }

      const cardValidado = { ...card, viz };
      setGerado(cardValidado);
      setTitulo(card.title?.slice(0, 45) ?? "Novo card");

      // Prévia: executa sem gravar nada.
      const exec = await supabase.functions.invoke("dashboard-agent", {
        body: { action: "executar_previa", datasetId, plan: card.query_plan },
      });
      if (exec.error) throw exec.error;

      const r = exec.data?.result ?? {};
      setPrevia({
        id: "previa",
        titulo: card.title ?? "Novo card",
        viz,
        maiorEhMelhor: card.higher_is_better ?? null,
        colunaOrigem: primeiraColuna(card.query_plan),
        agregacao: primeiraAgg(card.query_plan),
        estado: r.status ?? "error",
        colunas: r.columns ?? [],
        linhas: r.rows ?? [],
        totalLinhas: r.row_count ?? 0,
        calculadoEm: new Date().toISOString(),
        erro: r.error,
      });
    } catch (e) {
      console.error(e);
      setErro(
        e instanceof Error && e.message
          ? "Não consegui montar o card agora. Tente novamente em instantes."
          : "Erro inesperado.",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function publicar() {
    if (!gerado?.query_plan || ocupado) return;
    setOcupado(true); // TRAVA 5 — sem UNIQUE na tabela, dois cliques = dois cards
    setErro("");

    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("sessao invalida");

      // TRAVA 4 — `position = max + 1`. Sem isto todo card nasce em 0 e a
      // ordem da grade muda entre carregamentos.
      const { data: ultimo } = await supabase
        .from("dashboard_cards")
        .select("position")
        .eq("dataset_id", datasetId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();

      // TRAVA 3 — a policy de INSERT exige organization_id, is_active_member()
      // e created_by = auth.uid(). Faltando um, o Postgres recusa sem dizer
      // qual.
      const { error } = await supabase.from("dashboard_cards").insert({
        organization_id: organizationId,
        dataset_id: datasetId,
        created_by: auth.user.id,
        title: titulo.trim().slice(0, 45) || "Novo card",
        viz: gerado.viz as TipoViz,
        higher_is_better: gerado.higher_is_better ?? null,
        query_plan: gerado.query_plan as never,
        position: (ultimo?.position ?? -1) + 1,
        // origin_question fica NULL de propósito — ver o cabeçalho deste arquivo.
      });
      if (error) throw error;

      onPublicado();
      fechar();
    } catch (e) {
      console.error(e);
      setErro("Não consegui publicar o card. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => (v ? null : fechar())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo card</DialogTitle>
          <DialogDescription>
            Escreva a pergunta em português. Você vê o resultado antes de publicar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            placeholder="Ex.: qual o faturamento por forma de pagamento?"
            className="min-h-[80px] resize-none"
            disabled={ocupado}
          />

          {erro && <p className="text-sm text-muted-foreground">{erro}</p>}

          {previa && (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">
                  Título do card
                </label>
                <Input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  maxLength={45}
                  disabled={ocupado}
                />
              </div>
              {/* A prévia usa o MESMO componente da grade: o que você vê aqui é
                  literalmente o que vai para a página. */}
              <CardDashboard card={{ ...previa, titulo: titulo || previa.titulo }} />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={fechar} disabled={ocupado}>
            Cancelar
          </Button>
          {previa && previa.estado === "ok" ? (
            <Button onClick={publicar} disabled={ocupado}>
              {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Publicar
            </Button>
          ) : (
            <Button onClick={gerarEPrever} disabled={ocupado || !pergunta.trim()}>
              {ocupado ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {previa ? "Tentar de novo" : "Ver resultado"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function primeiraColuna(plano: unknown): string | undefined {
  const sel = (plano as { select?: unknown[] })?.select;
  if (!Array.isArray(sel)) return undefined;
  for (const item of sel) {
    const col = (item as { expr?: { col?: unknown } })?.expr?.col;
    if (typeof col === "string" && col.trim()) return col.trim();
  }
  return undefined;
}

function primeiraAgg(plano: unknown): string | undefined {
  const sel = (plano as { select?: unknown[] })?.select;
  if (!Array.isArray(sel)) return undefined;
  for (const item of sel) {
    const agg = (item as { expr?: { agg?: unknown } })?.expr?.agg;
    if (typeof agg === "string" && agg.trim()) return agg.trim().toLowerCase();
  }
  return undefined;
}
