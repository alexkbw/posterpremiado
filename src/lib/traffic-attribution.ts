export type TrafficAttributionSnapshot = {
  campaign: string | null;
  campaignId: string | null;
  capturedAt: string;
  content: string | null;
  landingPath: string | null;
  medium: string | null;
  referrerHost: string | null;
  source: string | null;
};

const STORAGE_KEY = "poster-premiado-traffic-attribution";
const MAX_ATTRIBUTION_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeValue(value: string | null | undefined, maxLength = 160) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizePath(value: string | null | undefined) {
  const normalized = normalizeValue(value, 320);

  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("/")) {
    return normalized;
  }

  try {
    return new URL(normalized).pathname.slice(0, 320);
  } catch {
    return null;
  }
}

function normalizeReferrerHost(value: string | null | undefined) {
  const normalized = normalizeValue(value, 255);

  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized).hostname.slice(0, 255);
  } catch {
    return normalized.includes("/") ? null : normalized;
  }
}

function hasAttribution(snapshot: TrafficAttributionSnapshot | null) {
  return Boolean(
    snapshot?.source ||
      snapshot?.medium ||
      snapshot?.campaign ||
      snapshot?.campaignId ||
      snapshot?.content,
  );
}

function isExpired(snapshot: TrafficAttributionSnapshot | null) {
  if (!snapshot?.capturedAt) {
    return true;
  }

  const capturedAt = new Date(snapshot.capturedAt).getTime();

  if (!Number.isFinite(capturedAt)) {
    return true;
  }

  return capturedAt < Date.now() - MAX_ATTRIBUTION_AGE_MS;
}

function readStoredSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as TrafficAttributionSnapshot | null;

    if (!hasAttribution(parsedValue) || isExpired(parsedValue)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return parsedValue;
  } catch {
    return null;
  }
}

function writeStoredSnapshot(snapshot: TrafficAttributionSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function extractSnapshot(url: URL, referrer: string | null | undefined) {
  const snapshot: TrafficAttributionSnapshot = {
    campaign: normalizeValue(url.searchParams.get("utm_campaign")),
    campaignId: normalizeValue(url.searchParams.get("utm_id")),
    capturedAt: new Date().toISOString(),
    content: normalizeValue(url.searchParams.get("utm_content")),
    landingPath: normalizePath(url.pathname),
    medium: normalizeValue(url.searchParams.get("utm_medium")),
    referrerHost: normalizeReferrerHost(referrer),
    source: normalizeValue(url.searchParams.get("utm_source")),
  };

  return hasAttribution(snapshot) ? snapshot : null;
}

export function captureTrafficAttribution() {
  if (typeof window === "undefined") {
    return null;
  }

  const snapshot = extractSnapshot(new URL(window.location.href), document.referrer);

  if (!snapshot) {
    return readStoredSnapshot();
  }

  writeStoredSnapshot(snapshot);
  return snapshot;
}

export function getStoredTrafficAttribution() {
  return readStoredSnapshot();
}

export function clearStoredTrafficAttribution() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}
