import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import plumMascote from "@/assets/plum-mascot-transparent.png";

interface HeaderProps {
  onNavigate: (sectionId: string) => void;
  activeSection: string;
}

/**
 * ⚠️ A ordem aqui tem que bater com a ordem das seções no DOM (`Index.tsx`).
 *
 * Até 2026-08-12 não batia: o menu listava "Localização" antes de "FAQ", mas na
 * página o FAQ vem primeiro. O efeito era o realce do menu pular para trás
 * enquanto a pessoa rolava para a frente, porque o scroll spy segue o DOM e o
 * menu seguia esta lista.
 */
const navItems = [
  { id: "inicio", label: "Início" },
  { id: "sobre", label: "O que somos" },
  { id: "funcionalidades", label: "Funcionalidades" },
  { id: "faq", label: "FAQ" },
  { id: "localizacao", label: "Localização" },
  { id: "contato", label: "Contato" },
];

export function Header({ onNavigate, activeSection }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [progresso, setProgresso] = useState(0);

  const handleNavClick = (sectionId: string) => {
    onNavigate(sectionId);
    setMobileMenuOpen(false);
  };

  // Barra de progresso de leitura no rodapé do header.
  //
  // O cálculo roda dentro de `requestAnimationFrame` porque `scroll` dispara
  // dezenas de vezes por segundo e ler `scrollHeight` força o navegador a
  // recalcular layout: sem a trava, é uma medição de layout por evento.
  useEffect(() => {
    let agendado = false;

    const medir = () => {
      const rolavel = document.documentElement.scrollHeight - window.innerHeight;
      setProgresso(rolavel > 0 ? (window.scrollY / rolavel) * 100 : 0);
      agendado = false;
    };

    const onScroll = () => {
      if (!agendado) {
        agendado = true;
        requestAnimationFrame(medir);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    medir();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/60"
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-[72px]">
          {/* Logo */}
          <button
            onClick={() => handleNavClick("inicio")}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img src={plumMascote} alt="Plum" className="h-8 w-8 object-contain" />
            <span className="text-[19px] font-extrabold text-gradient">Plum</span>
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`px-4 py-2 rounded-[10px] text-sm font-medium transition-all duration-300 ${
                  activeSection === item.id
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {item.label}
              </button>
            ))}

            {/* Vai para o app de verdade, e não para `#contato` como no mockup:
                aqui existe produto atrás deste botão. */}
            <Button
              variant="hero"
              size="default"
              onClick={() => (window.location.href = "/auth")}
              className="ml-4"
            >
              Entrar no Plum
            </Button>
          </nav>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden glass border-t border-border/60 overflow-hidden"
          >
            <nav className="container mx-auto px-4 py-4 flex flex-col gap-2">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`px-4 py-3 rounded-[10px] text-sm font-medium transition-all duration-300 text-left ${
                    activeSection === item.id
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {item.label}
                </button>
              ))}

              <Button
                variant="hero"
                size="default"
                onClick={() => (window.location.href = "/auth")}
                className="mt-2 w-full"
              >
                Entrar no Plum
              </Button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Decorativa: repete, em forma de barra, a posição que a própria rolagem
          já comunica. Fica fora da árvore de acessibilidade. */}
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 h-[3px] bg-gradient-to-r from-primary to-accent-foreground/70"
        style={{ width: `${progresso}%` }}
      />
    </motion.header>
  );
}
