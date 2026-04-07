import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { corsHeaders } from "../_shared/cors.ts";

type MercadoPagoNotification = {
  data?: {
    id?: number | string;
  };
  topic?: string;
  type?: string;
};

type MercadoPagoPaymentResponse = {
  date_approved?: string | null;
  date_last_updated?: string | null;
  external_reference?: string | null;
  id?: number | string;
  payment_method_id?: string | null;
  payment_type_id?: string | null;
  status?: string | null;
  transaction_amount?: number | null;
};

type MercadoPagoMerchantOrderPayment = {
  id?: number | string;
  status?: string | null;
};

type MercadoPagoMerchantOrderResponse = {
  id?: number | string;
  payments?: MercadoPagoMerchantOrderPayment[] | null;
};

type PostgrestErrorLike = {
  details?: string;
  hint?: string;
  message?: string;
};

const MERCADO_PAGO_API_URL = "https://api.mercadopago.com";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status,
  });
}

function normalizeMercadoPagoStatus(status?: string | null) {
  switch ((status ?? "").toLowerCase()) {
    case "approved":
      return "paid";
    case "in_mediation":
    case "in_process":
    case "pending":
      return "pending";
    default:
      return "failed";
  }
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

function getNotificationResourceId(request: Request, payload: MercadoPagoNotification | null) {
  const requestUrl = new URL(request.url);

  return payload?.data?.id ?? requestUrl.searchParams.get("data.id") ?? requestUrl.searchParams.get("id") ?? null;
}

function getNotificationType(request: Request, payload: MercadoPagoNotification | null) {
  const requestUrl = new URL(request.url);

  return payload?.type ?? payload?.topic ?? requestUrl.searchParams.get("type") ?? requestUrl.searchParams.get("topic") ?? null;
}

async function fetchMercadoPagoPayment(
  mercadoPagoAccessToken: string,
  paymentId: number | string,
) {
  const paymentResponse = await fetch(`${MERCADO_PAGO_API_URL}/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${mercadoPagoAccessToken}`,
      "Content-Type": "application/json",
    },
    method: "GET",
  });

  const paymentData = (await paymentResponse.json().catch(() => null)) as MercadoPagoPaymentResponse | null;

  if (!paymentResponse.ok || !paymentData?.id) {
    return { error: "Could not fetch the Mercado Pago payment.", paymentData: null };
  }

  return { error: null, paymentData };
}

function getMerchantOrderPaymentPriority(status?: string | null) {
  switch ((status ?? "").toLowerCase()) {
    case "approved":
      return 3;
    case "in_process":
    case "pending":
      return 2;
    default:
      return 1;
  }
}

async function resolvePaymentIdFromMerchantOrder(
  mercadoPagoAccessToken: string,
  merchantOrderId: number | string,
) {
  const merchantOrderResponse = await fetch(`${MERCADO_PAGO_API_URL}/merchant_orders/${merchantOrderId}`, {
    headers: {
      Authorization: `Bearer ${mercadoPagoAccessToken}`,
      "Content-Type": "application/json",
    },
    method: "GET",
  });

  const merchantOrderData =
    (await merchantOrderResponse.json().catch(() => null)) as MercadoPagoMerchantOrderResponse | null;

  if (!merchantOrderResponse.ok || !merchantOrderData?.id) {
    return { error: "Could not fetch the Mercado Pago merchant order.", paymentId: null };
  }

  const selectedPayment =
    [...(merchantOrderData.payments ?? [])]
      .filter((payment) => Boolean(payment.id))
      .sort(
        (left, right) =>
          getMerchantOrderPaymentPriority(right.status) - getMerchantOrderPaymentPriority(left.status),
      )[0] ?? null;

  if (!selectedPayment?.id) {
    return { error: null, paymentId: null };
  }

  return { error: null, paymentId: selectedPayment.id };
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
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mercadoPagoAccessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");

  if (!supabaseUrl || !supabaseServiceRoleKey || !mercadoPagoAccessToken) {
    return jsonResponse({ error: "Server configuration is incomplete." }, 500);
  }

  const payload = (await request.json().catch(() => null)) as MercadoPagoNotification | null;
  const resourceId = getNotificationResourceId(request, payload);
  const notificationType = getNotificationType(request, payload);

  if (!resourceId || !notificationType) {
    return jsonResponse({ ignored: true, received: true });
  }

  let paymentId: number | string | null = null;

  if (notificationType === "payment") {
    paymentId = resourceId;
  } else if (notificationType === "merchant_order") {
    const { error: merchantOrderError, paymentId: merchantOrderPaymentId } =
      await resolvePaymentIdFromMerchantOrder(mercadoPagoAccessToken, resourceId);

    if (merchantOrderError) {
      return jsonResponse({ error: merchantOrderError }, 502);
    }

    paymentId = merchantOrderPaymentId;
  } else {
    return jsonResponse({ ignored: true, reason: "unsupported_notification_type", received: true });
  }

  if (!paymentId) {
    return jsonResponse({ ignored: true, reason: "missing_payment_in_notification", received: true });
  }

  const { error: paymentFetchError, paymentData } = await fetchMercadoPagoPayment(
    mercadoPagoAccessToken,
    paymentId,
  );

  if (paymentFetchError || !paymentData?.id) {
    return jsonResponse({ error: paymentFetchError ?? "Could not fetch the Mercado Pago payment." }, 502);
  }

  const paymentRecordId = paymentData.external_reference;

  if (!paymentRecordId) {
    return jsonResponse({ ignored: true, reason: "missing_external_reference", received: true });
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const normalizedStatus = normalizeMercadoPagoStatus(paymentData.status);
  const occurredAt = paymentData.date_approved ?? paymentData.date_last_updated ?? new Date().toISOString();
  const paymentMethod =
    paymentData.payment_method_id ?? paymentData.payment_type_id ?? "mercado_pago_checkout_pro";
  const amount = Number(paymentData.transaction_amount ?? 10);

  const variants =
    normalizedStatus === "paid"
      ? [
          {
            amount,
            payment_date: occurredAt,
            payment_method: paymentMethod,
            status: "paid",
            transaction_id: String(paymentData.id),
          },
          {
            amount,
            payment_method: paymentMethod,
            status: "paid",
          },
          {
            amount,
            payment_date: occurredAt,
            payment_method: paymentMethod,
            status: "completed",
            transaction_id: String(paymentData.id),
          },
          {
            amount,
            payment_method: paymentMethod,
            status: "completed",
          },
        ]
      : [
          {
            amount,
            payment_date: occurredAt,
            payment_method: paymentMethod,
            status: normalizedStatus,
            transaction_id: String(paymentData.id),
          },
          {
            amount,
            payment_method: paymentMethod,
            status: normalizedStatus,
          },
        ];

  const updateError = await updatePaymentWithFallback(adminClient, paymentRecordId, variants);

  if (updateError) {
    return jsonResponse({ error: "Could not update the payment status." }, 500);
  }

  if (normalizedStatus === "paid") {
    const { error: assignmentError } = await adminClient.rpc("assign_promotion_numbers", {
      _payment_id: paymentRecordId,
    });

    if (assignmentError) {
      return jsonResponse({ error: "Could not assign the promotion numbers." }, 500);
    }
  }

  return jsonResponse({
    paymentId: String(paymentData.id),
    received: true,
    status: normalizedStatus,
  });
});
