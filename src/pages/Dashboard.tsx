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
  Trophy,
} from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";

import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import PurchaseQuantityDialog from "@/components/PurchaseQuantityDialog";
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
  normalizeFulfillmentStatus,
  normalizePaymentStatus,
} from "@/lib/payments";
import { loadParticipantIdentities } from "@/lib/chat";
import { getDefaultSelfParticipantControls, loadSelfParticipantControls } from "@/lib/participant-controls";
import {
  buildPosterDownloadUrl,
  type DomainId,
  formatTicketNumber,
  getDrawContestCode,
  getDrawPromotionId,
  getPaymentContestCode,
  getPromotionContestCode,
  normalizePosterQuantity,
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
  id: DomainId;
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
  drawn_numbers?: number[] | null;
  executed_at?: string | null;
  federal_contest?: string | null;
  federal_first_prize?: string | null;
  id: DomainId;
  official_winning_number?: number | null;
  prize_per_winner?: number | null;
  result_source?: string | null;
  promotion_id?: DomainId | null;
  sequence_number?: number | null;
  status: string;
  winner_count?: number | null;
  winner_user_ids?: string[] | null;
};

type AppPayment = {
  amount: number;
  checkout_preference_id?: string | null;
  checkout_url?: string | null;
  contest_code?: string | null;
  created_at?: string | null;
  draw_id?: DomainId | null;
  fulfillment_error?: string | null;
  fulfillment_status?: string | null;
  id: DomainId;
  numbers_assigned_at?: string | null;
  payment_date?: string | null;
  payment_method?: string | null;
  poster_quantity?: number | null;
  promotion_id?: DomainId | null;
  reservation_expires_at?: string | null;
  status: string;
  transaction_id?: string | null;
  user_id: string;
  week_reference?: string | null;
};

