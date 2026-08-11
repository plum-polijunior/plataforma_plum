/**
 * O menu de ações de um card.
 *
 * POR QUE MENU E NÃO ARRASTAR: reordenar por drag-and-drop é o gesto óbvio no
 * mouse e inacessível em todo o resto — teclado, leitor de tela, toque. O
 * `DESIGN.md` §9 pede que a ordem de tabulação percorra os cards e que nada
 * seja alcançável só por hover. Um menu com "mover para trás/frente" resolve os
 * dois casos com um componente que já existe no projeto, sem dependência nova.
 *
 * O botão fica sempre visível (não só no hover), pela mesma regra.
 */

import { MoreHorizontal, Pencil, Trash2, RotateCw, ArrowLeft, ArrowRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TipoViz } from "./tipos";
import { ROTULO_VIZ } from "./formas";

export interface AcoesCard {
  /** Formas que não distorcem ESTE resultado. Vazio esconde a seção. */
  formas: TipoViz[];
  formaAtual: TipoViz;
  onTrocarForma: (viz: TipoViz) => void;
  onEditar: () => void;
  onApagar: () => void;
  onRecalcular: () => void;
  onMover: (direcao: -1 | 1) => void;
  podeMoverAntes: boolean;
  podeMoverDepois: boolean;
}

export function AcoesDoCard({ acoes, titulo }: { acoes: AcoesCard; titulo: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Ações do card ${titulo}`}
          // Alvo de toque de 44px com o ícone menor dentro (`DESIGN.md` §9).
          className="-mr-2 -mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        {/* "Ver como" é preferência de LEITURA, não edição: troca só para quem
            está olhando e não é salva. O card é da organização; o jeito de ler
            é de cada um — inclusive de quem precisa de tabela por leitor de
            tela (`DESIGN.md` §9). */}
        {acoes.formas.length > 1 && (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Ver como
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={acoes.formaAtual}
              onValueChange={(v) => acoes.onTrocarForma(v as TipoViz)}
            >
              {acoes.formas.map((f) => (
                <DropdownMenuRadioItem key={f} value={f}>
                  {ROTULO_VIZ[f]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem onClick={acoes.onRecalcular}>
          <RotateCw className="mr-2 h-4 w-4" />
          Recalcular agora
        </DropdownMenuItem>
        <DropdownMenuItem onClick={acoes.onEditar}>
          <Pencil className="mr-2 h-4 w-4" />
          Editar
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => acoes.onMover(-1)}
          disabled={!acoes.podeMoverAntes}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Mover para trás
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => acoes.onMover(1)}
          disabled={!acoes.podeMoverDepois}
        >
          <ArrowRight className="mr-2 h-4 w-4" />
          Mover para frente
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Vermelho aqui é legítimo, ao contrário do card de erro: isto é uma
            AÇÃO destrutiva que a pessoa está prestes a tomar, não um estado do
            dado. A confirmação vem depois, no diálogo. */}
        <DropdownMenuItem onClick={acoes.onApagar} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Apagar card
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
