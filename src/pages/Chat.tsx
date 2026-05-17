import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, Loader2, MessageCircle, Send, ShieldCheck } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";

import Navbar from "@/components/Navbar";
import ParticipantAvatar from "@/components/ParticipantAvatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  buildParticipantIdentity,
  loadParticipantIdentities,
  mergeChatEntries,
  normalizePrivateChatMessage,
  resolveSupportReceiverId,
  sendPrivateChatMessage,
  sortChatEntries,
  type ChatEntry,
  type ParticipantIdentity,
} from "@/lib/chat";

function formatMessageTime(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : format(date, "dd/MM HH:mm", { locale: ptBR });
}

function isSupportConversationMessage(
  message: Pick<ChatEntry, "receiverId" | "senderId">,
  currentUserId: string,
  supportUserId: string,
) {
  return (
    (message.senderId === currentUserId && message.receiverId === supportUserId) ||
    (message.senderId === supportUserId && message.receiverId === currentUserId)
  );
}

export default function Chat() {
  const { user, loading } = useAuth();
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [participantIdentities, setParticipantIdentities] = useState<Map<string, ParticipantIdentity>>(new Map());
  const [supportReceiverId, setSupportReceiverId] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [supportUnavailable, setSupportUnavailable] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const currentUserId = user?.id ?? null;
  const supportIdentity = useMemo(() => {
    return supportReceiverId ? buildParticipantIdentity(supportReceiverId, participantIdentities) : null;
  }, [participantIdentities, supportReceiverId]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    let isActive = true;

    async function loadSupportReceiver() {
      setLoadingMessages(true);
      setSupportUnavailable(false);

      try {
        const receiverId = await resolveSupportReceiverId(supabase, currentUserId);

        if (!isActive) {
          return;
        }

        if (!receiverId) {
          setSupportReceiverId(null);
          setSupportUnavailable(true);
          setLoadingMessages(false);
          return;
        }

        setSupportReceiverId(receiverId);
        const identities = await loadParticipantIdentities(supabase, [currentUserId, receiverId]);

        if (isActive) {
          setParticipantIdentities((current) => mergeIdentityMap(current, identities));
        }
      } catch (error) {
        console.error("Failed to resolve support receiver", error);
        if (isActive) {
          setSupportUnavailable(true);
          setLoadingMessages(false);
          toast.error("Nao foi possivel abrir o suporte agora.");
        }
      }
    }

    void loadSupportReceiver();

    return () => {
      isActive = false;
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId || !supportReceiverId) {
      return;
    }

    let isActive = true;

    async function loadMessages() {
      setLoadingMessages(true);

      const { data, error } = await supabase
        .from("private_chat_messages")
        .select("*")
        .or(
          `and(sender_id.eq.${currentUserId},receiver_id.eq.${supportReceiverId}),and(sender_id.eq.${supportReceiverId},receiver_id.eq.${currentUserId})`,
        )
        .order("created_at", { ascending: true })
        .limit(500);

      if (!isActive) {
        return;
      }

      if (error) {
        toast.error("Nao foi possivel carregar o suporte.");
        setLoadingMessages(false);
        return;
      }

      const normalized = sortChatEntries(
        (data ?? [])
          .map((row) => normalizePrivateChatMessage(row))
          .filter((message): message is ChatEntry => Boolean(message)),
      );

      setMessages(normalized);
      setLoadingMessages(false);

      const unreadIds = normalized
        .filter((message) => message.receiverId === currentUserId && !message.read)
        .map((message) => message.id);

      if (unreadIds.length) {
        await supabase.from("private_chat_messages").update({ read: true }).in("id", unreadIds);
      }
    }

    void loadMessages();

    const channel = supabase
      .channel(`support-chat:${currentUserId}:${supportReceiverId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "private_chat_messages" }, (payload) => {
        const message = normalizePrivateChatMessage(payload.new);

        if (!message || !isSupportConversationMessage(message, currentUserId, supportReceiverId)) {
          return;
        }

        setMessages((current) => mergeChatEntries(current, [message]));

        if (message.receiverId === currentUserId) {
          void supabase.from("private_chat_messages").update({ read: true }).eq("id", message.id);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "private_chat_messages" }, (payload) => {
        const message = normalizePrivateChatMessage(payload.new);

        if (!message || !isSupportConversationMessage(message, currentUserId, supportReceiverId)) {
          return;
        }

        setMessages((current) => mergeChatEntries(current, [message]));
      })
      .subscribe();

    return () => {
      isActive = false;
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, supportReceiverId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function handleSendMessage() {
    if (!currentUserId || !supportReceiverId || sending) {
      return;
    }

    const body = newMessage.trim();

    if (!body) {
      return;
    }

    if (supportReceiverId === currentUserId) {
      toast.error("O usuario de suporte ainda nao foi configurado.");
      return;
    }

    setSending(true);
    const errorMessage = await sendPrivateChatMessage(supabase, currentUserId, supportReceiverId, body);
    setSending(false);

    if (errorMessage) {
      toast.error("Nao foi possivel enviar a mensagem ao suporte.");
      return;
    }

    setNewMessage("");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-28">
          <div className="glass-card mx-auto max-w-3xl p-8 text-center text-muted-foreground">
            Carregando suporte...
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return <Navigate replace to="/auth" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 pb-10 pt-24">
        <div className="mx-auto flex max-w-4xl flex-col gap-5">
          <Link className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-primary" to="/dashboard">
            <ChevronLeft className="h-4 w-4" />
            Voltar ao painel
          </Link>

          <section className="glass-card overflow-hidden rounded-[2rem]">
            <header className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                  <MessageCircle className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-display font-semibold">Suporte</h1>
                  <p className="text-sm text-muted-foreground">
                    Atendimento privado entre voce e a equipe Poster Premiado.
                  </p>
                </div>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
                <ShieldCheck className="h-4 w-4" />
                Canal privado
              </div>
            </header>

            <div className="grid min-h-[620px] grid-rows-[auto_minmax(0,1fr)_auto]">
              <div className="border-b border-white/10 px-5 py-4">
                <div className="flex items-center gap-3">
                  <ParticipantAvatar
                    avatarValue={supportIdentity?.avatarUrl ?? null}
                    name={supportIdentity?.name ?? "Suporte"}
                  />
                  <div>
                    <p className="font-semibold">{supportIdentity?.name ?? "Equipe de suporte"}</p>
                    <p className="text-sm text-muted-foreground">Envie sua duvida ou solicite ajuda sobre cadastro, compra e sorteio.</p>
                  </div>
                </div>
              </div>

              <div className="overflow-y-auto px-4 py-5" ref={listRef}>
                {loadingMessages ? (
                  <div className="flex h-full min-h-[320px] items-center justify-center text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Carregando conversa...
                  </div>
                ) : supportUnavailable ? (
                  <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">
                    <ShieldCheck className="mb-3 h-10 w-10 text-primary" />
                    <p className="text-lg font-semibold">Suporte indisponivel</p>
                    <p className="mt-2 max-w-md text-sm text-muted-foreground">
                      Nenhum usuario de suporte foi localizado para receber mensagens no momento.
                    </p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">
                    <MessageCircle className="mb-3 h-10 w-10 text-primary" />
                    <p className="text-lg font-semibold">Nenhuma mensagem ainda</p>
                    <p className="mt-2 max-w-md text-sm text-muted-foreground">
                      Escreva sua primeira mensagem para iniciar o atendimento com a equipe.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => {
                      const isMine = message.senderId === currentUserId;

                      return (
                        <div className={`flex ${isMine ? "justify-end" : "justify-start"}`} key={message.id}>
                          <div
                            className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                              isMine
                                ? "rounded-br-sm bg-primary text-primary-foreground"
                                : "rounded-bl-sm border border-white/10 bg-card text-foreground"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{message.body}</p>
                            <p className={`mt-2 text-[11px] ${isMine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                              {formatMessageTime(message.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-white/10 p-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Textarea
                    className="min-h-[72px] flex-1 resize-none"
                    disabled={sending || !supportReceiverId || supportUnavailable}
                    onChange={(event) => setNewMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleSendMessage();
                      }
                    }}
                    placeholder="Escreva para o suporte..."
                    value={newMessage}
                  />
                  <Button
                    className="sm:self-end"
                    disabled={sending || !newMessage.trim() || !supportReceiverId || supportUnavailable}
                    onClick={() => void handleSendMessage()}
                    size="lg"
                    type="button"
                    variant="hero"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Enviar
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
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
