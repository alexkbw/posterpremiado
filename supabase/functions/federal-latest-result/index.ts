import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { corsHeaders } from "../_shared/cors.ts";

type FederalApiResponse = {
  dataApuracao?: string | null;
  dezenasSorteadasOrdemSorteio?: string[] | null;
  listaDezenas?: string[] | null;
  numero?: number | string | null;
};

const FEDERAL_API_URL = "https://servicebus2.caixa.gov.br/portaldeloterias/api/federal";
const FEDERAL_API_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
  Origin: "https://loterias.caixa.gov.br",
  Pragma: "no-cache",
  Referer: "https://loterias.caixa.gov.br/",
  "User-Agent": "Mozilla/5.0 (compatible; posterPremiado/1.0; +https://vpwhknwmotwdvevlkkpn.supabase.co)",
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

function normalizeFederalContest(value?: number | string | null) {
  const normalized = `${value ?? ""}`.trim();
  return normalized || null;
}

function normalizeFirstPrizeNumber(payload: FederalApiResponse | null) {
  const candidate =
    payload?.dezenasSorteadasOrdemSorteio?.[0] ??
    payload?.listaDezenas?.[0] ??
    null;

  const normalized = `${candidate ?? ""}`.replace(/\D/g, "");
  return normalized || null;
}

function deriveWinningCode(firstPrizeNumber: string) {
  const normalized = firstPrizeNumber.replace(/\D/g, "");
  return normalized.slice(-4).padStart(4, "0");
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const federalResponse = await fetch(FEDERAL_API_URL, {
      headers: FEDERAL_API_HEADERS,
      method: "GET",
      redirect: "follow",
    });

    const rawPayload = await federalResponse.text();
    const payload = rawPayload
      ? ((await Promise.resolve().then(() => JSON.parse(rawPayload)).catch(() => null)) as FederalApiResponse | null)
      : null;

    if (!federalResponse.ok) {
      return jsonResponse(
        {
          details: payload,
          error: "Nao foi possivel consultar a API da Loteria Federal.",
          responseBody: rawPayload.slice(0, 500),
          status: federalResponse.status,
        },
        502,
      );
    }

    const federalContest = normalizeFederalContest(payload?.numero);
    const firstPrizeNumber = normalizeFirstPrizeNumber(payload);

    if (!federalContest || !firstPrizeNumber) {
      return jsonResponse({ error: "A API da Loteria Federal retornou um payload incompleto." }, 502);
    }

    return jsonResponse({
      dataApuracao: payload?.dataApuracao ?? null,
      federalContest,
      firstPrizeNumber,
      officialWinningCode: deriveWinningCode(firstPrizeNumber),
      sourceUrl: FEDERAL_API_URL,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Erro inesperado ao consultar a API da Federal.",
      },
      500,
    );
  }
});
