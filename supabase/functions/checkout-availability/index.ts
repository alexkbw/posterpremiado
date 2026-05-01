import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import {
  getPromotionCheckoutAvailability,
  getPromotionAvailabilityMessage,
  normalizePosterQuantity,
} from "../_shared/contest-availability.ts";
import { corsHeaders } from "../_shared/cors.ts";

type CreateCheckoutAvailabilityBody = {
  posterQuantity?: number | null;
  promotionId?: string | null;
};

type PromotionRow = {
  contest_code?: string | null;
  file_url?: string | null;
  id: string;
  is_active?: boolean | null;
  title: string;
};

type PostgrestErrorLike = {
  details?: string;
  hint?: string;
  message?: string;
};

type AdminClientLike = {
  from: (tableName: string) => any;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status,
  });
}

function isPromotionActive(promotion: PromotionRow | null) {
  if (!promotion) {
    return false;
  }

  if (typeof promotion.is_active === "boolean") {
    return promotion.is_active;
  }

  return true;
}

async function findPromotion(
  adminClient: AdminClientLike,
  promotionId?: string | null,
) {
  if (!promotionId) {
    return {
      data: null,
      error: {
        message: "Promotion is required.",
      } as PostgrestErrorLike,
    };
  }

  const { data, error } = await adminClient
    .from("promotions")
    .select("id, title, contest_code, is_active, file_url")
    .eq("id", promotionId)
    .maybeSingle();

  return { data: (data ?? null) as PromotionRow | null, error };
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

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
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

  const body = (await request.json().catch(() => null)) as CreateCheckoutAvailabilityBody | null;

  if (!body?.promotionId) {
    return jsonResponse({ error: "Promocao obrigatoria para verificar a disponibilidade." }, 400);
  }

  const { data: promotion, error: promotionError } = await findPromotion(adminClient, body.promotionId);

  if (promotionError) {
    return jsonResponse({ error: "Nao foi possivel carregar a promocao." }, 500);
  }

  if (!promotion) {
    return jsonResponse({ error: "Promocao nao encontrada." }, 404);
  }

  const requestedQuantity = normalizePosterQuantity(body.posterQuantity);
  if (!isPromotionActive(promotion)) {
    return jsonResponse({
      availableNumbers: 0,
      canCheckout: false,
      contestCode: promotion.contest_code?.trim() ?? promotion.id,
      maxQuantity: 0,
      message: "Esta promocao nao esta disponivel para compra agora.",
      requestedQuantity,
      soldOut: true,
    });
  }

  if (!promotion.file_url) {
    return jsonResponse({
      availableNumbers: 0,
      canCheckout: false,
      contestCode: promotion.contest_code?.trim() ?? promotion.id,
      maxQuantity: 0,
      message: "Este poster ainda nao possui arquivo PDF liberado no backoffice.",
      requestedQuantity,
      soldOut: true,
    });
  }

  const { data: availability, error: availabilityError } = await getPromotionCheckoutAvailability(
    adminClient,
    promotion.id,
  );

  if (availabilityError || !availability) {
    return jsonResponse({ error: "Nao foi possivel verificar a disponibilidade desta promocao." }, 500);
  }

  const canCheckout = availability.availableNumbers >= requestedQuantity;

  return jsonResponse({
    availableNumbers: availability.availableNumbers,
    canCheckout,
    contestCode: promotion.contest_code?.trim() ?? promotion.id,
    maxQuantity: availability.availableNumbers,
    message: getPromotionAvailabilityMessage(availability.availableNumbers, requestedQuantity),
    requestedQuantity,
    soldOut: availability.availableNumbers <= 0,
  });
});
