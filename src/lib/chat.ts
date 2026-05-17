type RawRecord = Record<string, unknown>;

type SupabaseLikeClient = {
  from: (table: string) => any;
  rpc?: (fn: string, args?: Record<string, unknown>) => Promise<{ data?: unknown; error?: unknown }>;
};

export type ChatEntry = {
  body: string;
  createdAt: string;
  hiddenAt: string | null;
  hiddenBy: string | null;
  id: string;
  isHidden: boolean;
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

function readRecordId(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
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

function shouldRetryLegacyChatInsert(error: { message?: string | null } | null | undefined) {
  const message = String(error?.message ?? "").toLowerCase();

  return (
    message.includes("could not find the 'message' column") ||
    message.includes("could not find the 'user_id' column") ||
    message.includes("could not find the 'content' column") ||
    message.includes("could not find the 'sender_id' column") ||
    message.includes("null value in column \"sender_id\"") ||
    message.includes("null value in column \"content\"") ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

function buildFallbackParticipantLabel(_userId: string) {
  return "Participante";
}

export function normalizePrivateChatMessage(raw: unknown): ChatEntry | null {
  const row = asRecord(raw);

  if (!row) return null;

  const id = readRecordId(row.id);
  const senderId = readString(row.sender_id);
  const receiverId = readNullableString(row.receiver_id);
  const body = readString(row.message) || readString(row.content);

  if (!id || !senderId || !body) return null;

  return {
    body,
    createdAt: readTimestamp(row),
    hiddenAt: null,
    hiddenBy: null,
    id,
    isHidden: false,
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

export async function loadAdminRoleUserIds(supabase: SupabaseLikeClient, userIds: string[]) {
  if (!userIds.length || !supabase.rpc) {
    return new Set<string>();
  }

  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  const results = await Promise.all(
    uniqueUserIds.map(async (userId) => {
      const { data, error } = await supabase.rpc?.("has_role", {
        _role: "admin",
        _user_id: userId,
      });

      if (error || data !== true) {
        return null;
      }

      return userId;
    }),
  );

  return new Set(results.filter((userId): userId is string => Boolean(userId)));
}

export async function resolveSupportReceiverId(supabase: SupabaseLikeClient, currentUserId: string) {
  const supportAdminResult = await supabase.rpc?.("get_support_admin_user_id");
  const supportAdminId = typeof supportAdminResult?.data === "string" ? supportAdminResult.data : null;

  if (supportAdminId && supportAdminId !== currentUserId) {
    return supportAdminId;
  }

  const adminUserIds = await loadAdminUserIds(supabase);

  return adminUserIds.find((userId) => userId !== currentUserId) ?? null;
}

export async function sendPrivateChatMessage(
  supabase: SupabaseLikeClient,
  senderId: string,
  receiverId: string,
  body: string,
) {
  const firstAttempt = await supabase
    .from("private_chat_messages")
    .insert({ content: body, message: body, receiver_id: receiverId, sender_id: senderId });

  if (!firstAttempt.error) return null;
  if (!shouldRetryLegacyChatInsert(firstAttempt.error)) {
    return firstAttempt.error.message ?? "Erro ao enviar mensagem.";
  }

  const messageOnlyAttempt = await supabase
    .from("private_chat_messages")
    .insert({ message: body, receiver_id: receiverId, sender_id: senderId });

  if (!messageOnlyAttempt.error) return null;
  if (!shouldRetryLegacyChatInsert(messageOnlyAttempt.error)) {
    return messageOnlyAttempt.error.message ?? firstAttempt.error.message ?? "Erro ao enviar mensagem.";
  }

  const contentOnlyAttempt = await supabase
    .from("private_chat_messages")
    .insert({ content: body, receiver_id: receiverId, sender_id: senderId });

  return contentOnlyAttempt.error?.message ?? messageOnlyAttempt.error.message ?? firstAttempt.error.message ?? "Erro ao enviar mensagem.";
}
