import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

const SUPABASE_FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

export type CreateCheckoutPreferenceInput = {
  originUrl: string;
  payerEmail?: string | null;
  payerName?: string | null;
  promotionId: string;
  title?: string;
};

export type CreateCheckoutPreferenceResponse = {
  checkoutUrl: string;
  paymentRecordId: string;
  preferenceId: string;
  promotionId?: string | null;
  promotionTitle?: string | null;
  usesRedirectBack: boolean;
};

type FunctionErrorPayload = {
  details?: string;
  error?: string;
  message?: string;
};

async function getActiveSession(session: Session) {
  const {
    data: { session: currentSession },
  } = await supabase.auth.getSession();

  let activeSession = currentSession ?? session;

  if (!activeSession) {
    throw new Error("Sua sessao expirou. Entre novamente para continuar o pagamento.");
  }

  const expiresAt = activeSession.expires_at ? activeSession.expires_at * 1000 : 0;

  if (!activeSession.access_token || (expiresAt && expiresAt <= Date.now() + 60_000)) {
    const { data, error } = await supabase.auth.refreshSession();

    if (error || !data.session) {
      throw new Error("Sua sessao expirou. Entre novamente para continuar o pagamento.");
    }

    activeSession = data.session;
  }

  return activeSession;
}

async function getVerifiedSession(session: Session) {
  let activeSession = await getActiveSession(session);
  const { data, error } = await supabase.auth.getUser(activeSession.access_token);

  if (!error && data.user) {
    return activeSession;
  }

  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

  if (!refreshError && refreshData.session) {
    activeSession = refreshData.session;

    const { data: refreshedUserData, error: refreshedUserError } = await supabase.auth.getUser(
      activeSession.access_token,
    );

    if (!refreshedUserError && refreshedUserData.user) {
      return activeSession;
    }
  }

  await supabase.auth.signOut();
  throw new Error("Sua sessao nesta URL expirou ou ficou invalida. Entre novamente antes de pagar.");
}

async function getFunctionErrorMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as FunctionErrorPayload | null;

  return payload?.error ?? payload?.message ?? "Nao foi possivel iniciar o checkout.";
}

export async function createCheckoutPreference(
  session: Session,
  input: CreateCheckoutPreferenceInput,
) {
  if (!SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("A chave publica do Supabase nao esta configurada.");
  }

  const activeSession = await getVerifiedSession(session);
  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-checkout-preference`, {
    body: JSON.stringify(input),
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${activeSession.access_token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await getFunctionErrorMessage(response));
  }

  const data = (await response.json().catch(() => null)) as CreateCheckoutPreferenceResponse | null;

  if (!data?.checkoutUrl) {
    throw new Error("O checkout foi criado sem URL de redirecionamento.");
  }

  return data;
}
