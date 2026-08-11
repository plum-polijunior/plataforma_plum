/**
 * Editar um card publicado: título e tipo de gráfico. Só isso.
 *
 * A PERGUNTA NÃO SE EDITA, de propósito (decisão do furo #7 do plano). Se o
 * cálculo está errado, cria-se outro card e apaga-se o velho — regerar o
 * `query_plan` reabriria todo o caminho do agente e da prévia dentro de uma
 * etapa marcada como pequena, e o `query_plan` de um card publicado é o que dá
 * sentido à série histórica que os snapshots vêm acumulando.
 *
 * O que a edição cobre é o caso real: título ruim e gráfico errado.
 *
 * ⚠️ A policy de UPDATE valida só `organization_id` no `WITH CHECK` — ela
 * restringe QUEM edita, não O QUÊ. Nada no banco impede uma chamada de API de
 * trocar o `query_plan`. A trava de "não editar a pergunta" é de aplicação, e
 * está aqui.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CardNaTela, TipoViz } from "./tipos";

/** O enum do CHECK da tabela; o MVP oferece dois (decisão D2). */
const VIZ: { valor: TipoViz; rotulo: string }[] = [
  { valor: "kpi", rotulo: "Número" },
  { valor: "bar", rotulo: "Barras" },
];

interface Props {
  card: CardNaTela | null;
  onFechar: () => void;
  onSalvo: () => void;
}

export function EditarCardDialog({ card, onFechar, onSalvo }: Props) {
  const [titulo, setTitulo] = useState("");
  const [viz, setViz] = useState<TipoViz>("kpi");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (card) {
      setTitulo(card.titulo);
      setViz(card.viz);
      setErro("");
    }
  }, [card]);

  // Um card sem `group_by` não tem categorias para desenhar: virar "barras"
  // renderizaria uma barra só, de 100%, que não informa nada. Avisar antes é
  // melhor que deixar publicar um gráfico inútil.
  const temCategorias = (card?.colunas.length ?? 0) > 1;

  async function salvar() {
    if (!card || salvando) return;
    setSalvando(true);
    setErro("");
    try {
      const { error } = await supabase
        .from("dashboard_cards")
        .update({
          title: titulo.trim().slice(0, 45) || card.titulo,
          viz,
        })
        .eq("id", card.id);
      if (error) throw error;
      onSalvo();
      onFechar();
    } catch (e) {
      console.error(e);
      // A RLS barra editar card de outra pessoa quando não se é Admin, e o
      // Postgres devolve isso como "nenhuma linha afetada", não como erro
      // explicativo. Dizer a causa provável poupa a investigação.
      setErro("Não consegui salvar. Se o card foi criado por outra pessoa, só um Admin pode editá-lo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={Boolean(card)} onOpenChange={(v) => (v ? null : onFechar())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar card</DialogTitle>
          <DialogDescription>
            O cálculo do card não muda. Para outro cálculo, crie um card novo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Título</label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={45}
              disabled={salvando}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Visualização</label>
            <Select value={viz} onValueChange={(v) => setViz(v as TipoViz)} disabled={salvando}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIZ.map((v) => (
                  <SelectItem key={v.valor} value={v.valor}>
                    {v.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {viz === "bar" && !temCategorias && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Este card calcula um número só, sem categorias — em barras ele
                mostraria uma barra única.
              </p>
            )}
          </div>

          {erro && <p className="text-sm text-muted-foreground">{erro}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || !titulo.trim()}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
