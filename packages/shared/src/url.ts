const HTTP_SCHEME = /^https?:\/\//i;

/**
 * Normalizes a user-supplied destination URL.
 *
 * - Trims surrounding whitespace.
 * - Prepends `https://` when no scheme is present (`example.com` -> `https://example.com`).
 * - Rejects schemes other than http/https.
 *
 * Throws `RangeError` for anything that cannot be turned into a valid http(s) URL.
 */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new RangeError("URL must not be empty");
  }

  let candidate: string;
  if (HTTP_SCHEME.test(trimmed)) {
    candidate = trimmed;
  } else if (trimmed.includes("://")) {
    throw new RangeError("Only http and https URLs are supported");
  } else {
    candidate = `https://${trimmed}`;
  }

  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RangeError("Only http and https URLs are supported");
  }
  return url.toString();
}

export function isValidHttpUrl(raw: string): boolean {
  try {
    normalizeUrl(raw);
    return true;
  } catch {
    return false;
  }
}
