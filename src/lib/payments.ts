import { format, getISOWeek, getISOWeekYear } from "date-fns";
import { ptBR } from "date-fns/locale";

export const BASE_POSTER_PRICE = 10;
export const WEEKLY_PAYMENT_AMOUNT = BASE_POSTER_PRICE;
export const DEFAULT_PROMOTION_AMOUNT = BASE_POSTER_PRICE;

export type NormalizedPaymentStatus = "failed" | "paid" | "pending";
export type NormalizedFulfillmentStatus =
  | "fulfilled"
  | "manual_review"
  | "pending"
  | "refund_pending_external"
  | "resolved"
  | "refunded_external";

const PAYMENT_STATUS_META: Record<
  NormalizedPaymentStatus,
  {
    description: string;
    label: string;
    toneClassName: string;
  }
> = {
  failed: {
    description: "O pagamento nao foi concluido.",
    label: "Falhou",
    toneClassName: "border-rose-400/30 bg-rose-500/10 text-rose-200",
  },
  paid: {
    description: "Pagamento confirmado. O poster e os numeros promocionais desta compra foram liberados.",
    label: "Pago",
    toneClassName: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  },
  pending: {
    description: "O pagamento esta em analise no Mercado Pago.",
    label: "Pendente",
    toneClassName: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  },
};

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
  }).format(value);
}

export function getWeekReference(date = new Date()) {
  const isoYear = getISOWeekYear(date);
  const isoWeek = getISOWeek(date);

  return `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

export const getCurrentWeekReference = getWeekReference;

export function normalizePaymentStatus(status?: string | null): NormalizedPaymentStatus {
  switch ((status ?? "").toLowerCase()) {
    case "approved":
    case "completed":
    case "paid":
      return "paid";
    case "cancelled":
    case "charged_back":
    case "failed":
    case "refunded":
    case "rejected":
      return "failed";
    default:
      return "pending";
  }
}

export function normalizeFulfillmentStatus(
  fulfillmentStatus?: string | null,
  paymentStatus?: string | null,
): NormalizedFulfillmentStatus {
  switch ((fulfillmentStatus ?? "").toLowerCase()) {
    case "fulfilled":
      return "fulfilled";
    case "manual_review":
      return "manual_review";
    case "refund_pending_external":
      return "refund_pending_external";
    case "resolved":
      return "resolved";
    case "refunded_external":
      return "refunded_external";
    case "pending":
      return "pending";
    default: {
      const normalizedPaymentStatus = normalizePaymentStatus(paymentStatus);

      if (normalizedPaymentStatus === "paid") {
        return "fulfilled";
      }

      if (normalizedPaymentStatus === "failed") {
        return "resolved";
      }

      return "pending";
    }
  }
}

export function getPaymentStatusMeta(status?: string | null, fulfillmentStatus?: string | null) {
  const normalizedPaymentStatus = normalizePaymentStatus(status);
  const normalizedFulfillmentStatus = normalizeFulfillmentStatus(fulfillmentStatus, status);

  if (normalizedPaymentStatus === "paid") {
    switch (normalizedFulfillmentStatus) {
      case "fulfilled":
        return PAYMENT_STATUS_META.paid;
      case "manual_review":
        return {
          description: "Pagamento confirmado, mas a liberacao dos numeros esta em revisao manual pela equipe.",
          label: "Revisao manual",
          toneClassName: "border-orange-400/30 bg-orange-500/10 text-orange-200",
        };
      case "refund_pending_external":
        return {
          description: "Pagamento confirmado com tratativa de reembolso externo em andamento.",
          label: "Reembolso externo",
          toneClassName: "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200",
        };
      case "pending":
        return {
          description: "Pagamento confirmado. Estamos finalizando a liberacao do poster e dos numeros promocionais.",
          label: "Liberando numeros",
          toneClassName: "border-sky-400/30 bg-sky-500/10 text-sky-200",
        };
      default:
        return PAYMENT_STATUS_META.paid;
    }
  }

  if (normalizedPaymentStatus === "failed" && normalizedFulfillmentStatus === "refunded_external") {
    return {
      description: "O caso foi encerrado com reembolso tratado fora do ambiente.",
      label: "Reembolsado",
      toneClassName: "border-slate-400/30 bg-slate-500/10 text-slate-200",
    };
  }

  return PAYMENT_STATUS_META[normalizePaymentStatus(status)];
}

export function getPaymentStatusFromMercadoPago(status?: string | null) {
  if (!status) {
    return null;
  }

  return normalizePaymentStatus(status);
}

export function formatDrawDateLabel(value?: string | null) {
  if (!value) {
    return "Data a definir";
  }

  return format(new Date(value), "dd 'de' MMMM", { locale: ptBR });
}

export function formatPaymentMoment(value?: string | null) {
  if (!value) {
    return "Aguardando confirmacao";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function getPaymentReferenceLabel(
  payment: { draw_id?: string | null; promotion_id?: string | null; week_reference?: string | null },
  draw?: { draw_date?: string | null } | null,
  promotion?: { title?: string | null } | null,
) {
  if (promotion?.title) {
    return promotion.title;
  }

  if (draw?.draw_date) {
    return `Sorteio de ${formatDrawDateLabel(draw.draw_date)}`;
  }

  if (payment.week_reference) {
    return payment.week_reference;
  }

  if (payment.draw_id) {
    return `Sorteio ${payment.draw_id.slice(0, 8)}`;
  }

  return "Compra do poster";
}
