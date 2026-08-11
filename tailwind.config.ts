import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },

        /* ── Direção A — ambiente interno claro ──────────────────────────────
           Aditivo. Nada acima foi alterado: a landing e as rotas de app
           continuam no tema escuro de `:root`. Estes tokens existem só para
           as telas de `src/components/direcao-a/` e são valores literais de
           propósito — a Direção A é uma proposta de tema claro com marca
           nova (#7A2F56), e misturar isso nas CSS vars de `:root` viraria
           os dois temas ao mesmo tempo.

           Nomes são funções, não aparências: quando a direção for aprovada,
           estes pares viram CSS vars e o resto do app segue os mesmos nomes. */
        plum: {
          brand: "#7A2F56",
          "brand-hover": "#8E3A66",
          "brand-soft": "#9E4472",

          ink: "#191317",
          "ink-soft": "#2E262B",
          text: "#5F545A",
          "text-soft": "#7B6E75",
          muted: "#6F636A",
          "muted-soft": "#736870",

          surface: "#FAF7F8",
          "surface-hover": "#F3EDF0",

          line: "#EBE3E7",
          "line-strong": "#E0D6DB",
          "line-scroll": "#DDD2D8",
          "line-hover": "#C9BBC3",

          tint: "#F5E4EC",
          "tint-soft": "#F7EBF1",
          "tint-line": "#E7CFDC",

          ok: "#276B4E",
          "ok-bg": "#E6F3EC",
          "ok-line": "#A8D6BE",
          warn: "#8A5A12",
          "warn-bg": "#FBF0DF",
          danger: "#B3384F",
          "danger-line": "#E8C4CB",
        },
      },
      fontFamily: {
        /* Aditivo: nenhum destes substitui o `Inter` do `body`.
           `code` e não `mono`: sobrescrever a chave `mono` do Tailwind trocaria
           a fonte de todo `font-mono` já existente (Cfgdatabase, Dashboard,
           DatabasePipeline, ui/chart) sem ninguém pedir. */
        display: ["'Bricolage Grotesque'", "sans-serif"],
        geist: ["Geist", "system-ui", "sans-serif"],
        code: ["'JetBrains Mono'", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(40px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },

        /* Direção A. Prefixo `pl-` mantido do protótipo para o diff ser
           rastreável contra o arquivo de design. */
        "pl-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "none" },
        },
        "pl-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "pl-dot": {
          "0%, 60%, 100%": { opacity: "0.25", transform: "translateY(0)" },
          "30%": { opacity: "1", transform: "translateY(-3px)" },
        },
        "pl-pulse": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        "pl-grow": {
          from: { transform: "scaleY(0)" },
          to: { transform: "scaleY(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.6s ease-out forwards",
        "fade-in-up": "fade-in-up 0.8s ease-out forwards",
        "scale-in": "scale-in 0.4s ease-out forwards",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",

        "pl-up": "pl-up 0.5s ease-out both",
        "pl-in": "pl-in 0.35s ease-out both",
        "pl-dot": "pl-dot 1.3s infinite",
        "pl-pulse": "pl-pulse 2.4s ease-in-out infinite",
        "pl-grow": "pl-grow 0.55s ease-out both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
