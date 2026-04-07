import { motion } from "framer-motion";
import { ArrowRight, FileText, Hash, Landmark } from "lucide-react";
import { Link } from "react-router-dom";

import heroBg from "@/assets/hero-bg.jpg";
import { Button } from "@/components/ui/button";

const highlights = [
  { icon: FileText, label: "Conteudo liberado", value: "Poster em PDF" },
  { icon: Hash, label: "Pacote promocional", value: "Quantidade configurada por campanha" },
  { icon: Landmark, label: "Base oficial", value: "Loteria Federal" },
];

export default function HeroSection() {
  return (
    <section className="relative flex min-h-[90vh] items-center justify-center overflow-hidden">
      <div className="absolute inset-0">
        <img alt="" className="h-full w-full object-cover opacity-35" src={heroBg} />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/65 to-background" />
      </div>

      <div className="relative z-10 container mx-auto px-4 text-center">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-4xl"
          initial={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-black/25 px-4 py-2 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.75)]" />
            <span className="text-sm text-muted-foreground">Conteudo digital com beneficio promocional</span>
          </div>

          <h1 className="mb-6 text-4xl font-display font-bold leading-tight sm:text-5xl md:text-6xl">
            Compre o poster oficial,
            <br />
            <span className="text-gradient-gold">baixe o PDF e receba seus numeros</span>
          </h1>

          <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground">
            Cada compra aprovada libera o arquivo digital e a quantidade de numeros unicos definida para a
            campanha, usando os 4 ultimos digitos do 1o premio da Loteria Federal.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link to="/auth">
              <Button size="xl" variant="hero">
                Comprar poster
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button size="xl" variant="hero-outline">
                Ver meus downloads
              </Button>
            </Link>
          </div>
        </motion.div>

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto mt-16 grid max-w-4xl gap-4 md:grid-cols-3"
          initial={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          {highlights.map((highlight) => (
            <div key={highlight.label} className="glass-card rounded-2xl p-5 text-left">
              <div className="mb-4 inline-flex rounded-2xl border border-primary/15 bg-primary/10 p-3 text-primary">
                <highlight.icon className="h-5 w-5" />
              </div>
              <p className="text-lg font-display font-semibold">{highlight.value}</p>
              <p className="mt-2 text-sm text-muted-foreground">{highlight.label}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
