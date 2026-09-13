import geoip from "geoip-lite";
import { isPrivateIp } from "../../lib/ip";

export type HeaderBag = Record<string, string | string[] | undefined>;

/**
 * CDN/proxy country headers, in priority order. We deliberately do not store
 * the raw IP address; the IP is used transiently for the GeoIP lookup and is
 * never persisted.
 */
const COUNTRY_HEADERS = [
  "cf-ipcountry", // Cloudflare
  "x-vercel-ip-country", // Vercel
  "x-geo-country",
  "x-country-code",
] as const;

const COUNTRY_CODE = /^[A-Z]{2}$/;

export const UNKNOWN_COUNTRY_CODES = new Set(["XX", "T1"]);

function normalizeCountryCode(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const code = value.trim().toUpperCase();
  if (UNKNOWN_COUNTRY_CODES.has(code) || !COUNTRY_CODE.test(code)) {
    return null;
  }
  return code;
}

export function resolveCountryFromHeaders(headers: HeaderBag): string | null {
  for (const header of COUNTRY_HEADERS) {
    const raw = headers[header];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const code = normalizeCountryCode(value);
    if (code) {
      return code;
    }
  }
  return null;
}

export function resolveCountryFromIp(ip: string | null | undefined): string | null {
  if (!ip) {
    return null;
  }
  const result = geoip.lookup(ip);
  return normalizeCountryCode(result?.country ?? null);
}

export interface CountryInput {
  headers: HeaderBag;
  ip?: string | null;
  /** Dev/demo fallback used only when the client IP is private (e.g. localhost). */
  fallbackCountry?: string | null;
}

/**
 * Resolution order:
 * 1. Trusted CDN/proxy header (most accurate, works behind Cloudflare/Vercel).
 * 2. Offline GeoIP database lookup for public IPs (geoip-lite).
 * 3. Optional fallback for private/loopback IPs, so local demos show data.
 */
export function resolveCountry(input: CountryInput): string | null {
  const fromHeader = resolveCountryFromHeaders(input.headers);
  if (fromHeader) {
    return fromHeader;
  }

  const ip = input.ip ?? null;
  if (!isPrivateIp(ip)) {
    return resolveCountryFromIp(ip);
  }

  return normalizeCountryCode(input.fallbackCountry) ?? null;
}
