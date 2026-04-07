import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

async function syncProfilePreferences(user: User | null) {
  const avatarUrl =
    typeof user?.user_metadata?.avatar_url === "string" && user.user_metadata.avatar_url
      ? user.user_metadata.avatar_url
      : null;
  const bubbleThemeId =
    typeof user?.user_metadata?.chat_bubble_theme === "string" && user.user_metadata.chat_bubble_theme
      ? user.user_metadata.chat_bubble_theme
      : null;

  if (!user || (!avatarUrl && !bubbleThemeId)) {
    return;
  }

  const profileUpdate: {
    avatar_url?: string | null;
    chat_bubble_theme?: string | null;
  } = {};

  if (avatarUrl) {
    profileUpdate.avatar_url = avatarUrl;
  }

  if (bubbleThemeId) {
    profileUpdate.chat_bubble_theme = bubbleThemeId;
  }

  const { error } = await supabase.from("profiles").update(profileUpdate).eq("user_id", user.id);

  if (error) {
    console.error("Failed to sync chat preferences to profile", error);
  }
}

async function resolveValidSession(session: Session | null) {
  if (!session?.access_token) {
    return null;
  }

  const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
  let activeSession = session;

  if (expiresAt && expiresAt <= Date.now() + 60_000) {
    const { data, error } = await supabase.auth.refreshSession();

    if (error || !data.session) {
      await supabase.auth.signOut();
      return null;
    }

    activeSession = data.session;
  }

  const { data, error } = await supabase.auth.getUser(activeSession.access_token);

  if (!error && data.user) {
    return activeSession;
  }

  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

  if (!refreshError && refreshData.session) {
    const refreshedSession = refreshData.session;
    const { data: refreshedUserData, error: refreshedUserError } = await supabase.auth.getUser(
      refreshedSession.access_token,
    );

    if (!refreshedUserError && refreshedUserData.user) {
      return refreshedSession;
    }
  }

  await supabase.auth.signOut();
  return null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);

      if (nextSession?.user) {
        void syncProfilePreferences(nextSession.user);
      }
    });

    void supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      const validSession = await resolveValidSession(currentSession);

      setSession(validSession);
      setUser(validSession?.user ?? null);
      setLoading(false);

      if (validSession?.user) {
        void syncProfilePreferences(validSession.user);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, session, loading, signOut };
}
