import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleX, Clock3, CreditCard, RefreshCw, Ticket, Trophy } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  formatCurrency,
  formatDrawDateLabel,
  formatPaymentMoment,
  getPaymentStatusFromMercadoPago,
  getPaymentStatusMeta,
  normalizePaymentStatus,
} from "@/lib/payments";

type AppDraw = {
  draw_date?: string | null;
  id: string;
  promotion_id?: string | null;
  sequence_number?: number | null;
  status?: string;
};

type AppPayment = {
  amount: number;
  created_at?: string | null;
  draw_id?: string | null;
  id: string;
  payment_date?: string | null;
  payment_method?: string | null;
  promotion_id?: string | null;
  status: string;
  transaction_id?: string | null;
  week_reference?: string | null;
};

type Promotion = {
  entry_amount?: number | null;
  id: string;
  title: string;
};

const PAYMENT_STATUS_CONTENT = {
  failed: {
    description: "A cobranca nao foi concluida. Voce pode voltar ao painel e tentar a compra da promocao novamente.",
    icon: CircleX,
    title: "Pagamento nao concluido",
  },
  paid: {
    description:
      "Seu pagamento foi aprovado e sua entrada ja esta garantida na fila da promocao escolhida.",
    icon: CheckCircle2,
    title: "Pagamento aprovado",
  },
  pending: {
    description: "O Mercado Pago ainda esta processando sua cobranca. Atualize o status em instantes.",
    icon: Clock3,
    title: "Pagamento em analise",
  },
} as const;

function getFallbackStatus(searchParams: URLSearchParams) {
  const result = searchParams.get("result");
  const statusFromMercadoPago =
    getPaymentStatusFromMercadoPago(searchParams.get("status")) ??
    getPaymentStatusFromMercadoPago(searchParams.get("collection_status"));

  if (statusFromMercadoPago) {
    return statusFromMercadoPago;
  }

  if (result === "failure") {
    return "failed";
  }

  if (result === "success") {
    return "paid";
  }

  return "pending";
}

function renderPaymentMethodLabel(payment?: AppPayment | null) {
  if (!payment?.payment_method) {
    return "Mercado Pago";
  }

  return payment.payment_method.replaceAll("_", " ");
}

function getSequenceLabel(draw?: AppDraw | null) {
  if (!draw?.sequence_number) {
    return "Sorteio da promocao";
  }

  return `${draw.sequence_number}º sorteio da promocao`;
}

