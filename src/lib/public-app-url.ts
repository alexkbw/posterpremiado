function normalizeOrigin(candidate?: string | null) {
  if (!candidate) {
    return null;
  }

  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

function getBrowserOrigin() {
  if (typeof window === "undefined") {
    return null;
  }

  return normalizeOrigin(window.location.origin);
}

function isLocalBrowserOrigin(origin: string | null) {
  if (!origin) {
    return false;
  }

  try {
    const parsedUrl = new URL(origin);

    return parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function getPublicAppOrigin() {
  const configuredOrigin = normalizeOrigin(import.meta.env.VITE_PUBLIC_APP_URL);
  const browserOrigin = getBrowserOrigin();

  if (browserOrigin && !isLocalBrowserOrigin(browserOrigin)) {
    return browserOrigin;
  }

  if (configuredOrigin) {
    return configuredOrigin;
  }

  return browserOrigin;
}

export function getPublicAppUrl(path = "/") {
  const origin = getPublicAppOrigin();

  if (!origin) {
    return path;
  }

  return new URL(path, `${origin}/`).toString();
}

export function hasSecurePublicAppOrigin() {
  const origin = getPublicAppOrigin();

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).protocol === "https:";
  } catch {
    return false;
  }
}
