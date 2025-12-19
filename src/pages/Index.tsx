import { useState, useEffect, useRef, useCallback } from "react";
import { Header } from "@/components/Header";
import { BackgroundPaths } from "@/components/ui/background-paths";
import { AboutSection } from "@/components/sections/AboutSection";
import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { LocationSection } from "@/components/sections/LocationSection";
import { FAQSection } from "@/components/sections/FAQSection";
import { ContactSection } from "@/components/sections/ContactSection";

const Index = () => {
  const [scrollUnlocked, setScrollUnlocked] = useState(false);
  const [activeSection, setActiveSection] = useState("inicio");
  const containerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  // Handle CTA click to unlock scroll
  const handleCtaClick = useCallback(() => {
    setScrollUnlocked(true);
    setTimeout(() => {
      document.getElementById("sobre")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, []);

  // Navigate to section
  const handleNavigate = useCallback((sectionId: string) => {
    if (sectionId === "inicio") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      setScrollUnlocked(false);
    } else {
      setScrollUnlocked(true);
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, []);

  // Always start at the top on initial load
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  // Block scroll when on hero and not unlocked
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!scrollUnlocked && window.scrollY < window.innerHeight / 2) {
        e.preventDefault();
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!scrollUnlocked && window.scrollY < window.innerHeight / 2) {
        e.preventDefault();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!scrollUnlocked && window.scrollY < window.innerHeight / 2) {
        if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", " "].includes(e.key)) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [scrollUnlocked]);

  // Track active section
  useEffect(() => {
    const handleScroll = () => {
      const sections = ["inicio", "sobre", "funcionalidades", "faq", "localizacao", "contato"];
      const scrollPosition = window.scrollY + window.innerHeight / 3;

      for (const section of sections) {
        const element = section === "inicio" 
          ? heroRef.current 
          : document.getElementById(section);
        
        if (element) {
          const { offsetTop, offsetHeight } = element;
          if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
            setActiveSection(section);
            
            // Lock scroll again when back to hero
            if (section === "inicio" && window.scrollY < 100) {
              setScrollUnlocked(false);
            }
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div ref={containerRef} className="bg-background min-h-screen">
      <Header onNavigate={handleNavigate} activeSection={activeSection} />
      
      {/* Hero Section */}
      <div ref={heroRef} id="inicio" className="scroll-snap-start">
        <BackgroundPaths
          subtitle="Dados da sua operação. Em segundos. No WhatsApp."
          ctaLabel="Entender o Plum"
          onCta={handleCtaClick}
        />
      </div>

      {/* Other Sections */}
      <AboutSection />
      <FeaturesSection />
      <FAQSection />
      <LocationSection />
      <ContactSection />
    </div>
  );
};

export default Index;
