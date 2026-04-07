import { format, getISOWeek, getISOWeekYear } from "date-fns";
import { ptBR } from "date-fns/locale";

export const BASE_POSTER_PRICE = 10;
export const WEEKLY_PAYMENT_AMOUNT = BASE_POSTER_PRICE;
export const DEFAULT_PROMOTION_AMOUNT = BASE_POSTER_PRICE;

export type NormalizedPaymentStatus = "failed" | "paid" | "pending";

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
    description: "Pagamento confirmado. O poster e os numeros promocionais foram liberados.",
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

export function getPaymentStatusMeta(status?: string | null) {
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
    return `Rodada de ${formatDrawDateLabel(draw.draw_date)}`;
  }

  if (payment.week_reference) {
    return payment.week_reference;
  }

  if (payment.draw_id) {
    return `Sorteio ${payment.draw_id.slice(0, 8)}`;
  }

  return "Compra do poster";
}
