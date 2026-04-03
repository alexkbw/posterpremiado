import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Calendar,
  CreditCard,
  History,
  ImageIcon,
  Loader2,
  MessageCircle,
  RefreshCw,
  Sparkles,
  Ticket,
  Trophy,
} from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";

import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { createCheckoutPreference } from "@/lib/mercado-pago";
import {
  DEFAULT_PROMOTION_AMOUNT,
  formatCurrency,
  formatDrawDateLabel,
  formatPaymentMoment,
  getPaymentReferenceLabel,
  getPaymentStatusMeta,
  normalizePaymentStatus,
} from "@/lib/payments";
import { getDefaultSelfParticipantControls, loadSelfParticipantControls } from "@/lib/participant-controls";
import { getPublicAppOrigin, hasSecurePublicAppOrigin } from "@/lib/public-app-url";

type Promotion = {
  active?: boolean | null;
  created_at?: string | null;
  description?: string | null;
  end_date?: string | null;
  entry_amount?: number | null;
  id: string;
  image_url?: string | null;
  is_active?: boolean | null;
  start_date?: string | null;
  title: string;
};

type AppDraw = {
  created_at?: string | null;
  draw_date: string;
  executed_at?: string | null;
  id: string;
  promotion_id?: string | null;
  sequence_number?: number | null;
  status: string;
  winner_count?: number | null;
};

type AppPayment = {
  amount: number;
  created_at?: string | null;
  draw_id?: string | null;
  id: string;
  payment_date?: string | null;
  payment_method?: string | null;
  promotion_id?: string | null;
  status: string;
  transaction_id?: string | null;
  user_id: string;
  week_reference?: string | null;
};

type PromotionPaymentState = "failed" | "paid" | "pending" | "unpaid";

function isPromotionActive(promotion: Promotion) {
  if (typeof promotion.is_active === "boolean") {
    return promotion.is_active;
  }

  if (typeof promotion.active === "boolean") {
    return promotion.active;
  }

  return true;
}

function isUpcomingDraw(draw: AppDraw) {
  const status = draw.status.toLowerCase();
  return status === "pending" || status === "scheduled";
}

function getPromotionAmount(promotion?: Promotion | null) {
  const value = Number(promotion?.entry_amount ?? DEFAULT_PROMOTION_AMOUNT);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PROMOTION_AMOUNT;
}

function getHighlightedPayment(payments: AppPayment[]) {
  return (
    payments.find((payment) => normalizePaymentStatus(payment.status) === "paid") ??
    payments.find((payment) => normalizePaymentStatus(payment.status) === "pending") ??
    payments[0] ??
    null
  );
}

function getDrawSequenceLabel(draw?: AppDraw | null) {
  if (!draw?.sequence_number) {
    return "Sorteio da promoção";
  }

  return `${draw.sequence_number}º sorteio da promoção`;
}

function getPromotionPaymentState(payment?: AppPayment | null): PromotionPaymentState {
  if (!payment) {
    return "unpaid";
  }

  return normalizePaymentStatus(payment.status);
}

