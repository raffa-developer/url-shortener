const FAVICON_ENDPOINT = "https://icons.duckduckgo.com/ip3";
const DOMAIN_PATTERN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function normalizeDomain(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().toLowerCase().replace(/^www\./, "");
  return DOMAIN_PATTERN.test(trimmed) ? trimmed : null;
}

/** Favicons are served by DuckDuckGo's icon proxy; no API key required. */
export function faviconUrl(domainOrSource: string | null | undefined): string | null {
  const domain = normalizeDomain(domainOrSource);
  return domain ? `${FAVICON_ENDPOINT}/${domain}.ico` : null;
}

export function domainFromUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    return normalizeDomain(new URL(url).hostname);
  } catch {
    return null;
  }
}
