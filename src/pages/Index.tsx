import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/sections/HeroSection";
import { PartnersSection } from "@/components/sections/PartnersSection";
import { AboutSection } from "@/components/sections/AboutSection";
import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { LocationSection } from "@/components/sections/LocationSection";
import { FAQSection } from "@/components/sections/FAQSection";
import { ContactSection } from "@/components/sections/ContactSection";

// Ordem de exibição real: Hero, Parceiros (sem id), Sobre, Funcionalidades, FAQ,
// Localização, Contato — ver `docs/2026-08-12-PLANO-merge-landing-page.md` §3.
const SECTION_IDS = ["inicio", "sobre", "funcionalidades", "faq", "localizacao", "contato"];

const Index = () => {
  const [activeSection, setActiveSection] = useState("inicio");

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

  // Track active section for the header nav / scroll spy
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { threshold: 0, rootMargin: "-40% 0px -55% 0px" },
    );
    SECTION_IDS.forEach((id) => {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, []);

  return (
    // Claro, herdando o mesmo `:root` do ambiente interno (Direção A) — o
    // design novo da landing (branch `rafaela`) já é desenhado pra fundo claro,
    // com `--primary: 329 44% 33%` = a mesma marca do produto. O opt-in por
    // `.dark` que existia aqui antes do merge (ver `docs/2026-08-12-PLANO-
    // merge-landing-page.md` §1) foi removido de propósito.
    <div className="bg-background min-h-screen">
      <Header onNavigate={handleNavigate} activeSection={activeSection} />
      <HeroSection onNavigate={handleNavigate} />
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