export default function Dashboard() {
  const { user, session, loading } = useAuth();
  const [isStartingCheckoutFor, setIsStartingCheckoutFor] = useState<string | null>(null);

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.display_name ||
    user?.email?.split("@")[0] ||
    "Participante";

  const isLocalPreview =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  const checkoutSupportsRedirectBack = hasSecurePublicAppOrigin();

  const {
    data: promotions = [],
    isFetching: isFetchingPromotions,
    isLoading: promotionsLoading,
    refetch: refetchPromotions,
  } = useQuery({
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promotions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return ((data ?? []) as Promotion[]).filter(isPromotionActive);
    },
    queryKey: ["promotions", user?.id],
  });

  const {
    data: draws = [],
    isFetching: isFetchingDraws,
    isLoading: drawsLoading,
    refetch: refetchDraws,
  } = useQuery({
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("draws")
        .select("*")
        .order("draw_date", { ascending: true })
        .limit(48);

      if (error) {
        throw error;
      }

      return (data ?? []) as AppDraw[];
    },
    queryKey: ["draws", user?.id],
  });

  const {
    data: payments = [],
    isFetching: isFetchingPayments,
    isLoading: paymentsLoading,
    refetch: refetchPayments,
  } = useQuery({
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(12);

      if (error) {
        throw error;
      }

      return (data ?? []) as AppPayment[];
    },
    queryKey: ["payments", user?.id],
  });

  const {
    data: participantControls = getDefaultSelfParticipantControls(),
    isFetching: isFetchingParticipantControls,
    refetch: refetchParticipantControls,
  } = useQuery({
    enabled: Boolean(user),
    queryFn: async () => loadSelfParticipantControls(supabase),
    queryKey: ["participant-controls", user?.id],
  });

  const promotionById = useMemo(() => {
    return new Map(promotions.map((promotion) => [promotion.id, promotion]));
  }, [promotions]);

  const drawById = useMemo(() => {
    return new Map(draws.map((draw) => [draw.id, draw]));
  }, [draws]);

  const drawsByPromotionId = useMemo(() => {
    const map = new Map<string, AppDraw[]>();

    for (const draw of draws) {
      if (!draw.promotion_id) {
        continue;
      }

      const current = map.get(draw.promotion_id) ?? [];
      current.push(draw);
      current.sort((left, right) => new Date(left.draw_date).getTime() - new Date(right.draw_date).getTime());
      map.set(draw.promotion_id, current);
    }

    return map;
  }, [draws]);

  const paymentsByPromotionId = useMemo(() => {
    const map = new Map<string, AppPayment[]>();

    for (const payment of payments) {
      if (!payment.promotion_id) {
        continue;
      }

      const current = map.get(payment.promotion_id) ?? [];
      current.push(payment);
      map.set(payment.promotion_id, current);
    }

    return map;
  }, [payments]);

  const nextOverallDraw = useMemo(() => {
    return draws.find((draw) => isUpcomingDraw(draw) && Boolean(draw.promotion_id)) ?? null;
  }, [draws]);

  const paidPromotionsCount = useMemo(() => {
    return promotions.filter((promotion) => {
      const payment = getHighlightedPayment(paymentsByPromotionId.get(promotion.id) ?? []);
      return normalizePaymentStatus(payment?.status) === "paid";
    }).length;
  }, [paymentsByPromotionId, promotions]);

  async function handleStartCheckout(promotion: Promotion) {
    if (!session || !user) {
      toast.error("Entre na sua conta para comprar a promocao.");
      return;
    }

    if (participantControls.checkoutBlocked) {
      toast.error(
        participantControls.blockReason ||
          "Seu acesso a novos checkouts foi temporariamente bloqueado pela equipe.",
      );
      return;
    }

    try {
      setIsStartingCheckoutFor(promotion.id);

      const checkout = await createCheckoutPreference(session, {
        originUrl: getPublicAppOrigin() ?? window.location.origin,
        payerEmail: user.email,
        payerName: displayName,
        promotionId: promotion.id,
        title: promotion.title,
      });

      if (!checkout.usesRedirectBack) {
        toast.info(
          "O Checkout foi aberto sem uma URL HTTPS de retorno. Depois do pagamento, reabra o painel para conferir o status.",
        );

        await new Promise((resolve) => {
          window.setTimeout(resolve, 1200);
        });
      }

      window.location.assign(checkout.checkoutUrl);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel iniciar o Checkout Pro agora.",
      );
      await Promise.all([refetchPromotions(), refetchDraws(), refetchPayments(), refetchParticipantControls()]);
    } finally {
      setIsStartingCheckoutFor(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pb-10 pt-20">
        <motion.div animate={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 20 }}>
          <h1 className="mb-2 text-3xl font-display font-bold">
            Ola, <span className="text-gradient-gold">{displayName}</span>
          </h1>
          <p className="mb-8 max-w-3xl text-muted-foreground">
            Aqui voce compra as promocoes criadas no backoffice. Quando a equipe abrir um sorteio para a promocao,
            sua entrada entra na fila oficial e participa da apuracao com 3 vencedores.
          </p>

          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <div className="glass-card rounded-[1.75rem] border border-primary/15 p-6">
              <Ticket className="mb-3 h-8 w-8 text-primary" />
              <p className="text-sm uppercase tracking-[0.24em] text-primary/70">Promocoes ativas</p>
              <p className="mt-3 text-3xl font-display font-bold">{promotions.length}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Cada promocao pode virar ate 3 sorteios executados manualmente no backoffice.
              </p>
            </div>

            <div className="glass-card rounded-[1.75rem] border border-white/10 p-6">
              <Trophy className="mb-3 h-8 w-8 text-accent" />
              <p className="text-sm uppercase tracking-[0.24em] text-accent/80">Proximo sorteio</p>
              <p className="mt-3 text-xl font-display font-semibold">
                {nextOverallDraw?.promotion_id
                  ? promotionById.get(nextOverallDraw.promotion_id)?.title ?? "Promocao vinculada"
                  : "Aguardando criacao"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {nextOverallDraw
                  ? `${getDrawSequenceLabel(nextOverallDraw)} em ${formatDrawDateLabel(nextOverallDraw.draw_date)}`
                  : "O backoffice ainda nao abriu um sorteio para as promocoes atuais."}
              </p>
            </div>

            <div className="glass-card rounded-[1.75rem] border border-white/10 p-6">
              <Sparkles className="mb-3 h-8 w-8 text-primary" />
              <p className="text-sm uppercase tracking-[0.24em] text-primary/70">Entradas confirmadas</p>
              <p className="mt-3 text-3xl font-display font-bold">{paidPromotionsCount}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Pagamentos aprovados viram vaga valida na fila da promocao correspondente.
              </p>
            </div>
          </div>

          {isLocalPreview && !checkoutSupportsRedirectBack ? (
            <div className="mb-6 rounded-[1.5rem] border border-primary/10 bg-primary/5 px-5 py-4 text-sm text-primary/90">
              O Checkout Pro precisa de uma URL HTTPS para voltar sozinho ao app. Para testes fora da producao, configure `VITE_PUBLIC_APP_URL` com uma URL publica segura do app.
            </div>
          ) : null}

          {participantControls.checkoutBlocked ? (
            <div className="mb-6 rounded-[1.5rem] border border-destructive/30 bg-destructive/10 px-5 py-4 text-sm text-destructive">
              Seu acesso a novos checkouts esta bloqueado no momento.
              {participantControls.blockReason ? ` Motivo informado pela equipe: ${participantControls.blockReason}` : ""}
            </div>
          ) : null}

          <section className="glass-card rounded-[2rem] p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-display font-semibold">Promocoes disponiveis</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  O pagamento aprovado trava sua entrada nessa promocao e evita compras duplicadas.
                </p>
              </div>

              <Button
                disabled={isFetchingPromotions || isFetchingDraws || isFetchingPayments || isFetchingParticipantControls}
                onClick={() => void Promise.all([refetchPromotions(), refetchDraws(), refetchPayments(), refetchParticipantControls()])}
                size="sm"
                variant="glass"
              >
                <RefreshCw className={isFetchingPromotions || isFetchingDraws || isFetchingPayments || isFetchingParticipantControls ? "animate-spin" : ""} />
                Atualizar
              </Button>
            </div>

            {promotionsLoading ? (
              <div className="flex items-center gap-3 rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Carregando promocoes...
              </div>
            ) : promotions.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {promotions.map((promotion) => {
                  const promotionDraws = drawsByPromotionId.get(promotion.id) ?? [];
                  const upcomingDraw = promotionDraws.find(isUpcomingDraw) ?? null;
                  const completedDraws = promotionDraws.filter((draw) => draw.status.toLowerCase() === "drawn").length;
                  const highlightedPayment = getHighlightedPayment(paymentsByPromotionId.get(promotion.id) ?? []);
                  const paymentState = getPromotionPaymentState(highlightedPayment);
                  const hasMercadoPagoTransaction = Boolean(highlightedPayment?.transaction_id);
                  const paymentMeta =
                    highlightedPayment && paymentState !== "unpaid"
                      ? getPaymentStatusMeta(highlightedPayment.status)
                      : null;
                  const promotionBadge = highlightedPayment
                    ? paymentState === "pending" && !hasMercadoPagoTransaction
                      ? {
                          description: "Existe uma tentativa anterior sem confirmacao de transacao. Voce pode abrir o checkout novamente.",
                          label: "Retomar compra",
                          toneClassName: "border-sky-400/30 bg-sky-500/10 text-sky-200",
                        }
                      : paymentMeta
                    : participantControls.checkoutBlocked
                      ? {
                          description:
                            participantControls.blockReason ||
                            "A equipe bloqueou temporariamente novas tentativas de checkout para a sua conta.",
                          label: "Checkout bloqueado",
                          toneClassName: "border-destructive/30 bg-destructive/10 text-destructive",
                        }
                      : {
                          description: "Promocao liberada para novas entradas.",
                          label: "Disponivel",
                          toneClassName: "border-primary/30 bg-primary/10 text-primary",
                        };
                  const isBusy = isStartingCheckoutFor === promotion.id;
                  const canStartCheckout =
                    !isBusy &&
                    !participantControls.checkoutBlocked &&
                    (!highlightedPayment ||
                      paymentState === "failed" ||
                      (paymentState === "pending" && !hasMercadoPagoTransaction));

                  return (
                    <article
                      className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-black/20"
                      key={promotion.id}
                    >
                      <div className="relative h-48">
                        {promotion.image_url ? (
                          <img
                            alt={promotion.title}
                            className="h-full w-full object-cover"
                            src={promotion.image_url}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center bg-secondary/40 text-muted-foreground">
                            <ImageIcon className="h-8 w-8" />
                          </div>
                        )}

                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,15,0.08),rgba(5,6,15,0.88))]" />
                        <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
                          <Badge className="border-white/15 bg-black/40 text-white">
                            {formatCurrency(getPromotionAmount(promotion))}
                          </Badge>
                          <Badge className={promotionBadge.toneClassName}>{promotionBadge.label}</Badge>
                        </div>
                        <div className="absolute bottom-4 left-4 right-4">
                          <h3 className="text-2xl font-display font-semibold">{promotion.title}</h3>
                          <p className="mt-2 line-clamp-2 text-sm text-white/70">
                            {promotion.description || "Promocao criada no backoffice e aberta para novas entradas."}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4 p-5">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Fila da promocao</p>
                            <p className="mt-2 text-lg font-semibold">
                              {paymentState === "paid"
                                ? "Entrada confirmada"
                                : paymentState === "pending" && hasMercadoPagoTransaction
                                  ? "Pagamento em analise"
                                  : participantControls.checkoutBlocked
                                    ? "Checkout bloqueado"
                                  : paymentState === "pending"
                                    ? "Checkout aguardando conclusao"
                                  : paymentState === "failed"
                                    ? "Nova tentativa liberada"
                                  : "Aguardando sua compra"}
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {highlightedPayment
                                ? paymentState === "pending" && !hasMercadoPagoTransaction
                                  ? "Houve uma tentativa sem transacao confirmada. Voce pode abrir o checkout novamente."
                                  : paymentMeta?.description
                                : participantControls.checkoutBlocked
                                  ? participantControls.blockReason ||
                                    "A equipe bloqueou temporariamente novas compras para a sua conta."
                                  : "Seu nome entra na fila somente quando o pagamento for aprovado."}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Sorteios vinculados</p>
                            <p className="mt-2 text-lg font-semibold">{promotionDraws.length}/3</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {upcomingDraw
                                ? `${getDrawSequenceLabel(upcomingDraw)} em ${formatDrawDateLabel(upcomingDraw.draw_date)}`
                                : completedDraws
                                  ? `${completedDraws} sorteio(s) ja executado(s) para esta promocao`
                                  : "A equipe ainda vai escolher quando abrir o primeiro sorteio desta promocao."}
                            </p>
                          </div>
                        </div>

                        <Button
                          className="w-full"
                          disabled={!canStartCheckout}
                          onClick={() => void handleStartCheckout(promotion)}
                          size="lg"
                          variant="hero"
                        >
                          {isBusy ? <Loader2 className="animate-spin" /> : null}
                          {paymentState === "paid"
                            ? "Entrada garantida"
                            : paymentState === "pending" && hasMercadoPagoTransaction
                              ? "Pagamento em analise"
                              : participantControls.checkoutBlocked
                                ? "Checkout bloqueado"
                              : paymentState === "pending"
                                ? "Retomar checkout"
                              : paymentState === "failed"
                                ? "Tentar novamente"
                              : "Comprar promocao"}
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-5 text-sm text-muted-foreground">
                Nenhuma promocao ativa no momento. Assim que o backoffice publicar uma nova campanha, ela aparece aqui.
              </div>
            )}
          </section>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="glass-card rounded-[2rem] p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <History className="mb-3 h-8 w-8 text-primary" />
                  <h2 className="text-2xl font-display font-semibold">Historico de pagamentos</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    O historico mostra em qual promocao sua compra ficou registrada.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {paymentsLoading ? (
                  <div className="flex items-center gap-3 rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-5 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Carregando seu historico de pagamentos...
                  </div>
                ) : payments.length ? (
                  payments.map((payment) => {
                    const paymentStatusMeta = getPaymentStatusMeta(payment.status);
                    const paymentDraw = payment.draw_id ? drawById.get(payment.draw_id) ?? null : null;
                    const paymentPromotion = payment.promotion_id
                      ? promotionById.get(payment.promotion_id) ?? null
                      : null;

                    return (
                      <div
                        className="flex flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                        key={payment.id}
                      >
                        <div>
                          <p className="font-semibold">
                            {getPaymentReferenceLabel(payment, paymentDraw, paymentPromotion)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatPaymentMoment(payment.payment_date ?? payment.created_at)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-sm font-medium">{formatCurrency(Number(payment.amount ?? 0))}</span>
                          <Badge className={paymentStatusMeta.toneClassName}>{paymentStatusMeta.label}</Badge>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-5 text-sm text-muted-foreground">
                    Voce ainda nao tem pagamentos registrados.
                  </div>
                )}
              </div>
            </section>

            <div className="space-y-4">
              <section className="glass-card rounded-[2rem] p-6">
                <Calendar className="mb-3 h-8 w-8 text-primary" />
                <h2 className="text-xl font-display font-semibold">Como a fila funciona</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  O pagamento aprovado entra na fila da promocao. Depois o backoffice escolhe essa promocao,
                  cria um sorteio e sorteia 3 numeros unicos com base nas posicoes da fila.
                </p>
              </section>

              <Link className="block" to="/chat">
                <section className="glass-card rounded-[2rem] p-6 transition-all hover:glow-gold">
                  <MessageCircle className="mb-3 h-8 w-8 text-primary" />
                  <h2 className="text-xl font-display font-semibold">Chat</h2>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Converse com outros participantes e acompanhe o clima antes da live do sorteio.
                  </p>
                  <Button className="mt-4 w-full" size="lg" variant="hero-outline">
                    Abrir chat
                  </Button>
                </section>
              </Link>

              <section className="glass-card rounded-[2rem] p-6">
                <CreditCard className="mb-3 h-8 w-8 text-accent" />
                <h2 className="text-xl font-display font-semibold">Compra unica por promocao</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Cada usuario pode ter apenas uma entrada ativa por promocao. O cadastro com CPF e data de
                  nascimento ajuda a proteger essa regra.
                </p>
              </section>
            </div>
          </div>
        </motion.div>
      </main>
      <Footer />
    </div>
  );
}
