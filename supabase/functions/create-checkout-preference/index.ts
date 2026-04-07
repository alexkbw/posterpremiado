import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { corsHeaders } from "../_shared/cors.ts";

type CreateCheckoutPreferenceBody = {
  description?: string;
  originUrl?: string;
  payerEmail?: string | null;
  payerName?: string | null;
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
  id: string;
  status?: string | null;
  transaction_id?: string | null;
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

const DEFAULT_AMOUNT = 10;
const DEFAULT_PROMOTION_PACKAGE_SIZE = 10;
const MAX_PROMOTION_PACKAGE_SIZE = 9999;
const MERCADO_PAGO_API_URL = "https://api.mercadopago.com";
const PENDING_PAYMENT_STATUS = "pending";

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

function normalizePackageSize(value?: number | null) {
  const normalized = Number(value ?? DEFAULT_PROMOTION_PACKAGE_SIZE);

  if (!Number.isInteger(normalized) || normalized < 1) {
    return DEFAULT_PROMOTION_PACKAGE_SIZE;
  }

  return Math.min(normalized, MAX_PROMOTION_PACKAGE_SIZE);
}

function normalizeContestCode(value?: string | null, fallback?: string | null) {
  const normalized = value?.trim();

  if (normalized) {
    return normalized;
  }

  const normalizedFallback = fallback?.trim();
  return normalizedFallback || "";
}

async function findPromotion(
  adminClient: ReturnType<typeof createClient>,
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
  adminClient: ReturnType<typeof createClient>,
  promotionId: string,
  userId: string,
) {
  const attempts = [
    () =>
      adminClient
        .from("payments")
        .select("id, status, transaction_id")
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

async function insertPendingPayment(
  adminClient: ReturnType<typeof createClient>,
  amount: number,
  contestCode: string,
  paymentRecordId: string,
  promotionId: string,
  userId: string,
) {
  const payload = {
    amount,
    contest_code: contestCode,
    id: paymentRecordId,
    payment_date: new Date().toISOString(),
    payment_method: "mercado_pago_checkout_pro",
    promotion_id: promotionId,
    status: "pending",
    user_id: userId,
    week_reference: getCurrentWeekReference(),
  };

  const { error } = await adminClient.from("payments").insert(payload);

  if (!error) {
    return { error: null };
  }

  return { error };
}

async function updatePaymentWithFallback(
  adminClient: ReturnType<typeof createClient>,
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
  const numberPackageSize = normalizePackageSize(promotion.number_package_size);
  const normalizedAmount =
    Number.isFinite(promotionAmount) && promotionAmount > 0
      ? Number(promotionAmount.toFixed(2))
      : DEFAULT_AMOUNT;
  const title = body?.title?.trim() || promotion.title || "Poster digital";

  const { data: pendingPayment, error: pendingPaymentError } = await findPendingPayment(
    adminClient,
    promotion.id,
    user.id,
  );

  if (pendingPaymentError) {
    return jsonResponse({ error: "Nao foi possivel validar a compra atual da promocao." }, 500);
  }

  if (pendingPayment) {
    const canDiscardPreviousAttempt = !pendingPayment.transaction_id;

    if (canDiscardPreviousAttempt) {
      const recycleError = await updatePaymentWithFallback(adminClient, pendingPayment.id, [
        {
          payment_date: new Date().toISOString(),
          status: "failed",
        },
        {
          status: "failed",
        },
      ]);

      if (recycleError) {
        return jsonResponse({ error: "Nao foi possivel liberar uma nova tentativa de checkout." }, 500);
      }
    } else {
      return jsonResponse(
        {
          error:
            "Existe um pagamento desta promocao ainda em analise. Aguarde a atualizacao dele antes de iniciar outro checkout.",
        },
        409,
      );
    }
  }

  const paymentRecordId = crypto.randomUUID();
  const { error: insertError } = await insertPendingPayment(
    adminClient,
    normalizedAmount,
    contestCode,
    paymentRecordId,
    promotion.id,
    user.id,
  );

  if (insertError) {
    console.error("Failed to insert pending payment", insertError);
    return jsonResponse(
      {
        details: insertError.details ?? insertError.hint ?? insertError.message ?? null,
        error: "Nao foi possivel registrar o pagamento pendente.",
      },
      500,
    );
  }

  const siteUrl = getSecureSiteUrl(body?.originUrl);
  const webhookUrl = getFunctionUrl("mercado-pago-webhook");
  const description =
    body?.description?.trim() ||
    `Poster digital ${promotion.title} com ${numberPackageSize} numeros promocionais.`;

  const preferencePayload: Record<string, unknown> = {
    external_reference: paymentRecordId,
    items: [
      {
        currency_id: "BRL",
        description,
        id: promotion.id,
        quantity: 1,
        title,
        unit_price: normalizedAmount,
      },
    ],
    metadata: {
      contest_code: contestCode,
      payment_record_id: paymentRecordId,
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
    await updatePaymentWithFallback(adminClient, paymentRecordId, [
      {
        payment_date: new Date().toISOString(),
        status: "failed",
      },
      {
        status: "failed",
      },
    ]);

    return jsonResponse(
      {
        details: mercadoPagoData?.message ?? mercadoPagoData?.error,
        error: "Nao foi possivel criar a preferencia do Checkout Pro.",
      },
      502,
    );
  }

  const checkoutUrl = mercadoPagoData?.sandbox_init_point ?? mercadoPagoData?.init_point;

  if (!checkoutUrl || !mercadoPagoData?.id) {
    await updatePaymentWithFallback(adminClient, paymentRecordId, [
      {
        payment_date: new Date().toISOString(),
        status: "failed",
      },
      {
        status: "failed",
      },
    ]);

    return jsonResponse({ error: "Mercado Pago returned an invalid checkout response." }, 502);
  }

  return jsonResponse({
    checkoutUrl,
    paymentRecordId,
    preferenceId: mercadoPagoData.id,
    promotionId: promotion.id,
    promotionTitle: promotion.title,
    usesRedirectBack: Boolean(siteUrl),
  });
});
