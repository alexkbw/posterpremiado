import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ImageIcon,
  Palette,
  Search,
  Send,
  Shield,
  Smile,
  Users,
} from "lucide-react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";

import Navbar from "@/components/Navbar";
import ParticipantAvatar from "@/components/ParticipantAvatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AVATAR_PRESETS, getAvatarPreset, getDefaultAvatarPreset } from "@/lib/avatar-presets";
import {
  buildParticipantIdentity,
  loadParticipantIdentities,
  mergeChatEntries,
  normalizePrivateChatMessage,
  normalizePublicChatMessage,
  resolveSupportReceiverId,
  sendPrivateChatMessage,
  sendPublicChatMessage,
  sortChatEntries,
  type ChatEntry,
  type ParticipantIdentity,
} from "@/lib/chat";
import { getDefaultSelfParticipantControls, loadSelfParticipantControls } from "@/lib/participant-controls";

type BubbleThemeId =
  | "amber"
  | "orange"
  | "rose"
  | "fuchsia"
  | "emerald"
  | "teal"
  | "sky"
  | "indigo"
  | "slate";

const DEFAULT_BUBBLE_THEME_ID: BubbleThemeId = "amber";

const BUBBLE_THEMES: Array<{
  id: BubbleThemeId;
  ariaLabel: string;
  messageClass: string;
  swatchClass: string;
}> = [
  {
    id: "amber",
    ariaLabel: "Ambar",
    messageClass: "bg-amber-400 text-slate-950",
    swatchClass: "bg-amber-400",
  },
  {
    id: "orange",
    ariaLabel: "Laranja",
    messageClass: "bg-orange-500 text-white",
    swatchClass: "bg-orange-500",
  },
  {
    id: "rose",
    ariaLabel: "Rose",
    messageClass: "bg-rose-500 text-white",
    swatchClass: "bg-rose-500",
  },
  {
    id: "fuchsia",
    ariaLabel: "Fucsia",
    messageClass: "bg-fuchsia-500 text-white",
    swatchClass: "bg-fuchsia-500",
  },
  {
    id: "emerald",
    ariaLabel: "Esmeralda",
    messageClass: "bg-emerald-500 text-white",
    swatchClass: "bg-emerald-500",
  },
  {
    id: "teal",
    ariaLabel: "Turquesa",
    messageClass: "bg-teal-500 text-white",
    swatchClass: "bg-teal-500",
  },
  {
    id: "sky",
    ariaLabel: "Azul claro",
    messageClass: "bg-sky-500 text-white",
    swatchClass: "bg-sky-500",
  },
  {
    id: "indigo",
    ariaLabel: "Indigo",
    messageClass: "bg-indigo-500 text-white",
    swatchClass: "bg-indigo-500",
  },
  {
    id: "slate",
    ariaLabel: "Grafite",
    messageClass: "bg-slate-700 text-white",
    swatchClass: "bg-slate-700",
  },
];

const QUICK_EMOJIS = ["😀", "😂", "😍", "😎", "🤔", "👏", "🔥", "🎉", "🙏", "❤️", "👍", "🚀"];

function isBubbleThemeId(value: string | null): value is BubbleThemeId {
  return BUBBLE_THEMES.some((theme) => theme.id === value);
}

function resolveBubbleThemeId(value: string | null | undefined) {
  return isBubbleThemeId(value ?? null) ? value : DEFAULT_BUBBLE_THEME_ID;
}

function getBubbleTheme(value: string | null | undefined) {
  return BUBBLE_THEMES.find((theme) => theme.id === resolveBubbleThemeId(value)) ?? BUBBLE_THEMES[0];
}

function getMessageBubbleClass(themeId: string | null | undefined, fallbackToNeutral = false) {
  if (fallbackToNeutral && !isBubbleThemeId(themeId ?? null)) {
    return "border border-border/60 bg-card text-foreground";
  }

  return `border border-transparent ${getBubbleTheme(themeId).messageClass}`;
}

function formatMessageTime(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : format(date, "HH:mm", { locale: ptBR });
}

function mergeIdentityMap(
  current: Map<string, ParticipantIdentity>,
  nextEntries: Map<string, ParticipantIdentity>,
) {
  const next = new Map(current);

  nextEntries.forEach((identity, userId) => {
    next.set(userId, identity);
  });

  return next;
}

