import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import plumMascot from "@/assets/plum-mascot-transparent.png";

interface HeaderProps {
  onNavigate: (sectionId: string) => void;
  activeSection: string;
}

const navItems = [
  { id: "inicio", label: "Início" },
  { id: "sobre", label: "O que somos" },
  { id: "funcionalidades", label: "Funcionalidades" },
  { id: "faq", label: "FAQ" },
  { id: "contato", label: "Contato" },
  { id: "localizacao", label: "Localização" },
];

export function Header({ onNavigate, activeSection }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrollPercent, setScrollPercent] = useState(0);

  useEffect(() => {
    let raf: number | null = null;
    const handleScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const doc = document.documentElement;
        const max = doc.scrollHeight - window.innerHeight;
        const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
        setScrollPercent(Math.max(0, Math.min(100, pct)));
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const handleNavClick = (sectionId: string) => {
    onNavigate(sectionId);
    setMobileMenuOpen(false);
  };

  return (
    <motion.header
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="fixed top-0 left-0 right-0 z-50 glass"
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-[72px] gap-6">
          {/* Logo */}
          <button
            onClick={() => handleNavClick("inicio")}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <img src={plumMascot} alt="Plum" className="h-8 w-8 object-contain" />
            <span className="text-[19px] font-extrabold text-gradient">Plum</span>
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 ml-auto">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`px-3.5 py-2 rounded-[10px] text-sm font-medium transition-all duration-200 ${
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
              onClick={() => handleNavClick("contato")}
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
            className="md:hidden glass border-t border-border/40"
          >
            <nav className="container mx-auto px-4 py-4 flex flex-col gap-2">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 text-left ${
                    activeSection === item.id
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <Button variant="hero" size="default" onClick={() => handleNavClick("contato")} className="mt-2 w-full">
                Entrar no Plum
              </Button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scroll progress bar */}
      <div
        className="h-[3px] transition-[width] duration-75 ease-linear"
        style={{
          width: `${scrollPercent}%`,
          background: "linear-gradient(90deg, hsl(329 44% 33%), hsl(331 36% 45%))",
        }}
      />
    </motion.header>
  );
}
