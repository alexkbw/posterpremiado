import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const PRESENCE_HEARTBEAT_MS = 45_000;

function buildPresencePayload(userId: string, pathname: string, search: string) {
  return {
    page: `${pathname}${search}`,
    updatedAt: new Date().toISOString(),
    userId,
  };
}

export default function ParticipantPresenceTracker() {
  const { user } = useAuth();
  const location = useLocation();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const heartbeatIdRef = useRef<number | null>(null);
  const isSubscribedRef = useRef(false);
  const pathnameRef = useRef(location.pathname);
  const searchRef = useRef(location.search);

  const clearHeartbeat = () => {
    if (heartbeatIdRef.current !== null) {
      window.clearInterval(heartbeatIdRef.current);
      heartbeatIdRef.current = null;
    }
  };

  const trackPresence = async (channel: ReturnType<typeof supabase.channel>, userId: string) => {
    await channel.track(buildPresencePayload(userId, pathnameRef.current, searchRef.current));
  };

  useEffect(() => {
    pathnameRef.current = location.pathname;
    searchRef.current = location.search;
  }, [location.pathname, location.search]);

  useEffect(() => {
    const previousChannel = channelRef.current;

    isSubscribedRef.current = false;
    clearHeartbeat();

    if (previousChannel) {
      channelRef.current = null;
      void supabase.removeChannel(previousChannel);
    }

    if (!user?.id) {
      return;
    }

    let isActive = true;
    const channel = supabase.channel("participants-presence", {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channelRef.current = channel;

    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED" || !isActive) {
        return;
      }

      isSubscribedRef.current = true;

      try {
        await trackPresence(channel, user.id);
        clearHeartbeat();
        heartbeatIdRef.current = window.setInterval(() => {
          void trackPresence(channel, user.id).catch((error) => {
            console.error("Failed to keep participant presence alive", error);
          });
        }, PRESENCE_HEARTBEAT_MS);
      } catch (error) {
        console.error("Failed to publish participant presence", error);
      }
    });

    return () => {
      isActive = false;
      isSubscribedRef.current = false;
      clearHeartbeat();

      if (channelRef.current === channel) {
        channelRef.current = null;
      }

      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    const channel = channelRef.current;

    if (!channel || !user?.id || !isSubscribedRef.current) {
      return;
    }

    void trackPresence(channel, user.id).catch((error) => {
      console.error("Failed to refresh participant presence", error);
    });
  }, [location.pathname, location.search, user?.id]);

  return null;
}
