import { motion } from "framer-motion";
import { Wallet, Shuffle, PartyPopper } from "lucide-react";

const steps = [
  {
    icon: Wallet,
    title: "1. Cadastre-se e pague",
    description: "Crie sua conta e pague R$ 10,00 por semana via PIX ou cartão de crédito.",
  },
  {
    icon: Shuffle,
    title: "2. Aguarde o sorteio",
    description: "Todo sábado o montante é somado. 80% vai para os prêmios, 20% para a plataforma.",
  },
  {
    icon: PartyPopper,
    title: "3. Ganhe prêmios!",
    description: "3 números são sorteados. Se sua posição for sorteada, você ganha 1/3 do prêmio!",
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">
            Como <span className="text-gradient-gold">funciona</span>
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Simples, transparente e toda semana
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="glass-card rounded-2xl p-6 text-center group hover:glow-gold transition-all duration-300"
            >
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl gradient-gold mb-4 group-hover:scale-110 transition-transform">
                <step.icon className="h-7 w-7 text-primary-foreground" />
              </div>
              <h3 className="text-lg font-display font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
