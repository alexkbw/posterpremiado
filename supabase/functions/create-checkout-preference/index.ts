import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import {
  getPromotionCheckoutAvailability,
  getPromotionAvailabilityMessage,
} from "../_shared/contest-availability.ts";
import { corsHeaders } from "../_shared/cors.ts";

type CreateCheckoutPreferenceBody = {
  attribution?: {
    campaign?: string | null;
    campaignId?: string | null;
    capturedAt?: string | null;
    content?: string | null;
    landingPath?: string | null;
    medium?: string | null;
    referrerHost?: string | null;
    source?: string | null;
  } | null;
  description?: string;
  originUrl?: string;
  payerEmail?: string | null;
  payerName?: string | null;
  posterQuantity?: number | null;
  promotionId?: string | null;
  title?: string;
};

type PromotionRow = {
  active?: boolean | null;
  contest_code?: string | null;
  entry_amount?: number | null;
  file_type?: string | null;
  file_url?: string | null;
  id: string;
  is_active?: boolean | null;
  number_package_size?: number | null;
  title: string;
};

type ExistingPaymentRow = {
  amount?: number | null;
  checkout_preference_id?: string | null;
  checkout_url?: string | null;
  id: string;
  poster_quantity?: number | null;
  reservation_expires_at?: string | null;
  status?: string | null;
  transaction_id?: string | null;
};

type ReservedCheckoutPaymentRow = {
  available_numbers?: number | null;
  payment_id?: string | null;
  reservation_expires_at?: string | null;
};

type MercadoPagoErrorResponse = {
  error?: string;
  message?: string;
};

type MercadoPagoPreferenceResponse = {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
};

type PostgrestErrorLike = {
  details?: string;
  hint?: string;
  message?: string;
};

type AdminClientLike = {
  from: (tableName: string) => any;
  rpc: (fn: string, args?: unknown) => any;
};

type NormalizedAttribution = {
  attributedAt: string;
  campaign: string | null;
  campaignId: string | null;
  content: string | null;
  landingPath: string | null;
  medium: string | null;
  referrerHost: string | null;
  source: string | null;
};

const DEFAULT_AMOUNT = 10;
const DEFAULT_POSTER_QUANTITY = 1;
const MAX_POSTER_QUANTITY = 9999;
const MERCADO_PAGO_API_URL = "https://api.mercadopago.com";
const PENDING_PAYMENT_STATUS = "pending";

function normalizeOptionalText(value: unknown, maxLength = 160) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeOptionalPath(value: unknown) {
  const normalized = normalizeOptionalText(value, 320);

  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("/")) {
    return normalized;
  }

  try {
    return new URL(normalized).pathname.slice(0, 320);
  } catch {
    return null;
  }
}

function normalizeOptionalHost(value: unknown) {
  const normalized = normalizeOptionalText(value, 255);

  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized).hostname.slice(0, 255);
  } catch {
    return normalized.includes("/") ? null : normalized;
  }
}

function normalizeAttributedAt(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return new Date().toISOString();
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? new Date().toISOString() : timestamp.toISOString();
}

function normalizeAttribution(input: CreateCheckoutPreferenceBody["attribution"]) {
  const normalized: NormalizedAttribution = {
    attributedAt: normalizeAttributedAt(input?.capturedAt),
    campaign: normalizeOptionalText(input?.campaign),
    campaignId: normalizeOptionalText(input?.campaignId),
    content: normalizeOptionalText(input?.content),
    landingPath: normalizeOptionalPath(input?.landingPath),
    medium: normalizeOptionalText(input?.medium),
    referrerHost: normalizeOptionalHost(input?.referrerHost),
    source: normalizeOptionalText(input?.source),
  };

  const hasAnyAttribution = Boolean(
    normalized.source ||
      normalized.medium ||
      normalized.campaign ||
      normalized.campaignId ||
      normalized.content,
  );

  return hasAnyAttribution ? normalized : null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status,
  });
}

function getSecureSiteUrl(originUrl?: string) {
  const configuredSiteUrl = Deno.env.get("SITE_URL")?.trim();
  const candidate = configuredSiteUrl || originUrl;

  if (!candidate) {
    return null;
  }

  try {
    const parsedUrl = new URL(candidate);

    return parsedUrl.protocol === "https:" ? parsedUrl.origin : null;
  } catch {
    return null;
  }
}

function getFunctionUrl(functionName: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!supabaseUrl) {
    return null;
  }

  return new URL(`/functions/v1/${functionName}`, supabaseUrl).toString();
}

