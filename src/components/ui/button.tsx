import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Retematizado em 2026-08-12 para a Direção A.
 *
 * Mexer aqui, e não em cada página, é o que faz a identidade nova chegar às
 * telas que ficaram para a próxima leva (`Dashboard.tsx`, `Cfgdatabase.tsx`) sem
 * ninguém tocar no JSX delas — nas duas o `return` tem regra de negócio dentro,
 * e é justamente onde não se quer mexer agora.
 *
 * `rounded-[9px]` é valor arbitrário porque 9px não está na escala do tema
 * (`--radius` 12px dá `md` 10px e `sm` 8px) e o protótipo especifica 9px em todo
 * controle de formulário. 1px de diferença é visível numa pilha de campos.
 *
 * `glass` NÃO foi tocado: variante exclusiva da landing, que segue no tema
 * escuro. Usa `backdrop-blur`, proibido em App UI pelo `DESIGN.md` §1 — o que
 * está certo, porque nenhuma tela de produto a usa.
 *
 * `hero` mudou no merge da landing nova (2026-08-12, ver
 * docs/2026-08-12-PLANO-merge-landing-page.md §2): a versão glassy (pensada
 * pro fundo escuro) virou sólida, porque o design novo usa `bg-primary` liso.
 * Ainda é variante exclusiva da landing — só `Header.tsx`, `HeroSection.tsx` e
 * `multistep-form.tsx` a usam, todos dentro da árvore `.dark` da landing.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[9px] text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // O `-translate-y-px` no hover é a assinatura de interação da Direção A.
        // Fica só no primário: aplicado a tudo, uma tela com muitos botões
        // secundários vira gelatina.
        default:
          "bg-primary text-primary-foreground hover:bg-brand-hover hover:-translate-y-px",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-secondary text-foreground hover:border-line-hover hover:bg-surface-hover",
        secondary: "bg-secondary text-secondary-foreground hover:bg-surface-hover hover:text-foreground",
        ghost: "hover:bg-surface-hover hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        hero: "rounded-2xl bg-primary hover:bg-brand-hover text-primary-foreground shadow-md hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20 transition-all duration-300",
        glass: "rounded-xl backdrop-blur-md bg-card/60 hover:bg-card/80 text-foreground border border-border/30 hover:border-border/50 transition-all duration-300",
      },
      size: {
        // 42px é a altura de controle de formulário do protótipo (era 40px).
        default: "h-[42px] px-4 py-2",
        // 34px é a altura de barra de ferramentas do protótipo (era 36px).
        sm: "h-[34px] rounded-lg px-3",
        lg: "h-11 rounded-[9px] px-8",
        xl: "h-14 rounded-xl px-10 text-lg",
        // Mantido em 40px de propósito, embora o protótipo desenhe 34px: o
        // `DESIGN.md` §9 pede alvo de toque de 44px e o repo já está abaixo
        // disso. Encolher o botão-só-ícone globalmente pioraria acessibilidade
        // para ganhar 6px. Onde o desenho pede 34px, a tela pede por className.
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
