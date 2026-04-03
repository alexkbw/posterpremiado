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

    void supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setLoading(false);

      if (currentSession?.user) {
        void syncProfilePreferences(currentSession.user);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, session, loading, signOut };
}