function appendEmoji(currentValue: string, emoji: string) {
  if (!currentValue.trim()) return emoji;
  return `${currentValue}${emoji}`;
}

export default function Chat() {
  const { user, loading } = useAuth();
  const [publicMessages, setPublicMessages] = useState<ChatEntry[]>([]);
  const [privateMessages, setPrivateMessages] = useState<ChatEntry[]>([]);
  const [participantIdentities, setParticipantIdentities] = useState<Map<string, ParticipantIdentity>>(new Map());
  const [supportReceiverId, setSupportReceiverId] = useState<string | null>(null);
  const [publicLoading, setPublicLoading] = useState(true);
  const [privateLoading, setPrivateLoading] = useState(true);
  const [sendingPublic, setSendingPublic] = useState(false);
  const [sendingPrivate, setSendingPrivate] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [savingBubbleTheme, setSavingBubbleTheme] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [chatOptionsOpen, setChatOptionsOpen] = useState(false);
  const [mobileChatOptionsOpen, setMobileChatOptionsOpen] = useState(false);
  const [ownBubbleThemeId, setOwnBubbleThemeId] = useState<BubbleThemeId>(DEFAULT_BUBBLE_THEME_ID);
  const [publicSearch, setPublicSearch] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [privateMessage, setPrivateMessage] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reportingMessage, setReportingMessage] = useState<ChatEntry | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [participantControls, setParticipantControls] = useState(getDefaultSelfParticipantControls());
  const scrollRef = useRef<HTMLDivElement>(null);
  const privateScrollRef = useRef<HTMLDivElement>(null);

  const currentUserName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.display_name ||
    user?.email?.split("@")[0] ||
    "Voce";

  const currentUserMetadataBubbleTheme =
    typeof user?.user_metadata?.chat_bubble_theme === "string" ? user.user_metadata.chat_bubble_theme : null;

  useEffect(() => {
    if (!user) return;

    let isActive = true;

    void loadSelfParticipantControls(supabase)
      .then((controls) => {
        if (!isActive) return;

        setParticipantControls(controls);
      })
      .catch(() => {
        if (!isActive) return;

        setParticipantControls(getDefaultSelfParticipantControls());
      });

    void loadParticipantIdentities(supabase, [user.id]).then((identities) => {
      if (!isActive || identities.size === 0) return;

      setParticipantIdentities((current) => mergeIdentityMap(current, identities));
    });

    return () => {
      isActive = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    let isActive = true;

    async function syncIdentities(userIds: string[]) {
      const identities = await loadParticipantIdentities(supabase, userIds);

      if (!isActive || identities.size === 0) return;

      setParticipantIdentities((current) => mergeIdentityMap(current, identities));
    }

    async function loadPublicChat() {
      setPublicLoading(true);

      const { data, error } = await supabase.from("public_chat_messages").select("*").limit(100);

      if (!isActive) return;

      if (error) {
        setPublicLoading(false);
        toast.error("Nao foi possivel carregar o chat publico.");
        return;
      }

      const messages = sortChatEntries(
        (data ?? [])
          .map((row) => normalizePublicChatMessage(row))
          .filter((message): message is ChatEntry => Boolean(message)),
      ).slice(-100);

      setPublicMessages(messages);
      setPublicLoading(false);
      void syncIdentities(messages.map((message) => message.senderId));
    }

    async function loadPrivateChat() {
      setPrivateLoading(true);

      const { data, error } = await supabase
        .from("private_chat_messages")
        .select("*")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .limit(150);

      if (!isActive) return;

      if (error) {
        setPrivateLoading(false);
        toast.error("Nao foi possivel carregar a conversa privada.");
        return;
      }

      const messages = sortChatEntries(
        (data ?? [])
          .map((row) => normalizePrivateChatMessage(row))
          .filter((message): message is ChatEntry => Boolean(message)),
      ).slice(-150);

      setPrivateMessages(messages);
      setPrivateLoading(false);
      void syncIdentities(
        messages.flatMap((message) => [message.senderId, message.receiverId ?? ""]).filter(Boolean),
      );

      const unreadIds = messages
        .filter((message) => message.receiverId === user.id && message.senderId !== user.id && !message.read)
        .map((message) => message.id);

      if (unreadIds.length) {
        await supabase.from("private_chat_messages").update({ read: true }).in("id", unreadIds);
      }
    }

    void resolveSupportReceiverId(supabase, user.id).then((receiverId) => {
      if (isActive) {
        setSupportReceiverId(receiverId);
      }
    });

    void Promise.all([loadPublicChat(), loadPrivateChat()]);

    const publicChannel = supabase
      .channel(`public-chat:${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "public_chat_messages" }, (payload) => {
        const message = normalizePublicChatMessage(payload.new);

        if (!message || !isActive) return;

        setPublicMessages((current) => mergeChatEntries(current, [message]).slice(-100));
        void syncIdentities([message.senderId]);
      })
      .subscribe();

    const privateChannel = supabase
      .channel(`private-chat:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "private_chat_messages", filter: `sender_id=eq.${user.id}` },
        (payload) => {
          const message = normalizePrivateChatMessage(payload.new);

          if (!message || !isActive) return;

          setPrivateMessages((current) => mergeChatEntries(current, [message]).slice(-150));
          void syncIdentities([message.senderId, message.receiverId ?? ""]);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "private_chat_messages", filter: `receiver_id=eq.${user.id}` },
        async (payload) => {
          const message = normalizePrivateChatMessage(payload.new);

          if (!message || !isActive) return;

          setPrivateMessages((current) => mergeChatEntries(current, [message]).slice(-150));
          void syncIdentities([message.senderId, message.receiverId ?? ""]);

          if (!message.read) {
            await supabase.from("private_chat_messages").update({ read: true }).eq("id", message.id);
          }
        },
      )
      .subscribe();

    return () => {
      isActive = false;
      supabase.removeChannel(publicChannel);
      supabase.removeChannel(privateChannel);
    };
  }, [user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ behavior: "smooth", top: scrollRef.current.scrollHeight });
  }, [publicMessages, publicSearch]);

  useEffect(() => {
    privateScrollRef.current?.scrollTo({ behavior: "smooth", top: privateScrollRef.current.scrollHeight });
  }, [privateMessages]);

  const currentUserIdentity = useMemo(() => {
    const identity = participantIdentities.get(user?.id ?? "");

    return {
      avatarUrl: identity?.avatarUrl ?? null,
      bubbleThemeId: identity?.bubbleThemeId ?? currentUserMetadataBubbleTheme,
      name: identity?.name ?? currentUserName,
    };
  }, [currentUserMetadataBubbleTheme, currentUserName, participantIdentities, user?.id]);

  const knownParticipantIds = useMemo(() => {
    return Array.from(
      new Set(
        [
          user?.id ?? "",
          ...publicMessages.map((message) => message.senderId),
          ...privateMessages.flatMap((message) => [message.senderId, message.receiverId ?? ""]),
        ].filter(Boolean),
      ),
    );
  }, [privateMessages, publicMessages, user?.id]);

  useEffect(() => {
    if (!user) return;

    const nextThemeId = resolveBubbleThemeId(currentUserIdentity.bubbleThemeId);

    setOwnBubbleThemeId((current) => (current === nextThemeId ? current : nextThemeId));
  }, [currentUserIdentity.bubbleThemeId, user]);

  useEffect(() => {
    if (!user || !knownParticipantIds.length) return;

    let isActive = true;
    const intervalId = window.setInterval(() => {
      void loadParticipantIdentities(supabase, knownParticipantIds).then((identities) => {
        if (!isActive || identities.size === 0) return;

        setParticipantIdentities((current) => mergeIdentityMap(current, identities));
      });
    }, 20000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [knownParticipantIds, user]);

  const selectedAvatarId =
    getAvatarPreset(currentUserIdentity.avatarUrl)?.id ?? getDefaultAvatarPreset(user?.id ?? currentUserName).id;

  const filteredPublicMessages = useMemo(() => {
    const query = publicSearch.trim().toLowerCase();

    if (!query) return publicMessages;

    return publicMessages.filter((message) => {
      const senderName =
        message.senderId === user?.id
          ? currentUserIdentity.name.toLowerCase()
          : buildParticipantIdentity(message.senderId, participantIdentities).name.toLowerCase();

      return senderName.includes(query) || message.body.toLowerCase().includes(query);
    });
  }, [currentUserIdentity.name, participantIdentities, publicMessages, publicSearch, user?.id]);

  const ownBubbleTheme = getBubbleTheme(ownBubbleThemeId);

  function handleOpenAvatarPicker() {
    if (mobileChatOptionsOpen) {
      setMobileChatOptionsOpen(false);
      window.setTimeout(() => setAvatarPickerOpen(true), 180);
      return;
    }

    setAvatarPickerOpen(true);
  }

  function handleExpandChatOptions() {
    setChatOptionsOpen(true);
  }

  async function handleSendPublicMessage() {
    if (!user || !newMessage.trim() || sendingPublic) return;

    if (participantControls.publicChatBlocked) {
      toast.error(
        participantControls.blockReason ||
          "Seu acesso ao chat publico foi temporariamente bloqueado pela equipe.",
      );
      return;
    }

    setSendingPublic(true);
    const errorMessage = await sendPublicChatMessage(supabase, user.id, newMessage.trim());
    setSendingPublic(false);

    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }

    setNewMessage("");
  }

  async function handleSendPrivateMessage() {
    if (!user || !supportReceiverId || !privateMessage.trim() || sendingPrivate) return;

    setSendingPrivate(true);
    const errorMessage = await sendPrivateChatMessage(
      supabase,
      user.id,
      supportReceiverId,
      privateMessage.trim(),
    );
    setSendingPrivate(false);

    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }

    setPrivateMessage("");
  }

  async function handleAvatarSelect(avatarId: string) {
    if (!user || savingAvatar) return;

    setSavingAvatar(true);
    const { error: authError } = await supabase.auth.updateUser({
      data: {
        avatar_url: avatarId,
      },
    });

    if (authError) {
      setSavingAvatar(false);
      toast.error("Nao foi possivel atualizar seu avatar agora.");
      return;
    }

    const { error } = await supabase.from("profiles").update({ avatar_url: avatarId }).eq("user_id", user.id);
    setSavingAvatar(false);

    if (error) {
      toast.error("Nao foi possivel salvar seu avatar agora.");
      return;
    }

    setParticipantIdentities((current) => {
      const next = new Map(current);
      const previous = current.get(user.id);

      next.set(user.id, {
        avatarUrl: avatarId,
        bubbleThemeId: previous?.bubbleThemeId ?? ownBubbleThemeId,
        name: previous?.name ?? currentUserName,
      });

      return next;
    });

    setAvatarPickerOpen(false);
    toast.success("Avatar atualizado.");
  }

  async function handleBubbleThemeSelect(themeId: BubbleThemeId) {
    if (!user || savingBubbleTheme || ownBubbleThemeId === themeId) return;

    const previousThemeId = ownBubbleThemeId;
    setOwnBubbleThemeId(themeId);
    setSavingBubbleTheme(true);

    const { error: authError } = await supabase.auth.updateUser({
      data: {
        chat_bubble_theme: themeId,
      },
    });

    if (authError) {
      setSavingBubbleTheme(false);
      setOwnBubbleThemeId(previousThemeId);
      toast.error("Nao foi possivel atualizar a cor do balao agora.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ chat_bubble_theme: themeId })
      .eq("user_id", user.id);

    setSavingBubbleTheme(false);

    if (error) {
      setOwnBubbleThemeId(previousThemeId);
      toast.error("Nao foi possivel salvar a cor do balao agora.");
      return;
    }

    setParticipantIdentities((current) => {
      const next = new Map(current);
      const previous = current.get(user.id);

      next.set(user.id, {
        avatarUrl: previous?.avatarUrl ?? currentUserIdentity.avatarUrl,
        bubbleThemeId: themeId,
        name: previous?.name ?? currentUserName,
      });

      return next;
    });

    toast.success("Cor do balao atualizada.");
  }

  function handleEmojiInsert(target: "public" | "private", emoji: string) {
    if (target === "public") {
      setNewMessage((current) => appendEmoji(current, emoji));
      return;
    }

    setPrivateMessage((current) => appendEmoji(current, emoji));
  }

  async function handleSubmitReport() {
    if (!user || !reportingMessage || submittingReport) return;

    setSubmittingReport(true);
    const { error } = await supabase.from("chat_reports").insert({
      public_message_id: reportingMessage.id,
      report_reason: reportReason.trim() || null,
      reported_message_body: reportingMessage.body,
      reported_message_created_at: reportingMessage.createdAt,
      reported_user_id: reportingMessage.senderId,
      reporter_id: user.id,
    });
    setSubmittingReport(false);

    if (error) {
      const isDuplicate = error.message.toLowerCase().includes("duplicate");
      toast.error(isDuplicate ? "Essa mensagem ja foi denunciada por voce." : "Nao foi possivel registrar a denuncia.");
      return;
    }

    setReportReason("");
    setReportingMessage(null);
    toast.success("Denuncia enviada para a equipe.");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" />;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-6xl px-4 pb-10 pt-24">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-primary/70">Comunidade</p>
            <h1 className="mt-2 text-3xl font-display font-bold">Chat da comunidade</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Conversa publica com identidade visual por participante e um painel lateral mais limpo para os ajustes.
            </p>
          </div>

        </div>

        <Tabs className="space-y-4" defaultValue="public">
          <TabsList className="grid w-full max-w-sm grid-cols-2 rounded-2xl border border-border/60 bg-card p-1">
            <TabsTrigger className="rounded-xl" value="public">
              <Users className="mr-2 h-4 w-4" />
              Chat publico
            </TabsTrigger>
            <TabsTrigger className="rounded-xl" value="private">
              <Shield className="mr-2 h-4 w-4" />
              Suporte
            </TabsTrigger>
          </TabsList>

          <TabsContent className="mt-0" value="public">
            <section className="rounded-[32px] border border-border/60 bg-card/70 p-4 shadow-sm sm:p-5">
              <Dialog onOpenChange={setAvatarPickerOpen} open={avatarPickerOpen}>
                <DialogContent className="sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Escolha seu avatar</DialogTitle>
                  </DialogHeader>
                  <div className="pt-2">
                    <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      <ImageIcon className="h-4 w-4" />
                      Galeria de avatares
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      {AVATAR_PRESETS.map((preset) => {
                        const isSelected = selectedAvatarId === preset.id;

                        return (
                          <button
                            className={`rounded-2xl border p-3 text-left transition ${
                              isSelected
                                ? "border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary))]"
                                : "border-border/60 bg-background hover:border-primary/40"
                            }`}
                            disabled={savingAvatar}
                            key={preset.id}
                            onClick={() => void handleAvatarSelect(preset.id)}
                            type="button"
                          >
                            <div className="flex items-center justify-between">
                              <ParticipantAvatar
                                avatarValue={preset.id}
                                className="h-14 w-14"
                                name={preset.label}
                                seed={preset.id}
                              />
                              {isSelected ? <Check className="h-4 w-4 text-primary" /> : null}
                            </div>
                            <p className="mt-3 text-sm font-semibold">{preset.label}</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{preset.description}</p>
                            <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                              [{preset.tag}]
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Sheet onOpenChange={setMobileChatOptionsOpen} open={mobileChatOptionsOpen}>
                <SheetContent
                  className="w-[88vw] max-w-sm overflow-y-auto border-border/60 bg-background/95 p-0"
                  side="left"
                >
                  <div className="border-b border-border/60 p-4 pr-12">
                    <div className="flex items-center gap-3">
                      <ParticipantAvatar
                        avatarValue={currentUserIdentity.avatarUrl}
                        className="h-12 w-12"
                        name={currentUserIdentity.name}
                        seed={user.id}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {currentUserIdentity.name || "Participante"}
                        </p>
                        <button
                          className="mt-1 text-[11px] uppercase tracking-[0.18em] text-primary/80 transition hover:text-primary"
                          onClick={handleOpenAvatarPicker}
                          type="button"
                        >
                          Escolher avatar
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-4">
                    <div className="rounded-[24px] border border-border/60 bg-card/80 p-4">
                      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        <Search className="h-4 w-4" />
                        Pesquisa
                      </div>
                      <Input
                        className="mt-3 rounded-2xl border-border/60 bg-background"
                        onChange={(event) => setPublicSearch(event.target.value)}
                        placeholder="Buscar nome ou mensagem"
                        value={publicSearch}
                      />
                    </div>

                    <div className="rounded-[24px] border border-border/60 bg-card/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                          <Palette className="h-4 w-4" />
                          Cor do balao
                        </div>
                        <span className={`h-3 w-3 rounded-full ${ownBubbleTheme.swatchClass}`} />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-3">
                        {BUBBLE_THEMES.map((theme) => {
                          const isSelected = ownBubbleThemeId === theme.id;

                          return (
                            <button
                              aria-label={theme.ariaLabel}
                              className={`relative rounded-full p-1 transition ${
                                isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : "hover:scale-105"
                              }`}
                              disabled={savingBubbleTheme}
                              key={theme.id}
                              onClick={() => void handleBubbleThemeSelect(theme.id)}
                              title={theme.ariaLabel}
                              type="button"
                            >
                              <span className={`block h-8 w-8 rounded-full ${theme.swatchClass}`} />
                              {isSelected ? (
                                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background shadow-sm">
                                  <Check className="h-3.5 w-3.5 text-foreground" />
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              <div className="mb-4 lg:hidden">
                <button
                  className="flex w-full items-center justify-between gap-3 rounded-[24px] border border-border/60 bg-background/75 px-4 py-3 text-left shadow-sm"
                  onClick={() => setMobileChatOptionsOpen(true)}
                  type="button"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <ParticipantAvatar
                      avatarValue={currentUserIdentity.avatarUrl}
                      className="h-11 w-11"
                      name={currentUserIdentity.name}
                      seed={user.id}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {currentUserIdentity.name || "Participante"}
                      </p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        Abrir painel do chat
                      </p>
                    </div>
                  </div>
                  <span className={`h-3 w-3 shrink-0 rounded-full ${ownBubbleTheme.swatchClass}`} />
                </button>
              </div>

              <div
                className={`grid gap-4 transition-[grid-template-columns] duration-300 lg:items-start ${
                  chatOptionsOpen ? "lg:grid-cols-[320px_minmax(0,1fr)]" : "lg:grid-cols-[88px_minmax(0,1fr)]"
                }`}
              >
                <aside className="hidden overflow-hidden rounded-[28px] border border-border/60 bg-background/75 shadow-sm lg:block">
                  <div
                    className={`border-b border-border/60 p-4 ${
                      chatOptionsOpen ? "flex items-center justify-between gap-3" : "flex flex-col items-center gap-3"
                    }`}
                  >
                    <div
                      className={`flex items-center ${chatOptionsOpen ? "min-w-0 flex-1 gap-3" : "flex-col justify-center gap-3"}`}
                    >
                      <button
                        aria-label="Abrir painel do chat"
                        className="rounded-2xl transition hover:scale-[1.02]"
                        onClick={handleExpandChatOptions}
                        type="button"
                      >
                        <ParticipantAvatar
                          avatarValue={currentUserIdentity.avatarUrl}
                          className="h-12 w-12"
                          name={currentUserIdentity.name}
                          seed={user.id}
                        />
                      </button>
                      {chatOptionsOpen ? (
                        <button className="min-w-0 flex-1 text-left" onClick={handleOpenAvatarPicker} type="button">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {currentUserIdentity.name || "Participante"}
                          </p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-primary/80">
                            Escolher avatar
                          </p>
                        </button>
                      ) : (
                        <span className={`h-3 w-3 rounded-full ${ownBubbleTheme.swatchClass}`} />
                      )}
                    </div>

                    {chatOptionsOpen ? (
                      <Button
                        className="h-11 w-11 rounded-2xl border-border/60"
                        onClick={() => setChatOptionsOpen(false)}
                        type="button"
                        variant="outline"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>

                  {chatOptionsOpen ? (
                    <div className="space-y-4 p-4">
                      <div className="rounded-[24px] border border-border/60 bg-card/80 p-4">
                        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                          <Search className="h-4 w-4" />
                          Pesquisa
                        </div>
                        <Input
                          className="mt-3 rounded-2xl border-border/60 bg-background"
                          onChange={(event) => setPublicSearch(event.target.value)}
                          placeholder="Buscar nome ou mensagem"
                          value={publicSearch}
                        />
                      </div>

                      <div className="rounded-[24px] border border-border/60 bg-card/80 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            <Palette className="h-4 w-4" />
                            Cor do balao
                          </div>
                          <span className={`h-3 w-3 rounded-full ${ownBubbleTheme.swatchClass}`} />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-3">
                          {BUBBLE_THEMES.map((theme) => {
                            const isSelected = ownBubbleThemeId === theme.id;

                            return (
                              <button
                                aria-label={theme.ariaLabel}
                                className={`relative rounded-full p-1 transition ${
                                  isSelected
                                    ? "ring-2 ring-primary ring-offset-2 ring-offset-card"
                                    : "hover:scale-105"
                                }`}
                                disabled={savingBubbleTheme}
                                key={theme.id}
                                onClick={() => void handleBubbleThemeSelect(theme.id)}
                                title={theme.ariaLabel}
                                type="button"
                              >
                                <span className={`block h-8 w-8 rounded-full ${theme.swatchClass}`} />
                                {isSelected ? (
                                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background shadow-sm">
                                    <Check className="h-3.5 w-3.5 text-foreground" />
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </aside>

                <div className="overflow-hidden rounded-[28px] border border-border/60 bg-background/75 shadow-sm">
                  <div
                    className="max-h-[58vh] space-y-4 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_52%)] p-4 sm:p-5"
                    ref={scrollRef}
                  >
                    {publicLoading ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">Carregando mensagens...</p>
                    ) : filteredPublicMessages.length === 0 ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        Nenhuma mensagem encontrada no momento.
                      </p>
                    ) : (
                      filteredPublicMessages.map((message) => {
                        const isOwnMessage = message.senderId === user.id;
                        const identity = isOwnMessage
                          ? {
                              ...currentUserIdentity,
                              bubbleThemeId: ownBubbleThemeId,
                            }
                          : buildParticipantIdentity(message.senderId, participantIdentities);
                        const bubbleClass = getMessageBubbleClass(identity.bubbleThemeId, !isOwnMessage);

                        return (
                          <div
                            className={`group flex items-end gap-3 ${isOwnMessage ? "justify-end" : "justify-start"}`}
                            key={message.id}
                          >
                            {!isOwnMessage ? (
                              <ParticipantAvatar
                                avatarValue={identity.avatarUrl}
                                className="h-10 w-10"
                                name={identity.name}
                                seed={message.senderId}
                              />
                            ) : null}

                            <div className={`relative flex max-w-[82%] flex-col ${isOwnMessage ? "items-end" : "items-start"}`}>
                              {!isOwnMessage ? (
                                <TooltipProvider delayDuration={120}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        className="absolute -right-2 -top-2 z-10 rounded-full border border-amber-400/60 bg-background/95 p-1.5 text-amber-500 shadow-sm transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                                        onClick={() => {
                                          setReportingMessage(message);
                                          setReportReason("");
                                        }}
                                        type="button"
                                      >
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>Denunciar mensagem</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : null}

                              <div className={`rounded-[22px] px-4 py-3 text-sm leading-6 shadow-sm ${bubbleClass}`}>
                                <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-medium opacity-80">
                                  <span>{isOwnMessage ? "Voce" : identity.name}</span>
                                  <span>{formatMessageTime(message.createdAt)}</span>
                                </div>
                                <p className="whitespace-pre-wrap">{message.body}</p>
                              </div>
                            </div>

                            {isOwnMessage ? (
                              <ParticipantAvatar
                                avatarValue={identity.avatarUrl}
                                className="h-10 w-10"
                                name={identity.name}
                                seed={message.senderId}
                              />
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="border-t border-border/60 bg-card/55 p-4 sm:p-5">
                    {participantControls.publicChatBlocked ? (
                      <div className="mb-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        Seu acesso ao chat publico esta bloqueado no momento.
                        {participantControls.blockReason ? ` Motivo informado pela equipe: ${participantControls.blockReason}` : ""}
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <div className="flex flex-1 gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              className="h-12 w-12 rounded-2xl border-border/60"
                              disabled={participantControls.publicChatBlocked}
                              type="button"
                              variant="outline"
                            >
                              <Smile className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-64 rounded-2xl p-3">
                            <div className="grid grid-cols-6 gap-2">
                              {QUICK_EMOJIS.map((emoji) => (
                                <button
                                  className="flex h-10 items-center justify-center text-xl transition hover:scale-110"
                                  key={emoji}
                                  onClick={() => handleEmojiInsert("public", emoji)}
                                  type="button"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <Input
                          className="h-12 rounded-2xl border-border/60 bg-background"
                          disabled={participantControls.publicChatBlocked}
                          onChange={(event) => setNewMessage(event.target.value)}
                          onKeyDown={(event) => event.key === "Enter" && void handleSendPublicMessage()}
                          placeholder={
                            participantControls.publicChatBlocked
                              ? "Seu envio no chat publico esta bloqueado"
                              : "Escreva sua mensagem para o grupo"
                          }
                          value={newMessage}
                        />
                      </div>
                      <Button
                        className="h-12 rounded-2xl px-5"
                        disabled={!newMessage.trim() || sendingPublic || participantControls.publicChatBlocked}
                        onClick={() => void handleSendPublicMessage()}
                        variant="hero"
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Enviar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent className="mt-0" value="private">
            <section className="rounded-[28px] border border-border/60 bg-card/70 p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Suporte privado</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Canal reservado entre voce e a equipe organizadora.
                  </p>
                </div>

                <div className="rounded-full border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                  Leitura privada e atualizacao em tempo real
                </div>
              </div>

              <div
                className="mt-4 max-h-[55vh] space-y-4 overflow-y-auto rounded-[24px] border border-border/60 bg-background/65 p-4"
                ref={privateScrollRef}
              >
                {privateLoading ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">Carregando conversa...</p>
                ) : privateMessages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Envie uma mensagem para abrir o atendimento privado.
                  </p>
                ) : (
                  privateMessages.map((message) => {
                    const isOwnMessage = message.senderId === user.id;
                    const identity = isOwnMessage
                      ? {
                          ...currentUserIdentity,
                          bubbleThemeId: ownBubbleThemeId,
                        }
                      : buildParticipantIdentity(message.senderId, participantIdentities);
                    const bubbleClass = getMessageBubbleClass(identity.bubbleThemeId, !isOwnMessage);

                    return (
                      <div
                        className={`flex items-end gap-3 ${isOwnMessage ? "justify-end" : "justify-start"}`}
                        key={message.id}
                      >
                        {!isOwnMessage ? (
                          <ParticipantAvatar
                            avatarValue={identity.avatarUrl}
                            className="h-10 w-10"
                            name={identity.name}
                            seed={message.senderId}
                          />
                        ) : null}

                        <div className={`flex max-w-[78%] flex-col ${isOwnMessage ? "items-end" : "items-start"}`}>
                          <div className={`rounded-[22px] px-4 py-3 text-sm leading-6 shadow-sm ${bubbleClass}`}>
                            <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-medium opacity-80">
                              <span>{isOwnMessage ? "Voce" : identity.name}</span>
                              <span>{formatMessageTime(message.createdAt)}</span>
                            </div>
                            <p className="whitespace-pre-wrap">{message.body}</p>
                          </div>
                        </div>

                        {isOwnMessage ? (
                          <ParticipantAvatar
                            avatarValue={identity.avatarUrl}
                            className="h-10 w-10"
                            name={identity.name}
                            seed={message.senderId}
                          />
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <div className="flex flex-1 gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button className="h-12 w-12 rounded-2xl border-border/60" type="button" variant="outline">
                        <Smile className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64 rounded-2xl p-3">
                      <div className="grid grid-cols-6 gap-2">
                        {QUICK_EMOJIS.map((emoji) => (
                          <button
                            className="flex h-10 items-center justify-center text-xl transition hover:scale-110"
                            key={emoji}
                            onClick={() => handleEmojiInsert("private", emoji)}
                            type="button"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Input
                    className="h-12 rounded-2xl border-border/60 bg-card"
                    onChange={(event) => setPrivateMessage(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && void handleSendPrivateMessage()}
                    placeholder="Digite sua mensagem para a equipe"
                    value={privateMessage}
                  />
                </div>
                <Button
                  className="h-12 rounded-2xl px-5"
                  disabled={!privateMessage.trim() || sendingPrivate || !supportReceiverId}
                  onClick={() => void handleSendPrivateMessage()}
                  variant="hero"
                >
                  <Send className="mr-2 h-4 w-4" />
                  Enviar
                </Button>
              </div>
            </section>
          </TabsContent>
        </Tabs>

        <Dialog
          onOpenChange={(open) => {
            if (!open) {
              setReportingMessage(null);
              setReportReason("");
            }
          }}
          open={Boolean(reportingMessage)}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Denunciar participante</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="rounded-2xl border border-amber-400/40 bg-amber-50/10 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-500">Mensagem denunciada</p>
                <p className="mt-2 text-sm text-foreground">{reportingMessage?.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  O denunciante nao aparece para a equipe no card da conversa.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Observacao adicional</p>
                <Textarea
                  onChange={(event) => setReportReason(event.target.value)}
                  placeholder="Explique rapidamente o motivo da denuncia, se quiser."
                  rows={4}
                  value={reportReason}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => {
                    setReportingMessage(null);
                    setReportReason("");
                  }}
                  type="button"
                  variant="outline"
                >
                  Cancelar
                </Button>
                <Button
                  disabled={!reportingMessage || submittingReport}
                  onClick={() => void handleSubmitReport()}
                  type="button"
                  variant="hero"
                >
                  Enviar denuncia
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
