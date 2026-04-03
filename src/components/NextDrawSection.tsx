import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Settings2, Trophy } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatDrawDateLabel } from "@/lib/payments";

type Draw = {
  draw_date: string;
  id: string;
  prize_per_winner?: number | null;
  prize_pool?: number | null;
  promotion_id?: string | null;
  sequence_number?: number | null;
  status: string;
};

type Promotion = {
  id: string;
  title: string;
};

export default function NextDrawSection() {
  const [draw, setDraw] = useState<Draw | null>(null);
  const [promotion, setPromotion] = useState<Promotion | null>(null);

  useEffect(() => {
    let active = true;

    void supabase
      .from("draws")
      .select("*")
      .in("status", ["pending", "scheduled"])
      .order("draw_date", { ascending: true })
      .limit(1)
      .then(async ({ data }) => {
        if (!active || !data || data.length === 0) {
          return;
        }

        const nextDraw = data[0] as Draw;
        setDraw(nextDraw);

        if (!nextDraw.promotion_id) {
          return;
        }

        const promotionResponse = await supabase
          .from("promotions")
          .select("id, title")
          .eq("id", nextDraw.promotion_id)
          .maybeSingle();

        if (active && promotionResponse.data) {
          setPromotion(promotionResponse.data as Promotion);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="bg-background py-20">
      <div className="container mx-auto px-4">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 20 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <h2 className="mb-8 text-3xl font-bold font-display sm:text-4xl">
            Proximo <span className="text-gradient-gold">Sorteio</span>
          </h2>

          <div className="glass-card rounded-2xl p-8">
            {draw ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <Calendar className="h-5 w-5" />
                  <span className="text-lg font-semibold">{formatDrawDateLabel(draw.draw_date)}</span>
                </div>

                <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
                  {promotion?.title ?? "Promocao vinculada"} {draw.sequence_number ? `• ${draw.sequence_number}º sorteio` : ""}
                </p>

                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div className="rounded-xl bg-secondary/50 p-4">
                    <Trophy className="mx-auto mb-2 h-6 w-6 text-primary" />
                    <p className="text-2xl font-bold font-display text-primary">
                      {draw.prize_per_winner
                        ? `R$ ${Number(draw.prize_per_winner).toFixed(2)}`
                        : "3 ganhadores"}
                    </p>
                    <p className="text-xs text-muted-foreground">Cada ganhador recebe</p>
                  </div>
                  <div className="rounded-xl bg-secondary/50 p-4">
                    <Settings2 className="mx-auto mb-2 h-6 w-6 text-accent" />
                    <p className="text-2xl font-bold font-display text-accent">Manual</p>
                    <p className="text-xs text-muted-foreground">Execucao e live no backoffice</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Trophy className="mx-auto h-10 w-10 text-primary" />
                <p className="text-lg font-semibold font-display">Em breve</p>
                <p className="text-sm text-muted-foreground">
                  O proximo sorteio sera anunciado assim que o backoffice vincular uma promocao a uma nova rodada.
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
