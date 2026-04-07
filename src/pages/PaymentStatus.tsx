import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleX, Clock3, CreditCard, Download, Hash, RefreshCw } from "lucide-react";
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
import { buildPosterDownloadUrl, formatTicketNumber, getPaymentContestCode } from "@/lib/posters";

type AppDraw = {
  contest_code?: string | null;
  draw_date?: string | null;
  id: string;
  promotion_id?: string | null;
  sequence_number?: number | null;
  status?: string;
};

type AppPayment = {
  amount: number;
  contest_code?: string | null;
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
  contest_code?: string | null;
  entry_amount?: number | null;
  file_type?: string | null;
  file_url?: string | null;
  id: string;
  number_package_size?: number | null;
  title: string;
};

type PromotionNumberRecord = {
  created_at?: string | null;
  id: string;
  payment_id: string;
  promotion_id: string;
  ticket_number: number;
  user_id: string;
};

const PAYMENT_STATUS_CONTENT = {
  failed: {
    description: "A cobranca nao foi concluida. Voce pode voltar ao painel e tentar a compra do poster novamente.",
    icon: CircleX,
    title: "Pagamento nao concluido",
  },
  paid: {
    description:
      "Seu pagamento foi aprovado. O poster e os numeros promocionais ja podem ser consultados abaixo.",
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

function getCampaignSequenceLabel(draw?: AppDraw | null) {
  if (!draw?.sequence_number) {
    return "Rodada promocional";
  }

  return `${draw.sequence_number}a rodada promocional`;
}

function getTable(table: string) {
  return (supabase as unknown as { from: (tableName: string) => any }).from(table);
}

function isSchemaDriftError(error: { details?: string; hint?: string; message?: string } | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();

  return (
    message.includes("column") ||
    message.includes("relation") ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("could not find")
  );
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
    enabled: Boolean(payment),
    queryFn: async () => {
      const contestCode = getPaymentContestCode(payment, promotion);

      if (!contestCode) {
        return null as AppDraw | null;
      }

      const { data, error } = await supabase
        .from("draws")
        .select("*")
        .eq("contest_code", contestCode)
        .in("status", ["pending", "scheduled"])
        .order("draw_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return (data ?? null) as AppDraw | null;
    },
    queryKey: ["payment-upcoming-draw", payment?.contest_code, payment?.promotion_id, promotion?.contest_code],
  });

  const { data: promotionNumbers = [] } = useQuery({
    enabled: Boolean(payment?.id),
    queryFn: async () => {
      const { data, error } = await getTable("promotion_numbers")
        .select("*")
        .eq("payment_id", payment!.id)
        .order("ticket_number", { ascending: true });

      if (error) {
        if (isSchemaDriftError(error)) {
          return [] as PromotionNumberRecord[];
        }

        throw error;
      }

      return (data ?? []) as PromotionNumberRecord[];
    },
    queryKey: ["payment-promotion-numbers", payment?.id],
  });

  const normalizedStatus = payment ? normalizePaymentStatus(payment.status) : fallbackStatus;
  const statusMeta = getPaymentStatusMeta(payment?.status ?? fallbackStatus);
  const statusContent = PAYMENT_STATUS_CONTENT[normalizedStatus];
  const StatusIcon = statusContent.icon;
  const mercadoPagoPaymentId =
    payment?.transaction_id ??
    searchParams.get("payment_id") ??
    searchParams.get("collection_id");
  const downloadUrl =
    normalizedStatus === "paid" && promotion?.file_url ? buildPosterDownloadUrl(promotion.file_url) : null;

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
                  <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Poster</p>
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
                {downloadUrl ? (
                  <Button asChild size="lg" variant="hero-outline">
                    <a href={downloadUrl} rel="noreferrer" target="_blank">
                      <Download className="h-4 w-4" />
                      Baixar PDF
                    </a>
                  </Button>
                ) : null}
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

          <section className="grid gap-4 lg:grid-cols-3">
            <div className="glass-card rounded-[1.75rem] p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-primary">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Detalhes da cobranca</h2>
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
                  <span className="text-muted-foreground">Poster</span>
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
                  <h2 className="text-lg font-semibold">Conteudo liberado</h2>
                  <p className="text-sm text-muted-foreground">
                    Download do poster e pacote promocional.
                  </p>
                </div>
                {isLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                ) : null}
              </div>

              <div className="space-y-4 text-sm text-foreground/80">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="font-medium">Poster em PDF</p>
                  <p className="mt-2 text-muted-foreground">
                    {downloadUrl
                      ? "O arquivo ja esta disponivel para download."
                      : "O download aparece assim que o pagamento for aprovado."}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-2 flex items-center gap-2 text-primary">
                    <Hash className="h-4 w-4" />
                    <span className="font-medium">Numeros promocionais</span>
                  </div>
                  {promotionNumbers.length ? (
                    <div className="flex flex-wrap gap-2">
                      {promotionNumbers.map((promotionNumber) => (
                        <Badge className="border-primary/25 bg-primary/10 text-primary" key={promotionNumber.id}>
                          #{formatTicketNumber(promotionNumber.ticket_number)}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      {normalizedStatus === "paid"
                        ? "Os numeros ainda estao sincronizando pelo webhook."
                        : "Os numeros sao liberados somente depois da aprovacao."}
                    </p>
                  )}
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
              </div>
            </div>

            <div className="glass-card rounded-[1.75rem] p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Proxima rodada</h2>
                  <p className="text-sm text-muted-foreground">
                    Resultado baseado na Loteria Federal.
                  </p>
                </div>
                {isLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                ) : null}
              </div>

              <div className="space-y-4 text-sm text-foreground/80">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="font-medium">Agenda do concurso</p>
                  <p className="mt-2 text-muted-foreground">
                    {upcomingDraw
                      ? `${getCampaignSequenceLabel(upcomingDraw)} em ${formatDrawDateLabel(upcomingDraw.draw_date ?? null)}.`
                      : "A equipe ainda nao abriu o sorteio deste concurso."}
                  </p>
                </div>

                <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4 text-primary/90">
                  O numero vencedor e formado pelos 4 ultimos digitos do 1o premio da Loteria Federal.
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
