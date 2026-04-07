import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Hash, Landmark } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDrawDateLabel } from "@/lib/payments";
import { getDrawContestCode } from "@/lib/posters";

type Draw = {
  contest_code?: string | null;
  draw_date: string;
  id: string;
  prize_pool?: number | null;
  promotion_id?: string | null;
  sequence_number?: number | null;
  status: string;
};

type Promotion = {
  contest_code?: string | null;
  id: string;
  title: string;
};

function formatContestLabel(contestCode?: string | null) {
  const normalized = contestCode?.trim();
  return normalized ? `Concurso ${normalized}` : "Concurso em aberto";
}

export default function NextDrawSection() {
  const [draw, setDraw] = useState<Draw | null>(null);
  const [promotions, setPromotions] = useState<Promotion[]>([]);

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

        const contestCode = getDrawContestCode(nextDraw);

        if (!contestCode) {
          return;
        }

        const promotionResponse = await supabase
          .from("promotions")
          .select("id, title, contest_code")
          .eq("contest_code", contestCode)
          .order("title", { ascending: true });

        if (active && promotionResponse.data) {
          setPromotions((promotionResponse.data ?? []) as Promotion[]);
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
          <h2 className="mb-8 text-3xl font-display font-bold sm:text-4xl">
            Proximo <span className="text-gradient-gold">concurso</span>
          </h2>

          <div className="glass-card rounded-2xl p-8">
            {draw ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <Calendar className="h-5 w-5" />
                  <span className="text-lg font-semibold">{formatDrawDateLabel(draw.draw_date)}</span>
                </div>

                <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
                  {formatContestLabel(getDrawContestCode(draw))}
                </p>

                <p className="text-sm text-muted-foreground">
                  {promotions.length
                    ? `${promotions.length} poster(es) participando: ${promotions
                        .slice(0, 2)
                        .map((promotion) => promotion.title)
                        .join(", ")}${promotions.length > 2 ? ` +${promotions.length - 2}` : ""}`
                    : "Os posters vinculados a este concurso aparecem aqui."}
                </p>

                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div className="rounded-xl bg-secondary/50 p-4">
                    <Landmark className="mx-auto mb-2 h-6 w-6 text-primary" />
                    <p className="text-2xl font-display font-bold text-primary">Federal</p>
                    <p className="text-xs text-muted-foreground">4 ultimos digitos do 1o premio</p>
                  </div>
                  <div className="rounded-xl bg-secondary/50 p-4">
                    <Hash className="mx-auto mb-2 h-6 w-6 text-accent" />
                    <p className="text-2xl font-display font-bold text-accent">
                      {draw.prize_pool ? formatCurrency(Number(draw.prize_pool)) : "Ao vivo"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {draw.prize_pool ? "Premio estimado do concurso" : "Resultado consolidado no backoffice"}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Landmark className="mx-auto h-10 w-10 text-primary" />
                <p className="text-lg font-display font-semibold">Em breve</p>
                <p className="text-sm text-muted-foreground">
                  O proximo concurso sera anunciado assim que o backoffice agendar um novo sorteio compartilhado.
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
