import type { Session } from "@supabase/supabase-js";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Crown, FileText, Hash, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCheckoutAvailability } from "@/lib/mercado-pago";
import { formatCurrency } from "@/lib/payments";
import { type DomainId, MAX_POSTER_QUANTITY, normalizePosterQuantity } from "@/lib/posters";
import { cn } from "@/lib/utils";

const PRESET_QUANTITIES = [60, 120, 250, 500];
const FEATURED_QUANTITY = 120;

type PurchaseQuantityDialogProps = {
  isSubmitting?: boolean;
  onConfirm: (quantity: number) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  promotion: {
    description?: string | null;
    id: DomainId;
    title: string;
  } | null;
  session: Session | null;
  unitAmount: number;
};

export default function PurchaseQuantityDialog({
  isSubmitting = false,
  onConfirm,
  onOpenChange,
  open,
  promotion,
  session,
  unitAmount,
}: PurchaseQuantityDialogProps) {
  const [quantityInput, setQuantityInput] = useState(String(FEATURED_QUANTITY));

  useEffect(() => {
    if (open) {
      setQuantityInput(String(FEATURED_QUANTITY));
    }
  }, [open, promotion?.title]);

  const selectedQuantity = useMemo(() => {
    return normalizePosterQuantity(quantityInput);
  }, [quantityInput]);
  const deferredQuantity = useDeferredValue(selectedQuantity);

  const totalAmount = useMemo(() => {
    return Number((unitAmount * selectedQuantity).toFixed(2));
  }, [selectedQuantity, unitAmount]);
  const shouldCheckAvailability = open && Boolean(promotion?.id) && Boolean(session);

  const helperDescription =
    promotion?.description?.trim() ||
    "Escolha quantos posters voce quer levar nesta compra. Cada poster libera 1 numero unico para o mesmo concurso.";

  const {
    data: availability,
    error: availabilityError,
    isFetching: isFetchingAvailability,
  } = useQuery({
    enabled: shouldCheckAvailability,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!promotion?.id || !session) {
        throw new Error("Sessao indisponivel para verificar a disponibilidade.");
      }

      return getCheckoutAvailability(session, {
        posterQuantity: deferredQuantity,
        promotionId: promotion.id,
      });
    },
    queryKey: ["checkout-availability", promotion?.id, deferredQuantity],
    staleTime: 10000,
  });

  const isCheckingAvailability =
    shouldCheckAvailability && (selectedQuantity !== deferredQuantity || isFetchingAvailability);
  const shouldBlockCheckout =
    Boolean(availability && !availability.canCheckout && !availabilityError && !isCheckingAvailability);
  const canAdvanceToCheckout = !isSubmitting && !isCheckingAvailability && !shouldBlockCheckout;
  const confirmButtonLabel = isSubmitting
    ? "Abrindo checkout..."
    : isCheckingAvailability
      ? "Verificando disponibilidade..."
      : availability?.soldOut
        ? "Numeros esgotados"
        : shouldBlockCheckout
          ? `Ajuste para ate ${availability?.maxQuantity ?? 0}`
          : "Avancar para o checkout";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-primary/15 bg-[#070912]/95 p-0 sm:max-w-3xl">
        <div className="relative overflow-hidden rounded-[1.75rem]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,198,68,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.12),transparent_32%)]" />

          <div className="relative border-b border-white/10 px-6 pb-5 pt-6">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="font-display text-3xl leading-tight">
                {promotion?.title ?? "Poster digital"}
              </DialogTitle>
              <DialogDescription className="max-w-2xl text-sm text-foreground/70">
                {helperDescription}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Poster</p>
                <p className="mt-2 text-base font-semibold">{promotion?.title ?? "Poster digital"}</p>
              </div>
              <div className="rounded-2xl border border-primary/15 bg-primary/10 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-primary/70">Valor unitario</p>
                <p className="mt-2 text-base font-semibold text-primary">{formatCurrency(unitAmount)}</p>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">Regra do sorteio</p>
                <p className="mt-2 text-base font-semibold text-emerald-100">1 poster = 1 numero</p>
              </div>
            </div>
          </div>

          <div className="relative space-y-5 px-6 py-6">
            <div className="grid gap-4 lg:grid-cols-2">
              {PRESET_QUANTITIES.map((quantity) => {
                const isSelected = selectedQuantity === quantity;
                const isFeatured = quantity === FEATURED_QUANTITY;
                const optionTotal = Number((unitAmount * quantity).toFixed(2));

                return (
                  <button
                    className={cn(
                      "relative overflow-hidden rounded-[1.75rem] border text-left transition-all",
                      isSelected
                        ? "border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(245,198,68,0.3)]"
                        : "border-white/10 bg-white/5 hover:border-primary/25 hover:bg-white/10",
                    )}
                    disabled={isSubmitting}
                    key={quantity}
                    onClick={() => setQuantityInput(String(quantity))}
                    type="button"
                  >
                    {isFeatured ? (
                      <div
                        className={cn(
                          "absolute left-1/2 top-0 -translate-x-1/2 rounded-b-2xl px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em]",
                          isSelected ? "gradient-gold text-primary-foreground" : "bg-primary/15 text-primary",
                        )}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Crown className="h-3.5 w-3.5" />
                          Mais pedido
                        </span>
                      </div>
                    ) : null}

                    <div className="px-5 pb-5 pt-8">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div
                            className={cn(
                              "mt-1 flex h-7 w-7 items-center justify-center rounded-full border",
                              isSelected ? "border-primary" : "border-white/35",
                            )}
                          >
                            <div
                              className={cn(
                                "h-3.5 w-3.5 rounded-full transition-all",
                                isSelected ? "bg-primary" : "bg-transparent",
                              )}
                            />
                          </div>

                          <div>
                            <p className="text-2xl font-display font-semibold">
                              {quantity} {quantity === 1 ? "poster" : "posters"}
                            </p>
                            <p className="mt-3 text-sm text-muted-foreground">
                              Cada poster sai por {formatCurrency(unitAmount)}
                            </p>
                          </div>
                        </div>

                        <p className="text-2xl font-display font-bold">{formatCurrency(optionTotal)}</p>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "border-t px-5 py-4 text-base font-semibold",
                        isSelected
                          ? "border-primary/20 bg-primary text-primary-foreground"
                          : "border-white/10 bg-white/10 text-foreground/85",
                      )}
                    >
                      Ganhe {quantity} numero(s) da sorte neste concurso
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground" htmlFor="custom-poster-quantity">
                    Quantidade personalizada
                  </Label>
                </div>

                <div className="w-full max-w-xs">
                  <Input
                    className="border-white/10 bg-white/5 text-base"
                    disabled={isSubmitting}
                    id="custom-poster-quantity"
                    inputMode="numeric"
                    max={String(MAX_POSTER_QUANTITY)}
                    min="1"
                    onChange={(event) => setQuantityInput(event.target.value)}
                    step="1"
                    type="number"
                    value={quantityInput}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-emerald-400/20 bg-emerald-500/10 p-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-black/15 px-3 py-1 text-xs uppercase tracking-[0.18em] text-emerald-100/80">
                    <FileText className="h-3.5 w-3.5" />
                    Resumo da compra
                  </div>
                  <p className="text-xl font-display font-semibold text-emerald-50">
                    {selectedQuantity} {selectedQuantity === 1 ? "poster" : "posters"} e {selectedQuantity} numero(s)
                    promocional(is)
                  </p>
                  <p className="flex items-center gap-2 text-sm text-emerald-100/80">
                    <Hash className="h-4 w-4" />
                    Os numeros sao liberados automaticamente apos a aprovacao do pagamento.
                  </p>
                  {isCheckingAvailability ? (
                    <p className="flex items-center gap-2 text-sm text-amber-100/90">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verificando disponibilidade...
                    </p>
                  ) : availability && !availability.canCheckout ? (
                    <p className="text-sm text-rose-100">{availability.message}</p>
                  ) : null}
                </div>

                <div className="text-left lg:text-right">
                  <p className="text-sm uppercase tracking-[0.18em] text-emerald-100/70">Total</p>
                  <p className="mt-2 text-4xl font-display font-bold text-emerald-200">
                    {formatCurrency(totalAmount)}
                  </p>
                </div>
              </div>

              <Button
                className="mt-5 h-14 w-full rounded-2xl text-lg"
                disabled={!canAdvanceToCheckout}
                onClick={() => onConfirm(selectedQuantity)}
                size="lg"
                variant="accent"
              >
                {isSubmitting || isCheckingAvailability ? <Loader2 className="animate-spin" /> : null}
                {confirmButtonLabel}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