export default function PaymentStatus() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const paymentRecordId = searchParams.get("external_reference");
  const fallbackStatus = getFallbackStatus(searchParams);

  const {
    data: payment,
    error,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    enabled: Boolean(paymentRecordId && user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("id", paymentRecordId!)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return (data ?? null) as AppPayment | null;
    },
    queryKey: ["payment-status", user?.id, paymentRecordId],
  });

  const { data: promotion } = useQuery({
    enabled: Boolean(payment?.promotion_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promotions")
        .select("*")
        .eq("id", payment!.promotion_id!)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return (data ?? null) as Promotion | null;
    },
    queryKey: ["payment-promotion", payment?.promotion_id],
  });

  const { data: upcomingDraw } = useQuery({
    enabled: Boolean(payment?.promotion_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("draws")
        .select("*")
        .eq("promotion_id", payment!.promotion_id!)
        .in("status", ["pending", "scheduled"])
        .order("draw_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return (data ?? null) as AppDraw | null;
    },
    queryKey: ["payment-upcoming-draw", payment?.promotion_id],
  });

  const normalizedStatus = payment ? normalizePaymentStatus(payment.status) : fallbackStatus;
  const statusMeta = getPaymentStatusMeta(payment?.status ?? fallbackStatus);
  const statusContent = PAYMENT_STATUS_CONTENT[normalizedStatus];
  const StatusIcon = statusContent.icon;
  const mercadoPagoPaymentId =
    payment?.transaction_id ??
    searchParams.get("payment_id") ??
    searchParams.get("collection_id");

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pb-12 pt-24">
        <div className="mx-auto max-w-3xl space-y-6">
          <section className="glass-card relative overflow-hidden rounded-[2rem] border border-primary/15 p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,198,68,0.12),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(34,197,94,0.1),transparent_38%)]" />
            <div className="relative space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-primary/25 bg-primary/10 p-3 text-primary">
                    <StatusIcon className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-primary/70">Checkout Pro</p>
                    <h1 className="text-3xl font-bold">{statusContent.title}</h1>
                  </div>
                </div>
                <Badge className={statusMeta.toneClassName}>{statusMeta.label}</Badge>
              </div>

              <p className="max-w-2xl text-base text-foreground/80">{statusContent.description}</p>

              <div className="grid gap-4 rounded-3xl border border-white/10 bg-black/20 p-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Promocao</p>
                  <p className="mt-2 text-lg font-semibold">{promotion?.title ?? "Compra em processamento"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Cobranca</p>
                  <p className="mt-2 text-lg font-semibold">
                    {payment
                      ? formatCurrency(Number(payment.amount ?? 0))
                      : formatCurrency(Number(promotion?.entry_amount ?? 10))}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" variant="hero">
                  <Link to="/dashboard">Voltar ao painel</Link>
                </Button>
                {paymentRecordId && user ? (
                  <Button
                    className="border-white/15"
                    disabled={isFetching}
                    onClick={() => void refetch()}
                    size="lg"
                    variant="glass"
                  >
                    <RefreshCw className={isFetching ? "animate-spin" : ""} />
                    Atualizar status
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="glass-card rounded-[1.75rem] p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-primary">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Detalhes</h2>
                  <p className="text-sm text-muted-foreground">Leitura do retorno e do registro interno.</p>
                </div>
              </div>

              <div className="space-y-3 text-sm text-foreground/80">
                <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-3">
                  <span className="text-muted-foreground">ID Mercado Pago</span>
                  <span className="text-right font-medium">{mercadoPagoPaymentId ?? "Aguardando"}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-3">
                  <span className="text-muted-foreground">Referencia interna</span>
                  <span className="text-right font-medium">{paymentRecordId ?? "Nao informada"}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-3">
                  <span className="text-muted-foreground">Promocao</span>
                  <span className="text-right font-medium">{promotion?.title ?? "Aguardando vinculacao"}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-3">
                  <span className="text-muted-foreground">Metodo</span>
                  <span className="text-right font-medium capitalize">{renderPaymentMethodLabel(payment)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Atualizado em</span>
                  <span className="text-right font-medium">
                    {payment ? formatPaymentMoment(payment.payment_date ?? payment.created_at) : "Aguardando sincronizacao"}
                  </span>
                </div>
              </div>
            </div>

            <div className="glass-card rounded-[1.75rem] p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Fila da promocao</h2>
                  <p className="text-sm text-muted-foreground">
                    O sorteio sera criado e executado manualmente pela equipe no backoffice.
                  </p>
                </div>
                {isLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                ) : null}
              </div>

              <div className="space-y-4 text-sm text-foreground/80">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-2 flex items-center gap-2 text-primary">
                    <Ticket className="h-4 w-4" />
                    <span className="font-medium">Entrada da promocao</span>
                  </div>
                  <p>
                    {payment
                      ? "Seu pagamento ja foi registrado e agora aguarda o sorteio correspondente dessa promocao."
                      : "Se voce acabou de pagar, o webhook ainda pode levar alguns instantes para atualizar este painel."}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-2 flex items-center gap-2 text-accent">
                    <Trophy className="h-4 w-4" />
                    <span className="font-medium">Proxima execucao</span>
                  </div>
                  <p>
                    {upcomingDraw
                      ? `${getSequenceLabel(upcomingDraw)} em ${formatDrawDateLabel(upcomingDraw.draw_date ?? null)}.`
                      : "A equipe ainda nao abriu um sorteio para esta promocao."}
                  </p>
                </div>

                {error ? (
                  <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-rose-100">
                    Nao foi possivel consultar o registro do pagamento agora.
                  </div>
                ) : null}

                {!user ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    Entre com sua conta para consultar os detalhes completos do pagamento neste painel.
                  </div>
                ) : null}

                <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4 text-primary/90">
                  Em ambiente local, o Mercado Pago nao aceita retorno automatico para URLs HTTP. Quando o app estiver em uma URL
                  HTTPS, o fluxo volta direto para esta tela.
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
