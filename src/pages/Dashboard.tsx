import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CalendarDays,
  CreditCard,
  Download,
  FileText,
  Hash,
  ImageIcon,
  Loader2,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
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
import {
  buildPosterDownloadUrl,
  formatTicketNumber,
  getDrawContestCode,
  getPaymentContestCode,
  getPromotionContestCode,
  normalizePackageSize,
} from "@/lib/posters";
import { getPublicAppOrigin, hasSecurePublicAppOrigin } from "@/lib/public-app-url";

type Promotion = {
  active?: boolean | null;
  contest_code?: string | null;
  created_at?: string | null;
  description?: string | null;
  end_date?: string | null;
  entry_amount?: number | null;
  file_type?: string | null;
  file_url?: string | null;
  id: string;
  image_url?: string | null;
  is_active?: boolean | null;
  number_package_size?: number | null;
  start_date?: string | null;
  title: string;
};

type AppDraw = {
  contest_code?: string | null;
  created_at?: string | null;
  draw_date: string;
  id: string;
  official_winning_number?: number | null;
  promotion_id?: string | null;
  sequence_number?: number | null;
  status: string;
};

type AppPayment = {
  amount: number;
  contest_code?: string | null;
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

type PromotionNumberRecord = {
  contest_code?: string | null;
  created_at?: string | null;
  id: string;
  payment_id: string;
  promotion_id: string;
  ticket_number: number;
  user_id: string;
};

type PromotionPaymentState = "failed" | "paid" | "pending" | "unpaid";

function getTable(table: string) {
  return (supabase as unknown as { from: (tableName: string) => any }).from(table);
}

function isSchemaDriftError(error: { details?: string; hint?: string; message?: string } | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();

  return (
    message.includes("column") ||
    message.includes("relation") ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("could not find")
  );
}

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

function getCampaignDrawLabel(draw?: AppDraw | null) {
  if (!draw?.sequence_number) {
    return "Sorteio do concurso";
  }

  return `${draw.sequence_number}o sorteio do concurso`;
}

function formatContestLabel(contestCode?: string | null) {
  const normalized = contestCode?.trim();
  return normalized ? `Concurso ${normalized}` : "Concurso em aberto";
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
    data: promotionNumbers = [],
    isFetching: isFetchingNumbers,
    isLoading: numbersLoading,
    refetch: refetchNumbers,
  } = useQuery({
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await getTable("promotion_numbers")
        .select("*")
        .order("ticket_number", { ascending: true });

      if (error) {
        if (isSchemaDriftError(error)) {
          return [] as PromotionNumberRecord[];
        }

        throw error;
      }

      return (data ?? []) as PromotionNumberRecord[];
    },
    queryKey: ["promotion-numbers", user?.id],
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

  const drawsByContestCode = useMemo(() => {
    const map = new Map<string, AppDraw[]>();

    for (const draw of draws) {
      const contestCode = getDrawContestCode(draw);

      if (!contestCode) {
        continue;
      }

      const current = map.get(contestCode) ?? [];
      current.push(draw);
      current.sort((left, right) => new Date(left.draw_date).getTime() - new Date(right.draw_date).getTime());
      map.set(contestCode, current);
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

  const numbersByPaymentId = useMemo(() => {
    const map = new Map<string, PromotionNumberRecord[]>();

    for (const promotionNumber of promotionNumbers) {
      const current = map.get(promotionNumber.payment_id) ?? [];
      current.push(promotionNumber);
      map.set(promotionNumber.payment_id, current);
    }

    for (const current of map.values()) {
      current.sort((left, right) => left.ticket_number - right.ticket_number);
    }

    return map;
  }, [promotionNumbers]);

  const nextOverallDraw = useMemo(() => {
    return draws.find((draw) => isUpcomingDraw(draw) && Boolean(getDrawContestCode(draw))) ?? null;
  }, [draws]);

  const approvedPayments = useMemo(() => {
    return payments.filter((payment) => normalizePaymentStatus(payment.status) === "paid");
  }, [payments]);

  const downloadsReady = useMemo(() => {
    return approvedPayments
      .map((payment) => {
        const promotion = payment.promotion_id ? promotionById.get(payment.promotion_id) ?? null : null;

        if (!promotion?.file_url) {
          return null;
        }

        return {
          contestCode: getPaymentContestCode(payment, promotion),
          downloadUrl: buildPosterDownloadUrl(promotion.file_url),
          numbers: numbersByPaymentId.get(payment.id) ?? [],
          payment,
          promotion,
        };
      })
      .filter(Boolean) as Array<{
      contestCode: string;
      downloadUrl: string;
      numbers: PromotionNumberRecord[];
      payment: AppPayment;
      promotion: Promotion;
    }>;
  }, [approvedPayments, numbersByPaymentId, promotionById]);

  const isRefreshing =
    isFetchingPromotions ||
    isFetchingDraws ||
    isFetchingPayments ||
    isFetchingNumbers ||
    isFetchingParticipantControls;

  async function handleStartCheckout(promotion: Promotion) {
    if (!session || !user) {
      toast.error("Entre na sua conta para comprar o poster.");
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
      await Promise.all([
        refetchPromotions(),
        refetchDraws(),
        refetchPayments(),
        refetchNumbers(),
        refetchParticipantControls(),
      ]);
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
            Seu painel agora organiza tudo em torno do poster digital: compra aprovada libera o PDF e os numeros
            promocionais vinculados ao sorteio do concurso.
          </p>

          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <div className="glass-card rounded-[1.75rem] border border-primary/15 p-6">
              <Download className="mb-3 h-8 w-8 text-primary" />
              <p className="text-sm uppercase tracking-[0.24em] text-primary/70">Downloads liberados</p>
              <p className="mt-3 text-3xl font-display font-bold">{downloadsReady.length}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Posters aprovados e prontos para baixar com um clique.
              </p>
            </div>

            <div className="glass-card rounded-[1.75rem] border border-white/10 p-6">
              <Hash className="mb-3 h-8 w-8 text-accent" />
              <p className="text-sm uppercase tracking-[0.24em] text-accent/80">Numeros recebidos</p>
              <p className="mt-3 text-xl font-display font-semibold">
                {promotionNumbers.length}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Cada numero e unico dentro do concurso e sai do pacote definido no backoffice.
              </p>
            </div>

            <div className="glass-card rounded-[1.75rem] border border-white/10 p-6">
              <CalendarDays className="mb-3 h-8 w-8 text-primary" />
              <p className="text-sm uppercase tracking-[0.24em] text-primary/70">Proxima rodada</p>
              <p className="mt-3 text-xl font-display font-semibold">
                {nextOverallDraw ? formatContestLabel(getDrawContestCode(nextOverallDraw)) : "Aguardando agenda"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {nextOverallDraw
                  ? `${getCampaignDrawLabel(nextOverallDraw)} em ${formatDrawDateLabel(nextOverallDraw.draw_date)}`
                  : "Assim que a equipe abrir um sorteio para um concurso, ele aparece aqui."}
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
                <h2 className="text-2xl font-display font-semibold">Posters disponiveis</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  O pagamento aprovado libera o PDF e o pacote de numeros da promocao, sempre vinculado ao concurso.
                </p>
              </div>

              <Button
                disabled={isRefreshing}
                onClick={() =>
                  void Promise.all([
                    refetchPromotions(),
                    refetchDraws(),
                    refetchPayments(),
                    refetchNumbers(),
                    refetchParticipantControls(),
                  ])
                }
                size="sm"
                variant="glass"
              >
                <RefreshCw className={isRefreshing ? "animate-spin" : ""} />
                Atualizar
              </Button>
            </div>

            {promotionsLoading || drawsLoading ? (
              <div className="flex items-center gap-3 rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Carregando posters e rodadas...
              </div>
            ) : promotions.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {promotions.map((promotion) => {
                  const contestCode = getPromotionContestCode(promotion);
                  const promotionDraws = drawsByContestCode.get(contestCode) ?? [];
                  const promotionPayments = paymentsByPromotionId.get(promotion.id) ?? [];
                  const upcomingDraw = promotionDraws.find(isUpcomingDraw) ?? null;
                  const latestPaidPayment =
                    promotionPayments.find((payment) => normalizePaymentStatus(payment.status) === "paid") ?? null;
                  const latestAnalyzingPayment =
                    promotionPayments.find(
                      (payment) =>
                        normalizePaymentStatus(payment.status) === "pending" && Boolean(payment.transaction_id),
                    ) ?? null;
                  const latestRetryablePayment =
                    promotionPayments.find(
                      (payment) =>
                        normalizePaymentStatus(payment.status) === "pending" && !payment.transaction_id,
                    ) ?? null;
                  const latestFailedPayment =
                    promotionPayments.find((payment) => normalizePaymentStatus(payment.status) === "failed") ?? null;
                  const highlightedPayment =
                    latestPaidPayment ?? latestRetryablePayment ?? latestFailedPayment ?? promotionPayments[0] ?? null;
                  const paymentState: PromotionPaymentState = highlightedPayment
                    ? normalizePaymentStatus(highlightedPayment.status)
                    : "unpaid";
                  const successfulPurchasesCount = promotionPayments.filter(
                    (payment) => normalizePaymentStatus(payment.status) === "paid",
                  ).length;
                  const hasMercadoPagoTransaction = Boolean(latestAnalyzingPayment?.transaction_id);
                  const paymentMeta =
                    latestAnalyzingPayment
                      ? getPaymentStatusMeta(latestAnalyzingPayment.status)
                      : highlightedPayment && paymentState !== "unpaid"
                        ? getPaymentStatusMeta(highlightedPayment.status)
                        : null;
                  const packageSize = normalizePackageSize(promotion.number_package_size);
                  const assignedNumbers = latestPaidPayment ? numbersByPaymentId.get(latestPaidPayment.id) ?? [] : [];
                  const downloadUrl =
                    latestPaidPayment && promotion.file_url ? buildPosterDownloadUrl(promotion.file_url) : null;
                  const promotionBadge = latestAnalyzingPayment
                    ? {
                        label: "Pagamento em analise",
                        toneClassName: paymentMeta?.toneClassName ?? "border-amber-400/30 bg-amber-500/10 text-amber-200",
                      }
                    : latestRetryablePayment
                      ? {
                          label: "Retomar compra",
                          toneClassName: "border-sky-400/30 bg-sky-500/10 text-sky-200",
                        }
                      : successfulPurchasesCount > 1
                        ? {
                            label: `${successfulPurchasesCount} compras aprovadas`,
                            toneClassName: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
                          }
                        : highlightedPayment
                          ? paymentMeta
                          : participantControls.checkoutBlocked
                      ? {
                          label: "Checkout bloqueado",
                          toneClassName: "border-destructive/30 bg-destructive/10 text-destructive",
                        }
                      : {
                          label: "Disponivel",
                          toneClassName: "border-primary/30 bg-primary/10 text-primary",
                        };
                  const isBusy = isStartingCheckoutFor === promotion.id;
                  const canStartCheckout = !isBusy && !participantControls.checkoutBlocked && !latestAnalyzingPayment;

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
                        <div className="absolute left-4 right-4 top-4 flex flex-wrap items-start justify-between gap-3">
                          <Badge className="border-white/15 bg-black/40 text-white">
                            {formatCurrency(getPromotionAmount(promotion))}
                          </Badge>
                          <div className="flex flex-wrap gap-2">
                            <Badge className="border-white/15 bg-black/40 text-white">
                              {formatContestLabel(contestCode)}
                            </Badge>
                            <Badge className="border-white/15 bg-black/40 text-white">
                              {packageSize} numeros
                            </Badge>
                            <Badge className={promotionBadge.toneClassName}>{promotionBadge.label}</Badge>
                          </div>
                        </div>
                        <div className="absolute bottom-4 left-4 right-4">
                          <h3 className="text-2xl font-display font-semibold">{promotion.title}</h3>
                          <p className="mt-2 line-clamp-2 text-sm text-white/70">
                            {promotion.description ||
                              "Poster digital configurado no backoffice para liberar download e participacao promocional."}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4 p-5">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Conteudo liberado</p>
                            <p className="mt-2 text-lg font-semibold">
                              {latestAnalyzingPayment
                                ? "Pagamento em analise"
                                : latestRetryablePayment
                                  ? "Checkout aguardando conclusao"
                                  : successfulPurchasesCount
                                    ? "Poster e numeros liberados"
                                    : participantControls.checkoutBlocked
                                      ? "Checkout bloqueado"
                                      : paymentState === "failed"
                                        ? "Nova tentativa liberada"
                                        : "Aguardando sua compra"}
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {latestAnalyzingPayment
                                ? paymentMeta?.description ?? "O Mercado Pago ainda esta processando sua cobranca."
                                : latestRetryablePayment
                                  ? "Houve uma tentativa sem transacao confirmada. Voce pode abrir o checkout novamente."
                                  : successfulPurchasesCount
                                    ? successfulPurchasesCount > 1
                                      ? `${successfulPurchasesCount} compras aprovadas nesta promocao. A mais recente liberou ${assignedNumbers.length || packageSize} numeros promocionais.`
                                      : `${assignedNumbers.length || packageSize} numeros promocionais vinculados a sua compra mais recente.`
                                    : participantControls.checkoutBlocked
                                      ? participantControls.blockReason ||
                                        "A equipe bloqueou temporariamente novas compras para a sua conta."
                                      : "A compra aprovada libera o poster em PDF e os numeros promocionais."}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Sorteio do concurso</p>
                            <p className="mt-2 text-lg font-semibold">
                              {upcomingDraw ? formatDrawDateLabel(upcomingDraw.draw_date) : "Aguardando agenda"}
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {upcomingDraw
                                ? `${getCampaignDrawLabel(upcomingDraw)} de ${formatContestLabel(contestCode)} com base nos 4 ultimos digitos do 1o premio da Federal.`
                                : "O backoffice ainda vai abrir o sorteio deste concurso."}
                            </p>
                          </div>
                        </div>

                        {assignedNumbers.length ? (
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Seus numeros</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {assignedNumbers.map((promotionNumber) => (
                                <Badge className="border-primary/25 bg-primary/10 text-primary" key={promotionNumber.id}>
                                  #{formatTicketNumber(promotionNumber.ticket_number)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="grid gap-3 sm:grid-cols-2">
                          <Button
                            className="w-full"
                            disabled={!canStartCheckout}
                            onClick={() => void handleStartCheckout(promotion)}
                            size="lg"
                            variant="hero"
                          >
                            {isBusy ? <Loader2 className="animate-spin" /> : null}
                            {hasMercadoPagoTransaction
                                ? "Pagamento em analise"
                                : participantControls.checkoutBlocked
                                  ? "Checkout bloqueado"
                                  : latestRetryablePayment
                                     ? "Retomar checkout"
                                    : successfulPurchasesCount
                                      ? "Comprar novamente"
                                    : paymentState === "failed"
                                      ? "Tentar novamente"
                                      : "Comprar poster"}
                          </Button>

                          {downloadUrl ? (
                            <Button asChild className="w-full" size="lg" variant="hero-outline">
                              <a href={downloadUrl} rel="noreferrer" target="_blank">
                                <Download className="h-4 w-4" />
                                Baixar PDF
                              </a>
                            </Button>
                          ) : (
                            <Button className="w-full" disabled size="lg" variant="outline">
                              <FileText className="h-4 w-4" />
                              Download apos aprovacao
                            </Button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-5 text-sm text-muted-foreground">
                Nenhum poster ativo no momento. Assim que o backoffice publicar uma nova campanha, ela aparece aqui.
              </div>
            )}
          </section>

          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]">
            <section className="glass-card rounded-[2rem] p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl border border-primary/15 bg-primary/10 p-3 text-primary">
                  <Download className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-2xl font-display font-semibold">Downloads</h2>
                  <p className="text-sm text-muted-foreground">Posters pagos e prontos para baixar.</p>
                </div>
              </div>

              <div className="space-y-3">
                {paymentsLoading ? (
                  <div className="flex items-center gap-3 rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-5 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Carregando seus downloads...
                  </div>
                ) : downloadsReady.length ? (
                  downloadsReady.map(({ downloadUrl, payment, promotion, numbers }) => (
                    <div
                      className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4"
                      key={payment.id}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold">{promotion.title}</p>
                          <p className="text-sm text-muted-foreground">
                            Liberado em {formatPaymentMoment(payment.payment_date ?? payment.created_at)}
                          </p>
                        </div>
                        <Button asChild size="sm" variant="hero-outline">
                          <a href={downloadUrl} rel="noreferrer" target="_blank">
                            <Download className="h-4 w-4" />
                            Baixar PDF
                          </a>
                        </Button>
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">
                        {numbers.length} numero(s) promocional(is) vinculado(s) a esta compra.
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-5 text-sm text-muted-foreground">
                    Nenhum poster liberado ainda. Assim que um pagamento for aprovado, o download aparece aqui.
                  </div>
                )}
              </div>
            </section>

            <section className="glass-card rounded-[2rem] p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl border border-accent/20 bg-accent/10 p-3 text-accent">
                  <Hash className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-2xl font-display font-semibold">Numeros</h2>
                  <p className="text-sm text-muted-foreground">Todos os numeros recebidos por compra, organizados pelo concurso.</p>
                </div>
              </div>

              <div className="space-y-3">
                {numbersLoading ? (
                  <div className="flex items-center gap-3 rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-5 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Carregando seus numeros...
                  </div>
                ) : downloadsReady.length ? (
                  downloadsReady.map(({ contestCode, numbers, payment, promotion }) => {
                    const upcomingDraw = drawsByContestCode.get(contestCode)?.find(isUpcomingDraw) ?? null;

                    return (
                      <div
                        className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4"
                        key={`${payment.id}-numbers`}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-semibold">{promotion.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {upcomingDraw
                                ? `${getCampaignDrawLabel(upcomingDraw)} em ${formatDrawDateLabel(upcomingDraw.draw_date)}`
                                : "Sorteio ainda nao agendado para este concurso."}
                            </p>
                          </div>
                          <Badge className="border-white/15 bg-white/5 text-white">
                            {numbers.length || normalizePackageSize(promotion.number_package_size)} numeros
                          </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {numbers.length ? (
                            numbers.map((promotionNumber) => (
                              <Badge className="border-primary/25 bg-primary/10 text-primary" key={promotionNumber.id}>
                                #{formatTicketNumber(promotionNumber.ticket_number)}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              Os numeros ainda estao sincronizando a partir do pagamento aprovado.
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-5 text-sm text-muted-foreground">
                    Seus numeros aparecem aqui logo apos a aprovacao do pagamento.
                  </div>
                )}
              </div>
            </section>

            <div className="space-y-4">
              <section className="glass-card rounded-[2rem] p-6">
                <Sparkles className="mb-3 h-8 w-8 text-primary" />
                <h2 className="text-xl font-display font-semibold">Como funciona agora</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Compra aprovada libera o poster em PDF e gera numeros unicos entre 0001 e 9999 para o concurso.
                  O resultado usa os 4 ultimos digitos do 1o premio da Loteria Federal.
                </p>
              </section>

              <Link className="block" to="/chat">
                <section className="glass-card rounded-[2rem] p-6 transition-all hover:glow-gold">
                  <MessageCircle className="mb-3 h-8 w-8 text-primary" />
                  <h2 className="text-xl font-display font-semibold">Chat</h2>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Entre na comunidade, fale com outros participantes e acompanhe a expectativa para a live.
                  </p>
                  <Button className="mt-4 w-full" size="lg" variant="hero-outline">
                    Abrir chat
                  </Button>
                </section>
              </Link>

              <section className="glass-card rounded-[2rem] p-6">
                <ShieldCheck className="mb-3 h-8 w-8 text-accent" />
                <h2 className="text-xl font-display font-semibold">Compra segura por concurso</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  O cadastro com CPF e data de nascimento ajuda a manter a identidade do participante validada e a
                  rastreabilidade administrativa de cada compra de poster.
                </p>
              </section>

              <section className="glass-card rounded-[2rem] p-6">
                <CreditCard className="mb-3 h-8 w-8 text-primary" />
                <h2 className="text-xl font-display font-semibold">Compras recentes</h2>
                <div className="mt-4 space-y-3">
                  {payments.slice(0, 4).map((payment) => {
                    const paymentStatusMeta = getPaymentStatusMeta(payment.status);
                    const paymentDraw = payment.draw_id ? drawById.get(payment.draw_id) ?? null : null;
                    const paymentPromotion =
                      payment.promotion_id ? promotionById.get(payment.promotion_id) ?? null : null;

                    return (
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3" key={payment.id}>
                        <p className="font-medium">{getPaymentReferenceLabel(payment, paymentDraw, paymentPromotion)}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge className={paymentStatusMeta.toneClassName}>{paymentStatusMeta.label}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatPaymentMoment(payment.payment_date ?? payment.created_at)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {!payments.length ? (
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-muted-foreground">
                      Voce ainda nao tem compras registradas.
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        </motion.div>
      </main>
      <Footer />
    </div>
  );
}
