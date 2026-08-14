import { useState, useEffect, useRef, useCallback } from "react";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/sections/HeroSection";
import { PartnersSection } from "@/components/sections/PartnersSection";
import { AboutSection } from "@/components/sections/AboutSection";
import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { LocationSection } from "@/components/sections/LocationSection";
import { FAQSection } from "@/components/sections/FAQSection";
import { ContactSection } from "@/components/sections/ContactSection";

/** As seções observadas pelo scroll spy, na ordem em que aparecem no DOM. */
const SECOES = ["inicio", "sobre", "funcionalidades", "faq", "localizacao", "contato"];

const Index = () => {
  const [activeSection, setActiveSection] = useState("inicio");
  const heroRef = useRef<HTMLDivElement>(null);

  const handleNavigate = useCallback((sectionId: string) => {
    if (sectionId === "inicio") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  // Always start at the top on initial load
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  // Defesa contra a classe `tema-escuro` (produto logado, `src/hooks/use-tema.ts`)
  // ficar presa em `document.documentElement` de uma sessão anterior — o
  // cleanup no próprio hook já cobre o caminho normal (logout), isto cobre o
  // resto (ex.: um link direto para `/` numa aba onde a classe ficou presa por
  // uma versão antiga do código). Ver `contexto/31-incidentes-e-licoes.md`
  // I-06: a landing precisa ser sempre clara, nunca herdar o tema do produto.
  useEffect(() => {
    document.documentElement.classList.remove("tema-escuro");
  }, []);

  // Marca o item do menu correspondente à seção visível.
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + window.innerHeight / 3;

      for (const section of SECOES) {
        const element =
          section === "inicio" ? heroRef.current : document.getElementById(section);

        if (element) {
          const { offsetTop, offsetHeight } = element;
          if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
            setActiveSection(section);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    // Sem `dark` desde 2026-08-12: a landing passou a rodar sobre o `:root`
    // claro, o mesmo do ambiente interno. Ela e o produto sempre dividiram o
    // brand `#7A2F56` — o que os separava era só esta classe. Ver o cabeçalho
    // de `src/index.css`.
    //
    // ⚠️ Removido junto: a "trava de scroll" que existia aqui (estado
    // `scrollUnlocked` + listeners de wheel/touch/keydown). Ela pertencia ao
    // hero antigo, que revelava o resto da página só depois de um gesto — e já
    // não travava nada, porque nunca houve `preventDefault` nem
    // `overflow: hidden`; era estado que só alimentava a si mesmo. Saiu com o
    // hero que a justificava, em vez de virar herança sem dono.
    <div className="bg-background min-h-screen">
      <Header onNavigate={handleNavigate} activeSection={activeSection} />

      <div ref={heroRef} id="inicio">
        <HeroSection onNavigate={handleNavigate} />
      </div>

      {/* Sem `id`: não entra no menu nem no scroll spy, é um respiro entre o
          hero e o "O que somos". */}
      <PartnersSection />

      <AboutSection />
      <FeaturesSection />
      <FAQSection />
      <LocationSection />
      <ContactSection />
    </div>
  );
};

export default Index;
