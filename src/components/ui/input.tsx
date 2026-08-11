import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Retematizado em 2026-08-12 para a Direção A. Três mudanças, todas visuais:
 *
 * - altura 42px (era 40px) e raio 9px (era 10px), casando com o botão;
 * - fundo `secondary` (a `surface` #FAF7F8) em vez de `background` branco: no
 *   tema claro um campo branco sobre página branca só existe pela borda, e o
 *   protótipo separa os dois de propósito;
 * - foco com **anel de 3px em `tint`** mais a borda virando `primary`, no lugar
 *   do `ring-2` com deslocamento. O deslocamento abre um halo branco em volta do
 *   campo, que no claro lê como falha de renderização. O `DESIGN.md` §9 pede
 *   anel de 2px em `--brand` com 2px de deslocamento para **navegação por
 *   teclado**; aqui o alvo é o campo focado, e a borda colorida já marca isso
 *   sem depender só de cor (o `placeholder` e o rótulo continuam).
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-[42px] w-full rounded-[9px] border border-input bg-secondary px-[13px] py-2 text-base ring-offset-background transition-[border-color,box-shadow] duration-150 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
