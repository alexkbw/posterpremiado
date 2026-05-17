import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, FileText, Hash } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_PROMOTION_AMOUNT, formatCurrency } from "@/lib/payments";
import type { DomainId } from "@/lib/posters";

type Promotion = {
  active?: boolean | null;
  description: string | null;
  entry_amount?: number | null;
  file_url?: string | null;
  id: DomainId;
  image_url: string | null;
  is_active?: boolean | null;
  title: string;
};

function isPromotionActive(promotion: Promotion) {
  if (typeof promotion.is_active === "boolean") {
    return promotion.is_active;
  }

  if (typeof promotion.active === "boolean") {
    return promotion.active;
  }

  return true;
}

async function loadPromotions() {
  const { data, error } = await supabase.rpc("get_public_promotions");

  if (error) {
    console.error("Error loading public promotions:", error);
    return [];
  }

  return (data ?? []) as Promotion[];
}

export default function PromotionSlider() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let mounted = true;

    void loadPromotions().then((data) => {
      if (mounted) {
        setPromotions(data);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (promotions.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setCurrent((value) => (value + 1) % promotions.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [promotions.length]);

  if (promotions.length === 0) {
    return null;
  }

  const prev = () => setCurrent((value) => (value - 1 + promotions.length) % promotions.length);
  const next = () => setCurrent((value) => (value + 1) % promotions.length);
  const currentPromotion = promotions[current];
  const amount = Number(currentPromotion.entry_amount ?? DEFAULT_PROMOTION_AMOUNT);

  return (
    <section className="bg-secondary/20 py-16">
      <div className="container mx-auto px-4">
        <h2 className="mb-8 text-center text-3xl font-display font-bold">
          <span className="text-gradient-gold">Posters</span> em destaque
        </h2>

        <div className="relative mx-auto min-h-[520px] max-w-4xl overflow-hidden rounded-2xl sm:aspect-[21/9]">
          <AnimatePresence mode="wait">
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="absolute inset-0"
              exit={{ opacity: 0, x: -50 }}
              initial={{ opacity: 0, x: 50 }}
              key={currentPromotion.id}
              transition={{ duration: 0.4 }}
            >
              <img
                alt={currentPromotion.title}
                className="h-full w-full object-cover"
                src={currentPromotion.image_url || "/placeholder.svg"}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
              <div className="absolute left-4 right-4 top-4 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-4 py-2 text-xs uppercase tracking-[0.25em] text-white/80">
                  <FileText className="h-3.5 w-3.5" />
                  Poster digital
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                  <Hash className="h-3.5 w-3.5" />
                  Voce escolhe a quantidade
                </div>
              </div>
              <div className="absolute bottom-4 left-4 right-4">
                <h3 className="text-xl font-display font-bold">{currentPromotion.title}</h3>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <div className="rounded-full border border-primary/20 bg-black/35 px-4 py-2 text-sm font-medium text-primary">
                    {formatCurrency(Number.isFinite(amount) && amount > 0 ? amount : DEFAULT_PROMOTION_AMOUNT)}
                  </div>
                  <Button asChild size="sm" variant="hero-outline">
                    <Link to="/auth">Comprar poster</Link>
                  </Button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {promotions.length > 1 ? (
            <>
              <button
                className="glass-card absolute left-2 top-1/2 z-10 rounded-full p-2 hover:bg-secondary/60"
                onClick={prev}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                className="glass-card absolute right-2 top-1/2 z-10 rounded-full p-2 hover:bg-secondary/60"
                onClick={next}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-2">
                {promotions.map((promotion, index) => (
                  <button
                    className={`h-2 rounded-full transition-all ${
                      index === current ? "w-6 bg-primary" : "w-2 bg-muted-foreground/50"
                    }`}
                    key={promotion.id}
                    onClick={() => setCurrent(index)}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
