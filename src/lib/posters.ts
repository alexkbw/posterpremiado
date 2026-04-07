export type PosterPromotion = {
  active?: boolean | null;
  contest_code?: string | null;
  created_at?: string | null;
  description?: string | null;
  end_date?: string | null;
  entry_amount?: number | null;
  file_type?: string | null;
  file_url?: string | null;
  id: string;
  image_url?: string | null;
  is_active?: boolean | null;
  number_package_size?: number | null;
  start_date?: string | null;
  title: string;
};

export type PromotionNumberRecord = {
  contest_code?: string | null;
  created_at?: string | null;
  id: string;
  payment_id: string;
  promotion_id: string;
  ticket_number: number;
  user_id: string;
};

export const DEFAULT_PROMOTION_PACKAGE_SIZE = 10;
export const MAX_PROMOTION_PACKAGE_SIZE = 9999;

export function normalizePackageSize(value?: number | null) {
  const normalized = Number(value ?? DEFAULT_PROMOTION_PACKAGE_SIZE);

  if (!Number.isInteger(normalized) || normalized < 1) {
    return DEFAULT_PROMOTION_PACKAGE_SIZE;
  }

  return Math.min(normalized, MAX_PROMOTION_PACKAGE_SIZE);
}

export function normalizeContestCode(value?: string | null, fallback?: string | null) {
  const normalized = value?.trim();

  if (normalized) {
    return normalized;
  }

  const normalizedFallback = fallback?.trim();
  return normalizedFallback || "";
}

export function getPromotionContestCode(promotion?: Pick<PosterPromotion, "contest_code" | "id"> | null) {
  return normalizeContestCode(promotion?.contest_code, promotion?.id);
}

export function getDrawContestCode(
  draw?: { contest_code?: string | null; id?: string | null; promotion_id?: string | null } | null,
) {
  return normalizeContestCode(draw?.contest_code, draw?.promotion_id ?? draw?.id ?? null);
}

export function getPaymentContestCode(
  payment?: { contest_code?: string | null; id?: string | null; promotion_id?: string | null } | null,
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
    return "0000";
  }

  return String(Math.trunc(normalized)).padStart(4, "0");
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
