import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { corsHeaders } from "../_shared/cors.ts";

type AuditRequestBody = {
  paymentRecordId?: string | null;
};

type PaymentRow = {
  amount?: number | null;
  id: string;
  payment_date?: string | null;
  payment_method?: string | null;
  promotion_id?: string | null;
  status?: string | null;
  transaction_id?: string | null;
  user_id: string;
};

type MercadoPagoPaymentResponse = {
  authorization_code?: string | null;
  card?: {
    first_six_digits?: string | null;
    last_four_digits?: string | null;
  } | null;
  date_approved?: string | null;
  date_created?: string | null;
  date_last_updated?: string | null;
  external_reference?: string | null;
  id?: number | string;
  installments?: number | null;
  issuer_id?: number | string | null;
  payment_method_id?: string | null;
  payment_type_id?: string | null;
  payer?: {
    email?: string | null;
    first_name?: string | null;
    identification?: {
      number?: string | null;
      type?: string | null;
    } | null;
    last_name?: string | null;
  } | null;
  point_of_interaction?: {
    transaction_data?: {
      bank_transfer_id?: number | string | null;
      e2e_id?: string | null;
      financial_institution?: string | null;
      transaction_id?: string | null;
    } | null;
  } | null;
  processing_mode?: string | null;
  status?: string | null;
  status_detail?: string | null;
  transaction_amount?: number | null;
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

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
  }).format(Number(value ?? 0));
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Nao informado";
  }

  const parsedValue = new Date(value);

  if (Number.isNaN(parsedValue.getTime())) {
    return "Nao informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(parsedValue);
}

function maskEmail(value?: string | null) {
  const normalized = value?.trim();

  if (!normalized || !normalized.includes("@")) {
    return "Nao informado";
  }

  const [localPart, domain] = normalized.split("@");
  const visiblePrefix = localPart.slice(0, 2);
  return `${visiblePrefix}${localPart.length > 2 ? "***" : "*" }@${domain}`;
}

function maskDocument(value?: string | null) {
  const normalized = `${value ?? ""}`.replace(/\D/g, "");

  if (!normalized) {
    return "Nao informado";
  }

  const suffix = normalized.slice(-3);
  return `***${suffix}`;
}

function maskName(firstName?: string | null, lastName?: string | null) {
  const fullName = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ");

  if (!fullName) {
    return "Nao informado";
  }

  const [primaryName, secondaryName] = fullName.split(" ");
  return secondaryName ? `${primaryName} ${secondaryName.charAt(0)}.` : primaryName;
}

function buildVerificationHints(payment: MercadoPagoPaymentResponse) {
  const hints: string[] = [];
  const transactionData = payment.point_of_interaction?.transaction_data;

  if (payment.id) {
    hints.push(`Pagamento provedor: ${String(payment.id)}`);
  }

  if (transactionData?.transaction_id) {
    hints.push(`TXID: ${transactionData.transaction_id}`);
  }

  if (transactionData?.e2e_id) {
    hints.push(`E2E ID: ${transactionData.e2e_id}`);
  }

  if (payment.authorization_code) {
    hints.push(`Codigo de autorizacao: ${payment.authorization_code}`);
  }

  if (payment.card?.last_four_digits) {
    hints.push(`Cartao final ${payment.card.last_four_digits}`);
  }

  if (transactionData?.bank_transfer_id) {
    hints.push(`Transferencia bancaria: ${String(transactionData.bank_transfer_id)}`);
  }

  return hints;
}

