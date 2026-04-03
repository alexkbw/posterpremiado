type RawRecord = Record<string, unknown>;

type SupabaseLikeClient = {
  from: (table: string) => any;
  rpc?: (fn: string, args?: Record<string, unknown>) => Promise<{ data?: unknown; error?: unknown }>;
};

export type ChatEntry = {
  body: string;
  createdAt: string;
  id: string;
  read: boolean;
  receiverId: string | null;
  senderId: string;
};

export type ParticipantIdentity = {
  avatarUrl: string | null;
  bubbleThemeId: string | null;
  name: string;
};

function asRecord(value: unknown): RawRecord | null {
  return typeof value === "object" && value !== null ? (value as RawRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function readTimestamp(row: RawRecord) {
  return readString(row.sent_at) || readString(row.created_at) || new Date(0).toISOString();
}

function buildFallbackParticipantLabel(_userId: string) {
  return "Participante";
}

export function normalizePublicChatMessage(raw: unknown): ChatEntry | null {
  const row = asRecord(raw);

  if (!row) return null;

  const id = readString(row.id);
  const senderId = readString(row.user_id) || readString(row.sender_id);
  const body = readString(row.message) || readString(row.content);

  if (!id || !senderId || !body) return null;

  return {
    body,
    createdAt: readTimestamp(row),
    id,
    read: true,
    receiverId: null,
    senderId,
  };
}

export function normalizePrivateChatMessage(raw: unknown): ChatEntry | null {
  const row = asRecord(raw);

  if (!row) return null;

  const id = readString(row.id);
  const senderId = readString(row.sender_id);
  const receiverId = readNullableString(row.receiver_id);
  const body = readString(row.message) || readString(row.content);

  if (!id || !senderId || !body) return null;

  return {
    body,
    createdAt: readTimestamp(row),
    id,
    read: readBoolean(row.read),
    receiverId,
    senderId,
  };
}

export function sortChatEntries(entries: ChatEntry[]) {
  return [...entries].sort((left, right) => {
    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });
}

export function mergeChatEntries(entries: ChatEntry[], nextEntries: ChatEntry[]) {
  const map = new Map(entries.map((entry) => [entry.id, entry]));

  nextEntries.forEach((entry) => {
    map.set(entry.id, entry);
  });

  return sortChatEntries(Array.from(map.values()));
}

export function buildParticipantLabel(userId: string, profileNames: Map<string, string>) {
  return profileNames.get(userId) ?? buildFallbackParticipantLabel(userId);
}

export function buildParticipantIdentity(
  userId: string,
  identities: Map<string, ParticipantIdentity>,
) {
  return identities.get(userId) ?? {
    avatarUrl: null,
    bubbleThemeId: null,
    name: buildFallbackParticipantLabel(userId),
  };
}

export async function loadProfileNames(supabase: SupabaseLikeClient, userIds: string[]) {
  const identities = await loadParticipantIdentities(supabase, userIds);

  return Array.from(identities.entries()).reduce((map, [userId, identity]) => {
    map.set(userId, identity.name);
    return map;
  }, new Map<string, string>());
}

export async function loadParticipantIdentities(supabase: SupabaseLikeClient, userIds: string[]) {
  if (!userIds.length) return new Map<string, ParticipantIdentity>();

  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  const identityResult = await supabase.rpc?.("get_chat_participant_identities", {
    requested_user_ids: uniqueUserIds,
  });

  if (!identityResult?.error && Array.isArray(identityResult?.data)) {
    return identityResult.data.reduce((map: Map<string, ParticipantIdentity>, row: unknown) => {
      const record = asRecord(row);

      if (!record) return map;

      const userId = readString(record.user_id);
      const name = readString(record.display_name);

      if (userId && name) {
        map.set(userId, {
          avatarUrl: readNullableString(record.avatar_url),
          bubbleThemeId: readNullableString(record.chat_bubble_theme),
          name,
        });
      }

      return map;
    }, new Map<string, ParticipantIdentity>());
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, display_name, full_name, email, avatar_url, chat_bubble_theme")
    .in("user_id", uniqueUserIds);

  if (error || !Array.isArray(data)) {
    return new Map<string, ParticipantIdentity>();
  }

  return data.reduce((map: Map<string, ParticipantIdentity>, row: unknown) => {
    const record = asRecord(row);

    if (!record) return map;

    const userId = readString(record.user_id);
    const displayName = readString(record.display_name) || readString(record.full_name);
    const email = readString(record.email);
    const fallbackName = email ? email.split("@")[0] : "";
    const name = displayName || fallbackName;

    if (userId && name) {
      map.set(userId, {
        avatarUrl: readNullableString(record.avatar_url),
        bubbleThemeId: readNullableString(record.chat_bubble_theme),
        name,
      });
    }

    return map;
  }, new Map<string, ParticipantIdentity>());
}

export async function loadAdminUserIds(supabase: SupabaseLikeClient) {
  const { data, error } = await supabase.from("user_roles").select("user_id, role").eq("role", "admin");

  if (error || !Array.isArray(data)) {
    return [];
  }

  return Array.from(
    new Set(
      data
        .map((row: unknown) => readString(asRecord(row)?.user_id))
        .filter((userId): userId is string => Boolean(userId)),
    ),
  );
}

export async function resolveSupportReceiverId(supabase: SupabaseLikeClient, currentUserId: string) {
  const adminUserIds = await loadAdminUserIds(supabase);

  return adminUserIds.find((userId) => userId !== currentUserId) ?? currentUserId;
}

export async function sendPublicChatMessage(
  supabase: SupabaseLikeClient,
  senderId: string,
  body: string,
) {
  const firstAttempt = await supabase
    .from("public_chat_messages")
    .insert({ message: body, user_id: senderId });

  if (!firstAttempt.error) return null;

  const fallbackAttempt = await supabase
    .from("public_chat_messages")
    .insert({ content: body, sender_id: senderId });

  return fallbackAttempt.error?.message ?? firstAttempt.error.message ?? "Erro ao enviar mensagem.";
}

export async function sendPrivateChatMessage(
  supabase: SupabaseLikeClient,
  senderId: string,
  receiverId: string,
  body: string,
) {
  const firstAttempt = await supabase
    .from("private_chat_messages")
    .insert({ message: body, receiver_id: receiverId, sender_id: senderId });

  if (!firstAttempt.error) return null;

  const fallbackAttempt = await supabase
    .from("private_chat_messages")
    .insert({ content: body, receiver_id: receiverId, sender_id: senderId });

  return fallbackAttempt.error?.message ?? firstAttempt.error.message ?? "Erro ao enviar mensagem.";
}
