import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import { LocationMap } from "@/components/ui/expand-map";

export function LocationSection() {
  return (
    <section
      id="localizacao"
      className="min-h-screen flex items-center justify-center py-20 px-4 relative overflow-hidden scroll-snap-start"
    >
      {/* Background glow */}
      <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />

      <div className="container mx-auto max-w-4xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gradient mb-4">
            Localização
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto flex items-center justify-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Onde estamos
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
        >
          <LocationMap
            location="Av. Professor Mello Moraes, 2231 - Butantã, São Paulo - SP"
            coordinates="05508-030"
          />
        </motion.div>
      </div>
    </section>
  );
}
