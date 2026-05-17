export type DomainId = number;

export type PosterPromotion = {
  active?: boolean | null;
  contest_code?: string | null;
  created_at?: string | null;
  description?: string | null;
  end_date?: string | null;
  entry_amount?: number | null;
  file_type?: string | null;
  file_url?: string | null;
  id: DomainId;
  image_url?: string | null;
  is_active?: boolean | null;
  number_package_size?: number | null;
  prize_amount?: number | null;
  start_date?: string | null;
  title: string;
};

export type PosterPurchase = {
  amount?: number | null;
  contest_code?: string | null;
  id?: DomainId | null;
  poster_quantity?: number | null;
  promotion_id?: DomainId | null;
};

export type PromotionNumberRecord = {
  contest_code?: string | null;
  created_at?: string | null;
  id: DomainId;
  payment_id?: DomainId | null;
  promotion_id?: DomainId | null;
  ticket_number: number;
  user_id: string;
};

export const DEFAULT_PROMOTION_PACKAGE_SIZE = 10;
export const MAX_PROMOTION_PACKAGE_SIZE = 9999;
export const DEFAULT_POSTER_QUANTITY = 1;
export const MAX_POSTER_QUANTITY = 9999;
export const PROMOTION_TICKET_DIGITS = 6;

export function normalizePackageSize(value?: number | null) {
  const normalized = Number(value ?? DEFAULT_PROMOTION_PACKAGE_SIZE);

  if (!Number.isInteger(normalized) || normalized < 1) {
    return DEFAULT_PROMOTION_PACKAGE_SIZE;
  }

  return Math.min(normalized, MAX_PROMOTION_PACKAGE_SIZE);
}

export function normalizePosterQuantity(value?: number | string | null) {
  const normalized = Number(value ?? DEFAULT_POSTER_QUANTITY);

  if (!Number.isInteger(normalized) || normalized < 1) {
    return DEFAULT_POSTER_QUANTITY;
  }

  return Math.min(normalized, MAX_POSTER_QUANTITY);
}

export function normalizeContestCode(value?: string | null, fallback?: string | number | null) {
  const normalized = value?.trim();

  if (normalized) {
    return normalized;
  }

  const normalizedFallback = fallback === null || fallback === undefined ? "" : String(fallback).trim();
  return normalizedFallback || "";
}

export function getPromotionContestCode(promotion?: Pick<PosterPromotion, "contest_code" | "id"> | null) {
  return normalizeContestCode(promotion?.contest_code, promotion?.id);
}

export function getPromotionPrizeAmount(promotion?: Pick<PosterPromotion, "prize_amount"> | null) {
  const value = Number(promotion?.prize_amount ?? 0);
  return Number.isFinite(value) && value > 0 ? Number(value.toFixed(2)) : 0;
}

export function getDrawContestCode(
  draw?: { contest_code?: string | null; id?: DomainId | null; promotion_id?: DomainId | null } | null,
) {
  return normalizeContestCode(draw?.contest_code, draw?.promotion_id ?? draw?.id ?? null);
}

export function getDrawPromotionId(
  draw?: { promotion_id?: DomainId | null } | null,
) {
  return typeof draw?.promotion_id === "number" ? draw.promotion_id : null;
}

export function getPaymentContestCode(
  payment?: PosterPurchase | null,
  promotion?: Pick<PosterPromotion, "contest_code" | "id"> | null,
) {
  return normalizeContestCode(
    payment?.contest_code,
    getPromotionContestCode(promotion) || payment?.promotion_id || payment?.id || null,
  );
}

export function formatTicketNumber(value?: number | null) {
  const normalized = Number(value ?? 0);

  if (!Number.isFinite(normalized) || normalized < 0) {
    return "000000";
  }

  return String(Math.trunc(normalized)).padStart(PROMOTION_TICKET_DIGITS, "0");
}

function extractDriveFileId(fileUrl: string) {
  const filePathMatch = fileUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);

  if (filePathMatch?.[1]) {
    return filePathMatch[1];
  }

  try {
    const url = new URL(fileUrl);
    return url.searchParams.get("id");
  } catch {
    return null;
  }
}

export function buildPosterDownloadUrl(fileUrl?: string | null) {
  const normalized = fileUrl?.trim();

  if (!normalized) {
    return null;
  }

  const driveFileId = extractDriveFileId(normalized);

  if (!driveFileId) {
    return normalized;
  }

  return `https://drive.google.com/uc?export=download&id=${driveFileId}`;
}
