export const MAX_PROMOTION_NUMBERS = 1000000;

type AdminClientLike = {
  from: (tableName: string) => any;
};

type PostgrestErrorLike = {
  details?: string;
  hint?: string;
  message?: string;
};

type PendingPaymentRow = {
  poster_quantity?: number | null;
  reservation_expires_at?: string | null;
  transaction_id?: string | null;
};

export type PromotionCheckoutAvailability = {
  assignedNumbers: number;
  availableNumbers: number;
  pendingReservations: number;
};

export function normalizePosterQuantity(value?: number | null) {
  const normalized = Number(value ?? 1);

  if (!Number.isInteger(normalized) || normalized < 1) {
    return 1;
  }

  return Math.min(normalized, MAX_PROMOTION_NUMBERS);
}

function normalizeCount(value?: number | null) {
  const normalized = Number(value ?? 0);

  if (!Number.isFinite(normalized) || normalized < 0) {
    return 0;
  }

  return Math.trunc(normalized);
}

export function getPromotionAvailabilityMessage(availableNumbers: number, requestedQuantity: number) {
  if (availableNumbers <= 0) {
    return "Todos os numeros promocionais desta promocao ja foram reservados.";
  }

  if (requestedQuantity > availableNumbers) {
    if (availableNumbers === 1) {
      return "Resta apenas 1 numero promocional disponivel para esta promocao.";
    }

    return `Restam apenas ${availableNumbers} numeros promocionais disponiveis para esta promocao.`;
  }

  if (availableNumbers === 1) {
    return "Resta 1 numero promocional disponivel para novos checkouts nesta promocao.";
  }

  return `Restam ${availableNumbers} numeros promocionais disponiveis para novos checkouts nesta promocao.`;
}

async function countAssignedNumbers(
  adminClient: AdminClientLike,
  promotionId: string,
): Promise<{ count: number; error: PostgrestErrorLike | null }> {
  const { count, error } = await adminClient
    .from("promotion_numbers")
    .select("*", { count: "exact", head: true })
    .eq("promotion_id", promotionId);

  if (error) {
    return { count: 0, error };
  }

  return { count: normalizeCount(count), error: null };
}

async function sumPendingReservations(
  adminClient: AdminClientLike,
  promotionId: string,
): Promise<{ error: PostgrestErrorLike | null; total: number }> {
  const { data, error } = await adminClient
    .from("payments")
    .select("poster_quantity, reservation_expires_at, transaction_id")
    .eq("promotion_id", promotionId)
    .eq("status", "pending");

  if (error) {
    return { error, total: 0 };
  }

  const total = ((data ?? []) as PendingPaymentRow[]).reduce((sum, payment) => {
    const hasMercadoPagoTransaction = Boolean(payment.transaction_id?.trim());
    const reservationExpiresAt = payment.reservation_expires_at ? new Date(payment.reservation_expires_at) : undefined;
    const hasActiveReservation = reservationExpiresAt
      ? !Number.isNaN(reservationExpiresAt.getTime()) && reservationExpiresAt > new Date()
      : false;

    if (!hasMercadoPagoTransaction && !hasActiveReservation) {
      return sum;
    }

    return sum + normalizePosterQuantity(payment.poster_quantity);
  }, 0);

  return { error: null, total };
}

export async function getPromotionCheckoutAvailability(
  adminClient: AdminClientLike,
  promotionId: string,
): Promise<{ data: PromotionCheckoutAvailability | null; error: PostgrestErrorLike | null }> {
  const [assignedResult, pendingResult] = await Promise.all([
    countAssignedNumbers(adminClient, promotionId),
    sumPendingReservations(adminClient, promotionId),
  ]);

  if (assignedResult.error) {
    return { data: null, error: assignedResult.error };
  }

  if (pendingResult.error) {
    return { data: null, error: pendingResult.error };
  }

  const assignedNumbers = normalizeCount(assignedResult.count);
  const pendingReservations = normalizeCount(pendingResult.total);
  const availableNumbers = Math.max(0, MAX_PROMOTION_NUMBERS - assignedNumbers - pendingReservations);

  return {
    data: {
      assignedNumbers,
      availableNumbers,
      pendingReservations,
    },
    error: null,
  };
}
