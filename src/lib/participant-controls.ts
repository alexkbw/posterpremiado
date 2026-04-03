import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export type SelfParticipantControls = {
  blockReason: string | null;
  checkoutBlocked: boolean;
  publicChatBlocked: boolean;
};

const DEFAULT_SELF_PARTICIPANT_CONTROLS: SelfParticipantControls = {
  blockReason: null,
  checkoutBlocked: false,
  publicChatBlocked: false,
};

export async function loadSelfParticipantControls(
  client: SupabaseClient<Database>,
): Promise<SelfParticipantControls> {
  const { data, error } = await client.rpc("get_my_participant_controls");

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    blockReason: row?.block_reason ?? null,
    checkoutBlocked: Boolean(row?.checkout_blocked),
    publicChatBlocked: Boolean(row?.public_chat_blocked),
  };
}

export function getDefaultSelfParticipantControls() {
  return DEFAULT_SELF_PARTICIPANT_CONTROLS;
}
