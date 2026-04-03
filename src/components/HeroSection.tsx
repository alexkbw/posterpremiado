import { motion } from "framer-motion";
import { Trophy, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import heroBg from "@/assets/hero-bg.jpg";

export default function HeroSection() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <img src={heroBg} alt="" className="w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 glass-card rounded-full px-4 py-2 mb-6">
            <span className="h-2 w-2 rounded-full gradient-green animate-pulse" />
            <span className="text-sm text-muted-foreground">Sorteios toda semana</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-bold mb-6 leading-tight">
            Concorra a prêmios
            <br />
            <span className="text-gradient-gold">toda semana</span>
          </h1>

          <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
            Participe com apenas <span className="text-primary font-semibold">R$ 10,00</span> por semana.
            Todo sábado, 3 sortudos dividem o prêmio!
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/auth">
              <Button variant="hero" size="xl">
                Participar agora
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Link to="/auth">
              <Button variant="hero-outline" size="xl">
                Fazer login
              </Button>
            </Link>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-16 grid grid-cols-3 max-w-lg mx-auto gap-4"
        >
          {[
            { label: "Prêmios semanais", value: "3" },
            { label: "Por semana", value: "R$10" },
            { label: "Para os ganhadores", value: "80%" },
          ].map((stat) => (
            <div key={stat.label} className="glass-card rounded-xl p-4 text-center">
              <p className="text-2xl font-display font-bold text-primary">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