function getCurrentWeekReference() {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNumber = date.getUTCDay() || 7;

  date.setUTCDate(date.getUTCDate() + 4 - dayNumber);

  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

  return `${date.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function isSchemaFallbackError(error: PostgrestErrorLike | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();

  return (
    message.includes("column") ||
    message.includes("enum") ||
    message.includes("schema cache") ||
    message.includes("not-null constraint") ||
    message.includes("invalid input value")
  );
}

function isPromotionActive(promotion: PromotionRow | null) {
  if (!promotion) {
    return false;
  }

  if (typeof promotion.is_active === "boolean") {
    return promotion.is_active;
  }

  if (typeof promotion.active === "boolean") {
    return promotion.active;
  }

  return true;
}

function normalizePosterQuantity(value?: number | null) {
  const normalized = Number(value ?? DEFAULT_POSTER_QUANTITY);

  if (!Number.isInteger(normalized) || normalized < 1) {
    return DEFAULT_POSTER_QUANTITY;
  }

  return Math.min(normalized, MAX_POSTER_QUANTITY);
}

function normalizeContestCode(value?: string | null, fallback?: string | null) {
  const normalized = value?.trim();

  if (normalized) {
    return normalized;
  }

  const normalizedFallback = fallback?.trim();
  return normalizedFallback || "";
}

function buildAvailabilityErrorPayload(availableNumbers: number, requestedQuantity: number) {
  return {
    availableNumbers,
    error: getPromotionAvailabilityMessage(availableNumbers, requestedQuantity),
  };
}

function hasActiveReservation(payment?: ExistingPaymentRow | null) {
  if (!payment?.reservation_expires_at) {
    return false;
  }

  const reservationDeadline = new Date(payment.reservation_expires_at);
  return !Number.isNaN(reservationDeadline.getTime()) && reservationDeadline > new Date();
}

function isAvailabilityReservationError(error: PostgrestErrorLike | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return message.includes("nao ha numeros promocionais suficientes");
}

function getReservationBlockedMessage(payment?: ExistingPaymentRow | null) {
  if (payment?.transaction_id) {
    return "Existe um pagamento desta promocao ainda em analise. Aguarde a atualizacao dele antes de iniciar outro checkout.";
  }

  if (hasActiveReservation(payment)) {
    return "Existe um checkout desta promocao ja iniciado e com reserva ativa. Aguarde a expiracao da reserva atual antes de abrir outro pagamento.";
  }

  return "Nao foi possivel liberar uma nova tentativa de checkout.";
}

async function findPromotion(
  adminClient: AdminClientLike,
  preferredPromotionId?: string | null,
) {
  if (!preferredPromotionId) {
    return {
      data: null,
      error: {
        message: "Promotion is required.",
      } as PostgrestErrorLike,
    };
  }

  const attempts = [
    () =>
      adminClient
        .from("promotions")
        .select("id, title, contest_code, entry_amount, is_active, file_url, file_type, number_package_size")
        .eq("id", preferredPromotionId)
        .maybeSingle(),
    () =>
      adminClient
        .from("promotions")
        .select("id, title, contest_code, entry_amount, active, file_url, file_type, number_package_size")
        .eq("id", preferredPromotionId)
        .maybeSingle(),
    () =>
      adminClient
        .from("promotions")
        .select("id, title, contest_code, is_active, file_url, file_type, number_package_size")
        .eq("id", preferredPromotionId)
        .maybeSingle(),
    () =>
      adminClient
        .from("promotions")
        .select("id, title, contest_code, active, file_url, file_type, number_package_size")
        .eq("id", preferredPromotionId)
        .maybeSingle(),
  ];

  let lastError: PostgrestErrorLike | null = null;

  for (const attempt of attempts) {
    const { data, error } = await attempt();

    if (!error) {
      return { data: (data ?? null) as PromotionRow | null, error: null };
    }

    lastError = error;

    if (!isSchemaFallbackError(error)) {
      return { data: null, error };
    }
  }

  return { data: null, error: lastError };
}

async function findPendingPayment(
  adminClient: AdminClientLike,
  promotionId: string,
  userId: string,
) {
  const attempts = [
    () =>
      adminClient
        .from("payments")
        .select(
          "amount, checkout_preference_id, checkout_url, id, poster_quantity, reservation_expires_at, status, transaction_id",
        )
        .eq("user_id", userId)
        .eq("promotion_id", promotionId)
        .eq("status", PENDING_PAYMENT_STATUS)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    () =>
      adminClient
        .from("payments")
        .select("amount, id, poster_quantity, reservation_expires_at, status, transaction_id")
        .eq("user_id", userId)
        .eq("promotion_id", promotionId)
        .eq("status", PENDING_PAYMENT_STATUS)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
  ];

  let lastError: PostgrestErrorLike | null = null;

  for (const attempt of attempts) {
    const { data, error } = await attempt();

    if (!error) {
      return { data: (data ?? null) as ExistingPaymentRow | null, error: null };
    }

    lastError = error;

    if (!isSchemaFallbackError(error)) {
      return { data: null, error };
    }
  }

  return { data: null, error: lastError };
}

async function reserveCheckoutPayment(
  adminClient: AdminClientLike,
  amount: number,
  attribution: NormalizedAttribution | null,
  contestCode: string,
  posterQuantity: number,
  promotionId: string,
  userId: string,
  weekReference: string,
) {
  const payload = {
    _amount: amount,
    _attributed_at: attribution?.attributedAt ?? null,
    _attribution_campaign: attribution?.campaign ?? null,
    _attribution_content: attribution?.content ?? null,
    _attribution_id: attribution?.campaignId ?? null,
    _attribution_landing_path: attribution?.landingPath ?? null,
    _attribution_medium: attribution?.medium ?? null,
    _attribution_referrer_host: attribution?.referrerHost ?? null,
    _attribution_source: attribution?.source ?? null,
    _contest_code: contestCode,
    _payment_method: "mercado_pago_checkout_pro",
    _poster_quantity: posterQuantity,
    _promotion_id: promotionId,
    _user_id: userId,
    _week_reference: weekReference,
  };
  const { data, error } = await adminClient.rpc("reserve_checkout_payment", payload);

  if (error) {
    return { data: null, error };
  }

  const [reservation] = (Array.isArray(data) ? data : [data]) as ReservedCheckoutPaymentRow[];

  return {
    data: reservation ?? null,
    error: null,
  };
}

async function updatePaymentWithFallback(
  adminClient: AdminClientLike,
  paymentRecordId: string,
  variants: Record<string, unknown>[],
) {
  let lastError: PostgrestErrorLike | null = null;

  for (const payload of variants) {
    const { error } = await adminClient.from("payments").update(payload).eq("id", paymentRecordId);

    if (!error) {
      return null;
    }

    lastError = error;

    if (!isSchemaFallbackError(error)) {
      return error;
    }
  }

  return lastError;
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mercadoPagoAccessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !mercadoPagoAccessToken) {
    return jsonResponse({ error: "Server configuration is incomplete." }, 500);
  }

  const authorization = request.headers.get("Authorization");

  if (!authorization) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: authData, error: authError } = await authClient.auth.getUser();
  const user = authData.user;

  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const body = (await request.json().catch(() => null)) as CreateCheckoutPreferenceBody | null;

  if (!body?.promotionId) {
    return jsonResponse({ error: "Promocao obrigatoria para iniciar o checkout." }, 400);
  }

  const { data: promotion, error: promotionError } = await findPromotion(adminClient, body?.promotionId);

  if (promotionError) {
    return jsonResponse({ error: "Nao foi possivel carregar a promocao." }, 500);
  }

  if (!promotion) {
    return jsonResponse({ error: "Promocao nao encontrada." }, 404);
  }

  if (!isPromotionActive(promotion)) {
    return jsonResponse({ error: "Esta promocao nao esta disponivel para compra agora." }, 409);
  }

  if (!promotion.file_url) {
    return jsonResponse({ error: "Este poster ainda nao possui arquivo PDF liberado no backoffice." }, 409);
  }

  const promotionAmount = Number(promotion.entry_amount ?? DEFAULT_AMOUNT);
  const contestCode = normalizeContestCode(promotion.contest_code, promotion.id);
  const requestedPosterQuantity = normalizePosterQuantity(body?.posterQuantity);
  const baseUnitAmount =
    Number.isFinite(promotionAmount) && promotionAmount > 0
      ? Number(promotionAmount.toFixed(2))
      : DEFAULT_AMOUNT;
  const attribution = normalizeAttribution(body?.attribution);
  const title = body?.title?.trim() || promotion.title || "Poster digital";
  const weekReference = getCurrentWeekReference();
  const siteUrl = getSecureSiteUrl(body?.originUrl);
  const webhookUrl = getFunctionUrl("mercado-pago-webhook");

  const { data: pendingPayment, error: pendingPaymentError } = await findPendingPayment(
    adminClient,
    promotion.id,
    user.id,
  );

  if (pendingPaymentError) {
    return jsonResponse({ error: "Nao foi possivel validar a compra atual da promocao." }, 500);
  }

  let paymentRecordId: string | null = null;
  let reservationExpiresAt: string | null = null;
  let reusableCheckoutPreferenceId: string | null = null;
  let reusableCheckoutUrl: string | null = null;
  let posterQuantity = requestedPosterQuantity;
  let unitAmount = baseUnitAmount;

  if (pendingPayment) {
    const canDiscardPreviousAttempt =
      !pendingPayment.transaction_id && !hasActiveReservation(pendingPayment);

    if (canDiscardPreviousAttempt) {
      const recycleError = await updatePaymentWithFallback(adminClient, pendingPayment.id, [
        {
          fulfillment_error: null,
          fulfillment_status: "resolved",
          payment_date: new Date().toISOString(),
          reservation_expires_at: null,
          status: "failed",
        },
        {
          payment_date: new Date().toISOString(),
          reservation_expires_at: null,
          status: "failed",
        },
        {
          status: "failed",
        },
      ]);

      if (recycleError) {
        return jsonResponse({ error: "Nao foi possivel liberar uma nova tentativa de checkout." }, 500);
      }
    } else if (pendingPayment.transaction_id) {
      return jsonResponse({ error: getReservationBlockedMessage(pendingPayment) }, 409);
    } else {
      paymentRecordId = pendingPayment.id;
      reservationExpiresAt = pendingPayment.reservation_expires_at ?? null;
      reusableCheckoutPreferenceId = pendingPayment.checkout_preference_id ?? null;
      reusableCheckoutUrl = pendingPayment.checkout_url ?? null;
      posterQuantity = normalizePosterQuantity(pendingPayment.poster_quantity);

      const existingAmount = Number(pendingPayment.amount ?? 0);
      if (Number.isFinite(existingAmount) && existingAmount > 0 && posterQuantity > 0) {
        unitAmount = Number((existingAmount / posterQuantity).toFixed(2));
      }

      if (reusableCheckoutUrl) {
        return jsonResponse({
          checkoutUrl: reusableCheckoutUrl,
          paymentRecordId,
          preferenceId: reusableCheckoutPreferenceId ?? paymentRecordId,
          promotionId: promotion.id,
          promotionTitle: promotion.title,
          usesRedirectBack: Boolean(siteUrl),
        });
      }
    }
  }

  if (!paymentRecordId) {
    const normalizedAmount = Number((unitAmount * posterQuantity).toFixed(2));

    const { data: availability, error: availabilityError } = await getPromotionCheckoutAvailability(
      adminClient,
      promotion.id,
    );

    if (availabilityError || !availability) {
      return jsonResponse({ error: "Nao foi possivel verificar a disponibilidade da promocao." }, 500);
    }

    if (availability.availableNumbers < posterQuantity) {
      return jsonResponse(buildAvailabilityErrorPayload(availability.availableNumbers, posterQuantity), 409);
    }

    const { data: reservedPayment, error: reserveError } = await reserveCheckoutPayment(
      adminClient,
      normalizedAmount,
      attribution,
      contestCode,
      posterQuantity,
      promotion.id,
      user.id,
      weekReference,
    );

    if (reserveError) {
      if (isAvailabilityReservationError(reserveError)) {
        const { data: refreshedAvailability } = await getPromotionCheckoutAvailability(adminClient, promotion.id);
        return jsonResponse(
          buildAvailabilityErrorPayload(refreshedAvailability?.availableNumbers ?? 0, posterQuantity),
          409,
        );
      }

      console.error("Failed to reserve checkout payment", reserveError);
      return jsonResponse(
        {
          details: reserveError.details ?? reserveError.hint ?? reserveError.message ?? null,
          error: "Nao foi possivel reservar os numeros promocionais desta compra.",
        },
        500,
      );
    }

    if (!reservedPayment?.payment_id) {
      return jsonResponse({ error: "Nao foi possivel iniciar a reserva deste checkout." }, 500);
    }

    paymentRecordId = reservedPayment.payment_id;
    reservationExpiresAt = reservedPayment.reservation_expires_at ?? null;
  }

  if (!paymentRecordId) {
    return jsonResponse({ error: "Nao foi possivel preparar a tentativa de checkout." }, 500);
  }

  const description =
    body?.description?.trim() ||
    `${posterQuantity} poster(es) digitais ${promotion.title} com ${posterQuantity} numero(s) promocional(is).`;

  const preferencePayload: Record<string, unknown> = {
    external_reference: paymentRecordId,
    items: [
      {
        currency_id: "BRL",
        description,
        id: promotion.id,
        quantity: posterQuantity,
        title,
        unit_price: unitAmount,
      },
    ],
    metadata: {
      contest_code: contestCode,
      payment_record_id: paymentRecordId,
      poster_quantity: posterQuantity,
      promotion_id: promotion.id,
      promotion_title: promotion.title,
      user_id: user.id,
    },
    payer: {
      email: body?.payerEmail?.trim() || user.email,
      name:
        body?.payerName?.trim() ||
        user.user_metadata?.full_name ||
        user.user_metadata?.display_name ||
        "Participante",
    },
  };

  if (webhookUrl) {
    preferencePayload.notification_url = webhookUrl;
  }

  if (siteUrl) {
    preferencePayload.auto_return = "approved";
    preferencePayload.back_urls = {
      failure: `${siteUrl}/payment-status?result=failure`,
      pending: `${siteUrl}/payment-status?result=pending`,
      success: `${siteUrl}/payment-status?result=success`,
    };
  }

  if (reservationExpiresAt) {
    preferencePayload.expires = true;
    preferencePayload.expiration_date_from = new Date().toISOString();
    preferencePayload.expiration_date_to = reservationExpiresAt;
  }

  const mercadoPagoResponse = await fetch(`${MERCADO_PAGO_API_URL}/checkout/preferences`, {
    body: JSON.stringify(preferencePayload),
    headers: {
      Authorization: `Bearer ${mercadoPagoAccessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": paymentRecordId,
    },
    method: "POST",
  });

  const mercadoPagoData =
    (await mercadoPagoResponse.json().catch(() => null)) as
      | MercadoPagoErrorResponse
      | MercadoPagoPreferenceResponse
      | null;

  if (!mercadoPagoResponse.ok) {
    const mercadoPagoError = mercadoPagoData as MercadoPagoErrorResponse | null;

    await updatePaymentWithFallback(adminClient, paymentRecordId, [
      {
        checkout_preference_id: null,
        checkout_url: null,
        fulfillment_error: mercadoPagoError?.message ?? mercadoPagoError?.error ?? null,
        fulfillment_status: "resolved",
        payment_date: new Date().toISOString(),
        reservation_expires_at: null,
        status: "failed",
      },
      {
        payment_date: new Date().toISOString(),
        reservation_expires_at: null,
        status: "failed",
      },
      {
        status: "failed",
      },
    ]);

    return jsonResponse(
      {
        details: mercadoPagoError?.message ?? mercadoPagoError?.error,
        error: "Nao foi possivel criar a preferencia do Checkout Pro.",
      },
      502,
    );
  }

  const mercadoPagoPreference = mercadoPagoData as MercadoPagoPreferenceResponse | null;
  const checkoutUrl = mercadoPagoPreference?.init_point ?? mercadoPagoPreference?.sandbox_init_point;

  if (!checkoutUrl || !mercadoPagoPreference?.id) {
    await updatePaymentWithFallback(adminClient, paymentRecordId, [
      {
        checkout_preference_id: null,
        checkout_url: null,
        fulfillment_error: "Mercado Pago returned an invalid checkout response.",
        fulfillment_status: "resolved",
        payment_date: new Date().toISOString(),
        reservation_expires_at: null,
        status: "failed",
      },
      {
        payment_date: new Date().toISOString(),
        reservation_expires_at: null,
        status: "failed",
      },
      {
        status: "failed",
      },
    ]);

    return jsonResponse({ error: "Mercado Pago returned an invalid checkout response." }, 502);
  }

  await updatePaymentWithFallback(adminClient, paymentRecordId, [
    {
      checkout_preference_id: mercadoPagoPreference.id,
      checkout_url: checkoutUrl,
    },
    {
      reservation_expires_at: reservationExpiresAt,
    },
  ]);

  return jsonResponse({
    checkoutUrl,
    paymentRecordId,
    preferenceId: mercadoPagoPreference.id,
    promotionId: promotion.id,
    promotionTitle: promotion.title,
    usesRedirectBack: Boolean(siteUrl),
  });
});