type PromotionNumberRecord = {
  contest_code?: string | null;
  created_at?: string | null;
  id: DomainId;
  payment_id?: DomainId | null;
  promotion_id?: DomainId | null;
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

function hasActiveReservation(payment?: AppPayment | null) {
  if (!payment?.reservation_expires_at) {
    return false;
  }

  const reservationDeadline = new Date(payment.reservation_expires_at);
  return !Number.isNaN(reservationDeadline.getTime()) && reservationDeadline > new Date();
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

function isResolvedDraw(draw: AppDraw) {
  return draw.status.toLowerCase() === "drawn";
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

function formatContestBadgeLabel(contestCode?: string | null) {
  const normalized = contestCode?.trim();
  return normalized ? `Conc. ${normalized}` : "Conc. em aberto";
}

function formatCompactDrawDateLabel(value?: string | null) {
  if (!value) {
    return "A definir";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "A definir";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
  })
    .format(parsedDate)
    .replace(/\./g, "")
    .replace(" de ", " ");
}

function formatPromotionForecastLabel(endDate?: string | null, fallbackDate?: string | null) {
  const candidate = endDate ?? fallbackDate;

  if (!candidate) {
    return "A definir";
  }

  const parsedDate = new Date(candidate);

  if (Number.isNaN(parsedDate.getTime())) {
    return "A definir";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsedDate);
}

function getWinnerUserIds(draw?: Pick<AppDraw, "winner_user_ids"> | null) {
  if (!Array.isArray(draw?.winner_user_ids)) {
    return [] as string[];
  }

  return draw.winner_user_ids.filter((userId): userId is string => typeof userId === "string" && Boolean(userId.trim()));
}

function getDrawWinnerLabel(args: {
  currentUserId?: string | null;
  draw?: AppDraw | null;
  winnerName?: string | null;
}) {
  const winnerUserIds = getWinnerUserIds(args.draw);
  const winnerCount = Number(args.draw?.winner_count ?? winnerUserIds.length ?? 0);
  const primaryWinnerId = winnerUserIds[0] ?? null;

  if (!winnerCount) {
    return "Aguardando confirmacao";
  }

  if (primaryWinnerId && args.currentUserId && primaryWinnerId === args.currentUserId) {
    return winnerCount > 1 ? `Voce +${winnerCount - 1}` : "Voce";
  }

  if (args.winnerName) {
    return winnerCount > 1 ? `${args.winnerName} +${winnerCount - 1}` : args.winnerName;
  }

  return winnerCount > 1 ? `${winnerCount} ganhadores confirmados` : "Participante confirmado";
}

export default function Dashboard() {
  const { user, session, loading } = useAuth();
  const [checkoutPromotion, setCheckoutPromotion] = useState<Promotion | null>(null);
  const [expandedPromotionCardId, setExpandedPromotionCardId] = useState<string | null>(null);
  const [isStartingCheckoutFor, setIsStartingCheckoutFor] = useState<string | null>(null);
  const [expandedNumbersPromotionId, setExpandedNumbersPromotionId] = useState<string | null>(null);

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
    queryKey: ["promotions"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_promotions");

      if (error) {
        throw error;
      }

      return data as Promotion[];
    },
  });

  const { data: paidDownloads = [] } = useQuery({
    queryKey: ["paid-downloads", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.rpc("get_my_paid_poster_downloads");
      if (error) {
        console.error("Error fetching paid downloads:", error);
        return [];
      }
      return data as Array<{ promotion_id: DomainId; file_url: string }>;
    },
    enabled: Boolean(user),
  });

  const paidDownloadsMap = useMemo(() => {
    return new Map(paidDownloads.map((d) => [d.promotion_id, d.file_url]));
  }, [paidDownloads]);

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
    refetch: refetchNumbers,
  } = useQuery({
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await getTable("promotion_numbers")
        .select("*")
        .eq("user_id", user!.id)
        .not("payment_id", "is", null)
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

  const winnerUserIds = useMemo(() => {
    return Array.from(
      new Set(
        draws.flatMap((draw) => getWinnerUserIds(draw)),
      ),
    );
  }, [draws]);

  const {
    data: winnerIdentities = new Map(),
    refetch: refetchWinnerIdentities,
  } = useQuery({
    enabled: Boolean(user && winnerUserIds.length),
    queryFn: async () => loadParticipantIdentities(supabase, winnerUserIds),
    queryKey: ["winner-identities", user?.id, winnerUserIds],
  });

  const promotionById = useMemo(() => {
    return new Map(promotions.map((promotion) => [promotion.id, promotion]));
  }, [promotions]);

  const drawById = useMemo(() => {
    return new Map(draws.map((draw) => [draw.id, draw]));
  }, [draws]);

  const drawsByPromotionId = useMemo(() => {
    const map = new Map<DomainId, AppDraw[]>();

    for (const draw of draws) {
      const promotionId = getDrawPromotionId(draw);

      if (promotionId === null) {
        continue;
      }

      const current = map.get(promotionId) ?? [];
      current.push(draw);
      current.sort((left, right) => new Date(left.draw_date).getTime() - new Date(right.draw_date).getTime());
      map.set(promotionId, current);
    }

    return map;
  }, [draws]);

  const paymentsByPromotionId = useMemo(() => {
    const map = new Map<DomainId, AppPayment[]>();

    for (const payment of payments) {
      if (typeof payment.promotion_id !== "number") {
        continue;
      }

      const current = map.get(payment.promotion_id) ?? [];
      current.push(payment);
      map.set(payment.promotion_id, current);
    }

    return map;
  }, [payments]);

  const numbersByPaymentId = useMemo(() => {
    const map = new Map<DomainId, PromotionNumberRecord[]>();

    for (const promotionNumber of promotionNumbers) {
      if (typeof promotionNumber.payment_id !== "number") {
        continue;
      }

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
    return draws.find((draw) => isUpcomingDraw(draw) && getDrawPromotionId(draw) !== null) ?? null;
  }, [draws]);

  const recentWinners = useMemo(() => {
    const currentUserId = user?.id ?? null;

    return draws
      .filter((draw) => isResolvedDraw(draw) && getWinnerUserIds(draw).length > 0)
      .flatMap((draw) => {
        const drawMoment = draw.executed_at ?? draw.draw_date;
        const drawWinnerUserIds = getWinnerUserIds(draw);
        const prizeValue = Number(draw.prize_per_winner ?? 0);

        return drawWinnerUserIds.map((winnerUserId, index) => ({
          id: `${draw.id}-${winnerUserId}-${index}`,
          name:
            currentUserId && winnerUserId === currentUserId
              ? "Voce"
              : winnerIdentities.get(winnerUserId)?.name ?? "Participante confirmado",
          prizeLabel:
            Number.isFinite(prizeValue) && prizeValue > 0 ? formatCurrency(prizeValue) : "A definir",
          sortDate: new Date(drawMoment).getTime() || 0,
          wonAtLabel: formatPaymentMoment(drawMoment),
        }));
      })
      .sort((left, right) => right.sortDate - left.sortDate)
      .slice(0, 6);
  }, [draws, user?.id, winnerIdentities]);

  const ongoingPromotions = useMemo(() => {
    return promotions.filter((promotion) => {
      const promotionDraws = drawsByPromotionId.get(promotion.id) ?? [];
      const resolvedDraw = promotionDraws.filter(isResolvedDraw).at(-1) ?? null;

      return isPromotionActive(promotion) && !resolvedDraw;
    });
  }, [drawsByPromotionId, promotions]);

  const finishedPromotions = useMemo(() => {
    return promotions.filter((promotion) => {
      const promotionDraws = drawsByPromotionId.get(promotion.id) ?? [];
      const resolvedDraw = promotionDraws.filter(isResolvedDraw).at(-1) ?? null;

      return Boolean(resolvedDraw);
    });
  }, [drawsByPromotionId, promotions]);

  const approvedPayments = useMemo(() => {
    return payments.filter((payment) => normalizePaymentStatus(payment.status) === "paid");
  }, [payments]);

  const pendingPromotionNumbers = useMemo(() => {
    return promotionNumbers.filter((promotionNumber) => {
      const promotionDraws =
        typeof promotionNumber.promotion_id === "number" ? drawsByPromotionId.get(promotionNumber.promotion_id) ?? [] : [];
      return !promotionDraws.some(isResolvedDraw);
    });
  }, [drawsByPromotionId, promotionNumbers]);

  const downloadsReady = useMemo(() => {
    return approvedPayments
      .map((payment) => {
        const promotion = typeof payment.promotion_id === "number" ? promotionById.get(payment.promotion_id) ?? null : null;
        const fileUrl = typeof payment.promotion_id === "number" ? paidDownloadsMap.get(payment.promotion_id) : null;

        if (!fileUrl) {
          return null;
        }

        return {
          contestCode: getPaymentContestCode(payment, promotion),
          downloadUrl: buildPosterDownloadUrl(fileUrl),
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
  const nextOverallPromotion =
    typeof nextOverallDraw?.promotion_id === "number" ? promotionById.get(nextOverallDraw.promotion_id) ?? null : null;
  const nextOverallContestCode = getPromotionContestCode(nextOverallPromotion) || getDrawContestCode(nextOverallDraw);
  const nextOverallCompactDateLabel = nextOverallDraw ? formatCompactDrawDateLabel(nextOverallDraw.draw_date) : "A definir";

  async function handleStartCheckout(promotion: Promotion, posterQuantity = 1) {
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
        posterQuantity,
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
        refetchWinnerIdentities(),
      ]);
    } finally {
      setIsStartingCheckoutFor(null);
    }
  }

  function handlePromotionCheckoutAction(promotion: Promotion, reservedPayment?: AppPayment | null) {
    if (reservedPayment) {
      void handleStartCheckout(promotion, normalizePosterQuantity(reservedPayment.poster_quantity));
      return;
    }

    setCheckoutPromotion(promotion);
  }

  function renderPromotionMasonry(promotions: Promotion[]) {
    const leftColumn = promotions.filter((_, index) => index % 2 === 0);
    const rightColumn = promotions.filter((_, index) => index % 2 === 1);

    return (
      <>
        <div className="space-y-4 lg:hidden">
          {promotions.map((promotion) => renderPromotionCard(promotion))}
        </div>
        <div className="hidden gap-4 lg:grid lg:grid-cols-2 lg:items-start">
          <div className="space-y-4">
            {leftColumn.map((promotion) => renderPromotionCard(promotion))}
          </div>
          <div className="space-y-4">
            {rightColumn.map((promotion) => renderPromotionCard(promotion))}
          </div>
        </div>
      </>
    );
  }

  function renderPromotionCard(promotion: Promotion) {
    const contestCode = getPromotionContestCode(promotion);
    const promotionDraws = drawsByPromotionId.get(promotion.id) ?? [];
    const resolvedDraw = promotionDraws.filter(isResolvedDraw).at(-1) ?? null;
    const promotionPayments = paymentsByPromotionId.get(promotion.id) ?? [];
    const upcomingDraw = promotionDraws.find(isUpcomingDraw) ?? null;
    const paidPromotionPayments = promotionPayments.filter(
      (payment) => normalizePaymentStatus(payment.status) === "paid",
    );
    const latestPaidPayment =
      promotionPayments.find((payment) => normalizePaymentStatus(payment.status) === "paid") ?? null;
    const latestManualReviewPayment =
      promotionPayments.find((payment) => {
        if (normalizePaymentStatus(payment.status) !== "paid") {
          return false;
        }

        return normalizeFulfillmentStatus(payment.fulfillment_status, payment.status) === "manual_review";
      }) ?? null;
    const latestRefundPendingPayment =
      promotionPayments.find((payment) => {
        if (normalizePaymentStatus(payment.status) !== "paid") {
          return false;
        }

        return normalizeFulfillmentStatus(payment.fulfillment_status, payment.status) === "refund_pending_external";
      }) ?? null;
    const latestAnalyzingPayment =
      promotionPayments.find(
        (payment) => normalizePaymentStatus(payment.status) === "pending" && Boolean(payment.transaction_id),
      ) ?? null;
    const latestReservedPayment =
      promotionPayments.find(
        (payment) =>
          normalizePaymentStatus(payment.status) === "pending" &&
          !payment.transaction_id &&
          hasActiveReservation(payment),
      ) ?? null;
    const latestFailedPayment =
      promotionPayments.find((payment) => normalizePaymentStatus(payment.status) === "failed") ?? null;
    const highlightedPayment =
      latestManualReviewPayment ??
      latestRefundPendingPayment ??
      latestPaidPayment ??
      latestAnalyzingPayment ??
      latestReservedPayment ??
      latestFailedPayment ??
      promotionPayments[0] ??
      null;
    const paymentState: PromotionPaymentState = highlightedPayment
      ? normalizePaymentStatus(highlightedPayment.status)
      : "unpaid";
    const successfulPurchasesCount = promotionPayments.filter(
      (payment) => normalizePaymentStatus(payment.status) === "paid",
    ).length;
    const hasMercadoPagoTransaction = Boolean(latestAnalyzingPayment?.transaction_id);
    const hasPendingReservation = Boolean(latestReservedPayment);
    const paymentMeta =
      highlightedPayment && paymentState !== "unpaid"
        ? getPaymentStatusMeta(
            highlightedPayment.status,
            highlightedPayment.fulfillment_status,
          )
        : null;
    const promotionNumbersOwned = paidPromotionPayments
      .flatMap((payment) => numbersByPaymentId.get(payment.id) ?? [])
      .sort((left, right) => left.ticket_number - right.ticket_number);
    const totalPromotionNumbersOwned = promotionNumbersOwned.length;
    const totalPurchasedQuantity = paidPromotionPayments.reduce(
      (sum, payment) => sum + normalizePosterQuantity(payment.poster_quantity),
      0,
    );
    const hasManualReviewNumbers = paidPromotionPayments.some((payment) => {
      const fulfillmentStatus = normalizeFulfillmentStatus(payment.fulfillment_status, payment.status);
      return fulfillmentStatus === "manual_review" || fulfillmentStatus === "refund_pending_external";
    });
    const hasPendingFulfillment = paidPromotionPayments.some(
      (payment) => normalizeFulfillmentStatus(payment.fulfillment_status, payment.status) === "pending",
    );
    const downloadUrl =
      latestPaidPayment && promotion.id && paidDownloadsMap.has(promotion.id)
        ? buildPosterDownloadUrl(paidDownloadsMap.get(promotion.id)!)
        : null;
    const resolvedWinnerUserIds = getWinnerUserIds(resolvedDraw);
    const winnerName = resolvedWinnerUserIds[0]
      ? winnerIdentities.get(resolvedWinnerUserIds[0])?.name ?? null
      : null;
    const winnerLabel = getDrawWinnerLabel({
      currentUserId: user.id,
      draw: resolvedDraw,
      winnerName,
    });
    const forecastLabel = formatPromotionForecastLabel(
      promotion.end_date,
      upcomingDraw?.draw_date ?? resolvedDraw?.draw_date ?? null,
    );
    const promotionBadge = latestManualReviewPayment
      ? {
          label: "Revisao manual",
          toneClassName: paymentMeta?.toneClassName ?? "border-orange-400/30 bg-orange-500/10 text-orange-200",
        }
      : latestRefundPendingPayment
        ? {
            label: "Reembolso externo",
            toneClassName: paymentMeta?.toneClassName ?? "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200",
          }
        : latestAnalyzingPayment
          ? {
              label: "Pagamento em analise",
              toneClassName: paymentMeta?.toneClassName ?? "border-amber-400/30 bg-amber-500/10 text-amber-200",
            }
          : latestReservedPayment
            ? {
                label: "Reserva ativa",
                toneClassName: "border-sky-400/30 bg-sky-500/10 text-sky-200",
              }
            : participantControls.checkoutBlocked
                  ? {
                      label: "Checkout bloqueado",
                      toneClassName: "border-destructive/30 bg-destructive/10 text-destructive",
                    }
                  : null;
    const isPromotionClosed = Boolean(resolvedDraw);
    const isBusy = isStartingCheckoutFor === promotion.id;
    const canStartCheckout =
      !isPromotionClosed &&
      !isBusy &&
      !participantControls.checkoutBlocked &&
      !latestAnalyzingPayment;
    const canShowOwnedNumbers = paidPromotionPayments.length > 0;
    const isCardExpanded = expandedPromotionCardId === promotion.id;
    const isNumbersExpanded = expandedNumbersPromotionId === promotion.id;

    return (
      <article
        className={`w-full overflow-hidden rounded-[1.5rem] border border-white/10 bg-black transition-all duration-300 sm:rounded-[1.75rem] ${
          isCardExpanded ? "border-primary/20 shadow-[0_18px_60px_rgba(0,0,0,0.4)]" : ""
        }`}
        key={promotion.id}
        onBlurCapture={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
            return;
          }

          setExpandedPromotionCardId((current) => (current === promotion.id ? null : current));
        }}
        tabIndex={0}
      >
        <div className="relative h-48 sm:h-52">
          {promotion.image_url ? (
            <img
              alt={promotion.title}
              className="h-full w-full object-cover"
              src={promotion.image_url}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-black text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
            </div>
          )}

          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.54)_42%,rgba(0,0,0,0.9)_78%,rgba(0,0,0,1)_100%)]" />
          <div className="absolute left-3 right-3 top-3 flex flex-wrap items-start justify-between gap-2 sm:left-4 sm:right-4 sm:top-4 sm:gap-3">
            <Badge className="border-white/15 bg-black/40 text-white">
              {formatCurrency(getPromotionAmount(promotion))}
            </Badge>
            <div className="flex flex-wrap gap-2">
              <Badge className="border-white/15 bg-black/40 text-white">
                {formatContestBadgeLabel(contestCode)}
              </Badge>
              <Badge className="border-white/15 bg-black/40 text-white">
                1 poster = 1 numero
              </Badge>
              {promotionBadge ? (
                <Badge className={promotionBadge.toneClassName}>{promotionBadge.label}</Badge>
              ) : null}
            </div>
          </div>
          <div className="absolute bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-4">
            <h3 className="text-xl font-display font-semibold sm:text-2xl">{promotion.title}</h3>
            <p className="mt-2 text-xs text-white/75 sm:text-sm">
              Sorteio dia: <span className="font-medium text-white/85">{forecastLabel}</span>
            </p>
          </div>
        </div>

        <div className="relative -mt-5 space-y-4 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.74)_14%,rgba(0,0,0,0.94)_34%,rgba(0,0,0,1)_100%)] px-4 pb-4 pt-7 sm:-mt-6 sm:px-5 sm:pb-5 sm:pt-8">
          <div className="px-2 py-2 text-center sm:px-3 sm:py-3">
            <p
              className={`mx-auto max-w-3xl cursor-pointer text-balance text-lg leading-relaxed text-white/90 transition-all duration-300 sm:text-xl md:text-2xl ${
                isCardExpanded ? "line-clamp-none" : "line-clamp-3"
              }`}
              onClick={() => setExpandedPromotionCardId(promotion.id)}
            >
              {promotion.description ||
                "Este poster faz parte de um sorteio promocional. Escolha a quantidade desejada, confirme sua compra e acompanhe a apuracao do concurso."}
            </p>
          </div>

          {resolvedDraw ? (
            <div className="rounded-[1.5rem] border border-primary/15 bg-[linear-gradient(135deg,rgba(245,198,68,0.1),rgba(255,255,255,0.03)_42%,rgba(255,255,255,0.01)_100%)] p-4">
              <div className="space-y-4">
                <div className="flex items-start gap-3 border-b border-white/10 pb-4">
                  <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-primary">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-primary/70">
                      {resolvedWinnerUserIds.includes(user.id) ? "Voce venceu" : "Ganhador"}
                    </p>
                    <p className="mt-1 text-xl font-semibold text-white">{winnerLabel}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {resolvedDraw.executed_at
                        ? `Resultado confirmado em ${formatPaymentMoment(resolvedDraw.executed_at)}.`
                        : "Resultado oficial confirmado para este concurso."}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Numero sorteado</p>
                    <p className="mt-1 text-2xl font-semibold text-white">
                      {typeof resolvedDraw.official_winning_number === "number"
                        ? `#${formatTicketNumber(resolvedDraw.official_winning_number)}`
                        : "A definir"}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Premio</p>
                    <p className="mt-1 text-2xl font-semibold text-white">
                      {typeof resolvedDraw.prize_per_winner === "number"
                        ? formatCurrency(resolvedDraw.prize_per_winner)
                        : "A definir"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {canShowOwnedNumbers && isNumbersExpanded ? (
            <div className="rounded-2xl border border-white/10 bg-black p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Seus numeros</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {totalPromotionNumbersOwned
                      ? `${totalPromotionNumbersOwned} numero(s) ja sincronizado(s) nesta promocao.`
                      : hasManualReviewNumbers
                        ? `${totalPurchasedQuantity} numero(s) desta compra estao em revisao manual.`
                        : `${totalPurchasedQuantity} numero(s) aguardando sincronizacao desta compra.`}
                  </p>
                </div>
                <Badge className="border-white/15 bg-white/5 text-white">
                  {totalPromotionNumbersOwned || totalPurchasedQuantity} numeros
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {promotionNumbersOwned.length ? (
                  promotionNumbersOwned.map((promotionNumber) => (
                    <Badge className="border-primary/25 bg-primary/10 text-primary" key={promotionNumber.id}>
                      #{formatTicketNumber(promotionNumber.ticket_number)}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {hasManualReviewNumbers
                      ? "A equipe esta revisando manualmente a liberacao destes numeros."
                      : hasPendingFulfillment
                        ? "Seus numeros ainda estao sendo liberados a partir do pagamento aprovado."
                        : "Os numeros desta compra aparecem aqui assim que a liberacao for concluida."}
                  </span>
                )}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              className="w-full"
              disabled={!canStartCheckout}
              onClick={() => handlePromotionCheckoutAction(promotion, latestReservedPayment)}
              size="lg"
              variant="hero"
            >
              {isBusy ? <Loader2 className="animate-spin" /> : null}
              {isPromotionClosed
                ? "Promocao encerrada"
                : hasMercadoPagoTransaction
                  ? "Pagamento em analise"
                  : hasPendingReservation
                    ? "Retomar compra"
                    : participantControls.checkoutBlocked
                      ? "Checkout bloqueado"
                      : successfulPurchasesCount
                        ? "Comprar novamente"
                        : paymentState === "failed"
                          ? "Escolher quantidade"
                          : "Escolher quantidade"}
            </Button>

            {downloadUrl ? (
              <Button asChild className="w-full" size="lg" variant="hero-outline">
                <a href={downloadUrl} rel="noreferrer" target="_blank">
                  <Download className="h-4 w-4" />
                  Baixar PDF
                </a>
              </Button>
            ) : (
              <Button className="w-full" disabled size="lg" variant="hero-outline">
                <Download className="h-4 w-4" />
                Baixar PDF
              </Button>
            )}

            {canShowOwnedNumbers ? (
              <Button
                className="w-full sm:col-span-2"
                onClick={() =>
                  setExpandedNumbersPromotionId((current) =>
                    current === promotion.id ? null : promotion.id,
                  )
                }
                size="lg"
                variant="glass"
              >
                <Hash className="h-4 w-4" />
                {isNumbersExpanded ? "Ocultar meus numeros" : "Exibir meus numeros"}
              </Button>
            ) : null}
          </div>
        </div>
      </article>
    );
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
      <main className="container mx-auto px-3 pb-10 pt-20 sm:px-4">
        <motion.div animate={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 20 }}>
          <h1 className="mb-4 text-[2.65rem] font-display font-bold leading-[0.98] sm:mb-2 sm:text-4xl">
            Ola, <span className="text-gradient-gold">{displayName}</span>
          </h1>
          <p className="mb-8 hidden max-w-3xl text-muted-foreground lg:block">
            aqui voce encontra conteúdo relevante e de valor, exploramos, desenvolvemos e compartilhamos matérias,
            novidades e informações que realmente importam. E ainda: oportunidades especiais que abrem portas para tornar sonhos realidade.
            Sua área pessoal reúne tudo de forma simples: com a compra confirmada, o pôster digital em PDF e os numeros da sorte
            ficam disponíveis na hora.
          </p>

          <section className="mb-6 lg:hidden">
            <div className="overflow-hidden rounded-[1.9rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,120,0.08),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] shadow-[0_24px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
              <div className="grid grid-cols-2 divide-x divide-white/10">
                <div className="p-5">
                  <div className="flex items-center gap-3 text-white/92">
                    <Download className="h-6 w-6 text-primary" />
                    <span className="text-[1.15rem] font-display font-semibold leading-none">Downloads</span>
                  </div>
                  <p className="mt-5 text-[4rem] font-display font-bold leading-none text-white">
                    {downloadsReady.length}
                  </p>
                </div>

                <div className="p-5">
                  <div className="flex items-center gap-3 text-white/92">
                    <Hash className="h-6 w-6 text-emerald-300" />
                    <span className="text-[1.15rem] font-display font-semibold leading-none">Numeros</span>
                  </div>
                  <p className="mt-5 text-[4rem] font-display font-bold leading-none text-white">
                    {pendingPromotionNumbers.length}
                  </p>
                </div>
              </div>

              <div className="border-t border-white/10 px-5 py-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <CalendarDays className="h-6 w-6 flex-shrink-0 text-primary" />
                    <span className="truncate text-[1.15rem] font-display font-semibold leading-none text-white/92">
                      Proximo
                    </span>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-2 text-right">
                    {nextOverallDraw ? (
                      <>
                        <span className="text-[1.15rem] font-display font-semibold leading-none text-white">
                          {nextOverallContestCode || "A definir"}
                        </span>
                        <span className="text-white/40">&middot;</span>
                        <span className="text-[1.15rem] font-display font-semibold leading-none text-primary">
                          {nextOverallCompactDateLabel}
                        </span>
                      </>
                    ) : (
                      <span className="text-base font-medium text-white/70">Aguardando agenda</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="mb-6 hidden gap-4 lg:grid lg:grid-cols-3">
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
                {pendingPromotionNumbers.length}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Apenas numeros de concursos que ainda estao em andamento aparecem aqui.
              </p>
            </div>

            <div className="glass-card rounded-[1.75rem] border border-white/10 p-6">
              <CalendarDays className="mb-3 h-8 w-8 text-primary" />
              <p className="text-sm uppercase tracking-[0.24em] text-primary/70">Proximo sorteio</p>
              <p className="mt-3 text-xl font-display font-semibold">
                {nextOverallDraw ? formatContestLabel(nextOverallContestCode) : "Aguardando agenda"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {nextOverallDraw
                  ? `Sorteio previsto para: ${formatDrawDateLabel(nextOverallDraw.draw_date)}`
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

          <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
              <section className="glass-card rounded-[2rem] p-6">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-display font-semibold">Promocoes em andamento</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      O pagamento aprovado libera o PDF e a quantidade de numeros correspondente aos posters escolhidos na compra.
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
                        refetchWinnerIdentities(),
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
                    Carregando posters e sorteios...
                  </div>
                ) : ongoingPromotions.length ? (
                  renderPromotionMasonry(ongoingPromotions)
                ) : (
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-5 text-sm text-muted-foreground">
                    Nenhuma promocao em andamento no momento. Assim que o backoffice publicar uma nova campanha, ela aparece aqui.
                  </div>
                )}
              </section>

              {finishedPromotions.length ? (
                <section className="glass-card rounded-[2rem] p-6">
                  <div className="mb-5">
                    <h2 className="text-2xl font-display font-semibold">Promocoes finalizadas</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Historico separado das campanhas que ja tiveram resultado confirmado.
                    </p>
                  </div>

                  {renderPromotionMasonry(finishedPromotions)}
                </section>
              ) : null}
            </div>

            <div className="w-full max-w-[320px] space-y-4 xl:ml-auto">
              <section className="glass-card rounded-[2rem] p-6">
                <Trophy className="mb-3 h-8 w-8 text-primary" />
                <h2 className="text-xl font-display font-semibold">Ultimos ganhadores</h2>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl">
                    <div className="grid grid-cols-[1.1fr_1fr_auto] gap-2 border-b border-white/10 pb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
                      <span>Nome</span>
                      <span>Data</span>
                      <span className="text-right">Premio</span>
                    </div>
                    {recentWinners.map((winner) => (
                      <div
                        className="grid grid-cols-[1.1fr_1fr_auto] items-center gap-2 border-b border-white/5 py-3 text-sm last:border-b-0"
                        key={winner.id}
                      >
                        <span className="truncate font-medium text-white" title={winner.name}>{winner.name}</span>
                        <span className="text-[12px] leading-tight text-muted-foreground">{winner.wonAtLabel}</span>
                        <span className="text-right font-semibold text-primary">{winner.prizeLabel}</span>
                      </div>
                    ))}
                  </div>
                  {!recentWinners.length ? (
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-muted-foreground">
                      Os ganhadores aparecem aqui assim que os sorteios forem concluídos.
                    </div>
                  ) : null}
                </div>
              </section>

              <Link className="block" to="/chat">
                <section className="glass-card rounded-[2rem] p-6 transition-all hover:glow-gold">
                  <MessageCircle className="mb-3 h-8 w-8 text-primary" />
                  <h2 className="text-xl font-display font-semibold">Suporte</h2>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Fale diretamente com a equipe sobre cadastro, compra, numeros e sorteios.
                  </p>
                  <Button className="mt-4 w-full" size="lg" variant="hero-outline">
                    Abrir suporte
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
                    const paymentStatusMeta = getPaymentStatusMeta(
                      payment.status,
                      payment.fulfillment_status,
                    );
                    const paymentDraw = typeof payment.draw_id === "number" ? drawById.get(payment.draw_id) ?? null : null;
                    const paymentPromotion =
                      typeof payment.promotion_id === "number" ? promotionById.get(payment.promotion_id) ?? null : null;

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
      <PurchaseQuantityDialog
        isSubmitting={Boolean(checkoutPromotion && isStartingCheckoutFor === checkoutPromotion.id)}
        onConfirm={(quantity) => {
          if (!checkoutPromotion) {
            return;
          }

          void handleStartCheckout(checkoutPromotion, quantity);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setCheckoutPromotion(null);
          }
        }}
        open={Boolean(checkoutPromotion)}
        promotion={checkoutPromotion}
        session={session ?? null}
        unitAmount={checkoutPromotion ? getPromotionAmount(checkoutPromotion) : DEFAULT_PROMOTION_AMOUNT}
      />
      <Footer />
    </div>
  );
}