function buildAuditReport(args: {
  checkedAt: string;
  dbPayment: PaymentRow;
  mercadoPagoPayment: MercadoPagoPaymentResponse;
}) {
  const { checkedAt, dbPayment, mercadoPagoPayment } = args;
  const transactionData = mercadoPagoPayment.point_of_interaction?.transaction_data;
  const payerDocumentType = mercadoPagoPayment.payer?.identification?.type?.trim();
  const payerDocumentNumber = mercadoPagoPayment.payer?.identification?.number?.trim();
  const verificationHints = buildVerificationHints(mercadoPagoPayment);

  const lines = [
    "CONFERENCIA EXTERNA",
    "Provedor: Mercado Pago",
    `Consultado em: ${formatDateTime(checkedAt)}`,
    "",
    `Pagamento interno: ${dbPayment.id}`,
    `Pagamento provedor: ${mercadoPagoPayment.id ? String(mercadoPagoPayment.id) : "Nao informado"}`,
    `Referencia externa: ${mercadoPagoPayment.external_reference ?? dbPayment.id}`,
    `Status: ${mercadoPagoPayment.status ?? dbPayment.status ?? "Nao informado"}`,
    `Status detalhado: ${mercadoPagoPayment.status_detail ?? "Nao informado"}`,
    `Metodo: ${mercadoPagoPayment.payment_method_id ?? dbPayment.payment_method ?? "Nao informado"}`,
    `Tipo: ${mercadoPagoPayment.payment_type_id ?? "Nao informado"}`,
    `Valor: ${formatCurrency(mercadoPagoPayment.transaction_amount ?? dbPayment.amount)}`,
    `Criado em: ${formatDateTime(mercadoPagoPayment.date_created)}`,
    `Aprovado em: ${formatDateTime(mercadoPagoPayment.date_approved ?? dbPayment.payment_date)}`,
    `Atualizado em: ${formatDateTime(mercadoPagoPayment.date_last_updated)}`,
    "",
    "Pagador:",
    `  Nome: ${maskName(mercadoPagoPayment.payer?.first_name, mercadoPagoPayment.payer?.last_name)}`,
    `  Email: ${maskEmail(mercadoPagoPayment.payer?.email)}`,
    `  Documento: ${payerDocumentType ? `${payerDocumentType} ` : ""}${maskDocument(payerDocumentNumber)}`,
    "",
    "Conferencia complementar:",
    `  Modo de processamento: ${mercadoPagoPayment.processing_mode ?? "Nao informado"}`,
    `  Parcelas: ${mercadoPagoPayment.installments ?? 1}`,
    `  Emissor: ${mercadoPagoPayment.issuer_id ? String(mercadoPagoPayment.issuer_id) : "Nao informado"}`,
    `  Instituicao financeira: ${transactionData?.financial_institution ?? "Nao informado"}`,
    `  Cartao: ${mercadoPagoPayment.card?.last_four_digits ? `final ${mercadoPagoPayment.card.last_four_digits}` : "Nao informado"}`,
    `  Codigo de autorizacao: ${mercadoPagoPayment.authorization_code ?? "Nao informado"}`,
    `  TXID: ${transactionData?.transaction_id ?? "Nao informado"}`,
    `  E2E ID: ${transactionData?.e2e_id ?? "Nao informado"}`,
    `  Transferencia bancaria: ${transactionData?.bank_transfer_id ? String(transactionData.bank_transfer_id) : "Nao informado"}`,
  ];

  if (verificationHints.length) {
    lines.push("", "Chaves uteis para consulta manual:");
    for (const hint of verificationHints) {
      lines.push(`  - ${hint}`);
    }
  }

  lines.push("", "Observacao: dados pessoais foram mascarados para consulta operacional.");

  return lines.join("\n");
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

  const { data: adminRole } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!adminRole) {
    return jsonResponse({ error: "Forbidden." }, 403);
  }

  const body = (await request.json().catch(() => null)) as AuditRequestBody | null;
  const paymentRecordId = body?.paymentRecordId?.trim();

  if (!paymentRecordId) {
    return jsonResponse({ error: "paymentRecordId is required." }, 400);
  }

  const { data: dbPayment, error: paymentLookupError } = await adminClient
    .from("payments")
    .select("id, user_id, amount, status, payment_method, payment_date, transaction_id, promotion_id")
    .eq("id", paymentRecordId)
    .maybeSingle();

  if (paymentLookupError) {
    return jsonResponse({ error: "Could not load the payment record." }, 500);
  }

  if (!dbPayment) {
    return jsonResponse({ error: "Payment not found." }, 404);
  }

  if (!dbPayment.transaction_id?.trim()) {
    return jsonResponse({
      checkedAt: new Date().toISOString(),
      provider: "Mercado Pago",
      reportText: [
        "CONFERENCIA EXTERNA",
        "Provedor: Mercado Pago",
        `Consultado em: ${formatDateTime(new Date().toISOString())}`,
        "",
        `Pagamento interno: ${dbPayment.id}`,
        "Pagamento provedor: Nao informado",
        "",
        "Este pagamento ainda nao possui transaction_id sincronizado.",
        "Aguarde o retorno do provedor ou consulte novamente depois.",
      ].join("\n"),
      transactionId: null,
    });
  }

  const mercadoPagoResponse = await fetch(`${MERCADO_PAGO_API_URL}/v1/payments/${dbPayment.transaction_id}`, {
    headers: {
      Authorization: `Bearer ${mercadoPagoAccessToken}`,
      "Content-Type": "application/json",
    },
    method: "GET",
  });

  const mercadoPagoPayment =
    (await mercadoPagoResponse.json().catch(() => null)) as MercadoPagoPaymentResponse | null;

  if (!mercadoPagoResponse.ok || !mercadoPagoPayment?.id) {
    return jsonResponse({ error: "Could not fetch the Mercado Pago payment." }, 502);
  }

  const checkedAt = new Date().toISOString();

  return jsonResponse({
    checkedAt,
    provider: "Mercado Pago",
    reportText: buildAuditReport({
      checkedAt,
      dbPayment: dbPayment as PaymentRow,
      mercadoPagoPayment,
    }),
    transactionId: String(mercadoPagoPayment.id),
  });
});
