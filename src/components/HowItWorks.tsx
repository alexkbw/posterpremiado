import { motion } from "framer-motion";
import { Download, FileCheck2, Landmark } from "lucide-react";

const steps = [
  {
    description: "Escolha a campanha ativa, conclua o pagamento no Mercado Pago e aguarde a confirmacao.",
    icon: FileCheck2,
    title: "1. Compre o poster",
  },
  {
    description: "Pagamento aprovado libera o download do PDF e gera automaticamente seus numeros unicos.",
    icon: Download,
    title: "2. Receba o PDF e os numeros",
  },
  {
    description: "O sorteio usa os 4 ultimos digitos do 1o premio da Loteria Federal.",
    icon: Landmark,
    title: "3. Acompanhe a rodada",
  },
];

export default function HowItWorks() {
  return (
    <section className="bg-background py-20">
      <div className="container mx-auto px-4">
        <motion.div
          className="mb-12 text-center"
          initial={{ opacity: 0, y: 20 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <h2 className="mb-4 text-3xl font-display font-bold sm:text-4xl">
            Como <span className="text-gradient-gold">funciona</span>
          </h2>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Um fluxo simples para vender o poster e acompanhar a apuracao promocional sem ruído.
          </p>
        </motion.div>

        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              className="glass-card group rounded-2xl p-6 text-center transition-all duration-300 hover:glow-gold"
              initial={{ opacity: 0, y: 30 }}
              transition={{ delay: index * 0.15 }}
              viewport={{ once: true }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl gradient-gold transition-transform group-hover:scale-110">
                <step.icon className="h-7 w-7 text-primary-foreground" />
              </div>
              <h3 className="mb-2 text-lg font-display font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
