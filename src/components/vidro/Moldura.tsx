import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * O par que forma todo painel da Direção Vidro: uma borda de 1px feita de
 * gradiente (o elemento externo, com `padding: 1px`) e a superfície de vidro
 * dentro dela.
 *
 * A borda é um elemento e não um `border` porque gradiente em borda pede
 * `border-image`, que não convive com `border-radius` — o canto sai reto.
 *
 * `como` escolhe a receita: raio, ângulo e paradas do gradiente, sombra, e a
 * intensidade do desfoque. Cada valor está em `vidro.css`, transcrito do
 * protótipo. `vidro` escolhe a superfície: `base` leva o gradiente da marca por
 * baixo (cromo — rail, cabeçalho, painel do agente) e `alto` é vidro puro
 * (conteúdo — cards e tabelas).
 */
type Como =
  | "rail"
  | "topo"
  | "cromo"
  | "aviso"
  | "kpi"
  | "passos"
  | "cartao"
  | "painel"
  | "tabela"
  | "composer";

interface Props {
  como: Como;
  vidro: "base" | "alto";
  children: ReactNode;
  /** Classes da borda externa — é ela que participa do layout do pai. */
  className?: string;
  /** Classes da superfície interna. */
  classeSup?: string;
  /** Só quando a superfície precisa de semântica própria. */
  elemento?: "div" | "header" | "aside";
}

export function Moldura({ como, vidro, children, className, classeSup, elemento = "div" }: Props) {
  const Sup = elemento;

  return (
    <div className={cn("v-mold", `v-como-${como}`, className)}>
      {/* `data-vidro` é o gancho dos fallbacks: sem suporte a backdrop-filter,
          ou com transparência reduzida no sistema, a superfície vira opaca. */}
      <Sup data-vidro={vidro} className={cn("v-sup", classeSup)}>
        {children}
      </Sup>
    </div>
  );
}
